# 0003: Darken the button red to pass WCAG AA

**Status:** Accepted, 2026-09-30 (Phase 0)

## Context

The axe check added in Phase 0 failed `color-contrast` on every red button. Bone text (`#efe6d3`) on `--red` (`#c4302a`) measured **4.45:1**, just under AA's 4.5:1 for normal-size text. The hover state was worse: it switched the fill to `--red-hi` (`#e8503f`), about **3.0:1** behind bone text. axe doesn't test hover, so that one only showed up by calculation. The video play button's hover had the same problem.

CLAUDE.md requires a decision record for color changes.

## Decision

| Token | Before | After | With bone text |
|---|---|---|---|
| `--red` (button fills) | `#c4302a` | `#c02e28` | 4.62:1 |
| `--red-deep` (new: hover and pressed fills) | n/a | `#a52520` | 5.9:1 |
| `--red-hi` (red text on black) | `#e8503f` | unchanged | never used behind bone text |

Hover now goes darker instead of lighter. The record label uses the new `--red` value so it still matches.

## Consequences

- The change is below the parity test's perceptual threshold, so the port still matches v1.
- Rule for later work: `--red-hi` is for text and thin details on black. Anything bone sits on uses `--red` or `--red-deep`.
