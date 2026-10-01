# Case study notes

A running log for the portfolio write-up (PLAN.md section 16): numbers, screenshots and surprises, captured as they happen. Newest first.

---

## 2026-09-30: Phase 3, the poster engine

**What changed.** Every show now has gig posters made from type: a link preview for every show page, and square, 4:3, 16:9, Instagram post and Story sizes for upcoming ones. The venue name is the hero, set as big as it fits. Short names run wide across Archivo's width axis, and long ones run condensed and stacked. Show pages display the poster, offer downloads, and print as a one-page US Letter flyer.

![Generated posters for Johnny's October shows](case-study/phase-3-posters.jpg)

**Numbers.** 44 posters for the current calendar, 40–90 ms each to render, about 1 ms each from cache on rebuild. Nine shows' worth of posters adds about 1.5 s to a cold build. 129 unit tests (30 for posters, including ten pixel snapshots) and 20 end-to-end tests, one of which prints the flyer to PDF and checks it's a single page.

**Worth telling**

- *Measure, don't guess.* Satori can't fit text to a box, so the layout measures every candidate (six widths × every line break) with the same font files satori renders. Then a test can promise that no venue name, however long, overflows any format.
- *The snapshot review earned its keep.* The first cancelled-show design put a red band across the poster, and looking at the snapshots showed it covering the date. Now CANCELLED replaces the billing line and nothing is hidden.
- *Photos wait on rights, not code.* The duotone photo version (`case-study/phase-3-poster-photo-option.jpg`) is built and tested but switched off until Johnny confirms who took the photos.

---

## 2026-09-30: Phase 2, shows on the site

**What changed.** The Bandsintown widget is gone. Shows are rendered at build time from `shows.json`, and every public show gets its own page with event markup, a calendar file and directions. `/shows/` adds the full list and archive. `/shows.ics`, `/shows/feed.xml` and `/shows.json` are generated alongside. On a show day, a red "Tonight" bar appears under the hero.

**Lighthouse, mobile, median of 3** (same setup as Phase 0):

| | Performance | Accessibility | Best practices | SEO | LCP | TBT | Weight |
|---|---|---|---|---|---|---|---|
| v1 prototype | 63 | 97 | 100 | 100 | 7.99 s | 172 ms | 1,150 KB |
| Phase 0 | 71 | 100 | 100 | 100 | 7.04 s | 258 ms | 1,001 KB |
| **Phase 2, home** | **95** | 100 | 100 | 100 | 2.86 s | 0 ms | 366 KB |
| **Phase 2, a show page** | **100** | 100 | 100 | 100 | 1.81 s | 0 ms | 160 KB |

Removing one third-party widget (and the Google Tag Manager it brought along) did more for performance than everything else combined. Home LCP is still above the plan's 2.0 s bar, which is Phase 6 work (the hero image).

**Tests.** 99 unit tests and 17 end-to-end tests. Playwright's clock control checks the time-dependent behavior in a real browser: the Tonight bar appears at 7:30 pm on a show day and disappears after the set, and a past show's page points to the next one. The generated calendar is checked by a real iCalendar parser (Mozilla's ical.js), not just string matching.

**Worth telling**

- *Two numbers that look the same but aren't.* "When is a show over?" (4 hours, for hiding it) and "how long is it?" (3 hours, only because calendar apps need an end time) are separate constants, and neither is ever shown as a fact.
- *Static hosting picks MIME types from file extensions,* so the RSS feed is served as `text/xml` no matter what the endpoint declares. A test caught that assumption.

---

## 2026-09-30: Phase 1, show data pipeline (on mock data)

**What changed.** `scripts/sync-shows.ts` turns Bandsintown events into `src/data/shows.json`. Every show gets a stable slug, a venue-local time with a real UTC offset, an act, a billing line and history fields. The workflow runs it every three hours and commits only when something changed.

**The blocker, handled.** Bandsintown's API needs an `app_id` from Johnny's artist account, and we don't have one yet. Instead of waiting, the pipeline was built against a faithful mock (ADR 0006): Johnny's real public schedule and real event IDs, in the exact JSON shape Bandsintown returned for one of his shows. When the key arrives, `npm run sync -- --capture` records real responses to diff against.

**Numbers.** 79 unit tests in about 2 seconds. They include both 2026–27 DST changes, Bandsintown error bodies, a matinee-plus-evening slug collision, and an integration test that runs the real script against temp data. The script writes nothing on a no-change run, so the 3-hourly schedule makes zero commits on quiet days.

**Things worth telling**

- *Bandsintown times have no offset.* "2026-10-02T18:00:00" means 6 pm wherever the venue is. Treating every show as Detroit time would put a Chicago gig an hour off, so the venue's time zone is stored with every show.
- *Johnny doesn't label his shows today.* Every real event has an empty title, so every show reads as "Johnny Rhoades" with no act. The fix is a one-page guide for Johnny (`docs/bandsintown-naming.md`), not code.
- *Keeping the scheduled workflow alive.* GitHub disables scheduled workflows in public repos after 60 days without activity. A quiet calendar would kill the sync, so a weekly heartbeat commit keeps it alive. It's tested.

---

## 2026-09-30: Phase 0, scaffold with visual parity

**What changed.** The one-page prototype is now an Astro 7 site, with TypeScript strict, components, an image pipeline and self-hosted fonts. To a visitor it looks exactly the same.

**Parity.** Full-page screenshots of v1 and v2 match at 390, 768 and 1440 px: 0.000% of non-photo pixels differ, and page heights are identical (11,019 / 9,246 / 8,050 px). See ADR 0005 for how photos are handled.

**Lighthouse, mobile, median of 3 runs** (local preview, Lighthouse 13.5, simulated slow 4G):

| | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | Weight |
|---|---|---|---|---|---|---|---|---|
| v1 prototype | 63 | 97 | 100 | 100 | 4.09 s | 7.99 s | 172 ms | 1,150 KB |
| v2 Phase 0 | 71 | 100 | 100 | 100 | 1.36 s | 7.04 s | 258 ms | 1,001 KB |

Not yet measured: the live Bandzoogle site (PLAN.md section 13 wants it as the "before"). Capture it before launch.

**Where the remaining weight is.** The Bandsintown widget script is 432 KB transferred, and **it quietly loads Google Tag Manager** (another 138 KB) on Johnny's page. Together they're well over half the page weight and most of the blocking time. Phase 2 renders shows at build time and drops both. That's a privacy win as well as a speed one, and a good line for the write-up.

**JavaScript.** 4.6 KB gzipped of first-party JS on load, plus a 2.7 KB strum chunk that loads later. The budget is 30 KB.

**Surprises worth telling**

- *The accessibility check found a real bug in the "finished" design.* Bone text on the red buttons was 4.45:1, a hair under WCAG AA, and the hover state was about 3:1. Fixed with a slightly deeper red that nobody will notice (ADR 0003).
- *Pixel parity failed on a one-pixel rounding error.* A photo master capped at 1600px resized to 700×466 instead of 700×467. That shifted everything below it by a fraction of a pixel and changed text anti-aliasing down the page. Rebuilding two masters from the originals took the diff from 0.7% to 0.000% (ADR 0005).
- *Astro ships full-size originals if your code reads a property off an imported image.* Reading `photo.width` in the gallery added 3 MB of unreferenced JPEGs to the build. Removing it took the build from 7.0 MB to 4.0 MB.
- *Toolchain edges in late 2026:* npm 10.9 crashes installing this dependency tree, TypeScript 7 isn't supported by `@astrojs/check` yet, and `astro preview` in Astro 7 runs as a background daemon with a lock file, so test runners need `--ignore-lock` (ADR 0004).

**Screenshots to keep:** `test-results/parity-home-matches-v1-at-*/` (v1, v2 and diff images, regenerated by `npm run test:e2e`).
