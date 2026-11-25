/*
  The blues maker's mixing console (ADR 0030): the mix as data, and the
  arithmetic behind each control. Pure, so it's unit tested; the audio graph
  is in src/scripts/console.ts and the controls in src/scripts/mixer-ui.ts.

  A channel strip per part: a fader in dB, pan, a tone control that tilts
  the sound darker or brighter, a reverb send, mute and solo. A master
  strip: level, room size (how long the reverb rings) and drive (tape-style
  saturation into the bus compressor).

  The mix rides along in the link as one `mix` parameter, written only when
  it differs from the default, so a plain song link stays short.
*/
import { PARTS, type Part } from './jam';

export type Strip = { db: number; pan: number; tone: number; send: number; mute: boolean; solo: boolean };
export type Master = { db: number; room: number; drive: number };
export type Mix = { strips: Record<Part, Strip>; master: Master };

/** The fader's range. Its bottom is silence. */
export const FADER = { min: -48, max: 6, step: 0.5 } as const;

const strip = (db: number, send: number, pan = 0): Strip => ({ db, pan, tone: 0, send, mute: false, solo: false });

/**
 * The starting mix (set by the meters with the sampled kits, ADR 0032): the bass and drums up front, guitar and keys under them,
 * the fills just behind them, the room well under the band. Panned the way a
 * small band stands: guitar a little left, keys a little right.
 */
export const DEFAULT_MIX: Mix = {
  strips: {
    drums: strip(-7, 0.08),
    bass: strip(-3, 0),
    guitar: strip(-6, 0.18, -0.25),
    keys: strip(-10, 0.22, 0.25),
    lead: strip(-5.5, 0.25, 0.1),
    room: strip(-10.5, 0),
  },
  master: { db: -3, room: 0.35, drive: 0.15 },
};

export const cloneMix = (m: Mix): Mix => ({ strips: Object.fromEntries(PARTS.map((p) => [p, { ...m.strips[p] }])) as Mix['strips'], master: { ...m.master } });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A fader's dB as a gain; the bottom of its travel is silence. */
export const dbToGain = (db: number) => (db <= FADER.min ? 0 : Math.pow(10, db / 20));

/** What a fader reads: "+3.5 dB", "−6.0 dB", "−∞". */
export const faderText = (db: number) => (db <= FADER.min ? '−∞' : `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(db).toFixed(1)} dB`);

/** Solo works the way it does on a desk: if anything is soloed, only soloed strips are heard. Mute always wins. */
export function audible(mix: Mix, part: Part): boolean {
  const s = mix.strips[part];
  if (s.mute) return false;
  const anySolo = PARTS.some((p) => mix.strips[p].solo);
  return !anySolo || s.solo;
}

/** The gain a strip's fader stage should sit at, solo and mute included. */
export const stripGain = (mix: Mix, part: Part) => (audible(mix, part) ? dbToGain(mix.strips[part].db) : 0);

/** Tone, −1 to 1, as a tilt: the lows go one way and the highs the other, up to 6 dB each. */
export const tilt = (tone: number) => ({ lowDb: -6 * tone, highDb: 6 * tone });

/** Room size, 0 to 1, as the reverb's ring-out time in seconds. */
export const roomSeconds = (room: number) => 0.6 + 3 * clamp(room, 0, 1);

/**
 * Drive, 0 to 1, as a saturation curve for a WaveShaper: a soft tanh that
 * rounds the peaks more the further it's turned, scaled so a full-scale
 * signal still comes out at full scale.
 */
export function driveCurve(amount: number, n = 1024): Float32Array<ArrayBuffer> {
  const k = 1 + 8 * clamp(amount, 0, 1);
  const norm = Math.tanh(k);
  return Float32Array.from({ length: n }, (_, i) => Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm);
}

/** A meter's reading for a peak sample value, 0 (silence or below the floor) to 1 (+6 dBFS). */
export const meterLevel = (peak: number) => (peak <= 0 ? 0 : clamp((20 * Math.log10(peak) - FADER.min) / (FADER.max - FADER.min), 0, 1));

/* ---------- In the link ---------- */

const KEYS: Record<Part, string> = { drums: 'd', bass: 'b', guitar: 'g', keys: 'k', lead: 'l', room: 'r' };

const sameStrip = (a: Strip, b: Strip) => a.db === b.db && a.pan === b.pan && a.tone === b.tone && a.send === b.send && a.mute === b.mute && a.solo === b.solo;

/**
 * The mix as one compact parameter, or null when it's the default.
 * Each changed strip is `key:db,pan,tone,send,flags` (pan, tone and send in
 * hundredths; flags `m` and `s`), the master `m:db,room,drive`, joined by `;`.
 */
export function mixToParam(mix: Mix): string | null {
  const parts: string[] = [];
  for (const p of PARTS) {
    const s = mix.strips[p];
    if (sameStrip(s, DEFAULT_MIX.strips[p])) continue;
    const flags = `${s.mute ? 'm' : ''}${s.solo ? 's' : ''}`;
    parts.push(`${KEYS[p]}:${s.db},${Math.round(s.pan * 100)},${Math.round(s.tone * 100)},${Math.round(s.send * 100)}${flags ? `,${flags}` : ''}`);
  }
  const m = mix.master;
  const d = DEFAULT_MIX.master;
  if (m.db !== d.db || m.room !== d.room || m.drive !== d.drive) parts.push(`m:${m.db},${Math.round(m.room * 100)},${Math.round(m.drive * 100)}`);
  return parts.length ? parts.join(';') : null;
}

/** Read a mix from the link. Anything missing, malformed or out of range falls back to the default. */
export function parseMix(param: string | null): Mix {
  const mix = cloneMix(DEFAULT_MIX);
  if (!param) return mix;
  const byKey = new Map(Object.entries(KEYS).map(([p, k]) => [k, p as Part]));
  const num = (v: string | undefined, lo: number, hi: number, fallback: number, scale = 1) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) ? clamp(n / scale, lo, hi) : fallback;
  };
  for (const chunk of param.split(';')) {
    const [key, body = ''] = chunk.split(':');
    const v = body.split(',');
    if (key === 'm') {
      const d = DEFAULT_MIX.master;
      mix.master = { db: num(v[0], FADER.min, FADER.max, d.db), room: num(v[1], 0, 1, d.room, 100), drive: num(v[2], 0, 1, d.drive, 100) };
      continue;
    }
    const part = byKey.get(key ?? '');
    if (!part) continue;
    const d = DEFAULT_MIX.strips[part];
    const flags = v[4] ?? '';
    mix.strips[part] = {
      db: Math.round(num(v[0], FADER.min, FADER.max, d.db) / FADER.step) * FADER.step,
      pan: num(v[1], -1, 1, d.pan, 100),
      tone: num(v[2], -1, 1, d.tone, 100),
      send: num(v[3], 0, 1, d.send, 100),
      mute: flags.includes('m'),
      solo: flags.includes('s'),
    };
  }
  return mix;
}
