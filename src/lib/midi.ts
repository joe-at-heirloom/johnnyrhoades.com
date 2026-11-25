/*
  Standard MIDI Files of single notes in a row, for rendering the blues maker's samples with
  FluidSynth (scripts/make-jam-sounds.ts, ADR 0031). Format 0, one track,
  480 ticks a beat at 120 bpm, so a tick is 1/960 of a second.
*/

const TICKS_PER_SECOND = 960;

/** A MIDI variable-length quantity. */
export function varLen(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

export type Notes = {
  /** 0–15; 9 is the drum channel, where the program picks the kit. */
  channel: number;
  /** General MIDI program (0–127), or the drum kit on channel 9 (Standard 0, Jazz 32, Brush 40). */
  program: number;
  /** MIDI notes (or drums on channel 9), played one after another. */
  notes: readonly number[];
  velocity: number;
  /** How long each key is held. */
  seconds: number;
  /** Silence after each note is let go, so its release is rendered too, before the next starts. */
  tail: number;
};

/** Where note `i` of a sequence starts, in seconds: each gets its length and its tail. */
export const slotStart = (i: number, seconds: number, tail: number) => i * (seconds + tail);

/**
 * Notes played one at a time, each held `seconds` and followed by `tail` of
 * silence, so a single render holds them all, a slot apart (slotStart).
 * Rendering once per instrument, not once per note, saves FluidSynth loading
 * and decompressing the soundfont over and over.
 */
export function notesMidi({ channel, program, notes, velocity, seconds, tail }: Notes): Uint8Array {
  const ch = channel & 0x0f;
  const hold = Math.round(seconds * TICKS_PER_SECOND);
  const rest = Math.round(tail * TICKS_PER_SECOND);
  const events = [
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo: 500,000 µs a beat (120 bpm)
    0x00, 0xb0 | ch, 0x00, 0x00, // bank select 0 (FluidSynth plays channel 10 from the drum bank by itself)
    0x00, 0xc0 | ch, program & 0x7f, // program change
  ];
  notes.forEach((note, i) => {
    events.push(...varLen(i === 0 ? 0 : rest), 0x90 | ch, note & 0x7f, velocity & 0x7f); // note on, after the last one's tail
    events.push(...varLen(hold), 0x80 | ch, note & 0x7f, 0x40); // note off
  });
  // A harmless controller change at the end of the last tail keeps the player (and so the render) going until then.
  events.push(...varLen(rest), 0xb0 | ch, 0x07, 0x64);
  events.push(0x00, 0xff, 0x2f, 0x00); // end of track
  const length = events.length;
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0, // MThd: format 0, 1 track, 480 ticks a beat
    0x4d, 0x54, 0x72, 0x6b, (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff, // MTrk
    ...events,
  ]);
}
