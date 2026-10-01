/* /sitemap-index.xml: points to the one sitemap (PLAN.md section 9). The name is what Search Console and robots.txt are given. */
import type { APIRoute } from 'astro';
import { sitemapIndexXml } from '../lib/discovery';
import { absolute } from '../lib/site';

export const GET: APIRoute = () =>
  new Response(sitemapIndexXml([absolute('/sitemap-0.xml')]), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
