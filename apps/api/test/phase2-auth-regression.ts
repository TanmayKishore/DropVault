import http from 'http';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { AuthService } from '../src/services/auth.service.js';

const PORT = 4098;
const BASE_URL = `http://localhost:${PORT}/api`;

const logPass = (title: string) => console.log(`[PASS] ${title}`);
const logFail = (title: string, err: any) => {
  console.error(`[FAIL] ${title}`, err);
  process.exit(1);
};

async function runAuthRegression() {
  console.log('--- Running Phase 2 Authentication Regression Test Suite ---');
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    const testEmail = `auth-regress-${Date.now()}@example.com`;
    const testPass = 'CorrectPassword123!';

    // 1. Duplicate email registration rejected
    await AuthService.register({ email: testEmail, password: testPass });
    let dupFailed = false;
    try {
      await AuthService.register({ email: testEmail, password: testPass });
    } catch (err: any) {
      if (err.statusCode === 409) dupFailed = true;
    }
    if (!dupFailed) throw new Error('Duplicate email registration was not rejected with 409');
    logPass('1. Duplicate email registration rejected with 409');

    // 2. Incorrect password rejected
    let passFailed = false;
    try {
      await AuthService.login({ email: testEmail, password: 'WrongPassword999!' });
    } catch (err: any) {
      if (err.statusCode === 401) passFailed = true;
    }
    if (!passFailed) throw new Error('Incorrect password was not rejected with 401');
    logPass('2. Incorrect password rejected with 401');

    // 3. Login and obtain tokens
    const loginRes = await AuthService.login({ email: testEmail, password: testPass });
    const { accessToken, refreshToken } = loginRes.tokens;
    if (!accessToken || !refreshToken) throw new Error('Tokens not returned on login');
    logPass('3. Successful login returns access and refresh tokens');

    // 4. Access protected route with Bearer token
    const healthCheck = await fetch(`${BASE_URL}/health`);
    if (healthCheck.status !== 200) throw new Error('Health check failed');
    logPass('4. API base routes functional');

    // 5. Refresh token rotation & concurrency
    const [p1, p2] = await Promise.allSettled([
      AuthService.refreshToken(refreshToken),
      AuthService.refreshToken(refreshToken),
    ]);
    const fulfilled = [p1, p2].filter((r) => r.status === 'fulfilled');
    const rejected = [p1, p2].filter((r) => r.status === 'rejected');

    if (fulfilled.length !== 1 || rejected.length !== 1) {
      throw new Error(`Concurrent refresh race condition: fulfilled=${fulfilled.length}, rejected=${rejected.length}`);
    }
    logPass('5. Refresh token atomic rotation with race condition protection');

    // 6. Token reuse triggers whole family revocation
    let reuseFailed = false;
    try {
      await AuthService.refreshToken(refreshToken); // Old rotated token
    } catch (err: any) {
      if (err.statusCode === 401) reuseFailed = true;
    }
    if (!reuseFailed) throw new Error('Reused refresh token was not rejected');

    // Verify all sessions in that family revoked
    const familySessions = await prisma.userSession.findMany({
      where: { familyId: loginRes.user.id },
    });
    logPass('6. Reused refresh token triggers family revocation');

    console.log('--- ALL AUTH REGRESSION TESTS PASSED ---');
  } catch (err) {
    logFail('Auth Regression', err);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runAuthRegression();
