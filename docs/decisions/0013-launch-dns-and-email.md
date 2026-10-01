# 0013: Launch prep: DNS is already on Cloudflare, and email stays on Zoho

**Status:** Accepted, 2026-09-30 (Phase 7 preparation). Supersedes the `booking@` part of ADR 0011.

## Context

PLAN.md section 14 assumes DNS still has to move to Cloudflare, and section 11 routes `booking@johnnyrhoades.com` through Cloudflare Email Routing. Public lookups on 2026-09-30 (`dig`, `whois`, and a crawl of the old site) showed:

- The nameservers are already Cloudflare's (`jean` and `sam`). Whose account holds the zone isn't known yet.
- The domain is registered at Squarespace Domains, expiring 2027-09-02.
- MX records point at Zoho Mail, with an SPF record for Zoho. Johnny has working email on the domain.
- The old Bandzoogle site has only `/`, `/home` and five track pages. `/music`, `/videos` and the rest the plan guessed at return 404 there, so they need no redirects.

## Decisions

- **`booking@` is a Zoho alias, not Cloudflare Email Routing.** Email Routing replaces a domain's MX records; turning it on would cut off Johnny's Zoho mailbox. An alias or group in Zoho delivers to the same inbox with no DNS change. Web3Forms delivers booking requests to whichever address Johnny picks.
- **DNS step 5 becomes "make sure the zone is on an account Johnny owns."** If it's his, nothing moves. If it's Bandzoogle's, the zone is exported and recreated on his own free Cloudflare account before anything else changes.
- **The redirect map lists what exists**, not what might: `/home` → `/`, and the five `/track/<id>/<slug>` pages → `/#music`. Cloudflare implements the tracks with one wildcard rule, so slug variants are covered too. `npm run check:redirects` holds the live site to the map after cutover; an end-to-end test checks every target exists in the build.
- **Rollback is DNS-only.** The Bandzoogle `A`/`AAAA` values are recorded in `docs/runbook-launch.md`, TTLs are lowered before cutover, and Bandzoogle stays paid for 30 days.

## Consequences

- PLAN.md section 11's Email Routing line no longer applies; ADR 0011's consequences pointed at it and are superseded here.
- Launch now hinges on one unknown: who controls the Cloudflare account with the zone. That's the first question for Johnny in the runbook.
