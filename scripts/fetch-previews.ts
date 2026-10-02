#!/usr/bin/env node
/*
  Refresh the Apple Music preview URLs in src/data/media.yaml from the public
  iTunes lookup API (ADR 0016). Apple sometimes moves the files, so run this
  if a clip stops playing.

    npm run previews            # update media.yaml
    npm run previews -- --check # only check the current URLs still load (exits 1 if not)
*/
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parseMedia } from '../src/lib/media.ts';
import { APPLE_PREVIEW_HOST, appleAlbumId, previewsFromLookup, setPreviews } from '../src/lib/previews.ts';

const FILE = 'src/data/media.yaml';
const { values: args } = parseArgs({ options: { check: { type: 'boolean', default: false } } });
const yaml = await readFile(FILE, 'utf8');
const media = parseMedia(yaml);

if (args.check) {
  let broken = 0;
  for (const t of media.album.tracks) {
    if (!t.preview?.startsWith(APPLE_PREVIEW_HOST)) continue;
    const res = await fetch(t.preview, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) broken++;
    console.log(`${res.ok ? '✓' : '✗'} ${t.title} (${res.status})`);
  }
  if (broken) console.log(`\n${broken} preview${broken === 1 ? '' : 's'} broken. Run npm run previews to refresh.`);
  process.exit(broken ? 1 : 0);
}

const id = appleAlbumId(media.album.appleMusic);
if (!id) throw new Error(`No album id in ${media.album.appleMusic}`);
const res = await fetch(`https://itunes.apple.com/lookup?id=${id}&entity=song&country=us`, { signal: AbortSignal.timeout(15_000) });
if (!res.ok) throw new Error(`iTunes lookup answered ${res.status}`);
const previews = previewsFromLookup(await res.json());
const updated = setPreviews(yaml, previews);
parseMedia(updated); // still valid
const missing = media.album.tracks.filter((t) => !previews.has(t.appleId)).map((t) => t.title);
if (updated !== yaml) await writeFile(FILE, updated);
console.log(`${previews.size} previews found${missing.length ? `; none for ${missing.join(', ')}` : ''}. ${updated === yaml ? 'No change.' : `Updated ${FILE}.`}`);
