/*
  Press kit bios, assembled from the facts ledger in the third person, so a
  bio can only say what the ledger allows (PLAN.md Appendix C). The long bio
  waits for Johnny's answers in PLAN.md section 17.
*/
import type { Ledger } from './facts.ts';
import { plain } from './facts.ts';

export const BIOS = {
  short: ['detroit-guitarist-singer', 'started-with-motor-city-josh', 'motor-city-josh-detroit-music-awards', 'album-waiting-on-the-sun'],
  medium: [
    'detroit-guitarist-singer',
    'started-with-motor-city-josh',
    'toured-us-europe-mexico-caribbean',
    'motor-city-josh-detroit-music-awards',
    'influences',
    'bb-king-memorial',
    'nemeth-feelin-freaky',
    'played-with',
    'covers-and-originals',
    'album-waiting-on-the-sun',
  ],
} as const;

export type BioLength = keyof typeof BIOS;

/** The bio with *titles* marked, for rendering. */
export const bio = (facts: Ledger, length: BioLength) => BIOS[length].map((id) => facts.third(id, 'epk')).join(' ');

export const wordCount = (text: string) => plain(text).split(/\s+/).filter(Boolean).length;
