# 0034: On a touch screen the page scrolls through the strum until you tap it

**Status:** Accepted, 2026-11-26. Amends ADR 0018.

## Context

The strum neck (ADR 0018) is as wide as the page and 132 px tall on a phone, and a strum is a swipe up or down across the strings. To get every swipe, the neck had `touch-action: none`. That is also the gesture for scrolling, so on a phone a thumb that landed on the neck while scrolling the home page stopped the page dead. Joe found it: the home page "won't stay up and down". Nothing on the page shifts as it scrolls (no layout shifts, measured while scrolling down and back up), and a mouse wheel scrolls past it fine; it was only touch.

## Decision

- **The page scrolls through the neck until you mean to play it.** The neck is `touch-action: pan-y`, so a swipe that starts on it scrolls the page, and nothing sounds.
- **A tap plays it and arms it.** A touch that ends where it began, within half a second, strums the next chord and arms the neck (`data-armed`, `touch-action: none`). While it's armed, a swipe strums and a held string bends, as with a mouse.
- **It lets go by itself.** Five seconds without touching the neck, or scrolling the page from anywhere else, disarms it.
- Mouse, pen and keyboard play it as before.

## Consequences

- On a phone the first strum is a tap rather than a swipe. Every later swipe, while armed, works as before.
- An end-to-end test on a touch-screen phone swipes from the middle of the neck and checks the page scrolls, then taps, swipes and scrolls away.
- The blues maker's pads keep `touch-action: none`: they're instruments, a drag up bends, and during a gig everything fits on one screen.
