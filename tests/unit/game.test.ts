import { describe, expect, it } from 'vitest';
import { FEEL_INFO, KEYS, parseSong, songToParams } from '../../src/lib/jam';
import {
  CROWD_START,
  GIGS,
  WEIGHTS,
  SHOUT_AT,
  bandLevel,
  crowdGone,
  crowdMove,
  gigTurns,
  grid,
  isHot,
  moveCrowd,
  offGrid,
  rhythmLikeness,
  sameAnswer,
  scoreTurn,
  stars,
  streakBonus,
  timingScore,
  workOn,
  TURN_BARS,
  YOU_PLAY,
  callerFor,
  type Gig,
  type TurnNote,
} from '../../src/lib/game';

const SHUFFLE = FEEL_INFO.shuffle.swing;
const SPB = 0.6; // 100 bpm
const E = 4; // E's pitch class
const T = 2 / 3; // the swung offbeat
/** The call: a phrase on the beats and the swung offbeats. */
const call: TurnNote[] = [
  { beat: 0, midi: 71 },
  { beat: T, midi: 74 },
  { beat: 1, midi: 71 },
  { beat: 2, midi: 69 },
];
/** A clean answer: the call's rhythm, three notes, a breath, ending on E. */
const good: TurnNote[] = [
  { beat: 0, midi: 71 },
  { beat: T, midi: 74 },
  { beat: 1, midi: 71 },
  { beat: 2, midi: 64 },
];
const score = (notes: TurnNote[], previous: TurnNote[] = []) => scoreTurn({ notes, call, swing: SHUFFLE, secondsPerBeat: SPB, tonicPc: E, previous });
/** A steady little generator, so the random answers are the same every run. */
const random = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('the game', () => {
  it('takes turns in the last two bars of each line', () => {
    expect(TURN_BARS).toEqual([2, 6, 10]);
  });

  it('knows the grid: the beat and the swung offbeat in a shuffle, the eighths when it’s straight', () => {
    expect(grid(SHUFFLE)).toEqual([0, SHUFFLE]);
    expect(grid(0.5)).toEqual([0, 0.5]);
    expect(offGrid(T, SHUFFLE, SPB)).toBeCloseTo(0);
    expect(offGrid(1 / 3, SHUFFLE, SPB)).toBeCloseTo(SPB / 3);
    expect(offGrid(0.98, SHUFFLE, SPB)).toBeCloseTo(0.02 * SPB);
  });

  it('counts a note within 35 ms as in the pocket, and 100 ms off as no help', () => {
    expect(timingScore(0)).toBe(1);
    expect(timingScore(0.035)).toBe(1);
    expect(timingScore(0.0675)).toBeCloseTo(0.5);
    expect(timingScore(0.1)).toBe(0);
  });

  it('weighs five parts to 100', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('scores a clean answer 100, with a cheer, and shows every note on time', () => {
    const s = score(good);
    expect(s.points).toBe(100);
    expect(s.breakdown).toEqual({ timing: 1, landing: 1, space: 1, echo: 1, variety: 1 });
    expect(s.verdict).toBe('Right in the pocket.');
    expect(s.cheer).toBe('cheer');
    expect(s.crowd).toBeGreaterThan(0);
    expect(s.marks.every((m) => m.onTime)).toBe(true);
  });

  it('marks down an answer off the beat, and says so', () => {
    const late = good.map((n) => ({ ...n, beat: n.beat + 0.18 }));
    const s = score(late);
    expect(s.breakdown.timing).toBeLessThan(0.1);
    expect(s.marks.some((m) => m.onTime)).toBe(false);
    expect(s.verdict).toMatch(/Off the beat/);
  });

  it('marks down an answer that’s too busy', () => {
    // Sixteen swung eighths, no breath: the call's rhythm and a good ending can't save it.
    const busy = Array.from({ length: 16 }, (_, i) => ({ beat: Math.floor(i / 2) + (i % 2 ? T : 0), midi: [71, 74, 76, 69][i % 4]! }));
    busy[15] = { ...busy[15]!, midi: 64 };
    const s = scoreTurn({ notes: busy, call: busy, swing: SHUFFLE, secondsPerBeat: SPB, tonicPc: E });
    expect(s.breakdown.space).toBeLessThan(0.3);
    expect(s.verdict).not.toBe('Right in the pocket.');
    expect(s.verdict).toMatch(/Too busy/);
  });

  it('wants an ending on the 1 or the 5', () => {
    const hanging = [...good.slice(0, 3), { beat: 2, midi: 64 + 6 }];
    const s = score(hanging);
    expect(s.breakdown.landing).toBe(0);
    expect(s.points).toBe(80);
    expect(s.verdict).toMatch(/1 or the 5/);
    expect(score([...good.slice(0, 3), { beat: 2, midi: 64 + 7 }]).breakdown.landing).toBe(1);
    expect(score([...good.slice(0, 3), { beat: 2, midi: 64 + 10 }]).breakdown.landing).toBe(0.5);
  });

  it('credits echoing the call’s rhythm, even a little late, and not just the note count', () => {
    expect(rhythmLikeness(good, call)).toBe(1);
    // The same rhythm a beat late still echoes.
    expect(rhythmLikeness(good.map((n) => ({ ...n, beat: n.beat + 1 })), call)).toBe(1);
    // As many notes as the call, somewhere else entirely, doesn't.
    const elsewhere = [5, 5 + T, 6, 7].map((beat, i) => ({ beat, midi: good[i]!.midi }));
    expect(rhythmLikeness(elsewhere, call)).toBe(0);
    expect(score(elsewhere).breakdown.echo).toBe(0);
    expect(score(elsewhere).points).toBe(85);
  });

  it('caps one note over and over, however steady', () => {
    const same = [0, 1, 2, 3, 4, 5].map((beat) => ({ beat, midi: 64 }));
    const s = score(same);
    expect(s.breakdown.variety).toBe(0);
    expect(s.points).toBe(60);
    expect(s.verdict).toMatch(/One note over and over/);
  });

  it('marks down playing the same answer as last time', () => {
    expect(sameAnswer(good, good)).toBe(true);
    expect(sameAnswer(good, call)).toBe(false);
    const again = score(good, good);
    expect(again.points).toBeLessThan(score(good).points);
    expect(again.breakdown.variety).toBeCloseTo(0.3);
    expect(again.verdict).toMatch(/last time/);
  });

  it('scores careful playing well above tapping at random or mashing', () => {
    const next = random(7);
    const avg = (make: () => TurnNote[]) => Array.from({ length: 200 }, () => score(make()).points).reduce((a, b) => a + b, 0) / 200;
    const pads = [64, 67, 69, 70, 71, 74, 76, 79];
    const tapping = avg(() =>
      Array.from({ length: 6 }, () => ({ beat: next() * 8, midi: pads[Math.floor(next() * 8)]! })),
    );
    const mashing = avg(() => Array.from({ length: 24 }, () => ({ beat: next() * 8, midi: pads[Math.floor(next() * 8)]! })));
    expect(score(good).points).toBeGreaterThanOrEqual(95);
    expect(tapping).toBeLessThan(70);
    expect(mashing).toBeLessThan(50);
    // Tapping at random earns one star, not two.
    expect(stars(tapping * 6, 6)).toBe(1);
  });

  it('says so when you miss your turn, and the crowd cools', () => {
    const s = score([]);
    expect(s).toMatchObject({ points: 0, cheer: null });
    expect(s.crowd).toBeLessThan(0);
    // Notes outside the turn don't count.
    expect(score([{ beat: 9, midi: 64 }]).points).toBe(0);
  });

  it('builds a streak for good answers in a row', () => {
    expect([1, 2, 3, 4, 5].map(streakBonus)).toEqual([0, 5, 10, 15, 15]);
    expect(streakBonus(0)).toBe(0);
  });

  it('warms the crowd for good answers, cools it for coasting, and lets it walk out', () => {
    expect(crowdMove(100)).toBeCloseTo(0.2);
    expect(crowdMove(70)).toBe(0);
    expect(crowdMove(60)).toBeLessThan(0);
    expect(moveCrowd(0.95, 0.2)).toBe(1);
    expect(moveCrowd(0.05, -0.2)).toBe(0);
    // Three missed turns from the start, and they're gone.
    let crowd = CROWD_START;
    for (let i = 0; i < 3; i++) crowd = moveCrowd(crowd, score([]).crowd);
    expect(crowdGone(crowd)).toBe(true);
    expect(crowdGone(CROWD_START)).toBe(false);
  });

  it('gives stars for the share of the points', () => {
    expect(stars(300, 5)).toBe(1);
    expect(stars(350, 5)).toBe(2);
    expect(stars(425, 5)).toBe(3);
    expect(stars(10, 5)).toBe(1);
    // No answers, no stars.
    expect(stars(0, 5)).toBe(0);
    expect(stars(0, 0)).toBe(0);
  });

  it('says what to work on after a gig: the part that lost the most', () => {
    expect(workOn([])).toBeNull();
    expect(workOn([score(good).breakdown, score(good.map((n) => ({ ...n, beat: n.beat + 0.18 }))).breakdown])).toBe('timing');
    expect(workOn([score([...good.slice(0, 3), { beat: 2, midi: 70 }]).breakdown])).toBe('landing');
  });

  it('has the band play to the crowd: softer when it’s cool, harder when it’s warm, digging in when it’s hot', () => {
    expect(bandLevel(0)).toBeCloseTo(0.85);
    expect(bandLevel(1)).toBeCloseTo(1.15);
    expect(bandLevel(CROWD_START)).toBeGreaterThan(0.95);
    expect(bandLevel(CROWD_START)).toBeLessThan(1);
    expect(isHot(0.7, 0)).toBe(true);
    expect(isHot(0.4, 3)).toBe(true);
    expect(isHot(0.4, 2)).toBe(false);
    // A clean answer gets shouted back.
    expect(score(good).points).toBeGreaterThanOrEqual(SHOUT_AT);
  });

  it('lets you play any of four instruments, and finds someone else in the band to call you', () => {
    expect(YOU_PLAY).toEqual(['harp', 'sax', 'guitar', 'piano']);
    const [openMic, friday, saturday] = GIGS as [Gig, Gig, Gig];
    // The gig's caller, unless that's you.
    expect(callerFor(friday, 'harp')).toBe('guitar');
    expect(callerFor(saturday, 'sax')).toBe('keys');
    expect(callerFor(friday, 'guitar')).toBe('keys');
    expect(callerFor(saturday, 'piano')).toBe('guitar');
    // The open mic has no keys: with you on guitar, the harp player calls.
    expect(openMic.song.parts.keys).toBeNull();
    expect(callerFor(openMic, 'guitar')).toBe('lead');
    // Never yourself.
    for (const g of GIGS) for (const you of YOU_PLAY) expect(callerFor(g, you), `${g.id}, ${you}`).not.toBe(you === 'piano' ? 'keys' : you === 'guitar' ? 'guitar' : 'lead');
  });

  it('has three gigs, easiest first, each straight in, in a key the pads play, a turn for every line', () => {
    expect(GIGS.map((g) => g.level)).toEqual(['Easy', 'Medium', 'Hard']);
    for (const g of GIGS) {
      expect(KEYS).toContain(g.song.key);
      expect(g.song.intro).toBe(false);
      expect(parseSong(songToParams(g.song))).toEqual(g.song);
      expect(g.song.parts.lead, g.id).not.toBeNull();
      expect(gigTurns(g)).toBe(g.choruses * 3);
      // Someone in the band to trade with, who's in the band.
      expect(g.song.parts[g.caller], g.id).not.toBeNull();
    }
    expect(GIGS.map((g) => g.song.bpm)).toEqual([...GIGS.map((g) => g.song.bpm)].sort((a, b) => a - b));
  });
});
