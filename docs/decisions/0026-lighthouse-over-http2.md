# 0026: Lighthouse CI serves the build over HTTP/2

**Status:** Accepted, 2026-11-22. Refines ADR 0012 (the Lighthouse budgets); the LCP warning stays a warning. Since ADR 0027 the server also sends the build's `dist/_headers`, as Cloudflare Workers does.

## Context

Home page LCP in Lighthouse CI read about 2.7 s against the 2.0 s bar, and looked like the last open performance item: "the hero image". The report said otherwise. The hero arrived in about 12 ms of simulated load time, and 83% of the LCP was render delay. Unthrottled, the hero painted at first paint, about 130 ms in. The 2.7 s was Lighthouse's slow-4G simulation charging the hero for the 33 requests (about 540 KB) that start before that first paint.

The simulation models the protocol it sees. lhci's built-in static server speaks HTTP/1.1, so Lighthouse allowed six connections at a time and queued the rest. Production doesn't work that way: GitHub Pages serves HTTP/2, and Cloudflare serves HTTP/2 and HTTP/3. The same Lighthouse, mobile preset, against staging (GitHub Pages, HTTP/2) read 1.78 to 1.96 s.

Making the page lighter didn't offer much:

- **Inline the 10 KB stylesheet** (Lighthouse's estimate: about 455 ms). The CSP's `style-src 'self'` would need a hash of it in the Cloudflare header, updated by hand on every CSS change.
- **Trim the font further.** Pinning the weight axis to the 400 to 900 the site uses saves 1.5 KB, because the default weight is 600 and both ends stay. Dropping unused OpenType features saves 5 KB, and tabular numbers go with them. Most of the 63 KB is the variation data the widths and weights need.
- **The images below the hero** are already lazy, and the hero is 25 KB.

## Decision

`npm run lhci` and CI serve `dist/` with `scripts/serve-dist.ts`: Node's own `http2` server with gzip, no new dependency. It makes a self-signed certificate with openssl for each run, and Chrome runs with `--ignore-certificate-errors`. The script refuses paths outside `dist/` and serves `404.html` for anything missing.

## Consequences

- Median LCP, 3 runs, mobile: home 1.74 s (was 2.71), show page 1.76 s, press kit 1.88 s. Performance 100 on all three; accessibility, best practices and SEO still 100. No warnings.
- The lab now agrees with staging to within about 0.1 s, so a real regression shows up as one.
- LCP stays a warning, not a gate. The margin is a couple of hundred milliseconds, and the 2.0 s bar is a field metric that Search Console reports at day 28 (runbook step 22).
- The server only exists for measurement. It isn't the preview server, and it does no redirects (`/epk` without the slash is a 404, where GitHub Pages would redirect), so Lighthouse URLs keep their trailing slashes.
