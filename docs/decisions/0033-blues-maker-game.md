# 0033: The blues maker opens as a game; the controls are an advanced mode

**Status:** Accepted, 2026-11-24. Builds on ADRs 0030 to 0032. Revised the same day after two blind playtests (`docs/case-study-notes.md`), and again when Joe asked for the band to be part of the game.

## Context

The blues maker had grown into a full set of controls: styles, a bandleader's cues, tones, key, feel and tempo, a mixer, recording. Joe asked for it to be more like a game, with an advanced mode that keeps every control.

## Decision

- **It opens as a game: play a gig.** The game is call and response, the conversation a blues is built on, and the one the page's chart already explains. You sit in with the band on the fills' instrument (harp, or tenor sax on the hard gig) and trade lines with its guitarist (its piano player on the hard gig). In each line they play a two-bar call, and you answer in the next two bars on the pads, or on the keys A to K on a computer. The blues scale in the song's key means no wrong notes.
- **The band is the other half of the game.** It stands on stage between the gig panel and the pads, and each player is a button whose chip says what a tap does (`act` in `src/scripts/game.ts`):
  - before a gig, a tap plays a little of what that player does: a call, the bass's walk, the drummer's fill;
  - during one, the guitar or the keys take the calls from the next line (a player sitting out joins the band first);
  - the drummer throws a fill into the end of the line;
  - the bass drops the band out under your answers, stop-time style, until you tap it again;
  - the fills' spot is you ("You: harp"), and a tap switches your horn, on the pads and on the stage.

  The band also plays to how it's going. It plays softer to a cool crowd and harder to a warm one, digs in when the crowd is on its feet or you're three good answers in (the ride, the bass's pickups, busier comping), and when your answer is good enough by the time it reaches the next line, it shouts it back with a crash on the downbeat. The player asks the game for these moves bar by bar (`BandMoves` and `barEvents` in `src/lib/jam.ts`, tested), so they land in time like everything else.
- **Each answer is scored** (`scoreTurn` in `src/lib/game.ts`, tested) out of 100, in five named parts:
  - timing (35): each note against the band's grid, the beat and the swung offbeat (the eighths when it's straight). Within 35 ms is in the pocket, and 100 ms off counts for nothing. The player hears the band `outputLatency` after the audio clock schedules it, so that's taken off each note;
  - ending (20): ending on the 1 or the 5 sounds finished, the flat 3 or flat 7 bluesy, and the flat 5 unresolved;
  - space (15): three to ten notes, with a breath of a beat or more;
  - echo (15): how much of the call's rhythm the answer borrows, by half-beat slot, allowing a beat's nudge;
  - variety (15): more than one note, and not the same answer as last time. One note four or more times tops out at 60.

  Each answer shows its breakdown, and the line under it names the weakest part with what to do ("End on the 1 or the 5 to finish the thought"). Only an answer good all round is "right in the pocket". Answers of 70 or more in a row build a streak, worth up to 15 points each.
- **The crowd has stakes.** It starts lukewarm. An answer of 70 holds it, better warms it, worse cools it, so coasting drains the meter. A missed turn cools it more, and three in a row empty the room: the crowd walks out and the gig ends. Good answers get applause or a cheer, generated once with ElevenLabs like the room loops.
- **Three gigs, easiest first.** Open mic (a slow porch shuffle on harp, two choruses), Friday night (a Chicago shuffle with the quick change, three) and Saturday, late (a jump boogie at 150 on tenor sax, four). Each is a style's band, started straight in with no intro, so the first call comes right after the count-in. Each line of each chorus is a turn, the last one too: after it the band tags the ending (the player jumps to the ending's two bars). A summary gives stars (70% of the points for two, 85% for three, so tapping at random earns one), the total, the best answer, what to work on and what the crowd made of it, and each gig's best is remembered in the browser. `?choruses=n` makes a shorter gig.
- **One screen while it plays.** In game mode the gig panel comes first, then the band on stage in one row, then the pads, then the chart. The form steps out of the layout (`display: contents`; its fields are the advanced controls) so the stage inside it can come up by the gig. While a gig plays, the page's introduction steps aside and the panel, the band and the pads fill the screen from the top, on a 375×667 phone too. The panel holds the prompt, a line under it saying what to do now, the score and streak, the crowd, the last answer's breakdown, and the line itself: sixteen beats, "the band calls" on the left and "you answer" on the right, each note drawn at its beat and as high as its pad. Your notes show filled when they're on time and as rings when they aren't, and the call's rhythm shows as ticks where you answer.
- **The call is visible as well as audible.** As the band plays its call, each note lights the pad nearest it (`padFor` in `src/lib/sit-in.ts`). On your turn every pad lights up, and the 1 and the 5 are marked as places to land. Playing during the call says once that it's the band's turn. A bend shows as a bar rising up the pad.
- **The game is timed on the audio clock.** The player tells the game about each bar as it schedules it, so a line's call and turn are known to the sample, and each pad note is stamped with the audio time it sounded. A turn is scored the moment it ends.
- **Advanced controls are a switch.** It shows everything from before (styles, transport and recording, the bandleader's cues, each part's switch and tones, key, feel, tempo and intro, the instrument for the pads, the mixer) and hides the game. A link made in advanced mode carries `mode=advanced` and opens there. Game mode leaves the address bar plain. Record starts the band if it isn't playing, and a take ends when the band stops, once the room has rung out.
- **Sound on.** The gig page asks for the sound up and mentions the iPhone's ringer switch. Where the browser allows it (`navigator.audioSession`, Safari 17 and later), the page plays as a music app, so the switch doesn't silence the band.
- **Motion.** The beat lights, the notes on the line, the lit pads and the crowd meter are state changes on the audio clock, with no transitions. Nothing new moves under reduced motion. The stage still plays along as in ADR 0030.

## Consequences

- The home page's "Play it with a band" now leads to a game, not a control panel.
- End-to-end tests play a whole gig through the keyboard: the call lighting the pads, handing the call to another player and cueing a fill, the scored answers with their breakdown, the ending and the summary. They also miss three turns until the crowd walks out, and check that the panel, the band and the pads fit one phone screen.
