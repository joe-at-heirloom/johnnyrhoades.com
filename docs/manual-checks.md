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

- [ ] **Formspree** (ADR 0023). Both forms are live with their IDs in the code. Check that each Formspree form sends to `hello@johnnyrhoades.com`, the inbox Johnny reads for work (ADR 0021). Send a test booking and a test signup from staging. Expect a booking email with the subject `Booking: {date}, {place}, {event type}` and Reply-To set to the sender, and a signup email with the ZIP and region. Watch the free plan's 50 a month.
- [ ] **Mailing list service** (later; ADR 0023). Not needed for launch: signups arrive by email. When Joe wants a list, import the Bandzoogle export and the Formspree signups, and create the region tags.
- [ ] **Google Analytics** (ADR 0023). It only runs on johnnyrhoades.com, so check after cutover: open the site, click through a show page and play a video, and expect the visit in GA's Realtime report with events like `directions_click` and `video_play`. With Global Privacy Control on in the browser, expect nothing.
- [ ] **Bandzoogle mailing list export.** Export before anything else changes on the old site, and record the count as the baseline (PLAN.md section 13).
- [ ] **hello@johnnyrhoades.com still gets mail** (Phase 7). After cutover, send it an email from an outside address and check it arrives. The cutover leaves MX and TXT alone, so this should pass; it's the check that matters most if it doesn't. *Automated now:* every email link on the site points to it (`tests/e2e/forms.spec.ts`).

- [ ] **Song clips on real phones** (ADR 0016). On an iPhone (Safari) and an Android phone (Chrome), press play on two songs. Expect sound, the tonearm on the record, and pause working. *Automated now:* everything but the sound itself, with silent stand-ins.

## Waiting on Johnny's Bandsintown key

- [x] **Live sync** (Phase 1). Done 2026-10-05: captured, compared with the mocks (ADR 0020), and the first live sync in the Site workflow committed 609 shows. The capture is now the test fixtures.

## Waiting on Johnny's answers (PLAN.md section 17)

- [ ] **Press photo zip** (Phase 4). Once photographers and licenses are confirmed, add `credit` and `license` and the `press` use in `src/data/media.yaml`. The zip builds itself. *Automated now:* the zip route, and a test that it's absent without qualifying photos.
- [x] **Detroit Music Award line.** Done 2026-10-02: the wins with Motor City Josh & The Big 3 (2020, 2023) are `verified` and on the home page, the bios and the press kit highlights.
- [ ] **Johnny's own song clips** (ADR 0016). From the Bandzoogle audio export, cut 30-second clips (m4a or mp3) into `public/audio/<slug>.m4a`, point each track's `preview` at `/audio/<slug>.m4a`, set `previewSource: own`, and remove the Apple host from `media-src` in `src/lib/security-headers.ts` and `docs/security-headers.md`.
- [x] **Formats and the long bio.** Done 2026-10-05 from Johnny's answers: the press kit's Formats section and the long bio. (The booking email is done too: `hello@`, ADR 0021.)
