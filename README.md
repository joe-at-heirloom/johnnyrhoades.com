# johnnyrhoades.com

The website for Johnny Rhoades, a blues guitarist and singer from Detroit.

**The idea:** every public gig Johnny adds in Bandsintown becomes a page, a poster, and proof. Johnny's only job is keeping Bandsintown current. The full spec is in [PLAN.md](PLAN.md), and working rules for Claude Code are in [CLAUDE.md](CLAUDE.md).

## Status

| Phase | State |
|---|---|
| 0. Scaffold with visual parity | Done, except the deploy, which waits on Johnny's OK to make the repo public |
| 1. Show data pipeline | Done on mock data. Live sync waits on a Bandsintown `app_id` (ADR 0006) |
| 2. Shows on the site | Done: shows rendered at build time, show pages, calendar, RSS, `/shows.json`, Tonight |
| 3. Poster engine | Done: six formats per upcoming show, fit-to-width type, cached renders, print flyer. Photos off until credits are confirmed |
| 4. Press kit and facts ledger | Done: `/epk/`, ledger rules enforced in `npm run check` and on built pages. Some sections wait on Johnny's answers |
| 5. Forms, list and analytics | Done in code: Web3Forms booking with a triage subject, Buttondown signup with region tags, cookieless Umami with the custom events. Needs the three accounts (ADR 0011) |
| 6. Hardening | Done: sitemap, robots.txt, llms.txt, IndexNow, a tested CSP draft for Cloudflare, Lighthouse CI budgets, html-validate, link checks, `ci.yml` (ADR 0012) |
| 7–8 | Not started. Launch needs Johnny's accounts and DNS access |

## Stack

Astro 7 (static output), TypeScript strict, plain CSS with design tokens, and self-hosted Archivo. Booking requests go through Web3Forms, the mailing list through Buttondown, and analytics through Umami (cookieless); their public IDs are build variables listed in `.env.example`. Tested with Vitest, Playwright and axe-core, html-validate and Lighthouse CI (`.github/workflows/ci.yml`). Deploys to GitHub Pages through `.github/workflows/site.yml`; Cloudflare in front adds the security headers in [docs/security-headers.md](docs/security-headers.md).

**Lighthouse (mobile, local build):** performance 96 on the home page, 100 on a show page, 97 on the press kit; accessibility, best practices and SEO 100 on all three.

## Commands

Needs Node 22.12+ and **npm 11** (see [ADR 0004](docs/decisions/0004-toolchain-pins.md)).

```bash
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:4321 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve `dist/` (Astro 7 runs it in the background; stop it with `npx astro preview stop`) |
| `npm run check` | `astro check` plus the facts-ledger rules |
| `npm test` | Unit tests (Vitest, `tests/unit/`) |
| `npm run sync:fixtures` | Rebuild `src/data/shows.json` from the Bandsintown fixtures (offline) |
| `npm run test:e2e` | End-to-end tests (Playwright, `tests/e2e/`). Builds with a pinned date first. |
| `npm run lint:html` | html-validate on the build in `dist/` |
| `npm run lhci` | Build, then Lighthouse CI against the budgets in `lighthouserc.cjs` (reports in `.lighthouseci/`) |
| `npm run indexnow -- plan` | Which show URLs IndexNow would be told about (run by the deploy workflow) |

First time running end-to-end tests: `npx playwright install chromium`.

## Layout

```
src/
  pages/        index, shows/ (list, show pages, .ics, feed), epk, posters/, press/, shows.ics, shows.json, thanks, 404
  layouts/      BaseLayout: head, fonts, meta
  components/   one per section: Header, Hero, ShowsSection, MusicSection, StrumNeck,
                AlbumRecord, VideoStage, AboutSection, PhotoGallery, BookingForm, MailingList, Footer
  scripts/      client behavior, one small module each
  lib/          pure, tested functions
  styles/       tokens.css, base.css, components/*.css, imported in order by index.css
  assets/       photo masters, logo, fonts (processed by Astro)
public/         copied as-is: favicons, Open Graph image
reference/v1/   the original prototype, frozen as the visual baseline
docs/           decision records and case study notes
tests/          unit and e2e
```

## Licensing

Code is MIT. Photos, music and the Johnny Rhoades logo are all rights reserved by their owners.
