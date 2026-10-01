import type { Page } from '@playwright/test';

/** YouTube only loads after a click; block it so tests never depend on the network. */
export async function blockThirdParties(page: Page): Promise<void> {
  await page.route(/youtube(-nocookie)?\.com|ytimg\.com/, (route) => route.abort());
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
