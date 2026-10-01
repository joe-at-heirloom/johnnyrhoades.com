/*
  Phase 2: shows rendered at build time, show pages, feeds, and the
  client-side Tonight behavior. The build is pinned to SITE_NOW
  (2026-10-01, noon in Detroit; see playwright.config.ts).
*/
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { blockThirdParties, collectConsoleErrors } from './helpers';

const TAVERN = '/shows/2026-10-02-15th-street-tavern-clarkston/';
const GOOSE = '/shows/2026-10-23-blue-goose-inn-st-clair-shores/';

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

test('home lists upcoming shows from the data, with no Bandsintown widget', async ({ page }) => {
  const widget: string[] = [];
  page.on('request', (r) => {
    if (/bandsintown\.com\/.*\.js|widgetv3/.test(r.url())) widget.push(r.url());
  });
  await page.goto('/');
  const rows = page.locator('#shows .show-row');
  await expect(rows).toHaveCount(7);
  await expect(rows.first()).toContainText('15th Street Tavern');
  await expect(rows.first()).toContainText('Fri, Oct 2');
  await expect(rows.first().locator('a')).toHaveAttribute('href', TAVERN);
  await page.locator('#shows').scrollIntoViewIfNeeded();
  expect(widget).toEqual([]);
});

test('a show page has the details, links and event markup', async ({ page, request }) => {
  const errors = collectConsoleErrors(page);
  await page.goto(GOOSE);
  await expect(page).toHaveTitle('Johnny Rhoades at Blue Goose Inn, St. Clair Shores | Fri Oct 23, 2026');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Johnny Rhoades\s*at Blue Goose Inn/);
  await expect(page.getByText('Friday, October 23, 9 pm')).toBeVisible();
  await expect(page.getByText('28911 Jefferson Ave')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Directions' })).toHaveAttribute('href', /google\.com\/maps\/search/);
  await expect(page.getByRole('link', { name: 'RSVP on Bandsintown' })).toHaveAttribute('href', 'https://www.bandsintown.com/e/108955500');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://johnnyrhoades.com${GOOSE}`);

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = blocks.map((b) => JSON.parse(b)).map((d) => d['@type'] ?? 'graph');
  expect(types).toEqual(['graph', 'MusicEvent', 'BreadcrumbList']);
  const event = JSON.parse(blocks[1]!);
  expect(event).toMatchObject({
    startDate: '2026-10-23T21:00:00-04:00',
    eventStatus: 'https://schema.org/EventScheduled',
    location: { name: 'Blue Goose Inn', address: { streetAddress: '28911 Jefferson Ave', addressLocality: 'St. Clair Shores' } },
  });

  const ics = await request.get('/shows/2026-10-23-blue-goose-inn-st-clair-shores.ics');
  expect(ics.headers()['content-type']).toContain('text/calendar');
  expect(await ics.text()).toContain('UID:108955500@johnnyrhoades.com');
  expect(errors).toEqual([]);
});

test('Tonight bar shows on a show day and goes away when the show ends', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-02T19:30:00-04:00'));
  await page.goto('/');
  const bar = page.locator('[data-tonight]');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('15th Street Tavern, Clarkston, MI · 6 pm');
  await expect(bar.getByRole('link', { name: '15th Street Tavern' })).toHaveAttribute('href', TAVERN);

  await page.clock.setFixedTime(new Date('2026-10-02T21:30:00-04:00')); // the tavern show ends at 9
  await page.reload();
  await expect(bar).toBeHidden();
  await expect(page.locator('#shows .show-row').filter({ hasText: '15th Street Tavern' })).toBeHidden();
  await expect(page.locator('#shows .show-row:visible').first()).toContainText('The Token Lounge');
});

test('a show page for a show that has happened points to the next one', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-03T10:00:00-04:00'));
  await page.goto(TAVERN);
  const banner = page.locator('[data-past-banner]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('This show has happened. Next up: Sun, Oct 4 at The Token Lounge, Westland, MI.');
  await expect(banner.getByRole('link')).toHaveAttribute('href', '/shows/2026-10-04-the-token-lounge-westland/');
});

test('/shows/ groups upcoming shows by month and keeps an archive', async ({ page }) => {
  await page.goto('/shows/');
  await expect(page.getByRole('heading', { level: 1, name: 'Shows' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  const archive = page.locator('details.archive-year');
  await expect(archive).toHaveCount(1);
  await expect(archive.locator('summary')).toContainText('2026 2 shows');
  await archive.locator('summary').click();
  await expect(archive.locator('.show-row')).toHaveCount(2);
});

test('shows pages have no serious accessibility violations', async ({ page }) => {
  for (const path of ['/shows/', GOOSE]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${path} ${v.id}: ${v.help}`)).toEqual([]);
  }
});

test('feeds: calendar, RSS and open data', async ({ request }) => {
  const cal = await request.get('/shows.ics');
  const text = await cal.text();
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(9);

  const rss = await request.get('/shows/feed.xml');
  // Static hosts (and GitHub Pages) pick the type from the extension: text/xml or application/xml.
  expect(rss.headers()['content-type']).toMatch(/xml/);
  expect(await rss.text()).toContain('<title>Johnny Rhoades at Blue Goose Inn, St. Clair Shores: Friday, October 23 at 9 pm</title>');

  const data = await (await request.get('/shows.json')).json();
  expect(data.upcoming).toHaveLength(7);
  expect(data.upcoming[0]).toMatchObject({ id: '108955466', start: '2026-10-02T18:00:00-04:00', venue: { name: '15th Street Tavern' } });
  expect(JSON.stringify(data)).not.toMatch(/firstSeen|sequence|aliases/);
});

test('the 404 page offers the next shows', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.locator('.show-row')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'All shows' })).toHaveAttribute('href', '/shows/');
});
