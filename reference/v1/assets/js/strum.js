/*
  Strum it: a playable guitar neck.

  The strings are SVG paths that bend where you cross them. The sound is a
  Karplus-Strong plucked string, synthesized in the browser (no audio files),
  run through a touch of overdrive and some room reverb.

  It's silent until the visitor flips the little speaker switch under it.
*/
(() => {
  const root = document.querySelector('[data-strum]');
  if (!root) return;

  const neck = root.querySelector('[data-neck]');
  const svg = root.querySelector('[data-neck-svg]');
  const speaker = root.querySelector('[data-speaker]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';

  // Open E7, low string (top) to high string (bottom): E2 B2 D3 G#3 B3 E4
  const TUNING = [82.41, 123.47, 146.83, 207.65, 246.94, 329.63];
  const GAUGE = [3.6, 2.9, 2.3, 1.7, 1.3, 1];
  const WOUND = [true, true, true, true, false, false];
  const SUSTAIN = [4.2, 3.8, 3.5, 3.1, 2.8, 2.5]; // seconds to fade out

  let W = 0;
  let H = 0;
  let maxAmp = 7;
  const strings = TUNING.map((freq, i) => ({ i, freq, y: 0, x: 0, amp: 0, t0: 0, vf: 13 + i * 2.6 }));

  /* ---------- Drawing ---------- */

  const el = (name, attrs) => {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  function build() {
    W = neck.clientWidth;
    H = neck.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.replaceChildren();

    const top = H * 0.17;
    const gap = (H * 0.66) / (strings.length - 1);
    maxAmp = gap * 0.42;
    strings.forEach((s, i) => { s.y = top + gap * i; });

    // Frets get closer together up the neck, like a real one.
    const frets = W < 700 ? 9 : 15;
    const fretX = (n) => (W * (1 - Math.pow(2, -n / 12))) / (1 - Math.pow(2, -frets / 12));
    const g = el('g', {});
    g.appendChild(el('rect', { x: 0, y: 0, width: 7, height: H, fill: '#d9d0bd', opacity: 0.85 })); // the nut
    for (let n = 1; n <= frets; n++) {
      const x = fretX(n);
      g.appendChild(el('line', { class: 'neck-fret', x1: x, y1: 0, x2: x, y2: H }));
      if ([3, 5, 7, 9, 15].includes(n)) {
        g.appendChild(el('circle', { class: 'neck-inlay', cx: (fretX(n - 1) + x) / 2, cy: H / 2, r: Math.min(7, gap * 0.34) }));
      }
      if (n === 12) {
        const cx = (fretX(11) + x) / 2;
        g.appendChild(el('circle', { class: 'neck-inlay', cx, cy: strings[1].y + gap / 2, r: Math.min(7, gap * 0.34) }));
        g.appendChild(el('circle', { class: 'neck-inlay', cx, cy: strings[3].y + gap / 2, r: Math.min(7, gap * 0.34) }));
      }
    }
    svg.appendChild(g);

    strings.forEach((s, i) => {
      s.base = el('path', { class: 'neck-string' + (WOUND[i] ? ' neck-string--wound' : ''), 'stroke-width': GAUGE[i] });
      s.wind = WOUND[i] ? el('path', { class: 'neck-winding', 'stroke-width': GAUGE[i] }) : null;
      s.hot = el('path', { class: 'neck-hot', 'stroke-width': GAUGE[i] + 0.6 });
      svg.append(s.base, ...(s.wind ? [s.wind] : []), s.hot);
      draw(s, 0, 0);
    });
  }

  function draw(s, offset, glow) {
    const d = offset === 0
      ? `M0 ${s.y} L${W} ${s.y}`
      : `M0 ${s.y} Q${s.x} ${s.y + offset * 2} ${W} ${s.y}`;
    s.base.setAttribute('d', d);
    if (s.wind) s.wind.setAttribute('d', d);
    s.hot.setAttribute('d', d);
    s.hot.style.opacity = glow;
  }

  let raf = null;
  function frame(now) {
    let moving = false;
    strings.forEach((s) => {
      if (s.amp <= 0) return;
      const age = (now - s.t0) / 1000;
      const env = s.amp * Math.exp(-age * 2.6);
      if (env < 0.12) {
        s.amp = 0;
        draw(s, 0, 0);
        return;
      }
      moving = true;
      draw(s, env * Math.sin(age * Math.PI * 2 * s.vf), Math.min(1, env / maxAmp));
    });
    raf = moving ? requestAnimationFrame(frame) : null;
  }

  /* ---------- Sound ---------- */

  let ctx = null;
  let input = null;
  let buffers = [];
  const voices = [];
  let soundOn = false;

  // Karplus-Strong: a short burst of noise circulating through a damped delay line.
  function pluckBuffer(freq, sustain) {
    const sr = ctx.sampleRate;
    const period = Math.max(2, Math.round(sr / freq - 0.5)); // the averaging filter adds half a sample
    const length = Math.floor(sr * (sustain + 0.3));
    const buffer = ctx.createBuffer(1, length, sr);
    const out = buffer.getChannelData(0);
    const ring = new Float32Array(period);

    let smooth = 0;
    let mean = 0;
    for (let i = 0; i < period; i++) {
      smooth = smooth * 0.45 + (Math.random() * 2 - 1) * 0.55; // soften the pick attack
      ring[i] = smooth;
      mean += smooth;
    }
    mean /= period;
    for (let i = 0; i < period; i++) ring[i] -= mean;

    const damp = Math.pow(0.001, 1 / (sustain * freq)); // -60 dB after `sustain` seconds
    let idx = 0;
    for (let i = 0; i < length; i++) {
      const cur = ring[idx];
      const next = ring[idx + 1 === period ? 0 : idx + 1];
      out[i] = cur;
      ring[idx] = damp * 0.5 * (cur + next);
      idx = idx + 1 === period ? 0 : idx + 1;
    }
    return buffer;
  }

  function roomImpulse(seconds) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return ir;
  }

  function initAudio() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    // pick → a little overdrive → tone → amp, plus some room
    input = ctx.createGain();
    input.gain.value = 1.3;

    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2) / Math.tanh(2);
    }
    drive.curve = curve;
    drive.oversample = '2x';

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3600;
    tone.Q.value = 0.6;

    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 220;
    body.gain.value = 3;

    const master = ctx.createGain();
    master.gain.value = 0.32;

    const room = ctx.createConvolver();
    room.buffer = roomImpulse(1.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;

    input.connect(drive).connect(body).connect(tone);
    tone.connect(master).connect(ctx.destination);
    tone.connect(room).connect(wet).connect(ctx.destination);

    buffers = TUNING.map((f, i) => pluckBuffer(f, SUSTAIN[i]));
    return true;
  }

  function setSound(on) {
    if (on && !initAudio()) return;
    soundOn = on;
    speaker.setAttribute('aria-checked', String(on));
    if (on) {
      if (ctx.state !== 'running') ctx.resume();
    } else {
      voices.forEach((v) => v && v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03));
    }
  }

  function play(i, velocity) {
    if (!soundOn || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const prev = voices[i];
    if (prev) { // re-picking a ringing string cuts off the old note
      prev.gain.gain.setTargetAtTime(0, t, 0.012);
      prev.src.stop(t + 0.08);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffers[i];
    const gain = ctx.createGain();
    gain.gain.value = 0.3 + velocity * 0.5;
    src.connect(gain).connect(input);
    src.start(t);
    src.onended = () => { if (voices[i] && voices[i].src === src) voices[i] = null; };
    voices[i] = { src, gain };
  }

  /* ---------- Playing ---------- */

  function pluck(i, x, velocity) {
    const s = strings[i];
    s.x = Math.max(W * 0.06, Math.min(W * 0.94, x));
    s.t0 = performance.now();
    s.amp = maxAmp * velocity;
    play(i, velocity);
    if (!raf && !reduceMotion) raf = requestAnimationFrame(frame);
  }

  function strum(direction = 1, x = W / 2, velocity = 0.8, audible = true) {
    const order = direction > 0 ? strings : [...strings].reverse();
    order.forEach((s, k) => setTimeout(() => {
      if (audible) pluck(s.i, x + k * 6, velocity);
      else { // silent, visual-only strum
        s.x = x + k * 6; s.t0 = performance.now(); s.amp = maxAmp * velocity;
        if (!raf && !reduceMotion) raf = requestAnimationFrame(frame);
      }
    }, k * 22));
  }

  const point = (e) => {
    const r = neck.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  };

  let last = null;

  neck.addEventListener('pointermove', (e) => {
    const p = point(e);
    if (last) {
      const dy = p.y - last.y;
      const speed = Math.abs(dy) / Math.max(1, p.t - last.t); // px per ms
      const velocity = Math.min(1, 0.35 + speed * 0.35);
      strings.forEach((s) => {
        const a = last.y - s.y;
        const b = p.y - s.y;
        if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
          const f = dy === 0 ? 0 : (s.y - last.y) / dy;
          pluck(s.i, last.x + (p.x - last.x) * f, velocity);
        }
      });
    }
    last = p;
  });

  neck.addEventListener('pointerdown', (e) => {
    last = point(e);
    // a tap right on a string plucks it
    const hit = strings.find((s) => Math.abs(s.y - last.y) < 9);
    if (hit) pluck(hit.i, last.x, 0.7);
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

  // Give it one silent strum the first time it scrolls into view, so people see it moves.
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      setTimeout(() => strum(1, W * 0.3, 0.9, false), 250);
    }, { threshold: 0.8 });
    io.observe(neck);
  }
})();
