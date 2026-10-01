# 0006: Mock Bandsintown until the API key arrives, and where the data model grew

**Status:** Accepted, 2026-09-30 (Phase 1). The mock part is temporary.

## Context

PLAN.md section 6.2 says to capture real API responses before modeling. The Bandsintown API refuses requests without an `app_id` (HTTP 403), and that has to come from Johnny's Bandsintown for Artists account, which we don't have access to yet. Joe asked to keep going with mocked data.

## Decision

**1. Model against a faithful mock, then verify against a capture.**

- `tests/fixtures/bandsintown/upcoming.json` and `past.json` copy the field names and formats of a real event Bandsintown returned on 2026-09-30.
- The shows in them are Johnny's real public schedule, with real event IDs. Nothing is invented: fields that weren't in the real response (most addresses, end times) are left empty, as Bandsintown does.
- `npm run sync:fixtures` builds `src/data/shows.json` from them. The fixtures README describes the swap-over: `npm run sync -- --capture` saves real responses, the mocks get diffed against them and then deleted, and this record is closed.

**2. Things the plan's data model didn't anticipate** (PLAN.md section 6.1 has been updated to match):

- **`end`**: Bandsintown has an optional end time (`ends_at`). ICS needs `DTEND`, and `MusicEvent` takes an `endDate`.
- **`venue.timeZone`**: Bandsintown times are venue-local with no offset. A show in Chicago is in Chicago time, so treating every show as Detroit time would be wrong by an hour. A short state-to-zone table in `src/lib/time.ts` handles neighbors and likely road trips, and defaults to Detroit. Times are still converted only through luxon.
- **Country codes**: Bandsintown says "United States"; `PostalAddress` wants "US". Normalized to ISO 3166-1 alpha-2.

**3. Rules the plan left open:**

- **Slug collisions.** Two shows at the same room on the same day (a matinee and an evening set): the show stored first keeps the plain slug, and the newer one gets its start time appended (`…-3pm`). Existing slugs never change because of a new show.
- **"Collapsed" for the guard.** Besides an empty upcoming list (the plan's rule), the guard fails if more than half (and at least four) of the stored future shows go missing in one sync. `--force` overrides it for real calendar clean-ups.
- **When `sync-meta.json` changes.** Only on a real data change or the weekly heartbeat, so passing shows (which shift the counts) don't cause commits.
- **`TODO` values in `venues.yaml`** count as missing, so placeholders can never reach a page.

## Consequences

- Phase 1's first acceptance check ("`npm run sync` with the secret produces a valid `shows.json`") is met only for fixtures. It stays open until the key arrives.
- The mock bakes in one real observation that matters: `title` is empty on Johnny's events today. Every show is `unspecified` until he starts labeling them (`docs/bandsintown-naming.md`) or a default act is chosen (PLAN.md section 17).
- The workflow skips the sync, with a warning, while the secret is missing, and builds from the committed data.
