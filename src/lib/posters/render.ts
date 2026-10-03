/*
  Renders a poster to PNG: satori lays the show card out as SVG, resvg
  rasterizes it, and sharp adds the print texture. No headless browser.
  Renders are cached on disk, keyed by a hash of the template version, the
  fonts, the textures, the format and the content that's on the poster, so
  unchanged shows never re-render (CI keeps .cache/posters between runs).
*/
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { posterContent, type PosterContent } from './content.ts';
import { DISPLAY_LADDER, loadFonts, measure } from './fonts.ts';
import { formatByKey, type PosterFormat } from './formats.ts';
import { printFinish, textureHash } from './print.ts';
import { cardElement, cardLayout, TEMPLATE_VERSION, type Element } from './show-card.ts';
import type { Show } from '../shows-schema.ts';

export const CACHE_DIR = join(process.cwd(), '.cache/posters');

export function cacheKey(content: PosterContent, format: PosterFormat): string {
  return createHash('sha256')
    .update(JSON.stringify([TEMPLATE_VERSION, loadFonts().hash, textureHash(), format.key, format.width, format.height, content]))
    .digest('hex')
    .slice(0, 24);
}

// satori's types expect React nodes; our element objects have the same shape.
const layOut = (element: Element, format: PosterFormat) =>
  satori(element as unknown as Parameters<typeof satori>[0], { width: format.width, height: format.height, fonts: loadFonts().satori });

export async function renderContent(content: PosterContent, format: PosterFormat): Promise<Buffer> {
  const svg = await layOut(cardElement(content, format, cardLayout(content, format, measure, DISPLAY_LADDER)), format);
  return printFinish(new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng());
}

/** A show's poster in one format, from the cache when nothing on it has changed. */
export async function renderPoster(show: Show, format: PosterFormat, { cache = true } = {}): Promise<Buffer> {
  const content = posterContent(show);
  const file = join(CACHE_DIR, `${cacheKey(content, format)}.png`);
  if (cache && existsSync(file)) return readFileSync(file);
  const png = await renderContent(content, format);
  if (cache) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, png);
  }
  return png;
}

const escapeAttr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The card as inline SVG for the show page: the poster on the page and the printed flyer.
 * The same layout as the `feed` PNG, with glyphs as paths: no fonts needed, sharp at any
 * print size, and about 15 KB gzipped against 170 KB for the textured PNG. The stock is
 * left transparent for the page's CSS to supply, and coordinates are rounded to a tenth
 * of a pixel, which halves the markup.
 */
export async function posterSvg(show: Show): Promise<string> {
  const content = posterContent(show);
  const format = formatByKey('feed')!;
  const svg = await layOut(cardElement(content, format, cardLayout(content, format, measure, DISPLAY_LADDER), { paper: 'transparent' }), format);
  return svg
    .replace(/(\d+\.\d)\d+/g, '$1')
    .replace(/^<svg width="\d+" height="\d+"/, `<svg class="poster" role="img" aria-label="${escapeAttr(content.alt)}"`);
}
