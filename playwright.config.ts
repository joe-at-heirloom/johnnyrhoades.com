import { defineConfig, devices } from '@playwright/test';

/*
  End-to-end tests run against a production build made with a pinned date
  (SITE_NOW), on its own port, so results never depend on the real clock or
  on a dev server that happens to be running. Tests that need a different
  "now" in the browser set it with page.clock.
*/
export const SITE_NOW = '2026-10-01T12:00:00-04:00';
export const SITE_URL = 'http://127.0.0.1:4500';

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
  webServer: {
    command: 'npx astro build && npx astro preview --host 127.0.0.1 --port 4500 --ignore-lock',
    // Fake service IDs: tests intercept the requests (tests/e2e/forms.spec.ts).
    env: {
      SITE_NOW,
      // Fakes, so nothing reaches Formspree or Google. GA runs on the test host, against blocked or stubbed Google hosts.
      PUBLIC_FORMSPREE_BOOKING: 'test-booking',
      PUBLIC_FORMSPREE_SIGNUP: 'test-signup',
      PUBLIC_GA_ID: 'G-TEST',
      PUBLIC_GA_HOSTS: '127.0.0.1', // the test server's host (SITE_URL)
    },
    url: SITE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
