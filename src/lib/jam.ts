/*
  The blues maker (/jam/, ADR 0030): pure music theory and patterns.

  A song is a few choices: key, feel, tempo, 12-bar form, and a tone (or
  nothing) for each part. Given those, `barEvents` says exactly what every
  part plays in one bar, in beats from the bar's downbeat. The browser
  (src/scripts/jam.ts) only schedules what this returns, so everything
  musical here is unit tested.

  The sounds are real recorded notes and drum hits from the MuseScore
  General soundfont (src/data/jam.yaml, ADR 0031), rendered a note every
  SAMPLE_STEP semitones; `pickSample` takes the nearest one, so no note is
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

/** Short names for the segmented controls, which have to fit a phone; the full name is the accessible one. */
export const TONE_SHORT: Record<string, string> = {
  sticks: 'Sticks',
  brushes: 'Brushes',
  upright: 'Upright',
  electric: 'Electric',
  crunch: 'Crunch',
  clean: 'Clean',
  acoustic: 'Acoustic',
  piano: 'Piano',
  organ: 'Organ',
  harp: 'Harp',
  sax: 'Sax',
  bar: 'Bar',
  vinyl: 'Record',
};

export const PART_LABELS: Record<Part, string> = {
  drums: 'Drums',
  bass: 'Bass',
  guitar: 'Guitar',
  keys: 'Keys',
  lead: 'Fills',
  room: 'Room',
};

/** What the generator measured (src/data/jam-sounds.json). `midi` is fractional: the real pitch. `db`: loudness, RMS dBFS. */
export type MeasuredSound = {
  id: string;
  part: Part;
  tone: string;
  file: string;
  /** The note it was recorded as. */
  key?: number;
  /** The pitch it measured, which the browser tunes from (a real recording can be a few cents out). */
  midi?: number;
  /** For a drum: the piece it is (src/lib/jam-manifest.ts). */
  piece?: DrumPiece | 'sweep';
  /** Which loudness it was played at, 0 the softest, where an instrument was recorded at more than one. */
  layer?: number;
  /** Which of several recordings of the same note at the same loudness, played in turn so repeats differ. */
  take?: number;
  seconds: number;
  db?: number;
  loop?: boolean;
  /** A crowd reaction for the game. */
  crowd?: boolean;
};

/* ---------- The song ---------- */

export const KEYS = ['E', 'A', 'G', 'C', 'Bb'] as const;
export type Key = (typeof KEYS)[number];
/** Each key's pitch class (C is 0). */
export const KEY_PC: Record<Key, number> = { C: 0, E: 4, G: 7, A: 9, Bb: 10 };

export const FEELS = ['shuffle', 'slow', 'boogie', 'straight'] as const;
export type Feel = (typeof FEELS)[number];

export const FEEL_INFO: Record<Feel, { label: string; short: string; bpm: number; min: number; max: number; swing: number }> = {
  // swing: where the offbeat eighth falls in the beat (0.5 straight, 2/3 a full triplet shuffle)
  shuffle: { label: 'Shuffle', short: 'Shuffle', bpm: 100, min: 70, max: 140, swing: 2 / 3 },
  slow: { label: 'Slow blues', short: 'Slow', bpm: 58, min: 44, max: 76, swing: 2 / 3 },
  boogie: { label: 'Boogie', short: 'Boogie', bpm: 132, min: 100, max: 176, swing: 0.62 },
  straight: { label: 'Straight eight', short: 'Straight', bpm: 112, min: 84, max: 150, swing: 0.5 },
};

export type Song = {
  key: Key;
  feel: Feel;
  bpm: number;
  /** Quick change: bar 2 goes to the IV chord. */
  quick: boolean;
  /** Start with the last line of the form (the turnaround) as an intro. */
  intro: boolean;
  parts: Record<Part, string | null>;
};

export const DEFAULT_SONG: Song = {
  key: 'E',
  feel: 'shuffle',
  bpm: FEEL_INFO.shuffle.bpm,
  quick: false,
  intro: true,
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
  return { key, feel, bpm, quick: params.get('change') === 'quick', intro: params.get('intro') !== 'none', parts };
}

