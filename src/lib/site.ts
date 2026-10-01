/* Site-wide settings shared by pages, feeds and structured data. */
import { DateTime } from 'luxon';
import { HOME_ZONE } from './time.ts';

export const SITE_URL = 'https://johnnyrhoades.com';
export const SITE_HOST = 'johnnyrhoades.com';
export const ARTIST = 'Johnny Rhoades';
export const BANDSINTOWN_PROFILE = 'https://www.bandsintown.com/a/11869348';

/**
 * Shows dated before this get no page, only an archive row and a place in
 * the counts (PLAN.md section 7.2: "more than 30 days before launch").
 * Set it to launch day minus 30 days when the launch date is known.
 */
export const PAGES_FROM = '2026-09-01';

/** Days after a show before its page goes noindex and leaves the sitemap. */
export const INDEX_DAYS_AFTER = 30;

/** A show counts as "on" until this long after it starts, when Bandsintown has no end time. */
export const LIVE_HOURS = 4;

/** Calendar entries need an end; most gigs run about three hours. Only used in ICS and calendar links. */
export const DEFAULT_SET_HOURS = 3;

/**
 * "Now" for a build. SITE_NOW pins it (tests, and rebuilding a past state);
 * otherwise it's the real time. Everything that depends on the date takes a
 * `now` argument, so nothing reads the clock behind your back.
 */
export function buildNow(): DateTime {
  const pinned = process.env.SITE_NOW;
  const now = pinned ? DateTime.fromISO(pinned, { setZone: true }) : DateTime.now();
  if (!now.isValid) throw new Error(`SITE_NOW "${pinned}" isn't a valid ISO date.`);
  return now.setZone(HOME_ZONE);
}

export const absolute = (path: string) => new URL(path, SITE_URL).href;
export const showPath = (slug: string) => `/shows/${slug}/`;

/** File name (without .zip) of the press photo download. */
export const PRESS_ZIP = 'johnny-rhoades-press-photos';
