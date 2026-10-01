/* /shows/<slug>.ics: add one show to a calendar. */
import type { APIRoute, GetStaticPaths } from 'astro';
import { buildCalendar } from '../../lib/ics';
import { allShows, BUILD_NOW } from '../../lib/load-shows';
import { hasPage } from '../../lib/shows-data';
import type { Show } from '../../lib/shows-schema';
import { absolute, showPath } from '../../lib/site';

export const getStaticPaths = (() =>
  allShows.filter(hasPage).map((show) => ({ params: { slug: show.slug }, props: { show } }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ show: Show }> = ({ props }) => {
  const { show } = props;
  const body = buildCalendar({
    shows: [show],
    name: `${show.billing} at ${show.venue.name}`,
    urlFor: (s) => absolute(showPath(s.slug)),
    now: BUILD_NOW,
  });
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
