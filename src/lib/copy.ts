/*
  Which ledger facts each page states, in order. Pages read these lists
  instead of hard-coding claims, and `npm run check` validates every id
  against the status rules (scripts/check-facts.ts).
*/
import type { FactContext } from './facts.ts';
import { BIOS, RUNNING_BIO } from './bios.ts';

/** The home page About section: the running bio, one array per paragraph. */
export const HOME_ABOUT = RUNNING_BIO;

/** Press kit "Fast facts". Order matters: "on the road ever since" follows "joined Motor City Josh’s band". */
export const EPK_FAST_FACTS = [
  'detroit-guitarist-singer',
  'started-with-motor-city-josh',
  'toured-us-europe-mexico-caribbean',
  'motor-city-josh-albums',
  'bb-king-memorial',
  'played-with',
  'jill-jack-julianne-ankley',
  'album-waiting-on-the-sun',
] as const;

/** Press kit "Formats": what he plays as, how long, and what he brings (PLAN.md section 7.4). */
export const EPK_FORMATS = ['formats', 'set-lengths', 'small-pa'] as const;

/** Press kit FAQ answers built from the ledger. */
export const EPK_FAQ = {
  plays: ['covers-and-originals'],
  travels: ['started-with-motor-city-josh', 'toured-us-europe-mexico-caribbean', 'nemeth-tours', 'caribbean-thornetta-davis'],
} as const;

/** /llms.txt: who Johnny is, for answer engines. Same rules as the press kit. The first one is the summary line. */
export const LLMS_ABOUT = [
  'detroit-guitarist-singer',
  'started-with-motor-city-josh',
  'toured-us-europe-mexico-caribbean',
  'motor-city-josh-detroit-music-awards',
  'motor-city-josh-albums',
  'covers-and-originals',
  'formats',
  'small-pa',
  'nemeth-feelin-freaky',
  'nemeth-tours',
  'bb-king-memorial',
  'played-with',
  'jill-jack-julianne-ankley',
  'album-waiting-on-the-sun',
] as const;

/** The Person description in the site-wide structured data. Must be verified. */
export const SCHEMA_DESCRIPTION = 'detroit-guitarist-singer';

/** Every use, for the check script. */
export const FACT_USES: { context: FactContext; ids: readonly string[]; where: string }[] = [
  { context: 'home', ids: HOME_ABOUT.flat(), where: 'home page About' },
  { context: 'epk', ids: EPK_FAST_FACTS, where: 'press kit fast facts' },
  { context: 'epk', ids: EPK_FORMATS, where: 'press kit formats' },
  { context: 'epk', ids: Object.values(EPK_FAQ).flat(), where: 'press kit FAQ' },
  { context: 'epk', ids: BIOS.short, where: 'short bio' },
  { context: 'epk', ids: BIOS.medium, where: 'medium bio' },
  { context: 'epk', ids: BIOS.long, where: 'long bio' },
  { context: 'epk', ids: LLMS_ABOUT, where: '/llms.txt' },
  { context: 'schema', ids: [SCHEMA_DESCRIPTION], where: 'structured data' },
];
