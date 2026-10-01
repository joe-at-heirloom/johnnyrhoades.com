/*
  Duotone photos for posters (PLAN.md section 4.1): grayscale, then mapped
  from the poster's black to its red, so any photo sits in the palette.
  The photo is picked deterministically per show, so a show always gets
  the same image.
*/
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Act } from '../shows-schema.ts';

export type PosterPhoto = { file: string; acts: Act[] | 'all' };

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];

/** Same show, same photo: picks by hashing the show id. Null when no photo fits the act. */
export function pickPhoto(showId: string, act: Act, photos: PosterPhoto[]): PosterPhoto | null {
  const pool = photos.filter((p) => p.acts === 'all' || p.acts.includes(act));
  if (pool.length === 0) return null;
  const n = createHash('sha256').update(showId).digest().readUInt32BE(0);
  return pool[n % pool.length] ?? null;
}

// The same photo at the same size is reused across many shows' posters; process it once per build.
const memo = new Map<string, Promise<string>>();

/** Grayscale → a ramp from `dark` to `light`, as a JPEG data URI sized for the poster. Memoized for file inputs. */
export function duotone(input: string | Buffer, opts: Parameters<typeof duotoneUncached>[1]): Promise<string> {
  if (typeof input !== 'string') return duotoneUncached(input, opts);
  const key = JSON.stringify([input, opts]);
  let result = memo.get(key);
  if (!result) {
    result = duotoneUncached(input, opts);
    memo.set(key, result);
  }
  return result;
}

async function duotoneUncached(
  input: string | Buffer,
  { width, height, dark = '#0d0b0a', light = '#c02e28', position = 'attention' }: { width: number; height: number; dark?: string; light?: string; position?: string },
): Promise<string> {
  const { data, info } = await sharp(input)
    .resize(width, height, { fit: 'cover', position: position as 'attention' })
    .grayscale()
    .normalise()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [d, l] = [hex(dark), hex(light)];
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const t = (data[i * info.channels] ?? 0) / 255;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(d[c]! + (l[c]! - d[c]!) * t);
  }
  const jpeg = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}
