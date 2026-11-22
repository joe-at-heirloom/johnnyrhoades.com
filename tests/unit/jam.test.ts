import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { hzToMidi, midiToName, noteToMidi, notePitch, onsetIndex, tailIndex, yin } from '../../src/lib/audio-analysis';
import {
  DEFAULT_SONG,
  FEELS,
  FEEL_INFO,
  KEYS,
  PARTS,
  TONES,
  barEvents,
  chordName,
  drumSampleId,
  noteAtOrAbove,
  SAMPLE_STEP,
  sampleNotes,
  parseSong,
  pickSample,
  progression,
  songToParams,
  type MeasuredSound,
  type Song,
} from '../../src/lib/jam';
import { parseJamManifest } from '../../src/lib/jam-manifest';

const RATE = 44100;
const tone = (hz: number, seconds: number, harmonics = [1, 0.5, 0.3]) => {
  const x = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < x.length; i++) x[i] = harmonics.reduce((s, a, h) => s + a * Math.sin((2 * Math.PI * hz * (h + 1) * i) / RATE), 0) * 0.3;
  return x;
};

describe('audio analysis', () => {
  it('names notes both ways', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('E1')).toBe(28);
    expect(noteToMidi('A#3')).toBe(58);
    expect(noteToMidi('Bb3')).toBe(58);
    expect(midiToName(28)).toBe('E1');
    expect(hzToMidi(440)).toBe(69);
    expect(() => noteToMidi('H2')).toThrow();
  });

  it('finds where a sound starts and stops', () => {
    const x = new Float32Array(RATE);
    x.set(tone(220, 0.25), 10000);
    expect(onsetIndex(x, RATE, -30, 0)).toBe(10000 + 1); // sin(0) is silent; the first loud sample follows
    expect(tailIndex(x)).toBeGreaterThan(10000 + 0.24 * RATE);
    expect(tailIndex(x)).toBeLessThanOrEqual(10000 + 0.25 * RATE);
  });

  it.each([41.2, 55, 82.4, 110, 261.6, 523.3])('measures a %s Hz note to within 5 cents', (hz) => {
    const p = notePitch(tone(hz, 1), RATE);
    expect(p).not.toBeNull();
    expect(Math.abs(1200 * Math.log2(p!.hz / hz))).toBeLessThan(5);
    expect(p!.clarity).toBeGreaterThan(0.9);
  });

  it('reads the fundamental of a note with a strong second harmonic, not the octave', () => {
    const p = notePitch(tone(110, 1, [0.6, 1, 0.4]), RATE);
    expect(Math.round(hzToMidi(p!.hz))).toBe(45);
  });

  it('finds no pitch in noise', () => {
    let s = 1;
    const noise = Float32Array.from({ length: RATE }, () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) * 2 - 1);
    expect(notePitch(noise, RATE)).toBeNull();
    expect(yin(new Float32Array(10), RATE)).toBeNull();
  });
});

