/*
  Dates and times. Bandsintown gives venue-local times with no UTC offset, so
  every conversion goes through luxon with an explicit IANA zone. Never pass a
  Bandsintown datetime to `new Date()` (CLAUDE.md, non-negotiable 4).
*/
import { DateTime } from 'luxon';

export const HOME_ZONE = 'America/Detroit';

/*
  Zone for a venue's region. Johnny plays almost entirely in Michigan, so
  this is a short table for neighbors and likely road trips, defaulting to
  Detroit. States that span two zones use the zone most of the state is in.
*/
const REGION_ZONES: Record<string, string> = {
  MI: HOME_ZONE,
  OH: 'America/New_York',
  IN: 'America/Indiana/Indianapolis',
  IL: 'America/Chicago',
  WI: 'America/Chicago',
  MN: 'America/Chicago',
  KY: 'America/New_York',
  TN: 'America/Chicago',
  MS: 'America/Chicago',
  LA: 'America/Chicago',
  TX: 'America/Chicago',
  MO: 'America/Chicago',
  PA: 'America/New_York',
  NY: 'America/New_York',
  GA: 'America/New_York',
  FL: 'America/New_York',
  CA: 'America/Los_Angeles',
  ON: 'America/Toronto',
};

export function venueZone(region: string, country: string): string {
  if (country && !['US', 'CA'].includes(country)) return HOME_ZONE;
  return REGION_ZONES[region.toUpperCase()] ?? HOME_ZONE;
}

/**
 * "2026-10-02T18:00:00" in a zone → "2026-10-02T18:00:00.000-04:00".
 * A time that doesn't exist (spring forward, 2:30 am) moves forward an hour;
 * an ambiguous one (fall back, 1:30 am) takes the first, daylight-time instance.
 */
export function localToIso(local: string, zone: string): string {
  const dt = DateTime.fromISO(local, { zone, setZone: true });
  if (!dt.isValid) throw new Error(`Invalid date "${local}": ${dt.invalidExplanation ?? dt.invalidReason}`);
  return dt.toISO({ suppressMilliseconds: true }) ?? local;
}

const inZone = (iso: string, zone: string) => DateTime.fromISO(iso, { setZone: true }).setZone(zone);

/** "2026-10-02": the calendar date at the venue. */
export const localDate = (iso: string, zone: string) => inZone(iso, zone).toISODate() ?? iso.slice(0, 10);

/** "Fri, Oct 2" */
export const shortDate = (iso: string, zone: string) => inZone(iso, zone).toFormat('ccc, LLL d');

/** "Friday, October 2" */
export const longDate = (iso: string, zone: string) => inZone(iso, zone).toFormat('cccc, LLLL d');

/** "Fri Oct 2, 2026" (page titles) */
export const titleDate = (iso: string, zone: string) => inZone(iso, zone).toFormat('ccc LLL d, yyyy');

/** "6 pm", "7:30 pm" */
export function clockTime(iso: string, zone: string): string {
  const dt = inZone(iso, zone);
  return `${dt.toFormat(dt.minute === 0 ? 'h' : 'h:mm')} ${dt.hour < 12 ? 'am' : 'pm'}`;
}

/** "8pm", "730pm" (slug suffixes) */
export const slugTime = (iso: string, zone: string) => clockTime(iso, zone).replace(/[: ]/g, '');

export const isAfter = (iso: string, now: DateTime) => DateTime.fromISO(iso, { setZone: true }) > now;

export const nowIso = (now: DateTime) => now.setZone(HOME_ZONE).startOf('second').toISO({ suppressMilliseconds: true }) ?? '';
