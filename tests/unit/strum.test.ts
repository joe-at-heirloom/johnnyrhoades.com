import { describe, expect, it } from 'vitest';
import { BLUES_IN_E, CHORDS, OPEN_STRINGS, bendCents, centsToRate, crossedStrings, fretPositions, isStrum, karplusStrong, midiToHz } from '../../src/lib/strum';

/** Deterministic stand-in for Math.random (a small LCG), so sample tests are repeatable. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const rms = (a: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += (a[i] ?? 0) ** 2;
  return Math.sqrt(sum / (to - from));
};

describe('chords and the 12-bar', () => {
  const pitchClasses = (notes: readonly (number | null)[]) => new Set(notes.filter((n): n is number => n !== null).map((n) => n % 12));

  it('tunes to concert pitch', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(OPEN_STRINGS[0])).toBeCloseTo(82.41, 2); // low E
    expect(midiToHz(OPEN_STRINGS[5])).toBeCloseTo(329.63, 2); // high E, two octaves up
  });

  it('voices each chord in open position: every note is fret 0 to 4 on its string', () => {
    for (const [name, notes] of Object.entries(CHORDS)) {
      expect(notes, name).toHaveLength(6);
      notes.forEach((n, i) => {
        if (n === null) return;
        const fret = n - OPEN_STRINGS[i]!;
        expect(fret, `${name}, string ${i}`).toBeGreaterThanOrEqual(0);
        expect(fret, `${name}, string ${i}`).toBeLessThanOrEqual(4);
      });
    }
  });

  it('plays all four notes of each dominant seventh, and nothing else', () => {
    // E7: E G# B D. A7: A C# E G. B7: B D# F# A.
    expect(pitchClasses(CHORDS.E7)).toEqual(new Set([4, 8, 11, 2]));
    expect(pitchClasses(CHORDS.A7)).toEqual(new Set([9, 1, 4, 7]));
    expect(pitchClasses(CHORDS.B7)).toEqual(new Set([11, 3, 6, 9]));
  });

  it('runs the 12-bar in E from PLAN.md: four of E, two of A, two of E, then B, A, E, B', () => {
    expect(BLUES_IN_E.join(' ')).toBe('E7 E7 E7 E7 A7 A7 E7 E7 B7 A7 E7 B7');
  });

  it('counts three strings or more as a strum, and picking as picking', () => {
    expect([1, 2, 3, 6].map(isStrum)).toEqual([false, false, true, true]);
  });
});

describe('bend', () => {
  it('raises the pitch with the push, either way, up to a whole step', () => {
    expect(bendCents(0, 20)).toBe(0);
    expect(bendCents(10, 20)).toBe(100); // a half step halfway
    expect(bendCents(-10, 20)).toBe(100); // pulling down bends up too
    expect(bendCents(45, 20)).toBe(200);
  });

  it('turns cents into a playback rate', () => {
    expect(centsToRate(0)).toBe(1);
    expect(centsToRate(1200)).toBe(2);
    expect(centsToRate(200)).toBeCloseTo(Math.pow(2, 2 / 12), 12);
  });
});

describe('karplusStrong', () => {
  const sampleRate = 48000;

  it('is as long as the sustain plus the tail', () => {
    const out = karplusStrong({ sampleRate, freq: 110, sustain: 2, tail: 0.5, random: seeded() });
    expect(out.length).toBe(sampleRate * 2.5);
  });

  it('starts with no DC offset', () => {
    const freq = 110;
    const period = Math.round(sampleRate / freq - 0.5);
    const out = karplusStrong({ sampleRate, freq, sustain: 2, random: seeded(7) });
    let mean = 0;
    for (let i = 0; i < period; i++) mean += out[i] ?? 0;
    expect(Math.abs(mean / period)).toBeLessThan(1e-6);
  });

  it('decays by about 60 dB over the sustain time', () => {
    const sustain = 1;
    const out = karplusStrong({ sampleRate, freq: 220, sustain, random: seeded(3) });
    const start = rms(out, 0, 2000);
    const end = rms(out, sampleRate * sustain - 2000, sampleRate * sustain);
    expect(end / start).toBeLessThan(0.002); // at least ~54 dB down
    expect(end / start).toBeGreaterThan(0); // still ringing, not cut off
  });

  it('repeats at the requested pitch', () => {
    const freq = 196;
    const out = karplusStrong({ sampleRate, freq, sustain: 2, random: seeded(11) });
    const period = Math.round(sampleRate / freq - 0.5);
    // A plucked string is nearly periodic: one period apart, the waveform correlates strongly.
    let dot = 0;
    let norm = 0;
    for (let i = 4000; i < 8000; i++) {
      dot += (out[i] ?? 0) * (out[i + period] ?? 0);
      norm += (out[i] ?? 0) ** 2;
    }
    expect(dot / norm).toBeGreaterThan(0.95);
  });
});

describe('fretPositions', () => {
  it('ends the last fret at the edge of the neck', () => {
    const frets = fretPositions(1200, 15);
    expect(frets).toHaveLength(15);
    expect(frets.at(-1)).toBeCloseTo(1200, 6);
  });

  it('puts frets closer together further up the neck', () => {
    const frets = fretPositions(1000, 12);
    const gaps = frets.map((x, i) => x - (i === 0 ? 0 : (frets[i - 1] ?? 0)));
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1] ?? Infinity);
    // Each fret is a semitone: the spacing shrinks by the twelfth root of two.
    expect((gaps[0] ?? 0) / (gaps[1] ?? 1)).toBeCloseTo(Math.pow(2, 1 / 12), 6);
  });
});

describe('crossedStrings', () => {
  const ys = [20, 40, 60, 80, 100, 120];

  it('finds every string crossed by a fast downstroke', () => {
    expect(crossedStrings(10, 130, ys)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('finds strings crossed on the way up too', () => {
    expect(crossedStrings(95, 35, ys)).toEqual([1, 2, 3]);
  });

  it('counts landing exactly on a string once', () => {
    expect(crossedStrings(30, 40, ys)).toEqual([1]);
    expect(crossedStrings(40, 45, ys)).toEqual([]);
  });

  it('ignores moves between two strings', () => {
    expect(crossedStrings(42, 58, ys)).toEqual([]);
  });
});
