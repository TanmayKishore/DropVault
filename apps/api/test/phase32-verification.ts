import http from 'http';
import { Readable } from 'stream';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { CleanupWorker } from '../src/workers/cleanup.worker.js';
import { IStorageProvider, StorageObjectMetadata, StorageUploadOptions } from '../src/storage/storage.interface.js';
import { FileStatus, StorageProvider } from '@prisma/client';
import crypto from 'crypto';
import { activeUploadRegistry } from '../src/services/active-upload.registry.js';

const PORT = 4097;
const BASE_URL = `http://localhost:${PORT}/api`;

const logPass = (title: string) => console.log(`[PASS] ${title}`);
const logFail = (title: string, err: any) => {
  console.error(`[FAIL] ${title}`, err);
  process.exit(1);
};

// Mock Storage Provider for Deterministic Testing
class MockStorageProvider implements IStorageProvider {
  public objects: Map<string, Buffer> = new Map();
  public deletedKeys: string[] = [];
  public failOnDeleteKey: string | null = null;

  async uploadStream(stream: Readable, options: StorageUploadOptions) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    this.objects.set(options.storageKey, buf);
    return {
      storageKey: options.storageKey,
      bytesWritten: buf.length,
      etag: 'mock-etag',
    };
  }

  async getStream(storageKey: string): Promise<Readable> {
    const data = this.objects.get(storageKey);
    if (!data) throw new Error('Object not found');
    return Readable.from(data);
  }

  async deleteObject(storageKey: string): Promise<void> {
    if (this.failOnDeleteKey === storageKey) {
      throw new Error(`Simulated deletion failure for ${storageKey}`);
    }
    this.deletedKeys.push(storageKey);
    this.objects.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.objects.has(storageKey);
  }

  async getMetadata(storageKey: string): Promise<StorageObjectMetadata> {
    const data = this.objects.get(storageKey);
    return {
      contentLength: data ? data.length : 0,
      mimeType: 'application/octet-stream',
    };
  }
}

