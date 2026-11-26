/*
  The blues maker's game (/jam/, ADR 0033): play a gig. The band plays the
  tune; in each line the fills play a call for two bars and you answer it in
  the next two, on the sit-in pads. Each answer is scored on what makes a
  blues answer good, and the score says which part to work on: in time with
  the band, landing somewhere that sounds finished, leaving some space,
  answering the call in kind, and not saying the same thing twice. Good
  answers in a row build a streak; the crowd warms to good answers, cools
  when you coast, and walks out if you lose them. Pure, so it's unit
  tested; src/scripts/game.ts runs it.
*/
import type { Caller, Key, Song } from './jam';
import type { Mix } from './mixer';
import { STYLES } from './styles';
import { SIT_IN, type SitInInstrument } from './sit-in';

/** Where your turns are: the last two bars of each line, the bars the fills answer in. */
export const TURN_BARS: readonly number[] = [2, 6, 10];
export const TURN_BEATS = 8;

/** A note you played in a turn: when, in beats from the turn's downbeat, and which. */
export type TurnNote = { beat: number; midi: number };

/**
 * Where a note counts as on time: the beat and the swung offbeat in a shuffle, the beat and the
 * eighth when it's straight. (Every triplet would put any tap within a hair of somewhere.)
 */
export function grid(swing: number): readonly number[] {
  return swing > 0.55 ? [0, swing] : [0, 0.5];
}

/** How far a note is from the nearest place on the grid, in seconds. */
export function offGrid(beat: number, swing: number, secondsPerBeat: number): number {
  const frac = beat - Math.floor(beat);
  const d = Math.min(...[...grid(swing), 1].map((g) => Math.abs(frac - g)));
  return d * secondsPerBeat;
}

/** In the pocket: within 35 ms of the grid is perfect, 100 ms off counts for nothing. */
const POCKET_S = 0.035;
const LOOSE_S = 0.1;
export const timingScore = (seconds: number) => Math.max(0, Math.min(1, 1 - (seconds - POCKET_S) / (LOOSE_S - POCKET_S)));
/** A note this close to the grid shows as on time. */
export const ON_TIME = 0.6;

/** The five things an answer is scored on, each 0–1, and what each is worth. */
export const WEIGHTS = { timing: 35, landing: 20, space: 15, echo: 15, variety: 15 } as const;
export type Part = keyof typeof WEIGHTS;
export type Breakdown = Record<Part, number>;

export const PART_NAMES: Record<Part, string> = { timing: 'Timing', landing: 'Ending', space: 'Space', echo: 'Echo', variety: 'Variety' };

/** What to work on, for the part an answer (or a gig) lost the most on. */
export const TIPS: Record<Part, string> = {
  timing: 'Play with the drums: on the beat, or on the swung offbeat.',
  landing: 'End on the 1 or the 5 to finish the thought.',
  space: 'Leave some space: three to ten notes, with a breath in the middle.',
  echo: 'Answer in kind: borrow the call’s rhythm.',
  variety: 'Mix it up: more than one note, and not the same answer twice.',
};

export type TurnScore = {
  points: number;
  breakdown: Breakdown;
  /** Each note's place in the turn and whether it was on time, for the answer's picture. */
  marks: { beat: number; onTime: boolean }[];
  /** One line for the player: praise, or the one thing to work on. */
  verdict: string;
  /** How the crowd takes it. */
  crowd: number;
  cheer: 'cheer' | 'clap' | null;
};

/** The slot a note falls in: the half-beat it's nearest, the beat or the (swung) offbeat. */
const slot = (beat: number) => Math.round(beat * 2);

/**
 * How alike two rhythms are, 0–1: how many of the half-beat slots they play in they share
 * (twice the shared slots over the slots each plays), at whichever nudge of up to a beat
 * either way lines them up best, so an answer that starts a little late still echoes.
 */
export function rhythmLikeness(a: readonly TurnNote[], b: readonly TurnNote[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a.map((n) => slot(n.beat)));
  const B = new Set(b.map((n) => slot(n.beat)));
  let best = 0;
  for (let shift = -2; shift <= 2; shift++) {
    const shared = [...A].filter((s) => B.has(s - shift)).length;
    best = Math.max(best, (2 * shared) / (A.size + B.size));
  }
  return best;
}

