/*
  Pure helpers for the strummable guitar neck (src/scripts/strum.ts).
  No DOM and no Web Audio here, so they can be unit tested.
*/

/** Open E7, low string to high: E2 B2 D3 G#3 B3 E4 (Hz). */
export const E7_TUNING = [82.41, 123.47, 146.83, 207.65, 246.94, 329.63] as const;

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
