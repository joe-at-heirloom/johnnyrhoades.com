# 0021: hello@ is the booking email

**Status:** Accepted, 2026-10-05. Supersedes the `booking@` part of ADR 0013 and the Facebook fallback in ADR 0011.

## Context

PLAN.md section 11 planned a new address, `booking@johnnyrhoades.com`, and ADR 0013 made it a Zoho alias so Johnny's mailbox stayed safe. Until there was an address to publish (PLAN.md section 17), every fallback on the site pointed to his Facebook profile. On 2026-10-05 Joe answered: `hello@johnnyrhoades.com` is Johnny's work email, already on Zoho.

## Decisions

- **Publish `hello@`; don't add `booking@`.** It's the inbox Johnny already reads for work. A second address would be one more thing to set up and forget. Nothing changes in Zoho or DNS.
- **It replaces Facebook as the fallback:** in the home booking section ("Or email me at …"), the form's error messages, the press kit's header, contact section, FAQ and photo note, and the Booking section of `llms.txt`. Facebook stays in the footer with the other profiles. Someone the press kit was forwarded to can reach Johnny without an account anywhere.
- **The printed press kit carries it.** Print hides the buttons, so the one-sheet used to end with the URL and no way to reach him. It now ends `hello@johnnyrhoades.com · johnnyrhoades.com/epk`.
- **A plain `mailto:` link.** Hiding the address from scrapers would take JavaScript or tricks that break print, copying and screen readers. The address is meant to be found, and Zoho's spam filter handles the rest.
- **One constant,** `BOOKING_EMAIL` in `src/lib/forms.ts`. It lives there rather than in `site.ts` so the client form script can import it without pulling in luxon.
- **Email clicks count.** With the address next to the form, some bookings will skip the form, and PLAN.md section 13's main metric (booking inquiries) would miss them. The links carry `data-umami-event="email_click"` and where they were clicked (`home` or `epk`). A click isn't a sent email, so the count is an upper bound.
- **Web3Forms delivers to the same inbox.** Its access key is created with `hello@`, so form requests and direct email arrive side by side.

## Consequences

- PLAN.md section 11, the launch runbook and the manual checks name `hello@`. The `booking@` alias step is gone. After cutover, a check that `hello@` still receives mail takes its place.
- A phone number and a response time Johnny can keep are still open (PLAN.md section 17).
- If Johnny ever wants booking mail kept apart, a `booking@` alias in Zoho and a one-line change to `BOOKING_EMAIL` do it.
