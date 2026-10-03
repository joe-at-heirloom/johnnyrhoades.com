# 0018: The 12-bar strum, and the bend

**Status:** Accepted, 2026-10-02

## Context

The strummable neck played one chord, E7, however you played it. PLAN.md section 4.4 had the 12-bar version waiting as optional polish: each strum moves through a 12-bar blues in E, with the chord name shown quietly beside the neck. Joe OK'd the chord name on 2026-09-30.

Looking for an interactive idea with a real blues thread, Joe picked two from the form of the music itself: the 12-bar progression, and the string bend. The bend is the blues guitarist's signature, and B.B. King's above all; he's one of the four players Johnny says he grew up on (facts ledger, `influences`).

## Decisions

- **Each strum plays the next bar:** E7, E7, E7, E7, A7, A7, E7, E7, B7, A7, E7, B7, then around again. A strum is a sweep across three or more strings (`isStrum`). Picking one or two strings plays the current chord's notes without moving the bar on, so you can pick through a chord. Eight seconds without a strum starts it over.
- **Real voicings, still no audio files.** Open-position E7 (0 2 0 1 0 0), A7 (x 0 2 0 2 0) and B7 (x 2 1 2 0 2), synthesized by the same Karplus-Strong string, each note once on first use. A muted string gives a short dead thump and barely moves. Unit tests check every note is fret 0–4 and that each chord is exactly its four tones.
- **The chord name shows quietly under the neck** once you've strummed: the chord you'll play next, in muted display type at the left of the speaker row. It's announced politely to screen readers. There's no other text or hint, as before.
- **The bend: press a string, hold it a moment, and push.** It kinks under the finger, and the pitch glides up to a whole step at about one string-space of push, either way, as on a real guitar. Wiggling it is vibrato. Let go and it drops back and rings. A press that moves off quickly (within 110 ms) is still a strum, so strumming from a string works as before. The neck already has `touch-action: none`, so on a phone a bend doesn't scroll the page.
- **Keyboard:** Enter strums the next chord (Shift+Enter strums up), as before. Holding the up arrow picks the B string and bends it a whole step, gliding a little slower than a finger so you hear it climb; releasing lets it back down. The neck's label says both.
- **Sound stays off until the switch is on.** The progression and the bend work silently too: the strings still move and the chord name still changes.
- **Not new motion.** The strum is one of the site's two playful elements (CLAUDE.md). The bend is direct manipulation that follows the finger, drawn on pointer moves rather than animated. With reduced motion the strings still bend under the finger and still don't wobble.

## Consequences

- The strum chunk goes from 2.8 to 3.6 KB gzipped, and it still only loads when the neck nears the viewport. Nothing changes in the initial page.
- An end-to-end test drives it on a frozen clock: four strums show E7, E7, E7, A7, eight seconds reset it to E7, and the arrow key and a held mouse press each kink a string and release it.
- **Waiting on Johnny:** call and response. In a blues verse the singer takes two bars of each four-bar line and the guitar answers in the other two. Five or six short licks from Johnny, in E, could answer the visitor's strums at bars 3–4, 7–8 and 11–12.
