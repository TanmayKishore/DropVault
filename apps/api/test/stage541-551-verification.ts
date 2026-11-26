import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { prisma } from '../src/config/database.js';
import { config } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth.service.js';
import { FileService } from '../src/services/file.service.js';
import { ShareLinkService } from '../src/services/share-link.service.js';
import { CleanupWorker } from '../src/workers/cleanup.worker.js';
import { IStorageProvider } from '../src/storage/storage.interface.js';
import { FileStatus, StorageProvider } from '@prisma/client';

const TEST_PORT = 4097;
let server: http.Server;
const baseUrl = `http://localhost:${TEST_PORT}`;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function request(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not json
  }
  return { status: res.status, headers: res.headers, text, json };
}

async function run() {
  console.log('🚀 Starting Stage 5.4.2 + 5.5.2 Remediation Verification Suite...');

  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`📡 Test server running on ${baseUrl}`);

  const createdUserIds: string[] = [];
  const createdFileIds: string[] = [];
  const runTag = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  try {
    // Setup test users
    const password = 'StrongPassword123!';
    const regA = await AuthService.register({
      email: `remed542_a_${runTag}@example.com`,
      password,
      name: 'User A',
    });
    const regB = await AuthService.register({
      email: `remed542_b_${runTag}@example.com`,
      password,
      name: 'User B',
    });
    const regBulk = await AuthService.register({
      email: `remed542_bulk_${runTag}@example.com`,
      password,
      name: 'Bulk User',
    });

    createdUserIds.push(regA.user.id, regB.user.id, regBulk.user.id);
    const tokenA = regA.tokens.accessToken;
    const tokenB = regB.tokens.accessToken;
    const tokenBulk = regBulk.tokens.accessToken;
    const userA = regA.user;
    const userB = regB.user;
    const userBulk = regBulk.user;

    // -------------------------------------------------------------
    // TEST 1: Authentication Guards on GET /api/files & GET /api/files/share-links
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Authentication Guards ---');
    const unauthFiles = await request(`${baseUrl}/api/files`);
    assert(unauthFiles.status === 401, `Expected 401 on GET /api/files, got ${unauthFiles.status}`);

    const unauthShares = await request(`${baseUrl}/api/files/share-links`);
    assert(unauthShares.status === 401, `Expected 401 on GET /api/files/share-links, got ${unauthShares.status}`);
    console.log('✅ Test 1 Passed: Unauthenticated requests rejected with 401');

    // -------------------------------------------------------------
    // TEST 2: Cross-User Isolation, Status Filter, Search, Pagination & Metrics
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Isolation, Filters, Pagination & Accurate Metrics ---');
    const fileA1 = await FileService.uploadFile({
      stream: Readable.from(Buffer.from('User A report')),
      originalName: 'fileA1_report.pdf',
      userId: userA.id,
      expiryDays: 7,
    });
    const fileA2 = await FileService.uploadFile({
      stream: Readable.from(Buffer.from('User A notes')),
      originalName: 'fileA2_notes.txt',
      userId: userA.id,
      expiryDays: 7,
    });
    const fileA3 = await FileService.uploadFile({
      stream: Readable.from(Buffer.from('User A image')),
      originalName: 'fileA3_image.png',
      userId: userA.id,
      expiryDays: 7,
    });
    // Create an EXPIRED file for User A
    const expiredFileA = await prisma.file.create({
      data: {
        userId: userA.id,
        originalName: 'fileA4_expired.zip',
        storageKey: `test/${runTag}/expired_${crypto.randomUUID()}.zip`,
        mimeType: 'application/zip',
        sizeBytes: BigInt(512),
        status: FileStatus.EXPIRED,
        storageProvider: StorageProvider.LOCAL,
        expiresAt: new Date(Date.now() - 3600_000),
      },
    });
    // Create an AVAILABLE file whose expiresAt is already in the past
    const pastDueAvailableA = await prisma.file.create({
      data: {
        userId: userA.id,
        originalName: 'fileA5_past_due.txt',
        storageKey: `test/${runTag}/pastdue_${crypto.randomUUID()}.txt`,
        mimeType: 'text/plain',
        sizeBytes: BigInt(128),
        status: FileStatus.AVAILABLE,
        storageProvider: StorageProvider.LOCAL,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const fileB1 = await FileService.uploadFile({
      stream: Readable.from(Buffer.from('User B secret')),
      originalName: 'fileB1_secret.pdf',
      userId: userB.id,
      expiryDays: 7,
    });

    createdFileIds.push(
      fileA1.file.id,
      fileA2.file.id,
      fileA3.file.id,
      expiredFileA.id,
      pastDueAvailableA.id,
      fileB1.file.id
    );

    // Note: uploadFile creates 1 default active share link each for fileA1, fileA2, fileA3 (3 active links)
    // Add excluded links to verify activeShareLinks accuracy:
    // 1) Password-protected active link on fileA1 -> SHOULD BE COUNTED (+1 => 4)
    const activePassLink = await ShareLinkService.createShareLink({
      fileId: fileA1.file.id,
      userId: userA.id,
      password: 'sharePassword123',
    });
    // 2) Revoked link on fileA1 -> EXCLUDED
    await prisma.shareLink.create({
      data: {
        fileId: fileA1.file.id,
        shortCode: `rev_${crypto.randomUUID().slice(0, 8)}`,
        isRevoked: true,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    // 3) Expired link on fileA1 -> EXCLUDED
    await prisma.shareLink.create({
      data: {
        fileId: fileA1.file.id,
        shortCode: `exp_${crypto.randomUUID().slice(0, 8)}`,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    // 4) Exhausted link (downloadCount >= maxDownloads) on fileA1 -> EXCLUDED
    await prisma.shareLink.create({
      data: {
        fileId: fileA1.file.id,
        shortCode: `lim_${crypto.randomUUID().slice(0, 8)}`,
        isRevoked: false,
        maxDownloads: 2,
        downloadCount: 2,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    // 5) Non-revoked link on EXPIRED file -> EXCLUDED
    await prisma.shareLink.create({
      data: {
        fileId: expiredFileA.id,
        shortCode: `fexp_${crypto.randomUUID().slice(0, 8)}`,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    // 6) Non-revoked link on AVAILABLE file whose file.expiresAt < now -> EXCLUDED
    await prisma.shareLink.create({
      data: {
        fileId: pastDueAvailableA.id,
        shortCode: `pdue_${crypto.randomUUID().slice(0, 8)}`,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });

    const listARes = await request(`${baseUrl}/api/files`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(listARes.status === 200, `User A listing returned ${listARes.status}`);
    const dataA = listARes.json.data;
    assert(dataA.files.length === 5, `Expected User A to have 5 files, got ${dataA.files.length}`);
    assert(dataA.files.every((f: any) => f.id !== fileB1.file.id), 'Cross-user file leaked');
    assert(dataA.metrics.totalFiles === 5, `Expected totalFiles=5, got ${dataA.metrics.totalFiles}`);
    assert(dataA.metrics.availableFiles === 4, `Expected availableFiles=4, got ${dataA.metrics.availableFiles}`);
    assert(dataA.metrics.expiredFiles === 1, `Expected expiredFiles=1, got ${dataA.metrics.expiredFiles}`);
    assert(
      dataA.metrics.activeShareLinks === 4,
      `Expected activeShareLinks=4 (excluding revoked/expired/exhausted/expired-file), got ${dataA.metrics.activeShareLinks}`
    );

    // Status filter tests
    const statusExpRes = await request(`${baseUrl}/api/files?status=EXPIRED`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(statusExpRes.status === 200, `Status filter returned ${statusExpRes.status}`);
    assert(statusExpRes.json.data.files.length === 1, `Expected 1 EXPIRED file, got ${statusExpRes.json.data.files.length}`);
    assert(statusExpRes.json.data.files[0].id === expiredFileA.id, 'Status=EXPIRED returned wrong file');

    const statusAvailRes = await request(`${baseUrl}/api/files?status=AVAILABLE`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(statusAvailRes.json.data.files.length === 4, `Expected 4 AVAILABLE files, got ${statusAvailRes.json.data.files.length}`);

    // Search + Pagination
    const searchRes = await request(`${baseUrl}/api/files?search=report`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(searchRes.json.data.files.length === 1, 'Search expected 1 file');
    assert(searchRes.json.data.files[0].originalName === 'fileA1_report.pdf', 'Search returned wrong file');

    const page1Res = await request(`${baseUrl}/api/files?page=1&limit=2`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(page1Res.json.data.files.length === 2, 'Page 1 expected 2 files');
    assert(page1Res.json.data.pagination.total === 5, 'Pagination total expected 5');
    assert(page1Res.json.data.pagination.totalPages === 3, 'Pagination totalPages expected 3');

    // User B isolation
    const listBRes = await request(`${baseUrl}/api/files`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(listBRes.json.data.files.length === 1, 'User B expected 1 file');
    assert(listBRes.json.data.files[0].id === fileB1.file.id, 'User B must see only own file');
    console.log('✅ Test 2 Passed: Isolation, status filters, pagination, and activeShareLinks metrics verified');

    // -------------------------------------------------------------
    // TEST 3: Secret Sanitization, Share Link UUID & Revocation
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Share Link UUID, Secret Sanitization & Revocation ---');
    const fileWithLink = dataA.files.find((f: any) => f.id === fileA1.file.id);
    const inspectedLink = fileWithLink.shareLinks.find((l: any) => l.shortCode === activePassLink.shortCode);
    assert(Boolean(inspectedLink), 'Active password link missing from file listing');
    assert(typeof inspectedLink.id === 'string' && inspectedLink.id.length > 10, 'Link id must be UUID');
    assert(inspectedLink.hasPassword === true, 'hasPassword must be true');
    assert(!('passwordHash' in inspectedLink) && !('tokenHash' in inspectedLink), 'Link secrets must not be exposed');
    assert(!('storageKey' in fileWithLink), 'storageKey must not be exposed');

    const metaRes = await request(`${baseUrl}/api/files/${fileA1.file.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(metaRes.status === 200, `GET /api/files/:id returned ${metaRes.status}`);
    const metaLink = metaRes.json.data.shareLinks.find((l: any) => l.shortCode === activePassLink.shortCode);
    assert(metaLink.id === inspectedLink.id && metaLink.hasPassword === true, 'Metadata link fields mismatch');
    assert(!('passwordHash' in metaLink), 'Metadata must not expose passwordHash');

    const revokeRes = await request(`${baseUrl}/api/files/${fileA1.file.id}/share-links/${inspectedLink.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(revokeRes.status === 200 && revokeRes.json.data.isRevoked === true, 'Share link revocation failed');
    console.log('✅ Test 3 Passed: Secrets excluded and share link revoked by UUID');

    // -------------------------------------------------------------
    // TEST 4: Account-Wide Share Links Listing (>20 files & share links)
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Account-Wide Share Links Listing (>20 files) ---');
    for (let i = 1; i <= 22; i++) {
      const f = await prisma.file.create({
        data: {
          userId: userBulk.id,
          originalName: `bulk_file_${String(i).padStart(2, '0')}.txt`,
          storageKey: `test/${runTag}/bulk_${i}_${crypto.randomUUID()}.txt`,
          mimeType: 'text/plain',
          sizeBytes: BigInt(100 + i),
          status: FileStatus.AVAILABLE,
          storageProvider: StorageProvider.LOCAL,
          expiresAt: new Date(Date.now() + 86400_000),
        },
      });
      createdFileIds.push(f.id);
      await prisma.shareLink.create({
        data: {
          fileId: f.id,
          shortCode: `blk${String(i).padStart(2, '0')}_${crypto.randomUUID().slice(0, 4)}`,
          passwordHash: i % 2 === 0 ? 'dummyhash' : null,
          expiresAt: new Date(Date.now() + 86400_000),
        },
      });
    }

    const sharesP1 = await request(`${baseUrl}/api/files/share-links?page=1&limit=20`, {
      headers: { Authorization: `Bearer ${tokenBulk}` },
    });
    assert(sharesP1.status === 200, `GET /api/files/share-links page 1 returned ${sharesP1.status}`);
    assert(sharesP1.json.data.shareLinks.length === 20, `Expected 20 links on page 1, got ${sharesP1.json.data.shareLinks.length}`);
    assert(sharesP1.json.data.pagination.total === 22, `Expected total=22, got ${sharesP1.json.data.pagination.total}`);
    assert(sharesP1.json.data.pagination.totalPages === 2, 'Expected totalPages=2');
    const sampleLink = sharesP1.json.data.shareLinks[0];
    assert(!('passwordHash' in sampleLink) && !('tokenHash' in sampleLink) && !('storageKey' in sampleLink), 'Share links listing leaked secrets');

    const sharesP2 = await request(`${baseUrl}/api/files/share-links?page=2&limit=20`, {
      headers: { Authorization: `Bearer ${tokenBulk}` },
    });
    assert(sharesP2.status === 200 && sharesP2.json.data.shareLinks.length === 2, 'Expected 2 links on page 2');

    const sharesSearch = await request(`${baseUrl}/api/files/share-links?search=bulk_file_22`, {
      headers: { Authorization: `Bearer ${tokenBulk}` },
    });
    assert(sharesSearch.status === 200 && sharesSearch.json.data.shareLinks.length === 1, 'Share link search by filename failed');

    // Cross-user isolation on /api/files/share-links
    const sharesUserB = await request(`${baseUrl}/api/files/share-links`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(sharesUserB.status === 200 && sharesUserB.json.data.shareLinks.length === 1, 'User B share links isolation failed');
    console.log('✅ Test 4 Passed: Account-wide share-links pagination (>20), search, and isolation verified');

    // -------------------------------------------------------------
    // TEST 5: Real FileService.deleteFile() Failure & CleanupWorker Retry Recovery
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Real Deletion Failure & CleanupWorker Retry Recovery ---');
    const failTarget = await FileService.uploadFile({
      stream: Readable.from(Buffer.from('Will fail deletion first')),
      originalName: 'delete_fail_target.txt',
      userId: userA.id,
      expiryDays: 7,
    });
    const secondTarget = await FileService.uploadFile({
      stream: Readable.from(Buffer.from('Second file in batch')),
      originalName: 'batch_second_target.txt',
      userId: userA.id,
      expiryDays: 7,
    });
    createdFileIds.push(failTarget.file.id, secondTarget.file.id);

    const failingProvider: IStorageProvider = {
      uploadStream: async () => { throw new Error('not used'); },
      getStream: async () => { throw new Error('not used'); },
      exists: async () => true,
      getMetadata: async () => { throw new Error('not used'); },
      deleteObject: async () => {
        throw new Error('Simulated storage I/O failure');
      },
    };

    // 5a) Invoke FileService.deleteFile with failing provider -> must throw 500 and set FAILED (not DELETED)
    let deleteThrew = false;
    try {
      await FileService.deleteFile(failTarget.file.id, userA.id, undefined, failingProvider);
    } catch (err: any) {
      deleteThrew = true;
      assert(err.statusCode === 500, `Expected 500 from deleteFile on storage failure, got ${err.statusCode}`);
    }
    assert(deleteThrew, 'FileService.deleteFile must throw when storage deletion fails');

    const afterFailDb = await prisma.file.findUnique({ where: { id: failTarget.file.id } });
    assert(afterFailDb?.status === FileStatus.FAILED, `Expected FAILED status, got ${afterFailDb?.status}`);

    // Also set secondTarget to FAILED to test partial batch failure isolation
    await prisma.file.update({
      where: { id: secondTarget.file.id },
      data: { status: FileStatus.FAILED },
    });

    // 5b) CleanupWorker cycle where failTarget fails deletion, but secondTarget succeeds
    const partialFailProvider: IStorageProvider = {
      uploadStream: async () => { throw new Error('not used'); },
      getStream: async () => { throw new Error('not used'); },
      exists: async () => true,
      getMetadata: async () => { throw new Error('not used'); },
      deleteObject: async (key: string) => {
        if (key === afterFailDb!.storageKey) {
          throw new Error('Transient delete failure for first file');
        }
      },
    };

    const partialWorker = new CleanupWorker({ storageProvider: partialFailProvider });
    const partialStats = await partialWorker.runCycle();
    assert(partialStats.failedDeletionsFailed >= 1, 'Expected at least 1 failed deletion retry');
    assert(partialStats.failedDeletionsSucceeded >= 1, 'Expected secondTarget to succeed despite first failure');

    const failStillFailed = await prisma.file.findUnique({ where: { id: failTarget.file.id } });
    const secondNowDeleted = await prisma.file.findUnique({ where: { id: secondTarget.file.id } });
    assert(failStillFailed?.status === FileStatus.FAILED, 'Failed retry must remain FAILED');
    assert(secondNowDeleted?.status === FileStatus.DELETED, 'Other file in batch must transition to DELETED');

    // 5c) CleanupWorker retry with real LocalStorageProvider succeeds -> transitions to DELETED
    const realWorker = new CleanupWorker();
    const recoveryStats = await realWorker.runCycle();
    assert(recoveryStats.failedDeletionsSucceeded >= 1, 'Expected CleanupWorker to recover failTarget');
    const recoveredDb = await prisma.file.findUnique({ where: { id: failTarget.file.id } });
    assert(recoveredDb?.status === FileStatus.DELETED, `Expected DELETED after recovery, got ${recoveredDb?.status}`);

    // 5d) Missing storage object handled idempotently
    const missingObjFile = await prisma.file.create({
      data: {
        userId: userA.id,
        originalName: 'missing_obj.txt',
        storageKey: `test/${runTag}/missing_${crypto.randomUUID()}.txt`,
        mimeType: 'text/plain',
        sizeBytes: BigInt(10),
        status: FileStatus.FAILED,
        storageProvider: StorageProvider.LOCAL,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    createdFileIds.push(missingObjFile.id);
    await realWorker.runCycle();
    const missingAfterCleanup = await prisma.file.findUnique({ where: { id: missingObjFile.id } });
    assert(missingAfterCleanup?.status === FileStatus.DELETED, 'Missing storage object should idempotently transition to DELETED');
    console.log('✅ Test 5 Passed: Storage deletion failure, batch isolation, retry recovery, and idempotency verified');

    // -------------------------------------------------------------
    // TEST 6: Storage Provider Selection During Deletion
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Per-File Storage Provider Selection During Deletion ---');
    // Create a local physical file under LOCAL_STORAGE_PATH, but record the DB row as StorageProvider.S3
    const mismatchKey = `test/${runTag}/provider_mismatch_${crypto.randomUUID()}.txt`;
    const localFullPath = path.resolve(config.LOCAL_STORAGE_PATH, mismatchKey);
    await fs.promises.mkdir(path.dirname(localFullPath), { recursive: true });
    await fs.promises.writeFile(localFullPath, 'do not delete from local');

    const s3RecordedFile = await prisma.file.create({
      data: {
        userId: userA.id,
        originalName: 's3_recorded.txt',
        storageKey: mismatchKey,
        mimeType: 'text/plain',
        sizeBytes: BigInt(24),
        status: FileStatus.AVAILABLE,
        storageProvider: StorageProvider.S3,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    createdFileIds.push(s3RecordedFile.id);

    // Attempting to delete must use S3StorageProvider (which fails without valid S3 bucket/creds),
    // NOT LocalStorageProvider — so the local file must remain untouched!
    let s3DeleteThrew = false;
    try {
      await FileService.deleteFile(s3RecordedFile.id, userA.id);
    } catch (err: any) {
      s3DeleteThrew = true;
    }
    assert(s3DeleteThrew, 'Expected S3 deletion attempt to fail rather than falling back to LocalStorageProvider');
    assert(fs.existsSync(localFullPath), 'Local file must NOT be deleted when file.storageProvider is S3');

    // Clean up local test file
    await fs.promises.unlink(localFullPath).catch(() => {});
    console.log('✅ Test 6 Passed: FileService.deleteFile selects provider from file metadata');

    console.log('\n🎉 ALL STAGE 5.4.2 + 5.5.2 VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    // Deterministic cleanup of all test records
    if (createdFileIds.length > 0) {
      await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  if (server) server.close();
  process.exit(1);
});
