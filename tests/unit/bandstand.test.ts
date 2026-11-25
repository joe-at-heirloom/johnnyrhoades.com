import { describe, expect, it } from 'vitest';
import { BASS_STRINGS, GUITAR_STRINGS, hit, holeFor, keyboard, keyFor, stringFor, swing } from '../../src/lib/bandstand';

describe('the bandstand', () => {
  it('plays each note on the string a player would use', () => {
    expect(stringFor(28, BASS_STRINGS)).toBe(0); // open E
    expect(stringFor(32, BASS_STRINGS)).toBe(0); // G#, still on the E string
    expect(stringFor(33, BASS_STRINGS)).toBe(1); // open A
    expect(stringFor(49, BASS_STRINGS)).toBe(3);
    expect(stringFor(40, GUITAR_STRINGS)).toBe(0);
    expect(stringFor(60, GUITAR_STRINGS)).toBe(4);
    expect(stringFor(20, GUITAR_STRINGS)).toBe(0); // under the range: the low string
  });

  it('lays out a keyboard: seven whites an octave, black keys between them', () => {
    const keys = keyboard(48, 71, 140); // C3 to B4
    expect(keys).toHaveLength(24);
    expect(keys.filter((k) => !k.black)).toHaveLength(14);
    const c = keys.find((k) => k.midi === 48)!;
    const cs = keys.find((k) => k.midi === 49)!;
    const d = keys.find((k) => k.midi === 50)!;
    expect(c.w).toBeCloseTo(10);
    expect(cs.black).toBe(true);
    expect(cs.x).toBeGreaterThan(c.x);
    expect(cs.x + cs.w).toBeLessThan(d.x + d.w);
    expect(keys.at(-1)!.x + keys.at(-1)!.w).toBeCloseTo(140);
  });

  it('folds a note outside the keyboard into it by octaves', () => {
    expect(keyFor(40, 48, 76)).toBe(52);
    expect(keyFor(88, 48, 76)).toBe(76);
    expect(keyFor(60, 48, 76)).toBe(60);
  });

  it('spreads the fills over the harmonica’s ten holes', () => {
    expect(holeFor(59, 59, 86)).toBe(0);
    expect(holeFor(86, 59, 86)).toBe(9);
    expect(holeFor(72, 59, 86)).toBe(4);
    expect(holeFor(10, 59, 86)).toBe(0);
  });

  it('lets a string ring out in about half a second, and a drum hit in about a tenth', () => {
    expect(swing(0, 1, 6)).toBeCloseTo(6);
    expect(Math.abs(swing(0.3, 1, 6))).toBeLessThan(1);
    expect(swing(0.7, 1, 6)).toBe(0);
    expect(swing(-0.1, 1, 6)).toBe(0);
    expect(hit(0, 0.8)).toBeCloseTo(0.8);
    expect(hit(0.06, 1)).toBeCloseTo(0.5);
    expect(hit(0.2, 1)).toBe(0);
  });
});
