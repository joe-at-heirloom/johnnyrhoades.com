/* Bandsintown event → FreshShow (PLAN.md section 6.1). Pure: no I/O, no clock. */
import { billingFor, inferAct } from './act.ts';
import type { BitEvent } from './bandsintown.ts';
import type { FreshShow } from './shows-schema.ts';
import { localToIso, venueZone } from './time.ts';
import { known, venueEntry, venueKey, type VenueBook } from './venues.ts';

const COUNTRY_CODES: Record<string, string> = {
  'united states': 'US',
  usa: 'US',
  us: 'US',
  canada: 'CA',
  ca: 'CA',
  mexico: 'MX',
};

export const countryCode = (country: string) => COUNTRY_CODES[country.trim().toLowerCase()] ?? (country.trim().slice(0, 2).toUpperCase() || 'US');

const num = (v: string | number | null | undefined): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const http = (v: string | undefined) => (v && /^https?:\/\//.test(v) ? v : undefined);

/** Bandsintown event URLs carry tracking parameters (and our app_id); keep the bare event link. */
export const cleanEventUrl = (url: string) => {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
};

export function normalizeEvent(raw: BitEvent, ctx: { venues: VenueBook; artistName: string }): FreshShow {
  const key = venueKey(raw.venue.name, ctx.venues);
  const entry = venueEntry(key, ctx.venues);
  const country = countryCode(raw.venue.country);
  const region = known(entry.region) ?? raw.venue.region;
  const timeZone = venueZone(region, country);

  const act = inferAct({ title: raw.title, lineup: raw.lineup, artistName: ctx.artistName });
  const ticketUrl = http(raw.offers.find((o) => /ticket/i.test(o.type) && o.url)?.url);
  const free = raw.free === true || /\bfree\b/i.test(raw.description) || undefined;

  const show: FreshShow = {
    id: raw.id,
    start: localToIso(raw.starts_at || raw.datetime, timeZone),
    act,
    billing: billingFor({ act, title: raw.title, lineup: raw.lineup, artistName: ctx.artistName }),
    lineup: raw.lineup,
    venue: {
      key,
      name: known(entry.name) ?? raw.venue.name,
      city: known(entry.city) ?? raw.venue.city,
      region,
      country,
      timeZone,
    },
    bandsintownUrl: cleanEventUrl(raw.url),
    status: 'scheduled',
    public: true,
  };

  // Optional fields are only set when known, so the JSON stays free of empty values.
  if (raw.ends_at) show.end = localToIso(raw.ends_at, timeZone);
  if (raw.title) show.rawTitle = raw.title;
  const street = known(entry.street) ?? (raw.venue.street_address || undefined);
  const postalCode = known(entry.postalCode) ?? (raw.venue.postal_code || undefined);
  const url = http(known(entry.url));
  const lat = num(raw.venue.latitude);
  const lng = num(raw.venue.longitude);
  if (street) show.venue.street = street;
  if (postalCode) show.venue.postalCode = postalCode;
  if (url) show.venue.url = url;
  if (lat !== undefined && lng !== undefined) Object.assign(show.venue, { lat, lng });
  if (ticketUrl || free) show.tickets = { ...(ticketUrl && { url: ticketUrl }), ...(free && { free }) };

  return show;
}
