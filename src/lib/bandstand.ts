/*
  The bandstand (/jam/, ADR 0030): which part of a drawn instrument a note
  moves. Pure, so it's unit tested; src/scripts/bandstand.ts does the drawing.
*/

/** Open strings, low to high, as MIDI notes. */
export const BASS_STRINGS = [28, 33, 38, 43] as const; // E1 A1 D2 G2
export const GUITAR_STRINGS = [40, 45, 50, 55, 59, 64] as const; // E2 A2 D3 G3 B3 E4

/** The string a player would most likely play `midi` on: the highest whose open note is at or below it. */
export function stringFor(midi: number, open: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < open.length; i++) if (open[i]! <= midi) s = i;
  return s;
}

const BLACK = new Set([1, 3, 6, 8, 10]);

export type Key = { midi: number; black: boolean; x: number; w: number };

/**
 * A keyboard from `lo` to `hi` (MIDI), laid out across `width`: white keys
 * side by side, black keys narrower and straddling the gap between two whites.
 */
export function keyboard(lo: number, hi: number, width: number): Key[] {
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const ww = width / whites.length;
  const keys: Key[] = [];
  let i = 0;
  for (let m = lo; m <= hi; m++) {
    if (BLACK.has(m % 12)) keys.push({ midi: m, black: true, x: i * ww - ww * 0.3, w: ww * 0.6 });
    else keys.push({ midi: m, black: false, x: i++ * ww, w: ww });
  }
  return keys;
}

/** The key a note presses, folded by octaves into the drawn range. */
export function keyFor(midi: number, lo: number, hi: number): number {
  let m = midi;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}

/** The harmonica hole (0–9) for a note, spread evenly over what the fills play. */
export function holeFor(midi: number, lo: number, hi: number, holes = 10): number {
  const t = (midi - lo) / Math.max(1, hi - lo);
  return Math.max(0, Math.min(holes - 1, Math.round(t * (holes - 1))));
}

/**
 * How far a plucked string swings, in drawing units, `t` seconds after the note:
 * a quick, damped wobble that's gone in about half a second.
 */
export function swing(t: number, gain: number, maxPx: number, hz = 14): number {
  if (t < 0 || t > 0.6) return 0;
  return maxPx * gain * Math.exp(-7 * t) * Math.sin(2 * Math.PI * hz * t + Math.PI / 2);
}

/** How hard a drum or a hammer moves, 0–1, `t` seconds after a hit: sharp in, quick out. */
export function hit(t: number, gain: number, decay = 0.12): number {
  if (t < 0 || t > decay) return 0;
  return gain * (1 - t / decay);
}
