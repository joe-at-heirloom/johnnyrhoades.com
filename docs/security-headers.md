# Security headers and caching (Cloudflare)

GitHub Pages can't set response headers, so Cloudflare adds them in front of it (PLAN.md section 12). This page is what to paste into the Cloudflare dashboard at launch (Phase 7). The values come from `src/lib/security-headers.ts`; a unit test fails if this page drifts from it, and an end-to-end test (`tests/e2e/csp.spec.ts`) serves the built site under this exact policy and fails on any violation.

Status: **draft.** Nothing is live until DNS moves to Cloudflare.

## Headers

Cloudflare dashboard → the johnnyrhoades.com zone → Rules → Overview → Create rule → **Response Header Transform Rule**. Name it "Security headers", match all incoming requests (or `http.host eq "johnnyrhoades.com"`), and add one "Set static" operation per row:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://cloud.umami.is; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.web3forms.com https://buttondown.com https://gateway.umami.is; frame-src https://www.youtube-nocookie.com; form-action 'self' https://api.web3forms.com https://buttondown.com; base-uri 'self'; object-src 'none'; frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=(), autoplay=(self "https://www.youtube-nocookie.com"), clipboard-write=(self "https://www.youtube-nocookie.com"), encrypted-media=(self "https://www.youtube-nocookie.com"), fullscreen=(self "https://www.youtube-nocookie.com"), picture-in-picture=(self "https://www.youtube-nocookie.com"), web-share=(self "https://www.youtube-nocookie.com")` |

What each part of the policy is for:

- **`script-src`**: the site's own bundles and the Umami script. No inline scripts anywhere: `astro.config.mjs` sets `assetsInlineLimit: 0`, so Astro never inlines a small script, and the policy needs no hashes that change every build. JSON-LD and the Tonight data island are data blocks, which CSP doesn't apply to.
- **`connect-src`**: the booking form (Web3Forms), the signup (Buttondown) and Umami, whose cloud script sends events to `gateway.umami.is`, not to the host it's loaded from.
- **`form-action`**: the same two form services, for the no-JavaScript posts.
- **`frame-src`**: YouTube's privacy-enhanced player, loaded only after someone presses play.
- **`img-src data:`**: the film-grain texture in `base.css` is an inline SVG.
- **`Permissions-Policy`**: everything off, except what the YouTube player asks for in its iframe `allow` attribute (`src/scripts/video-stage.ts`; a unit test keeps the two in step).

### Rolling it out

1. On staging, first send the policy as `Content-Security-Policy-Report-Only`. Click through every page on a phone and a laptop with the browser console open: play a video, open the lightbox, turn the strum sound on, send both forms. Any blocked request shows in the console.
2. Switch to `Content-Security-Policy` once the console is clean.
3. `Strict-Transport-Security`: start at `max-age=300` for the first day after launch, then raise it to the value above once HTTPS works on the apex and `www`. Don't add `preload` unless every subdomain will always be HTTPS.
4. Adding a service later (a new analytics host, a form Worker) means changing `src/lib/security-headers.ts`, this page, and the Cloudflare rule together.

## Caching

Rules → Overview → Create rule → **Cache Rule**:

| Rule | Match | Setting |
|---|---|---|
| Hashed assets | URI path starts with `/_astro/` | Eligible for cache. Edge TTL: ignore cache-control header, 1 year. Browser TTL: override origin, 1 year. |
| HTML and data | Everything else | Respect origin. GitHub Pages sends `max-age=600`, which is right for pages that change when a show is added. |

For `immutable`, add a second Response Header Transform Rule, "Immutable assets", matching URI path starts with `/_astro/`, that sets `Cache-Control` to `public, max-age=31536000, immutable`.

File names under `/_astro/` carry a content hash, so caching them forever is safe. Posters (`/posters/`) don't, and keep the origin's short cache: their URLs stay the same when a show changes.

## Also in the Cloudflare dashboard at launch

- SSL/TLS → **Full (strict)**, after GitHub has issued the certificate (PLAN.md section 14, step 8).
- Always Use HTTPS: on.
- A redirect rule from `www.johnnyrhoades.com/*` to `https://johnnyrhoades.com/${1}` (301), unless GitHub Pages handles `www` itself.
