/*
  Phase 6: the sitemap, robots.txt and llms.txt as served, checked against
  the pages themselves, plus every internal link in the build. Reads dist/,
  which the test server builds with the pinned SITE_NOW.
*/
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { parseRedirectMap } from '../../src/lib/redirects';

const ORIGIN = 'https://johnnyrhoades.com';

function builtPages(): string[] {
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html')) pages.push(path);
    }
  };
  walk('dist');
  return pages;
}

/** dist/shows/x/index.html → /shows/x/ */
const urlPath = (file: string) => `/${file.replace(/^dist\//, '').replace(/index\.html$/, '')}`;
const robotsMeta = (html: string) => html.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? '';

test('the sitemap lists exactly the indexable pages, each with a matching canonical', async ({ request }) => {
  const index = await (await request.get('/sitemap-index.xml')).text();
  expect(index).toContain(`<loc>${ORIGIN}/sitemap-0.xml</loc>`);
  const res = await request.get('/sitemap-0.xml');
  expect(res.headers()['content-type']).toMatch(/xml/);
  const listed = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replace(ORIGIN, ''));

  const indexable = builtPages()
    .filter((file) => !robotsMeta(readFileSync(file, 'utf8')).includes('noindex'))
    .map(urlPath);
  expect(listed.sort()).toEqual(indexable.sort());

  for (const path of listed) {
    const html = readFileSync(join('dist', path, 'index.html'), 'utf8');
    expect(html, path).toContain(`<link rel="canonical" href="${ORIGIN}${path}"`);
  }
  expect(listed).not.toContain('/thanks/');
});

test('robots.txt allows crawling and points to the sitemap; llms.txt and the IndexNow key are served', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('User-agent: *\nAllow: /');
  expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap-index.xml`);

  const llms = await request.get('/llms.txt');
  expect(llms.ok()).toBe(true);
  const text = await llms.text();
  expect(text).toMatch(/^# Johnny Rhoades\n\n> /);
  for (const [, url] of text.matchAll(/\]\((https:\/\/johnnyrhoades\.com[^)]*)\)/g)) {
    const path = url!.replace(ORIGIN, '').replace(/#.*$/, '');
    expect(existsSync(join('dist', path.endsWith('/') ? `${path}index.html` : path)), path).toBe(true);
  }

  const key = readFileSync('src/lib/site.ts', 'utf8').match(/INDEXNOW_KEY = '([0-9a-f]+)'/)![1]!;
  expect(await (await request.get(`/${key}.txt`)).text()).toBe(key);
});

test('every internal link, image, script and stylesheet in the build resolves', () => {
  const missing = new Set<string>();
  for (const file of builtPages()) {
    const html = readFileSync(file, 'utf8');
    const refs = [
      ...[...html.matchAll(/\s(?:href|src|action|poster)="([^"]+)"/g)].map((m) => m[1]!),
      ...[...html.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) => m[1]!.split(',').map((part) => part.trim().split(/\s+/)[0]!)),
    ];
    for (const ref of refs) {
      const url = new URL(ref.replaceAll('&amp;', '&'), `${ORIGIN}${urlPath(file)}`);
      if (url.origin !== ORIGIN) continue;
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';
      if (!existsSync(join('dist', path))) missing.add(`${urlPath(file)} → ${ref}`);
    }
  }
  expect([...missing]).toEqual([]);
});

test('every redirect target in the map exists, down to the section it points at', () => {
  for (const row of parseRedirectMap(readFileSync('docs/redirect-map.csv', 'utf8'))) {
    const url = new URL(row.to, ORIGIN);
    const file = join('dist', url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname);
    expect(existsSync(file), row.to).toBe(true);
    if (url.hash) expect(readFileSync(file, 'utf8'), row.to).toContain(`id="${url.hash.slice(1)}"`);
  }
});