describe('the manifest and the measured sounds', () => {
  const manifest = parseJamManifest(parse(readFileSync('src/data/jam.yaml', 'utf8')));
  const measured: { sounds: MeasuredSound[] } = JSON.parse(readFileSync('src/data/jam-sounds.json', 'utf8'));

  it('has every tone the page offers, with two notes for pitched tones', () => {
    for (const part of PARTS)
      for (const t of TONES[part]) {
        const n = manifest.filter((s) => s.part === part && s.tone === t).length;
        expect(n, `${part}/${t}`).toBe(part === 'drums' ? 4 : part === 'room' ? 1 : 2);
      }
  });

  it('has every drum and room sound as is, and a tuned sample at every note each pitched tone needs', () => {
    const ids = new Set(measured.sounds.map((s) => s.id));
    for (const s of manifest.filter((s) => !s.note)) expect(ids.has(s.id), s.id).toBe(true);
    for (const part of ['bass', 'guitar', 'keys', 'lead'] as const)
      for (const t of TONES[part]) {
        const got = measured.sounds.filter((s) => s.part === part && s.tone === t);
        expect(got.length, `${part}/${t}`).toBe(sampleNotes(part, t).length);
        // Each one measured within 15 cents of its note.
        for (const s of got) expect(Math.abs(s.midi! - Math.round(s.midi!)) * 100, s.id).toBeLessThanOrEqual(15);
      }
  });

  it('has a sample for every drum piece in every kit', () => {
    const ids = new Set(measured.sounds.map((s) => s.id));
    for (const kit of TONES.drums) for (const piece of ['kick', 'snare', 'hat', 'ride'] as const) expect(ids.has(drumSampleId(kit, piece))).toBe(true);
  });

  it('never bends a note more than a semitone and a half in the browser, in any key or feel', () => {
    for (const feel of FEELS)
      for (const key of KEYS) {
        const song: Song = { ...DEFAULT_SONG, feel, key, parts: { drums: null, bass: 'upright', guitar: 'crunch', keys: 'piano', lead: 'harp', room: null } };
        for (const part of ['bass', 'guitar', 'keys', 'lead'] as const)
          for (const t of TONES[part]) {
            const pool = measured.sounds.filter((s) => s.part === part && s.tone === t);
            for (let bar = 0; bar < 12; bar++)
              for (const e of barEvents({ ...song, parts: { ...song.parts, [part]: t } }, bar).filter((e) => e.part === part)) {
                const { rate } = pickSample(pool, e.midi!)!;
                expect(Math.abs(12 * Math.log2(rate)), `${part}/${t} ${key} ${feel}`).toBeLessThanOrEqual(SAMPLE_STEP / 2 + 0.15);
              }
          }
      }
  });

  it('rejects a pitched sound without a note, and an unknown tone', () => {
    const base = { id: 'x', part: 'bass', tone: 'upright', prompt: 'a long enough prompt', seconds: 1 };
    expect(() => parseJamManifest({ sounds: [base] })).toThrow(/needs a note/);
    expect(() => parseJamManifest({ sounds: [{ ...base, note: 'E1', tone: 'tuba' }] })).toThrow(/unknown tone/);
  });
});

describe('the song in the address bar', () => {
  it('round-trips', () => {
    const song: Song = { key: 'Bb', feel: 'slow', bpm: 60, quick: true, parts: { drums: 'brushes', bass: 'electric', guitar: null, keys: 'organ', lead: 'sax', room: 'vinyl' } };
    expect(parseSong(songToParams(song))).toEqual(song);
  });

  it('falls back to the default for anything missing or made up', () => {
    expect(parseSong(new URLSearchParams())).toEqual(DEFAULT_SONG);
    const s = parseSong(new URLSearchParams('key=H&feel=polka&drums=cowbell&bass=off'));
    expect(s.key).toBe('E');
    expect(s.feel).toBe('shuffle');
    expect(s.parts.drums).toBe('sticks');
    expect(s.parts.bass).toBeNull();
  });

  it('keeps the tempo inside the feel’s range', () => {
    expect(parseSong(new URLSearchParams('feel=slow&bpm=300')).bpm).toBe(FEEL_INFO.slow.max);
    expect(parseSong(new URLSearchParams('feel=boogie&bpm=1')).bpm).toBe(FEEL_INFO.boogie.min);
    expect(parseSong(new URLSearchParams('feel=boogie&bpm=abc')).bpm).toBe(FEEL_INFO.boogie.bpm);
  });
});

