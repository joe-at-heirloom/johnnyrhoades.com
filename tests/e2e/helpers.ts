import type { Page } from '@playwright/test';

/** Block third parties so tests never depend on the network: YouTube (after a click) and Google Analytics. */
export async function blockThirdParties(page: Page): Promise<void> {
  await page.route(/youtube(-nocookie)?\.com|ytimg\.com|googletagmanager\.com|google-analytics\.com/, (route) => route.abort());
}

/** Scroll through the page so lazy images and the strum load, then return to the top and settle. */
export async function loadEverything(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() =>
    [...document.images].every((img) => !img.getAttribute('src') || (img.complete && img.naturalWidth > 0)),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

/** Console errors, minus the ones caused by blockThirdParties(). */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/ERR_FAILED|ERR_BLOCKED/.test(msg.text())) return;
    errors.push(msg.text());
  });
  return errors;
}

/**
 * Records analytics events instead of sending them. It defines window.gtag before the page's own
 * scripts run, so the Google Analytics loader (src/scripts/analytics.ts) stands aside.
 */
export async function fakeAnalytics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { gtag: (...args: unknown[]) => void; __events: [string, unknown][] };
    w.__events = [];
    w.gtag = (command, name, params) => {
      if (command === 'event') w.__events.push([name as string, params]);
    };
  });
}

export const analyticsEvents = (page: Page) => page.evaluate(() => (window as unknown as { __events: [string, unknown][] }).__events);
