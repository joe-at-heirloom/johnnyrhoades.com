# 0035: The footer credit is Joe's wordmark, linking to joelint.com

**Status:** Accepted, 2026-11-27.

## Context

The footer has carried a small "Site by Joe" credit since Johnny OK'd it on 2026-10-05, linking to this site's public repo. Joe asked for the credit to be his own logo and to link to his site, joelint.com.

His logo is a wordmark: "Joe Lint" in Instrument Serif, letter-spaced .02em, at `font-weight: 700`. Instrument Serif comes only in a regular weight, so the browser fakes the bold by thickening the outlines. Loading Instrument Serif here would add a second typeface to a site that keeps one (non-negotiable 6), and a web font request to every page for two words.

## Decision

- **The wordmark is outlined, not set.** `src/assets/brand/joe-lint-wordmark.svg` is the glyphs of "Joe Lint" from Instrument Serif Regular (SIL Open Font License, which allows this), laid out with the font's kerning plus .02em letter-spacing, as one path. No font file ships, and the site's type stays Archivo.
- **The faux bold is a stroke.** The path is filled and stroked in `currentColor` with a 20-unit stroke (.02em). Measured against Chromium's own faux bold at 14.4, 18 and 22.4 px, that stroke matches its ink within 4%.
- **It takes the footer's colors.** It's inlined as an Astro SVG component, so `currentColor` is the fine print's `--muted`, and `--bone` on hover, like the other footer links. No new colors.
- **It reads as text.** The link is "Site by" plus the wordmark (`role="img"`, `aria-label="Joe Lint"`), so its accessible name is "Site by Joe Lint". It's set at 1.3× the fine print, on its baseline.
- **The link goes to joelint.com**, in a new tab like the other footer links. The repo is no longer linked from the site.

## Consequences

- Each page carries about 3 KB of path data in its HTML, uncompressed. It's the same on every page and gzips well.
- Changing the wordmark means re-outlining it. It was made with opentype.js (already a dependency, for the posters): each glyph's `getPath` at 1000 units to the em, advanced by its width, the kerning pair and 20 units.
- An end-to-end test checks the link's name and address, and that the wordmark renders at its intended size.
