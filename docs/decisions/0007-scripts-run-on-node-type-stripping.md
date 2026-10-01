# 0007: Run TypeScript scripts with Node's built-in type stripping

**Status:** Accepted, 2026-09-30 (Phase 1)

## Context

`scripts/sync-shows.ts` runs in CI every three hours and imports the same `src/lib/` code the site uses. The usual options are a runner such as `tsx`, or compiling first. Node 22.6+ can strip TypeScript types itself (`--experimental-strip-types`), and from Node 23.6 it does so by default.

## Decision

- Scripts run with `node --experimental-strip-types --disable-warning=ExperimentalWarning`. The flag is required on Node 22 and harmless on 23 and 24.
- Relative imports in `src/lib/` use explicit `.ts` extensions. Node requires them; Vite and TypeScript accept them (`allowImportingTsExtensions` is on in Astro's base config).
- `tsconfig.json` sets `erasableSyntaxOnly`, so TypeScript rejects anything Node can't strip, such as `enum`, `namespace` or parameter properties.

## Consequences

- No runner dependency and no build step for scripts. The code CI runs is exactly the code in the repo.
- The sync integration test (`tests/unit/sync-script.test.ts`) runs the script the same way CI does.
