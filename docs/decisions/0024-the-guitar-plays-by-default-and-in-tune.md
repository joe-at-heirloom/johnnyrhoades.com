# 0024: The guitar plays by default, and in tune

**Status:** Accepted, 2026-10-21. Changes the sound rule in ADR 0018, CLAUDE.md (non-negotiable 7) and PLAN.md section 4.4.

## Context

The strummable neck was silent until the visitor found the little speaker switch under it. Joe, 2026-10-21: "guitar needs work. should play sound by default." Most people strummed it, heard nothing, and moved on.

Looking closer turned up a second problem: the guitar was out of tune. The Karplus-Strong string rounds its delay line to whole samples, and the code also counted the averaging filter's half sample the wrong way round (it shortens the loop, not lengthens it). Every note came out sharp, by an amount that grew with pitch:

| Sample rate | Low E (E2) | High E (E4) | Worst spread within one chord |
|---|---|---|---|
| 44.1 kHz | +2.1 cents | +16.7 cents | 14.6 cents (E7) |
| 48 kHz | +2.9 cents | +13.4 cents | 10.9 cents (B7) |

Measured from the synthesized samples by autocorrelation. Ten cents between strings is plainly audible as a sour chord.

## Decisions

- **Sound is on by default.** The speaker switch starts on and now mutes. A mute is remembered for that visitor (localStorage, with the default when storage is blocked).
- **Within the browser's rules.** No browser lets a page make sound before the visitor has clicked, tapped or pressed a key on it. So the first such gesture anywhere on the page unlocks the audio (and in Chrome, one made before the guitar's code loaded counts too). After that, sweeping across the strings plays. Before it, a hover strum moves the strings silently rather than queuing notes for later, and a tap or click on the strings plays at once, since the tap is itself the gesture.
- **Nothing plays on its own.** The one strum the neck does by itself, when it first scrolls into view, stays silent. Every sound is the visitor's own strum, so there's no autoplay and nothing for WCAG's audio-control rule (1.4.2) to catch; the switch is there for anyone who'd rather play it quietly.
- **Exact pitch.** A first-order allpass filter in the loop adds the exact fraction of a sample (Jaffe and Smith, 1983), with the half sample counted the right way. Every note of every chord now measures within 0.03 cents at both sample rates, and a unit test holds it to within one cent.
- **A picked string, not a plucked harp.** The pluck is shaped as if picked a fifth of the way from the bridge (a comb filter on the excitation), which thins out the harmonics that point would damp on a real string.
- **Events:** `strum_play` the first time a note actually sounds on a page view, and `strum_sound_off` / `strum_sound_on` for the switch. With sound on by default, the useful questions are how many people play it and how many turn it off.

## Consequences

- People who never click anything before hovering over the neck still hear nothing until their first click or tap. That's the browser's rule, not a choice; the first tap on the strings fixes it.
- The strum chunk still loads only when the neck nears the viewport, and the initial page is unchanged.
- The synthesis tests now measure pitch rather than trusting the delay arithmetic, which is how the old error went unnoticed.
