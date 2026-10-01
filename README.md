# johnnyrhoades.com

The website for Johnny Rhoades, a blues guitarist and singer from Detroit.

**The idea:** every public gig Johnny adds in Bandsintown becomes a page, a poster, and proof. Johnny's only job is keeping Bandsintown current. The full spec is in [PLAN.md](PLAN.md), and working rules for Claude Code are in [CLAUDE.md](CLAUDE.md).

## Status

**Phase 0 (scaffold with visual parity): done, except deploy.** The original one-page prototype is ported to Astro and matches it pixel for pixel. The deploy waits on Johnny's OK to make the repo public. Next is Phase 1, the Bandsintown sync, which needs an API `app_id` from Johnny's Bandsintown for Artists account.

## Stack

Astro 7 (static output), TypeScript strict, plain CSS with design tokens, and self-hosted Archivo. Tested with Vitest, Playwright and axe-core. Deploys to GitHub Pages through `.github/workflows/site.yml`.

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
| `npm run check` | `astro check`: type-checks `.astro` and `.ts` files |
| `npm test` | Unit tests (Vitest, `tests/unit/`) |
| `npm run test:e2e` | End-to-end tests (Playwright, `tests/e2e/`): behavior, accessibility and visual parity with v1. Run `npm run build` first. |

First time running end-to-end tests: `npx playwright install chromium`.

## Layout

```
src/
  pages/        index, thanks, 404
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
