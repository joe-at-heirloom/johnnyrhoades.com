/* Phase 2: what pages, feeds and structured data are built from. */
import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildFeed } from '../../src/lib/feed.ts';
import { buildCalendar, escapeText, foldLine } from '../../src/lib/ics.ts';
import { directionsUrl, googleCalendarUrl, venueAddress } from '../../src/lib/links.ts';
import { mergeShows } from '../../src/lib/merge.ts';
import { breadcrumbs, musicEvent, siteGraph } from '../../src/lib/schema.ts';
import { hasPage, isIndexable, pastShows, proofLine, showEnd, topRooms, upcomingShows, venueHistory } from '../../src/lib/shows-data.ts';
import type { Show } from '../../src/lib/shows-schema.ts';
import { at, fresh } from './helpers.ts';

const NOW = at('2026-10-01T12:00:00-04:00');

function shows(list: Parameters<typeof fresh>[0][]): Show[] {
  return mergeShows({ existing: [], fresh: list.map((e) => fresh(e)), overrides: {}, now: at('2026-09-01T00:00:00-04:00'), artistName: 'Johnny Rhoades' }).shows;
}

const goose = { id: '500', datetime: '2026-10-23T21:00:00', venue: { name: 'Blue Goose Inn', city: 'St. Clair Shores', street_address: '28911 Jefferson Ave' } };
const tavern = { id: '466', datetime: '2026-10-02T18:00:00', ends_at: '2026-10-02T21:00:00', free: true, venue: { name: '15th Street Tavern', city: 'Clarkston', latitude: '42.78', longitude: '-83.42' } };

describe('show lists', () => {
  const list = shows([goose, tavern, { id: '450', datetime: '2026-09-26T20:00:00', venue: { name: 'Three Blind Mice Irish Pub', city: 'Mount Clemens' } }]);

  it('splits upcoming and past at "now"', () => {
    expect(upcomingShows(list, NOW).map((s) => s.id)).toEqual(['466', '500']);
    expect(pastShows(list, NOW).map((s) => s.id)).toEqual(['450']);
  });

  it('keeps a show upcoming until it ends', () => {
    const t = list.find((s) => s.id === '466')!;
    expect(showEnd(t).toISO()).toBe('2026-10-02T21:00:00.000-04:00');
    expect(upcomingShows(list, at('2026-10-02T20:59:00-04:00')).map((s) => s.id)).toContain('466');
    expect(upcomingShows(list, at('2026-10-02T21:01:00-04:00')).map((s) => s.id)).not.toContain('466');
  });

  it('treats a show without an end time as on for four hours', () => {
    const g = list.find((s) => s.id === '500')!;
    expect(showEnd(g).toISO()).toBe('2026-10-24T01:00:00.000-04:00');
  });

  it('leaves private shows out of every list', () => {
    const withPrivate = list.map((s) => (s.id === '500' ? { ...s, public: false } : s));
    expect(upcomingShows(withPrivate, NOW).map((s) => s.id)).toEqual(['466']);
    expect(hasPage(withPrivate.find((s) => s.id === '500')!)).toBe(false);
  });

  it('gives pages only from PAGES_FROM, and keeps them indexable for 30 days', () => {
    const old = shows([{ id: '1', datetime: '2026-08-20T20:00:00' }])[0]!;
    expect(hasPage(old)).toBe(false);
    const g = list.find((s) => s.id === '500')!;
    expect(isIndexable(g, at('2026-11-21T12:00:00-05:00'))).toBe(true);
    expect(isIndexable(g, at('2026-11-23T12:00:00-05:00'))).toBe(false);
  });
});

describe('proof', () => {
  const many = shows(
    Array.from({ length: 12 }, (_, i) => ({
      id: String(100 + i),
      datetime: `2026-0${(i % 8) + 1}-1${i % 9}T20:00:00`,
      venue: { name: i % 3 === 0 ? 'Blue Goose Inn' : `Room ${i % 4}`, city: i % 2 ? 'Detroit' : 'Ferndale' },
    })),
  );

  it('counts shows, rooms and towns in the last year', () => {
    expect(proofLine(many, NOW)).toBe('12 shows in the last year, in 5 rooms across 2 towns.');
  });

  it('hides itself under ten shows', () => {
    expect(proofLine(many.slice(0, 9), NOW)).toBeNull();
  });

  it('reports venue history only after more than one visit', () => {
    const goosePast = many.filter((s) => s.venue.key === 'blue-goose-inn');
    expect(venueHistory(many, goosePast[0]!, NOW)).toBe(`Johnny’s played here ${goosePast.length} times since 2026.`);
    expect(topRooms(many, NOW)[0]).toMatchObject({ name: 'Blue Goose Inn', count: goosePast.length });
  });
});

describe('links', () => {
  const [t, g] = shows([tavern, goose]);
  it('builds a one-line address and a maps search', () => {
    expect(venueAddress(g!)).toBe('Blue Goose Inn, 28911 Jefferson Ave, St. Clair Shores, MI');
    expect(directionsUrl(g!)).toBe('https://www.google.com/maps/search/?api=1&query=Blue%20Goose%20Inn%2C%2028911%20Jefferson%20Ave%2C%20St.%20Clair%20Shores%2C%20MI');
  });
  it('builds a Google Calendar link in UTC, with a default three-hour set', () => {
    const url = new URL(googleCalendarUrl(g!, 'https://johnnyrhoades.com/shows/x/'));
    expect(url.searchParams.get('dates')).toBe('20261024T010000Z/20261024T040000Z');
    expect(new URL(googleCalendarUrl(t!, 'x')).searchParams.get('dates')).toBe('20261002T220000Z/20261003T010000Z');
  });
});

