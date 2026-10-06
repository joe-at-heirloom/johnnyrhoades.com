/*
  Runs scripts/sync-shows.ts end to end against temp copies of the data and
  fixtures: what it writes, when it writes nothing, the guard and the heartbeat.
*/
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseShowsFile } from '../../src/lib/shows-file.ts';

let dir: string;
let data: string;
let fixtures: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jr-sync-'));
  data = join(dir, 'data');
  fixtures = join(dir, 'fixtures');
  cpSync('src/data', data, { recursive: true });
  rmSync(join(data, 'shows.json'), { force: true });
  rmSync(join(data, 'sync-meta.json'), { force: true });
  cpSync('tests/fixtures/bandsintown', fixtures, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function sync(now: string, ...extra: string[]) {
  const out = join(dir, 'github-output');
  writeFileSync(out, '');
  try {
    const stdout = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'scripts/sync-shows.ts', '--fixtures', fixtures, '--data', data, '--now', now, ...extra],
      { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out }, stdio: 'pipe' },
    );
    return { code: 0, stdout, outputs: Object.fromEntries(readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2))) };
  } catch (err) {
    const e = err as { status: number; stderr: string };
    return { code: e.status, stdout: e.stderr, outputs: {} as Record<string, string> };
  }
}

const read = (name: string) => readFileSync(join(data, name), 'utf8');

describe('sync-shows', () => {
  it('builds a valid shows.json from the fixtures', () => {
    const r = sync('2026-09-30T21:00:00-04:00');
    expect(r.code).toBe(0);
    // The fixtures are the real capture from 2026-10-05: 5 upcoming shows and 604 past ones, back to 2015.
    expect(r.outputs).toMatchObject({ changed: 'true', shows_changed: 'true', commit_message: 'chore(shows): sync +609 new' });
    const shows = parseShowsFile(read('shows.json'));
    expect(shows).toHaveLength(609);
    expect(JSON.parse(read('sync-meta.json'))).toMatchObject({ source: 'fixtures', counts: { total: 609 } });
  });

  it('writes nothing when nothing changed', () => {
    sync('2026-09-30T21:00:00-04:00');
    const before = [read('shows.json'), read('sync-meta.json')];
    const r = sync('2026-10-01T09:00:00-04:00');
    expect(r.outputs.changed).toBe('false');
    expect([read('shows.json'), read('sync-meta.json')]).toEqual(before);
  });

  it('writes a heartbeat after a quiet week, without touching the shows', () => {
    sync('2026-09-30T21:00:00-04:00');
    const shows = read('shows.json');
    const r = sync('2026-10-08T09:00:00-04:00');
    expect(r.outputs).toMatchObject({ changed: 'true', shows_changed: 'false', commit_message: 'chore(shows): weekly sync heartbeat' });
    expect(read('shows.json')).toBe(shows);
    expect(JSON.parse(read('sync-meta.json')).heartbeatAt).toBe('2026-10-08T09:00:00-04:00');
  });

  it('fails and writes nothing when Bandsintown suddenly returns no upcoming shows', () => {
    sync('2026-09-30T21:00:00-04:00');
    const before = read('shows.json');
    writeFileSync(join(fixtures, 'upcoming.json'), '[]');
    const r = sync('2026-10-01T09:00:00-04:00');
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/Sync guard: Bandsintown returned no upcoming shows/);
    expect(read('shows.json')).toBe(before);
  });

  it('lets --force through the guard', () => {
    sync('2026-09-30T21:00:00-04:00');
    writeFileSync(join(fixtures, 'upcoming.json'), '[]');
    const r = sync('2026-10-01T09:00:00-04:00', '--force');
    expect(r.code).toBe(0);
    // The five upcoming shows go; Oct 2 and 4 stay, since the capture lists them as past.
    expect(r.outputs.summary).toBe('5 removed');
  });

  it('fails on a Bandsintown error body', () => {
    writeFileSync(join(fixtures, 'past.json'), '{"errorMessage":"[NotFound] The artist was not found"}');
    const r = sync('2026-09-30T21:00:00-04:00');
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/artist was not found/);
  });
});
