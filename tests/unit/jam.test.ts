import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { hzToMidi, levelTo, loudness, midiToName, noteToMidi, notePitch, onsetIndex, tailIndex, yin } from '../../src/lib/audio-analysis';
import {
  DEFAULT_SONG,
  FEELS,
  FEEL_INFO,
  KEYS,
  PARTS,
  TONES,
  barEvents,
  COUNT_IN,
  humanize,
  legato,
  autoSection,
  startBar,
  SECTIONS,
  type Section,
  type JamEvent,
  chordName,
  degreeName,
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
import { DRUM_PIECES, parseJamManifest } from '../../src/lib/jam-manifest';

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

  it('measures and sets loudness, never past the peak ceiling', () => {
    const quiet = tone(220, 1).map((v) => v * 0.1);
    expect(loudness(levelTo(quiet, -14, RATE))).toBeCloseTo(-14, 1);
    const spiky = new Float32Array(RATE);
    spiky[100] = 0.5;
    const leveled = levelTo(spiky, -14, RATE);
    expect(Math.max(...leveled.map(Math.abs))).toBeCloseTo(Math.pow(10, -1 / 20), 3);
    expect(loudness(new Float32Array(10))).toBe(-Infinity);
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

  it('renders every pitched tone the page offers from the soundfont, and generates the room loops', () => {
    for (const part of ['bass', 'guitar', 'keys', 'lead'] as const)
      for (const t of TONES[part]) expect(manifest.tones.filter((x) => x.part === part && x.tone === t), `${part}/${t}`).toHaveLength(1);
    for (const kit of TONES.drums) expect(manifest.drums.filter((d) => d.tone === kit).map((d) => d.id).sort(), kit).toEqual(DRUM_PIECES.map((p) => drumSampleId(kit, p)).sort());
    expect(manifest.generated.map((g) => g.tone).sort()).toEqual([...TONES.room].sort());
    expect(manifest.soundfont.url).toMatch(/^https:\/\/ftp\.osuosl\.org\/pub\/musescore\//);
  });

  it('has every drum and room sound, and a sample in tune at every note each pitched tone needs', () => {
    const ids = new Set(measured.sounds.map((s) => s.id));
    for (const s of [...manifest.drums, ...manifest.generated]) expect(ids.has(s.id), s.id).toBe(true);
    for (const part of ['bass', 'guitar', 'keys', 'lead'] as const)
      for (const t of TONES[part]) {
        const got = measured.sounds.filter((s) => s.part === part && s.tone === t);
        expect(got.map((s) => Math.round(s.midi!)), `${part}/${t}`).toEqual(sampleNotes(part, t));
        // Rendered at the note, and measured within 25 cents of it.
        for (const s of got) expect(Math.abs(s.midi! - Math.round(s.midi!)) * 100, s.id).toBeLessThanOrEqual(25);
      }
  });

  it('keeps the soundfont’s license beside the samples', () => {
    const license = readFileSync('src/assets/jam/LICENSE-MuseScore_General.md', 'utf8');
    expect(license).toContain('shared under the MIT license');
    expect(license).toContain('Permission is hereby granted, free of charge');
  });

  it('rejects a tone twice over, an unknown tone, and a duplicate id', () => {
    const base = parse(readFileSync('src/data/jam.yaml', 'utf8'));
    expect(() => parseJamManifest({ ...base, tones: [...base.tones, base.tones[0]] })).toThrow(/listed twice/);
    expect(() => parseJamManifest({ ...base, tones: [{ ...base.tones[0], tone: 'tuba' }] })).toThrow(/unknown/);
    expect(() => parseJamManifest({ ...base, drums: [...base.drums, base.drums[0]] })).toThrow(/duplicate id/);
  });

  it('levels every note of a tone to within 3.5 dB, and the room loops to the same level', () => {
    const byTone = new Map<string, number[]>();
    for (const s of measured.sounds) if (s.part !== 'drums' && s.part !== 'room') byTone.set(s.tone, [...(byTone.get(s.tone) ?? []), s.db!]);
    for (const [tone, dbs] of byTone) expect(Math.max(...dbs) - Math.min(...dbs), tone).toBeLessThanOrEqual(3.5);
    for (const s of measured.sounds.filter((s) => s.part === 'room')) expect(Math.abs(s.db! + 26), s.id).toBeLessThanOrEqual(1);
  });

  it('has a sample for every drum piece in every kit', () => {
    const ids = new Set(measured.sounds.map((s) => s.id));
    for (const kit of TONES.drums) for (const piece of ['kick', 'snare', 'hat', 'ride', 'crash', 'rim'] as const) expect(ids.has(drumSampleId(kit, piece))).toBe(true);
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

});

describe('the song in the address bar', () => {
  it('round-trips', () => {
    const song: Song = { key: 'Bb', feel: 'slow', bpm: 60, quick: true, intro: false, parts: { drums: 'brushes', bass: 'electric', guitar: null, keys: 'organ', lead: 'sax', room: 'vinyl' } };
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
    expect(ev.filter((e) => e.drum === 'snare' && e.gain > 0.5).map((e) => e.at)).toEqual([1, 3]);
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

  it('leaves the fills out of the first two bars of each line (call and response), and bar 11 to the guitar', () => {
    const bars = (song: Song) => Array.from({ length: 12 }, (_, i) => barEvents(song, i).some((e) => e.part === 'lead'));
    expect(bars(DEFAULT_SONG)).toEqual([false, false, true, true, false, false, true, true, false, false, false, true]);
    const noGuitar = { ...DEFAULT_SONG, parts: { ...DEFAULT_SONG.parts, guitar: null } };
    expect(bars(noGuitar)).toEqual([false, false, true, true, false, false, true, true, false, false, true, true]);
  });

  it('answers differently the next time through the 12', () => {
    const fills = (from: number) => Array.from({ length: 12 }, (_, i) => barEvents(DEFAULT_SONG, from + i).filter((e) => e.part === 'lead').map((e) => `${e.at}:${e.midi}`).join(' '));
    expect(fills(12)).not.toEqual(fills(0));
    // The rest of the band varies too (a different walk, a fill, a climb to the seventh), but on the same chords.
    const all = (from: number) => Array.from({ length: 12 }, (_, i) => barEvents(DEFAULT_SONG, from + i).filter((e) => e.part !== 'lead'));
    expect(all(12)).not.toEqual(all(0));
    for (let i = 0; i < 12; i++) {
      const downbeat = (bar: number) => barEvents(DEFAULT_SONG, bar).find((e) => e.part === 'bass' && e.at === 0)!.midi;
      expect(downbeat(12 + i)).toBe(downbeat(i));
    }
  });

  it('ghosts a snare note before 4, and fills on the snare at the end of the 12', () => {
    const snares = (bar: number) => barEvents(DEFAULT_SONG, bar).filter((e) => e.drum === 'snare');
    expect(snares(0).find((e) => e.gain < 0.3)!.at).toBeCloseTo(2 + 2 / 3);
    const fill = snares(11).filter((e) => e.at >= 3);
    expect(fill.map((e) => +e.at.toFixed(3))).toEqual([3, 3.333, 3.667]);
    expect(fill.map((e) => e.gain)).toEqual([...fill.map((e) => e.gain)].sort());
    expect(barEvents(DEFAULT_SONG, 11).some((e) => e.drum === 'ride' && e.at >= 3)).toBe(false);
  });

  it('plays the turnaround in bar 11: a pedal over a line walking down from the seventh to the fifth', () => {
    for (const key of KEYS) {
      const song = { ...DEFAULT_SONG, key };
      const ev = barEvents(song, 10).filter((e) => e.part === 'guitar' && Number.isInteger(e.at));
      const root = noteAtOrAbove(noteToMidi(`${key}4`) % 12, 40);
      for (let b = 0; b < 4; b++) {
        const onBeat = ev.filter((e) => e.at === b).map((e) => e.midi! - root).sort((x, y) => x - y);
        expect(onBeat).toEqual([[10, 12], [9, 12], [8, 12], [7, 12]][b]);
      }
    }
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

describe('the feel', () => {
  it('moves each note a few milliseconds and changes its accent a little, the same way every time', () => {
    for (let bar = 0; bar < 24; bar++)
      for (let i = 0; i < 40; i++) {
        const h = humanize(bar, i, i % 2 ? 'drums' : 'bass');
        expect(Math.abs(h.seconds)).toBeLessThanOrEqual(i % 2 ? 0.004 : 0.012);
        expect(h.gain).toBeGreaterThanOrEqual(0.92);
        expect(h.gain).toBeLessThanOrEqual(1.08);
        expect(humanize(bar, i, 'bass')).toEqual(humanize(bar, i, 'bass'));
      }
    // Not the same nudge on every note.
    expect(new Set(Array.from({ length: 20 }, (_, i) => humanize(0, i, 'bass').seconds.toFixed(4))).size).toBeGreaterThan(15);
  });
  it('counts in four beats', () => {
    expect(COUNT_IN).toEqual([-4, -3, -2, -1]);
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

describe('the chart', () => {
  it('names each bar’s chord the way musicians count: I, IV, V', () => {
    expect(Array.from({ length: 12 }, (_, i) => degreeName(DEFAULT_SONG, i)).join(' ')).toBe('I I I I IV IV I I V IV I V');
    expect(degreeName({ ...DEFAULT_SONG, quick: true }, 1)).toBe('IV');
    expect(degreeName(DEFAULT_SONG, 13)).toBe('I');
  });
});

describe('legato', () => {
  it('holds each bass and fill note until the next, and leaves chords and drums alone', () => {
    for (const feel of FEELS)
      for (let bar = 0; bar < 24; bar++) {
        const ev = barEvents({ ...DEFAULT_SONG, feel }, bar);
        for (const part of ['bass', 'lead'] as const) {
          const line = ev.filter((e) => e.part === part).sort((a, b) => a.at - b.at);
          line.forEach((e, i) => {
            const until = i + 1 < line.length ? line[i + 1]!.at : 4;
            expect(e.at + e.beats, `${feel} ${part} bar ${bar}`).toBeGreaterThanOrEqual(Math.min(until, e.at + 2) - 1e-9);
          });
        }
      }
    const plain = [
      { at: 0, part: 'bass' as const, midi: 28, gain: 1, beats: 0.4 },
      { at: 1, part: 'bass' as const, midi: 32, gain: 1, beats: 0.4 },
      { at: 0, part: 'drums' as const, drum: 'kick' as const, gain: 1, beats: 1 },
      { at: 0, part: 'keys' as const, midi: 60, gain: 1, beats: 0.4 },
    ];
    expect(legato(plain).map((e) => e.beats)).toEqual([1, 2, 1, 0.4]);
  });
});

describe('the arrangement', () => {
  const at = (song: Song, bar: number, section: Section) => barEvents(song, bar, section);
  const parts = (ev: JamEvent[]) => new Set(ev.map((e) => e.part));

  it('plays the tune twice, then a solo, a breakdown, stop time and the tune again, around and around', () => {
    expect(Array.from({ length: 10 }, (_, c) => autoSection(c))).toEqual(['head', 'head', 'solo', 'quiet', 'stop', 'head', 'solo', 'quiet', 'stop', 'head']);
  });

  it('starts on the turnaround as an intro, unless asked not to', () => {
    expect(startBar(DEFAULT_SONG)).toBe(8);
    expect(startBar({ ...DEFAULT_SONG, intro: false })).toBe(0);
    expect(parseSong(new URLSearchParams('intro=none')).intro).toBe(false);
    expect(parseSong(new URLSearchParams()).intro).toBe(true);
  });

  it('crashes the cymbal at the top of the form, except when it’s broken down', () => {
    for (const section of ['head', 'solo', 'stop', 'ending'] as const) expect(at(DEFAULT_SONG, 12, section).some((e) => e.drum === 'crash' && e.at === 0), section).toBe(true);
    expect(at(DEFAULT_SONG, 12, 'quiet').some((e) => e.drum === 'crash')).toBe(false);
    expect(at(DEFAULT_SONG, 13, 'head').some((e) => e.drum === 'crash')).toBe(false);
  });

  it('lets the fills take the whole chorus in a solo, ending on the fifth', () => {
    for (let i = 0; i < 12; i++) expect(at(DEFAULT_SONG, 24 + i, 'solo').some((e) => e.part === 'lead'), `bar ${i + 1}`).toBe(true);
    const last = at(DEFAULT_SONG, 35, 'solo').filter((e) => e.part === 'lead').at(-1)!;
    expect((last.midi! - noteToMidi('E4')) % 12).toBe(7);
  });

  it('breaks it down: cross-stick instead of snare, no crash, half-note bass, quieter all round', () => {
    const quiet = at(DEFAULT_SONG, 13, 'quiet');
    const head = at(DEFAULT_SONG, 13, 'head');
    expect(quiet.some((e) => e.drum === 'rim')).toBe(true);
    expect(quiet.some((e) => e.drum === 'snare')).toBe(false);
    expect(quiet.filter((e) => e.part === 'bass').map((e) => e.at)).toEqual([0, 2]);
    const loudest = (ev: JamEvent[], part: string) => Math.max(...ev.filter((e) => e.part === part).map((e) => e.gain));
    for (const part of ['drums', 'bass', 'guitar', 'keys']) expect(loudest(quiet, part), part).toBeLessThan(loudest(head, part));
  });

  it('in stop time the band hits one together for the first line, and the soloist plays into the gaps', () => {
    for (let i = 0; i < 4; i++) {
      const ev = at(DEFAULT_SONG, 36 + i, 'stop');
      const band = ev.filter((e) => e.part === 'bass' || e.part === 'guitar' || e.part === 'keys');
      expect(band.every((e) => e.at === 0), `bar ${i + 1}`).toBe(true);
      expect(ev.filter((e) => e.part === 'lead').length).toBeGreaterThan(0);
      expect(ev.filter((e) => e.part === 'lead').every((e) => e.at >= 1)).toBe(true);
    }
    // The second line swings again.
    expect(at(DEFAULT_SONG, 40, 'stop').filter((e) => e.part === 'bass').length).toBeGreaterThan(1);
  });

  it('takes it home: the ending line in bar 11, then the stab a half step above sliding into the last chord', () => {
    for (const key of KEYS) {
      const song = { ...DEFAULT_SONG, key };
      const line = at(song, 22, 'ending');
      expect(line.some((e) => e.part === 'lead')).toBe(false);
      const last = at(song, 23, 'ending');
      const home = noteToMidi(`${key}4`) % 12;
      const bass = last.filter((e) => e.part === 'bass');
      expect(bass.map((e) => (((e.midi! - home) % 12) + 12) % 12)).toEqual([1, 0]);
      expect(bass[1]!.beats).toBeGreaterThan(3);
      expect(last.some((e) => e.drum === 'crash' && e.at === bass[1]!.at)).toBe(true);
      // Nothing plays after the last chord lands.
      expect(Math.max(...last.map((e) => e.at))).toBeLessThan(1);
    }
  });

  it('scoops into some notes, a semitone or two, and only on the fills', () => {
    const bends = Array.from({ length: 24 }, (_, i) => at(DEFAULT_SONG, 24 + i, 'solo')).flat().filter((e) => e.bend);
    expect(bends.length).toBeGreaterThan(3);
    for (const e of bends) {
      expect(e.part).toBe('lead');
      expect([-1, -2]).toContain(e.bend);
    }
  });

  it('keeps every chorus kind inside each part’s samples, in every key and feel', () => {
    const measured: { sounds: MeasuredSound[] } = JSON.parse(readFileSync('src/data/jam-sounds.json', 'utf8'));
    for (let t = 0; t < 3; t++) {
      // Each tone of each part, in turn.
      const tones = Object.fromEntries(PARTS.map((p) => [p, TONES[p][t % TONES[p].length]])) as Song['parts'];
      for (const section of SECTIONS)
      for (const feel of FEELS)
        for (const key of KEYS)
          for (let bar = 12; bar < 24; bar++)
            for (const e of at({ ...DEFAULT_SONG, key, feel, parts: tones }, bar, section)) {
              if (e.part === 'drums' || e.part === 'room' || e.midi === undefined) continue;
              const tone = tones[e.part]!;
              const { rate } = pickSample(measured.sounds.filter((s) => s.part === e.part && s.tone === tone), e.midi)!;
              expect(Math.abs(12 * Math.log2(rate)), `${section} ${feel} ${key} ${e.part}/${tone} ${e.midi}`).toBeLessThanOrEqual(SAMPLE_STEP / 2 + 0.15);
            }
    }
  });

  it('keeps every chorus kind inside its bar', () => {
    for (const section of SECTIONS)
      for (let bar = 0; bar < 24; bar++)
        for (const e of at(DEFAULT_SONG, bar, section)) {
          expect(e.at).toBeGreaterThanOrEqual(0);
          expect(e.at).toBeLessThan(4);
          expect(e.gain).toBeGreaterThan(0);
          expect(e.gain).toBeLessThanOrEqual(1.1);
        }
    expect(parts(at(DEFAULT_SONG, 12, 'solo'))).toEqual(new Set(['drums', 'bass', 'guitar', 'keys', 'lead']));
  });
});
