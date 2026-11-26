import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'playwright-report', 'screenshots');

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe('DropVault End-to-End Browser Verification', () => {
  test('Workflow 1 & 5a: Landing page, anonymous upload, public share & native download', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Share files\./i })).toBeVisible();

    const payload = `DropVault E2E Anonymous Payload ${Date.now()}`;
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'e2e_anon_test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(payload, 'utf-8'),
    });

    await expect(page.getByText('e2e_anon_test.txt')).toBeVisible();

    // Start upload
    await page.getByRole('button', { name: /Upload/i }).click();

    // Wait for upload success and share link
    await expect(page.getByText(/Upload Complete|Ready to Share/i)).toBeVisible({ timeout: 20_000 });
    const shareInput = page.locator('input[readonly]').first();
    const shareUrl = await shareInput.inputValue();
    expect(shareUrl).toContain('/share/');

    // Open generated public share page
    await page.goto(shareUrl);
    await expect(page.getByText('e2e_anon_test.txt')).toBeVisible();

    // Trigger native browser-managed download and verify contents
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download File/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('e2e_anon_test.txt');

    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    const downloadedContent = fs.readFileSync(downloadedPath!, 'utf-8');
    expect(downloadedContent).toBe(payload);

    expect(pageErrors).toEqual([]);
  });

  test('Workflow 2, 3, 4 & 5b: Auth, Dashboard, Files, Share Links & Password Form POST Download', async ({ page }) => {
    const uniqueEmail = `e2e_user_${Date.now()}@example.com`;
    const password = 'StrongPassword123!';

    // 1. Register new user
    await page.goto('/register');
    await page.getByLabel(/Full Name/i).fill('E2E Test User');
    await page.getByLabel(/Email address/i).fill(uniqueEmail);
    await page.getByLabel(/^Password$/i).fill(password);
    await page.getByLabel(/Confirm Password/i).fill(password);
    await page.getByRole('button', { name: /Create Account/i }).click();

    await page.waitForURL('/');
    await expect(page.getByText(uniqueEmail)).toBeVisible();

    // 2. Duplicate registration check
    await page.getByRole('button', { name: /Sign out/i }).click();
    await page.goto('/register');
    await page.getByLabel(/Email address/i).fill(uniqueEmail);
    await page.getByLabel(/^Password$/i).fill(password);
    await page.getByLabel(/Confirm Password/i).fill(password);
    await page.getByRole('button', { name: /Create Account/i }).click();
    await expect(page.getByText(/already exists|already registered|409/i)).toBeVisible();

    // 3. Login
    await page.goto('/login');
    await page.getByLabel(/Email address/i).fill(uniqueEmail);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL('/');
    await expect(page.getByText(uniqueEmail)).toBeVisible();

    // 4. Upload a file while authenticated
    const authPayload = `DropVault E2E Auth Payload ${Date.now()}`;
    await page.locator('input[type="file"]').setInputFiles({
      name: 'e2e_auth_file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(authPayload, 'utf-8'),
    });
    await page.getByRole('button', { name: /Upload/i }).click();
    await expect(page.getByText(/Upload Complete|Ready to Share/i)).toBeVisible({ timeout: 20_000 });

    // 5. Navigate to /dashboard & verify session restoration on reload
    await page.goto('/dashboard');
    await expect(page.getByText(/Welcome back/i)).toBeVisible();
    await expect(page.getByText('e2e_auth_file.txt')).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Welcome back/i)).toBeVisible();
    await expect(page.getByText('e2e_auth_file.txt')).toBeVisible();

    // 6. Navigate to /dashboard/files, test search & status filter
    await page.goto('/dashboard/files');
    await expect(page.getByText('e2e_auth_file.txt')).toBeVisible();
    await page.getByPlaceholder(/Search files by name/i).fill('e2e_auth_file');
    await page.getByRole('button', { name: /^Search$/i }).click();
    await expect(page.getByText('e2e_auth_file.txt')).toBeVisible();

    // 7. Create a password-protected share link from My Files
    await page.getByTitle('Create share link').first().click();
    await expect(page.getByText(/Create New Share Link/i)).toBeVisible();
    const sharePass = 'SharePass571!';
    await page.getByPlaceholder(/At least 6 characters/i).fill(sharePass);
    await page.getByRole('button', { name: /Create Link/i }).click();
    await expect(page.getByText(/Share link created successfully/i)).toBeVisible();

    const modalShareInput = page.locator('input[readonly]').first();
    const protectedShareUrl = await modalShareInput.inputValue();
    await page.getByRole('button', { name: /Done/i }).click();

    // 8. Navigate to /dashboard/shares and verify link appears
    await page.goto('/dashboard/shares');
    await expect(page.getByText('e2e_auth_file.txt').first()).toBeVisible();

    // 9. Open password-protected share page: test wrong password then correct password (form POST)
    await page.goto(protectedShareUrl);
    await expect(page.getByText(/Password Protected/i)).toBeVisible();
    await page.getByPlaceholder(/Enter share passcode/i).fill('WrongPass123');
    await page.getByRole('button', { name: /Download File/i }).click();
    await expect(page.getByText(/Incorrect password/i)).toBeVisible();

    // Correct password -> native form POST download
    await page.getByPlaceholder(/Enter share passcode/i).fill(sharePass);
    const dlPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download File/i }).click();
    const dl = await dlPromise;
    expect(dl.suggestedFilename()).toBe('e2e_auth_file.txt');
    const dlContent = fs.readFileSync((await dl.path())!, 'utf-8');
    expect(dlContent).toBe(authPayload);

    // 10. Revoke link in /dashboard/shares and verify revoked state
    await page.goto('/dashboard/shares');
    await page.getByTitle('Revoke link').first().click();
    await page.getByRole('button', { name: /Yes, Revoke Link/i }).click();
    await expect(page.getByText('REVOKED').first()).toBeVisible();

    await page.goto(protectedShareUrl);
    await expect(page.getByText(/Share Link Revoked/i)).toBeVisible();

    // 11. Logout & verify protected route redirects to /login
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Sign out/i }).click();
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
  });

  test('Workflow 5c: Nonexistent public share link renders clean 404 state', async ({ page }) => {
    await page.goto('/share/nonexistent-e2e-code-571');
    await expect(page.getByText(/Share Link Not Found/i)).toBeVisible();
  });

  test('Phase E: Responsive layout & overflow verification (Desktop, Tablet, Mobile)', async ({ page }) => {
    const viewports = [
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 812 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Share files\./i })).toBeVisible();
      const homeOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(homeOverflow, `Horizontal overflow on / at ${vp.name}`).toBe(false);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `home-${vp.name}.png`),
        fullPage: false,
      });

      await page.goto('/login');
      const loginOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(loginOverflow, `Horizontal overflow on /login at ${vp.name}`).toBe(false);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `login-${vp.name}.png`),
        fullPage: false,
      });
    }
  });
});