/** Whether two answers are the same thing again: the same notes at the same places. */
export function sameAnswer(a: readonly TurnNote[], b: readonly TurnNote[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const key = (n: TurnNote) => `${slot(n.beat)}:${n.midi}`;
  const A = new Set(a.map(key));
  const B = new Set(b.map(key));
  const shared = [...A].filter((k) => B.has(k)).length;
  return shared / new Set([...A, ...B]).size >= 0.75;
}

/** A missed turn cools the crowd; three in a row and they're gone. */
const MISSED = -0.15;
const MONOTONE_MAX = 60;
/**
 * How the crowd takes an answer: 70 holds them, better warms them (up to 0.2 for a perfect one),
 * worse cools them, so coasting drains the meter.
 */
export const crowdMove = (points: number) => Math.max(-0.2, Math.min(0.2, (points - 70) / 150));

/**
 * Score one answer, 0–100, from five parts (WEIGHTS):
 * - timing: each note against the band's grid;
 * - landing: ending on the 1 or the 5 sounds finished, the flat 3 or flat 7 bluesy, anything else hangs;
 * - space: three to ten notes, with a breath (a beat or more) somewhere in the middle;
 * - echo: the call's rhythm, borrowed;
 * - variety: more than one note, and not the same answer as last time.
 * The verdict praises a good answer and otherwise names the weakest part.
 */
export function scoreTurn({
  notes,
  call,
  swing,
  secondsPerBeat,
  tonicPc,
  previous = [],
}: {
  notes: readonly TurnNote[];
  call: readonly TurnNote[];
  swing: number;
  secondsPerBeat: number;
  tonicPc: number;
  previous?: readonly TurnNote[];
}): TurnScore {
  const played = notes.filter((n) => n.beat >= -0.25 && n.beat < TURN_BEATS).sort((a, b) => a.beat - b.beat);
  const n = played.length;
  if (n === 0) {
    return { points: 0, breakdown: { timing: 0, landing: 0, space: 0, echo: 0, variety: 0 }, marks: [], verdict: 'You missed your turn. Answer in the two bars after the call.', crowd: MISSED, cheer: null };
  }
  const timings = played.map((x) => timingScore(offGrid(x.beat, swing, secondsPerBeat)));
  const timing = timings.reduce((a, b) => a + b, 0) / n;

  const degree = (((played[n - 1]!.midi - tonicPc) % 12) + 12) % 12;
  const landing = degree === 0 || degree === 7 ? 1 : degree === 3 || degree === 10 ? 0.5 : degree === 6 ? 0 : 0.2;

  const gaps = played.slice(1).map((x, i) => x.beat - played[i]!.beat);
  const breath = n < 4 || Math.max(...gaps) >= 1;
  const count = n >= 3 && n <= 10 ? 1 : n === 2 ? 0.6 : n === 1 ? 0.4 : n <= 12 ? 0.6 : n <= 16 ? 0.3 : 0;
  const space = count * (breath ? 1 : 0.6);

  const echo = rhythmLikeness(played, call);

  const pitches = new Set(played.map((x) => x.midi)).size;
  const repeated = sameAnswer(played, previous);
  const variety = (pitches >= 3 ? 1 : pitches === 2 ? 0.5 : n === 1 ? 0.5 : 0) * (repeated ? 0.3 : 1);
  // One note over and over isn't an answer, however steady: it tops out at 60.
  const monotone = pitches === 1 && n >= 4;

  const breakdown: Breakdown = { timing, landing, space, echo, variety };
  const sum = Math.round((Object.keys(WEIGHTS) as Part[]).reduce((total, k) => total + WEIGHTS[k] * breakdown[k], 0));
  const points = monotone ? Math.min(MONOTONE_MAX, sum) : sum;

  // The weakest part, by the points it lost.
  const weakest = (Object.keys(WEIGHTS) as Part[]).reduce((w, k) => (WEIGHTS[k] * (1 - breakdown[k]) > WEIGHTS[w] * (1 - breakdown[w]) ? k : w));
  const advice: Record<Part, string> = {
    ...TIPS,
    timing: timing < 0.4 ? 'Off the beat. Play with the drums: on the beat, or on the swung offbeat.' : TIPS.timing,
    space: n > 10 ? 'Too busy. Leave some space.' : n < 3 ? 'Say a little more: three or four notes.' : 'Leave a breath in the middle.',
    variety: repeated ? 'You played that last time. Mix it up.' : 'One note over and over. Use a few.',
  };
  // Praise only an answer that's good all round: no part below 60%.
  const allRound = (Object.keys(WEIGHTS) as Part[]).every((k) => breakdown[k] >= 0.6);
  const verdict = points >= 85 && allRound && landing === 1 ? 'Right in the pocket.' : points >= 70 ? `Nice answer. ${advice[weakest]}` : advice[weakest];
  return {
    points,
    breakdown,
    marks: played.map((x, i) => ({ beat: x.beat, onTime: timings[i]! >= ON_TIME })),
    verdict,
    crowd: crowdMove(points),
    cheer: points >= 80 ? 'cheer' : points >= 60 ? 'clap' : null,
  };
}

/** Good answers in a row (70 or more) build a streak, worth 5 points a step after the first, up to 15. */
export const STREAK_AT = 70;
export const streakBonus = (streak: number) => Math.min(15, Math.max(0, streak - 1) * 5);

/** The crowd, 0 (gone) to 1 (on their feet), starting lukewarm. At 0 they've walked out and the gig is over. */
export const CROWD_START = 0.4;
export const crowdGone = (crowd: number) => crowd <= 0.001;
export const moveCrowd = (crowd: number, delta: number) => Math.max(0, Math.min(1, crowd + delta));

/**
 * Stars for a gig: the share of the points available (streak bonuses count). 85% for three,
 * 70% for two, so tapping at random (about 65) earns one. A gig without a single answer earns none.
 */
export function stars(points: number, turns: number): 0 | 1 | 2 | 3 {
  const share = turns ? points / (turns * 100) : 0;
  return share >= 0.85 ? 3 : share >= 0.7 ? 2 : share > 0 ? 1 : 0;
}

/*
  The band plays along with how it's going (the player asks for these moves bar by bar, BandMoves in
  src/lib/jam.ts): it plays softer to a cool crowd and harder to a warm one, digs in when the crowd's
  hot or you're on a streak, and shouts a great answer back.
*/
/** How hard the band plays for the crowd: 0.85 to an empty room, as written to a lukewarm one, 1.15 to one on its feet. */
export const bandLevel = (crowd: number) => 0.85 + 0.3 * Math.max(0, Math.min(1, crowd));
/** The band digs in when the crowd's on its feet or you've three good answers in a row. */
export const isHot = (crowd: number, streak: number) => crowd >= 0.7 || streak >= 3;
/** An answer this good (so far, as the band reaches the next line) gets shouted back: a crash on the downbeat. */
export const SHOUT_AT = 85;

/** What to work on after a gig: the part that lost the most points across its answers. */
export function workOn(breakdowns: readonly Breakdown[]): Part | null {
  if (!breakdowns.length) return null;
  const lost = (k: Part) => breakdowns.reduce((sum, b) => sum + WEIGHTS[k] * (1 - b[k]), 0);
  return (Object.keys(WEIGHTS) as Part[]).reduce((w, k) => (lost(k) > lost(w) ? k : w));
}

/** A gig: a style's band, how many choruses, and who in the band would rather call. */
export type Gig = { id: string; label: string; blurb: string; level: string; choruses: number; caller: Caller; song: Song; mix: Mix };

/** What you can play on the pads in a gig, and the one you start on. */
export const YOU_PLAY: readonly SitInInstrument[] = ['harp', 'sax', 'guitar', 'piano'];
export const YOU_START: SitInInstrument = 'harp';

/**
 * Who calls you in a gig: the gig's caller, unless that's the part you're playing, then whoever
 * else is in the band, guitar first, then the keys, then the fills. If nobody else is, the first who
 * isn't you (they'll join the band).
 */
export function callerFor(gig: Gig, you: SitInInstrument, parts: Song['parts'] = gig.song.parts): Caller {
  const mine = SIT_IN[you].part;
  const order = [gig.caller, 'guitar', 'keys', 'lead'].filter((c, i, all): c is Caller => c !== mine && all.indexOf(c) === i) as Caller[];
  return order.find((c) => parts[c] !== null) ?? order[0]!;
}

const style = (id: string) => STYLES.find((s) => s.id === id)!;
/** A gig starts straight in with the first call: no intro to wait through. */
const straightIn = (song: Song, bpm?: number): Song => ({ ...song, intro: false, ...(bpm ? { bpm } : {}) });

/**
 * The gigs, easiest first. Each is a style's band (src/lib/styles.ts) for a
 * few choruses of call and response, then the ending.
 */
export const GIGS: readonly Gig[] = [
  { id: 'open-mic', label: 'Open mic', level: 'Easy', blurb: 'A slow porch shuffle in E, with an acoustic guitar and an upright bass. Two choruses.', choruses: 2, caller: 'guitar', song: straightIn(style('delta').song, 80), mix: style('delta').mix },
  { id: 'friday', label: 'Friday night', level: 'Medium', blurb: 'A Chicago shuffle with the quick change, a guitar and a piano. Three choruses.', choruses: 3, caller: 'guitar', song: straightIn(style('chicago').song), mix: style('chicago').mix },
  { id: 'saturday', label: 'Saturday, late', level: 'Hard', blurb: 'A jump boogie at 150, with the piano calling. Four choruses.', choruses: 4, caller: 'keys', song: straightIn(style('jump').song), mix: style('jump').mix },
];

/** How many turns a gig has: three a chorus. The band takes it home after your last answer. */
export const gigTurns = (gig: Gig) => gig.choruses * TURN_BARS.length;

export const keyOf = (gig: Gig): Key => gig.song.key;
