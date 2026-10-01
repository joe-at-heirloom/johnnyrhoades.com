/* Poster fonts: the static Archivo cuts from scripts/make-poster-fonts.py, for satori and for measuring. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as opentype from 'opentype.js';
import type { Font } from 'opentype.js';
import type { Measure } from './fit.ts';

export const FONT_DIR = join(process.cwd(), 'src/assets/fonts/poster');

/** The width ladder for fit-to-width type, widest first. */
export const DISPLAY_LADDER = ['display-125', 'display-1125', 'display-100', 'display-875', 'display-75', 'display-62'];
export const LABEL = 'label';
export const TEXT = 'text';

const WEIGHTS: Record<string, 600 | 800 | 900> = { label: 800, text: 600 };

// Node loads opentype.js's CommonJS build (everything under `default`); Vite loads its ESM build (named exports).
const parse: (buffer: ArrayBuffer) => Font =
  (opentype as { parse?: (b: ArrayBuffer) => Font }).parse ?? (opentype as unknown as { default: { parse: (b: ArrayBuffer) => Font } }).default.parse;

type Loaded = {
  satori: { name: string; data: Buffer; weight: 600 | 800 | 900; style: 'normal' }[];
  parsed: Map<string, Font>;
  hash: string;
};

let loaded: Loaded | null = null;

export function loadFonts(): Loaded {
  if (loaded) return loaded;
  const names = [...DISPLAY_LADDER, LABEL, TEXT];
  const hash = createHash('sha256');
  const satori: Loaded['satori'] = [];
  const parsed = new Map<string, Font>();
  for (const name of names) {
    const data = readFileSync(join(FONT_DIR, `Archivo-${name}.ttf`));
    hash.update(data);
    satori.push({ name, data, weight: WEIGHTS[name] ?? 900, style: 'normal' });
    parsed.set(name, parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer));
  }
  loaded = { satori, parsed, hash: hash.digest('hex').slice(0, 16) };
  return loaded;
}

/** Width of text at 1px, with kerning, as satori sets it. */
export const measure: Measure = (text, font) => {
  const f = loadFonts().parsed.get(font);
  if (!f) throw new Error(`Unknown poster font "${font}"`);
  return f.getAdvanceWidth(text, 1, { kerning: true });
};
