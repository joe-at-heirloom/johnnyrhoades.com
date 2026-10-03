/* Build-time data, validated once. A bad file fails the build instead of shipping. */
import raw from '../data/shows.json';
import venuesYaml from '../data/venues.yaml?raw';
import { parseVenueBook } from './data-files.ts';
import { buildNow } from './site.ts';
import { ShowsFileSchema, type Show } from './shows-schema.ts';
import type { VenueBook } from './venues.ts';

export const allShows: Show[] = ShowsFileSchema.parse(raw);
export const venueBook: VenueBook = parseVenueBook(venuesYaml);

/** One "now" for the whole build, so every page agrees on what's upcoming. */
export const BUILD_NOW = buildNow();
