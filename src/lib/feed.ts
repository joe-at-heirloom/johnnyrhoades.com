/*
  RSS 2.0 of newly announced shows (/shows/feed.xml). Items are ordered by
  when the sync first saw a show, so new announcements surface first. That's
  what drives social post drafts and RSS-to-email (PLAN.md sections 3 and 11).
*/
import { DateTime } from 'luxon';
import { ARTIST } from './site.ts';
import type { Show } from './shows-schema.ts';
import { clockTime, longDate } from './time.ts';

export const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const rfc822 = (iso: string) => DateTime.fromISO(iso, { setZone: true }).toRFC2822() ?? iso;

export function buildFeed({
  shows,
  siteUrl,
  feedUrl,
  urlFor,
  now,
  limit = 50,
}: {
  shows: Show[];
  siteUrl: string;
  feedUrl: string;
  urlFor: (s: Show) => string;
  now: DateTime;
  limit?: number;
}): string {
  const items = [...shows]
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.start.localeCompare(b.start))
    .slice(0, limit)
    .map((s) => {
      const zone = s.venue.timeZone;
      const when = `${longDate(s.start, zone)} at ${clockTime(s.start, zone)}`;
      const title = `${s.status === 'cancelled' ? 'Cancelled: ' : ''}${s.billing} at ${s.venue.name}, ${s.venue.city}: ${when}`;
      return [
        '    <item>',
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(urlFor(s))}</link>`,
        `      <guid isPermaLink="false">bandsintown-${escapeXml(s.id)}</guid>`,
        `      <pubDate>${rfc822(s.firstSeen)}</pubDate>`,
        `      <description>${escapeXml(`${s.billing} plays ${s.venue.name} in ${s.venue.city} on ${when}.`)}</description>`,
        '    </item>',
      ].join('\n');
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(`${ARTIST}: new shows`)}</title>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(`New shows from ${ARTIST}, as they're announced.`)}</description>`,
    '    <language>en-us</language>',
    `    <lastBuildDate>${now.toRFC2822()}</lastBuildDate>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
