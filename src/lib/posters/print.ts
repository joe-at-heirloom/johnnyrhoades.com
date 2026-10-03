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
import { join } from 'node:path';
import sharp from 'sharp';

const TEXTURES = join(process.cwd(), 'src/assets/textures');
const BONE = { r: 239, g: 230, b: 211 };

const WEAR_TILE = 576;

let tiles: Promise<{ voids: Buffer; paper: Buffer }> | null = null;

function loadTiles() {
  tiles ??= (async () => {
    // Letterpress is drawn at 2x for retina screens; posters use it at 1.5x so the wear reads at feed size.
    const voids = await sharp(join(TEXTURES, 'letterpress.webp')).resize(WEAR_TILE, WEAR_TILE).ensureAlpha().extractChannel(3).negate().raw().toBuffer();
    const paper = await sharp(join(TEXTURES, 'paper.webp')).png().toBuffer();
    return { voids, paper };
  })();
  return tiles;
}

/** The rendered card with the print texture on top. */
export async function printFinish(png: Buffer): Promise<Buffer> {
  const { voids, paper } = await loadTiles();
  const { width, height } = await sharp(png).metadata();
  const raw = (channels: 1) => ({ raw: { width: width!, height: height!, channels } });

  // Ink is anything darker than the stock: black, red, or the cancelled gray.
  const ink = await sharp(png).flatten({ background: BONE }).greyscale().threshold(170).negate().toColourspace('b-w').raw().toBuffer();
  // Keep only the inside of strokes wider than about 1.2% of the short side; a label's thin strokes blur below the cut.
  const sigma = Math.max(1, Math.min(width!, height!) * 0.003);
  const inside = await sharp(ink, raw(1)).blur(sigma).threshold(240).toColourspace('b-w').raw().toBuffer();
  const alpha = Buffer.alloc(width! * height!);
  for (let y = 0; y < height!; y++) {
    const row = (y % WEAR_TILE) * WEAR_TILE;
    for (let x = 0; x < width!; x++) {
      const i = y * width! + x;
      if (inside[i]) alpha[i] = voids[row + (x % WEAR_TILE)]!;
    }
  }
  const wear = await sharp({ create: { width: width!, height: height!, channels: 3, background: BONE } }).joinChannel(alpha, raw(1)).png().toBuffer();

  return sharp(png)
    .composite([
      { input: paper, tile: true, blend: 'over' },
      { input: wear, blend: 'over' },
    ])
    .png({ compressionLevel: 6 })
    .toBuffer();
}
