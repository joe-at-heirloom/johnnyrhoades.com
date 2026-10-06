import { describe, expect, it } from 'vitest';
import { ARTIST_NAME, captureText, eventsUrl, parseEvents } from '../../src/lib/bandsintown.ts';
import { cleanEventUrl, normalizeEvent } from '../../src/lib/normalize.ts';
import { captured, fixtureEvents, fresh, realVenues } from './helpers.ts';

describe('parseEvents', () => {
  it('accepts the fixture payloads', () => {
    expect(fixtureEvents('upcoming')).toHaveLength(7);
    expect(fixtureEvents('past')).toHaveLength(2);
  });

  it('turns a Bandsintown error body into an error', () => {
    expect(() => parseEvents({ errorMessage: 'Invalid app_id' })).toThrow(/Invalid app_id/);
  });

  it('builds the documented events URL', () => {
    expect(eventsUrl('abc', 'upcoming')).toBe('https://rest.bandsintown.com/artists/id_11869348/events?app_id=abc&date=upcoming');
  });

  it('accepts the real payloads captured on 2026-10-05', () => {
    expect(captured('upcoming')).toHaveLength(5);
    expect(captured('past')).toHaveLength(604);
  });

  it('redacts the app_id from captured payloads, which get committed', () => {
    const raw = [{ url: 'https://www.bandsintown.com/e/1?app_id=s3cr3t-key&came_from=267', offers: [{ url: 'https://www.bandsintown.com/t/1?app_id=s3cr3t-key' }] }];
    const text = captureText(raw, 's3cr3t-key');
    expect(text).not.toContain('s3cr3t-key');
    expect(text.match(/app_id=REDACTED/g)).toHaveLength(2);
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(raw).replaceAll('s3cr3t-key', 'REDACTED')));
  });
});

describe('normalizeEvent against the fixtures', () => {
  const ctx = { venues: realVenues(), artistName: ARTIST_NAME };
  const shows = fixtureEvents('upcoming').map((e) => normalizeEvent(e, ctx));
  const tavern = shows.find((s) => s.id === '108955466')!;
  const goose = shows.find((s) => s.id === '108955500')!;

  it('keeps the venue-local time with a Detroit offset', () => {
    expect(tavern.start).toBe('2026-10-02T18:00:00-04:00');
    expect(tavern.end).toBe('2026-10-02T21:00:00-04:00');
  });

  it('fills the venue from Bandsintown, with coordinates as numbers', () => {
    expect(tavern.venue).toEqual({
      key: '15th-street-tavern',
      name: '15th Street Tavern',
      street: '10081 S Ortonville Rd',
      city: 'Clarkston',
      region: 'MI',
      postalCode: '48348',
      country: 'US',
      lat: 42.7867362,
      lng: -83.4217305,
      timeZone: 'America/Detroit',
    });
  });

  it('adds hand-kept venue details and ignores TODO placeholders', () => {
    expect(goose.venue.key).toBe('blue-goose-inn');
    expect(goose.venue.street).toBe('28911 Jefferson Ave');
    expect(goose.venue.postalCode).toBeUndefined(); // "TODO" in venues.yaml
    expect(goose.venue.url).toBeUndefined();
  });

  it('strips tracking parameters from the event link', () => {
    expect(tavern.bandsintownUrl).toBe('https://www.bandsintown.com/e/108955466');
    expect(cleanEventUrl('https://www.bandsintown.com/e/1?app_id=x&utm_source=y')).toBe('https://www.bandsintown.com/e/1');
  });

  it('marks free shows, and leaves out tickets when nothing is known', () => {
    expect(tavern.tickets).toEqual({ free: true });
    expect(goose.tickets).toBeUndefined();
  });

  it('defaults to an unlabeled act billed as Johnny', () => {
    expect(goose.act).toBe('unspecified');
    expect(goose.billing).toBe('Johnny Rhoades');
    expect(goose.rawTitle).toBeUndefined();
  });

  it('matches venues by alternate names', () => {
    const s = fresh({ venue: { name: 'The Blue Goose', city: 'St. Clair Shores' } }, ctx.venues);
    expect(s.venue.key).toBe('blue-goose-inn');
    expect(s.venue.name).toBe('Blue Goose Inn');
  });
});

