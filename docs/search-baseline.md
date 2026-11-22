# Search baseline

Where johnnyrhoades.com and Johnny stand in search, measured with Ahrefs on 2026-11-22. The domain still serves the Bandzoogle site, so this is the "before". Run it again on day 28 and day 90 after launch (runbook step 22) and add a column.

## The numbers

| Measure | 2026-11-22 |
|---|---|
| Domain Rating | 0.1 (Ahrefs rank 94,262,915) |
| Organic keywords, US | 0 |
| Organic traffic, US (estimated) | 0 |
| Referring domains | 25, of which one was editorial, and it's lost (see Backlinks) |
| johnnyrhoades.com in the top 10 for "johnny rhoades" | No, in Ahrefs' snapshot. Search Console disagrees (next section) |

## What Google itself reports

Search Console, the Domain property, for the three months to 2026-11-22. This is the old Bandzoogle site, since staging is `noindex`. It's Google's own count, so it beats the Ahrefs estimates above.

| Measure | Value |
|---|---|
| Clicks from Google search | 18 |
| Impressions | 345 |
| Click-through rate | 5.2% |
| Average position | 6.5 |
| Pages indexed | 4 (9 more known but not indexed) |
| Core Web Vitals | No data yet: too few visits |

| Query | Clicks | Impressions |
|---|---|---|
| johnny rhoades | 4 | 35 |
| johnny roads | 0 | 26 |
| rhoades | 0 | 19 |
| john rhoades | 0 | 15 |
| johnny road, johnny detroit, johnny rags | 0 | 3 each |
| johnnie rhoads, jhonny rhodes, thoades | 0 | 1 each |

The site does show up for his name. Ahrefs' snapshot missed it: average position 6.5 puts it on the first page. Misspellings ("roads", "road", "rhodes") account for about a quarter of the impressions and none of the clicks. Sitemaps: only Bandzoogle's `sitemap.xml`, submitted in 2022, so swap it for `sitemap-index.xml` at launch (runbook step 17).

## Who ranks for his name

"johnny rhoades", US, top 10:

| # | Result | DR | Whose |
|---|---|---|---|
| 1 | facebook.com/public/Johnny-Rhoades | 100 | Facebook's people search, not a page of his |
| 2 | music.apple.com/us/artist/johnny-rhoades/942326905 | 97 | His Apple Music artist page |
| 3 | musicpage.com/johnrhoadesband | 34 | His, a 2013 profile as "John Rhoades Band" (Joe, 2026-11-22). The whole site is down now |
| 4 | cliffbells.com/shows/johnny-rhoades-band/ | 47 | A venue's page for one of his shows |
| 5 | Wikipedia, Johnny Rhodes (fighter) | 97 | Someone else |
| 6 | Two LinkedIn profiles | 99 | Other John Rhoadeses |
| 7 | Videos: "Walkin' Blues", Johnny Rhoades Band (bluesinthed, 2017); Clinton Macomb Public Library, Music at Main | | Other people's uploads of him |
| 8 | Norwich University baseball coach | 46 | Someone else |
| 9 | allaboutjazz.com/tag-johnny-rhoades | 80 | A tag page. Not checked |
| 10 | soundcloud.com/johnny-rhoades-639062848 | 94 | Not his (Joe, 2026-11-22) |

Four results are him and one more might be. None is his own site, and the strongest is a page he hasn't claimed.

## Keywords

Ahrefs US monthly volume. Zero means under 10, or not tracked.

| Keyword | Volume | Difficulty | Note |
|---|---|---|---|
| johnny rhodes | 150 | 1 | Other people: a Maryland basketball player, an MMA fighter, Jonty Rhodes. Not a target |
| blues bands near me | 150 | 0 | A map pack and aggregators (next section) |
| live blues near me | 50 | 0 | Traffic potential 300 |
| detroit blues | 20 | 9 | Google shows an AI Overview about the genre |
| detroit blues society | 20 | 0 | |
| johnny rhoades | 10 | | |
| live music st clair shores | 10 | | |
| acoustic guitarist for hire | 10 | | |
| detroit blues bands, detroit blues musicians, detroit blues clubs, blues bars detroit, blues music detroit, blues band for hire, live music clarkston mi, johnny rhoades band, johnny rhoades guitar, motor city josh | 0 | | |

