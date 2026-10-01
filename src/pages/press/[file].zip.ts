/*
  /press/johnny-rhoades-press-photos.zip: full-resolution press photos.
  Only photos marked `press` in media.yaml, which requires a confirmed credit
  and license. Until there are any, no zip is built and the press kit says
  photos are available on request.
*/
import type { APIRoute, GetStaticPaths } from 'astro';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { media } from '../../lib/load-content';
import { PRESS_ZIP } from '../../lib/site';

const pressPhotos = () => media.photos.filter((p) => p.use.includes('press'));

export const getStaticPaths = (() => (pressPhotos().length ? [{ params: { file: PRESS_ZIP } }] : [])) satisfies GetStaticPaths;

export const GET: APIRoute = () => {
  const files: Record<string, Uint8Array> = {};
  const credits: string[] = [];
  for (const p of pressPhotos()) {
    const name = `johnny-rhoades-${basename(p.file)}`;
    files[name] = readFileSync(join(process.cwd(), 'src/assets', p.file));
    credits.push(`${name}: ${p.alt}. Photo: ${p.credit}. ${p.license}.`);
  }
  files['CREDITS.txt'] = strToU8(`Johnny Rhoades press photos\n\n${credits.join('\n')}\n`);
  return new Response(zipSync(files, { level: 0 }), { headers: { 'Content-Type': 'application/zip' } });
};
