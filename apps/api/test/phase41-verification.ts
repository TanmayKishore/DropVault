import http from 'http';
import { Readable } from 'stream';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { AuthService } from '../src/services/auth.service.js';
import { FileService } from '../src/services/file.service.js';
import { FileStatus } from '@prisma/client';

const PORT = 4095;
const BASE_URL = `http://localhost:${PORT}/api`;

const logPass = (title: string) => console.log(`[PASS] ${title}`);
const logFail = (title: string, err: any) => {
  console.error(`[FAIL] ${title}`, err);
  process.exit(1);
};

async function runPhase41Tests() {
  console.log('--- Starting DropVault Phase 4.1 Security Hardening Test Suite ---');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Phase 4.1 Test server listening at http://localhost:${PORT}`);

  try {
    // Clean test DB records
    await prisma.file.deleteMany({ where: { originalName: { contains: 'p41-test' } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'p41-user' } } });

    const user = await AuthService.register({
      email: `p41-user-${Date.now()}@example.com`,
      password: 'StrongPassword123!',
    });
    const userToken = user.tokens.accessToken;
    const userId = user.user.id;

    // Helper: upload test file
    async function createTestFile(ownerId: string | null, name: string, status = FileStatus.AVAILABLE, expiryOffsetMs = 86400000) {
      const file = await prisma.file.create({
        data: {
          userId: ownerId,
          originalName: name,
          storageKey: `uploads/test/${name}`,
          mimeType: 'text/plain',
          sizeBytes: BigInt(20),
          status,
          expiresAt: new Date(Date.now() + expiryOffsetMs),
        },
      });

      // Write mock file in local storage directory so stream reader can find it
      const { getStorageProvider } = await import('../src/storage/storage.factory.js');
      const storage = getStorageProvider();
      await storage.uploadStream(Readable.from(Buffer.from('Phase 4.1 Content')), {
        storageKey: file.storageKey,
        mimeType: 'text/plain',
      });

      return file;
    }

    // -------------------------------------------------------------
    // 1. QUERY-PARAMETER PASSWORD REJECTION TESTS
    // -------------------------------------------------------------
    {
      const file = await createTestFile(userId, 'p41-test-pw-query.txt');
      const createRes = await fetch(`${BASE_URL}/files/${file.id}/share-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ password: 'CorrectPassword123!' }),
      });
      const link = (await createRes.json()).data;

      // 1a: Attempt download with password in query parameter `?password=CorrectPassword123!`
      const queryRes = await fetch(`${BASE_URL}/share/${link.shortCode}/download?password=CorrectPassword123!`);
      if (queryRes.status !== 401) {
        throw new Error(`Expected 401: query-parameter password must be rejected/ignored, got ${queryRes.status}`);
      }

      // 1b: Verify download succeeds with X-Share-Password header
      const headerRes = await fetch(`${BASE_URL}/share/${link.shortCode}/download`, {
        headers: { 'X-Share-Password': 'CorrectPassword123!' },
      });
      if (headerRes.status !== 200) {
        throw new Error(`Expected 200 with X-Share-Password header, got ${headerRes.status}`);
      }

      logPass('1. Query-parameter password is strictly rejected/ignored; header transport works');
    }

    // -------------------------------------------------------------
    // 2. ATOMIC DOWNLOAD AUTHORIZATION & PARENT FILE STATE RACES
    // -------------------------------------------------------------

    // 2a: Parent file expired -> atomic SQL must block download slot reservation
    {
      // Parent file is expired, but shareLink was set with future expiry
      const expParent = await createTestFile(userId, 'p41-test-parent-expired.txt', FileStatus.AVAILABLE, -1000); // 1s in past
      const link = await prisma.shareLink.create({
        data: {
          fileId: expParent.id,
          shortCode: `short-${Date.now()}-1`,
          maxDownloads: 5,
          expiresAt: new Date(Date.now() + 86400000), // future
        },
      });

      const res = await fetch(`${BASE_URL}/share/${link.shortCode}/download`);
      if (res.status !== 410) {
        throw new Error(`Expected 410 when parent file is expired, got ${res.status}`);
      }

      // Verify download_count was NOT incremented
      const dbLink = await prisma.shareLink.findUnique({ where: { id: link.id } });
      if (dbLink?.downloadCount !== 0) {
        throw new Error('Download count was incremented for expired parent file!');
      }

      logPass('2a. Atomic SQL blocks download reservation when parent file is expired');
    }

    // 2b: Parent file status DELETED or FAILED -> atomic SQL must block reservation
    {
      const delParent = await createTestFile(userId, 'p41-test-parent-del.txt', FileStatus.DELETED);
      const link = await prisma.shareLink.create({
        data: {
          fileId: delParent.id,
          shortCode: `short-${Date.now()}-2`,
          maxDownloads: 5,
        },
      });

      const res = await fetch(`${BASE_URL}/share/${link.shortCode}/download`);
      if (res.status !== 410) {
        throw new Error(`Expected 410 when parent file is DELETED, got ${res.status}`);
      }

      const dbLink = await prisma.shareLink.findUnique({ where: { id: link.id } });
      if (dbLink?.downloadCount !== 0) {
        throw new Error('Download count was incremented for DELETED parent file!');
      }

      logPass('2b. Atomic SQL blocks download reservation when parent file is DELETED/FAILED');
    }

    // 2c: High-Concurrency Atomic Download Limit against PostgreSQL
    {
      const file = await createTestFile(userId, 'p41-test-concurrent-sql.txt');
      const link = await prisma.shareLink.create({
        data: {
          fileId: file.id,
          shortCode: `short-${Date.now()}-3`,
          maxDownloads: 3, // exactly 3 allowed
        },
      });

      // Fire 12 simultaneous download requests against PostgreSQL
      const reqs = Array.from({ length: 12 }).map(() =>
        fetch(`${BASE_URL}/share/${link.shortCode}/download`)
      );

      const responses = await Promise.all(reqs);
      const statuses = responses.map((r) => r.status);
      const okCount = statuses.filter((s) => s === 200).length;
      const rejectedCount = statuses.filter((s) => s === 410).length;

      console.log(`[Phase 4.1 SQL Concurrency] 12 parallel requests -> OK: ${okCount}, Limit Reached: ${rejectedCount}`);

      if (okCount !== 3 || rejectedCount !== 9) {
        throw new Error(`Atomic PostgreSQL race condition! Expected 3 OK & 9 Rejected, got ${okCount} OK and ${rejectedCount} Rejected`);
      }

      const dbLink = await prisma.shareLink.findUnique({ where: { id: link.id } });
      if (dbLink?.downloadCount !== 3) {
        throw new Error(`Database download_count is ${dbLink?.downloadCount}, expected exactly 3`);
      }

      logPass('2c. Concurrent requests (12 parallel) against PostgreSQL strictly limited to exactly 3');
    }

    // -------------------------------------------------------------
    // 3. PASSWORD BRUTE-FORCE RATE LIMITING TESTS
    // -------------------------------------------------------------
    {
      const file = await createTestFile(userId, 'p41-test-rate-limit.txt');
      const createRes = await fetch(`${BASE_URL}/files/${file.id}/share-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ password: 'SecretPassword999!' }),
      });
      const link = (await createRes.json()).data;

      // We configured RATE_LIMIT_MAX_ATTEMPTS = 5 in env.ts
      // Attempt 5 incorrect passwords
      for (let i = 1; i <= 5; i++) {
        const res = await fetch(`${BASE_URL}/share/${link.shortCode}/download`, {
          headers: { 'X-Share-Password': `WrongPassword_${i}` },
        });
        if (res.status !== 401) {
          throw new Error(`Attempt ${i}: Expected 401 for wrong password, got ${res.status}`);
        }
      }

      // Attempt 6 should trigger HTTP 429 Too Many Requests
      const throttledRes = await fetch(`${BASE_URL}/share/${link.shortCode}/download`, {
        headers: { 'X-Share-Password': 'WrongPassword_6' },
      });

      if (throttledRes.status !== 429) {
        throw new Error(`Expected HTTP 429 after 5 failed attempts, got ${throttledRes.status}`);
      }

      const body = await throttledRes.json();
      const errorMsg = body.error?.message || body.message;
      if (!errorMsg?.includes('Too many download or password attempts')) {
        throw new Error(`Unexpected rate limit message: ${JSON.stringify(body)}`);
      }

      // Public metadata requests should still be functional and unthrottled
      const metaRes = await fetch(`${BASE_URL}/share/${link.shortCode}`);
      if (metaRes.status !== 200) {
        throw new Error(`Public metadata viewing should not be blocked by download rate limiter, got ${metaRes.status}`);
      }

      logPass('3. Password brute force rate limiter strictly triggers HTTP 429 after max attempts');
    }

    console.log('\n======================================================');
    console.log('ALL PHASE 4.1 SECURITY HARDENING TESTS PASSED!');
    console.log('======================================================\n');
  } catch (err) {
    logFail('Phase 4.1 Tests', err);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runPhase41Tests();