Nobody searches for a Detroit blues guitarist in any volume. People find Johnny by his name, or through a venue, a calendar or a booking marketplace. A one-artist site won't outrank those for generic searches, so the work is to be listed on them, and to be one clear, well-corroborated entity when someone searches his name or asks an AI about him (PLAN.md section 10).

## What a local search shows

Ahrefs checks local searches from one fixed place (Wichita, for "blues bands near me"), so this is the pattern, not Detroit's actual page:

1. The local blues society's Facebook page, then its event calendar
2. A map pack of bars
3. GigSalad, "Best Blues Bands for Hire in Wichita, KS" (DR 82)
4. Yelp
5. Bandsintown's city blues page, `/c/<city>/all-dates/genre/blues` (DR 91)
6. A city music calendar, the tourism board and a venue

In Detroit the same slots belong to the Detroit Blues Society, GigSalad, Bandsintown's Detroit blues page, Visit Detroit and Pure Michigan. On 2026-11-22 Bandsintown's Detroit blues page listed six shows by other players and none by Johnny, because Bandsintown has nothing upcoming for him. His last listed show is Oct 24. The sync is working: its log says `0 upcoming, 609 past`.

## Backlinks

- **One editorial link, now lost.** michigan.org (Pure Michigan, DR 78) listed Saturdays Near the Fire Pit at Millpond Park with a link to `/home`, anchor "Johnny Rhoades". Ahrefs saw it from 2026-05-11 to 2026-07-28, then the event page expired. Event listings produce links that expire with the event. `/home` already redirects to `/` in `redirect-map.csv`.
- An old Squarespace link (2023 to 2024).
- **The rest is link spam:** `*.shop` domains, `buybacklinks.agency`, `pbnseolinks.shop` and the like, almost all nofollow. Spam networks link to any domain, and Google ignores them. Don't file a disavow unless Search Console ever reports a manual action.

## AI answers

Ahrefs Brand Radar tracks what ChatGPT, Perplexity and Google's AI features say about a name, but it's a paid add-on. This account is on the Lite plan, and every source returned "Missing addon: Brand Radar". The monthly audit in `geo-audit-log.md` stays manual.

## What changed on the site

On 2026-11-22, all from facts already in the ledger:

- **Apple Music artist page.** It's now a live profile, so it's in `sameAs` and the footer. It's the second result for his name and the page an answer engine is most likely to match him against. The album page stays in `media.yaml`.
- **His two outside credits, in structured data.** Johnny is `memberOf` Motor City Josh & The Big 3, with the band's two Detroit Music Awards, and a `contributor` to John Németh's *Feelin' Freaky*. Both are `verified` facts that other sites already confirm, and a unit test holds the markup to the ledger.
- **The band's other name.** Its `MusicGroup` has `alternateName` "John Rhoades Band", the name on the #3 result.
- **`/llms.txt`** lists the names he's billed under and the common misspelling, and says he isn't the MMA fighter or the basketball player.
- **Home meta description.** It now names the formats and the region (PLAN.md section 9).

## Off-site, in order

