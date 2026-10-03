# 0017: The show card, a classic blues poster template

**Status:** Accepted, 2026-10-02. Supersedes the look and the duotone photo slot in ADR 0009; the engine (satori, resvg, the cache, the formats) stays.

## Context

Joe felt the site was missing "something classic blues", along the lines of a B.B. King or a velvet Hendrix poster. Their faces and their posters aren't ours to use, and putting them on Johnny's site would make it read like a tribute page. A velvet blacklight look means neon on black, which the "too instagrammy" feedback already ruled out.

What fits is the form those artists toured on: the letterpress show card. A band across the top says IN PERSON, the headliner's name is set as big as the card allows, every line is a different width of wood type, and heavy rules divide the card. The date sits in a solid block of ink. It's printed in black and one color on bone card stock.

The first posters (ADR 0009) were clean and modern, with the venue as the hero. A prototype of the card with the name big went up on 2026-10-02; Joe's verdict was "I like this aesthetic." He chose the card for every format, and Johnny's name biggest on guest spots too.

## Decisions

- **One template, the card, for every format** (`src/lib/posters/show-card.ts`): the link preview, Google's three event image ratios, the Instagram post and Story, and the printed flyer. The bill template is gone.
- **The name is the hero; the venue comes second.** JOHNNY / RHOADES is set on two lines, each filling the full width. Each line takes whichever Archivo width cut lands it at the biggest size the space allows (`fillLine`), the way a printer pulled different wood type for each line. On wide formats the name runs as one line. `nameLines` picks one line or two, whichever sets it bigger.
- **The act sits under the name in red** ("Trio", "Solo acoustic"). It's left off when the act isn't known.
- **Guest spots bill Johnny first** with the band under him: JOHNNY RHOADES / WITH MOTOR CITY JOSH & THE BIG 3. That's how his fans find the show. The alt text follows the card ("Poster: Johnny Rhoades, with Motor City Josh & The Big 3, at…"). The show page's heading still uses the Bandsintown billing, with the bandleader first.
- **Bone stock, black and red ink.** These are the site's own tokens (`--bone`, `--ink`, `--red`, `--ink-on-bone-2`, `--ink-on-bone-3`). There are no new colors or typefaces. Every pairing passes 4.5:1 (tested). The logo is left off: the name in wood type does that job.
- **Printed, not rendered.** The PNGs get the site's paper grain and letterpress wear (ADR 0015) in `src/lib/posters/print.ts`, in one overlay: grain only on bare stock (ink covers paper), wear only well inside heavy ink. The first version wore every stroke, and a void across the I in "MI" read as "MI!". As on the site, only big type wears. Regenerated textures change the cache key.
- **On the show page, the card is inline SVG, not the PNG.** Grain doesn't compress: the textured Instagram post is 171 KB, where the bill's was 73 KB, and a palette PNG or WebP only got it to about 85–100 KB. The page instead inlines satori's own SVG of the same layout: vector paths, no fonts needed, about 16 KB gzipped. It sits on a bone frame with the paper texture and is labeled with the alt text. The same element is the printed flyer: white paper, sharp at any size, one US Letter page. The textured PNGs are for posting, link previews and event markup.
- **Cancelled:** the band says CANCELLED, and the venue and date panel go gray.
- **Stories keep clear of Instagram's own buttons** (11% top, 13% bottom).
- **Removed: the duotone photo slot** (`duotone.ts`, `poster-photos.yaml`). Classic cards often carried a photo, and a halftone of the hero shot looked right in the prototype. But no format had room for it without shrinking the name, and the slot had shipped empty, waiting on photographer credits. It's in git history if that changes.

## Consequences

- Renders take a median 86 ms per format, texture included, under the 150 ms budget (the bill took 72 ms). Every venue name in the data fits in every format, the longest included. The name is always the biggest type on the card, and each line of it runs at least 95% of the width (tested).
- Snapshots for the five fixtures are the card now. `TEMPLATE_VERSION` is 6, so every cached render is redrawn once.
- A show page is lighter than before (no poster PNG to load). Lighthouse on a show page: performance 98–99, accessibility 100, LCP about 2 s (the warning line), set by render delay rather than the download.
- Comparison: `docs/case-study/show-card-prototype-feed.jpg` (the bill above, cards below, Johnny's real upcoming shows) and `show-card-prototype-formats.jpg`.
