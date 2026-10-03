/*
  Print finish for the show card: the site's own texture tiles (ADR 0015),
  applied to the rendered PNG so it reads as ink on card stock.

  - Letterpress: where worn wood type didn't take the ink, the paper shows
    through. The tile's alpha marks the voids; we lay bone over them, which
    shows on black and red and disappears on bone. As on the site, only big
    type wears: voids land only well inside an inked area, so a label's thin
    strokes stay whole (a void across the I in "MI" read as "M!").
  - Paper: faint mottling and flecks of ink on the stock.

  Both tiles draw only the palette's own colors.
*/
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const TEXTURES = join(process.cwd(), 'src/assets/textures');
const FILES = { letterpress: join(TEXTURES, 'letterpress.webp'), paper: join(TEXTURES, 'paper.webp') };
const BONE = { r: 239, g: 230, b: 211 };

const WEAR_TILE = 576;

let hash: string | null = null;

/** For the render cache: regenerated textures (scripts/make-textures.ts) mean re-rendered posters. */
export function textureHash(): string {
  if (!hash) {
    const h = createHash('sha256');
    for (const file of Object.values(FILES)) h.update(readFileSync(file));
    hash = h.digest('hex').slice(0, 16);
  }
  return hash;
}

const PAPER_TILE = 512;

let tiles: Promise<{ voids: Buffer; paper: Buffer }> | null = null;

function loadTiles() {
  tiles ??= (async () => {
    // Letterpress is drawn at 2x for retina screens; posters use it at 1.5x so the wear reads at feed size.
    const voids = await sharp(FILES.letterpress).resize(WEAR_TILE, WEAR_TILE).ensureAlpha().extractChannel(3).negate().raw().toBuffer();
    const paper = await sharp(FILES.paper).resize(PAPER_TILE, PAPER_TILE).ensureAlpha().raw().toBuffer();
    return { voids, paper };
  })();
  return tiles;
}

/** The rendered card with the print texture on top: the stock's grain where there's no ink, wear inside heavy ink. */
export async function printFinish(png: Buffer): Promise<Buffer> {
  const { voids, paper } = await loadTiles();
  const { width, height } = await sharp(png).metadata();
  const w = width!;
  const h = height!;

  // Ink is anything darker than the stock: black, red, or the cancelled gray.
  const ink = await sharp(png).flatten({ background: BONE }).greyscale().threshold(170).negate().toColourspace('b-w').raw().toBuffer();
  // Keep only the inside of strokes wider than about 1.2% of the short side; a label's thin strokes blur below the cut.
  const sigma = Math.max(1, Math.min(w, h) * 0.003);
  // (The cut is applied below, not with sharp's threshold(), which runs before blur() in one pipeline.)
  const blurred = await sharp(ink, { raw: { width: w, height: h, channels: 1 } }).blur(sigma).toColourspace('b-w').raw().toBuffer();

  // One overlay. Ink covers the paper, so the grain only shows on bare stock; the voids are bone where worn type missed.
  const overlay = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const wearRow = (y % WEAR_TILE) * WEAR_TILE;
    const paperRow = (y % PAPER_TILE) * PAPER_TILE;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (blurred[i]! >= 240) {
        overlay[o] = BONE.r;
        overlay[o + 1] = BONE.g;
        overlay[o + 2] = BONE.b;
        overlay[o + 3] = voids[wearRow + (x % WEAR_TILE)]!;
      } else if (!ink[i]) {
        paper.copy(overlay, o, (paperRow + (x % PAPER_TILE)) * 4, (paperRow + (x % PAPER_TILE)) * 4 + 4);
      }
    }
  }

  return sharp(png)
    .composite([{ input: overlay, raw: { width: w, height: h, channels: 4 } }])
    .png({ compressionLevel: 6 })
    .toBuffer();
}
