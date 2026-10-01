/*
  iCalendar (RFC 5545) for /shows.ics and /shows/<slug>.ics.

  Times are written in UTC, which every calendar app handles and which
  sidesteps VTIMEZONE blocks. UIDs are stable per Bandsintown id, and
  SEQUENCE comes from the sync, so calendars update an event in place
  when its time or venue changes.
*/
import { DateTime } from 'luxon';
import { venueAddress, showWindow } from './links.ts';
import { ARTIST, SITE_HOST } from './site.ts';
import type { Show } from './shows-schema.ts';

const stamp = (d: DateTime) => d.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

/** Escapes TEXT values: backslash, semicolon, comma and newlines. */
export const escapeText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const utf8 = new TextEncoder();

/** Folds a content line at 75 octets, never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = utf8.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

const STATUS: Record<Show['status'], string> = {
  scheduled: 'CONFIRMED',
  rescheduled: 'CONFIRMED',
  postponed: 'TENTATIVE',
  cancelled: 'CANCELLED',
};

function eventLines(s: Show, pageUrl: string, now: DateTime): string[] {
  const { start, end } = showWindow(s);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${s.id}@${SITE_HOST}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SEQUENCE:${s.sequence}`,
    `STATUS:${STATUS[s.status]}`,
    `SUMMARY:${escapeText(`${s.status === 'cancelled' ? 'Cancelled: ' : ''}${s.billing} at ${s.venue.name}`)}`,
    `LOCATION:${escapeText(venueAddress(s))}`,
    `DESCRIPTION:${escapeText(`${s.billing} live at ${s.venue.name}, ${s.venue.city}.\n${pageUrl}`)}`,
    `URL:${pageUrl}`,
  ];
  if (s.venue.lat !== undefined && s.venue.lng !== undefined) lines.push(`GEO:${s.venue.lat};${s.venue.lng}`);
  lines.push('END:VEVENT');
  return lines;
}

export function buildCalendar({
  shows,
  name,
  urlFor,
  now,
}: {
  shows: Show[];
  name: string;
  urlFor: (s: Show) => string;
  now: DateTime;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${SITE_HOST}//Shows//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-CALDESC:${escapeText(`Where ${ARTIST} is playing. Updated a few times a day.`)}`,
    'X-WR-TIMEZONE:America/Detroit',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...shows.flatMap((s) => eventLines(s, urlFor(s), now)),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
