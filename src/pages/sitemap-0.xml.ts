/* /sitemap-0.xml: home, /shows/, /epk/ and indexable show pages (src/lib/discovery.ts). */
import type { APIRoute } from 'astro';
import { sitemapEntries, sitemapXml } from '../lib/discovery';
import { allShows, BUILD_NOW } from '../lib/load-shows';

export const GET: APIRoute = () =>
  new Response(sitemapXml(sitemapEntries(allShows, BUILD_NOW)), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
