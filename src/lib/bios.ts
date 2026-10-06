/*
  Bios, assembled from the facts ledger in the third person, so a bio can only
  say what the ledger allows (PLAN.md Appendix C, ADR 0022).

  The running bio is one text in two places: the home page About, a paragraph
  per list, and the press kit's medium bio. It uses each fact's `bio` wording,
  which can lean on the sentence before it, so this order is the order it was
  written for. The short bio uses sentences that stand on their own.

  The long bio follows the outline in PLAN.md Appendix C with the same `bio`
  wordings, so the same rule holds: a fact that leans on the one before it
  stays after it. Its last paragraph opens with the show count from the data
  ("The last 12 months brought 106 shows…"), so it keeps itself current.
*/
import type { Ledger } from './facts.ts';
import { plain } from './facts.ts';

export const RUNNING_BIO = [
  ['detroit-guitarist-singer', 'started-with-motor-city-josh', 'toured-us-europe-mexico-caribbean', 'motor-city-josh-detroit-music-awards'],
  ['influences', 'bb-king-memorial', 'nemeth-feelin-freaky', 'played-with', 'jill-jack-julianne-ankley'],
  ['covers-and-originals', 'album-waiting-on-the-sun'],
] as const;

/** About 350 words: where he started, the Motor City Josh years, the road, his own bands, today, the record. */
export const LONG_BIO = [
  ['detroit-guitarist-singer', 'blue-goose-dishes', 'started-with-motor-city-josh', 'toured-us-europe-mexico-caribbean'],
  ['motor-city-josh-detroit-music-awards', 'motor-city-josh-albums'],
  ['influences', 'bb-king-memorial', 'nemeth-feelin-freaky', 'nemeth-tours'],
  ['formats', 'antifreeze-festival-2017', 'cliff-bells-2017', 'lucas-rhoades-band-the-fed', 'jill-jack-julianne-ankley', 'played-with'],
  ['covers-and-originals', 'album-waiting-on-the-sun'],
] as const;

export const BIOS = {
  short: ['detroit-guitarist-singer', 'started-with-motor-city-josh', 'motor-city-josh-detroit-music-awards', 'album-waiting-on-the-sun'],
  medium: RUNNING_BIO.flat(),
  long: LONG_BIO.flat(),
} as const;

export type BioLength = keyof typeof BIOS;

/** The bio with *titles* marked, for rendering. */
export const bio = (facts: Ledger, length: BioLength) =>
  BIOS[length].map((id) => (length === 'short' ? facts.third(id, 'epk') : facts.bio(id, 'epk'))).join(' ');

/**
 * The long bio as paragraphs. `played` is the show count from the data
 * (`proofForBio`), or null when there isn't enough history to say it.
 */
export const longBio = (facts: Ledger, played: string | null) =>
  LONG_BIO.map((ids, i) => [...(i === LONG_BIO.length - 1 && played ? [played] : []), ...ids.map((id) => facts.bio(id, 'epk'))].join(' '));

export const wordCount = (text: string) => plain(text).split(/\s+/).filter(Boolean).length;
