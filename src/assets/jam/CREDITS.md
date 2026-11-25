# Blues maker sound credits

The samples in this folder are rendered from these sources by `npm run jam:sounds`
(`scripts/make-jam-sounds.ts`; ADRs 0031 and 0032). None of the sources is committed;
`src/data/jam.yaml` names each one's URL and checksum.

| Source | By | License | Used for |
|---|---|---|---|
| Virtuosity Drums v0.925 | Versilian Studios and Karoryfer Samples | CC0 1.0 | the sticks kit |
| Swirly Drums v1.104 | Karoryfer Samples | CC0 1.0 | the brushes kit |
| Meatbass v1.001 | Karoryfer Samples | CC0 1.0 | upright bass |
| Growlybass v1.002 | Karoryfer Samples | CC0 1.0 | electric bass |
| Shinyguitar v1.002 | Karoryfer Samples | CC0 1.0 | the three guitar tones (pickup, pickup through an amp, microphone) |
| Salamander Grand Piano V3 (SFZ by kinwie) | Alexander Holm | CC BY 3.0 | piano |
| MTG Solo Sax (SFZ by kinwie) | Music Technology Group, Universitat Pompeu Fabra | CC BY 4.0 | tenor sax |
| MuseScore General soundfont v0.2 | S. Christian Collins, from FluidR3 (Frank Wen) and FluidR3Mono (Michael Cowgill) | MIT, see `LICENSE-MuseScore_General.md` | drawbar organ, harmonica |

The piano samples are derived from the Salamander Grand Piano SFZ instrument
(https://github.com/sfzinstruments/SalamanderGrandPiano), and the tenor sax samples from
the MTG Solo Sax SFZ instrument (https://github.com/sfzinstruments/MTG.SoloSax).

The room loops (`room-bar`, `room-vinyl`) were generated with ElevenLabs' sound-effects model.
