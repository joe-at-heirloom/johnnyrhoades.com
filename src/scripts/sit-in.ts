/*
  Sitting in (ADR 0030): eight pads in the blues scale of the song's key,
  played with a pointer, a finger or the home-row keys (A S D F G H J K).
  A note sounds while it's held and lets go when it's released; drag a pad
  upward while it's held to bend the note up to a whole step. The notes go
  through the instrument's own channel strip, the drawing on the stage plays
  them, and the player keeps the band's fills out of your way
  (`lastPlayed`). The scale and the ranges are in src/lib/sit-in.ts.
*/
import { pickSample, type JamEvent, type Key, type MeasuredSound, type Part } from '../lib/jam';
import { SIT_IN, bendFromDrag, padForKey, pads, spoken, type SitInInstrument } from '../lib/sit-in';

type Loaded = { buffer: AudioBuffer; offset: number };

export type SitInDeps = {
  /** Start (or resume) the audio, on a gesture. */
  audio(): Promise<AudioContext | null>;
  liveInput(part: Part): AudioNode | null;
  load(id: string): Promise<Loaded | null>;
  sounds: readonly MeasuredSound[];
  key(): Key;
  /** Show the note on the stage. */
  show(e: JamEvent, at: number, end: number): void;
};

export type SitIn = {
  /** The audio time of the last note you played, or -Infinity. */
  lastPlayed(): number;
  /** The part you're sitting in on, while you're playing. */
  playingPart(): Part | null;
  setKey(key: Key): void;
};

const RELEASE_TAU = 0.1;

export function initSitIn(root: HTMLElement, deps: SitInDeps): SitIn {
  const padEls = [...root.querySelectorAll<HTMLButtonElement>('[data-pad]')];
  const picker = root.querySelector<HTMLElement>('[data-sit-in-instrument]');
  let instrument: SitInInstrument = (root.querySelector<HTMLInputElement>('input[name="sit-in"]:checked')?.value as SitInInstrument) ?? 'harp';
  let key: Key = deps.key();
  let last = -Infinity;
  const held = new Map<string, { src: AudioBufferSourceNode; gain: GainNode; rate: number; ctx: AudioContext }>();

  const pool = () => deps.sounds.filter((s) => s.part === SIT_IN[instrument].part && s.tone === SIT_IN[instrument].tone);

  function label() {
    pads(key, instrument).forEach((p, i) => {
      const el = padEls[i];
      if (!el) return;
      el.querySelector('[data-pad-name]')!.textContent = p.name;
      el.querySelector('[data-pad-degree]')!.textContent = p.degree;
      el.setAttribute('aria-label', `${spoken(p)} (key ${p.key.toUpperCase()})`);
    });
  }

  /** Fetch this instrument's samples for these pads, so the first note doesn't wait. */
  async function warm() {
    const ps = pool();
    await Promise.all(pads(key, instrument).map((p) => deps.load(pickSample(ps, p.midi)!.sound.id)));
  }

  async function start(id: string, padIndex: number) {
    if (held.has(id)) return;
    const ctx = await deps.audio();
    if (!ctx) return;
    const pad = pads(key, instrument)[padIndex];
    const picked = pad && pickSample(pool(), pad.midi);
    if (!pad || !picked) return;
    const got = await deps.load(picked.sound.id);
    const out = deps.liveInput(SIT_IN[instrument].part);
    if (!got || !out) return;
    const src = ctx.createBufferSource();
    src.buffer = got.buffer;
    src.playbackRate.value = picked.rate;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.75, now + 0.005);
    src.connect(gain).connect(out);
    src.start(now, got.offset);
    held.set(id, { src, gain, rate: picked.rate, ctx });
    last = now;
    padEls[padIndex]?.setAttribute('data-down', '');
    deps.show({ at: 0, part: SIT_IN[instrument].part, midi: pad.midi, gain: 0.75, beats: 1 }, now, now + 0.6);
  }

  function bend(id: string, semitones: number) {
    const h = held.get(id);
    if (!h) return;
    h.src.playbackRate.setTargetAtTime(h.rate * Math.pow(2, semitones / 12), h.ctx.currentTime, 0.03);
  }

  function release(id: string, padIndex: number) {
    const h = held.get(id);
    padEls[padIndex]?.removeAttribute('data-down');
    if (!h) return;
    held.delete(id);
    const now = h.ctx.currentTime;
    h.gain.gain.cancelScheduledValues(now);
    h.gain.gain.setValueAtTime(h.gain.gain.value, now);
    h.gain.gain.setTargetAtTime(0, now, RELEASE_TAU);
    h.src.stop(now + RELEASE_TAU * 6);
    last = now;
  }

  // Pointers and fingers: press to play, drag up to bend, let go to release.
  padEls.forEach((el, i) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId); // keep the note while a finger slides off the pad to bend
      } catch {
        // a pointer the browser no longer tracks: play the note anyway
      }
      const id = `p${e.pointerId}`;
      el.dataset.startY = String(e.clientY);
      el.dataset.hold = id;
      void start(id, i);
    });
    el.addEventListener('pointermove', (e) => {
      if (!el.dataset.hold) return;
      bend(el.dataset.hold, bendFromDrag(Number(el.dataset.startY) - e.clientY));
    });
    const up = () => {
      if (el.dataset.hold) release(el.dataset.hold, i);
      delete el.dataset.hold;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    // A pad focused and pressed with Enter or Space plays a short note.
    el.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      const id = `k-click-${i}`;
      void start(id, i).then(() => window.setTimeout(() => release(id, i), 350));
    });
  });

  // The home row plays the pads, unless you're typing somewhere.
  const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || (t instanceof HTMLInputElement && ['text', 'search', 'email', 'number'].includes(t.type)) || t instanceof HTMLTextAreaElement);
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const i = padForKey(e.key);
    if (i < 0) return;
    e.preventDefault();
    void start(`k${i}`, i);
  });
  document.addEventListener('keyup', (e) => {
    const i = padForKey(e.key);
    if (i >= 0) release(`k${i}`, i);
  });

  picker?.addEventListener('change', () => {
    instrument = (root.querySelector<HTMLInputElement>('input[name="sit-in"]:checked')?.value as SitInInstrument) ?? 'harp';
    label();
    void warm();
  });
  // Load the samples the first time someone reaches for a pad.
  root.querySelector('[data-sit-in]')?.addEventListener('pointerenter', () => void warm(), { once: true });

  label();
  return {
    lastPlayed: () => last,
    playingPart: () => (held.size ? SIT_IN[instrument].part : null),
    setKey(k) {
      key = k;
      label();
    },
  };
}
