# 0001: How the v1 prototype was ported into Astro

**Status:** Accepted, 2026-09-30 (Phase 0)

## Context

Phase 0 ports the one-page prototype (now in `reference/v1/`) into Astro with no visible change. Astro's default is scoped component styles. Scoping adds attribute selectors, which raises specificity and reorders the cascade relative to v1. Several v1 rules also depend on source order: a shared "label" rule sets letter-spacing, and component rules later override it with a selector of equal specificity.

## Decision

- **Styles are global, split by component, imported in a fixed order.** `src/styles/index.css` imports `tokens.css`, `fonts.css`, `base.css`, one file per component in `src/styles/components/`, then `motion.css`. The order matches v1's single stylesheet, so the cascade is identical. Components hold markup and scripts only.
- **Design tokens live in `src/styles/tokens.css`**: color, type (including the two `font-stretch` settings), space and motion.
- **Client scripts are small TypeScript modules** in `src/scripts/`, one per behavior, imported from the component that needs them. Astro bundles and deduplicates them.
- **The strum engine loads on demand.** `StrumNeck.astro` imports `src/scripts/strum.ts` dynamically when the neck comes within 600px of the viewport. Its math lives in `src/lib/strum.ts` as pure functions with unit tests.
- **Scroll-triggered reveals are gone.** PLAN.md section 8 rules them out. The record still slides out of its sleeve when it first scrolls into view, because that's part of the record, one of the two allowed playful motions.
- **The footer year is set at build time.** Builds run at least nightly from Phase 1, so this drops a script.

## Consequences

- Styles aren't scoped, so class names must stay unique across components. The component file names make ownership clear.
- The parity test (ADR 0005) passes at 0.000% difference, which confirms the cascade carried over.
- Initial JavaScript is 4.6 KB gzipped across eight small modules, plus a 2.7 KB strum chunk loaded later. The budget is 30 KB.