describe('iCalendar', () => {
  it('escapes text and folds long lines at 75 octets', () => {
    expect(escapeText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
    const folded = foldLine(`DESCRIPTION:${'é'.repeat(60)}`);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'é'.repeat(60)}`);
  });

  it('produces a calendar that a real parser reads back', () => {
    const list = shows([tavern, goose]).map((s) => (s.id === '500' ? { ...s, status: 'cancelled' as const, sequence: 2 } : s));
    const text = buildCalendar({ shows: list, name: 'Johnny Rhoades: shows', urlFor: (s) => `https://johnnyrhoades.com/shows/${s.slug}/`, now: NOW });
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/); // CRLF only

    const cal = new ICAL.Component(ICAL.parse(text));
    const events = cal.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));
    expect(events.map((e) => e.uid)).toEqual(['466@johnnyrhoades.com', '500@johnnyrhoades.com']);
    expect(events[0]!.startDate.toUnixTime()).toBe(Date.parse('2026-10-02T18:00:00-04:00') / 1000);
    expect(events[0]!.endDate.toUnixTime()).toBe(Date.parse('2026-10-02T21:00:00-04:00') / 1000);
    expect(events[0]!.location).toBe('15th Street Tavern, Clarkston, MI');
    expect(events[1]!.sequence).toBe(2);
    expect(events[1]!.summary).toBe('Cancelled: Johnny Rhoades at Blue Goose Inn');
    expect(cal.getAllSubcomponents('vevent')[1]!.getFirstPropertyValue('status')).toBe('CANCELLED');
  });
});

describe('RSS', () => {
  it('lists new shows first and escapes text', () => {
    const list = shows([tavern, { ...goose, venue: { ...goose.venue, name: 'Jack & Jill’s <Room>' } }]);
    list[1]!.firstSeen = '2026-09-20T10:00:00-04:00';
    const xml = buildFeed({ shows: list, siteUrl: 'https://johnnyrhoades.com/shows/', feedUrl: 'https://johnnyrhoades.com/shows/feed.xml', urlFor: (s) => `https://johnnyrhoades.com/shows/${s.slug}/`, now: NOW });
    expect(xml).toContain('Jack &amp; Jill’s &lt;Room&gt;');
    // First seen on Sept 20, after the tavern show (Sept 1), so it's the newer announcement.
    expect(xml.indexOf('Jack &amp; Jill')).toBeLessThan(xml.indexOf('15th Street Tavern'));
    expect(xml).toMatch(/<pubDate>Sun, 20 Sep 2026 10:00:00 -0400<\/pubDate>/);
  });
});

/* Google's requirements for event rich results: name, startDate, location with an address. */
const MusicEventSchema = z.object({
  '@context': z.literal('https://schema.org'),
  '@type': z.literal('MusicEvent'),
  name: z.string().min(1),
  url: z.url(),
  startDate: z.iso.datetime({ offset: true }),
  eventStatus: z.string().startsWith('https://schema.org/Event'),
  eventAttendanceMode: z.literal('https://schema.org/OfflineEventAttendanceMode'),
  location: z.object({
    '@type': z.literal('Place'),
    name: z.string().min(1),
    address: z.object({ '@type': z.literal('PostalAddress'), addressLocality: z.string().min(1), addressCountry: z.string().length(2) }),
  }),
  performer: z.unknown(),
  image: z.array(z.url()).min(1),
  description: z.string().min(1),
});

describe('structured data', () => {
  const [t, g] = shows([tavern, { ...goose, title: 'With Motor City Josh & The Big 3' }]);
  const images = ['https://johnnyrhoades.com/assets/img/og-image.jpg'];

  it('builds a valid MusicEvent', () => {
    const ev = musicEvent(t!, { images });
    expect(() => MusicEventSchema.parse(ev)).not.toThrow();
    expect(ev).toMatchObject({
      startDate: '2026-10-02T18:00:00-04:00',
      endDate: '2026-10-02T21:00:00-04:00',
      offers: { price: '0', priceCurrency: 'USD' },
      location: { geo: { latitude: 42.78, longitude: -83.42 } },
    });
  });

  it('leaves out offers when nothing is known about tickets', () => {
    expect(musicEvent(g!, { images })).not.toHaveProperty('offers');
  });

  it('bills a guest spot with both acts', () => {
    expect(musicEvent(g!, { images }).performer).toEqual([
      { '@type': 'MusicGroup', name: 'Motor City Josh & The Big 3' },
      expect.objectContaining({ '@type': 'Person', name: 'Johnny Rhoades' }),
    ]);
  });

  it('marks cancelled shows EventCancelled', () => {
    expect(musicEvent({ ...t!, status: 'cancelled' }, { images }).eventStatus).toBe('https://schema.org/EventCancelled');
  });

  it('refuses to mark up a private show', () => {
    expect(() => musicEvent({ ...t!, public: false }, { images })).toThrow(/private/);
  });

  it('lists only real profiles in sameAs', () => {
    const graph = siteGraph({ portraitUrl: 'https://johnnyrhoades.com/p.jpg' }) as { '@graph': Record<string, unknown>[] };
    const person = graph['@graph'].find((n) => n['@type'] === 'Person')!;
    expect(person.sameAs).not.toContainEqual(expect.stringContaining('music.apple.com'));
    expect(person.alternateName).toEqual(['John Rhoades']);
  });

  it('numbers breadcrumbs from one', () => {
    const b = breadcrumbs([{ name: 'Home', url: 'https://x/' }, { name: 'Shows', url: 'https://x/shows/' }]) as { itemListElement: { position: number }[] };
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2]);
  });
});
