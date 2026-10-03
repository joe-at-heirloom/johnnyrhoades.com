import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { blockThirdParties, collectConsoleErrors, loadEverything } from './helpers';

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

test('home renders with no console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await loadEverything(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Johnny Rhoades' })).toBeAttached();
  for (const name of ['Shows', 'Waiting on the Sun', 'Videos', 'Why I Sing the Blues', 'Photos', 'Booking', 'Mailing list']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('home has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await loadEverything(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
});

test('self-hosts fonts: no requests to Google Fonts', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) external.push(req.url());
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(external).toEqual([]);
  expect(await page.evaluate(() => document.fonts.check('900 16px Archivo'))).toBe(true);
});

test('mobile menu opens, and closes when a link is chosen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Menu' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Videos' }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('video stage loads YouTube only after a click', async ({ page }) => {
  await page.goto('/');
  const frame = page.locator('[data-video-frame]');
  await expect(frame.locator('iframe')).toHaveCount(0);
  await page.locator('[data-video="Xvm2uMDesXU"]').click();
  await expect(frame.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/Xvm2uMDesXU/);
  await expect(page.locator('[data-video="Xvm2uMDesXU"]')).toHaveAttribute('aria-current', 'true');
});

test('lightbox opens, steps through photos and returns focus', async ({ page }) => {
  await page.goto('/');
  const thumbs = page.locator('[data-gallery] button');
  await thumbs.nth(1).click();
  const dialog = page.locator('[data-lightbox]');
  await expect(dialog).toBeVisible();
  const img = dialog.locator('[data-lb-img]');
  const first = await img.getAttribute('src');
  await page.keyboard.press('ArrowRight');
  await expect(img).not.toHaveAttribute('src', first ?? '');
  await expect(img).toHaveAttribute('alt', /outdoor festival/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(thumbs.nth(2)).toBeFocused();
});

test('strum code is not in the initial page; it loads and draws six strings near the viewport', async ({ page }) => {
  const response = await page.goto('/');
  expect(await response?.text()).not.toMatch(/strum\.[\w-]+\.js/);
  const neck = page.locator('[data-neck]');
  await neck.scrollIntoViewIfNeeded();
  await expect(neck.locator('path.neck-string')).toHaveCount(6);
  const speaker = page.getByRole('switch', { name: 'Sound' });
  await expect(speaker).toHaveAttribute('aria-checked', 'false');
  await speaker.click();
  await expect(speaker).toHaveAttribute('aria-checked', 'true');
  await speaker.click();
  await expect(speaker).toHaveAttribute('aria-checked', 'false');
});

test('each strum plays the next bar of a 12-bar blues in E, and a held string bends', async ({ page }) => {
  await page.clock.install(); // the sweep, the reset and the bend hold all run on timers
  await page.goto('/');
  const neck = page.locator('[data-neck]');
  await neck.scrollIntoViewIfNeeded();
  const strings = neck.locator('path.neck-string');
  await expect(strings).toHaveCount(6);
  const chord = page.locator('[data-chord]');
  await expect(chord).toBeHidden(); // nothing to say until you play

  await neck.focus();
  const seen: string[] = [];
  for (let k = 0; k < 4; k++) {
    await page.keyboard.press('Enter');
    await page.clock.runFor(400);
    seen.push((await chord.textContent()) ?? '');
  }
  expect(seen).toEqual(['E7', 'E7', 'E7', 'A7']); // the chord you'll play next: four bars of E, then A
  await page.clock.runFor(8000);
  await expect(chord).toHaveText('E7'); // eight quiet seconds start it over

  const kinked = /^M0 [\d.]+ L[\d.]+ [\d.]+ L/; // pushed by a fingertip
  await page.keyboard.down('ArrowUp');
  await expect(strings.nth(4)).toHaveAttribute('d', kinked);
  await page.keyboard.up('ArrowUp');
  await expect(strings.nth(4)).not.toHaveAttribute('d', kinked);

  const box = (await neck.boundingBox())!;
  const y = Number((await strings.nth(2).getAttribute('d'))!.split(' ')[1]);
  await page.mouse.move(box.x + 200, box.y + y);
  await page.mouse.down();
  await page.clock.runFor(150); // held long enough to bend rather than strum
  await page.mouse.move(box.x + 205, box.y + y + 12);
  await expect(strings.nth(2)).toHaveAttribute('d', kinked);
  await page.mouse.up();
  await expect(strings.nth(2)).not.toHaveAttribute('d', kinked);
  await expect(chord).toHaveText('E7'); // picking and bending one string doesn't move the bar on
});

test('booking form validates required fields before sending', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Send booking request' }).click();
  const valid = await page.locator('#b-name').evaluate((el: HTMLInputElement) => el.validity.valid);
  expect(valid).toBe(false);
  await expect(page.locator('form[data-form="booking"] [data-form-status]')).toHaveText('');
});

test('thanks and 404 pages are noindex', async ({ page }) => {
  for (const path of ['/thanks/', '/404.html']) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.getByRole('link', { name: 'Back to the site' })).toBeVisible();
  }
});
