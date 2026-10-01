/*
  Venue details from src/data/venues.yaml, matched to Bandsintown's venue by
  name. Hand-kept fields win over Bandsintown's, except values still marked
  TODO, which count as missing.
*/
import { slugify } from './slug.ts';

export type VenueEntry = {
  match?: string[];
  name?: string;
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  url?: string;
  blurb?: string;
};

export type VenueBook = Record<string, VenueEntry>;

/** "TODO: …" placeholders are notes for people, never data. */
export const known = (value: string | undefined): string | undefined =>
  value && !/^TODO\b/i.test(value.trim()) ? value.trim() : undefined;

/** Finds the venues.yaml key for a Bandsintown venue name, or derives one from the name. */
export function venueKey(name: string, book: VenueBook): string {
  const target = slugify(name);
  for (const [key, entry] of Object.entries(book)) {
    const names = [key, entry.name ?? '', ...(entry.match ?? [])].map(slugify);
    if (names.includes(target)) return key;
  }
  return target;
}

export const venueEntry = (key: string, book: VenueBook): VenueEntry => book[key] ?? {};
