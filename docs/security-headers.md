# Security headers and caching (Cloudflare Workers)

The site is served by Cloudflare Workers as static files (ADR 0027), and every response carries these headers. They aren't set in the Cloudflare dashboard. The build writes them into `dist/_headers` (`src/lib/edge.ts`, from `src/lib/security-headers.ts`), and Workers applies that file to every file it serves.

Three checks keep the headers right:
- A unit test fails if this page drifts from `security-headers.ts`.
- The end-to-end test `tests/e2e/csp.spec.ts` serves every page with the headers in the built `dist/_headers`, uses each interactive part, and fails on any violation.
- Lighthouse CI serves the build with the same file (`scripts/serve-dist.ts`).

## Headers

On every response (`/*` in `_headers`):

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self'; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com; font-src 'self'; media-src 'self' https://audio-ssl.itunes.apple.com; connect-src 'self' https://formspree.io https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; frame-src https://www.youtube-nocookie.com; form-action 'self' https://formspree.io; base-uri 'self'; object-src 'none'; frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=(), autoplay=(self "https://www.youtube-nocookie.com"), clipboard-write=(self "https://www.youtube-nocookie.com"), encrypted-media=(self "https://www.youtube-nocookie.com"), fullscreen=(self "https://www.youtube-nocookie.com"), picture-in-picture=(self "https://www.youtube-nocookie.com"), web-share=(self "https://www.youtube-nocookie.com")` |

Staging builds (`SITE_NOINDEX=true`) also send `X-Robots-Tag: noindex`.

What each part of the policy is for:

- **`script-src`**: the site's own bundles and Google's `gtag.js`, which the site loads after the page is idle, on the real domain only (ADR 0023). No inline scripts anywhere: `astro.config.mjs` sets `assetsInlineLimit: 0`, so Astro never inlines a small script, and the policy needs no hashes that change every build. JSON-LD and the Tonight data island are data blocks, which CSP doesn't apply to.
- **`connect-src`**: both forms (Formspree), and the hosts Google Analytics sends hits to. The wildcards are Google's own documented policy for GA4, which picks a regional collection host (`region1.google-analytics.com` and the like).
- **`form-action`**: Formspree, for the no-JavaScript posts.
- **`frame-src`**: YouTube's privacy-enhanced player, loaded only after someone presses play.
- **`media-src`**: Apple Music's 30-second song clips for the record player, streamed only after someone presses play on a track (ADR 0016). Drop the Apple host once the clips are Johnny's own files under `/audio/`.
- **`img-src`**: `data:` for the film-grain texture in `base.css`, an inline SVG; and Google Analytics, which can fall back to an image pixel.
- **`Permissions-Policy`**: everything off, except what the YouTube player asks for in its iframe `allow` attribute (`src/scripts/video-stage.ts`; a unit test keeps the two in step).

### Rolling it out

1. **The policy is enforced on staging from its first Workers deploy.** There's no report-only step: the end-to-end test already runs every interactive part under the enforced policy, and staging is where anything it missed would show. Click through every page on a phone and a laptop with the browser console open: play a video, open the lightbox, play the guitar and a song clip, send both forms. A blocked request shows in the console, and the fix goes in `src/lib/security-headers.ts`.
2. **`Strict-Transport-Security`:** on launch day, set the repository variable `SITE_HSTS_MAX_AGE` to `300` before the deploy that moves the apex. After a day of HTTPS working on the apex and `www`, delete the variable and run the Site workflow, which restores the year. Don't add `preload` unless every subdomain will always be HTTPS.
3. **Adding a service later** (a new analytics host, a form Worker) means changing `src/lib/security-headers.ts` and this page together. The tests fail until both agree.

## Caching

| Files | `Cache-Control` | Why |
|---|---|---|
| `/_astro/*` | `public, max-age=31536000, immutable` (from `_headers`) | Their names carry a content hash, so a changed file gets a new name |
| Everything else | `public, max-age=0, must-revalidate`, with an `ETag` (Workers' default) | Pages and posters change when a show does; a browser checks for a new version each time, and gets a small 304 when nothing changed |

GitHub Pages sent `max-age=600`, so a new show could take ten minutes to appear for a returning visitor. Now it appears on the next visit.

## Also in the Cloudflare dashboard at launch

Only one thing stays outside the repo: `www`. A Worker's custom domain matches one exact hostname, so `www.johnnyrhoades.com` reaches the site through a redirect rule (Cloudflare's own recommendation):
- **DNS:** a proxied (orange cloud) `AAAA` record for `www` pointing to `100::`, a placeholder that never receives traffic.
- **Rules → Redirect Rules:** a Single Redirect from `https://www.johnnyrhoades.com/*` to `https://johnnyrhoades.com/${1}`, 301, keeping the query string.
- **SSL/TLS:** turn Always Use HTTPS on.
