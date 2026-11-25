/*
  Sitting in with the band (/jam/, ADR 0030): eight pads that play the blues
  scale in the song's key, so there's no wrong note. Each instrument plays
  through its own channel strip, and the band's fills lay out while you play.
  Pure, so it's unit tested; src/scripts/sit-in.ts makes the sound.
*/
import { KEY_PC, noteAtOrAbove, type Key, type Part } from './jam';

/**
 * What you can sit in on. Each plays the tone's tuned samples, from a tonic
 * low enough that the top pad stays inside them in every key.
 */
export const SIT_IN = {
  harp: { label: 'Harp', full: 'Harmonica', part: 'lead', tone: 'harp', floor: 59 },
  sax: { label: 'Sax', full: 'Tenor sax', part: 'lead', tone: 'sax', floor: 46 },
  guitar: { label: 'Guitar', full: 'Guitar', part: 'guitar', tone: 'crunch', floor: 40 },
  piano: { label: 'Piano', full: 'Piano', part: 'keys', tone: 'piano', floor: 52 },
} as const satisfies Record<string, { label: string; full: string; part: Part; tone: string; floor: number }>;
export type SitInInstrument = keyof typeof SIT_IN;
export const SIT_IN_INSTRUMENTS = Object.keys(SIT_IN) as SitInInstrument[];

/** The blues scale: minor pentatonic plus the flat five, over an octave and a bit. */
export const BLUES_SCALE = [0, 3, 5, 6, 7, 10, 12, 15] as const;
// Written with a plain "b", as the key picker writes Bb: the site's trimmed font has no flat sign.
export const DEGREES = ['1', 'b3', '4', 'b5', '5', 'b7', '1', 'b3'] as const;
/** The home row, one key a pad. */
export const PAD_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'] as const;

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (midi: number) => NAMES[((midi % 12) + 12) % 12]!;

export type Pad = { midi: number; name: string; degree: string; key: string };

/** The eight pads for an instrument in a key. */
export function pads(key: Key, instrument: SitInInstrument): Pad[] {
  const tonic = noteAtOrAbove(KEY_PC[key], SIT_IN[instrument].floor);
  return BLUES_SCALE.map((iv, i) => ({ midi: tonic + iv, name: noteName(tonic + iv), degree: DEGREES[i]!, key: PAD_KEYS[i]! }));
}

/** How a screen reader should say a pad: "B flat, the flat 5". */
export const spoken = (pad: Pad) => `${pad.name.replace(/^([A-G])b$/, '$1 flat')}, the ${pad.degree.replace(/^b/, 'flat ')}`;

/** Which pad a key on the keyboard plays, or -1. */
export const padForKey = (key: string) => (PAD_KEYS as readonly string[]).indexOf(key.toLowerCase());

/** A pad dragged upward bends its note, up to a whole step at `fullPx` of drag, B.B. King style. */
export const bendFromDrag = (dragUpPx: number, fullPx = 60) => 2 * Math.min(1, Math.max(0, dragUpPx / fullPx));
