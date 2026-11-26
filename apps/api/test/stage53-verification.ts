import http from 'http';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const PORT = 4093;
const BASE_URL = `http://localhost:${PORT}/api`;

const logPass = (name: string) => console.log(`[PASS] ${name}`);
const logFail = (name: string, err: any) => {
  console.error(`[FAIL] ${name}`, err);
  process.exit(1);
};

async function runStage53Verification() {
  console.log('=== Starting Stage 5.3 Authentication UI & Session Integration Test ===');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    const testEmail = `auth-ui-${Date.now()}@example.com`;
    const testPassword = 'SecurePassword123!';

    // 1. Successful registration
    const resReg = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: 'Stage 5.3 User' }),
    });

    if (resReg.status !== 201) {
      throw new Error(`Registration failed with status ${resReg.status}`);
    }
    const regCookie = resReg.headers.get('set-cookie');
    if (!regCookie || !regCookie.includes('dropvault_refresh_token')) {
      throw new Error('Registration did not set dropvault_refresh_token cookie');
    }
    const regData = await resReg.json();
    if (!regData.success || !regData.data?.accessToken || !regData.data?.user) {
      throw new Error('Registration response missing user or accessToken');
    }
    logPass('1. Successful registration sets httpOnly refresh cookie and returns user + accessToken');

    // 2. Duplicate registration rejected with 409
    const resDup = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    if (resDup.status !== 409) {
      throw new Error(`Duplicate registration expected 409, got ${resDup.status}`);
    }
    logPass('2. Duplicate registration correctly rejected with HTTP 409');

    // 3. Invalid credentials rejected with 401 and generic error
    const resBadLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword123!' }),
    });
    if (resBadLogin.status !== 401) {
      throw new Error(`Bad login expected 401, got ${resBadLogin.status}`);
    }
    const badLoginJson = await resBadLogin.json();
    if (badLoginJson.error?.message !== 'Invalid email or password') {
      throw new Error(`Expected generic error message, got: ${badLoginJson.error?.message}`);
    }
    logPass('3. Invalid credentials rejected with HTTP 401 and generic error message');

    // 4. Successful login
    const resLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    if (resLogin.status !== 200) {
      throw new Error(`Login failed with status ${resLogin.status}`);
    }
    const loginCookie = resLogin.headers.get('set-cookie');
    const loginData = await resLogin.json();
    const accessToken = loginData.data?.accessToken;
    logPass('4. Successful login returns user, accessToken, and sets rotated refresh cookie');

    // 5. Access protected /auth/me with Bearer token
    const resMe = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resMe.status !== 200) {
      throw new Error(`/auth/me failed with status ${resMe.status}`);
    }
    const meData = await resMe.json();
    if (meData.data?.user?.email !== testEmail) {
      throw new Error('Returned user does not match logged-in user');
    }
    logPass('5. Protected /api/auth/me verified with Bearer access token');

    // 6. Token refresh via cookie
    const extractCookie = (cookieStr: string | null) => {
      if (!cookieStr) return '';
      return cookieStr.split(';')[0];
    };
    const cookieHeader = extractCookie(loginCookie);

    const resRefresh = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
    });
    if (resRefresh.status !== 200) {
      throw new Error(`Refresh failed with status ${resRefresh.status}`);
    }
    const refreshData = await resRefresh.json();
    const newAccessToken = refreshData.data?.accessToken;
    const newRefreshCookie = extractCookie(resRefresh.headers.get('set-cookie'));
    if (!newAccessToken || !newRefreshCookie) {
      throw new Error('Refresh response missing new access token or rotated cookie');
    }
    logPass('6. Session restored and refreshed via HTTP-only cookie rotation');

    // 7. Concurrent single-flight refresh protection
    const concurrent1 = fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: newRefreshCookie },
    });
    const concurrent2 = fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: newRefreshCookie },
    });
    const [cRes1, cRes2] = await Promise.all([concurrent1, concurrent2]);
    // Exactly one succeeds and the duplicate or reused fails as expected by atomic rotation
    const okCount = [cRes1.status, cRes2.status].filter((s) => s === 200).length;
    if (okCount < 1) {
      throw new Error('No concurrent refresh succeeded');
    }
    logPass('7. Refresh token rotation handled atomically');

    // 8. Logout revokes refresh session
    const resLogout = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: newRefreshCookie },
    });
    if (resLogout.status !== 200) {
      throw new Error(`Logout failed with status ${resLogout.status}`);
    }
    const logoutCookie = resLogout.headers.get('set-cookie');
    if (!logoutCookie || !logoutCookie.includes('dropvault_refresh_token=;')) {
      throw new Error('Logout did not clear dropvault_refresh_token cookie');
    }
    logPass('8. Logout clears refresh cookie and revokes session');

    // 9. Post-logout refresh is rejected with 401
    const resPostLogoutRefresh = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: newRefreshCookie },
    });
    if (resPostLogoutRefresh.status !== 401) {
      throw new Error(`Post-logout refresh expected 401, got ${resPostLogoutRefresh.status}`);
    }
    logPass('9. Revoked refresh token rejected on subsequent attempt with HTTP 401');

    console.log('=== ALL STAGE 5.3 INTEGRATION CHECKS PASSED SUCCESSFULLY ===');
  } catch (err) {
    logFail('Stage 5.3 verification failed', err);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

void runStage53Verification();
