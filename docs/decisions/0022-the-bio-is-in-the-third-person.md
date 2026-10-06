# 0022: The bio is in the third person, and reads as one text

**Status:** Accepted, 2026-10-05. Changes the home page voice in PLAN.md (sections 2, 6.4 and Appendix C) and the `first` field from ADR 0010.

## Context

The home page About was in Johnny's voice, one ledger fact per sentence, each from the fact's `first` wording. The press kit's medium bio stated the same facts in the same order in the third person. Johnny read it and had two notes, passed on by Joe on 2026-10-05: it shouldn't say "I", it should say "he"; and it sounds repetitive. Every sentence opened with "I" (or "He" in the press kit), because each was written to stand on its own.

He also asked for the bio to say he's playing with Jill Jack and Julianne Ankley now.

## Decisions

- **The About is in the third person.** Johnny's word on how he's described beats the plan. The heading, "Why I Sing the Blues", stays: it's a B.B. King title, not a claim.
- **One running bio, in two places.** The home page About and the press kit's medium bio already used the same facts in the same order, so they are now the same text: `RUNNING_BIO` in `src/lib/bios.ts`, a paragraph per list on the home page, one paragraph in the press kit. A test checks the two lists match.
- **Facts get a `bio` wording; `first` is gone.** `third` stays the sentence that stands on its own (fast facts, FAQ, short bio, `/llms.txt`, structured data). `bio` is the same claim worded for its place in the running bio, so it can lean on the sentence before it ("Since then…", "Years later…", "Along the way…"). Without one, the bio uses `third`. The status rules are unchanged: `facts.bio(id, context)` checks them the same way.
- **A test for the repetition.** The running bio can't open three sentences in a row with the same word. Two "He"s in a row are fine.
- **Jill Jack and Julianne Ankley are a `verified` fact** (`jill-jack-julianne-ankley`). Local Spins (June 5, 2026) names him as the guitarist in Jill Jack's band. Trinity House Theatre listed him with Julianne Ankley on March 21, 2026, spelled "Rhodes", and Johnny's own Bandsintown has the same show. It's in the running bio, the fast facts and `/llms.txt`. The short bio is at 58 of its 60 words, so it stays as it was.
- **The rest of the home page still talks as Johnny** ("Where I'm playing next", the date check in the booking form). His notes were about the bio. If he wants those changed too, that's copy, not structure.

## Consequences

- Reordering the running bio means rereading the `bio` wordings, since some lean on the sentence before. The comment on `RUNNING_BIO` says so.
- "These days" dates. The fact's source note says to recheck it whenever the bio changes, and the Bandsintown history shows when he stops playing with either of them.
