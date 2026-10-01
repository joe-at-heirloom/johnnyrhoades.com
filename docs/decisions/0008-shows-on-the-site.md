# 0008: Shows on the site, built from data

**Status:** Accepted, 2026-09-30 (Phase 2)

## Context

Phase 2 replaces the Bandsintown widget with shows rendered at build time from `src/data/shows.json`, and adds `/shows/`, a page per show, calendar files, RSS, `/shows.json` and the Tonight bar (PLAN.md sections 4.2, 4.3 and 7). The plan left some details open.

## Decisions

- **One "now" per build.** `BUILD_NOW` in `src/lib/load-shows.ts` is read once and passed everywhere. `SITE_NOW` pins it, which the end-to-end tests use (`playwright.config.ts`). Every date-dependent function in `src/lib/` takes `now` as an argument.
- **Two different "how long" numbers:**
  - `LIVE_HOURS = 4`: a show without an end time counts as "on" until four hours after it starts. This drives upcoming lists, Tonight, and the past-show banner (PLAN.md section 4.2).
  - `DEFAULT_SET_HOURS = 3`: calendar entries need an end, so ICS and Google Calendar links use three hours when Bandsintown has none. That matches the one end time we've seen (6–9 pm). It's never shown as a fact on the page.
- **Which shows get pages.** Shows on or after `PAGES_FROM` (in `src/lib/site.ts`) get pages; older ones only get archive rows. Set it to launch day minus 30 days once launch is scheduled. Pages go `noindex, follow` 30 days after the show.
- **Redirect stubs for old slugs.** GitHub Pages can't redirect, so each alias builds a tiny page with `meta refresh`, a canonical link and `noindex`.
- **Tonight runs on a JSON island.** The build writes the next ten shows, with display strings already formatted, into `<script type="application/json">`. The inline script (about 1 KB) only compares instants and checks Detroit's calendar date with `Intl.DateTimeFormat`. Those ISO strings carry UTC offsets, so `Date.parse` reads them exactly. Rule 4 in CLAUDE.md is about Bandsintown's offset-less times, which never reach the browser.
- **The poster panel is HTML for now.** Show pages lay out the bill (venue as hero, date, time, town, act) in HTML and CSS. Phase 3 replaces it with generated images and uses it as the design reference.
- **Calendar subscription.** `webcal://johnnyrhoades.com/shows.ics` is the main link. Google Calendar subscribes through `calendar.google.com/calendar/r?cid=webcal://…`. Times are UTC, UIDs come from the Bandsintown id, and `SEQUENCE` comes from the sync, so edits update in place.
- **`/shows.json` is curated, not a dump.** It has public shows only, upcoming plus the last year, and no sync internals (`firstSeen`, `sequence`, `aliases`).
- **Press kit links wait for the press kit.** Show pages say "Booking your room? Send Johnny the date" and link to `/#book` until `/epk/` exists (Phase 4).

## Consequences

- No third-party JavaScript on the home page. Mobile Lighthouse went from performance 71 to 95, page weight from 1,001 KB to 366 KB, and blocking time from 258 ms to 0. Show pages score 100 in all four categories.
- The shows Johnny adds appear on the site only after the next build. That's three hours at most once the sync runs. Until then, Tonight's client-side checks keep lists from showing shows that already ended.
- The visual parity test from Phase 0 is retired (ADR 0005), and `reference/v1/` stays as history.
