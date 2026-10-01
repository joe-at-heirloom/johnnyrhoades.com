/*
  IndexNow (PLAN.md section 6.2, step 9): after a deploy, tell Bing and the
  other IndexNow engines which show URLs are new or changed, so a gig added in
  Bandsintown is searchable within hours instead of whenever the crawler
  comes back.

  "Changed" is worked out by comparing the /shows.json that's live before the
  deploy with the one just built. No state to keep, and it works the same for
  a sync, a code change or the nightly rebuild.
*/

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

type PublicShow = { id: string; url: string | null };
export type ShowsSnapshot = { upcoming: PublicShow[]; past: PublicShow[] };

const byId = (snap: ShowsSnapshot) => new Map([...snap.upcoming, ...snap.past].map((s) => [s.id, s]));

/**
 * Show URLs that are new, changed in any public field, or gone from the
 * upcoming list, plus the pages that list shows when anything moved.
 * Without a previous snapshot (first deploy), every URL in `fallback` (the sitemap).
 */
export function changedUrls(before: ShowsSnapshot | null, after: ShowsSnapshot, listingPages: string[], fallback: string[]): string[] {
  if (!before) return [...new Set(fallback)];
  const old = byId(before);
  const now = byId(after);
  const urls = new Set<string>();
  for (const [id, show] of now) {
    const prev = old.get(id);
    if (show.url && (!prev || JSON.stringify(prev) !== JSON.stringify(show))) urls.add(show.url);
  }
  for (const show of before.upcoming) {
    if (!now.has(show.id) && show.url) urls.add(show.url); // taken down: let the engines drop it
  }
  if (urls.size) for (const page of listingPages) urls.add(page);
  return [...urls];
}

export function indexNowBody(urls: string[], { host, key }: { host: string; key: string }) {
  return { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls.slice(0, 10_000) };
}

/** Accepts a parsed /shows.json, or null for anything that isn't one (a 404 page, the old site). */
export function asSnapshot(data: unknown): ShowsSnapshot | null {
  if (!data || typeof data !== 'object') return null;
  const { upcoming, past } = data as Partial<ShowsSnapshot>;
  return Array.isArray(upcoming) && Array.isArray(past) ? { upcoming, past } : null;
}
