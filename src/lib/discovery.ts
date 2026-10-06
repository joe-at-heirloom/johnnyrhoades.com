/*
  What search engines and answer engines read (PLAN.md sections 9 and 10):
  the sitemap, robots.txt and llms.txt. Pure functions; the routes in
  src/pages pass in the data and the build time.
*/
import type { DateTime } from 'luxon';
import { escapeXml } from './feed.ts';
import { isIndexable, showSummary, upcomingShows } from './shows-data.ts';
import type { Show } from './shows-schema.ts';
import { absolute, showPath } from './site.ts';

/* ---------- Sitemap ---------- */

export type SitemapEntry = { loc: string; lastmod?: string };

/** Pages every build lists. /thanks/, the 404 page and redirect stubs never appear. */
export const SITEMAP_PAGES = ['/', '/shows/', '/epk/'];

/** Home, /shows/, /epk/, and show pages until INDEX_DAYS_AFTER days after the show, with lastmod from updatedAt. */
export function sitemapEntries(shows: Show[], now: DateTime): SitemapEntry[] {
  const showPages = shows
    .filter((s) => isIndexable(s, now))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((s) => ({ loc: absolute(showPath(s.slug)), lastmod: s.updatedAt }));
  return [...SITEMAP_PAGES.map((p) => ({ loc: absolute(p) })), ...showPages];
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map(
    (e) => `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${escapeXml(e.lastmod)}</lastmod>` : ''}\n  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function sitemapIndexXml(sitemaps: string[]): string {
  const items = sitemaps.map((loc) => `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n  </sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join('\n')}\n</sitemapindex>\n`;
}

/* ---------- robots.txt ---------- */

/** Named so the welcome is on the record, not just implied by `*`. */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
];

export function robotsTxt({ sitemap, noindex }: { sitemap: string; noindex: boolean }): string {
  const lines = [
    '# Everyone is welcome here, search engines and AI crawlers alike.',
    'User-agent: *',
    'Allow: /',
    '',
    ...AI_CRAWLERS.map((bot) => `User-agent: ${bot}`),
    'Allow: /',
    '',
    noindex ? '# Staging build: every page is noindex, so no sitemap.' : `Sitemap: ${sitemap}`,
  ];
  return `${lines.join('\n')}\n`;
}

/* ---------- llms.txt ---------- */

export type LlmsInput = {
  about: string[]; // third-person ledger sentences, already allowed for this use
  shows: Show[];
  now: DateTime;
  links: { name: string; url: string }[]; // live profiles and stores (profiles.yaml)
  email: string; // Johnny's work email (ADR 0021)
  limit?: number;
};

/** An llms.txt (llmstxt.org): who Johnny is, where things are, and how to book. */
export function llmsTxt({ about, shows, now, links, email, limit = 12 }: LlmsInput): string {
  const link = (text: string, path: string, note?: string) => `- [${text}](${absolute(path)})${note ? `: ${note}` : ''}`;
  const upcoming = upcomingShows(shows, now).slice(0, limit);
  const showLines = upcoming.map((s) => {
    const { date, time, town } = showSummary(s);
    const year = s.start.slice(0, 4);
    const status = s.status === 'cancelled' ? ' (cancelled)' : '';
    return `- [${date}, ${year}, ${time}: ${s.billing} at ${s.venue.name}, ${town}${status}](${absolute(showPath(s.slug))})`;
  });

  return [
    '# Johnny Rhoades',
    '',
    `> ${about[0] ?? ''}`,
    '',
    about.slice(1).join(' '),
    '',
    'The show list on this site is built from his Bandsintown calendar several times a day, so it is the most current source for where he is playing.',
    '',
    '## Pages',
    '',
    link('Home', '/', 'music, videos, the next shows, booking form and mailing list'),
    link('Shows', '/shows/', 'every upcoming show, plus past shows'),
    link('Press kit', '/epk/', 'bios, fast facts, photos, logos and how to book, for venues and festivals'),
    '',
    '## Upcoming shows',
    '',
    ...(showLines.length ? showLines : ['No public shows are announced right now. Check the shows page.']),
    '',
    '## Data',
    '',
    link('shows.json', '/shows.json', 'upcoming shows and the past year, with venues, addresses and times'),
    link('Calendar', '/shows.ics', 'iCalendar subscription for every upcoming show'),
    link('New shows feed', '/shows/feed.xml', 'RSS, one item per newly announced show'),
    '',
    '## Booking',
    '',
    link('Booking form', '/#book', 'for gigs, private events and festivals'),
    `- [${email}](mailto:${email}): his email, for booking and press`,
    '',
    '## Profiles and music',
    '',
    ...links.map((p) => `- [${p.name}](${p.url})`),
    '',
  ].join('\n');
}
