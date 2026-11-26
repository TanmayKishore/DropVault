import crypto from 'crypto';
import path from 'path';
import { PassThrough, Readable } from 'stream';
import { prisma } from '../config/database.js';
import { config } from '../config/env.js';
import { getStorageProvider, getStorageProviderForType } from '../storage/storage.factory.js';
import { IStorageProvider } from '../storage/storage.interface.js';
import { ByteLimitTransform } from '../utils/stream-limiter.js';
import { MimeSniffer } from '../utils/mime-sniffer.js';
import { AppError } from '../middleware/error.middleware.js';
import { FileStatus, StorageProvider } from '@prisma/client';
import { activeUploadRegistry } from './active-upload.registry.js';

export interface FileUploadParams {
  stream: Readable;
  originalName: string;
  clientMimeType?: string;
  userId?: string;
  expiryDays?: number;
}

export interface FileUploadResult {
  file: {
    id: string;
    originalName: string;
    sizeBytes: string;
    mimeType: string;
    expiresAt: Date;
    createdAt: Date;
  };
  managementToken?: string; // Only returned for anonymous uploads
  shareLink: {
    shortCode: string;
  };
}

export class FileService {
  /**
   * Generates a unique collision-resistant short code.
   */
  private static async generateUniqueShortCode(): Promise<string> {
    for (let attempts = 0; attempts < 5; attempts++) {
      const code = crypto.randomBytes(4).toString('base64url').slice(0, 7);
      const existing = await prisma.shareLink.findUnique({ where: { shortCode: code } });
      if (!existing) return code;
    }
    return crypto.randomUUID().slice(0, 8);
  }

