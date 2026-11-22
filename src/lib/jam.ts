/*
  The blues maker (/jam/, ADR 0030): pure music theory and patterns.

  A song is a few choices: key, feel, tempo, 12-bar form, and a tone (or
  nothing) for each part. Given those, `barEvents` says exactly what every
  part plays in one bar, in beats from the bar's downbeat. The browser
  (src/scripts/jam.ts) only schedules what this returns, so everything
  musical here is unit tested.

  The sounds are single notes and drum hits from ElevenLabs
  (src/data/jam.yaml). ElevenLabs won't play a requested note, so each
  pitched tone is tuned offline into a sample every SAMPLE_STEP semitones
  (src/lib/psola.ts), and `pickSample` takes the nearest one: no note is
  repitched in the browser by more than a semitone and a half. Chords are
  stacked single notes.
*/
/* ---------- The sounds ---------- */

export const PARTS = ['drums', 'bass', 'guitar', 'keys', 'lead', 'room'] as const;
export type Part = (typeof PARTS)[number];

export const TONES = {
  drums: ['sticks', 'brushes'],
  bass: ['upright', 'electric'],
  guitar: ['crunch', 'clean', 'acoustic'],
  keys: ['piano', 'organ'],
  lead: ['harp', 'sax'],
  room: ['bar', 'vinyl'],
} as const satisfies Record<Part, readonly string[]>;

export const TONE_LABELS: Record<string, string> = {
  sticks: 'Sticks',
  brushes: 'Brushes',
  upright: 'Upright',
  electric: 'Electric',
  crunch: 'Crunch',
  clean: 'Clean hollowbody',
  acoustic: 'Acoustic',
  piano: 'Upright piano',
  organ: 'Organ',
  harp: 'Harmonica',
  sax: 'Tenor sax',
  bar: 'A quiet bar',
  vinyl: 'Old record',
};

export const PART_LABELS: Record<Part, string> = {
  drums: 'Drums',
  bass: 'Bass',
  guitar: 'Guitar',
  keys: 'Keys',
  lead: 'Fills',
  room: 'Room',
};

/** What the generator measured (src/data/jam-sounds.json). `midi` is fractional: the real pitch. */
export type MeasuredSound = { id: string; part: Part; tone: string; file: string; midi?: number; seconds: number; loop?: boolean };

/* ---------- The song ---------- */

export const KEYS = ['E', 'A', 'G', 'C', 'Bb'] as const;
export type Key = (typeof KEYS)[number];
const KEY_PC: Record<Key, number> = { C: 0, E: 4, G: 7, A: 9, Bb: 10 };

export const FEELS = ['shuffle', 'slow', 'boogie', 'straight'] as const;
export type Feel = (typeof FEELS)[number];

export const FEEL_INFO: Record<Feel, { label: string; bpm: number; min: number; max: number; swing: number }> = {
  // swing: where the offbeat eighth falls in the beat (0.5 straight, 2/3 a full triplet shuffle)
  shuffle: { label: 'Shuffle', bpm: 100, min: 70, max: 140, swing: 2 / 3 },
  slow: { label: 'Slow blues', bpm: 58, min: 44, max: 76, swing: 2 / 3 },
  boogie: { label: 'Boogie', bpm: 132, min: 100, max: 176, swing: 0.62 },
  straight: { label: 'Straight eight', bpm: 112, min: 84, max: 150, swing: 0.5 },
};

export type Song = {
  key: Key;
  feel: Feel;
  bpm: number;
  /** Quick change: bar 2 goes to the IV chord. */
  quick: boolean;
  parts: Record<Part, string | null>;
};

export const DEFAULT_SONG: Song = {
  key: 'E',
  feel: 'shuffle',
  bpm: FEEL_INFO.shuffle.bpm,
  quick: false,
  parts: { drums: 'sticks', bass: 'upright', guitar: 'crunch', keys: 'piano', lead: 'harp', room: null },
};

