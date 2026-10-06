/*
  The parts of a Bandsintown event we use, validated loosely: Bandsintown
  adds fields over time, and empty strings are common for missing values.
  Modeled on a real response from 2026-09-30 (tests/fixtures/bandsintown/README.md).
*/
import { z } from 'zod';

export const ARTIST_ID = '11869348';
export const ARTIST_NAME = 'Johnny Rhoades';
export const API_BASE = 'https://rest.bandsintown.com';

const text = z.string().nullish().transform((v) => v?.trim() ?? '');

export const BitVenueSchema = z.looseObject({
  name: z.string().min(1),
  city: text,
  region: text,
  country: text,
  street_address: text,
  postal_code: text,
  latitude: z.union([z.string(), z.number()]).nullish(),
  longitude: z.union([z.string(), z.number()]).nullish(),
});

export const BitOfferSchema = z.looseObject({
  type: text,
  url: text,
  status: text,
});

export const BitEventSchema = z.looseObject({
  id: z.union([z.string(), z.number()]).transform(String),
  url: z.string(),
  datetime: z.string().min(1), // venue-local, no offset: "2026-10-02T18:00:00"
  starts_at: text,
  ends_at: text,
  title: text,
  description: text,
  venue: BitVenueSchema,
  lineup: z.array(z.string()).nullish().transform((v) => v ?? []),
  offers: z.array(BitOfferSchema).nullish().transform((v) => v ?? []),
  free: z.boolean().nullish(),
});

export type BitEvent = z.infer<typeof BitEventSchema>;

/**
 * Validates an API response. Bandsintown answers errors with a 200 and a
 * `{ errorMessage }` body, so anything that isn't an array is an error.
 */
export function parseEvents(json: unknown): BitEvent[] {
  if (!Array.isArray(json)) {
    const message = (json as { errorMessage?: unknown } | null)?.errorMessage;
    throw new Error(`Bandsintown returned an error: ${typeof message === 'string' ? message : JSON.stringify(json)}`);
  }
  return z.array(BitEventSchema).parse(json);
}

/**
 * A raw response, ready to save as a fixture. Bandsintown echoes the app_id
 * into every event and offer URL, and fixtures are committed to a public
 * repo, so every occurrence of the key becomes "REDACTED".
 */
export function captureText(json: unknown, appId: string): string {
  const text = `${JSON.stringify(json, null, 2)}\n`;
  return appId ? text.replaceAll(appId, 'REDACTED') : text;
}

export function eventsUrl(appId: string, date: 'upcoming' | 'past'): string {
  const url = new URL(`/artists/id_${ARTIST_ID}/events`, API_BASE);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('date', date);
  return url.href;
}
