# 0014: Design pass: layout and rhythm, same visual language

**Status:** Accepted, 2026-10-01

## Context

Joe's verdict on the finished Phase 6 site: "this website isn't world class." Looking at every page at desktop and phone sizes, the problems were in layout and rhythm, not the visual language (black, bone and blues red, one typeface, the record and the strum):

- **The most useful fact was missing up top.** The hero had the name and two buttons. Where Johnny plays next was a full scroll away.
- **Every section was the same template.** Each had a huge condensed heading over two columns, with the left column holding a few lines and then half a screen of nothing (Shows, Booking).
- **One long black scroll.** Section backgrounds differed by a shade nobody can see, with about 300 px of empty black between them. Only the mailing list broke the pattern.
- **The show list read like a table**, not a gig listing.
- **The photo grid ended ragged**, with a hole in one column.
- **Dated details:** a mouse-shaped scroll cue, and an offset red frame behind the About photo.
- **A bug:** on the press kit, the nav lit up "Photos", because the press kit has its own `#photos` section.

## Decisions

- **The next show in the hero.** It's set like the top line of a gig poster under the name, with venue, date, time and town, and links to the show page. Rendered at build time; `src/scripts/tonight.ts` moves it on if that show ends before the next build, and says "Tonight" on the day.
- **Show rows as a gig listing.** A date block (month over a big day number, weekday and time beside it), the venue in display caps, and a bone "ticket" inversion on hover and keyboard focus. Screen readers get the plain date. Used everywhere show lists appear.
- **No half-empty columns.** The Shows section is full width, with the intro beside the heading. The booking form is full width in a four-column grid (two rows of fields and the details box) instead of a tall card beside three lines of text. The show page puts "Promote this show" beside the poster instead of below it.
- **Rhythm from the palette we have.** Booking becomes a bone section and the mailing list a flat red band, so the page ends black, bone, red, black instead of black on black. Section spacing comes down from 150 px to 116 px at most.
- **About runs to the edge.** The portrait fills half the width with no frame; the words sit beside it.
- **A gallery that closes square.** `src/lib/gallery.ts` places photos by shape (portrait or landscape, now recorded in `media.yaml` and checked against the files): a big landscape with two portraits, two portraits with a big landscape, then four small. It works on four columns and on two.
- **Removed:** the scroll cue and its animation, the About photo's offset frame. Nothing new moves.

**Colors:** no new hues. Text on bone uses three tints of ink, now tokens (`--ink-on-bone-2`, `--ink-on-bone-3`, `--paper`); they were hard-coded in the mailing list before. Bone text on the red band is 4.6:1, the same pairing the red buttons already use.

## Consequences

- Lighthouse on the home page went from 96 to 97, at 321 KB (from 345 KB). Accessibility, best practices and SEO stay at 100; axe passes on every page.
- A gallery photo now needs a `shape` in `media.yaml`. A unit test checks each one against the image file, and the schema refuses a gallery photo without one.
- Before and after: `docs/case-study/design-pass-before-*.jpg` and `design-pass-after-*.jpg`.
