/*
  Phase 6: the security headers don't break anything. Every page from the test
  server is served with the headers in the build's own dist/_headers, the file
  Cloudflare Workers serves them from (ADR 0027), then each interactive part is
  used, and any violation or console error fails.
*/
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { headersFor, inlineHashes, parseHeadersFile } from '../../src/lib/edge';
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
    const fromFile = headersFor(new URL(request.url()).pathname, parseHeadersFile(readFileSync('dist/_headers', 'utf8')));
    // The file must carry the policy this module defines, plus the hashes of the inline stylesheet and
    // speculation rules (ADR 0028, ADR 0029); then serve exactly what it says. A wrong hash would leave
    // the page unstyled or the rules ignored, with a violation, and fail the checks below.
    expect(fromFile['Content-Security-Policy']).toMatch(/style-src 'self' 'sha256-[A-Za-z0-9+/]+=*'/);
    expect(fromFile['Content-Security-Policy']).toMatch(/script-src 'self' \S+ 'sha256-[A-Za-z0-9+/]+=*'/);
    expect(fromFile['Content-Security-Policy']!.replace(/ 'sha256-[^']+'/g, '')).toBe(CSP);
    expect(fromFile['Permissions-Policy']).toBe(PERMISSIONS_POLICY);
    await route.fulfill({ response, headers: { ...response.headers(), ...Object.fromEntries(Object.entries(fromFile).map(([k, v]) => [k.toLowerCase(), v])) } });
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
  const neck = (await page.locator('[data-neck]').boundingBox())!;
  await page.mouse.click(neck.x + neck.width / 2, neck.y + neck.height * 0.17); // pluck the top string, with sound (on by default)

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
  // The served policy, with the inline stylesheet's hash in it (ADR 0028).
  const csp = headersFor('/', parseHeadersFile(readFileSync('dist/_headers', 'utf8')))['Content-Security-Policy']!;
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
      const rules = /type="speculationrules"/.test(attrs); // allowed by hash, checked below
      if (!dataBlock && !rules && body.trim()) problems.push(`${file}: inline script`);
    }
    const hashes = inlineHashes([html]);
    for (const hash of hashes.style) if (!csp.includes(`'sha256-${hash}'`)) problems.push(`${file}: a <style> the CSP doesn't allow`);
    for (const hash of hashes.script) if (!csp.includes(`'sha256-${hash}'`)) problems.push(`${file}: speculation rules the CSP doesn't allow`);
    if (/\sstyle="/.test(html)) problems.push(`${file}: style attribute`);
    if (/\son[a-z]+="/.test(html)) problems.push(`${file}: inline event handler`);
  }
  expect(problems).toEqual([]);
});

test('hovering a link prefetches the page, so the click lands from the prefetch (ADR 0029)', async ({ page }) => {
  await serveWithHeaders(page);
  await page.goto('/');
  const link = page.locator('a[href="/epk/"]').first();
  await link.scrollIntoViewIfNeeded();
  await link.hover();
  // "moderate" eagerness starts after a short hover; give the prefetch time to finish.
  await page.waitForTimeout(1500);
  await link.click();
  await page.waitForURL('**/epk/');
  const delivery = await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming & { deliveryType?: string }).deliveryType);
  expect(delivery).toBe('navigational-prefetch');
});
