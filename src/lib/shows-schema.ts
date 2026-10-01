/*
  The shape of src/data/shows.json (PLAN.md section 6.1), validated with zod
  when it's written by the sync and when the site reads it.

  Two fields beyond the plan, because reality needed them (ADR 0006):
  - `end`: Bandsintown sometimes has an end time; ICS and MusicEvent use it.
  - `venue.timeZone`: the IANA zone the times were given in, so pages can
    format them as the venue's local time.
*/
import { z } from 'zod';

export const ACTS = ['solo', 'trio', 'band', 'guest', 'host', 'unspecified'] as const;
export const STATUSES = ['scheduled', 'cancelled', 'postponed', 'rescheduled'] as const;

const isoWithOffset = z.iso.datetime({ offset: true });

export const VenueSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  street: z.string().optional(),
  city: z.string().min(1),
  region: z.string(),
  postalCode: z.string().optional(),
  country: z.string().length(2), // ISO 3166-1 alpha-2
  lat: z.number().optional(),
  lng: z.number().optional(),
  url: z.url().optional(),
  timeZone: z.string().min(1),
});

export const ShowSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/),
  aliases: z.array(z.string()),
  start: isoWithOffset,
  end: isoWithOffset.optional(),
  act: z.enum(ACTS),
  billing: z.string().min(1),
  lineup: z.array(z.string()),
  rawTitle: z.string().optional(),
  venue: VenueSchema,
  tickets: z
    .object({ url: z.url().optional(), price: z.number().nonnegative().optional(), free: z.boolean().optional() })
    .optional(),
  bandsintownUrl: z.url(),
  status: z.enum(STATUSES),
  public: z.boolean(),
  firstSeen: isoWithOffset,
  updatedAt: isoWithOffset,
  sequence: z.number().int().nonnegative(),
});

export const ShowsFileSchema = z.array(ShowSchema).superRefine((shows, ctx) => {
  const seen = new Map<string, string>();
  for (const s of shows) {
    for (const slug of [s.slug, ...s.aliases]) {
      const owner = seen.get(slug);
      if (owner && owner !== s.id) ctx.addIssue({ code: 'custom', message: `Slug "${slug}" is used by shows ${owner} and ${s.id}` });
      seen.set(slug, s.id);
    }
  }
});

export type Act = (typeof ACTS)[number];
export type ShowStatus = (typeof STATUSES)[number];
export type Venue = z.infer<typeof VenueSchema>;
export type Show = z.infer<typeof ShowSchema>;

/** A show as it comes out of normalize(), before merge assigns history fields. */
export type FreshShow = Omit<Show, 'slug' | 'aliases' | 'firstSeen' | 'updatedAt' | 'sequence'>;