  /**
   * Generates an unguessable storage key partitioned by year/month/uuid.
   */
  private static generateStorageKey(originalName: string): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = path.extname(originalName).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    const randomId = crypto.randomUUID();
    return `uploads/${yyyy}/${mm}/${randomId}${ext ? ext : ''}`;
  }

  /**
   * Handles streaming file upload with:
   * 1. Pre-flight PENDING record in DB
   * 2. Stream piping without in-memory buffering or long-lived DB transactions
   * 3. Byte limit enforcement & Mime sniffing
   * 4. Activation transaction to mark file AVAILABLE
   * 5. Immediate cleanup on failure or limit violation
   */
  static async uploadFile(params: FileUploadParams): Promise<FileUploadResult> {
    const { stream, originalName, clientMimeType, userId, expiryDays = 7 } = params;

    const maxBytes = userId
      ? config.MAX_AUTHENTICATED_FILE_SIZE_BYTES
      : config.MAX_ANONYMOUS_FILE_SIZE_BYTES;

    const storageKey = this.generateStorageKey(originalName);
    const storageProvider = getStorageProvider();
    const currentProviderType = config.STORAGE_PROVIDER === 's3' ? StorageProvider.S3 : StorageProvider.LOCAL;

    // Calculate expiry (min 1 hour, max 30 days)
    const validExpiryDays = Math.min(Math.max(expiryDays, 1), 30);
    const expiresAt = new Date(Date.now() + validExpiryDays * 24 * 60 * 60 * 1000);

    // 1. Fast pre-flight write: Create PENDING file record
    const pendingFile = await prisma.file.create({
      data: {
        userId: userId || null,
        originalName: path.basename(originalName).slice(0, 255),
        storageKey,
        mimeType: clientMimeType || 'application/octet-stream',
        sizeBytes: BigInt(0),
        status: FileStatus.PENDING,
        storageProvider: currentProviderType,
        expiresAt,
      },
    });

    const limiter = new ByteLimitTransform(maxBytes);
    const passThrough = new PassThrough();

    let sniffBuffer = Buffer.alloc(0);
    let sniffingDone = false;

    // Tap stream to collect up to 4100 bytes for magic byte sniffing
    const snifferTap = new PassThrough();
    snifferTap.on('data', (chunk: Buffer) => {
      if (!sniffingDone) {
        sniffBuffer = Buffer.concat([sniffBuffer, chunk]);
        if (sniffBuffer.length >= 4100) {
          sniffingDone = true;
        }
      }
    });

    // Pipe stream through limiter and into storage
    stream.pipe(limiter).pipe(snifferTap).pipe(passThrough);

    // Register file in active upload tracker and start periodic heartbeat
    activeUploadRegistry.register(pendingFile.id);

    // Heartbeat updates updatedAt every 30 seconds while data is still streaming
    const heartbeatTimer = setInterval(() => {
      prisma.file
        .update({
          where: { id: pendingFile.id, status: FileStatus.PENDING },
          data: { updatedAt: new Date() },
        })
        .catch(() => {
          // Ignore transient heartbeat errors
        });
    }, 30000);
    heartbeatTimer.unref();

    try {
      // 2. Stream upload to storage
      const uploadResult = await storageProvider.uploadStream(passThrough, {
        storageKey,
        mimeType: clientMimeType || 'application/octet-stream',
      });

      // 3. Inspect sniffed magic bytes
      const sniffResult = await MimeSniffer.sniff(sniffBuffer);
      const finalMime = sniffResult.detectedMime !== 'application/octet-stream'
        ? sniffResult.detectedMime
        : (clientMimeType || 'application/octet-stream');

      // 4. Quick activation transaction
      const isAnonymous = !userId;
      let rawManagementToken: string | undefined;
      const shortCode = await this.generateUniqueShortCode();

      const finalFile = await prisma.$transaction(async (tx) => {
        // Update file to AVAILABLE
        const updated = await tx.file.update({
          where: { id: pendingFile.id },
          data: {
            status: FileStatus.AVAILABLE,
            sizeBytes: BigInt(uploadResult.bytesWritten),
            mimeType: finalMime,
          },
        });

        // Create default share link
        await tx.shareLink.create({
          data: {
            fileId: updated.id,
            shortCode,
            expiresAt,
          },
        });

        // For anonymous uploads, generate and store a 256-bit management token
        if (isAnonymous) {
          rawManagementToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(rawManagementToken).digest('hex');

          await tx.fileManagementToken.create({
            data: {
              fileId: updated.id,
              tokenHash,
              expiresAt,
            },
          });
        }

        return updated;
      });

      // Clear heartbeat and active registry on success
      clearInterval(heartbeatTimer);
      activeUploadRegistry.unregister(pendingFile.id);

      return {
        file: {
          id: finalFile.id,
          originalName: finalFile.originalName,
          sizeBytes: finalFile.sizeBytes.toString(),
          mimeType: finalFile.mimeType,
          expiresAt: finalFile.expiresAt,
          createdAt: finalFile.createdAt,
        },
        managementToken: rawManagementToken,
        shareLink: {
          shortCode,
        },
      };
    } catch (uploadError) {
      // Clear heartbeat and active registry on error
      clearInterval(heartbeatTimer);
      activeUploadRegistry.unregister(pendingFile.id);

      // 5. Clean up failed/aborted upload
      try {
        await storageProvider.deleteObject(storageKey);
      } catch (cleanupErr) {
        console.error(`[FileService] Failed to delete storage object ${storageKey}:`, cleanupErr);
      }

      try {
        await prisma.file.update({
          where: { id: pendingFile.id },
          data: { status: FileStatus.FAILED },
        });
      } catch (dbErr) {
        console.error(`[FileService] Failed to mark file as FAILED:`, dbErr);
      }

      throw uploadError;
    }
  }

  /**
   * Lists files belonging to an authenticated user with pagination, filtering, and summary metrics.
   */
  static async listFiles(params: {
    userId: string;
    page: number;
    limit: number;
    status?: FileStatus;
    search?: string;
  }) {
    const { userId, page, limit, status, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
    };

    if (status) {
      where.status = status;
    }

    if (search && search.trim().length > 0) {
      where.originalName = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }

    const now = new Date();
    const [files, totalCount, totalFiles, availableFiles, expiredFiles, activeLinksResult] =
      await Promise.all([
        prisma.file.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            originalName: true,
            sizeBytes: true,
            mimeType: true,
            status: true,
            expiresAt: true,
            createdAt: true,
            shareLinks: {
              select: {
                id: true,
                shortCode: true,
                downloadCount: true,
                maxDownloads: true,
                isRevoked: true,
                expiresAt: true,
                passwordHash: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        }),
        prisma.file.count({ where }),
        prisma.file.count({ where: { userId } }),
        prisma.file.count({ where: { userId, status: FileStatus.AVAILABLE } }),
        prisma.file.count({ where: { userId, status: FileStatus.EXPIRED } }),
        // Count only genuinely active share links matching download authorization semantics
        prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "share_links" sl
          INNER JOIN "files" f ON sl."file_id" = f."id"
          WHERE f."user_id" = ${userId}
            AND f."status" = 'AVAILABLE'::"FileStatus"
            AND f."expires_at" > ${now}
            AND sl."is_revoked" = false
            AND (sl."expires_at" IS NULL OR sl."expires_at" > ${now})
            AND (sl."max_downloads" IS NULL OR sl."download_count" < sl."max_downloads")
        `,
      ]);
    const activeLinksCount = Number(activeLinksResult[0]?.count ?? 0);

    const formattedFiles = files.map((file) => ({
      id: file.id,
      originalName: file.originalName,
      sizeBytes: file.sizeBytes.toString(),
      mimeType: file.mimeType,
      status: file.status,
      expiresAt: file.expiresAt,
      createdAt: file.createdAt,
      shareLinks: file.shareLinks.map((link) => ({
        id: link.id,
        shortCode: link.shortCode,
        downloadCount: link.downloadCount,
        maxDownloads: link.maxDownloads,
        isRevoked: link.isRevoked,
        expiresAt: link.expiresAt,
        hasPassword: Boolean(link.passwordHash),
        createdAt: link.createdAt,
      })),
    }));

    return {
      files: formattedFiles,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      metrics: {
        totalFiles,
        availableFiles,
        expiredFiles,
        activeShareLinks: activeLinksCount,
      },
    };
  }

  /**
   * Retrieves file metadata if authorized (Owner or Management Token).
   */
  static async getFileMetadata(fileId: string, userId?: string, managementToken?: string) {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        shareLinks: {
          select: {
            id: true,
            shortCode: true,
            downloadCount: true,
            maxDownloads: true,
            isRevoked: true,
            expiresAt: true,
            passwordHash: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!file || file.status === FileStatus.DELETED || file.status === FileStatus.FAILED) {
      throw new AppError('File not found', 404);
    }

    if (file.expiresAt < new Date()) {
      throw new AppError('File has expired', 410);
    }

    await this.verifyAuthorization(file, userId, managementToken);

    return {
      id: file.id,
      originalName: file.originalName,
      sizeBytes: file.sizeBytes.toString(),
      mimeType: file.mimeType,
      status: file.status,
      expiresAt: file.expiresAt,
      createdAt: file.createdAt,
      shareLinks: file.shareLinks.map((link) => ({
        id: link.id,
        shortCode: link.shortCode,
        downloadCount: link.downloadCount,
        maxDownloads: link.maxDownloads,
        isRevoked: link.isRevoked,
        expiresAt: link.expiresAt,
        hasPassword: Boolean(link.passwordHash),
        createdAt: link.createdAt,
      })),
    };
  }

  /**
   * Authorizes owner or management token holder.
   */
  private static async verifyAuthorization(
    file: { id: string; userId: string | null },
    userId?: string,
    managementToken?: string
  ): Promise<void> {
    if (file.userId && userId && file.userId === userId) {
      return; // Authenticated owner
    }

    if (!file.userId && managementToken) {
      const tokenHash = crypto.createHash('sha256').update(managementToken).digest('hex');
      const tokenRecord = await prisma.fileManagementToken.findUnique({
        where: { fileId: file.id },
      });

      if (!tokenRecord || tokenRecord.tokenHash !== tokenHash) {
        throw new AppError('Unauthorized: Invalid management token', 403);
      }

      if (tokenRecord.revokedAt) {
        throw new AppError('Unauthorized: Management token has been revoked', 403);
      }

      if (tokenRecord.expiresAt < new Date()) {
        throw new AppError('Unauthorized: Management token has expired', 403);
      }

      return; // Valid anonymous management token
    }

    throw new AppError('Unauthorized: Access denied to this file', 403);
  }

  /**
   * Revokes an anonymous management token.
   */
  static async revokeManagementToken(fileId: string, managementToken: string): Promise<void> {
    if (!managementToken || typeof managementToken !== 'string') {
      throw new AppError('Missing management token', 400);
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { managementToken: true },
    });

    if (!file || file.status === FileStatus.DELETED || file.status === FileStatus.FAILED) {
      throw new AppError('File not found', 404);
    }

    if (file.userId) {
      throw new AppError('This file is owned by a registered user. Management tokens apply only to anonymous uploads.', 400);
    }

    const tokenRecord = file.managementToken;
    if (!tokenRecord) {
      throw new AppError('No management token found for this file', 404);
    }

    const incomingHash = crypto.createHash('sha256').update(managementToken).digest('hex');
    if (tokenRecord.tokenHash !== incomingHash) {
      throw new AppError('Unauthorized: Invalid management token for this file', 403);
    }

    if (tokenRecord.revokedAt) {
      throw new AppError('Management token is already revoked', 400);
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new AppError('Management token has expired', 400);
    }

    // Atomically set revokedAt
    await prisma.fileManagementToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Streams a file to the authorized downloader.
   */
  static async getDownloadStream(
    fileId: string,
    userId?: string,
    managementToken?: string,
    range?: { start: number; end: number }
  ) {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.status !== FileStatus.AVAILABLE) {
      throw new AppError('File not found or unavailable', 404);
    }

    if (file.expiresAt < new Date()) {
      throw new AppError('File has expired', 410);
    }

    await this.verifyAuthorization(file, userId, managementToken);

    const storage = getStorageProvider();
    const stream = await storage.getStream(file.storageKey, range);

    return {
      stream,
      file,
    };
  }

  /**
   * Deletes a file from storage and database.
   * Resolves the storage provider associated with the file record itself.
   */
  static async deleteFile(
    fileId: string,
    userId?: string,
    managementToken?: string,
    customStorageProvider?: IStorageProvider
  ): Promise<void> {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    if (file.status === FileStatus.DELETED) {
      return; // Already deleted idempotently
    }

    await this.verifyAuthorization(file, userId, managementToken);

    // Delete from the storage provider recorded on the file
    const storage = customStorageProvider ?? getStorageProviderForType(file.storageProvider);
    try {
      await storage.deleteObject(file.storageKey);
    } catch (err: any) {
      console.warn(`[FileService] Warning: Failed to delete physical object ${file.storageKey}:`, err);
      // Mark file as FAILED so CleanupWorker retries it, but DO NOT mark as DELETED
      await prisma.file.update({
        where: { id: fileId },
        data: { status: FileStatus.FAILED },
      });
      throw new AppError('Failed to delete file from storage. Queued for cleanup retry.', 500);
    }

    // Mark as DELETED in DB only if physical deletion succeeded
    await prisma.file.update({
      where: { id: fileId },
      data: { status: FileStatus.DELETED },
    });
  }
}
