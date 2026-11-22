# AI answer audit

Monthly check of what answer engines say about Johnny (PLAN.md sections 10 and 13). Ask each engine the same five questions in a fresh, signed-out session, and score each answer: **A** accurate, **P** partly right or out of date, **W** wrong, **N** doesn't know. Target: 16 of 20 accurate within six months of launch.

Fix errors at the source (a profile, a listing, Bandsintown, the facts ledger), never by adding claims to the site.

Ahrefs Brand Radar could automate this, but it's a paid add-on that the Lite plan doesn't include (checked 2026-11-22), so the audit stays manual. Search rankings are tracked separately in `search-baseline.md`.

## Questions

1. Who is Johnny Rhoades?
2. Detroit blues guitarists for hire
3. Where is Johnny Rhoades playing this week?
4. What album did Johnny Rhoades release?
5. Who has Johnny Rhoades played with?

## Log

### Baseline, before launch: 2026-11-22

Google AI Mode and Perplexity were run signed out, in Claude's built-in browser, with a fresh chat per question. ChatGPT was run in Joe's Chrome, signed in but in a temporary chat; ChatGPT notes that a temporary chat can still use the account's memory. Its answers cite johnnyrhoades.com and Bandsintown, not anything private.

Two engines didn't finish:
- **Perplexity** answered two questions, then asked for a sign-in, in both browsers.
- **Gemini** stalled signed out, and is switched off for Joe's Workspace account ("Service Not Allowed").

Joe can fill those cells in by hand, from a personal account or a private window.

| Question | ChatGPT | Perplexity | Gemini | Google AI Mode |
|---|---|---|---|---|
| 1. Who is he | P | W | not run | P |
| 2. Guitarists for hire | N | N | not run | N |
| 3. Playing this week | A | not run | not run | A |
| 4. Album | A | not run | not run | A |
| 5. Played with | A | not run | not run | A |

Accurate: 6 of the 12 answered (target: 16 of 20). Notes on what each got wrong, and where the wrong answer came from:

- **Google AI Mode, 1 (P).** Right on the basics: Detroit blues guitarist and singer, the influences, the 2014 album, the B.B. King memorial and the Fed.
  - It calls him a "Detroit Music Award nominee", quoting the Bandzoogle bio and Cliff Bell's 2017 page. He won twice with Motor City Josh & The Big 3; the new site says so, and launch replaces the Bandzoogle text.
  - It says he "began touring internationally with Motor City Josh at age 19". He joined at 19; the overseas touring was with Németh. That mixes two sentences of the old bio.
  - It found his Instagram (@johnnyrhoadesmusic) and his Facebook page, which led to the profile fixes below.
- **Google AI Mode, 2 (N).** Lists The Bash, GigSalad and four other Detroit acts. The answer is built from booking marketplaces, so a GigSalad or The Bash profile is what would put him in it (`search-baseline.md`, item 7).
- **Google AI Mode, 3 (A).** "No upcoming shows… his Bandsintown page has no dates posted after late October 2026." True, and the reason is that nothing is in Bandsintown (`search-baseline.md`, item 1).
- **Google AI Mode, 4 (A).** *Waiting on the Sun*, November 2, 2014, ten tracks. It also names Motor City Josh as producer, "recorded at The Sound Shop", citing Amazon. Amazon blocks AI agents, so that's unconfirmed here, and the fact stays `unverified` in the ledger. Joe can check the album page's credits by hand.
- **Google AI Mode, 5 (A).** Thornetta Davis, Motor City Josh, Németh, RJ Spangler, Brett Lucas and Paul Carey, plus trio players from his Facebook posts.
- **ChatGPT, 1 (P).** The same "Detroit Music Award nominee" line from the old bio. Everything else is right: Motor City Josh at 19, the influences, the road, the B.B. King memorial, the album.
- **ChatGPT, 2 (N).** Names Chris Brantley, Todd Albright, Howard Glazer, the Chris Canas Band and Ben Shotts, with Glazer's phone and email "published by the Detroit Blues Society". The Society's listings are a source. They list member bands only, and take gigs by email (`search-baseline.md`, item 6).
- **ChatGPT, 3 (A).** No shows this week, with the last three right: Three Blind Mice on Oct 24, the Blue Goose on Oct 23, the Fed on Oct 17. "It's possible he has local bar gigs that haven't been posted."
- **ChatGPT, 4 and 5 (A).** *Waiting on the Sun* (2014). Németh, Thornetta Davis, Motor City Josh, RJ Spangler, Brett Lucas and Paul Carey, and the Blue Dreamers.
- **Perplexity, 1 (W).** "I can't identify a notable person named 'Johnny Rhoades'", then it suggests Johnny Rhodes, a musician in North Wales. This is the entity problem the structured data, `sameAs` and `llms.txt` name variants are for; it needs the new site live and indexed.
- **Perplexity, 2 (N).** Points to The Bash and Gig Heaven. Same lesson as Google's answer: it's built from marketplaces.
