/* Phase 4: the press kit, and the facts ledger rules on built pages. */
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseFacts } from '../../src/lib/facts';
import { blockThirdParties, collectConsoleErrors } from './helpers';

const unverified = parseFacts(readFileSync('src/data/facts.yaml', 'utf8')).filter((f) => f.status === 'unverified');
const PAGES = ['/', '/shows/', '/epk/', '/shows/2026-10-23-blue-goose-inn-st-clair-shores/', '/thanks/', '/404.html'];

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

test('no built page states an unverified fact', async ({ request }) => {
  expect(unverified.length).toBeGreaterThan(0);
  for (const path of PAGES) {
    const html = (await (await request.get(path)).text()).toLowerCase();
    for (const fact of unverified) expect(html, `${path} mentions "${fact.detect}"`).not.toContain(fact.detect!.toLowerCase());
  }
});

test('the press kit has bios, facts with sources, highlights and booking', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/epk/');
  await expect(page).toHaveTitle('Johnny Rhoades Press Kit | Detroit Blues Guitarist for Venues, Festivals and Events');
  await expect(page.getByRole('heading', { level: 1, name: 'Johnny Rhoades' })).toBeVisible();
  await expect(page.locator('#bio-short')).toContainText('Johnny Rhoades is a blues guitarist and singer from Detroit, Michigan.');
  await expect(page.locator('#bio-medium cite')).toHaveText(['Feelin’ Freaky', 'Waiting on the Sun']);
  await expect(page.getByRole('heading', { name: 'Highlights' })).toBeVisible();
  await expect(page.locator('.epk-highlights li')).toHaveCount(6);
  await expect(page.locator('.epk-highlights li').first().getByRole('link', { name: 'Source' })).toHaveAttribute('href', /ferndalefriends/);
  await expect(page.getByRole('link', { name: 'Send a booking request' }).first()).toHaveAttribute('href', '/#book');
  expect(errors).toEqual([]);
});

test('bios copy to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/epk/');
  await page.getByRole('button', { name: 'Copy short bio' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Johnny Rhoades is a blues guitarist.*came out in 2014\.$/);
});

test('logos download; the press photo zip waits for confirmed credits', async ({ page, request }) => {
  await page.goto('/epk/');
  for (const name of ['Download logo for dark backgrounds', 'Download logo for light backgrounds']) {
    const href = await page.getByRole('link', { name }).getAttribute('href');
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  }
  await expect(page.getByText('High-resolution photos are available on request from hello@johnnyrhoades.com.')).toBeVisible();
  expect((await request.get('/press/johnny-rhoades-press-photos.zip')).status()).toBe(404);
});

test('the press kit prints to two pages', async ({ page }) => {
  await page.goto('/epk/');
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'Letter', printBackground: true });
  const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
  expect(pages.length).toBeLessThanOrEqual(2);
  await expect(page.locator('.epk-video')).toBeHidden();
  await expect(page.locator('.epk-print-url')).toHaveText('hello@johnnyrhoades.com · johnnyrhoades.com/epk');
});

test('the press kit has no serious accessibility violations', async ({ page }) => {
  await page.goto('/epk/');
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('home structured data: videos, album tracks and official profiles', async ({ page }) => {
  await page.goto('/');
  const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
  expect(blocks.filter((b) => b['@type'] === 'VideoObject')).toHaveLength(4);
  const graph = blocks.find((b) => b['@graph'])['@graph'] as Record<string, unknown>[];
  const person = graph.find((n) => n['@type'] === 'Person')!;
  expect(person.sameAs).toHaveLength(3);
  expect(person.description).toBe('Johnny Rhoades is a blues guitarist and singer from Detroit, Michigan.');
  const album = graph.find((n) => n['@type'] === 'MusicAlbum') as { track: { numberOfItems: number } };
  expect(album.track.numberOfItems).toBe(10);
  await expect(page.locator('#about')).toContainText('I started out at 19 playing with Motor City Josh.');
});
