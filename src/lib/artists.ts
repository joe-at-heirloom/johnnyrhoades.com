/*
  Links from the bios to the artists they name (ADR 0025): the first time a bio
  names someone Johnny has played with, the name links to that artist's own page.
  The pages come from src/data/artists.yaml, and each one was checked to be the
  artist's own before it went in.

  Pure, so the first-mention rule can be tested: a whole bio goes in at once,
  and a name is linked once per bio however many paragraphs it spans.
*/
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { segments } from './facts.ts';

const ArtistSchema = z.strictObject({
  name: z.string().min(1),
  /** Other ways the bios name them, such as the band's full name. */
  aka: z.array(z.string().min(1)).default([]),
  url: z.url().refine((u) => u.startsWith('https://'), 'artist pages are linked over https'),
  /** How we know the page is theirs, and when it was checked. */
  note: z.string().min(1),
});

export type Artist = z.infer<typeof ArtistSchema>;

export const parseArtists = (yamlText: string): Artist[] => z.array(ArtistSchema).parse(parseYaml(yamlText) ?? []);

/** A run of bio text: a title (set in <cite>), a linked name, or plain text. */
export type Segment = { text: string; title: boolean; href?: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where `name` first appears as whole words (a possessive "’s" after it is fine), or -1. */
function find(text: string, name: string): number {
  return text.search(new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'u'));
}

/** The earliest mention in `text` of an artist not linked yet. At the same spot, the longer name wins. */
function firstMention(text: string, artists: readonly Artist[], linked: Set<string>) {
  let best: { index: number; match: string; artist: Artist } | null = null;
  for (const artist of artists) {
    if (linked.has(artist.name)) continue;
    for (const match of [artist.name, ...artist.aka]) {
      const index = find(text, match);
      if (index < 0) continue;
      if (!best || index < best.index || (index === best.index && match.length > best.match.length)) best = { index, match, artist };
    }
  }
  return best;
}

/**
 * One bio, as paragraphs of segments, with each artist's first mention linked.
 * Titles (*Feelin’ Freaky*) are kept whole and never linked inside.
 */
export function linkBio(paragraphs: readonly string[], artists: readonly Artist[]): Segment[][] {
  const linked = new Set<string>();
  return paragraphs.map((text) =>
    segments(text).flatMap((seg): Segment[] => {
      if (seg.title) return [seg];
      const out: Segment[] = [];
      let rest = seg.text;
      for (let hit = firstMention(rest, artists, linked); hit; hit = firstMention(rest, artists, linked)) {
        if (hit.index > 0) out.push({ text: rest.slice(0, hit.index), title: false });
        out.push({ text: hit.match, title: false, href: hit.artist.url });
        linked.add(hit.artist.name);
        rest = rest.slice(hit.index + hit.match.length);
      }
      if (rest) out.push({ text: rest, title: false });
      return out;
    }),
  );
}