describe('normalizeEvent against the real capture (ADR 0020)', () => {
  const shows = [...captured('upcoming'), ...captured('past')].map((e) => normalizeEvent(e, { venues: realVenues(), artistName: ARTIST_NAME }));

  it('takes the act out of the venue name', () => {
    expect(shows.filter((s) => s.venue.name.includes('@'))).toEqual([]);
    const whiskey = shows.filter((s) => s.venue.name === 'The Whiskey Six');
    expect(whiskey.length).toBeGreaterThan(20);
    expect(whiskey.filter((s) => s.act === 'solo' && s.rawTitle === 'Solo Acoustic').length).toBe(whiskey.length - 1);
    expect(whiskey.find((s) => s.act === 'host')?.billing).toBe('Open mic hosted by Johnny Rhoades');
  });

  it('reads the act for nearly every show he labeled', () => {
    const unread = shows.filter((s) => s.act === 'unspecified' && s.rawTitle);
    expect(unread.length).toBeLessThan(15);
    expect(shows.filter((s) => s.billing === 'Motor City Josh & The Big 3, with Johnny Rhoades').length).toBeGreaterThan(150);
  });

  it('leaves new shows with no label billed as plain Johnny Rhoades', () => {
    const goose = shows.find((s) => s.id === '108955500')!;
    expect(goose).toMatchObject({ act: 'unspecified', billing: 'Johnny Rhoades', venue: { name: 'Blue Goose Inn', postalCode: '48081' } });
    expect(goose.rawTitle).toBeUndefined();
  });
});

describe('normalizeEvent edge cases (synthetic events)', () => {
  it('reads ticket links and "free" in the description', () => {
    const s = fresh({ offers: [{ type: 'Tickets', url: 'https://tix.example/1', status: 'available' }], description: 'Free show, all ages' });
    expect(s.tickets).toEqual({ url: 'https://tix.example/1', free: true });
  });

  it('prefers starts_at over datetime when both exist', () => {
    expect(fresh({ datetime: '2026-10-10T20:00:00', starts_at: '2026-10-10T21:00:00' }).start).toBe('2026-10-10T21:00:00-04:00');
  });

  it('infers the act and billing from the title', () => {
    const labeled = fresh({ venue: { name: 'Solo Acoustic @ The Whiskey Six' } });
    expect(labeled).toMatchObject({ act: 'solo', billing: 'Johnny Rhoades', rawTitle: 'Solo Acoustic', venue: { key: 'the-whiskey-six', name: 'The Whiskey Six' } });
    // A title beats the venue label.
    expect(fresh({ title: 'Trio', venue: { name: 'Solo Acoustic @ The Whiskey Six' } })).toMatchObject({ act: 'trio', rawTitle: 'Trio' });
    const s = fresh({ title: 'With Motor City Josh & The Big 3' });
    expect(s.act).toBe('guest');
    expect(s.billing).toBe('Motor City Josh & The Big 3, with Johnny Rhoades');
    expect(s.rawTitle).toBe('With Motor City Josh & The Big 3');
  });

  it('uses the right zone for an out-of-state venue', () => {
    const s = fresh({ venue: { name: 'Kingston Mines', city: 'Chicago', region: 'IL' } });
    expect(s.start).toBe('2026-10-10T20:00:00-05:00');
    expect(s.venue.timeZone).toBe('America/Chicago');
  });

  it('handles missing coordinates and addresses', () => {
    const s = fresh({ venue: { name: 'Test Room', city: 'Ferndale', latitude: '', longitude: null } });
    expect(s.venue.lat).toBeUndefined();
    expect(s.venue.street).toBeUndefined();
  });
});
