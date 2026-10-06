/* Site-wide settings shared by pages, feeds and structured data. */
import { DateTime } from 'luxon';
import { HOME_ZONE } from './time.ts';

export const SITE_URL = 'https://johnnyrhoades.com';

/** The site's source, public: the footer credit links here (PLAN.md section 7.1, with Johnny's OK). */
export const SITE_SOURCE = 'https://github.com/joe-at-heirloom/johnnyrhoades.com';
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

/**
 * Staging builds set SITE_NOINDEX=true (a repository variable): every page
 * gets noindex, robots.txt drops the sitemap, and IndexNow stays quiet.
 * PLAN.md section 14, steps 7 and 11.
 */
export const NOINDEX = process.env.SITE_NOINDEX === 'true';

/** IndexNow key. Public by design: it's served at /<key>.txt to prove the site is ours. */
export const INDEXNOW_KEY = '5dbf688a154337ece3e2407784b67ca8';

export const absolute = (path: string) => new URL(path, SITE_URL).href;
export const showPath = (slug: string) => `/shows/${slug}/`;

/** File name (without .zip) of the press photo download. */
export const PRESS_ZIP = 'johnny-rhoades-press-photos';
