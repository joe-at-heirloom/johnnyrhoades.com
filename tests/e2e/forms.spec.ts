/*
  Phase 5: forms and analytics, against intercepted services (ADR 0023). The
  build uses fake public IDs (playwright.config.ts), so nothing here reaches
  Formspree or Google.
*/
import { expect, test, type Page } from '@playwright/test';
import { analyticsEvents, blockThirdParties, fakeAnalytics } from './helpers';

const BOOKING = 'https://formspree.io/f/test-booking';
const SIGNUP = 'https://formspree.io/f/test-signup';

async function fillBooking(page: Page) {
  await page.fill('#b-name', 'Pat Booker');
  await page.fill('#b-email', 'pat@example.com');
  await page.fill('#b-date', '2026-10-24');
  await page.fill('#b-venue', 'Blue Goose Inn, St. Clair Shores');
  await page.selectOption('#b-act', 'Trio');
  await page.fill('#b-msg', 'Two sets, 9 to midnight');
}

test.describe('forms', () => {
  test.beforeEach(async ({ page }) => {
    await blockThirdParties(page);
    await fakeAnalytics(page);
  });

  test('a booking request reaches Formspree with a subject Johnny can triage', async ({ page }) => {
    let sent: Record<string, string> | null = null;
    await page.route(BOOKING, async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, next: 'https://formspree.io/thanks' } });
    });
    await page.goto('/#book');
    await fillBooking(page);
    await page.getByRole('button', { name: 'Send booking request' }).click();

    await expect(page.locator('#book [data-form-status]')).toHaveText('Thanks, got it. I’ll get back to you soon.');
    expect(sent).toMatchObject({
      _subject: 'Booking: Sat, Oct 24, Blue Goose Inn, St. Clair Shores, Bar / club',
      email: 'pat@example.com', // Formspree makes this the Reply-To
      Name: 'Pat Booker',
      Act: 'Trio',
      Details: 'Two sets, 9 to midnight',
    });
    expect(await analyticsEvents(page)).toContainEqual(['booking_submit', { event_type: 'Bar / club' }]);
    await expect(page.locator('#b-name')).toHaveValue(''); // reset after sending
  });

  test('a failed booking says so and offers Johnny’s email', async ({ page }) => {
    await page.route(BOOKING, (route) => route.fulfill({ status: 422, json: { errors: [{ message: 'Form not found' }] } }));
    await page.goto('/#book');
    await fillBooking(page);
    await page.getByRole('button', { name: 'Send booking request' }).click();
    const status = page.locator('#book [data-form-status]');
    await expect(status).toHaveText('That didn’t go through. Try again, or email me at hello@johnnyrhoades.com.');
    await expect(status.getByRole('link', { name: 'hello@johnnyrhoades.com' })).toHaveAttribute('href', 'mailto:hello@johnnyrhoades.com');
    expect((await analyticsEvents(page)).map(([e]) => e)).toContain('booking_error');
    await expect(page.locator('#b-name')).toHaveValue('Pat Booker'); // nothing lost
  });

  test('the booking section and the press kit give Johnny’s email, and count the clicks', async ({ page }) => {
    for (const [path, from] of [['/', 'home'], ['/epk/', 'epk']] as const) {
      await page.goto(path);
      const email = page.getByRole('link', { name: 'hello@johnnyrhoades.com' }).first();
      await expect(email).toHaveAttribute('href', 'mailto:hello@johnnyrhoades.com');
      await expect(email).toHaveAttribute('data-event', 'email_click');
      await expect(email).toHaveAttribute('data-event-from', from);
    }
  });

  test('the honeypot stops bots without telling them', async ({ page }) => {
    let requests = 0;
    await page.route(BOOKING, (route) => {
      requests++;
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto('/#book');
    await fillBooking(page);
    // bots fill every field they find, including the one people can't see
    await page.locator('#book input[name="_gotcha"]').evaluate((box: HTMLInputElement) => { box.value = 'http://spam.example'; });
    await page.getByRole('button', { name: 'Send booking request' }).click();
    await page.waitForTimeout(300);
    expect(requests).toBe(0);
  });

  test('without JavaScript, both forms post straight to Formspree', async ({ page }) => {
    await page.goto('/');
    const booking = page.locator('form[data-form="booking"]');
    await expect(booking).toHaveAttribute('action', BOOKING);
    await expect(booking.locator('input[name="_subject"]')).toHaveValue('Booking request from johnnyrhoades.com');
    await expect(page.locator('form[data-form="signup"]')).toHaveAttribute('action', SIGNUP);
  });

  test('a mailing list signup goes to Formspree with the region of its ZIP', async ({ page }) => {
    let sent: Record<string, string> | null = null;
    await page.route(SIGNUP, async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto('/#list');
    await page.fill('#l-email', 'fan@example.com');
    await page.fill('#l-zip', '48080');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.locator('#list [data-form-status]')).toHaveText('Thanks, you’re on the list.');
    expect(sent).toEqual({ _subject: 'Mailing list signup: Metro Detroit', email: 'fan@example.com', ZIP: '48080', Region: 'Metro Detroit' });
    expect((await analyticsEvents(page)).map(([e]) => e)).toContain('list_signup');
  });

  test('playing a video and turning the strum sound on are tracked', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-video="Xvm2uMDesXU"]').click();
    await page.locator('[data-neck]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-neck] path.neck-string')).toHaveCount(6);
    await page.getByRole('switch', { name: 'Sound' }).click();
    const names = (await analyticsEvents(page)).map(([e]) => e);
    expect(names).toContain('video_play');
    expect(names).toContain('strum_sound_on');
  });

  test('links and buttons carry their events, and a click sends one', async ({ page }) => {
    await page.goto('/shows/2026-10-23-blue-goose-inn-st-clair-shores/');
    for (const [name, event] of [
      ['Directions', 'directions_click'],
      ['RSVP on Bandsintown', 'rsvp_click'],
      ['Add to Google Calendar', 'calendar_add'],
      ['Download Instagram post', 'poster_download'],
    ] as const) {
      await expect(page.getByRole('link', { name }).first()).toHaveAttribute('data-event', event);
    }
    await expect(page.getByRole('button', { name: 'Print a flyer' })).toHaveAttribute('data-event-format', 'flyer');
    await page.getByRole('link', { name: 'Directions' }).first().evaluate((a: HTMLAnchorElement) => {
      a.addEventListener('click', (e) => e.preventDefault()); // stay on the page
      a.click();
    });
    expect((await analyticsEvents(page)).map(([e]) => e)).toContain('directions_click');
  });
});

test.describe('Google Analytics', () => {
  test('loads after the page is idle, on the configured host only', async ({ page }) => {
    let script = '';
    await blockThirdParties(page);
    await page.route(/googletagmanager\.com\/gtag\/js/, (route) => {
      script = route.request().url();
      return route.fulfill({ contentType: 'text/javascript', body: '' });
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-ga-id', 'G-TEST');
    await expect.poll(() => script).toContain('id=G-TEST');
    const queued = await page.evaluate(() => JSON.stringify((window as unknown as { dataLayer: unknown[] }).dataLayer));
    // gtag queues its arguments objects, which serialize with numeric keys.
    expect(queued).toContain('{"0":"config","1":"G-TEST"}');
  });

  test('stays off for a visitor who asks not to be tracked', async ({ page }) => {
    let requests = 0;
    await blockThirdParties(page);
    await page.route(/googletagmanager\.com/, (route) => {
      requests++;
      return route.abort();
    });
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
    await page.goto('/');
    await page.waitForLoadState('load');
    expect(await page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag)).toBe('undefined');
    await page.waitForTimeout(500);
    expect(requests).toBe(0);
  });
});
