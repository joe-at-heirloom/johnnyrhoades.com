# 0011: Forms, mailing list and analytics on a static host

**Status:** Accepted, 2026-09-30 (Phase 5)

## Context

The v1 forms used `data-netlify`, which only works on Netlify. On GitHub Pages, booking requests and signups would have gone nowhere without anyone noticing. PLAN.md sections 11 and 13 ask for a hosted form service behind `src/lib/forms.ts`, a mailing list with region tags from the ZIP code, and Umami with eleven custom events.

## Decisions

**Booking requests go through Web3Forms.**
- Free tier, no account on the visitor's side, and it emails the request to one inbox. Formspree was the alternative; its free tier caps at 50 a month and adds its own branding to the email.
- With JavaScript, the form posts JSON in place and builds the subject PLAN.md asks for: `Booking: Sat, Oct 24, Blue Goose Inn, St. Clair Shores, Bar / club`. Missing parts say so ("date open", "place not given") instead of leaving gaps.
- Field names become labels in the email ("Venue and town", "Act"), and `replyto` is the booker's address, so Johnny can answer from his phone.
- Without JavaScript, the form posts straight to Web3Forms with a generic subject and comes back to `/thanks/`.
- The honeypot stays: a hidden `botcheck` checkbox. Web3Forms drops submissions that tick it, and the script never sends them.
- The act select has "Not sure yet" first, then solo acoustic, trio and full band. The formats are `unverified` in the facts ledger, but asking a booker what they want claims nothing about Johnny.

**The mailing list goes to Buttondown.**
- Free up to 100 subscribers, a public embed endpoint that needs no key, tags and metadata, and RSS-to-email for the weekly "where I'm playing" email later. Kit was the alternative; its free tier works too, but its form API wants a form ID per form and is heavier to swap out.
- The ZIP maps to a region tag in `src/lib/regions.ts`: Metro Detroit, Ann Arbor, Lansing, West Michigan, elsewhere in Michigan, out of state. The plan's list didn't cover Flint or Traverse City, so "Elsewhere in Michigan" was added. The ZIP itself is kept as `metadata__zip`, so the regions can be redrawn later.
- The embed endpoint doesn't send CORS headers, so the script posts with `mode: 'no-cors'` and can't read the response. A network failure still shows the error message; a rejected address (a typo Buttondown refuses) looks like success. That's an accepted cost for a signup box. A Cloudflare Worker can fix it later, behind the same function.

**Analytics: Umami Cloud, cookieless.**
- No cookies and no consent banner. The script sets `data-do-not-track` and `data-domains=johnnyrhoades.com`, so staging, local builds and the test suite never count.
- Clicks are tracked with `data-umami-event` attributes in the markup, which costs no JavaScript of ours. The rest (`booking_submit`, `booking_error`, `list_signup`, `video_play`, `strum_sound_on`) go through `src/scripts/track.ts`, a no-op when Umami isn't loaded.

**Public IDs are build variables, not secrets.**
- The Web3Forms access key, the Buttondown username and the Umami website ID all end up in the page, by design. They can only send mail to Johnny, add a subscriber, or count a visit.
- They come from `PUBLIC_*` environment variables (`.env.example`), set as GitHub Actions repository *variables*, not secrets. Nothing is committed.
- Without them the site still builds: the forms say they aren't connected yet and point to Facebook, Umami is left out, and CI prints a warning.

**Errors point to Facebook for now.** PLAN.md wants the booking email as the fallback, but which address to publish is one of Johnny's open questions (section 17). When he answers, the fallback changes in one place, `src/scripts/forms.ts`.

## Consequences

- Phase 5's acceptance needs real accounts: a test booking landing in Johnny's inbox, a signup with its tag in Buttondown, and events in Umami. These are listed in `docs/manual-checks.md`. The end-to-end tests cover everything up to the network: payloads, subjects, tags, messages and events, against intercepted endpoints.
- The Content Security Policy in Phase 6 has to allow `api.web3forms.com`, `buttondown.com` and the Umami script host.
- `booking@johnnyrhoades.com` (Cloudflare Email Routing) waits until DNS moves to Cloudflare in Phase 7. Web3Forms can deliver to it from then on.
