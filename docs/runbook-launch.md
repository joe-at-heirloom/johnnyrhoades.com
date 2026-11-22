# Launch runbook

How johnnyrhoades.com moves from Bandzoogle to this site (PLAN.md section 14), with what was learned on 2026-09-30 from the domain's public records. Steps marked **Johnny** need his accounts; the rest Joe can do once he has access. Tick as you go.

## What's there today (public lookups, 2026-09-30)

| What | Value | What it means |
|---|---|---|
| Registrar | Squarespace Domains (was Google Domains). Expires 2027-09-02 | Check auto-renew is on |
| Nameservers | `jean.ns.cloudflare.com`, `sam.ns.cloudflare.com` | DNS is **already on Cloudflare**. Find out whose account (step 1) |
| Apex `A` / `AAAA` | `172.65.197.38` / `2606:4700:90:0:3626:d0ff:6957:de1` | Bandzoogle. These are the rollback values |
| `www` | CNAME to the apex | |
| `MX` | `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50) | **Johnny's email is Zoho Mail.** Never touch these |
| `TXT` | SPF `v=spf1 include:zoho.com ~all`, a Zoho verification record | Keep both |
| Old site URLs | `/`, `/home`, five track pages `/track/<id>/<slug>` | All in `docs/redirect-map.csv` |

A public lookup can't see every record. The zone export in step 2 is the real list.

**Email changes the plan.** PLAN.md section 11 first routed a new `booking@` address through Cloudflare Email Routing. Email Routing needs its own MX records, which would replace Zoho's and cut off Johnny's mailbox (ADR 0013). No new address is needed anyway: the site publishes his existing work email, `hello@johnnyrhoades.com` (ADR 0021).

## Before launch

1. [ ] **Johnny:** access to Bandzoogle (for the exports) and Zoho Mail admin. *Joe owns the domain (2026-10-05); its DNS is on Cloudflare. The zone shows Zoho's verification TXT record. The `google-site-verification` TXT record is Search Console's (step 4).* Earlier note: access to Squarespace Domains, Bandzoogle, Bandsintown for Artists, Zoho Mail admin, and the Cloudflare account that holds the zone. If nobody knows which Cloudflare account it is, Squarespace or Bandzoogle support can say who set the nameservers. If it's Bandzoogle's, the zone moves to a free Cloudflare account Johnny owns in step 5.
2. [ ] **Exports.**
   - Bandzoogle mailing list (CSV). Record the count in `docs/case-study-notes.md` as the baseline (PLAN.md section 13), and keep the file for whenever there's a list service (ADR 0023).
   - Audio, and the original photo files with photographer names (they unlock the press photo zip; `docs/manual-checks.md`).
   - The full DNS zone from Cloudflare (DNS → Records → Export), saved outside the repo.
3. [x] **Redirect map.** The old site was crawled on 2026-09-30: `docs/redirect-map.csv`. Re-crawl the week of launch in case Johnny added pages.
4. [x] **Search Console.** A Domain property for johnnyrhoades.com, verified by the `google-site-verification` TXT record. Joe is the owner (checked 2026-11-22). Its "Search generative AI" control is set to Include. Bing Webmaster Tools: add it too (it can import from Search Console).
5. [ ] **DNS on an account Johnny owns.** Skip if it already is. Otherwise add johnnyrhoades.com to his Cloudflare account (free plan), import the zone export, check that the Zoho MX and TXT records came across exactly, lower every TTL to 5 minutes, then change the nameservers at Squarespace Domains to the pair Cloudflare gives. When `dig NS johnnyrhoades.com` shows the new pair, send Johnny a test email.
6. [x] **Cloudflare API token** (ADR 0027). *Done 2026-11-22: the account token "johnnyrhoades.com deploy (GitHub Actions)", Workers Routes Write on johnnyrhoades.com only. Joe pasted the value into GitHub himself; Claude never saw it.* In the Cloudflare account that holds the zone, go to the account API tokens page → Create Token → the **Edit Cloudflare Workers** template. Scope Account Resources to that account and Zone Resources to johnnyrhoades.com. In the GitHub repository (Settings → Secrets and variables → Actions), add the token as the secret `CLOUDFLARE_API_TOKEN`, and the account ID (on the Workers & Pages overview) as `CLOUDFLARE_ACCOUNT_ID`. *This replaces the GitHub verified domain step from the GitHub Pages plan.*
7. [x] Public repository: https://github.com/joe-at-heirloom/johnnyrhoades.com (2026-10-02). In the repo:
   - [x] Settings → Pages → Source: GitHub Actions. *Turned off 2026-11-22, once staging served from Workers (ADR 0027).*
   - [x] Secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (step 6), 2026-11-22.
   - [x] Variable `SITE_NOINDEX` = `true`.
   - [x] Secret `BANDSINTOWN_APP_ID` (from Bandsintown for Artists → Settings), added 2026-10-05. The first live sync ran on the next push.
   - [x] Form and analytics IDs: none to set. The Formspree forms and the GA4 ID are defaults in `src/lib/public-config.ts`; a `PUBLIC_*` variable only overrides one (ADR 0023).

## Staging

8. [x] **Move staging to Workers** (ADR 0027), once step 6's secrets are in. *Done 2026-11-22: the CNAME deleted, the first Workers deploy attached `new.johnnyrhoades.com`, and it served over HTTP/2 straight away. The headers, `noindex`, redirects and the 404 were checked with curl, and the home page and press kit loaded with no CSP violations or console errors. GitHub Pages is off. One snag worth knowing: the first deploy failed with "Invalid format for Authorization header" because the clipboard held the wrong text when the secret was set. Rolling the token and pasting it at `gh secret set`'s own prompt fixed it.* In Cloudflare DNS, delete the `new` CNAME to `joe-at-heirloom.github.io`: a Worker's custom domain can't take over an existing CNAME. Then run the Site workflow, or push. The deploy job attaches `new.johnnyrhoades.com` to the Worker, and Cloudflare creates its DNS record and certificate within a few minutes. Check it, then turn GitHub Pages off in the repository settings:

    ```bash
    curl -sI https://new.johnnyrhoades.com/ | grep -iE "^HTTP|content-security|x-robots"
    ```

    *Before this (2026-10-02 to the move), staging ran on GitHub Pages: a `new` CNAME to `joe-at-heirloom.github.io`, DNS only.*
9. [x] Push to `main` and watch it go green. First deploy 2026-10-02 (GitHub Pages): sync skipped (no key yet), build and deploy green, IndexNow quiet (staging). After step 8, the deploy job is Wrangler's.
10. [ ] Review on real phones, and work through `docs/manual-checks.md` sections "Waiting on the staging deploy" and "Waiting on the service accounts". Every page should carry `noindex` (`SITE_NOINDEX`).

## Cutover

Pick a quiet weekday morning, not the day before a gig.

The headers, the redirect map (`/home`, the track pages, `/track/*`) and the caching all ship inside the deploy, in `dist/_headers` and `dist/_redirects` (ADR 0027). Nothing about them is set by hand.

11. [ ] **In the repository, don't push yet:** in `wrangler.jsonc`, change the route's `pattern` from `new.johnnyrhoades.com` to `johnnyrhoades.com`. Then set the repository variable `SITE_HSTS_MAX_AGE` to `300`, and delete `SITE_NOINDEX`.
12. [ ] **Cloudflare DNS.** Delete the Bandzoogle `A` and `AAAA` on the apex; their values are in the table above, for rollback. Replace the `www` CNAME with a proxied (orange cloud) `AAAA` record pointing to `100::`, a placeholder that only lets Cloudflare answer for `www`. **Leave MX and TXT alone.**
13. [ ] **Push the `wrangler.jsonc` change.** The deploy attaches `johnnyrhoades.com` to the Worker, and Cloudflare creates its record and certificate within a few minutes. `curl -sI https://johnnyrhoades.com/` should show the security headers and no `x-robots-tag`.
14. [ ] **Cloudflare, `www`:** Rules → Redirect Rules → a Single Redirect from `https://www.johnnyrhoades.com/*` to `https://johnnyrhoades.com/${1}`, 301, keeping the query string. Then SSL/TLS → Always Use HTTPS: on.
15. [ ] **Retire staging:** Workers & Pages → `johnnyrhoades` → Settings → Domains & Routes. Remove `new.johnnyrhoades.com` if it's still listed, which also removes its DNS record.
16. [ ] **The next day,** with HTTPS working on the apex and `www`: delete `SITE_HSTS_MAX_AGE` and run the Site workflow. HSTS goes back to a year.
17. [ ] Search Console and Bing: submit `https://johnnyrhoades.com/sitemap-index.xml`, and remove Bandzoogle's old `https://johnnyrhoades.com/sitemap.xml` (submitted 2022), which stops existing at cutover. Then build locally and send everything to IndexNow once (the deploy's own diff is empty on launch day, ADR 0012):

    ```bash
    npm run build && npm run -s indexnow -- plan --all | npm run -s indexnow -- submit
    ```

## After launch

18. [ ] `npm run check:redirects`: every row of the redirect map answers 301 to its target, and the target loads.
19. [ ] `curl -sI https://johnnyrhoades.com/ | grep -iE "content-security|strict-transport|permissions"`: headers present (they come from `dist/_headers`; `docs/security-headers.md`).
20. [ ] The rest of `docs/manual-checks.md`: Rich Results Test on two show pages, calendar subscriptions, a test booking (should arrive at `hello@`), an email to `hello@` from an outside address (mail still flows), a test signup with its region tag, Google Analytics events.
21. [ ] **Johnny:** keep Bandzoogle paid for 30 days as the rollback. Cancel it only after the exports are safe and email has worked for a month. Make sure cancelling Bandzoogle doesn't touch the domain registration (it's at Squarespace).
22. [ ] Day 28: Core Web Vitals in Search Console; first AI answer audit after launch (`docs/geo-audit-log.md`); verify the site in Ahrefs Webmaster Tools and rerun the Ahrefs baseline (`docs/search-baseline.md`). Rerun the baseline again on day 90.

## Rollback

**A bad deploy**, but the move itself is fine: `npx wrangler rollback`, or Workers & Pages → `johnnyrhoades` → Deployments → roll back. The previous version serves again in seconds.

**Back to Bandzoogle**, any time in the first 30 days. It takes about ten minutes and loses no data:

1. Workers & Pages → `johnnyrhoades` → Settings → Domains & Routes: remove `johnnyrhoades.com`. Its DNS record goes with it.
2. Cloudflare DNS: restore Bandzoogle's apex records from the zone export (publicly they were `A 172.65.197.38` and `AAAA 2606:4700:90:0:3626:d0ff:6957:de1`). Replace `www`'s `100::` record with a CNAME to the apex, and turn off the `www` redirect rule. With 5-minute TTLs, most visitors are back on Bandzoogle within minutes.
3. Check `https://johnnyrhoades.com/home` loads the Bandzoogle site. If Bandzoogle says the domain isn't connected, reconnect it in Bandzoogle's domain settings; their support can re-verify it.
4. Email is untouched throughout, as long as MX and TXT were never edited.

Re-launching later is steps 11 to 17 again.
