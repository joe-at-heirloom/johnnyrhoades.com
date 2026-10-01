# Manual checks

Acceptance criteria that need a person, a deployed site or a third-party tool. Each one says what the automated tests already cover, so the manual step only fills the gap. Save screenshots in `docs/screenshots/` and tick the box.

## Waiting on the staging deploy

- [ ] **Rich Results Test, two show pages** (Phase 2). Paste two show page URLs into https://search.google.com/test/rich-results. Expect "Event" detected, with no errors. *Automated now:* `tests/unit/shows-output.test.ts` checks Google's required event fields with zod; `tests/e2e/shows.spec.ts` checks the markup on a built page.
- [ ] **Calendar subscription in Apple Calendar** (Phase 2). On an iPhone, open `webcal://<staging-host>/shows.ics` and subscribe. Expect every upcoming show at the right local time. *Automated now:* the feed is parsed by ical.js in the unit tests.
- [ ] **Calendar subscription in Google Calendar** (Phase 2). Use "Add to Google Calendar" on `/shows/`. Expect the calendar to appear and update within a day.
- [ ] **Link previews** (Phase 3). Paste a show page link into iMessage, Facebook's Sharing Debugger and Slack. Expect the show's poster as the preview image.

## Waiting on Johnny's Bandsintown key

- [ ] **Live sync** (Phase 1). Run `BANDSINTOWN_APP_ID=… npm run sync -- --capture`, compare the captured payloads with the mocks (`tests/fixtures/bandsintown/README.md`), fix any differences, and close ADR 0006.

## Waiting on Johnny's answers (PLAN.md section 17)

- [ ] **Press photo zip** (Phase 4). Once photographers and licenses are confirmed, add `credit` and `license` and the `press` use in `src/data/media.yaml`. The zip builds itself. *Automated now:* the zip route, and a test that it's absent without qualifying photos.
- [ ] **Detroit Music Award line.** With a year, category and listing, move the fact to `confirmed_by_johnny` or `verified` in `facts.yaml` and add it back to `HOME_ABOUT` in `src/lib/copy.ts`.
- [ ] **Formats, long bio, booking email.** Each needs Johnny's answer first; the press kit leaves them out until then.
