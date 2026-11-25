import { describe, expect, it } from 'vitest';
import { PARTS } from '../../src/lib/jam';
import { DEFAULT_MIX, FADER, audible, cloneMix, dbToGain, driveCurve, faderText, meterLevel, mixToParam, parseMix, roomSeconds, stripGain, tilt } from '../../src/lib/mixer';

describe('the mixer', () => {
  it('turns a fader’s dB into gain, with the bottom of its travel silent', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(6)).toBeCloseTo(1.995, 3);
    expect(dbToGain(FADER.min)).toBe(0);
  });

  it('writes fader readings the way a desk does', () => {
    expect(faderText(0)).toBe('0.0 dB');
    expect(faderText(3.5)).toBe('+3.5 dB');
    expect(faderText(-6)).toBe('−6.0 dB');
    expect(faderText(FADER.min)).toBe('−∞');
  });

  it('solos like a desk: anything soloed, only soloed strips play; mute always wins', () => {
    const mix = cloneMix(DEFAULT_MIX);
    expect(PARTS.every((p) => audible(mix, p))).toBe(true);
    mix.strips.bass.solo = true;
    mix.strips.drums.solo = true;
    expect(PARTS.filter((p) => audible(mix, p))).toEqual(['drums', 'bass']);
    mix.strips.drums.mute = true;
    expect(PARTS.filter((p) => audible(mix, p))).toEqual(['bass']);
    expect(stripGain(mix, 'guitar')).toBe(0);
    expect(stripGain(mix, 'bass')).toBeCloseTo(dbToGain(DEFAULT_MIX.strips.bass.db));
  });

  it('tilts the tone: lows one way, highs the other, up to 6 dB', () => {
    expect(tilt(0)).toEqual({ lowDb: -0, highDb: 0 });
    expect(tilt(1)).toEqual({ lowDb: -6, highDb: 6 });
    expect(tilt(-0.5)).toEqual({ lowDb: 3, highDb: -3 });
  });

  it('sizes the room from a short slap to a long hall', () => {
    expect(roomSeconds(0)).toBeCloseTo(0.6);
    expect(roomSeconds(1)).toBeCloseTo(3.6);
    expect(roomSeconds(5)).toBeCloseTo(3.6);
  });

  it('drives harder the further it’s turned, but never past full scale', () => {
    const soft = driveCurve(0, 9);
    const hard = driveCurve(1, 9);
    expect(soft[0]).toBeCloseTo(-1);
    expect(soft[8]).toBeCloseTo(1);
    expect(hard[8]).toBeCloseTo(1);
    // A quarter-level signal comes out louder through more drive: the peaks are rounded and the body comes up.
    expect(hard[5]!).toBeGreaterThan(soft[5]!);
    for (const v of hard) expect(Math.abs(v)).toBeLessThanOrEqual(1.0000001);
  });

  it('reads a meter on the fader’s scale', () => {
    expect(meterLevel(0)).toBe(0);
    expect(meterLevel(1)).toBeCloseTo((0 - FADER.min) / (FADER.max - FADER.min));
    expect(meterLevel(10)).toBe(1);
    expect(meterLevel(0.0001)).toBe(0);
  });

  it('leaves the link alone for the default mix, and round-trips a changed one', () => {
    expect(mixToParam(DEFAULT_MIX)).toBeNull();
    const mix = cloneMix(DEFAULT_MIX);
    mix.strips.guitar = { db: 2.5, pan: -0.6, tone: 0.4, send: 0.5, mute: false, solo: true };
    mix.strips.room.mute = true;
    mix.master = { db: -3, room: 0.8, drive: 0.5 };
    const param = mixToParam(mix)!;
    expect(param).toBe('g:2.5,-60,40,50,s;r:-10.5,0,0,0,m;m:-3,80,50');
    expect(parseMix(param)).toEqual(mix);
  });

  it('falls back to the default for anything malformed or out of range', () => {
    expect(parseMix(null)).toEqual(DEFAULT_MIX);
    expect(parseMix('zz:1,2;nonsense')).toEqual(DEFAULT_MIX);
    const m = parseMix('b:99,500,-500,900;m:abc,,');
    expect(m.strips.bass).toMatchObject({ db: FADER.max, pan: 1, tone: -1, send: 1, mute: false });
    expect(m.master).toEqual(DEFAULT_MIX.master);
    expect(parseMix('b:-7.3').strips.bass.db).toBe(-7.5);
  });
});
