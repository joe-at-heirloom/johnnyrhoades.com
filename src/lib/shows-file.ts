/*
  Reading and writing src/data/shows.json. Output is canonical (fixed key
  order, sorted shows, two-space indent, trailing newline) so the file only
  changes when the data does. The workflow relies on that to commit only on change.
*/
import { ShowsFileSchema, type Show } from './shows-schema.ts';

export function parseShowsFile(text: string): Show[] {
  return ShowsFileSchema.parse(JSON.parse(text));
}

/** JSON with object keys sorted, for comparing values regardless of key order. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

const SHOW_KEYS = ['id', 'slug', 'aliases', 'start', 'end', 'act', 'billing', 'lineup', 'rawTitle', 'venue', 'tickets', 'bandsintownUrl', 'status', 'public', 'firstSeen', 'updatedAt', 'sequence'] as const;
const VENUE_KEYS = ['key', 'name', 'street', 'city', 'region', 'postalCode', 'country', 'lat', 'lng', 'url', 'timeZone'] as const;
const TICKET_KEYS = ['url', 'price', 'free'] as const;

function pick<T extends object>(obj: T, keys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export function serializeShows(shows: Show[]): string {
  const sorted = [...shows].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const ordered = sorted.map((s) => {
    const out: Record<string, unknown> = pick(s, SHOW_KEYS);
    // Assigning an existing key keeps its position, so nested objects stay in order too.
    out.venue = pick(s.venue, VENUE_KEYS);
    if (s.tickets) out.tickets = pick(s.tickets, TICKET_KEYS);
    return out;
  });
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
