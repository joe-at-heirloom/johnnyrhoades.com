/* Outbound links built from show data: directions and add-to-calendar. */
import { DateTime } from 'luxon';
import { DEFAULT_SET_HOURS } from './site.ts';
import type { Show } from './shows-schema.ts';

/** One-line address: "Blue Goose Inn, 28911 Jefferson Ave, St. Clair Shores, MI 48080". */
export function venueAddress(s: Show): string {
  const v = s.venue;
  const regionZip = [v.region, v.postalCode].filter(Boolean).join(' ');
  return [v.name, v.street, v.city, regionZip].filter(Boolean).join(', ');
}

/** Google Maps search for the venue (PLAN.md section 7.2: no embedded map). */
export const directionsUrl = (s: Show) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress(s))}`;

/** Start and end as UTC instants. Shows without an end get DEFAULT_SET_HOURS. */
export function showWindow(s: Show): { start: DateTime; end: DateTime } {
  const start = DateTime.fromISO(s.start, { setZone: true }).toUTC();
  const end = s.end ? DateTime.fromISO(s.end, { setZone: true }).toUTC() : start.plus({ hours: DEFAULT_SET_HOURS });
  return { start, end };
}

const gcalStamp = (d: DateTime) => d.toFormat("yyyyMMdd'T'HHmmss'Z'");

/** Google Calendar "add event" template link. */
export function googleCalendarUrl(s: Show, pageUrl: string): string {
  const { start, end } = showWindow(s);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${s.billing} at ${s.venue.name}`,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
    details: pageUrl,
    location: venueAddress(s),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
