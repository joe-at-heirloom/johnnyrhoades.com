/*
  Questions the pages ask about the show data. Pure functions over a list of
  shows and a `now`, so they're easy to test and nothing depends on the clock.
*/
import { DateTime } from 'luxon';
import { actLabel } from './act.ts';
import { INDEX_DAYS_AFTER, LIVE_HOURS, PAGES_FROM } from './site.ts';
import type { Show } from './shows-schema.ts';
import { clockTime, localDate, shortDate } from './time.ts';

const dt = (iso: string) => DateTime.fromISO(iso, { setZone: true });

/** When a show is over: its end time, or LIVE_HOURS after it starts. */
export const showEnd = (s: Show) => (s.end ? dt(s.end) : dt(s.start).plus({ hours: LIVE_HOURS }));

export const isPublic = (s: Show) => s.public;
export const isUpcoming = (s: Show, now: DateTime) => showEnd(s) > now;

/** Public shows still to come (or on now), soonest first. Cancelled ones stay listed, marked. */
export const upcomingShows = (shows: Show[], now: DateTime) =>
  shows.filter((s) => isPublic(s) && isUpcoming(s, now)).sort((a, b) => a.start.localeCompare(b.start));

/** Public shows that have happened, most recent first. Cancelled ones are left out. */
export const pastShows = (shows: Show[], now: DateTime) =>
  shows
    .filter((s) => isPublic(s) && !isUpcoming(s, now) && s.status !== 'cancelled')
    .sort((a, b) => b.start.localeCompare(a.start));

/** Every public show from PAGES_FROM on gets a page. Older ones live only in the archive. */
export const hasPage = (s: Show) => isPublic(s) && localDate(s.start, s.venue.timeZone) >= PAGES_FROM;

/** Pages stay indexable until INDEX_DAYS_AFTER days after the show (PLAN.md section 7.2). */
export const isIndexable = (s: Show, now: DateTime) => hasPage(s) && dt(s.start).plus({ days: INDEX_DAYS_AFTER }) > now;

/**
 * Which room a show was in, for counting. Johnny has typed the same room many
 * ways over the years ("Cadieux Cafe", "The Cadiuex Cafe"), so shows with a
 * street address count by address; the rest fall back to the venue key.
 */
export const roomOf = (s: Show) =>
  s.venue.street ? `${s.venue.street.toLowerCase().replace(/[^a-z0-9]/g, '')}|${s.venue.city.toLowerCase()}` : s.venue.key;

/** The proof sentence (PLAN.md section 4.3), or null when the last year has fewer than ten shows. */
export function proofLine(shows: Show[], now: DateTime): string | null {
  const yearAgo = now.minus({ years: 1 });
  const lastYear = pastShows(shows, now).filter((s) => dt(s.start) >= yearAgo);
  if (lastYear.length < 10) return null;
  const rooms = new Set(lastYear.map(roomOf)).size;
  const towns = new Set(lastYear.map((s) => `${s.venue.city}|${s.venue.region}`)).size;
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return `${n(lastYear.length, 'show', 'shows')} in the last year, in ${n(rooms, 'room', 'rooms')} across ${n(towns, 'town', 'towns')}.`;
}

/** "Johnny's played here 14 times since 2024." Only once it's more than once. */
export function venueHistory(shows: Show[], show: Show, now: DateTime): string | null {
  const here = pastShows(shows, now).filter((s) => roomOf(s) === roomOf(show));
  if (here.length < 2) return null;
  const since = Math.min(...here.map((s) => dt(s.start).year));
  return `Johnny’s played here ${here.length} times since ${since}.`;
}

/** Most-played rooms, for the press kit. */
export function topRooms(shows: Show[], now: DateTime, limit = 10) {
  const counts = new Map<string, { name: string; city: string; count: number }>();
  for (const s of pastShows(shows, now)) {
    const c = counts.get(roomOf(s)) ?? { name: s.venue.name, city: s.venue.city, count: 0 };
    c.count++;
    counts.set(roomOf(s), c);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Display strings for a show row, all in the venue's time zone. */
export function showSummary(s: Show) {
  const zone = s.venue.timeZone;
  const local = dt(s.start).setZone(zone);
  return {
    date: shortDate(s.start, zone),
    // The parts of the date block in show lists: "Oct" over "2", "Fri" beside it.
    weekday: local.toFormat('ccc'),
    monthShort: local.toFormat('LLL'),
    day: local.toFormat('d'),
    time: clockTime(s.start, zone),
    town: [s.venue.city, s.venue.region].filter(Boolean).join(', '),
    act: actLabel(s.act, s.billing),
    month: dt(s.start).setZone(zone).toFormat('LLLL yyyy'),
    year: dt(s.start).setZone(zone).year,
  };
}

/** Next show after this one, for "Next up" lists. */
export const showsAfter = (shows: Show[], show: Show, now: DateTime, limit = 3) =>
  upcomingShows(shows, now)
    .filter((s) => s.id !== show.id && s.status !== 'cancelled')
    .slice(0, limit);
