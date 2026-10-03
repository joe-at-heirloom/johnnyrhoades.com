# 0017: The show card, a classic blues poster template

**Status:** Proposed, 2026-10-02 (prototype on `feat/show-card-poster`; not wired into the site)

## Context

Joe felt the site was missing "something classic blues", along the lines of a B.B. King or a velvet Hendrix poster. Their faces and their posters aren't ours to use, and putting them on Johnny's site would make it read like a tribute page. A velvet blacklight look means neon on black, which the "too instagrammy" feedback already ruled out.

What fits is the form those artists toured on: the letterpress show card. A band across the top says IN PERSON, the headliner's name is set as big as the card allows, every line is a different width of wood type, and heavy rules divide the card. The date sits in a solid block of ink. It's printed in black and one color on bone card stock.

The current posters (ADR 0009) are clean and modern, with the venue as the hero. Joe asked for a prototype with the name big.

## Decisions

- **A second template beside the bill, not a rewrite.** `src/lib/posters/show-card.ts` builds the card from the same `PosterContent`, fonts and fit-to-width code. `renderCardContent` in `render.ts` renders it. Nothing on the site uses it yet.
- **The name is the hero; the venue comes second.** JOHNNY / RHOADES is set on two lines, each filling the full width. Each line takes whichever Archivo width cut lands it at the biggest size the space allows (`fillLine`), the way a printer pulled different wood type for each line. On wide formats the name runs as one line. `nameLines` picks one line or two, whichever sets it bigger.
- **The act sits under the name in red** ("Trio", "Solo acoustic", "With Motor City Josh & The Big 3"). It's left off when the act isn't known.
- **Bone stock, black and red ink.** These are the site's own tokens (`--bone`, `--ink`, `--red`, `--ink-on-bone-2`, `--ink-on-bone-3`). There are no new colors or typefaces. Every pairing passes 4.5:1 (tested). The logo is left off: the name in wood type does that job.
- **Printed, not rendered.** The PNG gets the site's paper tile and the letterpress wear (ADR 0015). As on the site, only big type wears: voids land only well inside an inked area. The first version wore every stroke, and a void across the I in "MI" read as "MI!" (`src/lib/posters/print.ts`).
- **Cancelled:** the band says CANCELLED, and the venue and date panel go gray.
- **Stories keep clear of Instagram's own buttons** (11% top, 13% bottom).
- **Tried and dropped: a halftone photo of Johnny.** Classic cards usually carried one, and a 45° dot screen of the hero shot looked right. But no format had room for it without shrinking the name, and poster photos wait on photographer credits anyway (PLAN.md section 17).

## Consequences

- Renders take a median 86 ms per format, texture included, under the 150 ms budget (the bill takes 72 ms). Every venue name in the data fits in every format, the longest included. The name is always the biggest type on the card, and each line of it runs at least 95% of the width (tested).
- Comparison: `docs/case-study/show-card-prototype-feed.jpg` (today's posters above, cards below, Johnny's real upcoming shows) and `show-card-prototype-formats.jpg`.
- **If accepted:** decide which formats use the card (all of them, or the downloads and print flyer while `og` stays the bill). Add the template to the cache key, add card snapshots for the five fixtures, update the HTML print flyer to match, and set this record to Accepted.
- **Open question:** a guest spot puts Johnny's name biggest even when he's in someone else's band ("With Motor City Josh & The Big 3" sits under it). That's how his fans find the show, but the bandleader might expect top billing.
