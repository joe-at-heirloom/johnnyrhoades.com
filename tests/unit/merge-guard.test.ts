import { describe, expect, it } from 'vitest';
import { ARTIST_NAME } from '../../src/lib/bandsintown.ts';
import { checkGuard, SyncGuardError } from '../../src/lib/guard.ts';
import { describeSummary, mergeShows, type Overrides } from '../../src/lib/merge.ts';
import { parseShowsFile, serializeShows } from '../../src/lib/shows-file.ts';
import type { FreshShow, Show } from '../../src/lib/shows-schema.ts';
import { at, fresh } from './helpers.ts';

const NOW = at('2026-10-01T12:00:00-04:00');
const LATER = at('2026-10-05T12:00:00-04:00');

const merge = (existing: Show[], incoming: FreshShow[], overrides: Overrides = {}, now = NOW) =>
  mergeShows({ existing, fresh: incoming, overrides, now, artistName: ARTIST_NAME });

const goose = (over = {}) => fresh({ id: '500', datetime: '2026-10-23T21:00:00', venue: { name: 'Blue Goose Inn', city: 'St. Clair Shores' }, ...over });
const tavern = (over = {}) => fresh({ id: '466', datetime: '2026-10-02T18:00:00', venue: { name: '15th Street Tavern', city: 'Clarkston' }, ...over });

describe('mergeShows', () => {
  it('adds new shows with history fields', () => {
    const { shows, summary } = merge([], [goose()]);
    expect(summary.added).toEqual(['500']);
    expect(shows[0]).toMatchObject({
      slug: '2026-10-23-blue-goose-inn-st-clair-shores',
      aliases: [],
      firstSeen: '2026-10-01T12:00:00-04:00',
      updatedAt: '2026-10-01T12:00:00-04:00',
      sequence: 0,
    });
  });

  it('changes nothing when nothing changed', () => {
    const first = merge([], [goose(), tavern()]).shows;
    const { shows, summary } = merge(first, [goose(), tavern()], {}, LATER);
    expect(describeSummary(summary)).toBe('no changes');
    expect(serializeShows(shows)).toBe(serializeShows(first));
  });

  it('bumps sequence and updatedAt on a material change, and keeps firstSeen', () => {
    const first = merge([], [goose()]).shows;
    const { shows, summary } = merge(first, [goose({ datetime: '2026-10-23T20:00:00' })], {}, LATER);
    expect(summary.updated).toEqual(['500']);
    expect(shows[0]).toMatchObject({ sequence: 1, firstSeen: first[0]!.firstSeen, updatedAt: '2026-10-05T12:00:00-04:00' });
  });

  it('updates non-material details without bumping the sequence', () => {
    const first = merge([], [goose()]).shows;
    const withTickets = goose({ offers: [{ type: 'Tickets', url: 'https://tix.example/500', status: 'available' }] });
    const { shows, summary } = merge(first, [withTickets], {}, LATER);
    expect(summary.updated).toEqual(['500']);
    expect(shows[0]).toMatchObject({ sequence: 0, tickets: { url: 'https://tix.example/500' } });
  });

  it('keeps the old slug as an alias when the date moves', () => {
    const first = merge([], [goose()]).shows;
    const { shows } = merge(first, [goose({ datetime: '2026-10-30T21:00:00' })], {}, LATER);
    expect(shows[0]!.slug).toBe('2026-10-30-blue-goose-inn-st-clair-shores');
    expect(shows[0]!.aliases).toEqual(['2026-10-23-blue-goose-inn-st-clair-shores']);
  });

  it('gives a second show at the same room on the same day its start time, without renaming the first', () => {
    const first = merge([], [goose()]).shows;
    const matinee = goose({ id: '501', datetime: '2026-10-23T15:00:00' });
    const { shows } = merge(first, [goose(), matinee], {}, LATER);
    expect(shows.find((s) => s.id === '500')!.slug).toBe('2026-10-23-blue-goose-inn-st-clair-shores');
    expect(shows.find((s) => s.id === '501')!.slug).toBe('2026-10-23-blue-goose-inn-st-clair-shores-3pm');
    expect(() => parseShowsFile(serializeShows(shows))).not.toThrow(); // slugs unique
  });

  it('removes an upcoming show that disappears from Bandsintown', () => {
    const first = merge([], [goose(), tavern()]).shows;
    const { shows, summary } = merge(first, [tavern()], {}, LATER);
    expect(summary.removed).toEqual(['500']);
    expect(shows.map((s) => s.id)).toEqual(['466']);
  });

  it('keeps a disappeared show marked cancelled, with its status changed', () => {
    const first = merge([], [goose(), tavern()]).shows;
    const { shows } = merge(first, [tavern()], { '500': { status: 'cancelled' } }, LATER);
    expect(shows.find((s) => s.id === '500')).toMatchObject({ status: 'cancelled', sequence: 1 });
  });

  it('never deletes history', () => {
    const first = merge([], [goose(), tavern()]).shows;
    // The tavern show (Oct 2) has passed by LATER and Bandsintown dropped it.
    const { shows, summary } = merge(first, [goose()], {}, LATER);
    expect(summary.removed).toEqual([]);
    expect(shows.map((s) => s.id)).toEqual(['466', '500']);
  });

  it('applies overrides: act, billing and visibility', () => {
    const overrides: Overrides = { '500': { act: 'guest', billing: 'Jill Jack, with Johnny Rhoades' }, '466': { public: false } };
    const { shows } = merge([], [goose(), tavern()], overrides);
    expect(shows.find((s) => s.id === '500')).toMatchObject({ act: 'guest', billing: 'Jill Jack, with Johnny Rhoades' });
    expect(shows.find((s) => s.id === '466')!.public).toBe(false);
  });

  it('derives billing from an act override', () => {
    const { shows } = merge([], [goose()], { '500': { act: 'trio' } });
    expect(shows[0]!.billing).toBe('Johnny Rhoades Trio');
  });

  it('writes a canonical, validated file', () => {
    const text = serializeShows(merge([], [goose(), tavern()]).shows);
    expect(text.endsWith('\n')).toBe(true);
    expect(parseShowsFile(text).map((s) => s.id)).toEqual(['466', '500']); // sorted by start
  });
});

