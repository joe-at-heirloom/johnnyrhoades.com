# 0031: Real instrument samples from MuseScore General

**Status:** Accepted, 2026-11-24. Replaces the instrument and drum sounds of ADR 0030 (generated with ElevenLabs and retuned); the room loops stay generated.

## Context

The blues maker's instruments were one-shots from ElevenLabs' sound-effects model. It can't play a requested note (it mostly played C, in whatever octave it liked), so each tone had two recordings, measured with YIN and pitch-shifted with TD-PSOLA up to 16 semitones to cover its range. It worked and stayed in tune, but every note was a stretched copy of one of two takes. Joe asked whether real recorded or better generated audio was available instead.

## Decision

- **The instruments and drums come from the MuseScore General soundfont** (version 0.2, by S. Christian Collins, built on Frank Wen's FluidR3 and Michael Cowgill's FluidR3Mono). One file covers every tone the page offers: Acoustic Bass and Fingered Bass, Overdrive, Jazz and Steel String guitars, the Grand Piano (the public-domain Splendid Grand), Drawbar Organ, Harmonica, Tenor Sax, and the Jazz and Brush drum kits. It's MIT-licensed; the sample-sources list credits nothing else for these presets.
- **Rendered at true pitch, not retuned.** `npm run jam:sounds` writes each instrument's notes into one MIDI file (`src/lib/midi.ts`, tested) and renders it dry with FluidSynth: no reverb or chorus, since the console adds the room. It renders a note every SAMPLE_STEP (3) semitones across what the part plays. Each note is measured anyway: the run fails if one is more than 25 cents out. The worst is 14 cents (the jazz guitar); the harmonica is within 1 and the organ within 2. The organ's drawbars together only repeat two octaves under the key, so the check accepts any octave of the right note. Rendering one file per instrument and kit, not one per note, took the run from about 4.5 minutes to under 1.5, because loading the compressed soundfont is the slow part.
- **The soundfont isn't committed.** It's 40 MB and only the rendered notes are served. It goes in `.cache/soundfont/` (ignored), from the URL in `src/data/jam.yaml`, which also pins its sha256. The script checks it.
- **The license travels with the samples.** MIT asks that the acknowledgements and copyright notices be included in any derivative work. `src/assets/jam/LICENSE-MuseScore_General.md` sits beside the samples, and the page shows it word for word under "Sound credits and licenses" (`src/components/SoundCredits.astro`), since the page is what serves them.
- **The room loops stay as they were**, generated once with ElevenLabs; their originals remain in `src/assets/jam-source/`. The ElevenLabs instrument and drum originals and the PSOLA shifter are gone (git history has them).
- **Leveling is unchanged** (every note to −14 dB RMS over its first 300 ms, peaks under −1 dBFS), so the mix carried over. The fills came out about 12 dB under the drum peaks, against 8 with the old harp, so their default fader went up 2 dB, and in the two styles that feature them.

## Alternatives

- **The CC0 libraries on SFZ Instruments**, mostly Karoryfer's: Meatbass, Growlybass, Black and Green Guitars, the Gogodze Phu and SM Drums kits, MTG Solo Sax (CC-BY). They're deeper-sampled, but there's no freely licensed drawbar organ or blues harmonica among them, they run from hundreds of MB to several GB each, and they need an SFZ renderer. They remain the upgrade path for the drums, bass and guitar if those sound thin.
- **gleitz's prerendered MIDI.js soundfonts** (per-instrument JavaScript of FluidR3). Their license is stated two ways (CC-BY 3.0 in the readme, MIT in metadata), and they would be fetched from a third-party host at runtime. Rendering MuseScore General ourselves avoids both.

## Consequences

- `npm run jam:sounds` needs FluidSynth (`brew install fluid-synth`) and the soundfont in `.cache/soundfont/`. It needs ELEVENLABS_API_KEY only to regenerate a room loop.
- The rendered library is 92 files, about 2.3 MB. A song downloads only what it can play.
- The page's note says the instruments are real recordings from a free soundfont and the room sounds were generated, and still that it isn't Johnny or his band.
