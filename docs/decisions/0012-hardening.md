# 0012: Hardening: discovery files, security headers and quality gates

**Status:** Accepted, 2026-09-30 (Phase 6)

## Context

PLAN.md Phase 6 asks for Lighthouse CI budgets, axe, html-validate, lychee, sitemap rules, robots.txt, `llms.txt`, IndexNow and a CSP draft, with every gate green on `/`, a show page and `/epk/`. Several of these turned up real problems once they were measured.

## Decisions

**Sitemap, robots.txt and llms.txt are routes, built from the data.**
- `/sitemap-index.xml` points to `/sitemap-0.xml`, which lists home, `/shows/`, `/epk/` and show pages while `isIndexable` says so (until 30 days after the show), with `lastmod` from `updatedAt`. Written in `src/lib/discovery.ts` instead of `@astrojs/sitemap`, because the rule is about show data, not about which files exist. An end-to-end test checks both directions: every sitemap URL is a built page without `noindex` and with a matching canonical, and every indexable built page is in the sitemap.
- `robots.txt` allows everyone and names the AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Google-Extended, Applebot-Extended), so the welcome is on the record rather than implied by `*`.
- `llms.txt` follows llmstxt.org: a summary line, Johnny in a few sentences, the canonical pages, the next shows, the data feeds, how to book, and his profiles. The sentences come from the facts ledger under the press kit's rules (`LLMS_ABOUT`), so `npm run check` covers them.

**A staging switch.** `SITE_NOINDEX=true` (a repository variable) makes every page `noindex, nofollow`, drops the sitemap line from `robots.txt` and silences IndexNow. PLAN.md section 14 runs staging that way and removes it at cutover.

**IndexNow compares the live `/shows.json` with the new build.** Before the deploy, `scripts/indexnow.ts plan` fetches the `/shows.json` that's live and lists show pages that are new, changed in any public field, or taken down, plus `/` and `/shows/` when anything moved. After the deploy, `submit` sends them. No state to store, and it behaves the same after a sync, a code change or the nightly rebuild. When there's no live snapshot (the old site), it sends the whole sitemap. A rejected ping is a warning, never a failed deploy. The key is public by design and lives in `public/<key>.txt`. On launch day the staging deploys will already have put `/shows.json` live, so the diff would be empty: the runbook sends `--all` by hand.

**Security headers: one source, tested by serving the site under them.**
- `src/lib/security-headers.ts` holds the CSP, `Permissions-Policy` and the rest. `docs/security-headers.md` quotes them exactly for Cloudflare, and a unit test fails if the two drift.
- No `unsafe-inline` anywhere. Astro inlines scripts under 4 KB by default, which would need CSP hashes that change every build, so `assetsInlineLimit: 0` keeps every script external. Cost: one or two extra small requests per page, cheap over HTTP/2.
- Umami Cloud's script sends events to `gateway.umami.is`, not to `cloud.umami.is` where it loads from. Found by reading the script; without it, analytics would have been silently blocked.
- `Permissions-Policy` turns everything off except what the YouTube player asks for, and the iframe's `allow` list was trimmed to match (accelerometer and gyroscope dropped). A unit test keeps them in step.
- `tests/e2e/csp.spec.ts` serves every page with the real headers, then plays a video, opens the lightbox, turns the strum sound on and sends both forms. Any CSP violation or console error fails. Another test scans every built page for inline scripts, `<style>`, `style=` and `on*=` attributes.

**Lighthouse CI** (`lighthouserc.cjs`, `npm run lhci`) runs mobile, three times each, on `/`, the first show page in the sitemap and `/epk/`. Errors: performance under 95 (median), accessibility, best practices or SEO under 100, CLS over 0.05 in any run, and on the home page more than 30 KB of JavaScript or 600 KB total. Results stay in `.lighthouseci/`; nothing is uploaded.

Largest Contentful Paint is a **warning** at 2.0 s, not a gate. The 2.0 s bar in PLAN.md section 12 is a Core Web Vitals target, which is field data from real phones (Search Console). Lighthouse simulates a slow 4G connection over a local HTTP/1.1 server and reads about 2.6 s for the home page and the press kit, while scoring 96 and 97. It stays visible on every run; the real number comes from Search Console after launch.

**html-validate** with the recommended rules, minus `long-title`: the title templates in PLAN.md section 9 run past 70 characters by design ("Johnny Rhoades Press Kit | Detroit Blues Guitarist for Venues, Festivals and Events"), and search engines truncate by pixel width anyway. ESLint isn't added: TypeScript strict and `astro check` already cover the code, and the plan's quality list doesn't ask for it.

**Links.** Internal links, images, scripts and stylesheets in every built page are checked in the end-to-end suite (no extra binary to install locally). lychee runs weekly in CI on external links, non-blocking, as the plan asks.

## Fixed because the gates found them

- **The home page had no Largest Contentful Paint at all.** The hero photo faded in from `opacity: 0`, and Chrome doesn't count an invisible element, so Lighthouse couldn't score performance. The photo now only settles from a slight zoom (`transform` only): it's visible from the first paint, and the text still rises in. This is the one change to the site's motion.
- **Past show pages shifted** (CLS 0.11). The "This show has happened" banner was always revealed by script, even when the build already knew. It's now in the HTML when the page is built after the show, with "Next up" filled in; the script only handles pages built before the show ended.
- **The press kit's video poster was lazy-loaded** although it's the first thing on the page. Now eager, with high fetch priority.
- **The web font was 90 KB.** It covered widths 62–125%; the site uses 62–100%. `scripts/trim-web-font.py` drops the rest: 63 KB, pixel-identical at every width and weight the site uses. The original stays in `src/assets/fonts/source/`.
- **html-validate:** the strum neck was a `div` with `role="button"`; it's a real `<button>` now. The lightbox had an `<img src="">`; the image is created when the lightbox opens.

## Consequences

- Results on a local build: home 96, show page 100, press kit 97 for performance; 100 for accessibility, best practices and SEO on all three. Home ships 10 KB of JavaScript and 345 KB in total.
- Adding a third-party service now means touching `security-headers.ts`, the Cloudflare doc and the Cloudflare rule together, and the CSP test fails until the first of those is done.
- `ci.yml` and the IndexNow job haven't run on GitHub yet; the repo is local until Johnny OKs a public one.
