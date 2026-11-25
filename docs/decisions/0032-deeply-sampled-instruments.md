# 0032: Deeply sampled instruments, loudness layers, takes and strums

**Status:** Accepted, 2026-11-24. Builds on ADR 0031: most instruments move from the MuseScore General soundfont to deeper free libraries; the organ and harmonica stay on the soundfont.

## Context

The soundfont (ADR 0031) gave real, in-tune notes, but it's General MIDI grade, and three things still sounded mechanical:
- every drum hit was one recording, played identically each time;
- a note played softly was the hard recording turned down;
- chords landed all at once, so the guitar never strummed and the piano never rolled.

Joe asked for something more realistic and chose deeper sample libraries that keep everything interactive, over a fully generated band.

## Decision

- **Real sampled instruments, from free libraries** (official releases only, each pinned by URL and sha256 in `src/data/jam.yaml`, none committed):

  | Part | Library | License |
  |---|---|---|
  | Drums, sticks | Virtuosity Drums v0.925 (Versilian Studios and Karoryfer) | CC0 |
  | Drums, brushes | Swirly Drums v1.104 (Karoryfer) | CC0 |
  | Upright bass | Meatbass v1.001 (Karoryfer) | CC0 |
  | Electric bass | Growlybass v1.002 (Karoryfer) | CC0 |
  | Guitars | Shinyguitar v1.002 (Karoryfer), an archtop | CC0 |
  | Piano | Salamander Grand Piano V3 (Alexander Holm; SFZ by kinwie) | CC BY 3.0 |
  | Tenor sax | MTG Solo Sax (MTG, UPF; SFZ by kinwie) | CC BY 4.0 |

  The organ and harmonica stay on the soundfont: no freely licensed drawbar organ or blues harmonica library beat it. Shinyguitar's pickup gives the clean tone; the same pickup through a small amp in the build (soft clipping into a cabinet curve, with ffmpeg) gives the crunch; its microphone gives the acoustic. Swirly has no cross-stick, so a soft hit on the snare's edge stands in. Together they're 3.5 GB to download and about 1 GB of memory to render.
- **Rendered with sfizz.** `sfizz_render` renders an SFZ program from a MIDI file. It isn't in Homebrew, so it's built from source into `.cache/tools/sfizz`: CMake, with one newer-Clang warning relaxed in a bundled library (`-Wno-missing-template-arg-list-after-template-kw`). Two catches, both handled by a wrapper program the script writes beside each library program:
  - sfizz streams long samples from disk, and an offline render outran the stream, cutting notes to their first 0.2 s. The wrapper sets `hint_ram_based=1`, so samples load whole.
  - Shinyguitar finds its samples through `$sample_dir`, defined only in a bank file for another player. The wrapper defines any such variable from the library's `.bank.xml`.
- **Loudness layers and takes.** Each note and drum hit is recorded at two or three velocities (`layers`) and in up to four `takes`, a few velocity steps apart, so a library's round robins and finer layers come through. The player picks the layer by how hard a note is played (`layerFor`) and plays the takes in turn per instrument and note, so repeated notes and hits differ. Every layer is leveled to the same loudness: the patterns' accents set how loud a note is, and the layer sets its color.
- **Leveled 6 dB lower, and brought back up in the player.** At the old −14 dB target a hard-played layer's tall attack hit the −1 dBFS ceiling first, and came out quieter than the soft layers (the electric bass's hardest notes were up to 7 dB down). Samples are now leveled to −20 dB, and the player adds 6 dB (`SAMPLE_GAIN`). A stick on a cymbal is so peaky it still fell 5 to 8 dB short, so drum hits that miss by more than 3 dB get the top of their transient gently rounded off first. A test fails if any harder layer comes out more than 4 dB quieter than a softer one of the same note.
- **Tuned from what's measured.** Every rendered note is checked for pitch and octave (`checkPitch`). The pitch search mistakes a low note with a weak fundamental, a bass's low E, for its octave, which looks just like a sample that really is an octave up. So a reading an octave high counts only if the note's own frequency is within 20 dB of its octave. This caught Growlybass, which is mapped an octave above where it sounds: its programs play at `transpose: 12`. Real recordings can be a little out of tune (two Growlybass low Es are 35 cents flat), so each sample keeps its measured pitch, the browser tunes from it, and the build only fails past 50 cents.
- **Strummed and rolled chords.** The guitar's downstrokes (on the beat) sweep low to high, 9 ms a string; its upstrokes sweep high to low, 6 ms a string, a touch lighter on the strings reached last. Piano and organ chords spread 3 ms a note. It's in seconds, so the same at any tempo (`strum`, tested).
- **The mix, rebalanced by the meters, with a safety limiter.** Real kick and snare recordings have proper attacks, so the drum strip came out 6.5 dB hotter than with the soundfont's kit, and the master touched full scale. The default drums fader went from −2 to −7 dB, the bass from −0.5 to −3, the master from −1 to −3 (styles that set their own drum level moved with it). A limiter at the very end of the master, just under full scale, stops a pile-up of hits from ever clipping, and otherwise does nothing. Across five styles the master now peaks around −1 to −4 dBFS.
- **Kept to size.** Each sound is cut a little past the longest the patterns hold it (a hi-hat at 0.6 s, a bass note at 1.6 s, a crash at 2.6 s), faded, and encoded at 64 kbps mono. The library is 354 files, 6.1 MB; the most a default band could load is 2.3 MB, and a song loads only what its key and feel use.

## Consequences

- `npm run jam:sounds` needs the libraries in `.cache/libraries/<id>/archive.zip` (it checks and unpacks them), `sfizz_render` (or `SFIZZ_RENDER` pointing at one), FluidSynth, ffmpeg and unzip. It takes about 3 minutes.
- Two libraries need attribution (CC BY), so the page's credits list every source from the manifest, and `src/assets/jam/CREDITS.md` says the same beside the samples. A test fails if a library in the manifest is missing from the credits.
- A song downloads more than before (it was about 560 KB with the generated sounds). It loads during "Getting the band together".
