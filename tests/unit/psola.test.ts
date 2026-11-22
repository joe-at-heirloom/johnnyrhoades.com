import { describe, expect, it } from 'vitest';
import { notePitch } from '../../src/lib/audio-analysis';
import { pitchMarks, psolaShift } from '../../src/lib/psola';

const RATE = 44100;
/** A plucked-ish note: a few harmonics under a decaying envelope. */
const note = (hz: number, seconds = 1.5) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => {
    const t = i / RATE;
    return Math.exp(-2 * t) * 0.4 * (Math.sin(2 * Math.PI * hz * t) + 0.5 * Math.sin(4 * Math.PI * hz * t) + 0.25 * Math.sin(6 * Math.PI * hz * t));
  });
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

describe('PSOLA pitch shifting', () => {
  it('puts one mark per period', () => {
    const marks = pitchMarks(note(100), RATE / 100, 0);
    const gaps = marks.slice(1).map((m, i) => m - marks[i]!);
    for (const g of gaps.slice(0, 50)) expect(Math.abs(g - 441)).toBeLessThanOrEqual(2);
  });

  it.each([
    [41.2, 7],
    [65.4, -8],
    [65.4, 13],
    [130.8, 4],
    [261.6, -5],
    [523.3, 2],
  ])('moves a %s Hz note %s semitones to within 10 cents', (hz, semis) => {
    const out = psolaShift(note(hz), RATE, hz, semis);
    const p = notePitch(out, RATE, { minHz: 25, maxHz: 1600 });
    expect(p).not.toBeNull();
    expect(Math.abs(cents(p!.hz, hz * Math.pow(2, semis / 12)))).toBeLessThan(10);
  });

  it('keeps the length and roughly the loudness', () => {
    const x = note(110);
    for (const s of [-7, 7]) {
      const out = psolaShift(x, RATE, 110, s);
      expect(out.length).toBe(x.length);
      expect(rms(out) / rms(x)).toBeGreaterThan(0.6);
      expect(rms(out) / rms(x)).toBeLessThan(1.6);
    }
  });

  it('leaves the note alone for no shift', () => {
    const x = note(220);
    expect(psolaShift(x, RATE, 220, 0)).toEqual(x);
  });
});
