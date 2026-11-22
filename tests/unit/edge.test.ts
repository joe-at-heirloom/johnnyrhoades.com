/* The files Cloudflare Workers reads from the build: _headers and _redirects (src/lib/edge.ts, ADR 0027). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CACHE,
  HASHED_CACHE,
  LIMITS,
  headerRules,
  headersFile,
  headersFor,
  parseHeadersFile,
  redirectsFile,
  SLASH_REDIRECTS,
  stubRedirects,
  type Redirect,
} from '../../src/lib/edge.ts';
import { parseRedirectMap } from '../../src/lib/redirects.ts';
import { SECURITY_HEADERS } from '../../src/lib/security-headers.ts';

describe('_headers', () => {
  const file = headersFile(headerRules({ noindex: false }));
  const rules = parseHeadersFile(file);

  it('puts every security header on every response', () => {
    for (const path of ['/', '/shows/some-show/', '/posters/x/og.png', '/_astro/app.js']) {
      const headers = headersFor(path, rules);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(headers[name], `${name} on ${path}`).toBe(value);
    }
  });

  it('caches content-hashed files for a year and everything else only until it changes', () => {
    expect(headersFor('/_astro/BaseLayout.abc123.css', rules)['Cache-Control']).toBe(HASHED_CACHE);
    expect(headersFor('/', rules)['Cache-Control']).toBe(DEFAULT_CACHE);
    expect(headersFor('/posters/2026-10-23-blue-goose-inn-st-clair-shores/og.png', rules)['Cache-Control']).toBe(DEFAULT_CACHE);
  });

  it('marks staging noindex, and only staging', () => {
    expect(headersFor('/', rules)['X-Robots-Tag']).toBeUndefined();
    expect(headersFor('/', parseHeadersFile(headersFile(headerRules({ noindex: true }))))['X-Robots-Tag']).toBe('noindex');
  });

  it('can start HSTS short on launch day', () => {
    const short = headersFor('/', parseHeadersFile(headersFile(headerRules({ noindex: false, hstsMaxAge: 300 }))));
    expect(short['Strict-Transport-Security']).toBe('max-age=300; includeSubDomains');
    expect(() => headerRules({ noindex: false, hstsMaxAge: Number('soon') })).toThrow(/whole number/);
  });

  it('stays inside Cloudflare’s limits', () => {
    expect(rules.length).toBeLessThanOrEqual(LIMITS.headerRules);
    for (const line of file.split('\n')) expect(line.length).toBeLessThanOrEqual(LIMITS.headerLine);
    expect(() => headersFile([{ path: '/*', headers: { 'X-Long': 'x'.repeat(LIMITS.headerLine) } }])).toThrow(/characters/);
  });
});

describe('_redirects', () => {
  const map: Redirect[] = parseRedirectMap(readFileSync('docs/redirect-map.csv', 'utf8'));

  it('reads old show slugs back from the stub pages', () => {
    const stub = '<html><head><meta name="robots" content="noindex" /><meta http-equiv="refresh" content="0; url=/shows/2026-10-24-new/" /></head></html>';
    const page = '<html><head><title>A show</title></head></html>';
    expect(
      stubRedirects([
        { path: '/shows/2026-10-24-old/', html: stub },
        { path: '/shows/2026-10-24-new/', html: page },
      ]),
    ).toEqual([{ from: '/shows/2026-10-24-old/', to: '/shows/2026-10-24-new/', status: 301 }]);
  });

  it('writes static rules before the splat, all permanent', () => {
    const lines = redirectsFile([...map, ...SLASH_REDIRECTS]).trim().split('\n');
    expect(lines.at(-1)).toBe('/track/* /#music 301');
    expect(lines).toContain('/epk /epk/ 301');
    expect(lines.every((l) => l.endsWith(' 301'))).toBe(true);
  });

  it('refuses what Cloudflare would ignore or reject', () => {
    const r = (from: string, to = '/'): Redirect => ({ from, to, status: 301 });
    expect(() => redirectsFile([r('/a'), r('/a', '/b/')])).toThrow(/Two redirects from \/a/);
    expect(() => redirectsFile([r('/a b')])).toThrow(/spaces/);
    expect(() => redirectsFile([{ from: '/a', to: '/b/', status: 200 }])).toThrow(/redirect code/);
    expect(() => redirectsFile([r(`/${'x'.repeat(LIMITS.redirectLine)}`)])).toThrow(/characters/);
    expect(() => redirectsFile(Array.from({ length: LIMITS.staticRedirects + 1 }, (_, i) => r(`/old-${i}`)))).toThrow(/static redirects/);
  });
});
