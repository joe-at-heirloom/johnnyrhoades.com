/*
  The blues maker's mixing console, in Web Audio (ADR 0030). The numbers
  behind each control are in src/lib/mixer.ts.

  Each part has a channel strip:
    session in → tone (low shelf + high shelf, tilted) → pan → fader → meter → master
                                                              └→ reverb send → reverb
  and the master:
    sum (dry + reverb return) → drive (WaveShaper) → bus compressor → master fader → meter → out

  Notes you play yourself (sitting in) go straight into a strip's head, so
  they work whether or not the band is playing. A MediaStream tap on the
  master output records a take.

  Every Play gets its own "session" gain at the head of each strip, so Stop
  can fade out the notes already queued without touching the mix, and the
  reverb rings out naturally after. Every move glides (setTargetAtTime), so a
  fader ride never clicks or zips.
*/
import { PARTS, type Part } from '../lib/jam';
import { driveCurve, meterLevel, roomSeconds, stripGain, tilt, dbToGain, type Mix } from '../lib/mixer';

const GLIDE_S = 0.03; // the time constant every control move glides with
const STOP_FADE_S = 0.15;

type ChannelStrip = { head: GainNode; low: BiquadFilterNode; high: BiquadFilterNode; pan: StereoPannerNode; fader: GainNode; send: GainNode; meter: AnalyserNode };

export type Desk = {
  /** Where a part's notes go for the current Play. */
  input(part: Part): AudioNode | null;
  /** Where notes you play yourself go: straight into the strip, playing or not, and Stop doesn't cut them. */
  liveInput(part: Part): AudioNode;
  /** The master output as a stream, for recording a take. */
  recordStream(): MediaStream;
  openSession(): void;
  closeSession(): void;
  /** Bring every control to the mix, gliding. */
  apply(mix: Mix): void;
  /** Rebuild the reverb for a new room size (a click's worth of work, so only when a move ends). */
  setRoom(room: number): void;
  /** Each strip's and the master's peak level since the last call, on the meter's 0–1 scale. */
  meters(): Record<Part | 'master', number>;
};

/** A room: decaying noise, a little different in each ear, rolled off as it rings so the tail goes dark like a real one. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const coef = 0.2 + 0.75 * t; // more smoothing (darker) further into the tail
      lp = lp * coef + (Math.random() * 2 - 1) * (1 - coef);
      d[i] = lp * Math.pow(1 - t, 2.5) * 2;
    }
  }
  return ir;
}

export function createDesk(ctx: AudioContext, mix: Mix): Desk {
  const glide = (p: AudioParam, v: number) => p.setTargetAtTime(v, ctx.currentTime, GLIDE_S);

  // The master section.
  const sum = ctx.createGain();
  const drive = ctx.createWaveShaper();
  drive.oversample = '2x';
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.ratio.value = 2.5;
  glue.knee.value = 8;
  glue.attack.value = 0.012;
  glue.release.value = 0.25;
  const masterFader = ctx.createGain();
  const masterMeter = ctx.createAnalyser();
  masterMeter.fftSize = 512;
  sum.connect(drive).connect(glue).connect(masterFader).connect(masterMeter).connect(ctx.destination);
  let recordTap: MediaStreamAudioDestinationNode | null = null;

  const reverb = ctx.createConvolver();
  const wet = ctx.createGain();
  wet.gain.value = 0.6;
  reverb.connect(wet).connect(sum);

  const strips = new Map<Part, ChannelStrip>();
  for (const part of PARTS) {
    const head = ctx.createGain();
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 250;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 3000;
    const pan = ctx.createStereoPanner();
    const fader = ctx.createGain();
    const meter = ctx.createAnalyser();
    meter.fftSize = 512;
    const send = ctx.createGain();
    head.connect(low).connect(high).connect(pan).connect(fader).connect(meter).connect(sum);
    fader.connect(send).connect(reverb);
    strips.set(part, { head, low, high, pan, fader, send, meter });
  }

  // Each Play's notes come in through a session gain on every strip.
  let session = new Map<Part, GainNode>();
  function openSession() {
    session = new Map();
    for (const [part, s] of strips) {
      const g = ctx.createGain();
      g.connect(s.head);
      session.set(part, g);
    }
  }
  function closeSession() {
    const old = [...session.values()];
    const t = ctx.currentTime;
    for (const g of old) {
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + STOP_FADE_S);
    }
    window.setTimeout(() => old.forEach((g) => g.disconnect()), (STOP_FADE_S + 0.1) * 1000);
    session = new Map();
  }

  let lastDrive = -1;
  let lastRoom = -1;
  function apply(m: Mix) {
    for (const [part, s] of strips) {
      const st = m.strips[part];
      const { lowDb, highDb } = tilt(st.tone);
      glide(s.low.gain, lowDb);
      glide(s.high.gain, highDb);
      glide(s.pan.pan, st.pan);
      glide(s.fader.gain, stripGain(m, part));
      glide(s.send.gain, st.send);
    }
    glide(masterFader.gain, dbToGain(m.master.db));
    if (m.master.drive !== lastDrive) {
      lastDrive = m.master.drive;
      drive.curve = m.master.drive < 0.01 ? null : driveCurve(m.master.drive);
    }
    if (lastRoom < 0) setRoom(m.master.room);
  }

  function setRoom(room: number) {
    if (room === lastRoom) return;
    lastRoom = room;
    reverb.buffer = impulse(ctx, roomSeconds(room));
  }

  const scratch = new Float32Array(512);
  const peakOf = (a: AnalyserNode) => {
    a.getFloatTimeDomainData(scratch);
    let p = 0;
    for (const v of scratch) p = Math.max(p, Math.abs(v));
    return meterLevel(p);
  };
  function meters() {
    const out = { master: peakOf(masterMeter) } as Record<Part | 'master', number>;
    for (const [part, s] of strips) out[part] = peakOf(s.meter);
    return out;
  }

  function recordStream() {
    if (!recordTap) {
      recordTap = ctx.createMediaStreamDestination();
      masterMeter.connect(recordTap);
    }
    return recordTap.stream;
  }

  apply(mix);
  return { input: (part) => session.get(part) ?? null, liveInput: (part) => strips.get(part)!.head, recordStream, openSession, closeSession, apply, setRoom, meters };
}
