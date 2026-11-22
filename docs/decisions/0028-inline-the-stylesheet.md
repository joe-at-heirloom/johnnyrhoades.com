# 0028: Inline the stylesheet, allowed by its hash

**Status:** Accepted, 2026-11-22. Takes up the option ADR 0026 set aside, which ADR 0027 made possible.

## Context

Every page loads one stylesheet, `BaseLayout.css`: 38 KB, about 10 KB compressed. As a `<link>`, it blocks the first paint until it arrives. Inlining it means one less request before the page can draw. The CSP blocked that: `style-src 'self'` allows no inline `<style>`. Allowing it by hash meant hand-editing a Cloudflare dashboard rule on every CSS change, until ADR 0027 moved the headers into a file the build writes.

## Decision

- `build.inlineStylesheets: 'always'` in `astro.config.mjs`. Each page carries the stylesheet in one `<style>` element.
- After the build, `src/lib/edge.ts` hashes every `<style>` in every HTML file (sha256, base64, the text exactly as written). It adds each distinct hash to `style-src` in `dist/_headers` (`cspWithStyleHashes` in `src/lib/security-headers.ts`). Today that's one hash.
- No `'unsafe-inline'`. An injected `<style>` or `style=` attribute is still blocked.
- Scripts stay external (`assetsInlineLimit: 0`), as before.

## Consequences

Lighthouse CI, mobile, median of 3, over HTTP/2:

| Page | FCP before → after | LCP before → after |
|---|---|---|
| Home | 1050 → 1043 ms | 1800 → 1726 ms |
| Press kit | 1080 → 982 ms | 1905 → 1605 ms |
| Show page | 940 → 941 ms | 1455 → 1455 ms |

Performance, accessibility, best practices and SEO are 100 on all three. The gain is smaller than the 455 ms Lighthouse once estimated, because that estimate was made over HTTP/1.1 (ADR 0026), where every request queued.

- **The trade:** the styles no longer cache across pages, so each page's HTML is about 10 KB (compressed) heavier. That's fine for a site where most visits are one or two pages, and first visits get faster.
- **The hash can't go stale:** it's computed from the files the build just wrote. The CSP end-to-end test loads every page under the served policy, so a mismatch would show as a violation, and another test fails if any built page has a `<style>` the policy doesn't allow.