export function songToParams(song: Song): URLSearchParams {
  const p = new URLSearchParams({ key: song.key, feel: song.feel, bpm: String(song.bpm), change: song.quick ? 'quick' : 'slow', intro: song.intro ? 'turnaround' : 'none' });
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
// Where each fill instrument plays: a harmonica's middle register from B3, a tenor sax's from B flat 2.
const LEAD_FLOOR: Record<string, number> = { harp: 59, sax: 46 };

/* ---------- The arrangement ---------- */

/**
 * What kind of chorus (one time through the 12 bars) the band is playing.
 * - head: the tune, with the fills answering the singer.
 * - solo: the fills take the whole chorus; the band digs in under them.
 * - quiet: "break it down": cross-stick and hi-hat, half-note bass, sparse comping.
 * - stop: stop time: the band hits beat one of each bar of the first line and
 *   lays out, while the soloist plays into the gaps.
 * - ending: "take it home": the tune, then the ending line in bar 11 and the
 *   last chord (a half step above, sliding into home) in bar 12.
 * - call: the game's chorus (src/lib/game.ts): the fills play a call in the
 *   first two bars of each line and leave the last two for the player to answer.
 */
export const SECTIONS = ['head', 'solo', 'quiet', 'stop', 'ending', 'call'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  head: 'The tune',
  solo: 'A solo',
  quiet: 'Break it down',
  stop: 'Stop time',
  ending: 'Take it home',
  call: 'Call and response',
};

/** What the band plays by itself, chorus by chorus, when nobody calls anything: the tune twice, then around the other kinds. */
export function autoSection(chorus: number): Section {
  if (chorus <= 1) return 'head';
  return (['solo', 'quiet', 'stop', 'head'] as const)[(chorus - 2) % 4]!;
}

/** Where the song starts: bar 9 of the form, so the band plays the last line as an intro, or bar 1. */
export const startBar = (song: Song) => (song.intro ? 8 : 0);

/* ---------- Patterns ---------- */

export type DrumPiece = 'kick' | 'snare' | 'hat' | 'ride' | 'crash' | 'rim';

export type JamEvent = {
  /** Beats from the bar's downbeat. */
  at: number;
  part: Part;
  /** MIDI note for pitched parts. */
  midi?: number;
  drum?: DrumPiece;
  /** 0–1, before the part's own level. */
  gain: number;
  /** How long it rings, in beats (then it lets go, on the part's RELEASE). */
  beats: number;
  /** A scoop: the note starts this many semitones flat and slides up to pitch, the way a harp or sax player leans into it. */
  bend?: number;
  /** Seconds after `at`, for a note of a strummed or rolled chord (`strum`). */
  delay?: number;
};

/**
 * What the band does in a bar on top of the arrangement, when you're sitting in with it in the
 * game (src/lib/game.ts), where you lead the band by tapping its players:
 * - caller: who plays the call in a `call` chorus: the guitar, the keys or the fills;
 * - fill: the drummer kicks into the next line with a fill on beat 4;
 * - drop: the band drops out under your answer, stop-time style: a hit on one, and space;
 * - hot: the band digs in, as under a solo: the ride, the bass's pickups;
 * - shout: the band answers a great answer back: a crash and a kick on the downbeat;
 * - level: how hard the band plays, for the crowd's mood (1 as written);
 * - you: the part you're playing on the pads, so the band's own player of it sits out.
 */
export type BandMoves = { caller?: Caller; fill?: boolean; drop?: boolean; hot?: boolean; shout?: boolean; level?: number; you?: Part };
/** Who can play the call in the game. */
export const CALLERS = ['guitar', 'keys', 'lead'] as const;
export type Caller = (typeof CALLERS)[number];

/** Everything a player needs to know about the bar they're in. */
type Bar = {
  moves: BandMoves;
  song: Song;
  feel: Feel;
  bar: number;
  inForm: number;
  chorus: number;
  section: Section;
  swing: number;
  keyPc: number;
  chordPc: number;
  nextPc: number;
};

/** Where an eighth note falls: beat `b` (0–3), on the beat or the swung offbeat. */
const eighth = (b: number, off: boolean, swing: number) => b + (off ? swing : 0);
/** The three triplets of beat `b`. */
const triplets = (b: number) => [b, b + 1 / 3, b + 2 / 3];
/** The first line of a stop-time chorus, or your answer when the band drops out: the band only hits one. */
const stopHit = (b: Bar) => (b.section === 'stop' && b.inForm < 4) || (!!b.moves.drop && b.section === 'call' && b.inForm % 4 >= 2);
/** Whether the band digs in: under a solo, or when it's hot in the game. */
const digsIn = (b: Bar) => b.section === 'solo' || (!!b.moves.hot && b.section === 'call');
/** Who plays the call in a `call` chorus. */
const callerOf = (b: Bar): Caller => b.moves.caller ?? 'lead';
/** The bars of a `call` chorus where the caller plays: the first two of each line. */
const calling = (b: Bar, part: Caller) => b.section === 'call' && b.inForm % 4 < 2 && callerOf(b) === part;
/** The ending's last two bars. */
const endingLine = (b: Bar) => b.section === 'ending' && b.inForm === 10;
const lastChord = (b: Bar) => b.section === 'ending' && b.inForm === 11;
/** How hard the band plays: quieter for "break it down". */
const dynamics = (b: Bar) => (b.section === 'quiet' ? 0.62 : 1);
/** The top of the highest sample a pitched part has, so no voicing reaches past it. */
const fits = (part: Exclude<Part, 'drums' | 'room'>, midi: number) => midi <= FLOOR[part] + SPAN[part];

function drums(b: Bar): JamEvent[] {
  const { feel, swing, inForm, section } = b;
  const ev: JamEvent[] = [];
  const dyn = dynamics(b);
  const hit = (at: number, drum: DrumPiece, gain: number, beats = 1) => ev.push({ at, part: 'drums', drum, gain: gain * dyn, beats });

  if (stopHit(b)) {
    // Everyone on one, then the drummer just keeps the time on the hi-hat while the soloist plays.
    hit(0, 'kick', 0.95);
    hit(0, 'snare', 0.8);
    if (inForm === 0) hit(0, 'crash', 0.6, 3);
    hit(1, 'hat', 0.3);
    hit(3, 'hat', 0.3);
    if (b.moves.fill && inForm % 4 === 3) triplets(3).forEach((t, i) => hit(t, 'snare', [0.45, 0.55, 0.7][i]!));
    return ev;
  }
  if (endingLine(b)) {
    // Kick and snare together on every beat of the ending line, then a roll into the last chord.
    for (const beat of [0, 1, 2]) {
      hit(beat, 'kick', 0.8);
      hit(beat, 'snare', 0.65);
    }
    triplets(3).forEach((t, i) => hit(t, 'snare', [0.5, 0.6, 0.75][i]!));
    return ev;
  }
  if (lastChord(b)) {
    // The stab, then the last chord with everything: kick and crash, left to ring.
    hit(0, 'snare', 0.7);
    hit(swing, 'kick', 1);
    hit(swing, 'crash', 0.75, 4);
    return ev;
  }

  const quiet = section === 'quiet';
  const solo = digsIn(b);
  // Fills: the big one into the top of the form (or wherever you call for one), and now and then a
  // short one at the end of a line.
  const bigFill = inForm === 11 || (!!b.moves.fill && inForm % 4 === 3);
  const smallFill = (inForm === 3 || inForm === 7) && hash(b.chorus, inForm) > 0.55;
  for (let beat = 0; beat < 4; beat++) {
    if (beat === 3 && bigFill) {
      triplets(3).forEach((t, i) => hit(t, quiet ? 'rim' : 'snare', [0.45, 0.55, 0.7][i]! * (solo ? 1.1 : 1)));
      continue;
    }
    // Kick on 1 and 3 (just 1 when it's quiet), backbeat on 2 and 4: cross-stick when it's quiet.
    if (beat % 2 === 0 && (!quiet || beat === 0)) hit(beat, 'kick', 0.9);
    if (beat % 2 === 1) hit(beat, quiet ? 'rim' : 'snare', solo ? 0.95 : 0.85);
    if (beat === 3 && smallFill) {
      hit(3 + 1 / 3, 'snare', 0.42);
      hit(3 + 2 / 3, 'snare', 0.55);
      continue;
    }
    // Time: the ride for a slow blues and a shuffle (the hi-hat when it's quiet), the hat for the rest (the ride under a solo).
    const time: DrumPiece = quiet ? 'hat' : feel === 'slow' || feel === 'shuffle' || solo ? 'ride' : 'hat';
    if (feel === 'slow') for (const t of triplets(beat)) hit(t, time, t === beat ? 0.55 : 0.35);
    else {
      hit(eighth(beat, false, swing), time, 0.55);
      hit(eighth(beat, true, swing), time, 0.33);
    }
  }
  if ((inForm === 0 && !quiet) || b.moves.shout) hit(0, 'crash', b.moves.shout ? 0.75 : 0.5, 3); // the top of the form, or the band shouting back
  if (feel === 'straight' && !quiet) hit(2 + swing, 'kick', 0.6); // the push into beat 4
  // A ghost note on the snare just before 4: barely there, but it's what makes a shuffle shuffle.
  if (feel !== 'slow' && !quiet && !bigFill && !smallFill) hit(2 + swing, 'snare', 0.22, 0.5);
  return ev;
}

/** A half step into the next chord's root: from below, unless that's under the bass's open E. */
const approach = (nextRoot: number) => (nextRoot - 1 >= FLOOR.bass ? nextRoot - 1 : nextRoot + 1);

/** Ways to walk a bar of a shuffle, as intervals over the root; the last note leans into the next chord when it changes. */
const WALKS = [
  [R, M3, P5, M6],
  [R, P5, M6, b7],
  [R, M3, P5, b7],
  [R, M3, P5, M3],
] as const;

function bass(b: Bar): JamEvent[] {
  const { feel, swing, section, inForm } = b;
  const root = noteAtOrAbove(b.chordPc, FLOOR.bass);
  const nextRoot = noteAtOrAbove(b.nextPc, FLOOR.bass);
  const dyn = dynamics(b);
  const n = (at: number, midi: number, gain = 0.85, beats = 0.9): JamEvent => ({ at, part: 'bass', midi, gain: gain * dyn, beats });

  if (stopHit(b)) return [n(0, root, 0.95, 0.9)];
  if (endingLine(b)) return [b7, M6, M6 - 1, P5].map((iv, beat) => n(beat, root + iv, 0.85, 0.9));
  if (lastChord(b)) {
    const home = noteAtOrAbove(b.keyPc, FLOOR.bass);
    const above = noteAtOrAbove((b.keyPc + 1) % 12, FLOOR.bass);
    return [n(0, above, 0.85, 0.4), n(swing, home, 1, 3.4)];
  }
  if (section === 'quiet') return [n(0, root, 0.8, 1.9), n(2, root + P5, 0.7, 1.9)];

  switch (feel) {
    case 'boogie':
      // The up-and-down boogie line, in swung eighths.
      return [R, M3, P5, M6, b7, M6, P5, M3].map((iv, i) => n(eighth(i >> 1, i % 2 === 1, swing), root + iv, i % 2 ? 0.65 : 0.85, 0.45));
    case 'straight': {
      const line = Array.from({ length: 8 }, (_, i) => n(i / 2, root + (i === 6 ? P5 : 0), i % 2 ? 0.6 : 0.85, 0.45));
      line[7] = n(3.5, nextRoot === root ? root + P5 : approach(nextRoot), 0.7, 0.45);
      return line;
    }
    case 'slow':
      return [n(0, root, 0.9), n(1, root + M3), n(2, root + P5), n(3, root + M6, 0.8, 0.6), n(3 + swing, approach(nextRoot), 0.55, 0.3)];
    case 'shuffle':
    default: {
      // A walking line, a different walk now and then, leaning into the next chord on beat 4.
      const walk = WALKS[Math.floor(hash(b.chorus * 13 + 1, inForm) * WALKS.length)]!;
      const ev = walk.map((iv, beat) => n(beat, root + iv, beat === 0 ? 0.9 : 0.82));
      if (nextRoot !== root) ev[3] = n(3, approach(nextRoot), 0.8);
      // Under a solo the bass digs in: a swung pickup into each beat 3.
      if (digsIn(b)) ev.push(n(1 + swing, root + (walk[2] ?? P5) - 1, 0.55, 0.3));
      return ev;
    }
  }
}

function guitar(b: Bar): JamEvent[] {
  const { feel, swing, section, inForm } = b;
  const root = noteAtOrAbove(b.chordPc, FLOOR.guitar);
  const dyn = dynamics(b) * (digsIn(b) ? 0.8 : 1); // under a solo, the comp makes room
  const ev: JamEvent[] = [];
  const note = (at: number, midi: number, gain: number, beats: number) => ev.push({ at, part: 'guitar', midi, gain: gain * dyn, beats });
  const dyad = (at: number, top: number, gain: number, beats: number, base = root) => {
    note(at, base, gain, beats);
    note(at, base + top, gain * 0.85, beats);
  };
  /** A full seventh chord (root, fifth, seventh, and the octave if it fits) from `base`. */
  const chord = (at: number, base: number, gain: number, beats: number) => {
    for (const iv of [R, P5, b7, OCT]) if (fits('guitar', base + iv)) note(at, base + iv, iv === R ? gain : gain * 0.85, beats);
  };

  if (calling(b, 'guitar')) return callPhrase(b, 'guitar', noteAtOrAbove(b.keyPc, FLOOR.guitar));
  if (stopHit(b)) {
    chord(0, root, 0.8, 0.9);
    return ev;
  }
  if (lastChord(b)) {
    // The stab a half step above home, sliding into the last chord, left to ring.
    chord(0, noteAtOrAbove((b.keyPc + 1) % 12, FLOOR.guitar), 0.65, 0.4);
    chord(swing, noteAtOrAbove(b.keyPc, FLOOR.guitar), 0.85, 3.4);
    return ev;
  }
  if (inForm === 10 && section !== 'quiet') {
    // The turnaround (and the ending line): the root an octave up held as a pedal over a line
    // walking down the seventh, sixth, flat sixth and fifth, a beat each.
    [b7, M6, M6 - 1, P5].forEach((iv, beat) => {
      note(beat, root + OCT, 0.55, 0.9);
      note(beat, root + iv, 0.65, 0.9);
      if (feel !== 'slow' && section !== 'ending') note(beat + swing, root + iv, 0.4, 0.3);
    });
    return ev;
  }
  if (inForm === 11 && section !== 'quiet') {
    // Then the V chord, hit once and left to ring, with the comp back in on 3 and 4.
    dyad(0, P5, 0.75, 1.9);
    note(0, root + b7, 0.55, 1.9);
    if (feel !== 'slow')
      for (const beat of [2, 3]) {
        dyad(eighth(beat, false, swing), beat === 2 ? P5 : M6, 0.65, 0.45);
        dyad(eighth(beat, true, swing), beat === 2 ? P5 : M6, 0.45, 0.3);
      }
    return ev;
  }
  if (section === 'quiet') {
    // Just a light chord on the offbeats of 2 and 4.
    for (const beat of [1, 3]) dyad(eighth(beat, true, swing), P5, 0.45, 0.25);
    return ev;
  }
  if (feel === 'slow') {
    // Slow blues: a chord hit on 2 and 4, left to ring.
    for (const beat of [1, 3]) {
      dyad(beat, P5, 0.6, 1.6);
      note(beat, root + b7, 0.45, 1.6);
    }
    return ev;
  }
  // The Jimmy Reed comp: root and fifth, root and sixth, two eighths a beat. Every other chorus
  // (and always in a boogie) it climbs to the seventh on beat 3.
  const tops = feel === 'boogie' || b.chorus % 2 === 1 ? [P5, M6, b7, M6] : [P5, M6, P5, M6];
  for (let beat = 0; beat < 4; beat++) {
    dyad(eighth(beat, false, swing), tops[beat]!, 0.7, 0.45);
    dyad(eighth(beat, true, swing), tops[beat]!, 0.5, 0.3);
  }
  return ev;
}

function keys(b: Bar, tone: string): JamEvent[] {
  const { feel, swing, section } = b;
  const dyn = dynamics(b) * (digsIn(b) ? 0.85 : 1);
  // Rootless voicing (third, fifth, seventh, plus the root on top) in the middle of the keyboard.
  const voice = (pc: number) => [M3, P5, b7, OCT].map((iv) => noteAtOrAbove((pc + iv) % 12, FLOOR.keys));
  const chord = (at: number, gain: number, beats: number, pc = b.chordPc) => voice(pc).map((midi): JamEvent => ({ at, part: 'keys', midi, gain: gain * dyn, beats }));

  if (calling(b, 'keys')) return callPhrase(b, 'keys', noteAtOrAbove(b.keyPc, FLOOR.keys));
  if (stopHit(b)) return chord(0, 0.6, 0.9);
  if (lastChord(b)) return [...chord(0, 0.45, 0.4, (b.keyPc + 1) % 12), ...chord(swing, 0.6, 3.4, b.keyPc)];
  if (endingLine(b)) return chord(0, 0.45, 3.5, b.keyPc);
  if (tone === 'organ') return chord(0, section === 'quiet' ? 0.32 : 0.5, 3.9); // a pad under the bar
  if (section === 'quiet') return [...chord(0, 0.35, 0.9), ...chord(2, 0.3, 0.9)];
  if (feel === 'slow') return [0, 1, 2, 3].flatMap((beat) => triplets(beat).flatMap((t, i) => chord(t, i === 0 ? 0.45 : 0.3, 0.3)));
  // Comp on the offbeats of 2 and 4, and under a solo on every offbeat.
  const beats = digsIn(b) ? [0, 1, 2, 3] : [1, 3];
  return beats.flatMap((beat) => chord(eighth(beat, true, swing), beat % 2 ? 0.45 : 0.32, 0.4));
}

/**
 * Blues phrases, as [beat, semitones above the key's root, length in beats, scoop].
 * All in the minor pentatonic plus the flat five, written on a triplet grid
 * (and straightened for a straight feel). `LICKS` answer the singer; `SOLO`
 * phrases fill whole bars; `BREATHS` end a phrase with space after it.
 */
type Lick = readonly (readonly [number, number, number, number?])[];
export const LICKS: readonly Lick[] = [
  [[0, 10, 0.5], [0.67, 12, 0.5, -1], [1.33, 10, 0.4], [2, 7, 1.5]],
  [[0, 3, 0.4, -1], [0.67, 5, 0.4], [1, 6, 0.3], [1.33, 7, 1.2], [3, 3, 0.8, -1]],
  [[0, 12, 1, -2], [1, 10, 0.4], [1.67, 7, 0.4], [2.33, 5, 0.4], [3, 3, 0.4], [3.33, 0, 0.6]],
  [[0.67, 7, 0.3], [1, 10, 0.3], [1.33, 12, 1.4, -1], [3, 15, 0.8, -2]],
  [[0, 7, 0.3], [0.33, 6, 0.3], [0.67, 5, 0.4], [1, 3, 0.9, -1], [2, 0, 1.6]],
  [[0, 15, 0.6, -1], [0.67, 12, 0.3], [1, 10, 0.3], [1.33, 12, 0.6], [2, 10, 0.4], [2.67, 7, 1]],
  [[1, 0, 0.3], [1.33, 3, 0.3, -1], [1.67, 5, 0.3], [2, 6, 0.3], [2.33, 7, 1.4]],
];
export const SOLO: readonly Lick[] = [
  [[0, 7, 0.3], [0.33, 10, 0.3], [0.67, 12, 1.2, -2], [2, 10, 0.4], [2.67, 7, 0.9]],
  [[0, 12, 0.6, -1], [0.67, 10, 0.3], [1, 7, 0.3], [1.33, 5, 0.3], [1.67, 3, 0.6, -1], [2.67, 0, 1]],
  [[0, 3, 0.3, -1], [0.33, 5, 0.3], [0.67, 6, 0.3], [1, 7, 1.5], [3, 10, 0.6]],
  [[0, 15, 0.3, -2], [0.33, 12, 0.3], [0.67, 10, 0.3], [1, 12, 0.9], [2, 15, 0.3, -1], [2.33, 12, 0.3], [2.67, 10, 1]],
  [[0, 10, 0.3], [0.33, 12, 0.3], [0.67, 10, 0.3], [1, 7, 0.3], [1.33, 10, 0.3], [1.67, 7, 0.3], [2, 5, 0.3], [2.33, 3, 0.3], [2.67, 0, 1.2]],
  [[0, 12, 0.25], [0.67, 12, 0.25], [1.33, 12, 0.25], [2, 10, 0.4], [2.67, 12, 1.2, -1]],
  [[0, 5, 0.3], [0.33, 6, 0.3], [0.67, 7, 0.6], [1.33, 10, 0.6], [2, 12, 1.5, -2]],
];
export const BREATHS: readonly Lick[] = [
  [[0, 7, 1.4, -1], [1.67, 5, 0.3], [2, 3, 0.3], [2.33, 0, 1.2]],
  [[0.67, 0, 0.3], [1, 3, 0.3, -1], [1.33, 5, 0.3], [1.67, 3, 0.3], [2, 0, 1.6]],
  [[0, 10, 0.3], [0.33, 12, 1.8, -2]],
  [[0, 3, 1.2, -1], [1.33, 0, 1.6]],
];
/** The solo's last bar lands on the fifth, which leads back to the top. */
const SOLO_TURN: Lick = [[0, 7, 0.3], [0.33, 10, 0.3], [0.67, 7, 0.3], [1, 6, 0.3], [1.33, 5, 0.3], [1.67, 3, 0.3, -1], [2, 7, 1.6]];

/** A phrase on a part, from `tonic`: its triplet feel straightened for a straight feel. A guitar's or keys' phrase has no scoops. */
function phrase(b: Bar, part: Part, tonic: number, lick: Lick, gain: number, from = 0, until = 4): JamEvent[] {
  const swingIt = (t: number) => {
    const whole = Math.floor(t);
    const f = t - whole;
    return f === 0 ? t : whole + (Math.abs(f - 2 / 3) < 0.01 ? b.swing : f);
  };
  return lick
    .filter(([at]) => at >= from && at < until)
    .map(([at, iv, beats, bend]): JamEvent => ({ at: swingIt(at), part, midi: tonic + iv, gain, beats, ...(bend && part === 'lead' ? { bend } : {}) }));
}
const pickFor = <T>(b: Bar, list: readonly T[], salt: number) => list[Math.floor(hash(b.chorus * 31 + salt, b.inForm) * list.length)]!;

/**
 * The game's call (a `call` chorus, src/lib/game.ts), on whichever part plays it: a phrase in the
 * first bar of each line, a short tag in the second. The last two bars are the player's.
 */
function callPhrase(b: Bar, part: Caller, tonic: number): JamEvent[] {
  const gain = part === 'lead' ? 0.68 : 0.72;
  const notes =
    b.inForm % 4 === 0
      ? phrase(b, part, tonic, LICKS[(Math.floor(b.inForm / 4) + b.chorus * 3) % LICKS.length]!, gain)
      : phrase(b, part, tonic, pickFor(b, BREATHS, 5), gain * 0.9, 0, 2.5);
  if (part === 'lead') return notes;
  // A guitar's or keys' phrase stays inside its samples: a note past the top drops an octave.
  const top = FLOOR[part] + SPAN[part] + 1;
  return notes.map((e) => (e.midi! > top ? { ...e, midi: e.midi! - OCT } : e));
}

function lead(b: Bar, tone: string, guitarPlaying: boolean): JamEvent[] {
  const { inForm, section, chorus, swing } = b;
  const tonic = noteAtOrAbove(b.keyPc, LEAD_FLOOR[tone] ?? 62);
  const play = (lick: Lick, gain: number, from = 0, until = 4) => phrase(b, 'lead', tonic, lick, gain, from, until);
  const pick = <T>(list: readonly T[], salt: number) => pickFor(b, list, salt);

  if (endingLine(b)) return []; // the band plays the ending line together
  if (section === 'call') return calling(b, 'lead') ? callPhrase(b, 'lead', tonic) : []; // the rest is the player's
  if (lastChord(b)) return [{ at: swing, part: 'lead', midi: tonic + OCT, gain: 0.6, beats: 3.4, bend: -1 }];
  if (stopHit(b)) return play(pick(SOLO, 1), 0.65, 1); // into the gap after the band's hit
  if (section === 'solo') {
    // A soloist plays out over the band: a little harder than the fills answer the singer.
    if (inForm === 11) return play(SOLO_TURN, 0.74);
    // Two-bar phrases: a full bar, then a bar that answers it and breathes. The last line shouts.
    if (inForm % 2 === 1) return play(pick(BREATHS, 2), 0.7);
    return play(inForm >= 8 ? pick([SOLO[3]!, SOLO[5]!], 3) : pick(SOLO, 4), 0.76);
  }
  // The tune: call and response. The singer takes the first two bars of each line, the fills
  // answer in the last two, and bar 11 belongs to the guitar's turnaround when the guitar plays.
  if (inForm % 4 < 2) return [];
  if (inForm === 10 && guitarPlaying) return [];
  const lick = LICKS[(Math.floor(inForm / 4) * 2 + (inForm % 4) - 2 + chorus * 5) % LICKS.length]!;
  // When it's broken down, the fills just finish their thought: the first half of each answer, softly.
  return section === 'quiet' ? (inForm % 4 === 3 ? play(lick, 0.42, 0, 2) : []) : play(lick, 0.6);
}

/**
 * Everything every part plays in bar `bar`, counted from the first bar of the form
 * (bar 12 is the top of the second time through), in a chorus of the given kind.
 * The form repeats every 12 bars; the fills, the walks and the drum fills don't.
 */
export function barEvents(song: Song, bar: number, section: Section = 'head', moves: BandMoves = {}): JamEvent[] {
  const inForm = ((bar % 12) + 12) % 12;
  const keyPc = KEY_PC[song.key];
  const prog = progression(song.quick);
  const b: Bar = {
    moves,
    song,
    feel: song.feel,
    bar,
    inForm,
    chorus: Math.floor(bar / 12),
    section,
    swing: FEEL_INFO[song.feel].swing,
    keyPc,
    chordPc: (keyPc + prog[inForm]!) % 12,
    nextPc: (keyPc + prog[(inForm + 1) % 12]!) % 12,
  };
  const p = song.parts;
  // A part you're playing yourself (the game) is yours alone: the band's player of it sits out.
  const plays = (part: Part) => p[part] !== null && moves.you !== part;
  return strum(legato([
    ...(plays('drums') ? drums(b) : []),
    ...(plays('bass') ? bass(b) : []),
    ...(plays('guitar') ? guitar(b) : []),
    ...(plays('keys') ? keys(b, p.keys!) : []),
    ...(plays('lead') ? lead(b, p.lead!, plays('guitar')) : []),
  ]));
}

/** How far apart a strummed chord's strings sound: a downstroke is a little slower than an upstroke. */
export const STRUM_S = { down: 0.009, up: 0.006, roll: 0.003 } as const;

/**
 * Strum the guitar's chords and roll the piano's: notes struck together in a
 * chord don't land at once. A guitar downstroke (on the beat) sweeps low to
 * high, an upstroke (off it) high to low and a touch lighter on the strings
 * it reaches last; a piano chord spreads a few milliseconds. The delay is in
 * seconds, so it's the same at any tempo.
 */
export function strum(events: JamEvent[]): JamEvent[] {
  const chords = new Map<string, JamEvent[]>();
  for (const e of events)
    if ((e.part === 'guitar' || (e.part === 'keys' && e.midi !== undefined)) && e.midi !== undefined) {
      const k = `${e.part}@${e.at.toFixed(4)}`;
      chords.set(k, [...(chords.get(k) ?? []), e]);
    }
  const out = new Map<JamEvent, JamEvent>();
  for (const notes of chords.values()) {
    if (notes.length < 2) continue;
    const guitar = notes[0]!.part === 'guitar';
    const down = Number.isInteger(Math.round(notes[0]!.at * 1000) / 1000);
    const order = [...notes].sort((a, b) => (guitar && !down ? b.midi! - a.midi! : a.midi! - b.midi!));
    order.forEach((e, i) => {
      const step = guitar ? (down ? STRUM_S.down : STRUM_S.up) : STRUM_S.roll;
      out.set(e, { ...e, delay: i * step, ...(guitar && !down && i > 0 ? { gain: e.gain * 0.92 } : {}) });
    });
  }
  return events.map((e) => out.get(e) ?? e);
}

/** The parts a player connects: each note held until the next one starts. */
const LEGATO: ReadonlySet<Part> = new Set(['bass', 'lead']);

/**
 * Hold each bass and fill note until the part's next note (the last one to
 * the end of the bar), so a line sings instead of stepping. Chords and
 * comping keep their own lengths; drums play out their hits.
 */
export function legato(events: JamEvent[]): JamEvent[] {
  return events.map((e) => {
    if (!LEGATO.has(e.part)) return e;
    const until = Math.min(4, ...events.filter((o) => o.part === e.part && o.at > e.at + 1e-6).map((o) => o.at));
    return { ...e, beats: Math.max(e.beats, Math.min(2, until - e.at)) };
  });
}

/**
 * How each part's notes let go, as a time constant in seconds: a note fades
 * by about two-thirds in this long after its length is up, so it rings into
 * the next one instead of stopping dead. Drums ignore it and play out.
 */
export const RELEASE: Record<Part, number> = { drums: 0, bass: 0.07, guitar: 0.09, keys: 0.16, lead: 0.12, room: 0 };

/** The chord name for a bar, for the display: "E7", "A7", "B7". */
export function chordName(song: Song, bar: number): string {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  return `${names[(KEY_PC[song.key] + progression(song.quick)[bar % 12]!) % 12]}7`;
}

/** Which chord of the key a bar is on, as musicians count them: I (home), IV or V. */
export function degreeName(song: Song, bar: number): 'I' | 'IV' | 'V' {
  return ({ 0: 'I', 5: 'IV', 7: 'V' } as const)[progression(song.quick)[bar % 12] as 0 | 5 | 7];
}

/**
 * The samples are leveled 6 dB under where they'd sit, to leave room for a hard-played attack
 * (scripts/make-jam-sounds.ts); every note the player plays is brought back up by this much.
 */
export const SAMPLE_GAIN = 2;

export const secondsPerBeat = (bpm: number) => 60 / bpm;

/** A small, repeatable number in [0, 1) for a bar and an event: the same song always plays the same way. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * A player's feel: each note a few milliseconds early or late and a little harder or softer,
 * the same way every time. The drums stay tightest; they're the clock everyone else leans on.
 */
export function humanize(bar: number, index: number, part: Part): { seconds: number; gain: number } {
  const spread = part === 'drums' ? 0.004 : 0.012;
  return { seconds: (hash(bar, index) - 0.5) * 2 * spread, gain: 1 + (hash(index, bar + 7919) - 0.5) * 0.16 };
}

/** Four on the hi-hat before the band comes in, in beats before bar 1. */
export const COUNT_IN: readonly number[] = [-4, -3, -2, -1];

/* ---------- Choosing a sample ---------- */

/**
 * Which loudness layer a note played at `gain` (0–1) uses, of `layers`: the
 * range split evenly, so a soft note gets the softly played recording, not
 * just a quieter copy of a hard one.
 */
export const layerFor = (gain: number, layers: number) => Math.max(0, Math.min(layers - 1, Math.floor(gain * layers)));

/** Of several samples recorded the same way, the `take`th in turn, so repeated notes differ. */
function choose(group: readonly MeasuredSound[], gain: number, take: number): MeasuredSound {
  const layers = [...new Set(group.map((s) => s.layer ?? 0))].sort((a, b) => a - b);
  const layer = layers[layerFor(gain, layers.length)]!;
  const takes = group.filter((s) => (s.layer ?? 0) === layer).sort((a, b) => (a.take ?? 0) - (b.take ?? 0));
  return takes[((take % takes.length) + takes.length) % takes.length]!;
}

/**
 * The recorded note nearest `midi`, at the loudness layer for `gain` and the
 * take in turn, and the playback rate that takes it the rest of the way. A
 * rate also changes length and timbre a little, which is why the samples are
 * close together.
 */
export function pickSample(
  samples: readonly MeasuredSound[],
  midi: number,
  { gain = 0.75, take = 0 }: { gain?: number; take?: number } = {},
): { sound: MeasuredSound; rate: number } | null {
  // The note recorded nearest, by the note it was recorded as; then every recording of it (its layers and takes).
  const noteOf = (s: MeasuredSound) => s.key ?? (s.midi === undefined ? undefined : Math.round(s.midi));
  let best: number | null = null;
  for (const s of samples) {
    const n = noteOf(s);
    if (n !== undefined && (best === null || Math.abs(n - midi) < Math.abs(best - midi))) best = n;
  }
  if (best === null) return null;
  const group = samples.filter((s) => noteOf(s) === best && s.midi !== undefined);
  const sound = choose(group, gain, take);
  return { sound, rate: Math.pow(2, (midi - sound.midi!) / 12) };
}

/** Which drum a sample is: its `piece`, or the word after the kit in its id ("sticks-snare"). */
export const pieceOf = (s: MeasuredSound) => s.piece ?? s.id.split('-')[1];

/**
 * The drum sample for a piece in a kit, at the layer for `gain` and the take in turn. A kit with no
 * hi-hat (the soundfont's brush kit had none) keeps time on a brush sweep instead.
 */
export function pickDrum(samples: readonly MeasuredSound[], kit: string, piece: DrumPiece, { gain = 0.75, take = 0 } = {}): MeasuredSound | null {
  const of = (p: string) => samples.filter((s) => s.part === 'drums' && s.tone === kit && pieceOf(s) === p);
  const group = of(piece).length || piece !== 'hat' ? of(piece) : of('sweep');
  return group.length ? choose(group, gain, take) : null;
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

