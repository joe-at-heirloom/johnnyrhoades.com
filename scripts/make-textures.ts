#!/usr/bin/env node
/*
  The site's print textures (ADR 0015), generated rather than downloaded so
  they're ours, seamless, small and reproducible:

  - ink.webp         uneven screen-printed black: faint lighter blotches and dust
  - paper.webp       poster stock for the bone and red: mottling, fibers, flecks
  - letterpress.webp a mask for display type: the voids worn wood type leaves
  - edge.webp        a mask for a rough paper edge where a section begins

  Every texture uses only the palette's own colors at low alpha, so no new
  colors. Output goes to src/assets/textures/ and is committed; re-run only to
  change the look.

    node --experimental-strip-types scripts/make-textures.ts
*/
import { mkdir, stat } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = 'src/assets/textures';
const BONE = [239, 230, 211] as const;
const INK = [13, 11, 10] as const;

/** Seeded PRNG (mulberry32), so every run draws the same textures. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, v: number) => smooth(clamp((v - a) / (b - a)));

/** Tileable value noise: a random lattice every `period` px that wraps at the tile edges. */
function valueNoise(w: number, h: number, period: number, rand: () => number): Float32Array {
  const gx = Math.max(1, Math.round(w / period));
  const gy = Math.max(1, Math.round(h / period));
  const lattice = Float32Array.from({ length: gx * gy }, rand);
  const at = (x: number, y: number) => lattice[((y % gy) * gx + (x % gx)) | 0]!;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * gy;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * gx;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      out[y * w + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

/** Octaves of value noise, normalized to 0..1. */
function fbm(w: number, h: number, periods: number[], rand: () => number): Float32Array {
  const out = new Float32Array(w * h);
  let total = 0;
  periods.forEach((period, i) => {
    const weight = 1 / (i + 1);
    total += weight;
    const n = valueNoise(w, h, period, rand);
    for (let p = 0; p < out.length; p++) out[p]! += n[p]! * weight;
  });
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of out) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  for (let p = 0; p < out.length; p++) out[p] = (out[p]! - lo) / (hi - lo || 1);
  void total;
  return out;
}

/** An RGBA canvas of one color, drawn on through its alpha. */
function canvas(w: number, h: number, color: readonly number[]) {
  const alpha = new Float32Array(w * h);
  const add = (x: number, y: number, a: number) => {
    const i = (((Math.round(y) % h) + h) % h) * w + (((Math.round(x) % w) + w) % w); // wraps: seamless tiles
    alpha[i] = clamp(alpha[i]! + a * (1 - alpha[i]!));
  };
  const toBuffer = () => {
    const data = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = color[0]!;
      data[i * 4 + 1] = color[1]!;
      data[i * 4 + 2] = color[2]!;
      data[i * 4 + 3] = Math.round(clamp(alpha[i]!) * 255);
    }
    return data;
  };
  return { alpha, add, toBuffer };
}

async function save(name: string, w: number, h: number, data: Buffer, quality = 82) {
  const file = `${OUT}/${name}`;
  await sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp({ quality, alphaQuality: quality, effort: 6 }).toFile(file);
  console.log(`${file} (${(await stat(file)).size} bytes)`);
}

/* ---------- ink: screen-printed black ---------- */

async function ink() {
  const S = 512;
  const rand = rng(11);
  const c = canvas(S, S, BONE);
  const mottle = fbm(S, S, [256, 128, 64, 32], rand);
  for (let i = 0; i < S * S; i++) c.alpha[i] = smoothstep(0.45, 0.95, mottle[i]!) * 0.04;
  for (let n = 0; n < 220; n++) {
    // dust: single flecks, now and then a pair
    const x = rand() * S;
    const y = rand() * S;
    const a = 0.07 + rand() * 0.12;
    c.add(x, y, a);
    if (rand() < 0.3) c.add(x + 1, y + (rand() < 0.5 ? 0 : 1), a * 0.6);
  }
  for (let n = 0; n < 5; n++) {
    // a few hairline scratches
    let x = rand() * S;
    let y = rand() * S;
    const angle = rand() * Math.PI;
    const len = 20 + rand() * 60;
    for (let t = 0; t < len; t += 0.5) {
      c.add(x, y, 0.02);
      x += Math.cos(angle) * 0.5;
      y += Math.sin(angle) * 0.5;
    }
  }
  await save('ink.webp', S, S, c.toBuffer(), 70);
}