1. **Johnny: put the gigs in Bandsintown.** Nothing is listed after Oct 24. His monthly night at The Fed in Clarkston with the Lucas Rhoades Band went in through August 2026 and hasn't since. Every public show he lists becomes a page here, a line on Bandsintown's Detroit blues page, and something new for search engines and AI answers to find. Nothing else on this list counts as much.
2. **Launch.** The old site has no rankings to lose. Runbook steps 4 and 17: Search Console, Bing Webmaster Tools (Bing's index feeds Copilot and ChatGPT search), the sitemap, and IndexNow.
3. **Claim Apple Music for Artists.** It's the #2 result for his name, and claiming it gives him control of the photo and bio shown there.
4. **Give his Facebook Page a username, and post on it.** The #1 result for his name is Facebook's people search. He already has a Musician/band Page (it's the Facebook link the site uses), but its address is a number and its last post is from November 2024. A username such as johnnyrhoadesmusic, matching his Instagram, gives Google a page with his name in the address to rank instead.
5. **Ask venues to link here.** Cliff Bell's page for one show ranks #4 for his name. Venue pages rank well and stay up, so after launch ask the regular rooms to link johnnyrhoades.com from their listings.
6. **List public shows where Detroit looks:** the Detroit Blues Society, Pure Michigan events and Metro Times. Each listing is a link while it's up, and the Pure Michigan one was the best link this domain ever had. The Society lists schedules for member bands and sponsor venues only. Gigs go by email to webmaster@detroitbluessociety.org, one line each: "Artist Name at Venue Name (start time), Venue Street, City, Phone, Website". ChatGPT draws its "Detroit blues guitarists for hire" answer partly from those listings (`geo-audit-log.md`). So: join as a member band, then send the shows.
7. **GigSalad or The Bash, Johnny's call.** GigSalad ranks for "blues bands near me" with city pages for blues bands and acoustic guitarists. Both Google AI Mode and Perplexity built their "Detroit blues guitarists for hire" answers from The Bash and GigSalad (`geo-audit-log.md`). It's where people booking private events look. Read the fees and terms first.
8. **MusicBrainz and Discogs** (PLAN.md section 10), including his credit on *Feelin' Freaky*. Wikidata and answer engines lean on these.
9. **Point his Kickstarter here.** His 2014 campaign page (DR 92) is still up, and its creator bio linked johnrhoadesmusic.com, a domain nobody owns now. After launch, Johnny can change that link in his Kickstarter profile to johnnyrhoades.com.
10. **After launch:** verify the site in Ahrefs Webmaster Tools (free) or set up a Site Audit project on the Lite plan, and rerun this baseline on day 28 and day 90.

Not targets: "johnny rhodes" (other people's searches), "blues bands near me" and "live blues near me" (map pack and aggregators, covered by items 6 and 7), and "detroit blues" (answered by an AI Overview on the genre's history).

## What the #3 result turned up

Joe confirmed the musicpage profile is Johnny's. musicpage.com now answers 503 on every page, so it can't be updated and will likely drop out of Google, but the Wayback Machine kept a copy from 2022-05-17. It holds Johnny's own 2013 bio, which names his old site, johnrhoadesmusic.com. That led to his Kickstarter for his first full-length record: 54 backers, $3,001, spring 2014.

The bio has five things the ledger didn't: an EP, *Breakin’ Out*; touring with Kelley Hunt; playing for Sharrie Williams and Stacia Petrie; jazz studies at Western Michigan; and his first sit-in at the Blue Goose at 16. They're all in his bio now, along with the Kickstarter (ADR 0025), and each artist the bio names links to their own page. One claim stays out until Johnny confirms it: the Kickstarter's plan for Motor City Josh to produce the record.

The old domain is unregistered. Only musicpage and Kickstarter ever linked to it, so it isn't worth buying back for search.

## How to rerun

Use the same Ahrefs calls so the columns compare. For johnnyrhoades.com:

- `site-explorer-domain-rating`
- `site-explorer-metrics`: mode `subdomains`, country `us`
- `site-explorer-referring-domains`: all time, ordered by DR

Then for the searches:

- `serp-overview` for "johnny rhoades": US, top 10
- `keywords-explorer-overview` for the keywords above: US

The whole pass uses well under 1% of the Lite plan's monthly units.
