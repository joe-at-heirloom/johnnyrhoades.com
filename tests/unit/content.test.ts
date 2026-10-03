/* Phase 4: the facts ledger, bios, media and profiles. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bio, wordCount } from '../../src/lib/bios.ts';
import { FACT_USES } from '../../src/lib/copy.ts';
import { FactUseError, ledger, parseFacts, plain, segments } from '../../src/lib/facts.ts';
import { isoDuration, liveLinks, parseMedia, parseProfiles, sameAs } from '../../src/lib/media.ts';
import { siteGraph, videoObject } from '../../src/lib/schema.ts';

const read = (p: string) => readFileSync(p, 'utf8');
const facts = ledger(parseFacts(read('src/data/facts.yaml')));
const media = parseMedia(read('src/data/media.yaml'));
const profiles = parseProfiles(read('src/data/profiles.yaml'));

describe('facts ledger rules (PLAN.md section 6.4)', () => {
  it('parses the real ledger', () => {
    expect(facts.all.length).toBeGreaterThan(10);
  });

  it('lets each context use only the statuses it allows', () => {
    expect(() => facts.get('formats', 'home')).toThrow(FactUseError);
    expect(() => facts.get('formats', 'epk')).toThrow(/unverified/);
    expect(() => facts.get('bb-king-memorial', 'schema')).toThrow(/confirmed_by_johnny/);
    expect(facts.get('album-waiting-on-the-sun', 'schema').status).toBe('verified');
    expect(facts.first('played-with')).toMatch(/^I’ve played with/);
  });

  it('allows every use the site makes', () => {
    for (const use of FACT_USES) for (const id of use.ids) expect(() => facts.get(id, use.context), `${use.where}: ${id}`).not.toThrow();
  });

  it('rejects a verified fact without a source URL', () => {
    expect(() => parseFacts('- { id: x, third: "Claim.", status: verified, sources: [{ note: "trust me" }] }')).toThrow(/source with a URL/);
  });

  it('rejects an unverified fact that says neither what it needs nor how to detect it', () => {
    expect(() => parseFacts('- { id: x, third: "Claim.", status: unverified }')).toThrow(/needs/);
    expect(() => parseFacts('- { id: x, third: "Claim.", status: unverified, needs: "a source" }')).toThrow(/detect/);
  });

  it('rejects duplicate ids', () => {
    const one = '{ id: x, third: "Claim.", status: confirmed_by_johnny }';
    expect(() => parseFacts(`- ${one}\n- ${one}`)).toThrow(/Duplicate/);
  });

  it('marks titles for italics', () => {
    expect(segments('My album *Waiting on the Sun* came out in 2014.')).toEqual([
      { text: 'My album ', title: false },
      { text: 'Waiting on the Sun', title: true },
      { text: ' came out in 2014.', title: false },
    ]);
    expect(plain('His album *Waiting on the Sun*.')).toBe('His album Waiting on the Sun.');
  });
});

describe('bios', () => {
  const unverified = facts.unverified().map((f) => f.detect!.toLowerCase());

  it('come in the lengths the plan asks for', () => {
    expect(wordCount(bio(facts, 'short'))).toBeLessThanOrEqual(60);
    expect(wordCount(bio(facts, 'medium'))).toBeGreaterThan(90);
    expect(wordCount(bio(facts, 'medium'))).toBeLessThanOrEqual(170);
  });

  it('say nothing unverified', () => {
    for (const length of ['short', 'medium'] as const) {
      const text = bio(facts, length).toLowerCase();
      for (const needle of unverified) expect(text).not.toContain(needle);
    }
  });

  it('are in the third person', () => {
    expect(bio(facts, 'medium')).not.toMatch(/\b(I|I’m|I’ve|my)\b/);
  });
});

describe('media and profiles', () => {
  it('parses media.yaml', () => {
    expect(media.album.tracks).toHaveLength(10);
    expect(media.videos.filter((v) => v.epk)).toHaveLength(1);
    expect(media.photos.filter((p) => p.use.includes('gallery'))).toHaveLength(10);
  });

  it('refuses press downloads without a confirmed credit and license', () => {
    const base = read('src/data/media.yaml');
    const withPress = base.replace('credit: John Rocklin (from the watermark)\n    use: [gallery]', 'credit: John Rocklin (from the watermark)\n    use: [gallery, press]');
    expect(withPress).not.toBe(base);
    expect(() => parseMedia(withPress)).toThrow(/confirmed credit and license/);
  });

  it('puts only live official profiles in sameAs, never stores', () => {
    expect(sameAs(profiles)).toEqual([
      'https://www.bandsintown.com/a/11869348',
      'https://www.youtube.com/@johnnyrhoades86',
      'https://www.facebook.com/profile.php?id=100085365311010',
    ]);
    expect(liveLinks(profiles).map((p) => p.name)).toEqual(['Bandsintown', 'YouTube', 'Facebook', 'Apple Music', 'Amazon']);
  });

  it('formats ISO 8601 durations', () => {
    expect(isoDuration('3:33')).toBe('PT3M33S');
    expect(isoDuration(255)).toBe('PT4M15S');
    expect(isoDuration('5:00')).toBe('PT5M');
    expect(isoDuration(45)).toBe('PT45S');
  });
});

describe('structured data from the data files', () => {
  it('lists the album tracks as MusicRecordings', () => {
    const graph = siteGraph({ portraitUrl: 'https://x/p.jpg', sameAs: sameAs(profiles), album: media.album, description: 'D.' }) as {
      '@graph': Record<string, unknown>[];
    };
    const album = graph['@graph'].find((n) => n['@type'] === 'MusicAlbum') as { track: { itemListElement: { item: { name: string; duration: string } }[] } };
    expect(album.track.itemListElement[0]!.item).toMatchObject({ name: 'Two Way Street', duration: 'PT3M33S' });
    expect(album.track.itemListElement).toHaveLength(10);
  });

  it('describes videos with their upload date and length', () => {
    expect(videoObject(media.videos[2]!)).toMatchObject({
      '@type': 'VideoObject',
      name: 'Motor City Josh & The Big 3 on Live in the D',
      uploadDate: '2020-01-13',
      duration: 'PT5M20S',
      embedUrl: 'https://www.youtube-nocookie.com/embed/Xvm2uMDesXU',
    });
  });
});
