# Decision records

Short notes on choices that shape the code, so the reasoning survives. One file per decision, numbered in order. Each record has the context, the decision, and what it costs. Change a decision by adding a new record that supersedes the old one, not by editing history.

| # | Decision | Status |
|---|---|---|
| [0001](0001-astro-port-structure.md) | How the v1 prototype was ported into Astro | Accepted |
| [0002](0002-self-hosted-archivo.md) | Self-host Archivo instead of loading Google Fonts | Accepted |
| [0003](0003-button-red-contrast.md) | Darken the button red to pass WCAG AA | Accepted |
| [0004](0004-toolchain-pins.md) | Require npm 11 and pin TypeScript 6 | Accepted |
| [0005](0005-visual-parity-testing.md) | How visual parity with v1 is measured | Retired in Phase 2 |
| [0006](0006-bandsintown-mock-and-data-model.md) | Mock Bandsintown until the API key arrives; where the data model grew | Accepted (mock part temporary) |
| [0007](0007-scripts-run-on-node-type-stripping.md) | Run TypeScript scripts with Node's built-in type stripping | Accepted |
| [0008](0008-shows-on-the-site.md) | Shows on the site, built from data | Accepted |
| [0009](0009-poster-engine.md) | The poster engine | Accepted |
| [0010](0010-facts-ledger-and-press-kit.md) | The facts ledger, enforced; and the press kit built on it | Accepted |
| [0011](0011-forms-list-and-analytics.md) | Forms, mailing list and analytics on a static host | Accepted |
| [0012](0012-hardening.md) | Hardening: discovery files, security headers and quality gates | Accepted |
| [0013](0013-launch-dns-and-email.md) | Launch prep: DNS is already on Cloudflare, and email stays on Zoho | Accepted (supersedes the `booking@` part of 0011) |
| [0014](0014-design-pass.md) | Design pass: layout and rhythm, same visual language | Accepted |
| [0015](0015-print-texture.md) | Print texture | Accepted |
