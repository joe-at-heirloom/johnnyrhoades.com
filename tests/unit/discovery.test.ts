/*
  Phase 6: what crawlers and answer engines read (sitemap, robots.txt,
  llms.txt), the IndexNow change detection, and the security headers.
*/
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LLMS_ABOUT } from '../../src/lib/copy.ts';
import { AI_CRAWLERS, llmsTxt, robotsTxt, sitemapEntries, sitemapIndexXml, sitemapXml } from '../../src/lib/discovery.ts';
import { ledger, parseFacts } from '../../src/lib/facts.ts';
import { asSnapshot, changedUrls, indexNowBody, type ShowsSnapshot } from '../../src/lib/indexnow.ts';
import { CSP, CSP_DIRECTIVES, PERMISSIONS_POLICY, SECURITY_HEADERS } from '../../src/lib/security-headers.ts';
import { parseShowsFile } from '../../src/lib/shows-file.ts';
import type { Show } from '../../src/lib/shows-schema.ts';
import { at } from './helpers.ts';

const shows = parseShowsFile(readFileSync('src/data/shows.json', 'utf8'));
const NOW = at('2026-10-01T12:00:00-04:00');
const bySlug = (slug: string) => shows.find((s) => s.slug === slug)!;

describe('sitemap', () => {
  const entries = sitemapEntries(shows, NOW);
  const locs = entries.map((e) => e.loc);

  it('lists home, /shows/ and /epk/ first, and never /thanks/ or the 404 page', () => {
    expect(locs.slice(0, 3)).toEqual(['https://johnnyrhoades.com/', 'https://johnnyrhoades.com/shows/', 'https://johnnyrhoades.com/epk/']);
    expect(locs.some((l) => /thanks|404/.test(l))).toBe(false);
  });

  it('lists show pages until 30 days after the show, with lastmod from updatedAt', () => {
    const indexable = (s: Show) => s.public && s.start >= '2026-09-01' && at(s.start).plus({ days: 30 }) > NOW;
    const expected = shows.filter(indexable).map((s) => `https://johnnyrhoades.com/shows/${s.slug}/`);
    expect(locs.slice(3).sort()).toEqual(expected.sort());
    for (const e of entries.slice(3)) {
      const show = shows.find((s) => e.loc.endsWith(`/${s.slug}/`))!;
      expect(e.lastmod).toBe(show.updatedAt);
    }
  });

  it('drops a show page once it is more than 30 days old, and never lists aliases or private shows', () => {
    const first = entries[3]!;
    const show = shows.find((s) => first.loc.endsWith(`/${s.slug}/`))!;
    const later = at(show.start).plus({ days: 31 });
    expect(sitemapEntries(shows, later).map((e) => e.loc)).not.toContain(first.loc);
    const aliases = shows.flatMap((s) => s.aliases);
    expect(locs.some((l) => aliases.some((a) => l.includes(a)))).toBe(false);
    const hidden = { ...bySlug(first.loc.split('/').at(-2)!), public: false };
    expect(sitemapEntries([hidden], NOW).map((e) => e.loc)).toHaveLength(3);
  });

  it('writes valid sitemap XML and a sitemap index', () => {
    const xml = sitemapXml([{ loc: 'https://johnnyrhoades.com/?a=1&b=2', lastmod: '2026-10-01T12:00:00-04:00' }]);
    expect(xml).toContain('<loc>https://johnnyrhoades.com/?a=1&amp;b=2</loc>');
    expect(xml).toContain('<lastmod>2026-10-01T12:00:00-04:00</lastmod>');
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
    expect(sitemapIndexXml(['https://johnnyrhoades.com/sitemap-0.xml'])).toContain('<sitemap>\n    <loc>https://johnnyrhoades.com/sitemap-0.xml</loc>');
  });
});

describe('robots.txt', () => {
  it('allows everyone, names the AI crawlers, and points to the sitemap', () => {
    const txt = robotsTxt({ sitemap: 'https://johnnyrhoades.com/sitemap-index.xml', noindex: false });
    expect(txt).toContain('User-agent: *\nAllow: /');
    for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) expect(AI_CRAWLERS).toContain(bot);
    for (const bot of AI_CRAWLERS) expect(txt).toContain(`User-agent: ${bot}\n`);
    expect(txt).not.toMatch(/Disallow/);
    expect(txt.trim().split('\n').at(-1)).toBe('Sitemap: https://johnnyrhoades.com/sitemap-index.xml');
  });

  it('leaves the sitemap out of a staging build', () => {
    expect(robotsTxt({ sitemap: 'x', noindex: true })).not.toContain('Sitemap:');
  });
});

