#!/usr/bin/env node
/*
  Check every row of docs/redirect-map.csv against the live site (PLAN.md
  section 14, step 12): each old URL must answer with a 301 to its target,
  and the target must load.

    npm run check:redirects                                   # https://johnnyrhoades.com
    npm run check:redirects -- --base https://new.johnnyrhoades.com

  Exits 1 if any row fails. Only meaningful once Cloudflare's redirect rules
  are in place; before cutover these URLs still belong to Bandzoogle.
*/
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parseRedirectMap, redirectMatches } from '../src/lib/redirects.ts';

const { values: args } = parseArgs({ options: { base: { type: 'string', default: 'https://johnnyrhoades.com' } } });
const rows = parseRedirectMap(await readFile('docs/redirect-map.csv', 'utf8'));

let failed = 0;
for (const row of rows) {
  const res = await fetch(new URL(row.from, args.base), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  const location = res.headers.get('location');
  let ok = redirectMatches(row, args.base, res.status, location);
  let detail = `${res.status} ${location ?? '(no Location)'}`;
  if (ok) {
    const target = await fetch(new URL(row.to, args.base), { signal: AbortSignal.timeout(15_000) });
    if (!target.ok) {
      ok = false;
      detail += `, but the target answered ${target.status}`;
    }
  }
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${row.from} → ${row.to}${ok ? '' : `  (got ${detail})`}`);
}
console.log(failed ? `\n${failed} of ${rows.length} redirects wrong.` : `\nAll ${rows.length} redirects correct.`);
process.exit(failed ? 1 : 0);