describe('checkGuard', () => {
  const stored = merge([], [
    goose(),
    tavern(),
    fresh({ id: '473', datetime: '2026-10-04T18:00:00', venue: { name: 'The Token Lounge', city: 'Westland' } }),
    fresh({ id: '477', datetime: '2026-10-10T14:00:00', venue: { name: "Octopus' Beer Garden", city: 'Mount Clemens' } }),
  ]).shows;

  it('blocks an empty upcoming list when shows are stored', () => {
    expect(() => checkGuard({ existing: stored, freshUpcoming: [], now: NOW })).toThrow(SyncGuardError);
  });

  it('allows an empty list when fewer than three future shows are stored', () => {
    expect(() => checkGuard({ existing: stored.slice(0, 2), freshUpcoming: [], now: NOW })).not.toThrow();
  });

  it('blocks a collapsed list', () => {
    const many = merge(
      [],
      Array.from({ length: 10 }, (_, i) => fresh({ id: String(900 + i), datetime: `2026-11-${String(i + 1).padStart(2, '0')}T20:00:00` })),
    ).shows;
    const twoLeft = many.slice(0, 2).map((s) => fresh({ id: s.id }));
    expect(() => checkGuard({ existing: many, freshUpcoming: twoLeft, now: NOW })).toThrow(/missing/);
  });

  it('allows ordinary changes', () => {
    const allButOne = [tavern(), goose(), fresh({ id: '473', datetime: '2026-10-04T18:00:00' })];
    expect(() => checkGuard({ existing: stored, freshUpcoming: allButOne, now: NOW })).not.toThrow();
  });
});
