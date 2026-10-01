/* /shows.ics: the calendar subscription. Upcoming public shows plus the last two months. */
import type { APIRoute } from 'astro';
import { DateTime } from 'luxon';
import { buildCalendar } from '../lib/ics';
import { allShows, BUILD_NOW } from '../lib/load-shows';
import { hasPage } from '../lib/shows-data';
import { ARTIST, absolute, showPath } from '../lib/site';

export const GET: APIRoute = () => {
  const since = BUILD_NOW.minus({ days: 60 });
  const shows = allShows.filter((s) => s.public && DateTime.fromISO(s.start, { setZone: true }) >= since);
  const body = buildCalendar({
    shows,
    name: `${ARTIST}: shows`,
    urlFor: (s) => (hasPage(s) ? absolute(showPath(s.slug)) : absolute('/shows/')),
    now: BUILD_NOW,
  });
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
