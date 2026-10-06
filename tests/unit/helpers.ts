import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { ARTIST_NAME, parseEvents, type BitEvent } from '../../src/lib/bandsintown.ts';
import { parseVenueBook } from '../../src/lib/data-files.ts';
import { normalizeEvent } from '../../src/lib/normalize.ts';
import type { FreshShow } from '../../src/lib/shows-schema.ts';
import type { VenueBook } from '../../src/lib/venues.ts';

export const FIXTURES = 'tests/fixtures/bandsintown';

/** Real responses from Johnny's Bandsintown, captured 2026-10-05 with the app_id redacted (fixtures README). */
export const fixtureEvents = (kind: 'upcoming' | 'past'): BitEvent[] =>
  parseEvents(JSON.parse(readFileSync(`${FIXTURES}/${kind}.json`, 'utf8')));

export const realVenues = (): VenueBook => parseVenueBook(readFileSync('src/data/venues.yaml', 'utf8'));

export const at = (iso: string) => DateTime.fromISO(iso, { setZone: true });

/** A synthetic Bandsintown event with sensible defaults (test data, not Johnny's real shows). */
export function bitEvent(over: Partial<Record<string, unknown>> & { venue?: Record<string, unknown> } = {}): BitEvent {
  const { venue, ...rest } = over;
  return parseEvents([
    {
      id: '1',
      url: 'https://www.bandsintown.com/e/1?app_id=test',
      datetime: '2026-10-10T20:00:00',
      starts_at: '',
      ends_at: '',
      title: '',
      description: '',
      venue: { name: 'Test Room', city: 'Ferndale', region: 'MI', country: 'United States', ...venue },
      lineup: [ARTIST_NAME],
      offers: [],
      free: false,
      ...rest,
    },
  ])[0]!;
}

export const fresh = (over: Parameters<typeof bitEvent>[0] = {}, venues: VenueBook = {}): FreshShow =>
  normalizeEvent(bitEvent(over), { venues, artistName: ARTIST_NAME });
