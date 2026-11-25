/*
  Pure helpers for measuring the blues maker's sounds (ADR 0030): where a
  sound starts and ends, how loud it peaks, and what note it really is.
  Used by scripts/make-jam-sounds.ts on decoded samples, and onsetIndex also
  by the browser, which trims the encoder's lead-in silence after decoding.
*/

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** "E1" → 28, "A#3" → 58. MIDI note 60 is C4 (middle C). */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Not a note name: ${name}`);
  const pc = NOTE_NAMES.indexOf(m[1] as (typeof NOTE_NAMES)[number]) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + pc;
}

export const midiToName = (midi: number) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/** A frequency as a (fractional) MIDI note number, A4 = 440 Hz. */
export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);

export function peak(samples: Float32Array): number {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

const dbToAmp = (db: number) => Math.pow(10, db / 20);

/** The first sample louder than `thresholdDb` below the peak, backed off `preRollMs`. */
export function onsetIndex(samples: Float32Array, sampleRate: number, thresholdDb = -30, preRollMs = 3): number {
  const level = peak(samples) * dbToAmp(thresholdDb);
  if (level === 0) return 0;
  const i = samples.findIndex((s) => Math.abs(s) >= level);
  return Math.max(0, i - Math.round((preRollMs / 1000) * sampleRate));
}

/** One past the last sample louder than `thresholdDb` below the peak. */
export function tailIndex(samples: Float32Array, thresholdDb = -60): number {
  const level = peak(samples) * dbToAmp(thresholdDb);
  for (let i = samples.length - 1; i >= 0; i--) if (Math.abs(samples[i]!) >= level) return i + 1;
  return 0;
}

/**
 * YIN pitch detection (de Cheveigné and Kawahara, 2002) on one window.
 * Returns the fundamental in Hz and how periodic the window is (1 is a
 * perfect tone, below about 0.8 is noise), or null when nothing is pitched.
 */
export function yin(
  window: Float32Array,
  sampleRate: number,
  { minHz = 30, maxHz = 1500, threshold = 0.15 } = {},
): { hz: number; clarity: number } | null {
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(window.length / 2));
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  if (maxLag <= minLag) return null;
  const n = window.length - maxLag;

  // Difference function, then its cumulative mean normalized form.
  const d = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const diff = window[i]! - window[i + lag]!;
      sum += diff * diff;
    }
    d[lag] = sum;
  }
  const cmnd = new Float64Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag]!;
    cmnd[lag] = running === 0 ? 1 : (d[lag]! * lag) / running;
  }

  // The first dip under the threshold, followed to its local minimum; else the global minimum.
  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmnd[lag]! < threshold) {
      while (lag + 1 <= maxLag && cmnd[lag + 1]! < cmnd[lag]!) lag++;
      best = lag;
      break;
    }
  }
  if (best < 0) {
    best = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) if (cmnd[lag]! < cmnd[best]!) best = lag;
  }

  // Parabolic interpolation for a fractional lag.
  const a = cmnd[best - 1] ?? cmnd[best]!;
  const b = cmnd[best]!;
  const c = cmnd[best + 1] ?? cmnd[best]!;
  const denom = a - 2 * b + c;
  const shift = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
  const lag = best + Math.max(-1, Math.min(1, shift));
  return { hz: sampleRate / lag, clarity: Math.max(0, 1 - b) };
}

/**
 * The pitch of a note: YIN over several windows of its body (skipping the
 * attack), keeping the clear ones, and taking the median.
 */
export function notePitch(
  samples: Float32Array,
  sampleRate: number,
  opts: { minHz?: number; maxHz?: number; skipMs?: number; windowSize?: number; windows?: number } = {},
): { hz: number; clarity: number } | null {
  const { minHz = 30, maxHz = 1500, skipMs = 80, windowSize = 4096, windows = 8 } = opts;
  const start = onsetIndex(samples, sampleRate) + Math.round((skipMs / 1000) * sampleRate);
  const hop = Math.round(windowSize / 2);
  const found: { hz: number; clarity: number }[] = [];
  for (let w = 0; w < windows; w++) {
    const from = start + w * hop;
    if (from + windowSize > samples.length) break;
    const r = yin(samples.subarray(from, from + windowSize), sampleRate, { minHz, maxHz });
    if (r && r.clarity >= 0.8) found.push(r);
  }
  if (found.length === 0) return null;
  found.sort((x, y) => x.hz - y.hz);
  const mid = found[Math.floor(found.length / 2)]!;
  const clarity = found.reduce((s, r) => s + r.clarity, 0) / found.length;
  return { hz: mid.hz, clarity };
}

/** Loudness as RMS in dBFS over the first `window` samples (the whole sound if it's shorter). */
export function loudness(x: Float32Array, window = x.length): number {
  const n = Math.min(x.length, window);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += x[i]! ** 2;
  return n === 0 || sum === 0 ? -Infinity : 10 * Math.log10(sum / n);
}

/**
 * Bring a sound to `targetDb` of loudness, measured over `window` samples,
 * without letting its peak pass `ceilingDb`. Peak normalizing alone leaves
 * a spiky sound (a snare, a crackle) much quieter than a smooth one (an organ).
 */
export function levelTo(x: Float32Array, targetDb: number, window: number, ceilingDb = -1): Float32Array {
  const now = loudness(x, window);
  if (!Number.isFinite(now)) return x.slice();
  const p = peak(x);
  const gain = Math.min(Math.pow(10, (targetDb - now) / 20), Math.pow(10, ceilingDb / 20) / p);
  return x.map((v) => v * gain);
}
