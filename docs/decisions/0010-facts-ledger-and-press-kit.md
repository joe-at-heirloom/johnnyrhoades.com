# 0010: The facts ledger, enforced; and the press kit built on it

**Status:** Accepted, 2026-09-30 (Phase 4)

## Context

PLAN.md section 6.4 says every biographical claim comes from `src/data/facts.yaml`, with status rules for where each may appear, "enforced by a check script in CI". Phase 4 also builds `/epk/`, the page bookers get, which leans on those claims more than any other.

## Decisions

**Pages ask for facts instead of stating them.**
- Copy that states a biographical fact pulls it by id: the home page About, the press kit's bios, fast facts and FAQ, and the structured data Person description. The ids live in `src/lib/copy.ts`.
- `ledger().get(id, context)` throws if the status isn't allowed in that context, so a bad use fails the build.
- Facts carry third-person text (`third`) and, where the home page needs it, Johnny's voice (`first`).

**`npm run check` runs `scripts/check-facts.ts`, which:**
- validates `facts.yaml`, `media.yaml` and `profiles.yaml`
- checks every use in `copy.ts` against the status rules
- scans `src/` for the `detect` text of every unverified fact, so a claim can't slip past the ledger in hand-written copy

An end-to-end test scans the built pages for the same text.

**How statuses were assigned:**
- **`verified`:** an independent source says it. That covers the album release (Apple Music), the Anti-Freeze Blues Festival 2017 (lineup on Ferndale Friends), the Cliff Bell's 2017 headline (venue listing), and his identity as a Detroit guitarist and singer (Cliff Bell's, plus a 2010 blog listing him on guitar and vocals in Motor City Josh & the Big 3).
- **`confirmed_by_johnny`:** Johnny's own published bio, and videos he lists on his own site. PLAN.md section 17 still asks him for details on several of these (dates, venues, who with). That's for a longer bio, not for whether they happened.
- **`unverified`:** the Detroit Music Award nomination (no year, category or listing found) and the solo, trio and full band formats.

**The home page loses one line.** "I was also nominated for a Detroit Music Award" came off the About section. It's `unverified`, and the plan is explicit that those appear nowhere until resolved. It comes back the moment Johnny supplies a year and category and the ledger entry moves to `confirmed_by_johnny` or `verified`.

**The press kit waits rather than guesses.** No formats section, long bio or press quotes until Johnny answers PLAN.md section 17. The booking contact is the form until he picks a public booking email.

**Photo credits:** two photos carry photographer watermarks (Jane Cassisi Photography; John Rocklin). Those are recorded as "(from the watermark)" until confirmed. `media.yaml` refuses to mark any photo `press` without a confirmed credit and license. The press photo zip (`/press/johnny-rhoades-press-photos.zip`, built with fflate) only exists when at least one photo qualifies. Until then the press kit says high-resolution photos are available on request. Logo files for dark and light backgrounds are generated from the original artwork and always available.

**Structured data:** the Person `sameAs` comes from `profiles.yaml` (live official profiles, never stores). The album lists its ten tracks as `MusicRecording`s, and each video gets a `VideoObject`, with upload dates and lengths read from YouTube.

## Consequences

- Changing what the site says about Johnny is a data change in one file, reviewed against a rule, rather than a hunt through templates.
- As Johnny answers the questions in PLAN.md section 17, sections switch on with no template work: formats, the long bio, press photos, the Detroit Music Award line.

*Update, 2026-10-02:* the Detroit Music Award line came back as two wins rather than a nomination (`motor-city-josh-detroit-music-awards`, verified), and the unverified nomination was retired. Notes from Joe are recorded as leads in `needs` and don't change a status on their own.

*Update, 2026-10-05:* Johnny asked for his bio in the third person. The home page About is now the same running bio as the press kit's medium bio, and the `first` field gave way to `bio` (ADR 0022).
