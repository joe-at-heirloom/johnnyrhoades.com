/*
  Pure helpers for the strummable guitar neck (src/scripts/strum.ts).
  No DOM and no Web Audio here, so they can be unit tested.
*/

/** Equal temperament, A4 = 440 Hz. */
export const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Standard tuning as MIDI notes, low string first: E2 A2 D3 G3 B3 E4. */
export const OPEN_STRINGS = [40, 45, 50, 55, 59, 64] as const;

export type ChordName = 'E7' | 'A7' | 'B7';

/** Open-position voicings as MIDI notes, low string first. `null` is a muted string. */
export const CHORDS: Record<ChordName, readonly (number | null)[]> = {
  E7: [40, 47, 50, 56, 59, 64], // 0 2 0 1 0 0
  A7: [null, 45, 52, 55, 61, 64], // x 0 2 0 2 0
  B7: [null, 47, 51, 57, 59, 66], // x 2 1 2 0 2
};

/** A 12-bar blues in E, one chord per bar (PLAN.md section 4.4). Each strum plays the next bar. */
export const BLUES_IN_E: readonly ChordName[] = ['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7'];

/** Three or more strings in one sweep is a strum; fewer is picking, which doesn't move the bar on. */
export const isStrum = (stringsSounded: number) => stringsSounded >= 3;

/**
 * A string bend, B.B. King's signature move: pushing a string sideways raises its pitch.
 * Up to a whole step (200 cents) at `maxPx` of push, either way, like a real string.
 */
export const bendCents = (px: number, maxPx: number) => 200 * Math.min(1, Math.abs(px) / maxPx);

/** The playback rate that raises a note by `cents`. */
export const centsToRate = (cents: number) => Math.pow(2, cents / 1200);

/**
 * Karplus-Strong plucked string: a short burst of noise circulating through a
 * damped delay line. Returns mono samples, ready to copy into an AudioBuffer.
 *
 * Two refinements over the textbook version (ADR 0024):
 * - Exact pitch. A delay line only comes in whole samples, and the first
 *   version also miscounted the averaging filter's half sample, so every note
 *   was sharp: 2 cents on the low E, up to 17 on the high E, and chords sounded
 *   sour. A first-order allpass filter in the loop now supplies the exact
 *   fraction of a sample (Jaffe and Smith, 1983).
 * - Pick position. The pluck is shaped as if picked a fifth of the way from
 *   the bridge, which thins out the harmonics that point would damp on a real
 *   string. It's what makes it sound picked rather than harp-like.
 *
 * @param sustain seconds until the note has decayed by 60 dB
 * @param pick where the pick strikes, as a fraction of the string from the bridge (0 for no shaping)
 */
export function karplusStrong({
  sampleRate,
  freq,
  sustain,
  tail = 0.3,
  pick = 0.2,
  random = Math.random,
}: {
  sampleRate: number;
  freq: number;
  sustain: number;
  tail?: number;
  pick?: number;
  random?: () => number;
}): Float32Array<ArrayBuffer> {
  // The loop's delay is the delay line, minus half a sample (each new sample averages the oldest one
  // with the one after it), plus the allpass's fraction, kept between 0.1 and 1.1 samples so the
  // filter stays well behaved.
  const loop = sampleRate / freq;
  const period = Math.max(2, Math.floor(loop + 0.4));
  const frac = loop + 0.5 - period;
  const c = (1 - frac) / (1 + frac); // allpass coefficient for a delay of `frac` samples at low frequencies

  const out = new Float32Array(Math.floor(sampleRate * (sustain + tail)));
  const ring = new Float32Array(period);

  let smooth = 0;
  for (let i = 0; i < period; i++) {
    smooth = smooth * 0.45 + (random() * 2 - 1) * 0.55; // soften the pick attack
    ring[i] = smooth;
  }
  // Pick position: subtract a copy of the pluck shifted along the string (a comb filter on the excitation).
  if (pick > 0) {
    const shift = Math.max(1, Math.round(pick * period));
    const shaped = ring.map((v, i) => v - (ring[(i - shift + period) % period] ?? 0));
    ring.set(shaped);
  }
  let mean = 0;
  for (let i = 0; i < period; i++) mean += ring[i] ?? 0;
  mean /= period;
  for (let i = 0; i < period; i++) ring[i] = (ring[i] ?? 0) - mean; // no DC offset

  const damp = Math.pow(0.001, 1 / (sustain * freq)); // -60 dB after `sustain` seconds
  let idx = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < out.length; i++) {
    const nextIdx = idx + 1 === period ? 0 : idx + 1;
    const cur = ring[idx] ?? 0;
    out[i] = cur;
    const averaged = damp * 0.5 * (cur + (ring[nextIdx] ?? 0));
    apOut = c * averaged + apIn - c * apOut;
    apIn = averaged;
    ring[idx] = apOut;
    idx = nextIdx;
  }
  return out;
}

/**
 * X positions of frets 1..count across a neck of the given width. Frets get
 * closer together up the neck like a real one, and the last fret lands on `width`.
 */
export function fretPositions(width: number, count: number): number[] {
  const scale = 1 - Math.pow(2, -count / 12);
  return Array.from({ length: count }, (_, i) => (width * (1 - Math.pow(2, -(i + 1) / 12))) / scale);
}

/**
 * Indices of the strings a pointer crossed moving from prevY to nextY.
 * Landing exactly on a string counts once, on the move that reaches it.
 */
export function crossedStrings(prevY: number, nextY: number, stringYs: readonly number[]): number[] {
  const hit: number[] = [];
  stringYs.forEach((y, i) => {
    const a = prevY - y;
    const b = nextY - y;
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) hit.push(i);
  });
  return hit;
}
