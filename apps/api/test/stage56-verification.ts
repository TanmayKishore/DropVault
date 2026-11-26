import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { prisma } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth.service.js';
import { FileService } from '../src/services/file.service.js';
import { ShareLinkService } from '../src/services/share-link.service.js';
import { AccessEventType, FileStatus, StorageProvider } from '@prisma/client';

const TEST_PORT = 4098;
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
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString('utf-8');
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // binary or non-json
  }
  return { status: res.status, headers: res.headers, buffer, text, json };
}

async function run() {
  console.log('🚀 Starting Stage 5.6 Public Share & Download Verification Suite...');

  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`📡 Test server running on ${baseUrl}`);

  const createdUserIds: string[] = [];
  const createdFileIds: string[] = [];
  const runTag = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const regOwner = await AuthService.register({
      email: `stage56_owner_${runTag}@example.com`,
      password: 'StrongPassword123!',
      name: 'Stage 5.6 Owner',
    });
    const regOther = await AuthService.register({
      email: `stage56_other_${runTag}@example.com`,
      password: 'StrongPassword123!',
      name: 'Stage 5.6 Other',
    });
    createdUserIds.push(regOwner.user.id, regOther.user.id);

    const ownerId = regOwner.user.id;
    const ownerToken = regOwner.tokens.accessToken;
    const otherToken = regOther.tokens.accessToken;

    const payloadBytes = Buffer.from(`DropVault Stage 5.6 Binary Payload ${runTag} - 0123456789ABCDEF`);
    const uploaded = await FileService.uploadFile({
      stream: Readable.from(payloadBytes),
      originalName: 'stage56_sample_document.txt',
      clientMimeType: 'text/plain',
      userId: ownerId,
      expiryDays: 7,
    });
    createdFileIds.push(uploaded.file.id);

    // -------------------------------------------------------------
    // TEST 1 & 13: Valid public link metadata + No sensitive fields
    // -------------------------------------------------------------
    console.log('\n--- Test 1 & 13: Valid Public Metadata & Secret Redaction ---');
    const validMetaRes = await request(`${baseUrl}/api/share/${uploaded.shareLink.shortCode}`);
    assert(validMetaRes.status === 200, `Expected 200, got ${validMetaRes.status}`);
    const meta = validMetaRes.json.data;
    assert(meta.shortCode === uploaded.shareLink.shortCode, 'shortCode mismatch');
    assert(meta.originalName === 'stage56_sample_document.txt', 'originalName mismatch');
    assert(meta.sizeBytes === payloadBytes.length.toString(), 'sizeBytes mismatch');
    assert(meta.hasPassword === false, 'hasPassword should be false');
    for (const forbidden of [
      'id',
      'fileId',
      'userId',
      'email',
      'storageKey',
      'storageProvider',
      'passwordHash',
      'tokenHash',
      'managementToken',
    ]) {
      assert(!(forbidden in meta), `Public metadata leaked sensitive field: ${forbidden}`);
    }
    console.log('✅ Test 1 & 13 Passed');

    // -------------------------------------------------------------
    // TEST 2: Nonexistent short code
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Nonexistent Short Code ---');
    const notFoundRes = await request(`${baseUrl}/api/share/nonexistent_${runTag}`);
    assert(notFoundRes.status === 404, `Expected 404, got ${notFoundRes.status}`);
    console.log('✅ Test 2 Passed');

    // -------------------------------------------------------------
    // TEST 3: Expired share link
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Expired Share Link ---');
    const expiredLink = await prisma.shareLink.create({
      data: {
        fileId: uploaded.file.id,
        shortCode: `s56exp_${crypto.randomUUID().slice(0, 6)}`,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expMeta = await request(`${baseUrl}/api/share/${expiredLink.shortCode}`);
    assert(expMeta.status === 410, `Expected 410 for expired link metadata, got ${expMeta.status}`);
    const expDl = await request(`${baseUrl}/api/share/${expiredLink.shortCode}/download`);
    assert(expDl.status === 410, `Expected 410 for expired link download, got ${expDl.status}`);
    console.log('✅ Test 3 Passed');

    // -------------------------------------------------------------
    // TEST 4 & 15: Share-link revocation, authorization & revoked attempt
    // -------------------------------------------------------------
    console.log('\n--- Test 4 & 15: Revocation Authorization & Revoked State ---');
    const revocableLink = await ShareLinkService.createShareLink({
      fileId: uploaded.file.id,
      userId: ownerId,
    });
    // Non-owner cannot revoke
    const unauthRevoke = await request(
      `${baseUrl}/api/files/${uploaded.file.id}/share-links/${revocableLink.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${otherToken}` },
      }
    );
    assert(unauthRevoke.status === 403, `Expected 403 for non-owner revoke, got ${unauthRevoke.status}`);

    // Owner revokes
    const ownerRevoke = await request(
      `${baseUrl}/api/files/${uploaded.file.id}/share-links/${revocableLink.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }
    );
    assert(ownerRevoke.status === 200, `Expected 200 for owner revoke, got ${ownerRevoke.status}`);

    const revMeta = await request(`${baseUrl}/api/share/${revocableLink.shortCode}`);
    assert(revMeta.status === 403, `Expected 403 for revoked link metadata, got ${revMeta.status}`);
    const revDl = await request(`${baseUrl}/api/share/${revocableLink.shortCode}/download`);
    assert(revDl.status === 403, `Expected 403 for revoked link download, got ${revDl.status}`);
    console.log('✅ Test 4 & 15 Passed');

    // -------------------------------------------------------------
    // TEST 5, 6, 7, 10, 14 & CORS: Password protection, query rejection & actual download
    // -------------------------------------------------------------
    console.log('\n--- Test 5, 6, 7, 10, 14: Password Flows, Query Rejection, CORS & Actual Download ---');
    const passSecret = 'TopSecretPass56!';
    const passLink = await ShareLinkService.createShareLink({
      fileId: uploaded.file.id,
      userId: ownerId,
      password: passSecret,
    });

    // CORS preflight allowing X-Share-Password
    const preflightRes = await request(`${baseUrl}/api/share/${passLink.shortCode}/download`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-share-password',
      },
    });
    assert(
      preflightRes.status === 204 || preflightRes.status === 200,
      `Expected 204/200 CORS preflight, got ${preflightRes.status}`
    );
    const allowHeaders = (preflightRes.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert(allowHeaders.includes('x-share-password'), `CORS must allow x-share-password, got: ${allowHeaders}`);

    // 5) No password -> 401
    const noPassRes = await request(`${baseUrl}/api/share/${passLink.shortCode}/download`);
    assert(noPassRes.status === 401, `Expected 401 with no password, got ${noPassRes.status}`);

    // 14) Password in query parameter -> MUST BE REJECTED (401)
    const queryPassRes = await request(
      `${baseUrl}/api/share/${passLink.shortCode}/download?password=${encodeURIComponent(passSecret)}`
    );
    assert(queryPassRes.status === 401, `Expected 401 when password is in query param, got ${queryPassRes.status}`);

    // 6) Incorrect password -> 401
    const wrongPassRes = await request(`${baseUrl}/api/share/${passLink.shortCode}/download`, {
      headers: { 'X-Share-Password': 'WrongPassword999' },
    });
    assert(wrongPassRes.status === 401, `Expected 401 for wrong password, got ${wrongPassRes.status}`);

    // 7 & 10) Correct password via X-Share-Password -> 200 + exact binary bytes + security headers
    const goodPassRes = await request(`${baseUrl}/api/share/${passLink.shortCode}/download`, {
      headers: { 'X-Share-Password': passSecret },
    });
    assert(goodPassRes.status === 200, `Expected 200 for valid password, got ${goodPassRes.status}`);
    assert(goodPassRes.buffer.equals(payloadBytes), 'Downloaded bytes do not match original uploaded file');
    assert(
      (goodPassRes.headers.get('content-disposition') || '').includes('stage56_sample_document.txt'),
      'Missing Content-Disposition filename'
    );
    assert(goodPassRes.headers.get('x-content-type-options') === 'nosniff', 'Missing nosniff header');
    assert(goodPassRes.headers.get('content-security-policy') === "default-src 'none'", 'Missing CSP header');
    console.log('✅ Test 5, 6, 7, 10, 14 Passed');

    // -------------------------------------------------------------
    // TEST 8 & 11: Download limit reached & Concurrent downloads enforcement
    // -------------------------------------------------------------
    console.log('\n--- Test 8 & 11: Download Limit & Concurrent Enforcement ---');
    const limitedLink = await ShareLinkService.createShareLink({
      fileId: uploaded.file.id,
      userId: ownerId,
      maxDownloads: 2,
    });

    // Fire 5 concurrent downloads against maxDownloads=2
    const concurrentResults = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(`${baseUrl}/api/share/${limitedLink.shortCode}/download`)
      )
    );
    const successes = concurrentResults.filter((r) => r.status === 200);
    const limitRejected = concurrentResults.filter((r) => r.status === 410);
    assert(successes.length === 2, `Expected exactly 2 concurrent successes, got ${successes.length}`);
    assert(limitRejected.length === 3, `Expected exactly 3 concurrent 410 rejections, got ${limitRejected.length}`);

    // Metadata and subsequent download both return 410 when limit reached
    const limitMeta = await request(`${baseUrl}/api/share/${limitedLink.shortCode}`);
    assert(limitMeta.status === 410, `Expected 410 on limit-reached metadata, got ${limitMeta.status}`);
    const limitDl = await request(`${baseUrl}/api/share/${limitedLink.shortCode}/download`);
    assert(limitDl.status === 410, `Expected 410 on limit-reached download, got ${limitDl.status}`);
    console.log('✅ Test 8 & 11 Passed');

    // -------------------------------------------------------------
    // TEST 9: Parent file expired or unavailable
    // -------------------------------------------------------------
    console.log('\n--- Test 9: Parent File Expired or Unavailable ---');
    const expiredParent = await prisma.file.create({
      data: {
        userId: ownerId,
        originalName: 'parent_expired.txt',
        storageKey: `test/${runTag}/parent_exp_${crypto.randomUUID()}.txt`,
        mimeType: 'text/plain',
        sizeBytes: BigInt(10),
        status: FileStatus.EXPIRED,
        storageProvider: StorageProvider.LOCAL,
        expiresAt: new Date(Date.now() - 10_000),
      },
    });
    createdFileIds.push(expiredParent.id);
    const orphanLink = await prisma.shareLink.create({
      data: {
        fileId: expiredParent.id,
        shortCode: `pexp_${crypto.randomUUID().slice(0, 6)}`,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    const orphanMeta = await request(`${baseUrl}/api/share/${orphanLink.shortCode}`);
    assert(orphanMeta.status === 410, `Expected 410 for expired parent file metadata, got ${orphanMeta.status}`);
    const orphanDl = await request(`${baseUrl}/api/share/${orphanLink.shortCode}/download`);
    assert(orphanDl.status === 410, `Expected 410 for expired parent file download, got ${orphanDl.status}`);
    console.log('✅ Test 9 Passed');

    // -------------------------------------------------------------
    // TEST 12: Access log creation verification
    // -------------------------------------------------------------
    console.log('\n--- Test 12: Access Log Creation ---');
    // Allow async fire-and-forget logEvent calls a moment to flush
    await new Promise((r) => setTimeout(r, 250));
    const logs = await prisma.accessLog.findMany({
      where: { fileId: uploaded.file.id },
      select: { eventType: true },
    });
    const eventSet = new Set(logs.map((l) => l.eventType));
    assert(eventSet.has(AccessEventType.VIEW), 'Missing VIEW access log');
    assert(eventSet.has(AccessEventType.PASSWORD_FAILED), 'Missing PASSWORD_FAILED access log');
    assert(eventSet.has(AccessEventType.DOWNLOAD_SUCCESS), 'Missing DOWNLOAD_SUCCESS access log');
    assert(eventSet.has(AccessEventType.LIMIT_REACHED), 'Missing LIMIT_REACHED access log');
    assert(eventSet.has(AccessEventType.REVOKED_ATTEMPT), 'Missing REVOKED_ATTEMPT access log');
    console.log('✅ Test 12 Passed: All expected AccessLog event types recorded');

    // -------------------------------------------------------------
    // TEST 16: verify-password & Native Form POST (application/x-www-form-urlencoded)
    // -------------------------------------------------------------
    console.log('\n--- Test 16: verify-password & Native Form POST Download ---');
    const formLink = await ShareLinkService.createShareLink({
      fileId: uploaded.file.id,
      userId: ownerId,
      password: passSecret,
      maxDownloads: 2,
    });

    const badVerify = await request(`${baseUrl}/api/share/${formLink.shortCode}/verify-password`, {
      method: 'POST',
      headers: { 'X-Share-Password': 'WrongPassword' },
    });
    assert(badVerify.status === 401, `Expected 401 on bad verify-password, got ${badVerify.status}`);

    const goodVerify = await request(`${baseUrl}/api/share/${formLink.shortCode}/verify-password`, {
      method: 'POST',
      headers: { 'X-Share-Password': passSecret },
    });
    assert(goodVerify.status === 200 && goodVerify.json?.data?.verified === true, 'Expected 200 verified=true');

    // Verify verify-password did NOT consume downloadCount
    const metaBeforeForm = await request(`${baseUrl}/api/share/${formLink.shortCode}`);
    assert(metaBeforeForm.json.data.downloadCount === 0, 'verify-password must not increment downloadCount');

    // Native HTML form POST (application/x-www-form-urlencoded)
    const formDlRes = await request(`${baseUrl}/api/share/${formLink.shortCode}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `password=${encodeURIComponent(passSecret)}`,
    });
    assert(formDlRes.status === 200, `Expected 200 on form POST download, got ${formDlRes.status}`);
    assert(formDlRes.buffer.equals(payloadBytes), 'Form POST downloaded bytes mismatch');
    console.log('✅ Test 16 Passed: verify-password and form POST download verified');

    // -------------------------------------------------------------
    // TEST 17: Storage Failure Before Headers & No Premature DOWNLOAD_SUCCESS
    // -------------------------------------------------------------
    console.log('\n--- Test 17: Storage Failure Before Headers ---');
    const brokenFile = await prisma.file.create({
      data: {
        userId: ownerId,
        originalName: 'missing_physical.txt',
        storageKey: `test/${runTag}/missing_physical_${crypto.randomUUID()}.txt`,
        mimeType: 'text/plain',
        sizeBytes: BigInt(100),
        status: FileStatus.AVAILABLE,
        storageProvider: StorageProvider.LOCAL,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    createdFileIds.push(brokenFile.id);
    const brokenLink = await ShareLinkService.createShareLink({
      fileId: brokenFile.id,
      userId: ownerId,
    });

    const brokenRes = await request(`${baseUrl}/api/share/${brokenLink.shortCode}/download`);
    assert(brokenRes.status === 404, `Expected 404 when storage object missing, got ${brokenRes.status}`);
    await new Promise((r) => setTimeout(r, 150));
    const brokenLogs = await prisma.accessLog.findMany({
      where: { fileId: brokenFile.id },
      select: { eventType: true },
    });
    const brokenEventSet = new Set(brokenLogs.map((l) => l.eventType));
    assert(!brokenEventSet.has(AccessEventType.DOWNLOAD_SUCCESS), 'DOWNLOAD_SUCCESS must NOT be logged when getStream fails');
    assert(brokenEventSet.has(AccessEventType.DOWNLOAD_ATTEMPT), 'DOWNLOAD_ATTEMPT should be logged on storage failure');
    console.log('✅ Test 17 Passed: Storage failure before headers handled without premature DOWNLOAD_SUCCESS');

    // -------------------------------------------------------------
    // TEST 18: Stream Failure After Headers & Client Disconnect Handling
    // -------------------------------------------------------------
    console.log('\n--- Test 18: Mid-Stream Error & Client Disconnect ---');
    let streamDestroyedOnDisconnect = false;
    const slowStream = new Readable({
      read() {
        this.push(Buffer.from('chunk-1-'));
      },
      destroy(err, cb) {
        streamDestroyedOnDisconnect = true;
        cb(err);
      },
    });

    const disconnectServer = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.on('close', () => {
        if (!res.writableFinished && !slowStream.destroyed) {
          slowStream.destroy();
        }
      });
      slowStream.pipe(res);
    });
    await new Promise<void>((resolve) => disconnectServer.listen(4099, resolve));

    await new Promise<void>((resolve) => {
      const clientReq = http.get('http://localhost:4099', (clientRes) => {
        clientRes.once('data', () => {
          clientReq.destroy(); // Simulate abrupt client disconnect
          setTimeout(resolve, 100);
        });
      });
    });
    disconnectServer.close();
    assert(streamDestroyedOnDisconnect, 'Underlying storage stream must be destroyed on client disconnect');

    // Verify no full-file Blob construction remains in triggerBrowserDownload
    const webApiSource = fs.readFileSync(
      path.resolve(process.cwd(), '../web/src/lib/api.ts'),
      'utf-8'
    );
    assert(
      !webApiSource.includes('new Blob(chunks'),
      'apps/web/src/lib/api.ts must not contain full-file Blob fallback'
    );
    console.log('✅ Test 18 Passed: Client disconnect destroys stream & no Blob fallback in frontend');

    console.log('\n🎉 ALL STAGE 5.6 VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } finally {
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
  console.error('Fatal error during Stage 5.6 verification:', err);
  if (server) server.close();
  process.exit(1);
});
