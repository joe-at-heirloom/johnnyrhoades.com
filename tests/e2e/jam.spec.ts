/* The blues maker (/jam/, ADR 0030): it plays, it follows the form, and a song is a link. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { blockThirdParties, collectConsoleErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

test('the home page links to it from under the strum', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.strum').getByRole('link', { name: 'Play it with a band' })).toHaveAttribute('href', '/jam/');
});

test('it plays the 12 bars, loading only the sounds the song uses, and stops', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const mp3s: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('.mp3')) mp3s.push(r.url().split('/').pop()!.replace(/\.[^.]+\.mp3$/, ''));
  });
  await page.goto('/jam/?feel=boogie&bpm=176&guitar=off&keys=off&lead=off');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make a 12-bar blues');
  await expect(page.locator('[data-jam-chord]')).toHaveText(['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7']);
  expect(mp3s).toEqual([]); // nothing loads before Play

  const play = page.getByRole('button', { name: 'Play' });
  await play.click();
  await expect(page.locator('[data-jam-status]')).toHaveText('Playing a boogie in E, 176 bpm.');
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true');
  // At 176 bpm a bar is about 1.4 s: the marker starts on bar 1 and moves on.
  await expect(page.locator('[data-jam-bar][aria-current]')).toHaveCount(1);
  await expect(page.locator('[data-jam-bar]').nth(1)).toHaveAttribute('aria-current', 'true', { timeout: 4000 });
  expect(new Set(mp3s.map((f) => f.split('-')[0]))).toEqual(new Set(['sticks', 'upright']));

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('[data-jam-status]')).toHaveText('Stopped.');
  await expect(page.locator('[data-jam-bar][aria-current]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a song is a link: the form reads the address bar and writes it back', async ({ page }) => {
  await page.goto('/jam/?key=A&feel=slow&bpm=60&change=quick&drums=brushes&room=vinyl');
  await expect(page.getByRole('radio', { name: 'A', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Slow blues' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Quick change/ })).toBeChecked();
  await expect(page.locator('[data-jam-tempo-out]')).toHaveText('60 bpm');
  await expect(page.locator('[data-jam-chord]').nth(1)).toHaveText('D7');

  await page.getByRole('radio', { name: 'G', exact: true }).check();
  await expect(page).toHaveURL(/[?&]key=G(&|$)/);
  await expect(page.locator('[data-jam-chord]').first()).toHaveText('G7');
  // A new feel starts at its own tempo.
  await page.getByRole('radio', { name: 'Shuffle' }).check();
  await expect(page.locator('[data-jam-tempo-out]')).toHaveText('100 bpm');
  await expect(page).toHaveURL(/feel=shuffle&bpm=100/);
  await page.getByRole('group', { name: 'Fills' }).getByRole('radio', { name: 'Off' }).check();
  await expect(page).toHaveURL(/lead=off/);
});

test('it has no serious accessibility problems', async ({ page }) => {
  await page.goto('/jam/');
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('every control can be reached and used from the keyboard', async ({ page }) => {
  await page.goto('/jam/');
  await page.getByRole('button', { name: 'Play' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: 'E', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'A', exact: true })).toBeChecked();
  await expect(page).toHaveURL(/key=A/);
});
