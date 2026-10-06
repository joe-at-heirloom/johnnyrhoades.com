#!/usr/bin/env node
/*
  Sync Johnny's shows from Bandsintown into src/data/shows.json (PLAN.md section 6.2).

    npm run sync                    # live API, needs BANDSINTOWN_APP_ID
    npm run sync -- --capture       # also save raw responses to tests/fixtures/bandsintown/
    npm run sync:fixtures           # offline, from tests/fixtures/bandsintown/
    npm run sync -- --force         # skip the guard (Johnny really did clear his calendar)
    npm run sync -- --now 2026-10-03T12:00:00-04:00   # pretend it's another time (testing)
    npm run sync -- --dry-run       # report what would change, write nothing

  Files are only written when something changed. sync-meta.json also gets a
  weekly heartbeat, so a quiet calendar never leaves the repo 60 days without
  a commit (GitHub would then disable the scheduled workflow).

  In GitHub Actions it writes `changed`, `summary` and `commit_message` to $GITHUB_OUTPUT.
*/
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DateTime } from 'luxon';
import { ARTIST_NAME, captureText, eventsUrl, parseEvents, type BitEvent } from '../src/lib/bandsintown.ts';
import { parseOverrides, parseSyncMeta, parseVenueBook, serializeSyncMeta, type SyncMeta } from '../src/lib/data-files.ts';
import { checkGuard, SyncGuardError } from '../src/lib/guard.ts';
import { applyOverride, describeSummary, mergeShows } from '../src/lib/merge.ts';
import { normalizeEvent } from '../src/lib/normalize.ts';
import { parseShowsFile, serializeShows } from '../src/lib/shows-file.ts';
import { HOME_ZONE, isAfter, nowIso } from '../src/lib/time.ts';

const HEARTBEAT_DAYS = 7;
const CAPTURE_DIR = 'tests/fixtures/bandsintown';

const { values: args } = parseArgs({
  options: {
    fixtures: { type: 'string' },
    data: { type: 'string', default: 'src/data' },
    now: { type: 'string' },
    force: { type: 'boolean', default: false },
    capture: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

const dataDir = args.data;
const files = {
  shows: join(dataDir, 'shows.json'),
  meta: join(dataDir, 'sync-meta.json'),
  venues: join(dataDir, 'venues.yaml'),
  overrides: join(dataDir, 'show-overrides.yaml'),
};

const readIfExists = async (path: string) => (existsSync(path) ? readFile(path, 'utf8') : '');

async function load(kind: 'upcoming' | 'past', now: DateTime): Promise<BitEvent[]> {
  if (args.fixtures) {
    return parseEvents(JSON.parse(await readFile(join(args.fixtures, `${kind}.json`), 'utf8')));
  }
  const appId = process.env.BANDSINTOWN_APP_ID;
  if (!appId) throw new Error('BANDSINTOWN_APP_ID is not set. Use --fixtures for an offline run.');
  const res = await fetch(eventsUrl(appId, kind), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Bandsintown (${kind}) answered HTTP ${res.status}.`);
  const json: unknown = await res.json();
  if (args.capture) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    const path = join(CAPTURE_DIR, `captured-${now.toISODate()}-${kind}.json`);
    await writeFile(path, captureText(json, appId));
    console.log(`Captured ${path}`);
  }
  return parseEvents(json);
}

async function output(values: Record<string, string>) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  await appendFile(path, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
}

async function main() {
  const now = args.now ? DateTime.fromISO(args.now, { setZone: true }) : DateTime.now().setZone(HOME_ZONE);
  if (!now.isValid) throw new Error(`--now "${args.now}" isn't a valid ISO date.`);
  const stamp = nowIso(now);

  const venues = parseVenueBook(await readIfExists(files.venues));
  const overrides = parseOverrides(await readIfExists(files.overrides));
  const previousText = await readIfExists(files.shows);
  const existing = previousText ? parseShowsFile(previousText) : [];
  const previousMetaText = await readIfExists(files.meta);
  const previousMeta = previousMetaText ? parseSyncMeta(previousMetaText) : undefined;

  const [upcomingRaw, pastRaw] = await Promise.all([load('upcoming', now), load('past', now)]);
  const ctx = { venues, artistName: ARTIST_NAME };
  const upcoming = upcomingRaw.map((e) => normalizeEvent(e, ctx));
  const upcomingIds = new Set(upcoming.map((s) => s.id));
  // A show that has just started can be in both lists; count it once.
  const past = pastRaw.map((e) => normalizeEvent(e, ctx)).filter((s) => !upcomingIds.has(s.id));

  if (args.force) {
    console.warn('--force: skipping the sync guard.');
  } else {
    const publicUpcoming = upcoming.filter((s) => applyOverride(s, overrides[s.id], ARTIST_NAME).public);
    checkGuard({ existing, freshUpcoming: publicUpcoming, now });
  }

  const { shows, summary } = mergeShows({ existing, fresh: [...upcoming, ...past], overrides, now, artistName: ARTIST_NAME });
  const nextText = serializeShows(shows);
  parseShowsFile(nextText); // never write a file the site can't read

  const changed = nextText !== previousText;
  const heartbeatDue =
    !previousMeta || DateTime.fromISO(previousMeta.heartbeatAt, { setZone: true }).plus({ days: HEARTBEAT_DAYS }) <= now;
  const description = describeSummary(summary);

  const meta: SyncMeta = {
    source: args.fixtures ? 'fixtures' : 'api',
    heartbeatAt: changed || heartbeatDue ? stamp : (previousMeta?.heartbeatAt ?? stamp),
    ...(previousMeta?.lastChangeAt && { lastChangeAt: previousMeta.lastChangeAt }),
    ...(previousMeta?.lastChangeSummary && { lastChangeSummary: previousMeta.lastChangeSummary }),
    ...(changed && { lastChangeAt: stamp, lastChangeSummary: description }),
    counts: {
      upcoming: shows.filter((s) => s.public && s.status === 'scheduled' && isAfter(s.start, now)).length,
      past: shows.filter((s) => !isAfter(s.start, now)).length,
      total: shows.length,
    },
  };
  // Between data changes and heartbeats the meta file stays put, so passing
  // shows (which shift the counts) don't cause commits on their own.
  const metaText = changed || heartbeatDue || !previousMetaText ? serializeSyncMeta(meta) : previousMetaText;
  const metaChanged = metaText !== previousMetaText;

  console.log(`Bandsintown (${meta.source}): ${upcoming.length} upcoming, ${past.length} past.`);
  console.log(`Shows: ${description}.${heartbeatDue && !changed ? ' Weekly heartbeat due.' : ''}`);
  for (const [label, ids] of Object.entries(summary)) if (ids.length) console.log(`  ${label}: ${ids.join(', ')}`);

  if (args['dry-run']) {
    console.log('Dry run: nothing written.');
  } else {
    if (changed) await writeFile(files.shows, nextText);
    if (metaChanged) await writeFile(files.meta, metaText);
  }

  const anyChange = changed || metaChanged;
  await output({
    changed: String(anyChange),
    shows_changed: String(changed),
    summary: description,
    commit_message: changed ? `chore(shows): sync ${description}` : 'chore(shows): weekly sync heartbeat',
  });
}

main().catch((err: unknown) => {
  if (err instanceof SyncGuardError) {
    console.error(`Sync guard: ${err.message}`);
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
});
