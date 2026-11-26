import http from 'http';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { AuthService } from '../src/services/auth.service.js';

const PORT = 4094;
const BASE_URL = `http://localhost:${PORT}/api`;

const logPass = (name: string) => console.log(`[PASS] ${name}`);
const logFail = (name: string, err: any) => {
  console.error(`[FAIL] ${name}`, err);
  process.exit(1);
};

async function runStage52Verification() {
  console.log('=== Starting Stage 5.2 Upload Engine End-to-End Verification ===');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    // 1. Anonymous upload below 1 GiB
    const boundary = '----DropVaultBoundary' + Date.now();
    const testContent = 'Hello DropVault! Testing anonymous upload stream.';
    const postBodyHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test-doc.txt"\r\nContent-Type: text/plain\r\n\r\n`;
    const postBodyFooter = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="expiryDays"\r\n\r\n7\r\n--${boundary}--\r\n`;

    const fullBody = Buffer.concat([
      Buffer.from(postBodyHeader, 'utf-8'),
      Buffer.from(testContent, 'utf-8'),
      Buffer.from(postBodyFooter, 'utf-8'),
    ]);

    const resAnon = await fetch(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(fullBody.length),
      },
      body: fullBody,
    });

    if (resAnon.status !== 201) {
      throw new Error(`Anonymous upload failed with status ${resAnon.status}`);
    }
    const anonData = await resAnon.json();
    if (!anonData.data?.managementToken) {
      throw new Error('Anonymous upload did not return management token');
    }
    if (!anonData.data?.shareLink?.shortCode) {
      throw new Error('Anonymous upload did not return shareLink shortCode');
    }
    logPass('1. Anonymous upload below 1 GiB returns 201, managementToken, and shareLink');

    // 2. Public share link metadata retrieval
    const shortCode = anonData.data.shareLink.shortCode;
    const resMeta = await fetch(`${BASE_URL}/share/${shortCode}`);
    if (resMeta.status !== 200) {
      throw new Error(`Failed to fetch public metadata with status ${resMeta.status}`);
    }
    const metaJson = await resMeta.json();
    if (metaJson.data.originalName !== 'test-doc.txt') {
      throw new Error(`Mismatched originalName: ${metaJson.data.originalName}`);
    }
    logPass('2. Public share link metadata accessible at /api/share/:shortCode');

    // 3. Create configured share link with password & max downloads using management token
    const resConfigLink = await fetch(`${BASE_URL}/files/${anonData.data.file.id}/share-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Management-Token': anonData.data.managementToken,
      },
      body: JSON.stringify({
        password: 'PasscodeForDownload123',
        maxDownloads: 5,
      }),
    });
    if (resConfigLink.status !== 201) {
      throw new Error(`Configured share link creation failed with status ${resConfigLink.status}`);
    }
    const configData = await resConfigLink.json();
    if (!configData.data.hasPassword || configData.data.maxDownloads !== 5) {
      throw new Error('Configured share link properties not set correctly');
    }
    logPass('3. Management token allows attaching password-protected share link with download limit');

    // 4. Authenticated upload flow
    const testUserEmail = `uploader-${Date.now()}@example.com`;
    const regResult = await AuthService.register({
      email: testUserEmail,
      password: 'SecurePassword123!',
      name: 'Uploader Test',
    });

    const resAuthUpload = await fetch(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(fullBody.length),
        Authorization: `Bearer ${regResult.tokens.accessToken}`,
      },
      body: fullBody,
    });
    if (resAuthUpload.status !== 201) {
      throw new Error(`Authenticated upload failed with status ${resAuthUpload.status}`);
    }
    const authData = await resAuthUpload.json();
    if (authData.data.managementToken) {
      throw new Error('Authenticated upload should NOT return management token (managed via user account)');
    }
    logPass('4. Authenticated upload returns 201 without managementToken');

    console.log('=== ALL STAGE 5.2 END-TO-END VERIFICATION CHECKS PASSED ===');
  } catch (err) {
    logFail('Stage 5.2 verification failed', err);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

void runStage52Verification();
