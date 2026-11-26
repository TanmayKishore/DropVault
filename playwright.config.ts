import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node e2e/start-e2e-api.mjs',
      url: 'http://localhost:4001/api/health',
      reuseExistingServer: false,
      timeout: 45_000,
    },
    {
      command: 'node e2e/start-e2e-web.mjs',
      url: 'http://localhost:3001',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
