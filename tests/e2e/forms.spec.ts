/*
  Phase 5: forms and analytics, against intercepted services. The build uses
  fake public IDs (playwright.config.ts), so nothing here reaches Web3Forms,
  Buttondown or Umami.
*/
import { expect, test, type Page } from '@playwright/test';
import { blockThirdParties } from './helpers';

/** Captures what the site sends to Umami (the real script is blocked). */
async function fakeUmami(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { umami: { track: (e: string, d?: unknown) => void }; __events: [string, unknown][] };
    w.__events = [];
    w.umami = { track: (event, data) => w.__events.push([event, data]) };
  });
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: [string, unknown][] }).__events);

async function fillBooking(page: Page) {
  await page.fill('#b-name', 'Pat Booker');
  await page.fill('#b-email', 'pat@example.com');
  await page.fill('#b-date', '2026-10-24');
  await page.fill('#b-venue', 'Blue Goose Inn, St. Clair Shores');
  await page.selectOption('#b-act', 'Trio');
  await page.fill('#b-msg', 'Two sets, 9 to midnight');
}

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
  await fakeUmami(page);
});

test('a booking request reaches Web3Forms with a subject Johnny can triage', async ({ page }) => {
  let sent: Record<string, string> | null = null;
  await page.route('https://api.web3forms.com/submit', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { success: true, message: 'Email sent' } });
  });
  await page.goto('/#book');
  await fillBooking(page);
  await page.getByRole('button', { name: 'Send booking request' }).click();

  await expect(page.locator('#book [data-form-status]')).toHaveText('Thanks, got it. I’ll get back to you soon.');
  expect(sent).toMatchObject({
    access_key: 'test-web3forms-key',
    subject: 'Booking: Sat, Oct 24, Blue Goose Inn, St. Clair Shores, Bar / club',
    replyto: 'pat@example.com',
    Name: 'Pat Booker',
    Act: 'Trio',
    Details: 'Two sets, 9 to midnight',
  });
  expect(await events(page)).toContainEqual(['booking_submit', { eventType: 'Bar / club' }]);
  await expect(page.locator('#b-name')).toHaveValue(''); // reset after sending
});

test('a failed booking says so and offers Facebook', async ({ page }) => {
  await page.route('https://api.web3forms.com/submit', (route) => route.fulfill({ status: 500, json: { success: false } }));
  await page.goto('/#book');
  await fillBooking(page);
  await page.getByRole('button', { name: 'Send booking request' }).click();
  await expect(page.locator('#book [data-form-status]')).toHaveText('That didn’t go through. Try again, or message me on Facebook.');
  expect((await events(page)).map(([e]) => e)).toContain('booking_error');
  await expect(page.locator('#b-name')).toHaveValue('Pat Booker'); // nothing lost
});

test('the honeypot stops bots without telling them', async ({ page }) => {
  let requests = 0;
  await page.route('https://api.web3forms.com/submit', (route) => {
    requests++;
    return route.fulfill({ json: { success: true } });
  });
  await page.goto('/#book');
  await fillBooking(page);
  // bots fill every field they find, including the one people can't see
  await page.locator('#book input[name="botcheck"]').evaluate((box: HTMLInputElement) => { box.checked = true; });
  await page.getByRole('button', { name: 'Send booking request' }).click();
  await page.waitForTimeout(300);
  expect(requests).toBe(0);
});

test('without JavaScript, the booking form posts to Web3Forms and comes back to /thanks/', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('form[data-form="booking"]');
  await expect(form).toHaveAttribute('action', 'https://api.web3forms.com/submit');
  await expect(form.locator('input[name="access_key"]')).toHaveValue('test-web3forms-key');
  await expect(form.locator('input[name="redirect"]')).toHaveValue('https://johnnyrhoades.com/thanks/');
});

test('a mailing list signup goes to Buttondown with a region tag', async ({ page }) => {
  let body = '';
  await page.route('https://buttondown.com/api/emails/embed-subscribe/test-johnny', async (route) => {
    body = route.request().postData() ?? '';
    await route.fulfill({ status: 200, body: '' });
  });
  await page.goto('/#list');
  await page.fill('#l-email', 'fan@example.com');
  await page.fill('#l-zip', '48080');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.locator('#list [data-form-status]')).toHaveText('Thanks, you’re on the list.');
  const sent = new URLSearchParams(body);
  expect(sent.get('email')).toBe('fan@example.com');
  expect(sent.get('tag')).toBe('Metro Detroit');
  expect(sent.get('metadata__zip')).toBe('48080');
  expect((await events(page)).map(([e]) => e)).toContain('list_signup');
});

test('Umami loads cookieless, only counts the real domain, and links carry events', async ({ page }) => {
  await page.goto('/shows/2026-10-23-blue-goose-inn-st-clair-shores/');
  const umami = page.locator('script[data-website-id]');
  await expect(umami).toHaveAttribute('data-website-id', 'test-umami-id');
  await expect(umami).toHaveAttribute('data-domains', 'johnnyrhoades.com');
  await expect(umami).toHaveAttribute('data-do-not-track', 'true');
  for (const [name, event] of [
    ['Directions', 'directions_click'],
    ['RSVP on Bandsintown', 'rsvp_click'],
    ['Add to Google Calendar', 'calendar_add'],
    ['Download Instagram post', 'poster_download'],
  ] as const) {
    await expect(page.getByRole('link', { name }).first()).toHaveAttribute('data-umami-event', event);
  }
  await expect(page.getByRole('button', { name: 'Print a flyer' })).toHaveAttribute('data-umami-event-format', 'flyer');
});

test('playing a video and turning the strum sound on are tracked', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-video="Xvm2uMDesXU"]').click();
  await page.locator('[data-neck]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-neck] path.neck-string')).toHaveCount(6);
  await page.getByRole('switch', { name: 'Sound' }).click();
  const names = (await events(page)).map(([e]) => e);
  expect(names).toContain('video_play');
  expect(names).toContain('strum_sound_on');
});
