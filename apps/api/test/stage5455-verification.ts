import http from 'http';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { AuthService } from '../src/services/auth.service.js';

const PORT = 4092;
const BASE_URL = `http://localhost:${PORT}/api`;

const logPass = (name: string) => console.log(`[PASS] ${name}`);
const logFail = (name: string, err: any) => {
  console.error(`[FAIL] ${name}`, err);
  process.exit(1);
};

async function runStage5455Verification() {
  console.log('=== Starting Stage 5.4 & 5.5 Dashboard & Share Management Integration Test ===');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    // 1. Create authenticated user
    const email = `dashboard-user-${Date.now()}@example.com`;
    const regResult = await AuthService.register({
      email,
      password: 'StrongPassword123!',
      name: 'Vault Tester',
    });
    const token = regResult.tokens.accessToken;
    const userId = regResult.user.id;
    logPass('1. Registered user and retrieved access token');

    // 2. Upload file as authenticated user
    const boundary = '----DropVaultBoundary' + Date.now();
    const fileContent = 'Sensitive document content for dashboard testing.';
    const bodyHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="confidential.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
    const bodyFooter = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="expiryDays"\r\n\r\n7\r\n--${boundary}--\r\n`;

    const fullBody = Buffer.concat([
      Buffer.from(bodyHeader, 'utf-8'),
      Buffer.from(fileContent, 'utf-8'),
      Buffer.from(bodyFooter, 'utf-8'),
    ]);

    const resUpload = await fetch(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(fullBody.length),
        Authorization: `Bearer ${token}`,
      },
      body: fullBody,
    });

    if (resUpload.status !== 201) {
      throw new Error(`Upload failed with status ${resUpload.status}`);
    }
    const uploadJson = await resUpload.json();
    const fileId = uploadJson.data.file.id;
    const defaultShortCode = uploadJson.data.shareLink.shortCode;
    logPass('2. Authenticated file upload succeeded');

    // 3. Retrieve file metadata as owner
    const resMeta = await fetch(`${BASE_URL}/files/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resMeta.status !== 200) {
      throw new Error(`File metadata fetch failed with status ${resMeta.status}`);
    }
    const metaJson = await resMeta.json();
    if (metaJson.data.originalName !== 'confidential.pdf' || metaJson.data.status !== 'AVAILABLE') {
      throw new Error('Unexpected metadata values');
    }
    if (!metaJson.data.shareLinks || metaJson.data.shareLinks.length < 1) {
      throw new Error('Associated share links not included in file metadata');
    }
    logPass('3. Owner retrieved file metadata with associated share links');

    // 4. Download file as owner
    const resDownload = await fetch(`${BASE_URL}/files/${fileId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resDownload.status !== 200) {
      throw new Error(`Owner download failed with status ${resDownload.status}`);
    }
    const downloadedText = await resDownload.text();
    if (downloadedText !== fileContent) {
      throw new Error('Downloaded content does not match original file');
    }
    logPass('4. Owner streaming download verified');

    // 5. Create a new configured share link (password + download limit)
    const resCreateShare = await fetch(`${BASE_URL}/files/${fileId}/share-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        password: 'PasscodeForLink123',
        maxDownloads: 3,
      }),
    });
    if (resCreateShare.status !== 201) {
      throw new Error(`Create share link failed with status ${resCreateShare.status}`);
    }
    const shareJson = await resCreateShare.json();
    const newShareLinkId = shareJson.data.id;
    const newShortCode = shareJson.data.shortCode;
    if (!shareJson.data.hasPassword || shareJson.data.maxDownloads !== 3) {
      throw new Error('Share link configuration mismatch');
    }
    logPass('5. Created configured share link (password protected, maxDownloads = 3)');

    // 6. Unauthorized user cannot access file metadata
    const otherUser = await AuthService.register({
      email: `other-user-${Date.now()}@example.com`,
      password: 'StrongPassword123!',
    });
    const resUnauthorized = await fetch(`${BASE_URL}/files/${fileId}`, {
      headers: { Authorization: `Bearer ${otherUser.tokens.accessToken}` },
    });
    if (resUnauthorized.status !== 403) {
      throw new Error(`Expected 403 for other user, got ${resUnauthorized.status}`);
    }
    logPass('6. Cross-user authorization check strictly enforced (HTTP 403)');

    // 7. Revoke share link
    const resRevoke = await fetch(`${BASE_URL}/files/${fileId}/share-links/${newShareLinkId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resRevoke.status !== 200) {
      throw new Error(`Revoke share link failed with status ${resRevoke.status}`);
    }
    const revokeJson = await resRevoke.json();
    if (!revokeJson.data.isRevoked) {
      throw new Error('Share link not marked isRevoked');
    }
    logPass('7. Revoked share link successfully');

    // 8. Revoking share link does NOT delete underlying file
    const resMetaAfterRevoke = await fetch(`${BASE_URL}/files/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resMetaAfterRevoke.status !== 200) {
      throw new Error('Underlying file was deleted after share link revocation!');
    }
    logPass('8. Underlying file remains AVAILABLE after share link revocation');

    // 9. Delete file as owner
    const resDelete = await fetch(`${BASE_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resDelete.status !== 200) {
      throw new Error(`File deletion failed with status ${resDelete.status}`);
    }
    logPass('9. Owner file deletion succeeded');

    // 10. Verify deleted file status
    const dbFile = await prisma.file.findUnique({ where: { id: fileId } });
    if (!dbFile || dbFile.status !== 'DELETED') {
      throw new Error(`Expected DELETED status in DB, found ${dbFile?.status}`);
    }
    logPass('10. File status updated to DELETED in database');

    console.log('=== ALL STAGE 5.4 & 5.5 INTEGRATION CHECKS PASSED ===');
  } catch (err) {
    logFail('Stage 5.4 & 5.5 verification failed', err);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

void runStage5455Verification();
