# CLAUDE.md

## Project

johnnyrhoades.com is the website for Johnny Rhoades, a blues guitarist and singer from Detroit. Joe, Johnny's cousin, builds and maintains it, and it's also Joe's portfolio piece, so code clarity, docs and measured results matter as much as the interface.

Read `PLAN.md` before starting any work. It's the spec. Work phase by phase (PLAN.md section 15). A phase is done only when its acceptance criteria pass.

The idea in one line: every public gig Johnny adds in Bandsintown becomes a page, a poster, and proof. Johnny's only job is keeping Bandsintown current.

## Stack

- Astro (static output) with TypeScript strict, deployed to GitHub Pages by `.github/workflows/site.yml`. Cloudflare sits in front for DNS, redirects, headers, cache and email routing.
- Show data: `scripts/sync-shows.ts` pulls the Bandsintown API into `src/data/shows.json`, which is committed.
- Posters: satori and @resvg/resvg-js at build time.
- Tests: Vitest (unit), Playwright with axe-core (end to end), Lighthouse CI, html-validate, lychee.

## Commands

Keep this list accurate. Requires Node ≥ 22.12 and npm ≥ 11 (ADR 0004).

Available now:

- `npm run dev`, `npm run build`, `npm run preview` (Astro 7 runs preview in the background; stop it with `npx astro preview stop`)
- `npm run check`: `astro check` (type-checks `.astro` and `.ts`)
- `npm test`: Vitest unit tests in `tests/unit/`
- `npm run test:e2e`: Playwright. It builds the site with a pinned date (`SITE_NOW`, see `playwright.config.ts`) and serves it on port 4500, then covers behavior, axe accessibility, show pages, feeds and the Tonight bar. Traces and screenshots of failures land in `test-results/`.

- `npm run sync`: pull Bandsintown into `src/data/shows.json` (needs `BANDSINTOWN_APP_ID`; flags: `--capture`, `--force`, `--dry-run`, `--now`)
- `npm run sync:fixtures`: the same, offline, from `tests/fixtures/bandsintown/` (mocks until the key arrives; ADR 0006)

- `python3 scripts/make-poster-fonts.py`: regenerate the static poster fonts (needs fonttools; output is committed)
- `UPDATE_POSTER_SNAPSHOTS=1 npm test -- posters`: rewrite poster snapshots after an intended design change, then look at them and bump `TEMPLATE_VERSION` (ADR 0009)

Planned, added by the phase that needs them:

- `npm run check` grows lint and the facts-ledger rules: Phases 4 and 6
- `npm run lhci`: Phase 6

Before calling any task done, run `npm run check && npm test && npm run build`. For UI changes, also run `npm run test:e2e` and look at the screenshots.

## Non-negotiables

1. Never invent facts about Johnny. Biographical claims come only from `src/data/facts.yaml` and follow its status rules (PLAN.md section 6.4). If copy needs a fact that isn't there, add it as `unverified` with a `needs:` note and leave it off the page.
2. Never create a page, poster or `MusicEvent` markup for a show that isn't public.
3. Never commit show data that fails the sync guard: an API error, or an upcoming list that comes back empty or collapsed.
4. Times are always America/Detroit, handled with luxon. Never pass Bandsintown datetimes to `new Date()`.
5. Don't break URLs. When a slug changes, the old slug goes into `aliases` so a redirect stub is generated.
6. Preserve the visual language. Use the tokens in `src/styles/tokens.css`. No new typefaces, colors or motion without a decision record in `docs/decisions/`. The record and the strum are the only playful motion.
7. Zero client JavaScript by default. Budget: home ≤ 30 KB gzipped before interaction. The strum loads when it scrolls into view, and audio starts only after the visitor switches sound on.
8. Accessibility is a gate, not a polish step: WCAG 2.2 AA, keyboard access, visible focus, reduced motion, real alt text.
9. Secrets live only in GitHub Actions secrets. Nothing secret in client code or committed files.
10. Stay within the page list in PLAN.md section 3. Proposing a new page needs a decision record explaining how it passes the "worth it" test.

## Voice and copy

- Home page: first person, Johnny talking. Press kit and structured data: third person.
- Sentence case. Buttons name the action ("Send booking request").
- Specific over superlative. Never use: soulful, electrifying, legendary, powerhouse, world-class, "Detroit's best".

## Where things live

- `src/data/shows.json`: generated. Don't hand-edit it; use `show-overrides.yaml`.
- `src/data/venues.yaml`: addresses, blurbs and name matching.
- `src/data/facts.yaml`: the facts ledger.
- `src/data/media.yaml`: album, tracks, videos, photos and credits.
- `src/data/profiles.yaml`: official profiles. Only `live` ones render as links or go into `sameAs`.
- `src/lib/`: pure functions (normalize, slug, time, schema, ics, stats, posters). Keep them pure and tested.
- `reference/v1/`: the original prototype and the visual parity baseline.
- `docs/`: decision records, the launch runbook, the redirect map, the GEO audit log and the case study notes.

## Gotchas

- Pushes made with `GITHUB_TOKEN` don't trigger other workflows, so sync, build and deploy are jobs in one workflow.
- GitHub disables scheduled workflows in public repos after 60 days without activity. The weekly heartbeat commit exists for this; don't remove it.
- Cron runs in UTC and can start late.
- With Actions-based Pages deploys, the custom domain is set in repo settings and a `CNAME` file is ignored.
- GitHub Pages can't do redirects or headers. Those are Cloudflare rules documented in `docs/runbook-launch.md`. The only redirects the app generates are alias stubs for changed show slugs.
- Satori takes TTF, OTF or WOFF (not WOFF2) and doesn't reliably handle variable-font axes. Use the static instances in `src/assets/fonts/poster/`.
- Bandsintown: model against the captured payloads in `tests/fixtures/`, not assumptions. Confirm the datetime format and the title fields there.

## Working style

- Small, focused commits with conventional messages (`feat(shows): …`, `fix(posters): …`).
- Add or extend tests with every change to `src/lib/` or the sync script.
- When you make an architectural choice, add a short decision record in `docs/decisions/`.
- Log anything portfolio-worthy in `docs/case-study-notes.md`: before-and-after numbers, screenshots, surprises.
- If PLAN.md and reality disagree (an API field, a library limit), follow reality, record why in a decision record, and update PLAN.md.
