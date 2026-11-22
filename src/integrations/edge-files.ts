/*
  After every build, writes dist/_headers and dist/_redirects for Cloudflare
  Workers (src/lib/edge.ts, ADR 0027). It runs inside `astro build`, so every
  build has them: local, end to end, Lighthouse and the deploy.

  The CSP allows the inline stylesheet by its hash (ADR 0028), so the hashes
  come from every HTML file the build wrote.

  Build variables:
  - SITE_NOINDEX=true (staging) adds X-Robots-Tag: noindex to every response.
  - SITE_HSTS_MAX_AGE overrides the one-year HSTS, for the first day after launch.
*/
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { headerRules, headersFile, redirectsFile, SLASH_REDIRECTS, stubRedirects, styleHashes } from '../lib/edge.ts';
import { parseRedirectMap } from '../lib/redirects.ts';

/** Every HTML file in the build, for the inline stylesheets' hashes. */
function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [readFileSync(path, 'utf8')] : [];
  });
}

/** Every built show page, as its URL path and HTML. Alias stubs are among them. */
function showPages(dist: string) {
  const dir = join(dist, 'shows');
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .flatMap((name) => {
      const file = join(dir, name, 'index.html');
      try {
        return [{ path: `/shows/${name}/`, html: readFileSync(file, 'utf8') }];
      } catch {
        return [];
      }
    });
}

export default function edgeFiles(): AstroIntegration {
  return {
    name: 'edge-files',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const hsts = process.env.SITE_HSTS_MAX_AGE;
        const hashes = styleHashes(htmlFiles(dist));
        const rules = headerRules({ noindex: process.env.SITE_NOINDEX === 'true', hstsMaxAge: hsts ? Number(hsts) : undefined, styleHashes: hashes });
        writeFileSync(join(dist, '_headers'), headersFile(rules));

        const map = parseRedirectMap(readFileSync('docs/redirect-map.csv', 'utf8'));
        const aliases = stubRedirects(showPages(dist));
        writeFileSync(join(dist, '_redirects'), redirectsFile([...map, ...SLASH_REDIRECTS, ...aliases]));
        logger.info(`_headers: ${rules.length} rules, ${hashes.length} inline stylesheet hash${hashes.length === 1 ? '' : 'es'}. _redirects: ${map.length} from the redirect map, ${aliases.length} changed show slugs.`);
      },
    },
  };
}
