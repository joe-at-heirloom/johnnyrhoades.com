#!/usr/bin/env node
/*
  The facts-ledger rules (PLAN.md section 6.4), run by `npm run check`.

  1. facts.yaml, media.yaml and profiles.yaml are valid. Verified facts have
     a source URL; unverified ones say what they need and how to detect them.
  2. Every fact a page uses (src/lib/copy.ts) has a status that's allowed there.
  3. No source file outside facts.yaml states an unverified claim (its
     `detect` text), so nothing can sneak past the ledger in hand-written copy.

  Built pages get the same scan in tests/e2e/facts.spec.ts.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FACT_USES } from '../src/lib/copy.ts';
import { ledger, parseFacts } from '../src/lib/facts.ts';
import { parseMedia, parseProfiles } from '../src/lib/media.ts';

const problems: string[] = [];
const read = (path: string) => readFileSync(path, 'utf8');

let facts: ReturnType<typeof ledger> | null = null;
try {
  facts = ledger(parseFacts(read('src/data/facts.yaml')));
} catch (err) {
  problems.push(`facts.yaml: ${err instanceof Error ? err.message : String(err)}`);
}
for (const [file, parse] of [['src/data/media.yaml', parseMedia], ['src/data/profiles.yaml', parseProfiles]] as const) {
  try {
    parse(read(file));
  } catch (err) {
    problems.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (facts) {
  for (const use of FACT_USES) {
    for (const id of use.ids) {
      try {
        facts.get(id, use.context);
      } catch (err) {
        problems.push(`${use.where}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const sources = files('src').filter((f) => /\.(astro|ts|md|yaml|json)$/.test(f) && !f.endsWith('facts.yaml'));
  for (const fact of facts.unverified()) {
    const needle = fact.detect?.toLowerCase();
    if (!needle) continue;
    for (const file of sources) {
      if (read(file).toLowerCase().includes(needle)) {
        problems.push(`${relative('.', file)} states an unverified claim ("${fact.detect}", fact ${fact.id}). It stays off the site until resolved: ${fact.needs}`);
      }
    }
  }
}

if (problems.length) {
  console.error(`Facts ledger: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  const counts = facts ? Object.groupBy(facts.all, (f) => f.status) : {};
  console.log(
    `Facts ledger OK: ${facts?.all.length ?? 0} facts (${Object.entries(counts)
      .map(([k, v]) => `${v?.length} ${k}`)
      .join(', ')}), ${FACT_USES.reduce((n, u) => n + u.ids.length, 0)} uses checked.`,
  );
}
