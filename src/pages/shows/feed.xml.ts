/* /shows/feed.xml: newly announced shows, newest first. */
import type { APIRoute } from 'astro';
import { buildFeed } from '../../lib/feed';
import { allShows, BUILD_NOW } from '../../lib/load-shows';
import { hasPage, upcomingShows } from '../../lib/shows-data';
import { absolute, showPath } from '../../lib/site';

export const GET: APIRoute = () => {
  const body = buildFeed({
    shows: upcomingShows(allShows, BUILD_NOW).filter(hasPage),
    siteUrl: absolute('/shows/'),
    feedUrl: absolute('/shows/feed.xml'),
    urlFor: (s) => absolute(showPath(s.slug)),
    now: BUILD_NOW,
  });
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
