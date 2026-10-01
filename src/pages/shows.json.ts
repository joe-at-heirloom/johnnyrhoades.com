/*
  /shows.json: open data for venues, listing sites and a future iOS widget
  (PLAN.md section 3). Public shows only, upcoming first, then the last year.
  Internal fields (sync history, aliases) stay out.
*/
import type { APIRoute } from 'astro';
import { DateTime } from 'luxon';
import { actLabel } from '../lib/act';
import { directionsUrl } from '../lib/links';
import { allShows, BUILD_NOW } from '../lib/load-shows';
import { hasPage, pastShows, upcomingShows } from '../lib/shows-data';
import type { Show } from '../lib/shows-schema';
import { ARTIST, absolute, showPath } from '../lib/site';

const toPublic = (s: Show) => ({
  id: s.id,
  url: hasPage(s) ? absolute(showPath(s.slug)) : null,
  start: s.start,
  end: s.end ?? null,
  status: s.status,
  billing: s.billing,
  act: s.act,
  actLabel: actLabel(s.act, s.billing) || null,
  venue: {
    name: s.venue.name,
    street: s.venue.street ?? null,
    city: s.venue.city,
    region: s.venue.region,
    postalCode: s.venue.postalCode ?? null,
    country: s.venue.country,
    lat: s.venue.lat ?? null,
    lng: s.venue.lng ?? null,
    timeZone: s.venue.timeZone,
  },
  tickets: s.tickets ?? null,
  directions: directionsUrl(s),
  bandsintown: s.bandsintownUrl,
  calendar: hasPage(s) ? absolute(`/shows/${s.slug}.ics`) : null,
});

export const GET: APIRoute = () => {
  const yearAgo = BUILD_NOW.minus({ years: 1 });
  const body = {
    artist: ARTIST,
    updated: BUILD_NOW.toISO({ suppressMilliseconds: true }),
    upcoming: upcomingShows(allShows, BUILD_NOW).map(toPublic),
    past: pastShows(allShows, BUILD_NOW)
      .filter((s) => DateTime.fromISO(s.start, { setZone: true }) >= yearAgo)
      .map(toPublic),
  };
  return new Response(`${JSON.stringify(body, null, 2)}\n`, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
