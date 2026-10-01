/*
  Strum it: a playable guitar neck.

  The strings are SVG paths that bend where you cross them. The sound is a
  Karplus-Strong plucked string, synthesized in the browser (no audio files),
  run through a touch of overdrive and some room reverb.

  It's silent until the visitor flips the little speaker switch under it.
  Loaded on demand by the StrumNeck component when the neck nears the viewport.
*/
import { E7_TUNING, crossedStrings, fretPositions, karplusStrong } from '../lib/strum';
import { prefersReducedMotion } from './dom';
import { track } from './track';

const NS = 'http://www.w3.org/2000/svg';
const GAUGE = [3.6, 2.9, 2.3, 1.7, 1.3, 1];
const WOUND = [true, true, true, true, false, false];
const SUSTAIN = [4.2, 3.8, 3.5, 3.1, 2.8, 2.5]; // seconds to fade out

type GuitarString = {
  i: number;
  y: number;
  x: number;
  amp: number;
  t0: number;
  vf: number; // visual wobble frequency
  base?: SVGPathElement;
  wind?: SVGPathElement | null;
  hot?: SVGPathElement;
};

type Voice = { src: AudioBufferSourceNode; gain: GainNode };

export function initStrum(root: HTMLElement): void {
  const neck = root.querySelector<HTMLElement>('[data-neck]');
  const svg = root.querySelector<SVGSVGElement>('[data-neck-svg]');
  const speaker = root.querySelector<HTMLButtonElement>('[data-speaker]');
  if (!neck || !svg || !speaker) return;

  const reduceMotion = prefersReducedMotion();
  let W = 0;
  let H = 0;
  let maxAmp = 7;
  const strings: GuitarString[] = E7_TUNING.map((_, i) => ({ i, y: 0, x: 0, amp: 0, t0: 0, vf: 13 + i * 2.6 }));

  /* ---------- Drawing ---------- */

  const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  };

  function build() {
    W = neck!.clientWidth;
    H = neck!.clientHeight;
    svg!.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg!.replaceChildren();

    const top = H * 0.17;
    const gap = (H * 0.66) / (strings.length - 1);
    maxAmp = gap * 0.42;
    strings.forEach((s, i) => { s.y = top + gap * i; });

    const frets = fretPositions(W, W < 700 ? 9 : 15);
    const inlayR = Math.min(7, gap * 0.34);
    const g = el('g', {});
    g.appendChild(el('rect', { x: 0, y: 0, width: 7, height: H, fill: '#d9d0bd', opacity: 0.85 })); // the nut
    frets.forEach((x, k) => {
      const n = k + 1;
      const prevX = k === 0 ? 0 : (frets[k - 1] ?? 0);
      g.appendChild(el('line', { class: 'neck-fret', x1: x, y1: 0, x2: x, y2: H }));
      if ([3, 5, 7, 9, 15].includes(n)) {
        g.appendChild(el('circle', { class: 'neck-inlay', cx: (prevX + x) / 2, cy: H / 2, r: inlayR }));
      }
      if (n === 12) {
        const cx = (prevX + x) / 2;
        g.appendChild(el('circle', { class: 'neck-inlay', cx, cy: (strings[1]?.y ?? 0) + gap / 2, r: inlayR }));
        g.appendChild(el('circle', { class: 'neck-inlay', cx, cy: (strings[3]?.y ?? 0) + gap / 2, r: inlayR }));
      }
    });
    svg!.appendChild(g);

    strings.forEach((s, i) => {
      const gauge = GAUGE[i] ?? 1;
      s.base = el('path', { class: 'neck-string' + (WOUND[i] ? ' neck-string--wound' : ''), 'stroke-width': gauge });
      s.wind = WOUND[i] ? el('path', { class: 'neck-winding', 'stroke-width': gauge }) : null;
      s.hot = el('path', { class: 'neck-hot', 'stroke-width': gauge + 0.6 });
      svg!.append(s.base, ...(s.wind ? [s.wind] : []), s.hot);
      draw(s, 0, 0);
    });
  }

  function draw(s: GuitarString, offset: number, glow: number) {
    const d = offset === 0 ? `M0 ${s.y} L${W} ${s.y}` : `M0 ${s.y} Q${s.x} ${s.y + offset * 2} ${W} ${s.y}`;
    s.base?.setAttribute('d', d);
    s.wind?.setAttribute('d', d);
    if (s.hot) {
      s.hot.setAttribute('d', d);
      s.hot.style.opacity = String(glow);
    }
  }

  let raf: number | null = null;
  function frame(now: number) {
    let moving = false;
    for (const s of strings) {
      if (s.amp <= 0) continue;
      const age = (now - s.t0) / 1000;
      const env = s.amp * Math.exp(-age * 2.6);
      if (env < 0.12) {
        s.amp = 0;
        draw(s, 0, 0);
        continue;
      }
      moving = true;
      draw(s, env * Math.sin(age * Math.PI * 2 * s.vf), Math.min(1, env / maxAmp));
    }
    raf = moving ? requestAnimationFrame(frame) : null;
  }
  const animate = () => {
    if (!raf && !reduceMotion) raf = requestAnimationFrame(frame);
  };

  /* ---------- Sound ---------- */

  let ctx: AudioContext | null = null;
  let input: GainNode | null = null;
  let buffers: AudioBuffer[] = [];
  const voices: (Voice | null)[] = [];
  let soundOn = false;

  function roomImpulse(audio: AudioContext, seconds: number) {
    const len = Math.floor(audio.sampleRate * seconds);
    const ir = audio.createBuffer(2, len, audio.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return ir;
  }

  function initAudio(): boolean {
    if (ctx) return true;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    const audio = new AC();
    ctx = audio;

    // pick → a little overdrive → tone → amp, plus some room
    input = audio.createGain();
    input.gain.value = 1.3;

    const drive = audio.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2) / Math.tanh(2);
    }
    drive.curve = curve;
    drive.oversample = '2x';

    const tone = audio.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3600;
    tone.Q.value = 0.6;

    const body = audio.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 220;
    body.gain.value = 3;

    const master = audio.createGain();
    master.gain.value = 0.32;

    const room = audio.createConvolver();
    room.buffer = roomImpulse(audio, 1.6);
    const wet = audio.createGain();
    wet.gain.value = 0.22;

    input.connect(drive).connect(body).connect(tone);
    tone.connect(master).connect(audio.destination);
    tone.connect(room).connect(wet).connect(audio.destination);

    buffers = E7_TUNING.map((freq, i) => {
      const samples = karplusStrong({ sampleRate: audio.sampleRate, freq, sustain: SUSTAIN[i] ?? 3 });
      const buf = audio.createBuffer(1, samples.length, audio.sampleRate);
      buf.copyToChannel(samples, 0);
      return buf;
    });
    return true;
  }

  function setSound(on: boolean) {
    if (on && !initAudio()) return;
    soundOn = on;
    speaker!.setAttribute('aria-checked', String(on));
    if (!ctx) return;
    if (on) {
      track('strum_sound_on');
      if (ctx.state !== 'running') void ctx.resume();
    } else {
      for (const v of voices) v?.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    }
  }

  function play(i: number, velocity: number) {
    if (!soundOn || !ctx || !input || ctx.state !== 'running') return;
    const buffer = buffers[i];
    if (!buffer) return;
    const t = ctx.currentTime;
    const prev = voices[i];
    if (prev) { // re-picking a ringing string cuts off the old note
      prev.gain.gain.setTargetAtTime(0, t, 0.012);
      prev.src.stop(t + 0.08);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.3 + velocity * 0.5;
    src.connect(gain).connect(input);
    src.start(t);
    src.onended = () => { if (voices[i]?.src === src) voices[i] = null; };
    voices[i] = { src, gain };
  }

  /* ---------- Playing ---------- */

  function pluck(i: number, x: number, velocity: number) {
    const s = strings[i];
    if (!s) return;
    s.x = Math.max(W * 0.06, Math.min(W * 0.94, x));
    s.t0 = performance.now();
    s.amp = maxAmp * velocity;
    play(i, velocity);
    animate();
  }

  function strum(direction = 1, x = W / 2, velocity = 0.8, audible = true) {
    const order = direction > 0 ? strings : [...strings].reverse();
    order.forEach((s, k) => window.setTimeout(() => {
      if (audible) {
        pluck(s.i, x + k * 6, velocity);
      } else { // silent, visual-only strum
        s.x = x + k * 6;
        s.t0 = performance.now();
        s.amp = maxAmp * velocity;
        animate();
      }
    }, k * 22));
  }

  type Point = { x: number; y: number; t: number };
  const point = (e: PointerEvent): Point => {
    const r = neck.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  };

  let last: Point | null = null;

  neck.addEventListener('pointermove', (e) => {
    const p = point(e);
    if (last) {
      const from = last;
      const dy = p.y - from.y;
      const speed = Math.abs(dy) / Math.max(1, p.t - from.t); // px per ms
      const velocity = Math.min(1, 0.35 + speed * 0.35);
      for (const i of crossedStrings(from.y, p.y, strings.map((s) => s.y))) {
        const s = strings[i];
        if (!s) continue;
        const f = dy === 0 ? 0 : (s.y - from.y) / dy;
        pluck(i, from.x + (p.x - from.x) * f, velocity);
      }
    }
    last = p;
  });

  neck.addEventListener('pointerdown', (e) => {
    const p = point(e);
    last = p;
    // a tap right on a string plucks it
    const hit = strings.find((s) => Math.abs(s.y - p.y) < 9);
    if (hit) pluck(hit.i, p.x, 0.7);
  });
  neck.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') last = null; });
  neck.addEventListener('pointerleave', () => { last = null; });
  neck.addEventListener('pointercancel', () => { last = null; });

  neck.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    strum(e.shiftKey ? -1 : 1);
  });

  speaker.addEventListener('click', () => setSound(speaker.getAttribute('aria-checked') !== 'true'));

  /* ---------- Setup ---------- */

  build();
  if ('ResizeObserver' in window) {
    let lastW = W;
    new ResizeObserver(() => {
      if (neck.clientWidth === lastW) return;
      lastW = neck.clientWidth;
      build();
    }).observe(neck);
  }

  // One silent strum the first time it scrolls into view, so people see it moves.
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        window.setTimeout(() => strum(1, W * 0.3, 0.9, false), 250);
      },
      { threshold: 0.8 },
    );
    io.observe(neck);
  }
}
