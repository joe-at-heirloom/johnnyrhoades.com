# 0009: The poster engine

**Status:** Accepted, 2026-09-30 (Phase 3). The look (the bill, venue as the hero) and the duotone photo slot are superseded by ADR 0017, the show card. The engine stands.

## Context

Every public show gets typographic gig posters in six formats, rendered at build time (PLAN.md section 4.1). They serve as link previews, as the three `MusicEvent` image ratios Google asks for, and as Instagram posts and Stories. A printable flyer comes from the show page.

## Decisions

- **satori + resvg, no browser.** satori lays out the poster as SVG, and resvg (Rust, deterministic) turns it into a PNG. Templates are **plain element objects** built with a three-line `h()` helper instead of JSX, so there's no React or JSX toolchain in a site that otherwise has none. PLAN.md section 4.1 has been updated to match.
- **Static font cuts, kerning only.** `scripts/make-poster-fonts.py` cuts eight static instances from Google's variable Archivo (pinned commit, SHA-256 checked) with fonttools. They're subset to Latin and keep only the `kern` feature. opentype.js, which measures the text, can't read some of Archivo's GSUB lookups, and posters set capitals, which need no substitutions.
- **Fit-to-width, computed rather than guessed.** `src/lib/posters/fit.ts` tries every cut in the width ladder (125% down to 62%) and every way of breaking the name into one to three lines (four on Stories), and keeps the biggest setting that fits. Text is measured with the same fonts satori uses, so the layout's numbers are the rendered result. Tests assert that every venue name fits in every format, the longest included.
- **Cancelled posters don't hide what was cancelled.** A red CANCELLED block takes the billing line's place, and the venue and date turn muted. The first design laid a band across the poster, and the snapshot review showed it covering the date.
- **Duotone photos are built but off.** Portrait formats have a photo slot: grayscale, mapped from black to the poster red, fading into the type. The photo is chosen deterministically per show from `src/data/poster-photos.yaml`, which **ships empty** until Johnny confirms photographer credits and licenses (PLAN.md section 17). A preview with the hero shot is in `docs/case-study/phase-3-poster-photo-option.jpg`.
- **Cache by content.** Each render is stored in `.cache/posters/<hash>.png`, keyed by template version, font hash, format, the poster's text and the photo. CI keeps that folder with `actions/cache`. A rebuild with unchanged shows renders nothing (about 1 ms per poster against 40–90 ms).
- **The printed flyer is HTML, not the PNG.** "Print a flyer" prints the HTML bill through a print stylesheet: US Letter, black type on white with red accents (a dark flyer wastes a bar's toner), crisp at any size.
- **Formats.** Every show page gets `og` (1200×630). Upcoming shows also get `1x1`, `4x3`, `16x9`, `feed` (1080×1350) and `story` (1080×1920). Past show pages keep their link preview and show the HTML bill.

## Consequences

- Snapshot tests (`tests/unit/__snapshots__/posters/`) pin the design. After an intended change, run `UPDATE_POSTER_SNAPSHOTS=1 npm test -- posters`, look at the new images, and bump `TEMPLATE_VERSION` to invalidate cached renders.
- Renders take 40–90 ms each once fonts are loaded, under the 150 ms budget. A photo poster's first render adds about 150 ms for the duotone, which is memoized per photo and size.
- The site's web fonts and the poster fonts are separate files from the same family. Changing one doesn't change the other.