/** Read a song from the page's query string. Anything missing or unknown falls back to the default. */
export function parseSong(params: URLSearchParams): Song {
  const pick = <T extends string>(value: string | null, options: readonly T[], fallback: T): T =>
    value !== null && (options as readonly string[]).includes(value) ? (value as T) : fallback;
  const key = pick(params.get('key'), KEYS, DEFAULT_SONG.key);
  const feel = pick(params.get('feel'), FEELS, DEFAULT_SONG.feel);
  const info = FEEL_INFO[feel];
  const rawBpm = Number(params.get('bpm'));
  const bpm = Number.isFinite(rawBpm) && rawBpm > 0 ? Math.round(Math.min(info.max, Math.max(info.min, rawBpm))) : info.bpm;
  const parts = {} as Song['parts'];
  for (const part of PARTS) {
    const v = params.get(part);
    parts[part] = v === null ? DEFAULT_SONG.parts[part] : v === 'off' ? null : pick(v, TONES[part], DEFAULT_SONG.parts[part] ?? TONES[part][0]);
  }
  return { key, feel, bpm, quick: params.get('change') === 'quick', parts };
}

export function songToParams(song: Song): URLSearchParams {
  const p = new URLSearchParams({ key: song.key, feel: song.feel, bpm: String(song.bpm), change: song.quick ? 'quick' : 'slow' });
  for (const part of PARTS) p.set(part, song.parts[part] ?? 'off');
  return p;
}

/* ---------- Harmony ---------- */

/** Semitones above the key's root for each bar: I, IV or V. */
export function progression(quick: boolean): number[] {
  const I = 0;
  const IV = 5;
  const V = 7;
  return [I, quick ? IV : I, I, I, IV, IV, I, I, V, IV, I, V];
}

/** Dominant seventh chord tones, in semitones above the chord root. */
const R = 0;
const M3 = 4;
const P5 = 7;
const M6 = 9;
const b7 = 10;
const OCT = 12;

/** The lowest MIDI note at or above `floor` with the given pitch class. */
export const noteAtOrAbove = (pc: number, floor: number) => floor + ((((pc - floor) % 12) + 12) % 12);

/** Each part's register: the root lands between floor and floor + 11. */
const FLOOR: Record<Exclude<Part, 'drums' | 'room'>, number> = {
  bass: 28, // E1
  guitar: 40, // E2
  keys: 52, // E3
  lead: 0, // set per tone below
};
// Set near the recorded notes, so tuning them moves them least: ElevenLabs plays a C
// harmonica (C5), and its tenor sax around B flat 3, whatever note you ask for.
const LEAD_FLOOR: Record<string, number> = { harp: 59, sax: 46 };

/* ---------- Patterns ---------- */

export type DrumPiece = 'kick' | 'snare' | 'hat' | 'ride';

export type JamEvent = {
  /** Beats from the bar's downbeat. */
  at: number;
  part: Part;
  /** MIDI note for pitched parts. */
  midi?: number;
  drum?: DrumPiece;
  /** 0–1, before the part's own level. */
  gain: number;
  /** How long it rings, in beats (cut off after, with a short fade). */
  beats: number;
};

/** Where an eighth note falls: beat `b` (0–3), on the beat or the swung offbeat. */
const eighth = (b: number, off: boolean, swing: number) => b + (off ? swing : 0);
/** The three triplets of beat `b`. */
const triplets = (b: number) => [b, b + 1 / 3, b + 2 / 3];

function drums(feel: Feel, swing: number): JamEvent[] {
  const ev: JamEvent[] = [];
  const hit = (at: number, drum: DrumPiece, gain: number, beats = 1) => ev.push({ at, part: 'drums', drum, gain, beats });
  for (let b = 0; b < 4; b++) {
    if (b % 2 === 0) hit(b, 'kick', 0.9);
    else hit(b, 'snare', 0.85);
    if (feel === 'slow') {
      for (const t of triplets(b)) hit(t, 'ride', t === b ? 0.55 : 0.35);
    } else if (feel === 'shuffle') {
      hit(b, 'ride', 0.55);
      hit(b + swing, 'ride', 0.35);
    } else {
      hit(eighth(b, false, swing), 'hat', 0.5);
      hit(eighth(b, true, swing), 'hat', 0.32);
    }
  }
  if (feel === 'straight') hit(2 + swing, 'kick', 0.6); // the push into beat 4
  return ev;
}

/** A half step into the next chord's root: from below, unless that's under the bass's open E. */
const approach = (nextRoot: number) => (nextRoot - 1 >= FLOOR.bass ? nextRoot - 1 : nextRoot + 1);

