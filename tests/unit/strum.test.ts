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
    const period = Math.floor(sampleRate / freq + 0.4); // the delay line's length
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
    const period = Math.round(sampleRate / freq); // the true period, to the nearest sample
    // A plucked string is nearly periodic: one period apart, the waveform correlates strongly.
    let dot = 0;
    let norm = 0;
    for (let i = 4000; i < 8000; i++) {
      dot += (out[i] ?? 0) * (out[i + period] ?? 0);
      norm += (out[i] ?? 0) ** 2;
    }
    expect(dot / norm).toBeGreaterThan(0.95);
  });

  // The pitch, from the autocorrelation peak near the expected period, refined between samples.
  function measuredHz(out: Float32Array, rate: number, expected: number) {
    const from = Math.floor(rate * 0.2);
    const to = Math.floor(rate * 0.7);
    const corr = (lag: number) => {
      let dot = 0;
      let a = 0;
      let b = 0;
      for (let i = from; i < to; i++) {
        const x = out[i] ?? 0;
        const y = out[i + lag] ?? 0;
        dot += x * y;
        a += x * x;
        b += y * y;
      }
      return dot / Math.sqrt(a * b);
    };
    const guess = rate / expected;
    let best = Math.round(guess);
    for (let lag = Math.floor(guess * 0.97); lag <= Math.ceil(guess * 1.03); lag++) if (corr(lag) > corr(best)) best = lag;
    const [l, m, r] = [corr(best - 1), corr(best), corr(best + 1)];
    return rate / (best + (0.5 * (l - r)) / (l - 2 * m + r));
  }

  it.each([44100, 48000])('tunes every note of every chord to within a cent, at %i Hz', (rate) => {
    // As first shipped, every note was sharp: 2 cents on the low E, up to 17 on the high E (ADR 0024).
    for (const [name, notes] of Object.entries(CHORDS)) {
      for (const midi of notes) {
        if (midi === null) continue;
        const freq = midiToHz(midi);
        const out = karplusStrong({ sampleRate: rate, freq, sustain: 3, random: seeded(midi) });
        const cents = 1200 * Math.log2(measuredHz(out, rate, freq) / freq);
        expect(Math.abs(cents), `${name} note ${midi}: ${cents.toFixed(2)} cents`).toBeLessThan(1);
      }
    }
  });

  it('shapes the pluck by where it is picked', () => {
    // Picked a fifth of the way along, the 5th harmonic nearly vanishes from the pluck; picked unshaped, it doesn't.
    const freq = 110;
    const harmonic = (out: Float32Array, h: number) => {
      const period = sampleRate / freq;
      let re = 0;
      let im = 0;
      const n = Math.floor(period * 4);
      for (let i = 0; i < n; i++) {
        re += (out[i] ?? 0) * Math.cos((2 * Math.PI * h * i) / period);
        im += (out[i] ?? 0) * Math.sin((2 * Math.PI * h * i) / period);
      }
      return Math.hypot(re, im);
    };
    const picked = karplusStrong({ sampleRate, freq, sustain: 2, pick: 0.2, random: seeded(5) });
    const flat = karplusStrong({ sampleRate, freq, sustain: 2, pick: 0, random: seeded(5) });
    expect(harmonic(picked, 5) / harmonic(picked, 2)).toBeLessThan((harmonic(flat, 5) / harmonic(flat, 2)) * 0.5);
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
