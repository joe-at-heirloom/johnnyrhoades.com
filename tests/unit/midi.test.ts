import { describe, expect, it } from 'vitest';
import { notesMidi, slotStart, varLen } from '../../src/lib/midi';

const oneNoteMidi = (o: { channel: number; program: number; note: number; velocity: number; seconds: number; tail: number }) => notesMidi({ ...o, notes: [o.note] });

describe('a one-note MIDI file', () => {
  it('writes variable-length numbers the MIDI way', () => {
    expect(varLen(0)).toEqual([0x00]);
    expect(varLen(0x7f)).toEqual([0x7f]);
    expect(varLen(0x80)).toEqual([0x81, 0x00]);
    expect(varLen(960)).toEqual([0x87, 0x40]);
    expect(varLen(0x0fffffff)).toEqual([0xff, 0xff, 0xff, 0x7f]);
  });

  it('is a format-0 file with one track whose length is right', () => {
    const f = oneNoteMidi({ channel: 0, program: 33, note: 40, velocity: 100, seconds: 1.5, tail: 0.5 });
    expect(String.fromCharCode(...f.slice(0, 4))).toBe('MThd');
    expect([...f.slice(8, 14)]).toEqual([0, 0, 0, 1, 0x01, 0xe0]);
    expect(String.fromCharCode(...f.slice(14, 18))).toBe('MTrk');
    const declared = (f[18]! << 24) | (f[19]! << 16) | (f[20]! << 8) | f[21]!;
    expect(declared).toBe(f.length - 22);
    expect([...f.slice(-4)]).toEqual([0x00, 0xff, 0x2f, 0x00]);
  });

  it('selects the program, plays the note for its length, then waits out the tail', () => {
    const f = [...oneNoteMidi({ channel: 0, program: 66, note: 58, velocity: 96, seconds: 1, tail: 0.5 })];
    const on = f.indexOf(0x90);
    expect(f.slice(on - 3, on - 1)).toEqual([0xc0, 66]);
    expect(f.slice(on, on + 3)).toEqual([0x90, 58, 96]);
    // 1 s is 960 ticks before the note off, then 480 before the end.
    expect(f.slice(on + 3, on + 6)).toEqual([0x87, 0x40, 0x80]);
    expect(f.slice(on + 8, on + 11)).toEqual([0x83, 0x60, 0xb0]);
  });

  it('puts drums on channel 10, where the program picks the kit', () => {
    const f = [...oneNoteMidi({ channel: 9, program: 40, note: 38, velocity: 100, seconds: 0.5, tail: 1 })];
    const kit = f.indexOf(0xc9);
    expect(f.slice(kit, kit + 2)).toEqual([0xc9, 40]);
    expect(f.slice(f.indexOf(0x99), f.indexOf(0x99) + 3)).toEqual([0x99, 38, 100]);
  });
});

describe('notes in a row', () => {
  it('plays each note a slot after the last, so one render holds them all', () => {
    const f = [...notesMidi({ channel: 0, program: 16, notes: [52, 55, 58], velocity: 100, seconds: 1, tail: 0.5 })];
    const ons = f.flatMap((b, i) => (b === 0x90 ? [i] : []));
    expect(ons.map((i) => f[i + 1])).toEqual([52, 55, 58]);
    // Between notes: 960 ticks held, then 480 of tail before the next note on.
    expect(f.slice(ons[0]! + 3, ons[0]! + 6)).toEqual([0x87, 0x40, 0x80]);
    expect(f.slice(ons[1]! - 2, ons[1]!)).toEqual([0x83, 0x60]);
    expect(slotStart(2, 1, 0.5)).toBe(3);
  });
});
