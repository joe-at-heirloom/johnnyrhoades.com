/*
  Renders a poster to PNG: satori lays it out as SVG, resvg rasterizes it.
  No headless browser. Renders are cached on disk, keyed by a hash of the
  template version, the fonts, the format and the content that's on the
  poster, so unchanged shows never re-render (CI keeps .cache/posters
  between runs).
*/
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { posterContent, type PosterContent } from './content.ts';
import { DISPLAY_LADDER, loadFonts, measure } from './fonts.ts';
import type { PosterFormat } from './formats.ts';
import { duotone, pickPhoto, type PosterPhoto } from './duotone.ts';
import { hasPhotoSlot, layout, photoSize, posterElement, TEMPLATE_VERSION } from './template.ts';
import { cardElement, cardLayout } from './show-card.ts';
import { printFinish } from './print.ts';
import type { Show } from '../shows-schema.ts';

export const CACHE_DIR = join(process.cwd(), '.cache/posters');
const LOGO = join(process.cwd(), 'src/assets/brand/logo.png');

let logoUri: string | null = null;
const logo = () => (logoUri ??= `data:image/png;base64,${readFileSync(LOGO).toString('base64')}`);

export function cacheKey(content: PosterContent, format: PosterFormat, photo?: string): string {
  const photoHash = photo && hasPhotoSlot(format) ? createHash('sha256').update(readFileSync(photo)).digest('hex') : null;
  return createHash('sha256')
    .update(JSON.stringify([TEMPLATE_VERSION, loadFonts().hash, format.key, format.width, format.height, content, photoHash]))
    .digest('hex')
    .slice(0, 24);
}

export async function renderContent(content: PosterContent, format: PosterFormat, photo?: string): Promise<Buffer> {
  const fonts = loadFonts();
  const l = layout(content, format, measure, DISPLAY_LADDER);
  const photoUri = photo && hasPhotoSlot(format) ? await duotone(photo, photoSize(format)) : undefined;
  // satori's types expect React nodes; our element objects have the same shape.
  const svg = await satori(posterElement(content, format, l, logo(), photoUri) as unknown as Parameters<typeof satori>[0], {
    width: format.width,
    height: format.height,
    fonts: fonts.satori,
  });
  return new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng();
}

/** The show card (show-card.ts) as a PNG. */
export async function renderCardContent(content: PosterContent, format: PosterFormat): Promise<Buffer> {
  const fonts = loadFonts();
  const l = cardLayout(content, format, measure, DISPLAY_LADDER);
  const svg = await satori(cardElement(content, format, l) as unknown as Parameters<typeof satori>[0], {
    width: format.width,
    height: format.height,
    fonts: fonts.satori,
  });
  return printFinish(new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng());
}

/**
 * A show's poster in one format, from the cache when nothing on it has changed.
 * `photos` is the curated set (paths); the show's act picks from it.
 */
export async function renderPoster(show: Show, format: PosterFormat, { cache = true, photos = [] as PosterPhoto[] } = {}): Promise<Buffer> {
  const content = posterContent(show);
  const photo = pickPhoto(show.id, show.act, photos)?.file;
  const file = join(CACHE_DIR, `${cacheKey(content, format, photo)}.png`);
  if (cache && existsSync(file)) return readFileSync(file);
  const png = await renderContent(content, format, photo);
  if (cache) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, png);
  }
  return png;
}
