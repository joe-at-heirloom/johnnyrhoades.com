/* The record player's data and the booking form's date check (ADR 0016). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { availability, type BookedDay } from '../../src/lib/availability.ts';
import { parseMedia } from '../../src/lib/media.ts';
import { appleAlbumId, isAllowedPreview, previewsFromLookup, setPreviews } from '../../src/lib/previews.ts';
import { CSP_DIRECTIVES } from '../../src/lib/security-headers.ts';

const yaml = readFileSync('src/data/media.yaml', 'utf8');
const media = parseMedia(yaml);

describe('song previews', () => {
  it('every track has a clip, from Apple until Johnny’s own files arrive', () => {
    expect(media.album.previewSource).toBe('apple');
    for (const t of media.album.tracks) expect(t.preview, t.title).toMatch(/^https:\/\/audio-ssl\.itunes\.apple\.com\/.+\.m4a$/);
  });

  it('only allows Apple’s clips or files the site serves', () => {
    expect(isAllowedPreview('https://audio-ssl.itunes.apple.com/itunes-assets/x.m4a')).toBe(true);
    expect(isAllowedPreview('/audio/two-way-street.mp3')).toBe(true);
    expect(isAllowedPreview('https://example.com/clip.mp3')).toBe(false);
    expect(isAllowedPreview('/audio/../secret.mp3')).toBe(false);
    expect(() => parseMedia(yaml.replace('preview: "https://audio-ssl.itunes.apple.com/', 'preview: "https://example.com/'))).toThrow(/Apple Music clip/);
  });

  it('reads the album id and the clips from an iTunes lookup', () => {
    expect(appleAlbumId(media.album.appleMusic)).toBe('942326904');
    const lookup = {
      results: [
        { wrapperType: 'collection', collectionId: 942326904 },
        { wrapperType: 'track', trackId: 942326908, previewUrl: 'https://audio-ssl.itunes.apple.com/new.m4a' },
        { wrapperType: 'track', trackId: 1, previewUrl: 'https://elsewhere.example/x.m4a' },
      ],
    };
    expect([...previewsFromLookup(lookup)]).toEqual([['942326908', 'https://audio-ssl.itunes.apple.com/new.m4a']]);
  });

  it('rewrites only the matching track lines, keeping the rest of the file', () => {
    const updated = setPreviews(yaml, new Map([['942326908', 'https://audio-ssl.itunes.apple.com/new.m4a']]));
    const changed = updated.split('\n').filter((line, i) => line !== yaml.split('\n')[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('title: Two Way Street');
    expect(changed[0]).toContain('preview: "https://audio-ssl.itunes.apple.com/new.m4a" }');
    expect(parseMedia(updated).album.tracks[0]?.preview).toBe('https://audio-ssl.itunes.apple.com/new.m4a');
    const bare = '    - { title: X, length: "1:00", appleId: "5", slug: x }';
    expect(setPreviews(bare, new Map([['5', 'https://audio-ssl.itunes.apple.com/a.m4a']]))).toBe(
      '    - { title: X, length: "1:00", appleId: "5", slug: x, preview: "https://audio-ssl.itunes.apple.com/a.m4a" }',
    );
  });

  it('are allowed by the Content Security Policy, and nothing else is', () => {
    expect(CSP_DIRECTIVES['media-src']).toEqual(["'self'", 'https://audio-ssl.itunes.apple.com']);
  });
});

describe('date check', () => {
  const booked: BookedDay[] = [
    { day: '2026-10-17', venue: 'The Fed Community', city: 'Clarkston' },
    { day: '2026-10-25', venue: 'Cadieux Cafe', city: 'Detroit' },
    { day: '2026-10-25', venue: 'Blue Goose Inn', city: 'St. Clair Shores' },
  ];
  const today = '2026-10-01';

  it('names the gig when he’s already playing that day', () => {
    expect(availability('2026-10-17', booked, today)).toEqual({
      kind: 'booked',
      text: 'I’m already playing The Fed Community in Clarkston that day. Pick another date, or send it anyway and we’ll talk.',
    });
    expect(availability('2026-10-25', booked, today)?.text).toContain('Cadieux Cafe in Detroit and Blue Goose Inn in St. Clair Shores');
  });

  it('never promises a free date, only that nothing is listed', () => {
    expect(availability('2026-10-18', booked, today)).toEqual({ kind: 'open', text: 'I don’t have anything listed that day.' });
  });

  it('catches past dates, today counts as upcoming, and ignores anything that isn’t a date', () => {
    expect(availability('2026-09-30', booked, today)?.kind).toBe('past');
    expect(availability('2026-10-01', booked, today)?.kind).toBe('open');
    expect(availability('', booked, today)).toBeNull();
    expect(availability('10/17/2026', booked, today)).toBeNull();
  });
});
