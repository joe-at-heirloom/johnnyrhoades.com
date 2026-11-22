/* Links from the bios to the artists they name (src/lib/artists.ts, ADR 0025). */
import { describe, expect, it } from 'vitest';
import { linkBio, parseArtists, type Artist } from '../../src/lib/artists.ts';
import { BIOS, bio, longBio } from '../../src/lib/bios.ts';
import { HOME_ABOUT } from '../../src/lib/copy.ts';
import { artists, facts } from '../../src/lib/load-content.ts';

const ARTISTS: Artist[] = [
  { name: 'Motor City Josh', aka: ['Motor City Josh & The Big 3'], url: 'https://mcj.example/', note: 'test' },
  { name: 'Brett Lucas', aka: [], url: 'https://brett.example/', note: 'test' },
  { name: 'Luther Dickinson', aka: [], url: 'https://luther.example/', note: 'test' },
];
const links = (paragraphs: string[]) => linkBio(paragraphs, ARTISTS).flat().filter((s) => s.href);

describe('linkBio', () => {
  it('links the first mention of each artist, once per bio, across paragraphs', () => {
    const bioText = ['He joined Motor City Josh’s band at 19. Brett Lucas taught him.', 'He’s still with Motor City Josh & The Big 3, and Brett Lucas too.'];
    expect(links(bioText)).toEqual([
      { text: 'Motor City Josh', title: false, href: 'https://mcj.example/' },
      { text: 'Brett Lucas', title: false, href: 'https://brett.example/' },
    ]);
  });

  it('keeps the text around a link exactly as it was', () => {
    const [p] = linkBio(['He joined Motor City Josh’s band.'], ARTISTS);
    expect(p!.map((s) => s.text).join('')).toBe('He joined Motor City Josh’s band.');
    expect(p![2]).toEqual({ text: '’s band.', title: false });
  });

  it('prefers the longer name where two start at the same spot', () => {
    expect(links(['With Motor City Josh & The Big 3 since 2006.'])[0]!.text).toBe('Motor City Josh & The Big 3');
  });

  it('links names, not words that merely contain them', () => {
    expect(links(['He played with Brett Lucasson.'])).toEqual([]);
    expect(links(['The Lucas Rhoades Band plays The Fed.'])).toEqual([]);
  });

  it('leaves titles whole and unlinked', () => {
    const [p] = linkBio(['He recorded *Feelin’ Freaky* with producer Luther Dickinson.'], ARTISTS);
    expect(p).toContainEqual({ text: 'Feelin’ Freaky', title: true });
    expect(p!.filter((s) => s.href).map((s) => s.text)).toEqual(['Luther Dickinson']);
  });

  it('parses artists.yaml entries and refuses a plain-http page', () => {
    expect(parseArtists('- { name: A, url: "https://a.example/", note: checked }')[0]!.aka).toEqual([]);
    expect(() => parseArtists('- { name: A, url: "http://a.example/", note: checked }')).toThrow(/https/);
  });
});

describe('the bios link the artists they name', () => {
  const linkedIn = (paragraphs: readonly string[]) => linkBio(paragraphs, artists).flat().filter((s) => s.href).map((s) => s.text);
  const home = linkedIn(HOME_ABOUT.map((ids) => ids.map((id) => facts.bio(id, 'home')).join(' ')));

  it('links every artist in artists.yaml from the home About, each once', () => {
    expect(home).toHaveLength(artists.length);
    expect(new Set(home).size).toBe(home.length);
  });

  it('links the long bio the same way, with the show count in front', () => {
    expect(linkedIn(longBio(facts, 'The last 12 months brought 106 shows.'))).toHaveLength(artists.length);
    expect(linkedIn([bio(facts, 'short')])).toEqual(['Motor City Josh']);
  });

  it('only links artists the bios still name', () => {
    const all = BIOS.long.map((id) => facts.bio(id, 'epk')).join(' ') + BIOS.medium.map((id) => facts.bio(id, 'epk')).join(' ');
    for (const a of artists) expect(all, a.name).toContain(a.name);
  });
});
