import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEEL_INFO, KEYS, parseSong, pickSample, SAMPLE_STEP, songToParams, type MeasuredSound } from '../../src/lib/jam';
import { mixToParam, parseMix } from '../../src/lib/mixer';
import { BLUES_SCALE, SIT_IN, SIT_IN_INSTRUMENTS, bendFromDrag, noteName, padFor, padForKey, pads, spoken } from '../../src/lib/sit-in';
import { STYLES } from '../../src/lib/styles';

describe('sitting in', () => {
  it('lays the blues scale out on eight pads, in the song’s key', () => {
    const e = pads('E', 'harp');
    expect(e.map((p) => p.name)).toEqual(['E', 'G', 'A', 'Bb', 'B', 'D', 'E', 'G']);
    expect(e.map((p) => p.degree)).toEqual(['1', 'b3', '4', 'b5', '5', 'b7', '1', 'b3']);
    expect(spoken(e[3]!)).toBe('B flat, the flat 5');
    expect(spoken(e[0]!)).toBe('E, the 1');
    expect(e.map((p) => p.midi - e[0]!.midi)).toEqual([...BLUES_SCALE]);
    expect(pads('Bb', 'sax')[0]!.name).toBe('Bb');
    expect(noteName(61)).toBe('Db');
  });

  it('plays every pad of every instrument, in every key, from its own tuned samples', () => {
    const measured: { sounds: MeasuredSound[] } = JSON.parse(readFileSync('src/data/jam-sounds.json', 'utf8'));
    for (const inst of SIT_IN_INSTRUMENTS)
      for (const key of KEYS) {
        const pool = measured.sounds.filter((s) => s.part === SIT_IN[inst].part && s.tone === SIT_IN[inst].tone);
        for (const pad of pads(key, inst)) {
          const { rate } = pickSample(pool, pad.midi)!;
          // Guitar tops out two semitones over its samples in C; everything else stays within the usual bend.
          expect(Math.abs(12 * Math.log2(rate)), `${inst} in ${key}: ${pad.name}`).toBeLessThanOrEqual(inst === 'guitar' ? 2.2 : SAMPLE_STEP / 2 + 0.15);
        }
      }
  });

  it('plays the pads from the home row', () => {
    expect(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'].map(padForKey)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(padForKey('A')).toBe(0);
    expect(padForKey('q')).toBe(-1);
  });

  it('bends a dragged pad up to a whole step, never down', () => {
    expect(bendFromDrag(0)).toBe(0);
    expect(bendFromDrag(30)).toBe(1);
    expect(bendFromDrag(200)).toBe(2);
    expect(bendFromDrag(-50)).toBe(0);
  });

  it('finds the pad for a note of the band’s call, in the nearest octave', () => {
    const e = pads('E', 'harp');
    // A note a pad plays is that pad, even the octave up.
    e.forEach((p, i) => expect(padFor(p.midi, 'E', 'harp')).toBe(i));
    // An octave below the pads, the 1 is still the first pad; a note off the scale shows on the nearest one.
    expect(padFor(e[0]!.midi - 12, 'E', 'harp')).toBe(0);
    expect(padFor(e[0]!.midi + 1, 'E', 'harp')).toBe(0); // F, by E
    expect(padFor(e[0]!.midi + 2, 'E', 'harp')).toBe(1); // F#, by G
    expect(padFor(e[0]!.midi + 9, 'E', 'harp')).toBe(5); // C#, by D
  });
});

describe('styles', () => {
  it('are whole songs and mixes that survive a link', () => {
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
    for (const s of STYLES) {
      const info = FEEL_INFO[s.song.feel];
      expect(s.song.bpm, s.id).toBeGreaterThanOrEqual(info.min);
      expect(s.song.bpm, s.id).toBeLessThanOrEqual(info.max);
      expect(parseSong(songToParams(s.song)), s.id).toEqual(s.song);
      expect(parseMix(mixToParam(s.mix)), s.id).toEqual(s.mix);
    }
  });

  it('never use the words the site doesn’t', () => {
    const banned = /soulful|electrifying|legendary|powerhouse|world-class|detroit's best/i;
    for (const s of STYLES) expect(`${s.label} ${s.blurb}`).not.toMatch(banned);
  });
});