function bass(feel: Feel, swing: number, root: number, nextRoot: number): JamEvent[] {
  const n = (at: number, interval: number, gain = 0.85, beats = 0.9): JamEvent => ({ at, part: 'bass', midi: root + interval, gain, beats });
  switch (feel) {
    case 'boogie':
      // The up-and-down boogie line, in swung eighths.
      return [R, M3, P5, M6, b7, M6, P5, M3].map((iv, i) => n(eighth(i >> 1, i % 2 === 1, swing), iv, i % 2 ? 0.65 : 0.85, 0.45));
    case 'straight':
      return Array.from({ length: 8 }, (_, i) => n(i / 2, i === 7 ? P5 : R, i % 2 ? 0.6 : 0.85, 0.45));
    case 'slow':
      return [n(0, R, 0.9), n(1, M3), n(2, P5), n(3, M6, 0.8, 0.6), n(3 + swing, approach(nextRoot) - root, 0.55, 0.3)];
    case 'shuffle':
    default: {
      // A walking quarter-note line, leaning into the next chord on beat 4.
      return [n(0, R, 0.9), n(1, M3), n(2, P5), n(3, nextRoot === root ? M6 : approach(nextRoot) - root, 0.8)];
    }
  }
}

function guitar(feel: Feel, swing: number, root: number): JamEvent[] {
  // The Jimmy Reed comp: root and fifth, root and sixth, two eighths each beat.
  const ev: JamEvent[] = [];
  const dyad = (at: number, top: number, gain: number, beats: number) => {
    ev.push({ at, part: 'guitar', midi: root, gain, beats });
    ev.push({ at, part: 'guitar', midi: root + top, gain: gain * 0.85, beats });
  };
  if (feel === 'slow') {
    // Slow blues: a chord hit on 2 and 4, left to ring.
    for (const b of [1, 3]) {
      dyad(b, P5, 0.6, 1.6);
      ev.push({ at: b, part: 'guitar', midi: root + b7, gain: 0.45, beats: 1.6 });
    }
    return ev;
  }
  const tops = feel === 'boogie' ? [P5, M6, b7, M6] : [P5, M6, P5, M6];
  for (let b = 0; b < 4; b++) {
    dyad(eighth(b, false, swing), tops[b]!, 0.7, 0.45);
    dyad(eighth(b, true, swing), tops[b]!, 0.5, 0.3);
  }
  return ev;
}

function keys(feel: Feel, swing: number, chordPc: number, tone: string): JamEvent[] {
  // Rootless voicing (third, fifth, seventh, plus the root on top) in the middle of the keyboard.
  const floor = FLOOR.keys;
  const voicing = [M3, P5, b7, OCT].map((iv) => noteAtOrAbove((chordPc + iv) % 12, floor));
  const chord = (at: number, gain: number, beats: number) => voicing.map((midi): JamEvent => ({ at, part: 'keys', midi, gain, beats }));
  if (tone === 'organ') return chord(0, 0.5, 3.9); // a pad under the bar
  if (feel === 'slow') return [0, 1, 2, 3].flatMap((b) => triplets(b).flatMap((t, i) => chord(t, i === 0 ? 0.45 : 0.3, 0.3)));
  // Comp on the offbeats of 2 and 4.
  return [...chord(eighth(1, true, swing), 0.45, 0.4), ...chord(eighth(3, true, swing), 0.45, 0.4)];
}

/** A few blues phrases, as [beat, semitones above the key's root, length in beats]. Minor pentatonic plus the flat five. */
export const LICKS: readonly (readonly [number, number, number])[][] = [
  [[0, 10, 0.5], [0.67, 12, 0.5], [1.33, 10, 0.4], [2, 7, 1.5]],
  [[0, 3, 0.4], [0.67, 5, 0.4], [1, 6, 0.3], [1.33, 7, 1.2], [3, 3, 0.8]],
  [[0, 12, 1], [1, 10, 0.4], [1.67, 7, 0.4], [2.33, 5, 0.4], [3, 3, 0.4], [3.33, 0, 0.6]],
  [[0.67, 7, 0.3], [1, 10, 0.3], [1.33, 12, 1.4], [3, 15, 0.8]],
];

