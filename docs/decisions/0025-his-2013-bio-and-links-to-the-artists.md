# 0025: His 2013 bio goes in, and the bios link the artists they name

**Status:** Accepted, 2026-11-22. Raises the bio lengths in PLAN.md (section 7.4 and Appendix C) and adds `src/data/artists.yaml`.

## Context

The Ahrefs pass (`docs/search-baseline.md`) found a musicpage profile at #3 for "johnny rhoades". musicpage.com is down, but the Wayback Machine kept a copy from 2022-05-17: Johnny's own bio from 2013, written for the profile he made as "John Rhoades Band". Joe confirmed the profile is Johnny's. It has things the site never said: his first sit-in at the Blue Goose at 16, jazz at Western Michigan, touring with Kelley Hunt, playing for Sharrie Williams (spelled "Sherrie" there; Joe confirmed who it is) and Stacia Petrie, and his first record, the EP *Breakin’ Out*. The old site it names led to his 2014 Kickstarter for his first full-length record.

Joe asked for all of it in the bio, and for the bio to link the artists it names.

## Decisions

- **His published bio counts as his word.** The ledger already treats his Bandzoogle About text as `confirmed_by_johnny`. The musicpage bio is the same thing, from 2013, so its facts are `confirmed_by_johnny`, sourced to the archived copy. Joe's confirmation only says whose profile it is; the facts are Johnny's words. Where it said "currently", the ledger uses the past tense and gives no years it doesn't have.
- **One claim stays out.** The Kickstarter said Motor City Josh *would* produce the record at the Sound Shop and co-write most of it, before the album had a name. Apple Music lists no credits, so it stays `unverified` until Johnny says so. The Kickstarter's totals are Kickstarter's own record, so they're `verified`. The bio puts them next to *Waiting on the Sun*, and doesn't say the two are the same record.
- **Longer bios.** The home About, which is also the press kit's medium bio (ADR 0022), grows from about 150 words to about 275, in four paragraphs. The long bio grows from about 350 to about 400. The short bio doesn't change. A promoter who needs about 150 words now has the short bio and the long one to work from; if that becomes a problem, the medium bio can stop being the home About.
- **Sharrie Williams and Stacia Petrie join the "shared stages" sentence** rather than getting one of their own.
- **Artists' names link to their own pages,** on the first mention in each bio: the home About and the press kit's short, medium and long bios, each on its own, since promoters copy one. Fast facts, the FAQ and `llms.txt` stay plain. Only a page the artist runs goes in `artists.yaml`, fetched and checked first. An expired domain serving spam is the risk here; Sharrie Williams's old one already does, so her link is her official Facebook page. Paul Carey has no page, and the influences (B.B. King and the rest) aren't people he played with, so none of them is linked.
- **The links look like the footer's:** underlined, the body text's color, brighter on hover. No new color or motion.

## Consequences

- `src/lib/artists.ts` does the linking, a pure function over a whole bio, so "first mention" doesn't depend on the order components render. Unit tests cover first mentions, titles, possessives and longer names. An end-to-end test checks both pages against `artists.yaml`.
- `npm run check` validates `artists.yaml`, and a unit test fails if an artist in it stops being named in a bio.
- The weekly lychee run checks the artist pages along with every other external link.
- **Waiting on Johnny:** the year of *Breakin’ Out*, and whether Josh produced *Waiting on the Sun*.