/* ---------- paper: poster stock ---------- */

async function paper() {
  const S = 512;
  const rand = rng(23);
  const c = canvas(S, S, INK);
  const mottle = fbm(S, S, [256, 128, 64, 32, 16], rand);
  for (let i = 0; i < S * S; i++) c.alpha[i] = smoothstep(0.4, 1, mottle[i]!) * 0.035;
  for (let n = 0; n < 650; n++) {
    // fibers: short, slightly curved strokes
    let x = rand() * S;
    let y = rand() * S;
    let angle = rand() * Math.PI * 2;
    const len = 4 + rand() * 16;
    const a = 0.012 + rand() * 0.022;
    for (let t = 0; t < len; t += 0.5) {
      c.add(x, y, a);
      angle += (rand() - 0.5) * 0.25;
      x += Math.cos(angle) * 0.5;
      y += Math.sin(angle) * 0.5;
    }
  }
  for (let n = 0; n < 90; n++) {
    // flecks: bits of ink in the stock
    const x = rand() * S;
    const y = rand() * S;
    const a = 0.12 + rand() * 0.22;
    c.add(x, y, a);
    if (rand() < 0.4) c.add(x + 1, y, a * 0.7);
    if (rand() < 0.2) c.add(x, y + 1, a * 0.5);
  }
  await save('paper.webp', S, S, c.toBuffer(), 72);
}

/* ---------- letterpress: worn ink on display type (a mask) ---------- */

async function letterpress() {
  // Drawn at 2x (shown at 384 CSS px) so the speckle stays sharp on retina screens.
  const S = 768;
  const rand = rng(37);
  const c = canvas(S, S, BONE);
  const pressure = fbm(S, S, [384, 192, 96], rand); // where the ink ran thin
  const grain = fbm(S, S, [3, 2], rand);
  let voids = 0;
  for (let i = 0; i < S * S; i++) {
    const threshold = 0.9 - smoothstep(0.55, 1, pressure[i]!) * 0.12;
    // 1 = ink, 0 = a void, with a soft step so voids have ragged edges
    c.alpha[i] = 1 - smoothstep(threshold, threshold + 0.04, grain[i]!) * 0.9;
    voids += 1 - c.alpha[i]!;
  }
  for (let n = 0; n < 120; n++) {
    // now and then a bigger chip, two or three pixels across
    const x = rand() * S;
    const y = rand() * S;
    const r = 1 + rand() * 1.5;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const i = (((Math.round(y + dy) % S) + S) % S) * S + (((Math.round(x + dx) % S) + S) % S);
      c.alpha[i] = Math.min(c.alpha[i]!, 0.1);
    }
  }
  console.log(`letterpress: ${((voids / (S * S)) * 100).toFixed(1)}% of the ink worn away`);
  await save('letterpress.webp', S, S, c.toBuffer(), 85);
}

/* ---------- edge: a rough paper edge (a mask, opaque below the line) ---------- */

async function edge() {
  const W = 1200;
  const H = 28;
  const rand = rng(41);
  const c = canvas(W, H, BONE);
  const wave = (periods: number[], amp: number) => {
    const row = fbm(W, 1, periods, rand);
    return Array.from(row, (v) => (v - 0.5) * 2 * amp);
  };
  const broad = wave([600, 300, 150], 4);
  const fine = wave([12, 6, 3], 1.4);
  for (let x = 0; x < W; x++) {
    const line = H / 2 + broad[x]! + fine[x]!;
    for (let y = 0; y < H; y++) {
      const d = y - line; // >0 below the edge
      c.alpha[y * W + x] = smoothstep(-1.2, 1.2, d + (rand() - 0.5) * 0.8);
    }
  }
  await save('edge.webp', W, H, c.toBuffer(), 90);
}

await mkdir(OUT, { recursive: true });
await ink();
await paper();
await letterpress();
await edge();
