/*
  The two files Cloudflare Workers reads from the built site (ADR 0027).
  Both are written into dist/ after every build by src/integrations/edge-files.ts.

  - _headers: the security headers from src/lib/security-headers.ts on every
    response, a year's cache for content-hashed files, and noindex on staging.
  - _redirects: the old Bandzoogle URLs (docs/redirect-map.csv) and every changed
    show slug, as real 301s. Workers follows a redirect even where a file exists
    at that path, so the meta-refresh stubs Astro still builds for old slugs are
    only a fallback for other hosts.

  Pure, so the limits Cloudflare enforces (and would otherwise only report at
  deploy time) are checked by the unit tests.
*/
import { createHash } from 'node:crypto';
import { cspWithStyleHashes, SECURITY_HEADERS } from './security-headers.ts';

// docs/redirect-map.csv is read by src/lib/redirects.ts (parseRedirectMap), which also checks the live site after launch.

/** Cloudflare's limits for these files (Workers platform limits, static assets). */
export const LIMITS = { headerRules: 100, headerLine: 2000, staticRedirects: 2000, dynamicRedirects: 100, redirectLine: 1000 };

/** Default Cache-Control on Workers static assets: cache, but check for a new version every time (with the ETag). */
export const DEFAULT_CACHE = 'public, max-age=0, must-revalidate';
/** Files under /_astro/ carry a content hash in their names, so they can be cached for good. */
export const HASHED_CACHE = 'public, max-age=31536000, immutable';

type HeaderRule = { path: string; headers: Record<string, string> };

/**
 * The sha256 (base64) of every inline <style> in the given pages, for the CSP
 * (ADR 0028). A browser hashes the element's text exactly as written, so this
 * does too: no trimming.
 */
export function styleHashes(htmls: readonly string[]): string[] {
  const hashes = new Set<string>();
  for (const html of htmls) {
    for (const [, css] of html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)) {
      hashes.add(createHash('sha256').update(css!, 'utf8').digest('base64'));
    }
  }
  return [...hashes].sort();
}

/**
 * The header rules, in file order. Staging adds X-Robots-Tag on top of the
 * page-level noindex. `hstsMaxAge` overrides the one-year HSTS for the first
 * day after launch (docs/security-headers.md, "Rolling it out").
 */
export function headerRules({ noindex, hstsMaxAge, styleHashes = [] }: { noindex: boolean; hstsMaxAge?: number; styleHashes?: readonly string[] }): HeaderRule[] {
  const security: Record<string, string> = { ...SECURITY_HEADERS, 'Content-Security-Policy': cspWithStyleHashes(styleHashes) };
  if (hstsMaxAge !== undefined) {
    if (!Number.isInteger(hstsMaxAge) || hstsMaxAge < 0) throw new Error(`HSTS max-age must be a whole number of seconds, not ${hstsMaxAge}`);
    security['Strict-Transport-Security'] = security['Strict-Transport-Security']!.replace(/max-age=\d+/, `max-age=${hstsMaxAge}`);
  }
  return [
    { path: '/*', headers: { ...security, ...(noindex && { 'X-Robots-Tag': 'noindex' }) } },
    { path: '/_astro/*', headers: { 'Cache-Control': HASHED_CACHE } },
  ];
}

export function headersFile(rules: HeaderRule[]): string {
  if (rules.length > LIMITS.headerRules) throw new Error(`_headers has ${rules.length} rules; Cloudflare allows ${LIMITS.headerRules}`);
  const blocks = rules.map(({ path, headers }) => {
    const lines = [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)];
    for (const line of lines) {
      if (line.length > LIMITS.headerLine) throw new Error(`A _headers line is ${line.length} characters; Cloudflare allows ${LIMITS.headerLine}: ${line.slice(0, 60)}…`);
    }
    return lines.join('\n');
  });
  return `${blocks.join('\n\n')}\n`;
}

export type Redirect = { from: string; to: string; status: number };

/** The codes Cloudflare's _redirects accepts; anything else is a rewrite it doesn't support. */
const REDIRECT_CODES = [301, 302, 303, 307, 308];

const isDynamic = (r: Redirect) => /[*:]/.test(r.from);

/** Old show slugs, read back from the stub pages Astro built: each one's meta refresh names the new address. */
export function stubRedirects(stubs: { path: string; html: string }[]): Redirect[] {
  return stubs.flatMap(({ path, html }) => {
    const target = html.match(/<meta http-equiv="refresh" content="0; url=([^"]+)"/)?.[1];
    return target ? [{ from: path, to: target, status: 301 }] : [];
  });
}

/**
 * Pages people type without the trailing slash. Workers' own fix for those is a
 * 307 (temporary), so the likely ones get a permanent redirect instead.
 */
export const SLASH_REDIRECTS: Redirect[] = ['/epk', '/shows'].map((from) => ({ from, to: `${from}/`, status: 301 }));

export function redirectsFile(redirects: Redirect[]): string {
  const seen = new Set<string>();
  for (const r of redirects) {
    if (seen.has(r.from)) throw new Error(`Two redirects from ${r.from}`);
    seen.add(r.from);
    if (/\s/.test(r.from) || /\s/.test(r.to)) throw new Error(`Redirects can't contain spaces: ${r.from} → ${r.to}`);
    if (!REDIRECT_CODES.includes(r.status)) throw new Error(`${r.from}: ${r.status} isn't a redirect code Cloudflare accepts`);
  }
  // Cloudflare wants static rules before dynamic ones (splats and placeholders).
  const ordered = [...redirects.filter((r) => !isDynamic(r)), ...redirects.filter(isDynamic)];
  const statics = ordered.filter((r) => !isDynamic(r)).length;
  if (statics > LIMITS.staticRedirects) throw new Error(`${statics} static redirects; Cloudflare allows ${LIMITS.staticRedirects}`);
  if (ordered.length - statics > LIMITS.dynamicRedirects) throw new Error(`Too many dynamic redirects; Cloudflare allows ${LIMITS.dynamicRedirects}`);
  const lines = ordered.map((r) => `${r.from} ${r.to} ${r.status}`);
  for (const line of lines) if (line.length > LIMITS.redirectLine) throw new Error(`A redirect is over ${LIMITS.redirectLine} characters: ${line.slice(0, 60)}…`);
  return `${lines.join('\n')}\n`;
}

/** Reads a _headers file back into rules, for the test server and the CSP test (they serve what Cloudflare will). */
export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: {} });
      continue;
    }
    const rule = rules.at(-1);
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (!rule || !match) throw new Error(`Not a _headers line: ${line}`);
    rule.headers[match[1]!] = match[2]!;
  }
  return rules;
}

/**
 * The headers a static file gets on Workers: the default Cache-Control, then
 * every matching rule in order. Paths are exact, or end in `*` for a prefix.
 */
export function headersFor(path: string, rules: HeaderRule[]): Record<string, string> {
  const out: Record<string, string> = { 'Cache-Control': DEFAULT_CACHE };
  for (const rule of rules) {
    const matches = rule.path.endsWith('*') ? path.startsWith(rule.path.slice(0, -1)) : path === rule.path;
    if (matches) Object.assign(out, rule.headers);
  }
  return out;
}
