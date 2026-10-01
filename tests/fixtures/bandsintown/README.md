# Bandsintown fixtures (mock until the API key arrives)

**These are hand-written mocks, not captured API responses.** PLAN.md section 6.2 says to capture real responses before modeling. That waits on a Bandsintown `app_id` from Johnny's Bandsintown for Artists account. Until then, see ADR 0006.

## What's real and what isn't

- **The shows are real.** They're Johnny's public schedule as of 2026-09-30, with the same Bandsintown event IDs his current Bandzoogle site links to: seven upcoming shows and the two that had just passed.
- **The shape is real.** Field names and formats copy an event Bandsintown's servers returned on 2026-09-30 (15th Street Tavern, 2026-10-02). That includes `datetime` as venue-local time with no UTC offset, an empty `title`, venue coordinates as strings, and `free`.
- **Unknown fields are left empty, not invented.** Street address, postal code, coordinates and end time are only filled where that response included them (15th Street Tavern). Bandsintown leaves them empty for venues entered by hand, so the normalizer has to cope with that anyway.
- **The `url` query strings use `app_id=mock`.** The normalizer strips query strings.

## When the real key arrives

1. `BANDSINTOWN_APP_ID=… npm run sync -- --capture`. This saves the raw responses here as `captured-<date>-upcoming.json` and `captured-<date>-past.json`.
2. Compare them with these mocks and fix `src/lib/bandsintown.ts` and `src/lib/normalize.ts` wherever they differ.
3. Point `npm run sync:fixtures` and the unit tests at the captured files, delete the mocks, and close ADR 0006.
