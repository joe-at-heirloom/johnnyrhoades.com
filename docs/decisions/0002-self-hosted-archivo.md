# 0002: Self-host Archivo instead of loading Google Fonts

**Status:** Accepted, 2026-09-30 (Phase 0)

## Context

v1 loaded Archivo from Google Fonts. That adds two extra connections (`fonts.googleapis.com`, `fonts.gstatic.com`) to the critical path and blocks a strict Content-Security-Policy (PLAN.md section 2).

## Decision

Self-host the exact WOFF2 files Google Fonts serves for the Latin subset, in `src/assets/fonts/`:

- `archivo-normal-latin.woff2` (88 KB): the variable font, weight 400–900 and width 62–125%. Used for everything.
- `archivo-italic-latin.woff2` (15 KB): regular italic only, for `<cite>`.

The `@font-face` rules in `src/styles/fonts.css` keep Google's `unicode-range`. Vite fingerprints the files, and the layout preloads the normal face.

Using the same files Google serves means rendering is identical to v1. The parity test confirms it.

## Consequences

- No third-party requests for fonts. A test checks that no request goes to Google Fonts.
- First paint on mobile Lighthouse dropped from 4.1 s to 1.4 s, mostly from this change.
- Characters outside the Latin subset fall back to system fonts, as they did in v1: ✦, ⅓ on the record label, and → in text links. Latin Extended can be added later if a venue or name needs it.
- The poster engine (Phase 3) can't use these files. Satori needs static TTF/OTF/WOFF instances, which get generated separately into `src/assets/fonts/poster/`.
