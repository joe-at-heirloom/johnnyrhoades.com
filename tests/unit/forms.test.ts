import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookingPayload, bookingSubject, sendBooking, sendSignup, signupPayload } from '../../src/lib/forms.ts';
import { regionForZip } from '../../src/lib/regions.ts';

describe('regionForZip', () => {
  it.each([
    ['48226', 'Metro Detroit'], // downtown Detroit
    ['48080', 'Metro Detroit'], // St. Clair Shores
    ['48348', 'Metro Detroit'], // Clarkston
    ['48104', 'Ann Arbor'],
    ['48197', 'Ann Arbor'], // Ypsilanti
    ['48933', 'Lansing'],
    ['49503', 'West Michigan'], // Grand Rapids
    ['48502', 'Elsewhere in Michigan'], // Flint
    ['49684', 'Elsewhere in Michigan'], // Traverse City
    ['60614', 'Out of state'], // Chicago
    ['48226-1234', 'Metro Detroit'], // ZIP+4
  ])('%s → %s', (zip, region) => {
    expect(regionForZip(zip)).toBe(region);
  });

  it('ignores anything that isn’t a ZIP', () => {
    expect(regionForZip('')).toBeNull();
    expect(regionForZip('Detroit')).toBeNull();
    expect(regionForZip('482')).toBeNull();
  });
});

describe('booking requests', () => {
  const request = {
    name: 'Pat Booker',
    email: 'pat@example.com',
    date: '2026-10-24',
    venue: 'Blue Goose Inn, St. Clair Shores',
    eventType: 'Bar / club',
    act: 'Trio',
    message: 'Two sets',
  };

  it('puts what Johnny needs to triage in the subject', () => {
    expect(bookingSubject(request)).toBe('Booking: Sat, Oct 24, Blue Goose Inn, St. Clair Shores, Bar / club');
    expect(bookingSubject({ name: 'A', email: 'a@b.c' })).toBe('Booking: date open, place not given, event type not given');
  });

  it('never shifts the date across time zones', () => {
    expect(bookingSubject({ ...request, date: '2026-11-01' })).toMatch(/^Booking: Sun, Nov 1,/);
  });

  it('builds the Formspree payload with readable labels, a subject and a reply-to', () => {
    const body = bookingPayload(request);
    expect(body).toMatchObject({
      _subject: 'Booking: Sat, Oct 24, Blue Goose Inn, St. Clair Shores, Bar / club',
      email: 'pat@example.com',
      Name: 'Pat Booker',
      'Venue and town': 'Blue Goose Inn, St. Clair Shores',
      Act: 'Trio',
      Phone: '-',
      Budget: '-',
    });
  });
});

describe('mailing list signups', () => {
  it('names the region of the ZIP, in the subject too', () => {
    expect(signupPayload({ email: 'fan@example.com', zip: '48080' })).toEqual({
      _subject: 'Mailing list signup: Metro Detroit',
      email: 'fan@example.com',
      ZIP: '48080',
      Region: 'Metro Detroit',
    });
  });

  it('still signs up without a ZIP', () => {
    expect(signupPayload({ email: 'fan@example.com' })).toEqual({ _subject: 'Mailing list signup', email: 'fan@example.com', ZIP: '-', Region: '-' });
  });
});

describe('sending', () => {
  afterEach(() => vi.unstubAllGlobals());
  const request = { name: 'Pat Booker', email: 'pat@example.com' };

  it('posts JSON to the form’s Formspree endpoint', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await sendBooking(request, { bookingForm: 'abc123' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://formspree.io/f/abc123');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    expect(JSON.parse(init.body as string)).toMatchObject({ email: 'pat@example.com', Name: 'Pat Booker' });
  });

  it('turns Formspree’s error into a message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'Form not found' }] }), { status: 404 })));
    await expect(sendSignup({ email: 'fan@example.com' }, { signupForm: 'nope' })).rejects.toThrow('Form not found');
  });

  it('says a form isn’t connected when it has no ID', async () => {
    await expect(sendBooking(request, {})).rejects.toThrow(/not connected/);
    await expect(sendSignup({ email: 'fan@example.com' }, {})).rejects.toThrow(/not connected/);
  });
});
