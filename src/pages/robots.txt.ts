/* /robots.txt: allow everyone, AI crawlers included, and point to the sitemap (PLAN.md section 9). */
import type { APIRoute } from 'astro';
import { robotsTxt } from '../lib/discovery';
import { NOINDEX, absolute } from '../lib/site';

export const GET: APIRoute = () =>
  new Response(robotsTxt({ sitemap: absolute('/sitemap-index.xml'), noindex: NOINDEX }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
