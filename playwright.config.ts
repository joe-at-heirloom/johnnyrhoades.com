import { defineConfig, devices } from '@playwright/test';

/*
  End-to-end tests run against the production build (`astro preview`).
  The parity suite also serves reference/v1/ so the port can be compared
  pixel for pixel with the original prototype.
*/
export const SITE_URL = 'http://127.0.0.1:4321';
export const V1_URL = 'http://127.0.0.1:4322';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: SITE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx astro preview --host 127.0.0.1 --port 4321 --ignore-lock',
      url: SITE_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node scripts/serve-static.mjs reference/v1 4322',
      url: V1_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
