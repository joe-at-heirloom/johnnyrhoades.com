# 0020: Read the act from what Johnny already types

**Status:** Accepted, 2026-10-05. Closes the modeling half of ADR 0006.

## Context

The first real Bandsintown capture (2026-10-05, 609 events since 2015) showed that the plan's assumption was wrong. PLAN.md Appendix A asked Johnny to type the act in each show's title. He never has: every title is empty, all but three descriptions are empty, and the lineup is only ever him.

He does label his shows, just somewhere else. From October 2022 to August 2026, 595 of his venue names carry the act in front: "Solo Acoustic @ The Whiskey Six", "Motor City Josh and the Big 3 @ Three Blind Mice", "Pat Smillie Band (open jam) @ Kapones", "Acoustic Duo w/ Brett Lucas @ …". He has used 53 different wordings. Since September 2026 he has picked venues from Bandsintown's list, which brings the address through but leaves nowhere to put the label, so new shows are unlabeled.

Joe's call: don't make Johnny change how he works.

## Decisions

1. **The title is optional.** The act comes from the title if there is one, otherwise from the label in front of the venue name (`src/lib/act.ts`). "@" always splits a venue name. " - " and " at " split only when the left side reads as an act, so a room called "Eat at Joe's" stays whole. The label is kept in `rawTitle`.
2. **Read his words, and don't guess.** The reader knows his formats ("Solo Acoustic", "Johnny Rhoades Trio", "Hosting open jam") and treats a label as someone else's act only on a strong signal: "w/ …" or "with …", a name ending in Band, Duo or Trio, another name next to his, or Motor City Josh under any of his spellings. Anything else, like "Joe Cocker Tribute", is `unspecified` and billed as plain "Johnny Rhoades", which is always true. The tests run the reader over every show in the capture, and pin 26 of his wordings.
3. **No default act.** PLAN.md section 17 asked for one. An unlabeled show is billed "Johnny Rhoades" with no format tag, which is what the site already did for `unspecified`.
4. **Rooms are counted by street address.** He has typed the same room up to eight ways ("Cadieux Cafe", "The Cadiuex Cafe" and so on). Bandsintown has a street address for 594 of the 609 shows, so the proof line, venue history and most-played rooms count by address, falling back to the venue key (`roomOf` in `src/lib/shows-data.ts`). Display names for the most-played rooms come from `venues.yaml` match lists where his spelling wanders.
5. **The capture is a fixture.** It's committed as `tests/fixtures/bandsintown/upcoming.json` and `past.json`, with the app_id redacted (it's echoed into every event URL), and the label tests run against it.

## Numbers

| | By venue name | By address |
|---|---|---|
| Rooms, all time | 200 (295 before splitting off the labels) | 145 |
| Rooms, last 12 months | 47 | 35 |

The proof line from the real history: "106 shows in the last year, in 35 rooms across 26 towns." Of the 609 shows, 586 are now billed from his label: 239 solo, 290 in someone else's band, 19 as the Lucas Rhoades Band, 21 trio, 15 hosting, 2 full band.

## Consequences

- Nothing changes for Johnny. If he wants the format to show, he can type it in the title or go back to his old habit in the venue name. Either works.
- New shows picked from Bandsintown's venue list show no format until he types one. That's honest, and an override in `show-overrides.yaml` can label one by hand.
- The Lucas Rhoades Band is his own band under another name, so it's billed as "Lucas Rhoades Band", not as a guest spot, with the format left unspecified (Joe, 2026-10-05). Its structured data is a `MusicGroup` with him as a member.
- Four old shows have an event name where the venue should be ("Opening for Chris Cain w/ Brendon Linsley"). They predate the page cutoff, so they're archive rows only; fix them in `show-overrides.yaml` if they matter.
- The hand-written mocks are gone: every test now runs on the capture, which closes ADR 0006.
