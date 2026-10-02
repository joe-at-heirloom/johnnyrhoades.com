# 0016: Drop the needle, and "am I free that night?"

**Status:** Accepted, 2026-10-01

## Context

Asked which interactive elements to add, Joe picked two: a way to hear the album on the site (until now nobody could), and a date check in the booking form. CLAUDE.md allows the record and the strum as the only playful motion, and the JavaScript budget is 30 KB on the home page.

## Decisions

**Drop the needle.** Each song in the tracklist has a play button: the track number turns into play on hover or focus, and into pause while it plays. A clip plays, the tonearm swings onto the spinning record, and a thin red bar fills under the song. A second press pauses; another song takes over; the arm lifts when a clip ends.

- **One audio element,** made on the first press with `preload="none"`, so nothing downloads until someone asks. About 1.5 KB of script.
- **The clips are Apple Music's 30-second previews, for now,** streamed from `audio-ssl.itunes.apple.com` and never copied here. They're credited under the tracklist ("Clips from Apple Music"), and every song title still links to that song on Apple Music. `npm run previews` refreshes the URLs from Apple's public lookup API if Apple moves them, and the weekly CI job checks they still load.
- **The data decides the source.** A track's `preview` in `media.yaml` is either an Apple clip or a file under `/audio/`; the schema refuses anything else. When Johnny's own files come over from Bandzoogle (he owns the recordings), they go in `public/audio/`, `previewSource` becomes `own`, and the Apple host comes out of the Content Security Policy.
- **The tonearm is part of the record,** the site's existing playful element, so it's not new motion in the CLAUDE.md sense. Reduced motion shortens its swing like everything else.
- **Failures are said plainly:** "Couldn't load that clip. Walkin' Blues is on Apple Music."
- **Analytics:** a `track_preview` event with the song title, through the existing `track()` helper.
- **CSP:** `media-src 'self' https://audio-ssl.itunes.apple.com`, in `src/lib/security-headers.ts` and the Cloudflare doc.

**The date check.** Picking a date in the booking form answers straight away, in Johnny's voice:

- "I'm already playing The Fed Community in Clarkston that day. Pick another date, or send it anyway and we'll talk."
- "I don't have anything listed that day."
- "That date has already gone by."

It never says a date is free. Johnny has gigs that aren't on Bandsintown, so the most the site can honestly say is that nothing is listed. Only public, not-cancelled shows count, and they're the same data the page already shows: a small JSON island built with the page, read by `src/lib/availability.ts`. The note is tied to the field with `aria-describedby` and announced politely. The field's `min` is today in Detroit.

## Consequences

- Home JavaScript goes to about 12 KB (budget 30 KB). Lighthouse: home 96, show page 99, press kit 96; accessibility, best practices and SEO 100.
- Playwright's Chromium has no AAC, so the end-to-end tests swap Apple's clips for a few seconds of WAV silence. That covers play, pause, switching songs, the arm lifting, failures and the CSP. Hearing real clips in Safari and Chrome is a manual check.
- Moving to Johnny's own clips is a data change plus one CSP line.
