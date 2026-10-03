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

**Email changes the plan.** PLAN.md section 11 routes `booking@johnnyrhoades.com` through Cloudflare Email Routing. Email Routing needs its own MX records, which would replace Zoho's and cut off Johnny's mailbox. Make `booking@` an alias (or a group) in Zoho instead, which costs nothing on the free plan (ADR 0013).

## Before launch

1. [ ] **Johnny:** access to Squarespace Domains, Bandzoogle, Bandsintown for Artists, Zoho Mail admin, and the Cloudflare account that holds the zone. If nobody knows which Cloudflare account it is, Squarespace or Bandzoogle support can say who set the nameservers. If it's Bandzoogle's, the zone moves to a free Cloudflare account Johnny owns in step 5.
2. [ ] **Exports.**
   - Bandzoogle mailing list (CSV). Record the count in `docs/case-study-notes.md` as the baseline (PLAN.md section 13), then import it into Buttondown.
   - Audio, and the original photo files with photographer names (they unlock the press photo zip; `docs/manual-checks.md`).
   - The full DNS zone from Cloudflare (DNS → Records → Export), saved outside the repo.
3. [x] **Redirect map.** The old site was crawled on 2026-09-30: `docs/redirect-map.csv`. Re-crawl the week of launch in case Johnny added pages.
4. [ ] **Search Console.** Add a Domain property for johnnyrhoades.com and verify it with the TXT record it gives. Do it now: the baseline starts from verification. Add Bing Webmaster Tools too (it can import from Search Console).
5. [ ] **DNS on an account Johnny owns.** Skip if it already is. Otherwise add johnnyrhoades.com to his Cloudflare account (free plan), import the zone export, check that the Zoho MX and TXT records came across exactly, lower every TTL to 5 minutes, then change the nameservers at Squarespace Domains to the pair Cloudflare gives. When `dig NS johnnyrhoades.com` shows the new pair, send Johnny a test email.
6. [ ] **GitHub verified domain.** GitHub → Settings → Pages → Add a verified domain → johnnyrhoades.com, and add the `_github-pages-challenge-…` TXT record. This stops anyone else's Pages site from claiming the domain.
7. [x] Public repository: https://github.com/joe-at-heirloom/johnnyrhoades.com (2026-10-02). In the repo:
   - [x] Settings → Pages → Source: GitHub Actions.
   - [x] Variable `SITE_NOINDEX` = `true`.
   - [ ] Secret `BANDSINTOWN_APP_ID` (from Bandsintown for Artists → Settings). Run `BANDSINTOWN_APP_ID=… npm run sync -- --capture` locally first and compare with the mocks (ADR 0006).
   - [ ] Variables `PUBLIC_WEB3FORMS_KEY`, `PUBLIC_BUTTONDOWN_USER`, `PUBLIC_UMAMI_WEBSITE_ID` (ADR 0011).

## Staging

8. [ ] DNS: `new` CNAME to `joe-at-heirloom.github.io`, DNS only (grey cloud). The Pages custom domain is already set to `new.johnnyrhoades.com`, so the site appears there as soon as the record exists. Wait for the certificate, then tick Enforce HTTPS.
9. [x] Push to `main` and watch it go green. First deploy 2026-10-02: sync skipped (no key yet), build and deploy green, IndexNow quiet (staging).
10. [ ] Review on real phones, and work through `docs/manual-checks.md` sections "Waiting on the staging deploy" and "Waiting on the service accounts". Every page should carry `noindex` (`SITE_NOINDEX`).

## Cutover

Pick a quiet weekday morning, not the day before a gig.

11. [ ] Pages custom domain: change to `johnnyrhoades.com`.
12. [ ] DNS, apex: delete the Bandzoogle `A` and `AAAA`. Add `A` records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` and `AAAA` records `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`, all DNS only. `www`: CNAME to `<github-user>.github.io`, DNS only. **Leave MX and TXT alone.**
13. [ ] When GitHub shows the certificate as issued, tick Enforce HTTPS.
14. [ ] Turn the Cloudflare proxy on (orange cloud) for the apex and `www`. SSL/TLS: Full (strict). Always Use HTTPS: on. If GitHub later has trouble renewing the certificate, switch to DNS only for a few minutes while it renews.
15. [ ] Cloudflare rules:
    - Redirect (Single Redirect, wildcard): `https://www.johnnyrhoades.com/*` → `https://johnnyrhoades.com/${1}`, 301, keep query string.
    - Redirect: `https://johnnyrhoades.com/home` → `https://johnnyrhoades.com/`, 301.
    - Redirect (wildcard): `https://johnnyrhoades.com/track/*` → `https://johnnyrhoades.com/#music`, 301. Covers the five track pages in the map and any slug variant.
    - Security headers, report-only first, and the cache rules: `docs/security-headers.md`.
16. [ ] Delete the `SITE_NOINDEX` variable and run the Site workflow.
17. [ ] Search Console and Bing: submit `https://johnnyrhoades.com/sitemap-index.xml`. Then build locally and send everything to IndexNow once (the deploy's own diff is empty on launch day, ADR 0012):

    ```bash
    npm run build && npm run -s indexnow -- plan --all | npm run -s indexnow -- submit
    ```

## After launch

18. [ ] `npm run check:redirects`: every row of the redirect map answers 301 to its target, and the target loads.
19. [ ] `curl -sI https://johnnyrhoades.com/ | grep -iE "content-security|strict-transport|permissions"`: headers present. After a clean week in report-only, enforce the CSP, then raise HSTS from 300 to a year.
20. [ ] The rest of `docs/manual-checks.md`: Rich Results Test on two show pages, calendar subscriptions, a test booking (should arrive at `booking@` via Zoho), a test signup with its region tag, Umami events.
21. [ ] **Johnny:** keep Bandzoogle paid for 30 days as the rollback. Cancel it only after the exports are safe and email has worked for a month. Make sure cancelling Bandzoogle doesn't touch the domain registration (it's at Squarespace).
22. [ ] Day 28: Core Web Vitals in Search Console; first AI answer audit after launch (`docs/geo-audit-log.md`).

## Rollback

Any time in the first 30 days, about ten minutes, no data lost:

1. Cloudflare DNS: delete the GitHub `A`/`AAAA` records on the apex and restore Bandzoogle's (from the zone export; publicly they were `A 172.65.197.38` and `AAAA 2606:4700:90:0:3626:d0ff:6957:de1`). Set `www` back to a CNAME to the apex. With 5-minute TTLs, most visitors are back on Bandzoogle within minutes.
2. Cloudflare rules: turn off the `/track/*` and `/home` redirects (they'd break Bandzoogle's pages). The security headers can stay; or turn them off if Bandzoogle's pages complain.
3. GitHub Pages: remove the custom domain, so Pages stops answering for it. The verified domain stays.
4. Check `https://johnnyrhoades.com/home` loads the Bandzoogle site. If Bandzoogle says the domain isn't connected, reconnect it in Bandzoogle's domain settings; their support can re-verify it.
5. Email is untouched throughout, as long as MX and TXT were never edited.

Re-launching later is steps 11 to 17 again.
