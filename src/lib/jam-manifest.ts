/*
  The blues maker's sound manifest (src/data/jam.yaml), validated. Kept out
  of src/lib/jam.ts so the page's script never bundles zod, which probes for
  eval on load and trips the CSP (ADR 0030). Used by scripts/make-jam-sounds.ts
  and the unit tests.

  Instruments and drum kits are rendered from a source (ADRs 0031 and 0032):
  the MuseScore General soundfont, or one of the sampled-instrument libraries
  listed under `libraries`, each pinned by URL and checksum. Each is recorded
  at one or more loudness layers (`layers`: the MIDI velocities to play) and
  in `takes` (repeats, so a library's round robins are kept). Room loops are
  generated with ElevenLabs.
*/
import { z } from 'zod';
import { PARTS, TONES, type DrumPiece } from './jam.ts';

const id = z.string().regex(/^[a-z0-9-]+$/);
const midi = z.number().int().min(0).max(127);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

const Library = z.object({
  name: z.string(),
  by: z.string(),
  license: z.string(),
  url: z.url(),
  sha256,
  /** The folder inside the archive that holds the .sfz programs. */
  root: z.string(),
});

/** Where a sound is rendered from: the soundfont (a GM program) or a library (an .sfz program in it). */
const Source = {
  from: z.string(),
  /** General MIDI program, from 0, for the soundfont (a drum kit's program on channel 10). */
  preset: midi.optional(),
  /** The .sfz program, relative to the library's root, for a library. */
  sfz: z.string().optional(),
  /** MIDI controllers to set before playing (a library's mic blend, its hi-hat openness). */
  cc: z.record(z.string().regex(/^\d+$/), midi).optional(),
  /** The velocities to record at: one loudness layer each, softest first. */
  layers: z.array(midi).min(1),
  /** How many times to record each note at each layer, so a library's round robins come along. */
  takes: z.number().int().min(1).max(8).default(1),
};

const Tone = z.object({
  ...Source,
  part: z.enum(['bass', 'guitar', 'keys', 'lead']),
  tone: z.string(),
  /** What it is, for the manifest's readers and the credits. */
  name: z.string(),
  seconds: z.number().min(0.2).max(10),
  /** Semitones to add to the key played, for a library mapped away from sounding pitch. */
  transpose: z.number().int().default(0),
  /** An amp to put a clean recording through: "crunch" is a small tube amp turned up. */
  amp: z.enum(['crunch']).optional(),
  /** An organ's drawbars only repeat octaves under the key, so its pitch check accepts any octave of the note. */
  octaves: z.enum(['any']).optional(),
});
const Drum = z.object({ ...Source, tone: z.string(), piece: z.enum(['kick', 'snare', 'hat', 'ride', 'crash', 'rim']), key: midi });
const Generated = z.object({
  id,
  part: z.enum(PARTS),
  tone: z.string(),
  prompt: z.string().min(10),
  seconds: z.number().min(0.5).max(30),
  loop: z.boolean().optional(),
});
const Manifest = z.object({
  soundfont: z.object({ file: z.string(), url: z.url(), sha256 }),
  libraries: z.record(id, Library).default({}),
  tones: z.array(Tone),
  drums: z.array(Drum),
  generated: z.array(Generated),
});
export type JamManifest = z.infer<typeof Manifest>;
export type ToneSpec = z.infer<typeof Tone>;
export type DrumSpec = z.infer<typeof Drum>;
export type GeneratedSpec = z.infer<typeof Generated>;
export type LibrarySpec = z.infer<typeof Library>;

/** The drum pieces each kit needs: what the patterns play (src/lib/jam.ts). */
export const DRUM_PIECES: readonly DrumPiece[] = ['kick', 'snare', 'hat', 'ride', 'crash', 'rim'];

/**
 * A rendered sample's id: "upright-40" for one recording of a note, with
 * "-l1" and "-t2" when it's one of several loudness layers or takes.
 */
export function sampleId(base: string, layer: number, layers: number, take: number, takes: number): string {
  return `${base}${layers > 1 ? `-l${layer}` : ''}${takes > 1 ? `-t${take}` : ''}`;
}

export function parseJamManifest(data: unknown): JamManifest {
  const m = Manifest.parse(data);
  const known = (part: keyof typeof TONES, tone: string) => (TONES[part] as readonly string[]).includes(tone);
  const source = (what: string, s: { from: string; preset?: number; sfz?: string; layers: number[] }) => {
    if (s.from === 'soundfont' ? s.preset === undefined : !s.sfz) throw new Error(`jam.yaml: ${what} needs ${s.from === 'soundfont' ? 'a preset' : 'an sfz program'}`);
    if (s.from !== 'soundfont' && !m.libraries[s.from]) throw new Error(`jam.yaml: ${what} is from ${s.from}, which isn't in libraries`);
    if (s.layers.some((v, i) => i > 0 && v <= s.layers[i - 1]!)) throw new Error(`jam.yaml: ${what}'s layers must go from soft to hard`);
  };
  const seen = new Set<string>();
  for (const t of m.tones) {
    if (!known(t.part, t.tone)) throw new Error(`jam.yaml: unknown ${t.part} tone ${t.tone}`);
    if (seen.has(`${t.part}/${t.tone}`)) throw new Error(`jam.yaml: ${t.part}/${t.tone} is listed twice`);
    seen.add(`${t.part}/${t.tone}`);
    source(`${t.part}/${t.tone}`, t);
  }
  for (const d of m.drums) {
    if (!known('drums', d.tone)) throw new Error(`jam.yaml: unknown kit ${d.tone}`);
    if (seen.has(`${d.tone}/${d.piece}`)) throw new Error(`jam.yaml: ${d.tone} ${d.piece} is listed twice`);
    seen.add(`${d.tone}/${d.piece}`);
    source(`${d.tone} ${d.piece}`, d);
  }
  const ids = new Set<string>();
  for (const g of m.generated) {
    if (ids.has(g.id)) throw new Error(`jam.yaml: duplicate id ${g.id}`);
    ids.add(g.id);
    if (!known(g.part, g.tone)) throw new Error(`jam.yaml: ${g.id} has unknown tone ${g.tone} for ${g.part}`);
  }
  return m;
}
