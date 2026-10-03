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
 * @param sustain seconds until the note has decayed by 60 dB
 */
export function karplusStrong({
  sampleRate,
  freq,
  sustain,
  tail = 0.3,
  random = Math.random,
}: {
  sampleRate: number;
  freq: number;
  sustain: number;
  tail?: number;
  random?: () => number;
}): Float32Array<ArrayBuffer> {
  // The two-point averaging filter adds half a sample of delay.
  const period = Math.max(2, Math.round(sampleRate / freq - 0.5));
  const out = new Float32Array(Math.floor(sampleRate * (sustain + tail)));
  const ring = new Float32Array(period);

  let smooth = 0;
  let mean = 0;
  for (let i = 0; i < period; i++) {
    smooth = smooth * 0.45 + (random() * 2 - 1) * 0.55; // soften the pick attack
    ring[i] = smooth;
    mean += smooth;
  }
  mean /= period;
  for (let i = 0; i < period; i++) ring[i] = (ring[i] ?? 0) - mean; // no DC offset

  const damp = Math.pow(0.001, 1 / (sustain * freq)); // -60 dB after `sustain` seconds
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const nextIdx = idx + 1 === period ? 0 : idx + 1;
    const cur = ring[idx] ?? 0;
    out[i] = cur;
    ring[idx] = damp * 0.5 * (cur + (ring[nextIdx] ?? 0));
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
