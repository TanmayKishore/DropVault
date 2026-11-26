import { prisma } from '../config/database.js';
import { config } from '../config/env.js';
import { getStorageProviderForType } from '../storage/storage.factory.js';
import { IStorageProvider } from '../storage/storage.interface.js';
import { FileStatus, StorageProvider } from '@prisma/client';
import { activeUploadRegistry } from '../services/active-upload.registry.js';

export interface CleanupStats {
  expiredProcessed: number;
  expiredSucceeded: number;
  expiredFailed: number;
  stalePendingProcessed: number;
  stalePendingSucceeded: number;
  stalePendingFailed: number;
  failedDeletionsProcessed: number;
  failedDeletionsSucceeded: number;
  failedDeletionsFailed: number;
}

export class CleanupWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunningCycle = false;
  private isStopped = false;
  private intervalMs: number;
  private staleThresholdHours: number;
  private customStorageProvider?: IStorageProvider;

  constructor(options?: {
    intervalMs?: number;
    staleThresholdHours?: number;
    storageProvider?: IStorageProvider;
  }) {
    this.intervalMs = options?.intervalMs ?? config.CLEANUP_INTERVAL_MS;
    this.staleThresholdHours = options?.staleThresholdHours ?? config.STALE_PENDING_THRESHOLD_HOURS;
    this.customStorageProvider = options?.storageProvider;
  }

  /**
   * Resolves storage provider for a given file record using shared factory logic.
   */
  private getProviderForFile(file: { storageProvider: StorageProvider }): IStorageProvider {
    if (this.customStorageProvider) {
      return this.customStorageProvider;
    }
    return getStorageProviderForType(file.storageProvider);
  }

  /**
   * Executes a single, idempotent cleanup cycle.
   *
   * Concurrency note (single-process locking assumption):
   * `isRunningCycle` prevents overlapping cycles within a single Node.js worker process.
   * In a multi-instance production deployment, external scheduling (single-leader worker)
   * or distributed/DB row locking would be required to prevent cross-process overlap.
   */
  public async runCycle(): Promise<CleanupStats> {
    if (this.isRunningCycle) {
      console.log('[CleanupWorker] Previous cleanup cycle is still running. Skipping iteration.');
      return {
        expiredProcessed: 0,
        expiredSucceeded: 0,
        expiredFailed: 0,
        stalePendingProcessed: 0,
        stalePendingSucceeded: 0,
        stalePendingFailed: 0,
        failedDeletionsProcessed: 0,
        failedDeletionsSucceeded: 0,
        failedDeletionsFailed: 0,
      };
    }

    this.isRunningCycle = true;
    const now = new Date();
    const stats: CleanupStats = {
      expiredProcessed: 0,
      expiredSucceeded: 0,
      expiredFailed: 0,
      stalePendingProcessed: 0,
      stalePendingSucceeded: 0,
      stalePendingFailed: 0,
      failedDeletionsProcessed: 0,
      failedDeletionsSucceeded: 0,
      failedDeletionsFailed: 0,
    };

    try {
      // -------------------------------------------------------------------
      // 1. Clean Expired Files (status: AVAILABLE and expiresAt < now)
      // -------------------------------------------------------------------
      const expiredFiles = await prisma.file.findMany({
        where: {
          status: FileStatus.AVAILABLE,
          expiresAt: { lt: now },
        },
        select: {
          id: true,
          storageKey: true,
          storageProvider: true,
        },
        take: 100, // Batch limit per cycle to maintain low resource footprint
      });

      stats.expiredProcessed = expiredFiles.length;

      for (const file of expiredFiles) {
        if (this.isStopped) break;

        const provider = this.getProviderForFile(file);
        try {
          // Check if object exists before deletion to handle missing objects safely
          const exists = await provider.exists(file.storageKey);
          if (exists) {
            await provider.deleteObject(file.storageKey);
          }

          // Update database status to EXPIRED after physical deletion succeeds or if missing
          await prisma.file.update({
            where: { id: file.id },
            data: { status: FileStatus.EXPIRED },
          });

          stats.expiredSucceeded++;
          console.log(`[CleanupWorker] Successfully expired file ${file.id}`);
        } catch (err: any) {
          stats.expiredFailed++;
          // Preserve database record as AVAILABLE so subsequent cycles retry deletion
          console.error(`[CleanupWorker] Failed to clean expired file ${file.id}: ${err.message}`);
        }
      }

      // -------------------------------------------------------------------
      // 2. Clean Stale Pending Uploads
      // Protection for active uploads:
      // A. In-process active tracker: Never touch files currently actively uploading in this process
      // B. Dynamic lease / heartbeat: If an upload is older than 2 hours, it is ONLY stale if
      //    it has NOT sent a heartbeat / update within the last 15 minutes (updatedAt < now - 15m).
      //    A legitimate 5-hour upload emitting regular data updates its updatedAt heartbeat,
      //    keeping its lease active.
      // -------------------------------------------------------------------
      const staleThreshold = new Date(now.getTime() - this.staleThresholdHours * 60 * 60 * 1000);
      const leaseThreshold = new Date(now.getTime() - 15 * 60 * 1000); // 15-minute lease grace period

      const candidatePendingFiles = await prisma.file.findMany({
        where: {
          status: FileStatus.PENDING,
          createdAt: { lt: staleThreshold },
          updatedAt: { lt: leaseThreshold }, // Heartbeat must be expired
        },
        select: {
          id: true,
          storageKey: true,
          storageProvider: true,
        },
        take: 100,
      });

      // Filter out any file currently active in our in-memory registry
      const stalePendingFiles = candidatePendingFiles.filter(
        (file) => !activeUploadRegistry.isActive(file.id)
      );

      stats.stalePendingProcessed = stalePendingFiles.length;

      for (const file of stalePendingFiles) {
        if (this.isStopped) break;

        const provider = this.getProviderForFile(file);
        try {
          const exists = await provider.exists(file.storageKey);
          if (exists) {
            await provider.deleteObject(file.storageKey);
          }

          // Update database status to FAILED
          await prisma.file.update({
            where: { id: file.id },
            data: { status: FileStatus.FAILED },
          });

          stats.stalePendingSucceeded++;
          console.log(`[CleanupWorker] Successfully purged stale pending file ${file.id}`);
        } catch (err: any) {
          stats.stalePendingFailed++;
          // Preserve record for retry in future cycle
          console.error(`[CleanupWorker] Failed to purge stale pending file ${file.id}: ${err.message}`);
        }
      }

      // -------------------------------------------------------------------
      // 3. Retry Failed File Deletions (status: FAILED and storageKey exists)
      // -------------------------------------------------------------------
      const failedFiles = await prisma.file.findMany({
        where: {
          status: FileStatus.FAILED,
          storageKey: { not: '' },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          storageKey: true,
          storageProvider: true,
        },
        take: 100,
      });

      stats.failedDeletionsProcessed = failedFiles.length;

      for (const file of failedFiles) {
        if (this.isStopped) break;

        const provider = this.getProviderForFile(file);
        try {
          const exists = await provider.exists(file.storageKey);
          if (exists) {
            await provider.deleteObject(file.storageKey);
          }

          // Mark as DELETED once physical deletion succeeds or is verified nonexistent
          await prisma.file.update({
            where: { id: file.id },
            data: { status: FileStatus.DELETED },
          });

          stats.failedDeletionsSucceeded++;
          console.log(`[CleanupWorker] Successfully resolved and deleted failed file ${file.id}`);
        } catch (err: any) {
          stats.failedDeletionsFailed++;
          console.error(`[CleanupWorker] Retry failed for file ${file.id}: ${err.message}`);
        }
      }

    } catch (globalErr: any) {
      console.error(`[CleanupWorker] Error during cleanup cycle: ${globalErr.message}`);
    } finally {
      this.isRunningCycle = false;
    }

    return stats;
  }

  /**
   * Starts periodic timer.
   */
  public start(): void {
    if (this.timer) {
      console.log('[CleanupWorker] Worker is already running.');
      return;
    }
    this.isStopped = false;
    console.log(`[CleanupWorker] Starting automated cleanup worker (interval: ${this.intervalMs}ms, stale threshold: ${this.staleThresholdHours}h)`);

    // Immediate run on startup followed by intervals
    void this.runCycle();

    this.timer = setInterval(() => {
      void this.runCycle();
    }, this.intervalMs);

    // Unref timer so it does not block process exit during tests
    this.timer.unref();
  }

  /**
   * Stops periodic timer and cancels active execution.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isStopped = true;
    console.log('[CleanupWorker] Automated cleanup worker stopped.');
  }
}

// Global worker singleton instance for application lifecycle
let cleanupWorkerInstance: CleanupWorker | null = null;

export const getCleanupWorker = (): CleanupWorker => {
  if (!cleanupWorkerInstance) {
    cleanupWorkerInstance = new CleanupWorker();
  }
  return cleanupWorkerInstance;
};
