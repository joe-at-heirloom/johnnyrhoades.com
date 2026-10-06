# 0023: Formspree for both forms, and Google Analytics

**Status:** Accepted, 2026-10-05. Supersedes the services chosen in ADR 0011 (Web3Forms, Buttondown, Umami). The interfaces it set up stay.

## Context

ADR 0011 picked Web3Forms for booking requests, Buttondown for the mailing list and Umami for analytics, and waited on accounts for all three. On 2026-10-05 Joe picked differently: Formspree for the forms, Google Analytics for analytics, and no mailing list service for now ("just have submit to formspree"). He set up two Formspree forms (booking `mqpeaklz`, newsletter `mzedzbvd`) and a GA4 property (`G-ZD74NE0HZS`).

## Decisions

- **Both forms post to Formspree,** each to its own form, through the same two functions in `src/lib/forms.ts`, so the markup didn't change shape. JSON with `Accept: application/json`; `_subject` sets the email's subject (the booking one is still the triage line, "Booking: Sat, Oct 24, Blue Goose Inn, …"); the `email` field becomes the Reply-To. The honeypot is Formspree's `_gotcha`, which it drops on its own too.
- **Signups are emails for now.** Each one arrives at Johnny's inbox as "Mailing list signup: Metro Detroit", with the ZIP and its region, so nothing is lost while there's no list service. When there is one, only `sendSignup` changes.
- **The IDs are defaults in the code** (`src/lib/public-config.ts`), not repository variables. They're public by design and already in every page, and defaults mean the live site works without settings anyone has to remember. A `PUBLIC_*` variable still overrides each one; that's how the end-to-end build points the forms at fakes.
- **Google Analytics, loaded with care** (`src/scripts/analytics.ts`):
  - only on the real domain (`johnnyrhoades.com`, `www.`), so staging, previews and tests never count;
  - never for a visitor whose browser sends Global Privacy Control or Do Not Track, the same courtesy Umami's `data-do-not-track` gave;
  - after the page has loaded and the browser is idle, so `gtag.js` stays off the critical path. Events queue in `dataLayer` from the first moment and send when it arrives.
- **Events keep their names** (PLAN.md section 13): `booking_submit`, `email_click`, `poster_download` and the rest. Links declare theirs in markup as `data-event`, with `data-event-*` parameters, and one click listener sends them. `data-umami-event` is gone.
- **The security policy follows Google's documented CSP for GA4,** including its subdomain wildcards (`https://*.google-analytics.com` and the like), because GA picks a regional host per hit. The unit test still bans a bare `*` and allows wildcards only on Google's analytics domains.

## Consequences

- **The JavaScript budget.** CLAUDE.md's 30 KB budget (non-negotiable 7) counts the site's own script before interaction, and that's unchanged (the loader is under 1 KB). `gtag.js` is far bigger and isn't counted: it arrives after load, when the browser is idle, and never on staging, so Lighthouse CI doesn't see it. It does cost real visitors' data on the live site. That's the price of Google Analytics, chosen knowingly.
- **Cookies.** GA4 sets first-party cookies, which Umami didn't. The site has no cookie banner. Its visitors are almost all in Michigan, where none is required, and GPC and DNT are honored. If that changes, consent mode goes in `analytics.ts`.
- **Formspree's free plan:** 50 submissions a month across both forms, submissions kept 30 days, no CSV export, and no custom redirect. Without JavaScript, a visitor lands on Formspree's own thank-you page instead of `/thanks/`. Every submission is emailed, so the inbox is the record. If booking requests plus signups pass 50 a month, upgrade or move signups to a list service.
- **No mailing list service yet.** Buttondown, the ZIP-to-region tags as list segments, and RSS-to-email (PLAN.md section 11) wait until Joe wants a list.
