import { describe, expect, it } from 'vitest';
import { bookingPayload, bookingSubject, signupPayload } from '../../src/lib/forms.ts';
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

  it('builds the Web3Forms payload with readable labels and a reply-to', () => {
    const body = bookingPayload(request, { web3formsKey: 'k', siteUrl: 'https://x' });
    expect(body).toMatchObject({
      access_key: 'k',
      replyto: 'pat@example.com',
      Name: 'Pat Booker',
      'Venue and town': 'Blue Goose Inn, St. Clair Shores',
      Act: 'Trio',
      Phone: '-',
      Budget: '-',
    });
  });
});

describe('mailing list signups', () => {
  it('tags the region from the ZIP and keeps the ZIP', () => {
    const body = signupPayload({ email: 'fan@example.com', zip: '48080' });
    expect(body.get('email')).toBe('fan@example.com');
    expect(body.get('tag')).toBe('Metro Detroit');
    expect(body.get('metadata__zip')).toBe('48080');
  });

  it('sends no tag without a ZIP', () => {
    const body = signupPayload({ email: 'fan@example.com' });
    expect(body.has('tag')).toBe(false);
    expect(body.has('metadata__zip')).toBe(false);
  });
});
