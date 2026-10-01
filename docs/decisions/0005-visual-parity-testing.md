# 0005: How visual parity with v1 is measured

**Status:** Retired in Phase 2 (2026-09-30), after doing its job in Phase 0. See ADR 0008.

## Context

Phase 0's acceptance requires screenshots that match `reference/v1/` at 390, 768 and 1440 px within a small tolerance. A naive full-page diff fails for reasons that aren't regressions:

- **Live data.** The Bandsintown widget renders whatever shows exist that day.
- **Motion.** The hero fades in, the record spins, and the strings do one silent strum.
- **Photos are re-encoded on purpose.** Astro's image pipeline (sharp) resizes from full-size masters, while v1's images came from Pillow. Edges sharpen slightly differently. That alone was 1–2.6% of all pixels.

## Decision

`tests/e2e/parity.spec.ts` serves v1 with a tiny static server (`scripts/serve-static.mjs`) next to `astro preview`, then for each width:

1. Blocks the Bandsintown widget and YouTube on both pages.
2. Emulates `prefers-reduced-motion: reduce`, so both pages render at rest.
3. Scrolls through the page so lazy images and the strum load, then returns to the top and waits for images and fonts.
4. Masks every photo with a flat gray box. The boxes are painted where each photo sits, so a photo that moves or changes size still counts as a difference.
5. Compares with pixelmatch (perceptual threshold 0.1) and fails if more than **0.2%** of pixels differ, or if the page height differs by more than 4 px.

The v1, v2 and diff images are written to `test-results/` on every run.

## What it caught

The first masked run still differed by 0.2–0.7%. These were sub-pixel text shifts, and the cause was image *dimensions*, not pixels. Two image masters had been capped at 1600–2400px before resizing, so `dueling-guitars` rendered 700×466 instead of v1's 700×467, and the portrait's aspect ratio moved in the fourth decimal. Everything below shifted by a fraction of a pixel. Rebuilding those masters from the originals brought the diff to **0.000%** at all three widths, with identical page heights.

## Consequences

- Rule for future image work: a master's resized output must keep the dimensions the layout was designed against. The parity test catches it if not.
- Once Phase 2 changes the page on purpose, this test retires. From then on, Playwright screenshot baselines of the new design take over.
