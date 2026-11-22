# 0029: Prefetch the next page on intent, with Speculation Rules

**Status:** Accepted, 2026-11-22. Possible because the CSP is a file the build writes (ADR 0027).

## Context

Most visits go from the home page to a show page or the press kit, or back. Each click waits on a fresh request for the next page's HTML. Chrome and Edge support Speculation Rules: a site can tell the browser which links to fetch ahead of a click.

## Decision

- **The rules** are in `src/lib/speculation.ts`, inline in every page's `<head>` as `<script type="speculationrules">` (JSON, not code). The build hashes that block into `script-src` in `dist/_headers`, as it does the stylesheet (ADR 0028). No `'unsafe-inline'`.
- **Prefetch, not prerender.** Prefetching fetches the HTML and runs nothing, so Google Analytics doesn't count a visit that didn't happen, and the guitar never wakes on a page nobody opened.
- **`moderate` eagerness.** On a desktop it starts after a short hover, and on a phone when the tap begins. Pages aren't fetched just for being on screen.
- **Same-site pages only.** Downloads (`.ics`, `.zip`, poster `.png`s, feeds, JSON, text) and anything marked `download` or `nofollow` are excluded. Links to artists' sites aren't touched.
- Firefox and Safari ignore the block, and their clicks work as before.

## Why inline, not a header

The first version delivered the rules the other common way: a `Speculation-Rules: "/speculation-rules.json"` header, which needs nothing in the CSP. Lighthouse CI then read the home page's LCP 0.9 s slower: 2.63 s against 1.73 s, in an A/B test on the same build.
- **What the lab saw:** nothing waited on the rules file. It went at the lowest priority, first paint was unchanged, and main-thread work was the same. But Lighthouse's simulation charged the hero for the file's separate request and connection.
- **The real cost:** that request and connection were real for visitors too, just harmless.

Inline, there's no extra request. A/B with and without the inline block, three runs each, showed no difference:

| Page | LCP with the rules | LCP without |
|---|---|---|
| Press kit | 1.80, 1.83, 1.80 s | 1.83, 1.80, 1.80 s |
| Show page | 1.76, 1.43, 1.73 s | 1.73, 1.73, 1.73 s |

## Consequences

- **Tested:** an end-to-end test hovers the press kit link on the home page, under the served headers, then clicks. It checks that the browser reports `deliveryType: "navigational-prefetch"` for the page it lands on. Another test fails if any page carries an inline script other than JSON-LD, the Tonight data island and these rules, or a rules block whose hash isn't in the CSP.
- **Checked live on staging, 2026-11-22,** in a clean Chromium:
  - hover, then click: the press kit arrives as `navigational-prefetch`, its first byte at 12 ms;
  - a straight click: also prefetched, at 42 ms, because Chrome starts on the press.

  In Chrome driven by the Claude extension it didn't prefetch. Chrome turns preloading off while a debugger is attached, and the user can turn it off too (Settings → Performance → Preload pages). To see it by hand: DevTools → Application → Speculative loads.
- **The cost:** about 400 bytes per page. A hover that doesn't end in a click also spends one page's HTML, about 10–25 KB compressed. Data Saver and battery saver modes turn prefetching off in the browser.
