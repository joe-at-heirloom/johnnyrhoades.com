/*
  Pitch shifting for the blues maker's notes (ADR 0030): TD-PSOLA,
  pitch-synchronous overlap-add (Moulines and Charpentier, 1990).

  ElevenLabs won't play a requested note, so scripts/make-jam-sounds.ts
  tunes its recordings here instead. A note is cut into two-period grains
  centered on each pitch period, and the grains are laid back down closer
  together (higher) or further apart (lower). Unlike speeding a sample up,
  the note keeps its length and its body (the formants stay put), so a
  bass shifted up a fifth still sounds like a bass, not a cello.

  It suits what it's used for: one steady, monophonic note at a time.
*/

/**
 * Pitch marks: one per period, each on the peak nearest where a period is due.
 * Peaks are found on a smoothed copy, which keeps mostly the fundamental, and
 * always on the positive side: on a bright sound (a harmonica through a
 * distorted mic) the raw waveform's biggest swing flips between peaks and
 * troughs, and grains taken there land half a period out of line.
 */
export function pitchMarks(x: Float32Array, period: number, start: number): number[] {
  const width = Math.max(1, Math.round(period / 3));
  const smooth = new Float32Array(x.length);
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i]! - (i >= width ? x[i - width]! : 0);
    smooth[i] = sum / width;
  }
  const lag = Math.floor(width / 2); // a moving average runs this far behind
  const marks: number[] = [];
  const reach = Math.max(1, Math.round(period * 0.2));
  let due = start;
  while (due < x.length - 1) {
    let best = Math.round(due);
    for (let i = Math.max(0, best - reach); i <= Math.min(x.length - 1 - lag, best + reach); i++) if (smooth[i + lag]! > smooth[best + lag]!) best = i;
    if (marks.length && best <= marks.at(-1)!) best = marks.at(-1)! + Math.round(period);
    marks.push(best);
    due = best + period;
  }
  return marks;
}

/**
 * Shift a steady note by `semitones`, keeping its length.
 * @param hz the note's measured fundamental
 * @param from where the note's body starts (samples before it, the attack's first moments, are kept as they are)
 */
export function psolaShift(x: Float32Array, sampleRate: number, hz: number, semitones: number, from = 0): Float32Array {
  if (semitones === 0) return x.slice();
  const ratio = Math.pow(2, semitones / 12);
  const period = sampleRate / hz;
  const out = new Float32Array(x.length);
  const marks = pitchMarks(x, period, from);
  if (marks.length < 2) return x.slice();

  // A Hann window two periods wide.
  const half = Math.round(period);
  const win = Float32Array.from({ length: 2 * half + 1 }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (2 * half)));

  // Lay a grain down every new period, each taken from the nearest original mark in time.
  const step = period / ratio;
  let m = 0;
  for (let t = marks[0]!; t < x.length; t += step) {
    while (m + 1 < marks.length && Math.abs(marks[m + 1]! - t) < Math.abs(marks[m]! - t)) m++;
    const src = marks[m]!;
    const dst = Math.round(t);
    for (let k = -half; k <= half; k++) {
      const si = src + k;
      const di = dst + k;
      if (si < 0 || si >= x.length || di < 0 || di >= x.length) continue;
      out[di]! += x[si]! * win[k + half]!;
    }
  }
  // Two-period Hann grains a period apart sum to one; packed `ratio` times as close, to `ratio`.
  for (let i = 0; i < out.length; i++) out[i]! /= ratio;

  // Keep the untouched lead-in, crossfading into the shifted body over one period.
  const join = marks[0]!;
  for (let i = 0; i < join; i++) out[i] = x[i]!;
  for (let i = 0; i < half && join + i < out.length; i++) {
    const a = i / half;
    out[join + i] = x[join + i]! * (1 - a) + out[join + i]! * a;
  }
  return out;
}
