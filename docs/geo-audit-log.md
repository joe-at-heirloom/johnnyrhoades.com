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

Run signed out in Claude's built-in browser, a fresh chat per question. Three engines didn't finish:
- **ChatGPT** sent every request to its login page.
- **Perplexity** answered two questions, then asked for a sign-in ("Sign up and repeat your request").
- **Gemini** accepted the question but sat on "Searching the web" with the browser pane hidden.

Joe can fill those cells in by hand.

| Question | ChatGPT | Perplexity | Gemini | Google AI Mode |
|---|---|---|---|---|
| 1. Who is he | not run | W | not run | P |
| 2. Guitarists for hire | not run | N | not run | N |
| 3. Playing this week | not run | not run | not run | A |
| 4. Album | not run | not run | not run | A |
| 5. Played with | not run | not run | not run | A |

Accurate: 3 of the 7 answered (target: 16 of 20). Notes on what each got wrong, and where the wrong answer came from:

- **Google AI Mode, 1 (P).** Right on the basics: Detroit blues guitarist and singer, the influences, the 2014 album, the B.B. King memorial and the Fed.
  - It calls him a "Detroit Music Award nominee", quoting the Bandzoogle bio and Cliff Bell's 2017 page. He won twice with Motor City Josh & The Big 3; the new site says so, and launch replaces the Bandzoogle text.
  - It says he "began touring internationally with Motor City Josh at age 19". He joined at 19; the overseas touring was with Németh. That mixes two sentences of the old bio.
  - It found his Instagram (@johnnyrhoadesmusic) and his Facebook page, which led to the profile fixes below.
- **Google AI Mode, 2 (N).** Lists The Bash, GigSalad and four other Detroit acts. The answer is built from booking marketplaces, so a GigSalad or The Bash profile is what would put him in it (`search-baseline.md`, item 7).
- **Google AI Mode, 3 (A).** "No upcoming shows… his Bandsintown page has no dates posted after late October 2026." True, and the reason is that nothing is in Bandsintown (`search-baseline.md`, item 1).
- **Google AI Mode, 4 (A).** *Waiting on the Sun*, November 2, 2014, ten tracks. It also names Motor City Josh as producer, "recorded at The Sound Shop", citing Amazon. Amazon blocks AI agents, so that's unconfirmed here, and the fact stays `unverified` in the ledger. Joe can check the album page's credits by hand.
- **Google AI Mode, 5 (A).** Thornetta Davis, Motor City Josh, Németh, RJ Spangler, Brett Lucas and Paul Carey, plus trio players from his Facebook posts.
- **Perplexity, 1 (W).** "I can't identify a notable person named 'Johnny Rhoades'", then it suggests Johnny Rhodes, a musician in North Wales. This is the entity problem the structured data, `sameAs` and `llms.txt` name variants are for; it needs the new site live and indexed.
- **Perplexity, 2 (N).** Points to The Bash and Gig Heaven. Same lesson as Google's answer: it's built from marketplaces.
