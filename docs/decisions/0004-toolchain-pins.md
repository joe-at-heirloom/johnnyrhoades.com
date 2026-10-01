# 0004: Require npm 11 and pin TypeScript 6

**Status:** Accepted, 2026-09-30 (Phase 0)

## Context

Two surprises while setting up the toolchain:

1. **npm 10.9 can't install this dependency tree.** `npm install` crashes inside Arborist (`Cannot read properties of null (reading 'edgesOut')` in `#loadPeerSet`) while resolving vitest 5's optional peers. A clean `node_modules` and lockfile don't help. npm 11 installs it cleanly.
2. **`@astrojs/check` doesn't support TypeScript 7** (the native port) yet. Its peer range is `^5 || ^6`, and `npm view typescript` now returns 7.

## Decision

- `package.json` `engines` requires Node ≥ 22.12 (Astro 7's minimum) and npm ≥ 11. CI uses Node 24, which ships npm 11 (`site.yml`).
- Pin `typescript` to `^6`. Revisit when `@astrojs/check` supports 7.

## Consequences

- On a machine with Node 22 or 23 and npm 10, run `npx npm@11 install`, or upgrade npm.
- npm 11 also flags `esbuild`'s install script as not yet allowed (`allowScripts`). It's harmless: esbuild ships its binary as a platform package, and the build works without the script.
