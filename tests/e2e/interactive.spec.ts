/*
  The record player and the booking form's date check (ADR 0016). Apple's
  clips are replaced by a few seconds of silence: Playwright's Chromium has
  no AAC, and tests never touch the network.
*/
import { expect, test, type Page } from '@playwright/test';
import { blockThirdParties } from './helpers';

/** A mono 8 kHz WAV of silence. */
function silence(seconds: number): Buffer {
  const rate = 8000;
  const bytes = rate * seconds * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + bytes, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(bytes, 40);
  return b;
}

async function fakeUmami(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { umami: { track: (e: string, d?: unknown) => void }; __events: [string, unknown][] };
    w.__events = [];
    w.umami = { track: (event, data) => w.__events.push([event, data]) };
  });
}

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

test('pressing play on a song plays its clip, drops the needle, and pauses on a second press', async ({ page }) => {
  await fakeUmami(page);
  const requested: string[] = [];
  await page.route(/audio-ssl\.itunes\.apple\.com/, (route) => {
    requested.push(route.request().url());
    return route.fulfill({ contentType: 'audio/wav', body: silence(6) });
  });
  await page.goto('/');
  expect(requested).toEqual([]); // nothing loads until someone presses play

  const play = page.getByRole('button', { name: 'Play a clip of Two Way Street' });
  await play.click();
  const pause = page.getByRole('button', { name: 'Pause a clip of Two Way Street' });
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-album-art]')).toHaveClass(/is-playing/);
  await expect(page.locator('.track').first()).toHaveClass(/is-playing/);
  expect(requested[0]).toMatch(/^https:\/\/audio-ssl\.itunes\.apple\.com\//);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __events: [string, unknown][] }).__events)).toContainEqual(['track_preview', { track: 'Two Way Street' }]);

  await pause.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-album-art]')).not.toHaveClass(/is-playing/);

  // Another song takes over from the first.
  await play.click();
  await page.getByRole('button', { name: 'Play a clip of Close to You' }).click();
  await expect(page.getByRole('button', { name: 'Pause a clip of Close to You' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play a clip of Two Way Street' })).toHaveAttribute('aria-pressed', 'false');
});

test('a clip that ends lifts the needle', async ({ page }) => {
  await page.route(/audio-ssl\.itunes\.apple\.com/, (route) => route.fulfill({ contentType: 'audio/wav', body: silence(1) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play a clip of Summer Magic' }).click();
  await expect(page.locator('[data-album-art]')).toHaveClass(/is-playing/);
  await expect(page.locator('[data-album-art]')).not.toHaveClass(/is-playing/, { timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Play a clip of Summer Magic' })).toHaveAttribute('aria-pressed', 'false');
});

test('a clip that won’t load says so and points to Apple Music', async ({ page }) => {
  await page.route(/audio-ssl\.itunes\.apple\.com/, (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Play a clip of Walkin’ Blues' }).click();
  await expect(page.locator('[data-album-status]')).toHaveText('Couldn’t load that clip. Walkin’ Blues is on Apple Music.');
  await expect(page.getByRole('button', { name: 'Play a clip of Walkin’ Blues' })).toHaveAttribute('aria-pressed', 'false');
});

test('the booking form says when Johnny is already playing that day', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00-04:00'));
  await page.goto('/#book');
  const date = page.locator('#b-date');
  const note = page.locator('#b-date-note');
  await expect(date).toHaveAttribute('min', '2026-10-01');
  await expect(note).toBeHidden();

  await date.fill('2026-10-17');
  await expect(note).toHaveText('I’m already playing The Fed Community in Clarkston that day. Pick another date, or send it anyway and we’ll talk.');
  await date.fill('2026-10-18');
  await expect(note).toHaveText('I don’t have anything listed that day.');
  await date.fill('2026-09-20');
  await expect(note).toHaveText('That date has already gone by.');
  await expect(date).toHaveAttribute('aria-describedby', 'b-date-note');
});
