#!/usr/bin/env node
/*
  Tell the IndexNow engines (Bing, Yandex, Seznam, Naver...) which show pages
  are new or changed (PLAN.md section 6.2, step 9; src/lib/indexnow.ts).

    node scripts/indexnow.ts plan                   # before a deploy: compare the live /shows.json with dist/
    node scripts/indexnow.ts plan --before old.json # compare with a saved copy instead
    node scripts/indexnow.ts plan --all             # every sitemap URL (launch day)
    node scripts/indexnow.ts submit < urls.txt      # after the deploy: send them

  `plan` prints one URL per line, and in GitHub Actions also writes them to
  $GITHUB_OUTPUT as `urls`. `submit` reads stdin, or INDEXNOW_URLS when set.
  Staging builds (SITE_NOINDEX=true) plan nothing. A rejected ping is a
  warning, never a failed deploy.
*/
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { asSnapshot, changedUrls, INDEXNOW_ENDPOINT, indexNowBody, type ShowsSnapshot } from '../src/lib/indexnow.ts';
import { absolute, INDEXNOW_KEY, NOINDEX, SITE_HOST } from '../src/lib/site.ts';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dist: { type: 'string', default: 'dist' },
    before: { type: 'string' },
    all: { type: 'boolean', default: false },
  },
});

async function liveSnapshot(): Promise<ShowsSnapshot | null> {
  try {
    if (args.before) return asSnapshot(JSON.parse(await readFile(args.before, 'utf8')));
    const res = await fetch(absolute('/shows.json'), { signal: AbortSignal.timeout(15_000) });
    return res.ok ? asSnapshot(await res.json()) : null;
  } catch {
    return null; // not deployed yet, or the old site: treat everything as new
  }
}

async function plan(): Promise<string[]> {
  if (NOINDEX) return [];
  const sitemap = await readFile(join(args.dist, 'sitemap-0.xml'), 'utf8');
  const all = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
  if (args.all) return all;
  const built = asSnapshot(JSON.parse(await readFile(join(args.dist, 'shows.json'), 'utf8')));
  if (!built) throw new Error(`${args.dist}/shows.json isn't a shows snapshot`);
  return changedUrls(await liveSnapshot(), built, [absolute('/'), absolute('/shows/')], all);
}

async function submit(urls: string[]): Promise<void> {
  if (!urls.length) {
    console.log('IndexNow: nothing changed, nothing to send.');
    return;
  }
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(indexNowBody(urls, { host: SITE_HOST, key: INDEXNOW_KEY })),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 200 || res.status === 202) {
      console.log(`IndexNow: sent ${urls.length} URL${urls.length === 1 ? '' : 's'} (${res.status}).`);
    } else {
      console.log(`::warning title=IndexNow::Rejected with ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`::warning title=IndexNow::Couldn't reach IndexNow: ${(err as Error).message}`);
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

// Only this site's URLs: IndexNow rejects the whole batch over one stray line.
const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith(absolute('/')));

const mode = positionals[0];
if (mode === 'plan') {
  const urls = await plan();
  if (urls.length) console.log(urls.join('\n'));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `urls<<URLS\n${urls.join('\n')}\nURLS\n`);
} else if (mode === 'submit') {
  await submit(lines(process.env.INDEXNOW_URLS ?? (await readStdin())));
} else {
  console.error('Usage: node scripts/indexnow.ts plan [--before file] [--all] | submit');
  process.exit(2);
}
