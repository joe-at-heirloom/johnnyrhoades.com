# 0027: Host on Cloudflare Workers, not GitHub Pages

**Status:** Accepted, 2026-11-22; staging has served from Workers since that day. Replaces the hosting rows of PLAN.md section 5 and the cutover in section 14. Refines ADR 0012 (headers and redirects) and ADR 0026 (the Lighthouse server).

## Context

The site was deployed to GitHub Pages, with Cloudflare proxying it, because the domain's DNS was already on Cloudflare. GitHub Pages can't set headers or redirect, so a lot of the launch was hand work in the Cloudflare dashboard:

- The security headers were a Transform Rule pasted from `docs/security-headers.md`.
- The old Bandzoogle URLs were Single Redirects typed in from `docs/redirect-map.csv`.
- The caching was two more rules.
- A changed show URL could only get a meta-refresh stub page, not a 301.
- GitHub needed a domain-verification record, a certificate it was slow to issue, and Enforce HTTPS ticked by hand.
- Inlining the stylesheet, the one load-time gain left (ADR 0026), was ruled out: the CSP would have needed a hash, hand-edited into the Cloudflare rule on every CSS change.

On 2026-11-22 Joe suggested Cloudflare Workers. Its static assets serve a folder of files from Cloudflare's network, and read two plain-text files from that folder: `_headers` and `_redirects`.

## Decisions

- **Workers static assets, with no Worker script.** `wrangler.jsonc` points at `dist/`. Cloudflare applies `_headers` and `_redirects` only to responses it serves as static files, not to anything a Worker script returns. A script would mean setting every header in code, and static requests would become billable invocations. So there's no script. Static asset requests are free and unlimited.
- **The build writes both files.** `src/lib/edge.ts` (pure, unit tested) builds them, and `src/integrations/edge-files.ts` writes them into `dist/` after every `astro build`.
  - `_headers` carries the five security headers from `src/lib/security-headers.ts` on every response, a year's immutable cache on `/_astro/*`, and on staging `X-Robots-Tag: noindex`.
  - `_redirects` gets `docs/redirect-map.csv` (now including the `/track/*` catch-all that was a dashboard rule), 301s from `/epk` and `/shows` to their slashed forms, and a 301 for every changed show slug.
  - The changed slugs are read back from the meta-refresh stubs Astro already builds, so the alias logic stays in one place. Cloudflare follows a redirect even when a file exists at that path. The stubs remain only as a fallback for other hosts.
  - `edge.ts` enforces Cloudflare's limits: 100 header rules, 2,000 characters per header line, 2,000 static and 100 dynamic redirects, 1,000 characters per redirect. A mistake fails the build, not the deploy.
- **Routing:**
  - `html_handling: force-trailing-slash` matches `trailingSlash: 'always'`. Its own fixes are 307s, so the two pages people type get 301s.
  - `not_found_handling: 404-page` serves `404.html` with a 404 status.
  - `workers_dev` and `preview_urls` are off, so the site only exists at its own domain.
- **Domains.** Staging is a custom domain, `new.johnnyrhoades.com`; at launch the pattern becomes `johnnyrhoades.com`. Cloudflare creates the DNS record and certificate. A custom domain matches one exact hostname, so `www` reaches the apex through one Cloudflare redirect rule, as Cloudflare recommends. It's the only dashboard rule left.
- **Deploy.** The build job uploads `dist/` as an artifact. The deploy job runs `cloudflare/wrangler-action` with Wrangler pinned to 4.158.0 (released November 5; ADR 0004's rule of pinning what's settled), using the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. If the secrets are missing, the job fails with a message that says so. Wrangler isn't a project dependency, so `npm ci` stays small for the sync and IndexNow jobs.
- **Headers roll out enforced.** The CSP goes straight to enforcing on staging, with no report-only phase: the end-to-end test already runs every interactive part under it, and that test now serves the built `dist/_headers` itself. HSTS can start at 300 seconds on launch day through the build variable `SITE_HSTS_MAX_AGE`.

## Consequences

- The launch runbook loses the GitHub verified domain, the Pages custom domain, the certificate wait, Enforce HTTPS, the Transform Rule, the cache rules and five redirect rules. The headers and redirects are reviewed in pull requests and tested, and they ship with the deploy that needs them.
- Checked locally with `wrangler dev` (Wrangler 4.158.0) against the real build:
  - every response carries the five headers, and `/_astro/*` the immutable cache;
  - `/home`, the five track pages and any other `/track/…` answer 301;
  - `/epk` and `/shows` answer 301;
  - a missing page is a 404 with the site's page;
  - `_headers` and `_redirects` themselves are never served.
- HTML and posters now revalidate on every visit (Workers' default `max-age=0, must-revalidate`, with an ETag) instead of GitHub Pages' ten minutes. A new show appears on a returning visitor's next visit.
- The Lighthouse server (`scripts/serve-dist.ts`) serves the same `_headers`, so the lab sees production's headers and caching.
- **Limits to watch:** 20,000 files per version on the free plan. The build has 153 today, growing by about 100 show pages a year. Workers keeps earlier versions, so `wrangler rollback` undoes a bad deploy in seconds.
- **Now possible, not done:** inline the 10 KB stylesheet with a build-time hash in `_headers`, the load-time gain ADR 0026 set aside. A form endpoint with Turnstile could also live beside the site later (PLAN.md section 15, Phase 8).
- **Joe, once:** create the API token ("Edit Cloudflare Workers" template, scoped to the account that holds the zone and to johnnyrhoades.com), add both secrets, and delete the `new` CNAME to GitHub before the first Workers deploy (`docs/runbook-launch.md`). After that, GitHub Pages can be turned off in the repository settings.