describe('the 12-bar', () => {
  it('is I I I I IV IV I I V IV I V, with the quick change on bar 2', () => {
    expect(progression(false)).toEqual([0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7]);
    expect(progression(true)[1]).toBe(5);
    expect(Array.from({ length: 12 }, (_, i) => chordName(DEFAULT_SONG, i))).toEqual(['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7']);
    expect(chordName({ ...DEFAULT_SONG, key: 'Bb' }, 8)).toBe('F7');
  });

  it('finds the next note of a pitch class', () => {
    expect(noteAtOrAbove(4, 28)).toBe(28);
    expect(noteAtOrAbove(9, 28)).toBe(33);
    expect(noteAtOrAbove(2, 28)).toBe(38);
  });

  it('keeps every event inside its bar', () => {
    for (const feel of FEELS)
      for (let bar = 0; bar < 12; bar++)
        for (const e of barEvents({ ...DEFAULT_SONG, feel }, bar)) {
          expect(e.at).toBeGreaterThanOrEqual(0);
          expect(e.at).toBeLessThan(4);
          expect(e.gain).toBeGreaterThan(0);
          expect(e.gain).toBeLessThanOrEqual(1);
        }
  });

  it('puts the backbeat on 2 and 4, and the kick on 1 and 3', () => {
    const ev = barEvents(DEFAULT_SONG, 0);
    expect(ev.filter((e) => e.drum === 'snare').map((e) => e.at)).toEqual([1, 3]);
    expect(ev.filter((e) => e.drum === 'kick').map((e) => e.at)).toEqual([0, 2]);
  });

  it('swings the shuffle and keeps the straight eight straight', () => {
    const offbeats = (feel: Song['feel']) => barEvents({ ...DEFAULT_SONG, feel }, 0).filter((e) => e.part === 'guitar' && e.at % 1 !== 0).map((e) => +(e.at % 1).toFixed(3));
    expect(new Set(offbeats('shuffle'))).toEqual(new Set([0.667]));
    expect(new Set(offbeats('straight'))).toEqual(new Set([0.5]));
  });

  it('plays the chord’s root on the downbeat in the bass, in the bass register', () => {
    for (const key of KEYS)
      for (let bar = 0; bar < 12; bar++) {
        const song = { ...DEFAULT_SONG, key };
        const first = barEvents(song, bar).find((e) => e.part === 'bass' && e.at === 0)!;
        expect(midiToName(first.midi!).replace(/\d/, '')).toBe(chordName(song, bar).replace('7', '').replace('Bb', 'A#').replace('Eb', 'D#'));
        expect(first.midi).toBeGreaterThanOrEqual(28);
        expect(first.midi).toBeLessThan(40);
      }
  });

  it('leaves the fills out of the first two bars of each line (call and response)', () => {
    const bars = Array.from({ length: 12 }, (_, i) => barEvents(DEFAULT_SONG, i).some((e) => e.part === 'lead'));
    expect(bars).toEqual([false, false, true, true, false, false, true, true, false, false, true, true]);
  });

  it('keeps the fills in the key’s blues scale', () => {
    const scale = new Set([0, 3, 5, 6, 7, 10]);
    for (const key of KEYS)
      for (let bar = 0; bar < 12; bar++)
        for (const e of barEvents({ ...DEFAULT_SONG, key }, bar).filter((e) => e.part === 'lead')) {
          const tonic = noteToMidi(`${key}4`) % 12; // pitch class only
          expect(scale.has((((e.midi! - tonic) % 12) + 12) % 12)).toBe(true);
        }
  });

  it('plays nothing for a part that’s off', () => {
    const ev = barEvents({ ...DEFAULT_SONG, parts: { drums: null, bass: null, guitar: null, keys: null, lead: null, room: null } }, 2);
    expect(ev).toEqual([]);
  });
});

describe('choosing a sample', () => {
  const pool: MeasuredSound[] = [
    { id: 'a', part: 'bass', tone: 'upright', file: 'a.mp3', seconds: 1, midi: 36 },
    { id: 'b', part: 'bass', tone: 'upright', file: 'b.mp3', seconds: 1, midi: 41 },
  ];
  it('picks the nearest recorded note and tunes it', () => {
    expect(pickSample(pool, 36)).toEqual({ sound: pool[0], rate: 1 });
    expect(pickSample(pool, 43)!.sound.id).toBe('b');
    expect(pickSample(pool, 43)!.rate).toBeCloseTo(Math.pow(2, 2 / 12));
    expect(pickSample([], 40)).toBeNull();
  });
  it('asks for a tuned sample every few semitones across each part’s range', () => {
    expect(sampleNotes('bass', 'upright')).toEqual([28, 31, 34, 37, 40, 43, 46, 49]);
    expect(sampleNotes('drums', 'sticks')).toEqual([]);
    for (const n of [sampleNotes('lead', 'harp'), sampleNotes('keys', 'organ')]) expect(n.slice(1).map((v, i) => v - n[i]!)).toEqual(n.slice(1).map(() => SAMPLE_STEP));
  });
  it('gives brushes the sweep for the hi-hat', () => {
    expect(drumSampleId('brushes', 'hat')).toBe('brushes-sweep');
    expect(drumSampleId('sticks', 'hat')).toBe('sticks-hat');
  });
});

describe('the bass line', () => {
  it('never goes under the open E, and walks a half step into each new chord', () => {
    for (const key of KEYS)
      for (const feel of FEELS)
        for (let bar = 0; bar < 12; bar++) {
          const song = { ...DEFAULT_SONG, key, feel };
          const bass = barEvents(song, bar).filter((e) => e.part === 'bass');
          for (const e of bass) expect(e.midi).toBeGreaterThanOrEqual(28);
          const changes = progression(false)[bar] !== progression(false)[(bar + 1) % 12];
          if (changes && feel === 'shuffle') {
            const next = barEvents(song, (bar + 1) % 12).find((e) => e.part === 'bass' && e.at === 0)!;
            expect(Math.abs(bass.at(-1)!.midi! - next.midi!)).toBe(1);
          }
        }
  });
});