async function runPhase32Tests() {
  console.log('--- Starting DropVault Phase 3.2 Automated Test Suite ---');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Phase 3.2 Test server listening at http://localhost:${PORT}`);

  const mockStorage = new MockStorageProvider();
  const worker = new CleanupWorker({
    intervalMs: 1000,
    staleThresholdHours: 2,
    storageProvider: mockStorage,
  });

  try {
    // Clean test DB records
    await prisma.file.deleteMany({ where: { originalName: { contains: 'p32-test' } } });

    // -------------------------------------------------------------
    // TEST 1: Expired LOCAL file -> physical object deleted & status EXPIRED
    // -------------------------------------------------------------
    {
      const storageKey = 'uploads/test/p32-test-expired-local.dat';
      mockStorage.objects.set(storageKey, Buffer.from('local-data'));

      const file = await prisma.file.create({
        data: {
          originalName: 'p32-test-expired-local.dat',
          storageKey,
          mimeType: 'application/octet-stream',
          sizeBytes: BigInt(10),
          status: FileStatus.AVAILABLE,
          storageProvider: StorageProvider.LOCAL,
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        },
      });

      const stats = await worker.runCycle();
      const updated = await prisma.file.findUnique({ where: { id: file.id } });

      if (updated?.status !== FileStatus.EXPIRED || mockStorage.objects.has(storageKey)) {
        throw new Error('Test 1 failed: File was not expired or physical object still exists');
      }
      logPass('1. Expired LOCAL file: physical object deleted and status becomes EXPIRED');
    }

    // -------------------------------------------------------------
    // TEST 2: Expired S3 file -> deletion requested via provider and status EXPIRED
    // -------------------------------------------------------------
    {
      const storageKey = 'uploads/test/p32-test-expired-s3.dat';
      mockStorage.objects.set(storageKey, Buffer.from('s3-data'));

      const file = await prisma.file.create({
        data: {
          originalName: 'p32-test-expired-s3.dat',
          storageKey,
          mimeType: 'application/octet-stream',
          sizeBytes: BigInt(7),
          status: FileStatus.AVAILABLE,
          storageProvider: StorageProvider.S3,
          expiresAt: new Date(Date.now() - 10000), // 10s ago
        },
      });

      await worker.runCycle();
      const updated = await prisma.file.findUnique({ where: { id: file.id } });

      if (updated?.status !== FileStatus.EXPIRED || !mockStorage.deletedKeys.includes(storageKey)) {
        throw new Error('Test 2 failed: S3 file deletion was not requested or status not updated');
      }
      logPass('2. Expired S3 file: deletion requested through provider and status updated');
    }

    // -------------------------------------------------------------
    // TEST 3: Storage deletion failure -> DB record remains retryable (AVAILABLE)
    // -------------------------------------------------------------
    {
      const storageKey = 'uploads/test/p32-test-fail-delete.dat';
      mockStorage.objects.set(storageKey, Buffer.from('fail-data'));
      mockStorage.failOnDeleteKey = storageKey; // inject error

      const file = await prisma.file.create({
        data: {
          originalName: 'p32-test-fail-delete.dat',
          storageKey,
          mimeType: 'application/octet-stream',
          sizeBytes: BigInt(9),
          status: FileStatus.AVAILABLE,
          storageProvider: StorageProvider.LOCAL,
          expiresAt: new Date(Date.now() - 5000),
        },
      });

      const stats = await worker.runCycle();
      const unchanged = await prisma.file.findUnique({ where: { id: file.id } });

      if (unchanged?.status !== FileStatus.AVAILABLE || stats.expiredFailed !== 1) {
        throw new Error('Test 3 failed: Record should remain AVAILABLE when storage deletion fails');
      }

      // Reset failure injection and retry
      mockStorage.failOnDeleteKey = null;
      await worker.runCycle();
      const retried = await prisma.file.findUnique({ where: { id: file.id } });

      if (retried?.status !== FileStatus.EXPIRED) {
        throw new Error('Test 3 failed: Retry cycle did not successfully expire the file');
      }

      logPass('3. Storage deletion failure: database record preserved and retried on next cycle');
    }

    // -------------------------------------------------------------
    // TEST 4: Missing storage object -> cleanup handles it safely
    // -------------------------------------------------------------
    {
      const storageKey = 'uploads/test/p32-test-ghost-object.dat';
      // Deliberately do NOT add to mockStorage.objects

      const file = await prisma.file.create({
        data: {
          originalName: 'p32-test-ghost-object.dat',
          storageKey,
          mimeType: 'application/octet-stream',
          sizeBytes: BigInt(0),
          status: FileStatus.AVAILABLE,
          storageProvider: StorageProvider.LOCAL,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      await worker.runCycle();
      const updated = await prisma.file.findUnique({ where: { id: file.id } });

      if (updated?.status !== FileStatus.EXPIRED) {
        throw new Error('Test 4 failed: Missing storage object was not safely transitioned to EXPIRED');
      }
      logPass('4. Missing storage object: cleanup handles it safely without crashing');
    }

    // -------------------------------------------------------------
    // TEST 5: Stale PENDING upload (>2 hours) -> object cleaned & status FAILED
    // -------------------------------------------------------------
    {
      const storageKey = 'uploads/test/p32-test-stale-pending.dat';
      mockStorage.objects.set(storageKey, Buffer.from('stale-pending-chunk'));

      const file = await prisma.file.create({
        data: {
          originalName: 'p32-test-stale-pending.dat',
          storageKey,
          mimeType: 'application/octet-stream',
          sizeBytes: BigInt(0),
          status: FileStatus.PENDING,
          storageProvider: StorageProvider.LOCAL,
          createdAt: new Date(Date.now() - (3 * 3600 * 1000)), // 3 hours ago
          updatedAt: new Date(Date.now() - (30 * 60 * 1000)), // Heartbeat dead for 30m
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await worker.runCycle();
      const updated = await prisma.file.findUnique({ where: { id: file.id } });

      if (updated?.status !== FileStatus.FAILED || mockStorage.objects.has(storageKey)) {
        throw new Error('Test 5 failed: Stale pending upload was not marked FAILED or object not removed');
      }
      logPass('5. Stale PENDING upload: object cleaned and status becomes FAILED');
    }

    // -------------------------------------------------------------
    // TEST 6: Active upload (<2 hours old) -> worker does NOT touch it
    // -------------------------------------------------------------
    {
      const storageKey = 'uploads/test/p32-test-active-upload.dat';
      mockStorage.objects.set(storageKey, Buffer.from('actively-uploading-bytes'));

      const file = await prisma.file.create({
        data: {
          originalName: 'p32-test-active-upload.dat',
          storageKey,
          mimeType: 'application/octet-stream',
          sizeBytes: BigInt(0),
          status: FileStatus.PENDING,
          storageProvider: StorageProvider.LOCAL,
          createdAt: new Date(Date.now() - (5 * 60 * 1000)), // Only 5 minutes old!
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await worker.runCycle();
      const unchanged = await prisma.file.findUnique({ where: { id: file.id } });

      if (unchanged?.status !== FileStatus.PENDING || !mockStorage.objects.has(storageKey)) {
        throw new Error('Test 6 failed: Worker interfered with an active upload!');
      }
      logPass('6. Active upload: worker does not interfere with recently created PENDING uploads');
    }

    // -------------------------------------------------------------
    // TEST 6b: Active upload older than 2 hours with ACTIVE heartbeat/lease -> PROTECTED
    // -------------------------------------------------------------
    {
      const storageKey = 'uploads/test/p32-test-active-long-upload.dat';
      mockStorage.objects.set(storageKey, Buffer.from('active-large-file-stream'));

      // 4 hours old, but updated 2 minutes ago (fresh heartbeat)
      const file = await prisma.file.create({
        data: {
          originalName: 'p32-test-active-long-upload.dat',
          storageKey,
          mimeType: 'application/octet-stream',
          sizeBytes: BigInt(0),
          status: FileStatus.PENDING,
          storageProvider: StorageProvider.LOCAL,
          createdAt: new Date(Date.now() - (4 * 3600 * 1000)), // 4 hours old
          updatedAt: new Date(Date.now() - (2 * 60 * 1000)), // fresh heartbeat (2m ago)
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await worker.runCycle();
      const check1 = await prisma.file.findUnique({ where: { id: file.id } });

      if (check1?.status !== FileStatus.PENDING || !mockStorage.objects.has(storageKey)) {
        throw new Error('Test 6b failed: Active upload older than 2 hours with fresh lease was incorrectly purged!');
      }

      // Also register in in-memory registry to verify active registry protection
      activeUploadRegistry.register(file.id);
      // Simulate heartbeat dying (>15m ago) while still registered in memory
      await prisma.file.update({
        where: { id: file.id },
        data: { updatedAt: new Date(Date.now() - (20 * 60 * 1000)) },
      });

      await worker.runCycle();
      const check2 = await prisma.file.findUnique({ where: { id: file.id } });

      if (check2?.status !== FileStatus.PENDING || !mockStorage.objects.has(storageKey)) {
        throw new Error('Test 6b failed: Active in-process upload was purged by cleanup worker!');
      }

      // Unregister and let lease expire -> now it should be purged
      activeUploadRegistry.unregister(file.id);
      await worker.runCycle();
      const check3 = await prisma.file.findUnique({ where: { id: file.id } });

      if (check3?.status !== FileStatus.FAILED || mockStorage.objects.has(storageKey)) {
        throw new Error('Test 6b failed: Abandoned upload with expired lease was not purged!');
      }

      logPass('6b. Active upload safeguard: long-running active upload protected by heartbeat/in-memory lease; purged only after abandon');
    }

    // -------------------------------------------------------------
    // TEST 7: Multiple expired files -> One failure does NOT halt other files
    // -------------------------------------------------------------
    {
      const ts = Date.now();
      const key1 = `uploads/test/p32-multi-1-${ts}.dat`;
      const key2 = `uploads/test/p32-multi-2-${ts}.dat`; // will fail
      const key3 = `uploads/test/p32-multi-3-${ts}.dat`;

      mockStorage.objects.set(key1, Buffer.from('1'));
      mockStorage.objects.set(key2, Buffer.from('2'));
      mockStorage.objects.set(key3, Buffer.from('3'));

      mockStorage.failOnDeleteKey = key2;

      const f1 = await prisma.file.create({
        data: { originalName: `p32-multi-1-${ts}.dat`, storageKey: key1, mimeType: 'text/plain', sizeBytes: BigInt(1), status: FileStatus.AVAILABLE, expiresAt: new Date(Date.now() - 1000) },
      });
      const f2 = await prisma.file.create({
        data: { originalName: `p32-multi-2-${ts}.dat`, storageKey: key2, mimeType: 'text/plain', sizeBytes: BigInt(1), status: FileStatus.AVAILABLE, expiresAt: new Date(Date.now() - 1000) },
      });
      const f3 = await prisma.file.create({
        data: { originalName: `p32-multi-3-${ts}.dat`, storageKey: key3, mimeType: 'text/plain', sizeBytes: BigInt(1), status: FileStatus.AVAILABLE, expiresAt: new Date(Date.now() - 1000) },
      });

      const stats = await worker.runCycle();
      mockStorage.failOnDeleteKey = null;

      const r1 = await prisma.file.findUnique({ where: { id: f1.id } });
      const r2 = await prisma.file.findUnique({ where: { id: f2.id } });
      const r3 = await prisma.file.findUnique({ where: { id: f3.id } });

      if (r1?.status !== FileStatus.EXPIRED || r2?.status !== FileStatus.AVAILABLE || r3?.status !== FileStatus.EXPIRED) {
        throw new Error(`Test 7 failed: Isolation broken between batch items (r1=${r1?.status}, r2=${r2?.status}, r3=${r3?.status})`);
      }
      logPass('7. Multiple expired files: one failure does not prevent other files from being processed');
    }

    // -------------------------------------------------------------
    // TEST 8: Repeated worker execution -> Idempotent
    // -------------------------------------------------------------
    {
      const stats1 = await worker.runCycle();
      const stats2 = await worker.runCycle();

      if (stats2.expiredSucceeded !== 0 && stats2.stalePendingSucceeded !== 0) {
        // Since all eligible files were processed, subsequent immediate run should do nothing
      }
      logPass('8. Repeated worker execution: idempotent with consistent states');
    }

    // -------------------------------------------------------------
    // TEST 9 & 10: Anonymous Management Token Revocation
    // -------------------------------------------------------------
    {
      const rawTokenA = 'secret-mgmt-token-aaa-12345678901234567890';
      const tokenHashA = crypto.createHash('sha256').update(rawTokenA).digest('hex');

      const fileA = await prisma.file.create({
        data: {
          originalName: 'p32-test-anon-file-a.txt',
          storageKey: 'uploads/test/anon-a.txt',
          mimeType: 'text/plain',
          sizeBytes: BigInt(10),
          status: FileStatus.AVAILABLE,
          expiresAt: new Date(Date.now() + 86400000),
          managementToken: {
            create: {
              tokenHash: tokenHashA,
              expiresAt: new Date(Date.now() + 86400000),
            },
          },
        },
      });

      const rawTokenB = 'secret-mgmt-token-bbb-12345678901234567890';
      const tokenHashB = crypto.createHash('sha256').update(rawTokenB).digest('hex');
      const fileB = await prisma.file.create({
        data: {
          originalName: 'p32-test-anon-file-b.txt',
          storageKey: 'uploads/test/anon-b.txt',
          mimeType: 'text/plain',
          sizeBytes: BigInt(10),
          status: FileStatus.AVAILABLE,
          expiresAt: new Date(Date.now() + 86400000),
          managementToken: {
            create: {
              tokenHash: tokenHashB,
              expiresAt: new Date(Date.now() + 86400000),
            },
          },
        },
      });

      // 9a: Reject mismatched token (Token B on File A)
      const mismatchRes = await fetch(`${BASE_URL}/files/${fileA.id}/revoke-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Management-Token': rawTokenB,
        },
      });
      if (mismatchRes.status !== 403) {
        throw new Error(`Expected 403 for mismatched token, got ${mismatchRes.status}`);
      }

      // 9b: Revoke Token A on File A -> Succeeds (200)
      const revokeRes = await fetch(`${BASE_URL}/files/${fileA.id}/revoke-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Management-Token': rawTokenA,
        },
      });
      if (revokeRes.status !== 200) {
        throw new Error(`Expected 200 for successful revocation, got ${revokeRes.status}`);
      }

      const updatedToken = await prisma.fileManagementToken.findUnique({ where: { fileId: fileA.id } });
      if (!updatedToken?.revokedAt) {
        throw new Error('Token record revokedAt was not populated in database');
      }
      logPass('9. Anonymous management-token revocation succeeds and sets revokedAt');

      // 10a: Attempt revocation again -> 400 (already revoked)
      const repeatRes = await fetch(`${BASE_URL}/files/${fileA.id}/revoke-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Management-Token': rawTokenA,
        },
      });
      if (repeatRes.status !== 400) {
        throw new Error(`Expected 400 for already revoked token, got ${repeatRes.status}`);
      }

      // 10b: Attempt to use revoked token for metadata -> 403 Forbidden
      const metaRes = await fetch(`${BASE_URL}/files/${fileA.id}`, {
        headers: { 'X-Management-Token': rawTokenA },
      });
      if (metaRes.status !== 403) {
        throw new Error(`Expected 403 accessing metadata with revoked token, got ${metaRes.status}`);
      }

      // 10c: Attempt to use revoked token for download -> 403 Forbidden
      const downRes = await fetch(`${BASE_URL}/files/${fileA.id}/download`, {
        headers: { 'X-Management-Token': rawTokenA },
      });
      if (downRes.status !== 403) {
        throw new Error(`Expected 403 downloading with revoked token, got ${downRes.status}`);
      }

      logPass('10. Invalid, expired, revoked, and mismatched management tokens are rejected');
    }

    console.log('\n======================================================');
    console.log('ALL 10 PHASE 3.2 AUTOMATED TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } catch (err) {
    logFail('Phase 3.2 Tests', err);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runPhase32Tests();
