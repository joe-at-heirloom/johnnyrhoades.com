/*
  Phase 6: the draft security headers (src/lib/security-headers.ts) don't
  break anything. Every page from the test server is served with the exact
  Content-Security-Policy and Permissions-Policy Cloudflare will add, then
  each interactive part is used, and any violation or console error fails.
*/
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { CSP, PERMISSIONS_POLICY } from '../../src/lib/security-headers';
import { SITE_URL } from '../../playwright.config';
import { blockThirdParties, collectConsoleErrors, loadEverything } from './helpers';

async function serveWithHeaders(page: Page) {
  await blockThirdParties(page);
  // A stand-in for gtag.js that sends a hit the way the real one can: a fetch to a regional host, and a pixel.
  let analyticsLoaded = false;
  await page.route(/googletagmanager\.com\/gtag\/js/, (route) => {
    analyticsLoaded = true;
    return route.fulfill({
      contentType: 'text/javascript',
      body: "fetch('https://region1.google-analytics.com/g/collect?v=2',{method:'POST',body:''}).catch(()=>{});new Image().src='https://www.google-analytics.com/g/collect?v=2';",
    });
  });
  await page.route(/google-analytics\.com/, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(/formspree\.io/, (route) => route.fulfill({ json: { ok: true } }));
  // Song clips: a valid empty WAV, so the request gets as far as the media-src check and past it.
  await page.route(/audio-ssl\.itunes\.apple\.com/, (route) =>
    route.fulfill({ contentType: 'audio/wav', body: Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', 'base64') }),
  );
  // Registered last, so it runs first: add the headers to the site's own pages.
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() !== 'document' || !request.url().startsWith(SITE_URL)) return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': CSP, 'permissions-policy': PERMISSIONS_POLICY } });
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__violations.push(`${e.violatedDirective}: ${e.blockedURI}`));
  });
  return { analyticsLoaded: () => analyticsLoaded };
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

test('the home page works under the policy: video, strum, lightbox, forms, analytics', async ({ page }) => {
  const served = await serveWithHeaders(page);
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await loadEverything(page);

  await page.locator('[data-video="Xvm2uMDesXU"]').click();
  await expect(page.locator('[data-video-frame] iframe')).toHaveAttribute('src', /youtube-nocookie\.com/);

  await page.locator('[data-neck]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-neck] path.neck-string')).toHaveCount(6);
  await page.getByRole('switch', { name: 'Sound' }).click();

  await page.getByRole('button', { name: 'Play a clip of Two Way Street' }).click();

  await page.locator('[data-gallery] button').first().click();
  await expect(page.locator('[data-lightbox]')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.fill('#b-name', 'Pat Booker');
  await page.fill('#b-email', 'pat@example.com');
  await page.getByRole('button', { name: 'Send booking request' }).click();
  await expect(page.locator('#book [data-form-status]')).toHaveText(/Thanks/);
  await page.fill('#l-email', 'fan@example.com');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.locator('#list [data-form-status]')).toHaveText(/Thanks/);
  await expect.poll(served.analyticsLoaded).toBe(true); // gtag.js arrives once the page is idle

  await page.waitForTimeout(300);
  expect(await violations(page)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const path of ['/shows/', '/shows/2026-10-23-blue-goose-inn-st-clair-shores/', '/epk/', '/thanks/', '/404.html']) {
  test(`${path} works under the policy`, async ({ page }) => {
    await serveWithHeaders(page);
    const errors = collectConsoleErrors(page);
    await page.goto(path);
    await loadEverything(page);
    expect(await violations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('no built page has an inline script or style the policy would block', () => {
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html')) pages.push(path);
    }
  };
  walk('dist');
  expect(pages.length).toBeGreaterThan(10);
  const problems: string[] = [];
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    for (const [, attrs = '', body = ''] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      const dataBlock = /type="application\/(ld\+)?json"/.test(attrs);
      if (!dataBlock && body.trim()) problems.push(`${file}: inline script`);
    }
    if (/<style[\s>]/.test(html)) problems.push(`${file}: <style> element`);
    if (/\sstyle="/.test(html)) problems.push(`${file}: style attribute`);
    if (/\son[a-z]+="/.test(html)) problems.push(`${file}: inline event handler`);
  }
  expect(problems).toEqual([]);
});
