/*
  Merges freshly synced shows into the stored history (PLAN.md section 6.2).

  - Matches by Bandsintown id. History is never deleted.
  - An upcoming show that disappears from Bandsintown is removed, unless
    show-overrides.yaml marks it cancelled or postponed. Then it stays, with
    that status, so its page and EventCancelled markup stay up.
  - A material change (date, time, venue, act, status) bumps `sequence` and
    `updatedAt`. A slug change keeps the old slug in `aliases`.
  - Slugs are stable: once a show has one, it keeps it until its date or
    venue changes. A new show that collides gets its start time appended.
*/
import { DateTime } from 'luxon';
import { billingFor } from './act.ts';
import { stableStringify } from './shows-file.ts';
import type { Act, FreshShow, Show, ShowStatus } from './shows-schema.ts';
import { showSlug } from './slug.ts';
import { isAfter, localDate, nowIso, slugTime } from './time.ts';

export type Override = {
  act?: Act;
  billing?: string;
  status?: ShowStatus;
  public?: boolean;
  note?: string;
};
export type Overrides = Record<string, Override>;

export type MergeSummary = { added: string[]; updated: string[]; removed: string[] };

export function applyOverride(show: FreshShow, o: Override | undefined, artistName: string): FreshShow {
  if (!o) return show;
  const act = o.act ?? show.act;
  const billing = o.billing ?? (o.act ? billingFor({ act, title: show.rawTitle ?? '', lineup: show.lineup, artistName }) : show.billing);
  return { ...show, act, billing, status: o.status ?? show.status, public: o.public ?? show.public };
}

const material = (s: Pick<Show, 'start' | 'venue' | 'act' | 'status' | 'billing' | 'public'>) =>
  JSON.stringify([s.start, s.venue.key, s.venue.name, s.act, s.billing, s.status, s.public]);

const baseSlug = (s: FreshShow) => showSlug(localDate(s.start, s.venue.timeZone), s.venue.name, s.venue.city);

export function mergeShows({
  existing,
  fresh,
  overrides,
  now,
  artistName,
}: {
  existing: Show[];
  fresh: FreshShow[];
  overrides: Overrides;
  now: DateTime;
  artistName: string;
}): { shows: Show[]; summary: MergeSummary } {
  const stamp = nowIso(now);
  const summary: MergeSummary = { added: [], updated: [], removed: [] };
  const byId = new Map(existing.map((s) => [s.id, s]));
  const freshIds = new Set(fresh.map((s) => s.id));
  const out: Show[] = [];

  // Slugs already claimed by stored shows (current and old ones) stay theirs.
  const taken = new Map<string, string>();
  for (const s of existing) for (const slug of [s.slug, ...s.aliases]) taken.set(slug, s.id);
  const claim = (wanted: string, id: string, f: FreshShow): string => {
    const candidates = [wanted, `${wanted}-${slugTime(f.start, f.venue.timeZone)}`];
    for (let n = 2; n < 50; n++) candidates.push(`${wanted}-${n}`);
    const slug = candidates.find((c) => !taken.has(c) || taken.get(c) === id) ?? `${wanted}-${id}`;
    taken.set(slug, id);
    return slug;
  };

  // Stored shows first, so they keep their slugs; then new ones, oldest start first.
  const ordered = [...fresh].sort((a, b) => Number(byId.has(b.id)) - Number(byId.has(a.id)) || a.start.localeCompare(b.start));

  for (const raw of ordered) {
    const f = applyOverride(raw, overrides[raw.id], artistName);
    const prev = byId.get(f.id);
    if (!prev) {
      out.push({ ...f, slug: claim(baseSlug(f), f.id, f), aliases: [], firstSeen: stamp, updatedAt: stamp, sequence: 0 });
      summary.added.push(f.id);
      continue;
    }
    const changed = material(prev) !== material(f);
    const wanted = baseSlug(f);
    const prevBase = baseSlug(prev);
    const slug = wanted === prevBase ? prev.slug : claim(wanted, f.id, f);
    const aliases = slug === prev.slug ? prev.aliases : [...new Set([...prev.aliases, prev.slug])];
    out.push({
      ...f,
      slug,
      aliases,
      firstSeen: prev.firstSeen,
      updatedAt: changed ? stamp : prev.updatedAt,
      sequence: changed ? prev.sequence + 1 : prev.sequence,
    });
    if (changed || stableStringify(prev) !== stableStringify(out.at(-1))) summary.updated.push(f.id);
  }

  // Stored shows Bandsintown no longer lists.
  for (const prev of existing) {
    if (freshIds.has(prev.id)) continue;
    const o = overrides[prev.id];
    if (!isAfter(prev.start, now)) {
      out.push(o?.status && o.status !== prev.status ? { ...prev, status: o.status, updatedAt: stamp, sequence: prev.sequence + 1 } : prev);
      continue; // history stays
    }
    if (o?.status === 'cancelled' || o?.status === 'postponed') {
      const status = o.status;
      const changed = prev.status !== status;
      out.push(changed ? { ...prev, status, updatedAt: stamp, sequence: prev.sequence + 1 } : prev);
      if (changed) summary.updated.push(prev.id);
      continue;
    }
    summary.removed.push(prev.id);
  }

  out.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  return { shows: out, summary };
}

export function describeSummary({ added, updated, removed }: MergeSummary): string {
  const parts = [
    added.length && `+${added.length} new`,
    updated.length && `${updated.length} updated`,
    removed.length && `${removed.length} removed`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'no changes';
}

