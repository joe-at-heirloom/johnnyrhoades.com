# Manual checks

Acceptance criteria that need a person, a deployed site or a third-party tool. Each one says what the automated tests already cover, so the manual step only fills the gap. Save screenshots in `docs/screenshots/` and tick the box.

## Waiting on the staging deploy

- [ ] **Rich Results Test, two show pages** (Phase 2). Paste two show page URLs into https://search.google.com/test/rich-results. Expect "Event" detected, with no errors. *Automated now:* `tests/unit/shows-output.test.ts` checks Google's required event fields with zod; `tests/e2e/shows.spec.ts` checks the markup on a built page.
- [ ] **Calendar subscription in Apple Calendar** (Phase 2). On an iPhone, open `webcal://<staging-host>/shows.ics` and subscribe. Expect every upcoming show at the right local time. *Automated now:* the feed is parsed by ical.js in the unit tests.
- [ ] **Calendar subscription in Google Calendar** (Phase 2). Use "Add to Google Calendar" on `/shows/`. Expect the calendar to appear and update within a day.
- [ ] **Link previews** (Phase 3). Paste a show page link into iMessage, Facebook's Sharing Debugger and Slack. Expect the show's poster as the preview image.

- [ ] **Staging stays out of search** (Phase 6). With `SITE_NOINDEX=true` set, view source on a few staging pages: expect `<meta name="robots" content="noindex, nofollow">`, and no `Sitemap:` line in `/robots.txt`. *Automated now:* the robots.txt rule; checked by hand with a local `SITE_NOINDEX=true` build.
- [ ] **Security headers in report-only mode** (Phase 6). Add the headers from `docs/security-headers.md` with the CSP as `Content-Security-Policy-Report-Only`, then click through every page with the console open. Expect no reports. Then enforce it. *Automated now:* `tests/e2e/csp.spec.ts` serves the site under the exact policy.
- [ ] **Security headers scan** (Phase 7). After cutover, run https://securityheaders.com and https://observatory.mozilla.org on the apex. Expect an A or better.

## Waiting on launch day (Phase 7)

The full sequence is `docs/runbook-launch.md`; these are the checks that close it.

- [ ] **Redirects.** `npm run check:redirects` after the Cloudflare rules are in. Expect every row of `docs/redirect-map.csv` to answer 301 to its target. *Automated now:* the map parses, and every target exists in the build.

- [ ] **Submit the sitemap** (`https://johnnyrhoades.com/sitemap-index.xml`) in Search Console and Bing Webmaster Tools. Expect "Success" and the show pages discovered.
- [ ] **First IndexNow ping.** Staging deploys will already have `/shows.json` live, so the deploy's diff is empty on launch day. Build, then run `npm run -s indexnow -- plan --all | npm run -s indexnow -- submit` once, and check Bing Webmaster Tools → IndexNow.
- [ ] **Core Web Vitals in the field** (28 days after launch). Search Console → Core Web Vitals, mobile. Expect LCP ≤ 2.0 s, CLS ≤ 0.05, INP ≤ 150 ms. Lighthouse in the lab reads LCP around 2.6 s under its slow-4G simulation (ADR 0012).

## Waiting on the service accounts (Phase 5, ADR 0011)

Set each ID as a GitHub Actions repository **variable** (not a secret; they're public by design) and in `.env` for local testing.

- [ ] **Web3Forms** (`PUBLIC_WEB3FORMS_KEY`). Create an access key at https://web3forms.com with the inbox Johnny reads. Send a test booking from staging. Expect an email with the subject `Booking: {date}, {venue}, {event type}` and reply-to set to the booker. Then turn JavaScript off and send another; expect `/thanks/`. *Automated now:* `tests/e2e/forms.spec.ts` checks the payload, subject, success and error messages, and the no-JavaScript form attributes against an intercepted endpoint.
- [ ] **Buttondown** (`PUBLIC_BUTTONDOWN_USER`). Create the account, import the Bandzoogle export (see below), and create the tags Metro Detroit, Ann Arbor, Lansing, West Michigan, Elsewhere in Michigan and Out of state. Sign up from staging with a 48080 ZIP. Expect the subscriber with the Metro Detroit tag and `zip` metadata. *Automated now:* the region mapping and the posted fields.
- [ ] **Umami** (`PUBLIC_UMAMI_WEBSITE_ID`). Add johnnyrhoades.com in Umami Cloud. After launch, click through a show page and play a video. Expect the pageviews and the events (`directions_click`, `video_play` and so on). Staging won't count, by design (`data-domains`). *Automated now:* every event name, and the script attributes.
- [ ] **Bandzoogle mailing list export.** Export before anything else changes on the old site, and record the count as the baseline (PLAN.md section 13).
- [ ] **booking@johnnyrhoades.com** (Phase 7). The domain's email is Zoho Mail, so add `booking@` as an alias or group in Zoho, **not** Cloudflare Email Routing, which would replace Zoho's MX records (ADR 0013). Send a test, and point Web3Forms at it if Johnny wants.

## Waiting on Johnny's Bandsintown key

- [ ] **Live sync** (Phase 1). Run `BANDSINTOWN_APP_ID=… npm run sync -- --capture`, compare the captured payloads with the mocks (`tests/fixtures/bandsintown/README.md`), fix any differences, and close ADR 0006.

## Waiting on Johnny's answers (PLAN.md section 17)

- [ ] **Press photo zip** (Phase 4). Once photographers and licenses are confirmed, add `credit` and `license` and the `press` use in `src/data/media.yaml`. The zip builds itself. *Automated now:* the zip route, and a test that it's absent without qualifying photos.
- [ ] **Detroit Music Award line.** With a year, category and listing, move the fact to `confirmed_by_johnny` or `verified` in `facts.yaml` and add it back to `HOME_ABOUT` in `src/lib/copy.ts`.
- [ ] **Formats, long bio, booking email.** Each needs Johnny's answer first; the press kit leaves them out until then. Once there's a booking email, make it the form's error fallback in `src/scripts/forms.ts` (Facebook for now).
