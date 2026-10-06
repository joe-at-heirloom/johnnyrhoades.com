# Bandsintown fixtures

`upcoming.json` and `past.json` are **real responses** from Johnny's Bandsintown, captured on 2026-10-05 with `npm run sync -- --capture` (5 upcoming shows and 604 past ones, back to 2015). The capture replaces the app_id that Bandsintown echoes into every event URL with `REDACTED`, since this repo is public.

They drive the normalizer tests, the sync script tests and `npm run sync:fixtures`. ADR 0006 records how the data model started from a hand-written mock; ADR 0020 records what the real data changed (Johnny labels the act in front of the venue name, never in the title).

## Refreshing them

1. `BANDSINTOWN_APP_ID=… npm run sync -- --capture --dry-run` saves `captured-<date>-upcoming.json` and `captured-<date>-past.json` here and leaves `src/data/shows.json` alone.
2. Grep both files for the key before anything else. It should only appear as `REDACTED`.
3. Replace `upcoming.json` and `past.json` with them, then fix whatever tests name a show or a count that changed.