function lead(bar: number, swing: number, keyPc: number, tone: string): JamEvent[] {
  // Call and response: the singer takes the first two bars of each line, the fills answer in the last two.
  if (bar % 4 < 2) return [];
  const tonic = noteAtOrAbove(keyPc, LEAD_FLOOR[tone] ?? 62);
  const lick = LICKS[(Math.floor(bar / 4) * 2 + (bar % 4)) % LICKS.length]!;
  // A triplet-feel lick, straightened for a straight feel.
  const swingIt = (t: number) => {
    const b = Math.floor(t);
    const f = t - b;
    return f === 0 ? t : b + (Math.abs(f - 2 / 3) < 0.01 ? swing : f);
  };
  return lick.map(([at, iv, beats]) => ({ at: swingIt(at), part: 'lead' as const, midi: tonic + iv, gain: 0.6, beats }));
}

/** Everything every part plays in bar `bar` (0–11) of the 12-bar. */
export function barEvents(song: Song, bar: number): JamEvent[] {
  const { swing } = FEEL_INFO[song.feel];
  const prog = progression(song.quick);
  const keyPc = KEY_PC[song.key];
  const chordPc = (keyPc + prog[bar % 12]!) % 12;
  const nextPc = (keyPc + prog[(bar + 1) % 12]!) % 12;
  const bassRoot = noteAtOrAbove(chordPc, FLOOR.bass);
  const nextBassRoot = noteAtOrAbove(nextPc, FLOOR.bass);
  const p = song.parts;
  return [
    ...(p.drums ? drums(song.feel, swing) : []),
    ...(p.bass ? bass(song.feel, swing, bassRoot, nextBassRoot) : []),
    ...(p.guitar ? guitar(song.feel, swing, noteAtOrAbove(chordPc, FLOOR.guitar)) : []),
    ...(p.keys ? keys(song.feel, swing, chordPc, p.keys) : []),
    ...(p.lead ? lead(bar % 12, swing, keyPc, p.lead) : []),
  ];
}

/** The chord name for a bar, for the display: "E7", "A7", "B7". */
export function chordName(song: Song, bar: number): string {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  return `${names[(KEY_PC[song.key] + progression(song.quick)[bar % 12]!) % 12]}7`;
}

export const secondsPerBeat = (bpm: number) => 60 / bpm;

/* ---------- Choosing a sample ---------- */

/**
 * The tuned sample nearest `midi`, and the playback rate that takes it the rest of
 * the way. A rate also changes length and timbre a little, which is why the
 * samples are close together.
 */
export function pickSample(samples: readonly MeasuredSound[], midi: number): { sound: MeasuredSound; rate: number } | null {
  let best: MeasuredSound | null = null;
  for (const s of samples) {
    if (s.midi === undefined) continue;
    if (!best || Math.abs(s.midi - midi) < Math.abs(best.midi! - midi)) best = s;
  }
  if (!best) return null;
  return { sound: best, rate: Math.pow(2, (midi - best.midi!) / 12) };
}

/** How far above its lowest root a part reaches: the highest root (11) plus its highest note above the root. */
const SPAN: Record<Exclude<Part, 'drums' | 'room'>, number> = { bass: 21, guitar: 21, keys: 23, lead: 26 };

/** Tuned samples sit every this many semitones, so no note is repitched more than half of it. */
export const SAMPLE_STEP = 3;

/**
 * The notes a pitched tone gets a tuned sample at: every SAMPLE_STEP
 * semitones across everything the part can play, in any key.
 * scripts/make-jam-sounds.ts renders one sample per note.
 */
export function sampleNotes(part: Part, tone: string): number[] {
  if (part === 'drums' || part === 'room') return [];
  const floor = part === 'lead' ? (LEAD_FLOOR[tone] ?? 62) : FLOOR[part];
  const notes: number[] = [];
  for (let n = floor; n < floor + SPAN[part] + SAMPLE_STEP; n += SAMPLE_STEP) notes.push(n);
  return notes;
}

/** The drum sample for a piece in a kit. Brushes have no hi-hat; the sweep stands in. */
export function drumSampleId(kit: string, piece: DrumPiece): string {
  if (kit === 'brushes' && piece === 'hat') return 'brushes-sweep';
  return `${kit}-${piece}`;
}
