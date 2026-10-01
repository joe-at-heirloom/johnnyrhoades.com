/*
  Which ledger facts each page states, in order. Pages read these lists
  instead of hard-coding claims, and `npm run check` validates every id
  against the status rules (scripts/check-facts.ts).
*/
import type { FactContext } from './facts.ts';
import { BIOS } from './bios.ts';

/** The home page About section, one array per paragraph, in Johnny's voice. */
export const HOME_ABOUT = [
  ['detroit-guitarist-singer', 'started-with-motor-city-josh', 'toured-us-europe-mexico-caribbean'],
  ['influences', 'bb-king-memorial', 'played-with'],
  ['covers-and-originals', 'album-waiting-on-the-sun'],
] as const;

/** Press kit "Fast facts". Order matters: "on the road ever since" follows "started out at 19". */
export const EPK_FAST_FACTS = [
  'detroit-guitarist-singer',
  'started-with-motor-city-josh',
  'toured-us-europe-mexico-caribbean',
  'bb-king-memorial',
  'played-with',
  'album-waiting-on-the-sun',
] as const;

/** Press kit FAQ answers built from the ledger. */
export const EPK_FAQ = {
  plays: ['covers-and-originals'],
  travels: ['started-with-motor-city-josh', 'toured-us-europe-mexico-caribbean'],
} as const;

/** /llms.txt: who Johnny is, for answer engines. Same rules as the press kit. The first one is the summary line. */
export const LLMS_ABOUT = [
  'detroit-guitarist-singer',
  'started-with-motor-city-josh',
  'toured-us-europe-mexico-caribbean',
  'covers-and-originals',
  'played-with',
  'album-waiting-on-the-sun',
] as const;

/** The Person description in the site-wide structured data. Must be verified. */
export const SCHEMA_DESCRIPTION = 'detroit-guitarist-singer';

/** Every use, for the check script. */
export const FACT_USES: { context: FactContext; ids: readonly string[]; where: string }[] = [
  { context: 'home', ids: HOME_ABOUT.flat(), where: 'home page About' },
  { context: 'epk', ids: EPK_FAST_FACTS, where: 'press kit fast facts' },
  { context: 'epk', ids: Object.values(EPK_FAQ).flat(), where: 'press kit FAQ' },
  { context: 'epk', ids: BIOS.short, where: 'short bio' },
  { context: 'epk', ids: BIOS.medium, where: 'medium bio' },
  { context: 'epk', ids: LLMS_ABOUT, where: '/llms.txt' },
  { context: 'schema', ids: [SCHEMA_DESCRIPTION], where: 'structured data' },
];