describe('llms.txt', () => {
  const facts = ledger(parseFacts(readFileSync('src/data/facts.yaml', 'utf8')));
  const about = LLMS_ABOUT.map((id) => facts.third(id, 'epk'));
  const txt = llmsTxt({ about, shows, now: NOW, links: [{ name: 'Bandsintown', url: 'https://www.bandsintown.com/a/11869348' }] });

  it('follows the llmstxt.org shape: a title, a summary line, then sections', () => {
    expect(txt.startsWith('# Johnny Rhoades\n\n> Johnny Rhoades is a blues guitarist and singer from Detroit, Michigan.\n')).toBe(true);
    for (const h of ['## Pages', '## Upcoming shows', '## Data', '## Booking', '## Profiles and music']) expect(txt).toContain(`\n${h}\n`);
  });

  it('says only what the press kit may say', () => {
    for (const sentence of about) expect(txt).toContain(sentence);
    for (const f of parseFacts(readFileSync('src/data/facts.yaml', 'utf8')).filter((f) => f.status === 'unverified')) {
      expect(txt).not.toContain(f.third);
    }
  });

  it('lists the next shows with dates in the venue’s time zone, and links to the canonical pages', () => {
    expect(txt).toContain('- [Fri, Oct 23, 2026, 9 pm: Johnny Rhoades at Blue Goose Inn, St. Clair Shores, MI](https://johnnyrhoades.com/shows/2026-10-23-blue-goose-inn-st-clair-shores/)');
    expect(txt).toContain('- [Press kit](https://johnnyrhoades.com/epk/)');
    expect(txt).toContain('(https://johnnyrhoades.com/shows.json)');
    const quiet = llmsTxt({ about, shows: [], now: NOW, links: [] });
    expect(quiet).toContain('No public shows are announced right now.');
  });
});

describe('IndexNow', () => {
  const snap = (upcoming: object[], past: object[] = []) => ({ upcoming, past }) as ShowsSnapshot;
  const a = { id: '1', url: 'https://johnnyrhoades.com/shows/a/', start: '2026-10-02T18:00:00-04:00' };
  const b = { id: '2', url: 'https://johnnyrhoades.com/shows/b/', start: '2026-10-04T18:00:00-04:00' };
  const lists = ['https://johnnyrhoades.com/', 'https://johnnyrhoades.com/shows/'];

  it('sends nothing when nothing changed, including a show moving from upcoming to past', () => {
    expect(changedUrls(snap([a, b]), snap([a, b]), lists, [])).toEqual([]);
    expect(changedUrls(snap([a, b]), snap([b], [a]), lists, [])).toEqual([]);
  });

  it('sends new and changed shows, plus the pages that list them', () => {
    const moved = { ...b, start: '2026-10-04T19:00:00-04:00' };
    const c = { id: '3', url: 'https://johnnyrhoades.com/shows/c/' };
    expect(changedUrls(snap([a, b]), snap([a, moved, c]), lists, [])).toEqual([b.url, c.url, ...lists]);
  });

  it('sends a show that was taken down, so engines drop it', () => {
    expect(changedUrls(snap([a, b]), snap([a]), lists, [])).toEqual([b.url, ...lists]);
  });

  it('skips shows without a page, and sends the whole sitemap the first time', () => {
    const noPage = { id: '4', url: null };
    expect(changedUrls(snap([]), snap([noPage]), lists, [])).toEqual([]);
    expect(changedUrls(null, snap([a]), lists, ['x', 'y', 'x'])).toEqual(['x', 'y']);
  });

  it('treats anything that isn’t a shows snapshot (the old site, a 404) as no snapshot', () => {
    expect(asSnapshot('<html>')).toBeNull();
    expect(asSnapshot({ upcoming: [] })).toBeNull();
    expect(asSnapshot({ upcoming: [], past: [] })).toEqual({ upcoming: [], past: [] });
  });

  it('builds the request body with the key file location, and the key file matches', () => {
    expect(indexNowBody(['u'], { host: 'johnnyrhoades.com', key: 'k' })).toEqual({
      host: 'johnnyrhoades.com',
      key: 'k',
      keyLocation: 'https://johnnyrhoades.com/k.txt',
      urlList: ['u'],
    });
    const key = readFileSync('src/lib/site.ts', 'utf8').match(/INDEXNOW_KEY = '([0-9a-f]+)'/)![1]!;
    expect(readFileSync(`public/${key}.txt`, 'utf8')).toBe(key);
  });
});

describe('security headers', () => {
  it('allow only what the site uses', () => {
    expect(CSP_DIRECTIVES['script-src']).toEqual(["'self'", 'https://cloud.umami.is']);
    expect(CSP).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(CSP).toContain("frame-src https://www.youtube-nocookie.com");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toContain("frame-ancestors 'none'");
  });

  it('let the YouTube player have exactly what its iframe asks for', () => {
    const allow = readFileSync('src/scripts/video-stage.ts', 'utf8').match(/iframe\.allow = '([^']+)'/)![1]!;
    for (const feature of allow.split(';').map((f) => f.trim())) {
      expect(PERMISSIONS_POLICY).toContain(`${feature}=(self "https://www.youtube-nocookie.com")`);
    }
    expect(PERMISSIONS_POLICY).toContain('camera=()');
  });

  it('are quoted exactly in the Cloudflare doc', () => {
    const doc = readFileSync('docs/security-headers.md', 'utf8');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(doc).toContain(`| \`${name}\` | \`${value}\` |`);
  });
});
