/*
  The blues maker's sound manifest (src/data/jam.yaml), validated. Kept out
  of src/lib/jam.ts so the page's script never bundles zod, which probes for
  eval on load and trips the CSP (ADR 0030). Used by scripts/make-jam-sounds.ts
  and the unit tests.

  Three kinds of sound (ADR 0031): pitched tones and drum hits rendered from
  a soundfont, and loops generated with ElevenLabs.
*/
import { z } from 'zod';
import { PARTS, TONES, type DrumPiece } from './jam.ts';

const id = z.string().regex(/^[a-z0-9-]+$/);
const midi = z.number().int().min(0).max(127);

const Tone = z.object({
  part: z.enum(['bass', 'guitar', 'keys', 'lead']),
  tone: z.string(),
  /** General MIDI program, from 0. */
  preset: midi,
  /** The soundfont's name for it, to make the manifest readable and the credits exact. */
  name: z.string(),
  velocity: midi,
  seconds: z.number().min(0.2).max(10),
});
const Drum = z.object({ id, tone: z.string(), kit: midi, key: midi, velocity: midi });
const Generated = z.object({
  id,
  part: z.enum(PARTS),
  tone: z.string(),
  prompt: z.string().min(10),
  seconds: z.number().min(0.5).max(30),
  loop: z.boolean().optional(),
});
const Manifest = z.object({
  soundfont: z.object({ file: z.string(), url: z.url(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
  tones: z.array(Tone),
  drums: z.array(Drum),
  generated: z.array(Generated),
});
export type JamManifest = z.infer<typeof Manifest>;
export type ToneSpec = z.infer<typeof Tone>;
export type DrumSpec = z.infer<typeof Drum>;
export type GeneratedSpec = z.infer<typeof Generated>;

/** The drum pieces each kit needs: what the patterns play (src/lib/jam.ts). */
export const DRUM_PIECES: readonly DrumPiece[] = ['kick', 'snare', 'hat', 'ride', 'crash', 'rim'];

export function parseJamManifest(data: unknown): JamManifest {
  const m = Manifest.parse(data);
  const known = (part: keyof typeof TONES, tone: string) => (TONES[part] as readonly string[]).includes(tone);
  const seen = new Set<string>();
  for (const t of m.tones) {
    if (!known(t.part, t.tone)) throw new Error(`jam.yaml: unknown ${t.part} tone ${t.tone}`);
    if (seen.has(`${t.part}/${t.tone}`)) throw new Error(`jam.yaml: ${t.part}/${t.tone} is listed twice`);
    seen.add(`${t.part}/${t.tone}`);
  }
  const ids = new Set<string>();
  for (const s of [...m.drums, ...m.generated]) {
    if (ids.has(s.id)) throw new Error(`jam.yaml: duplicate id ${s.id}`);
    ids.add(s.id);
  }
  for (const d of m.drums) if (!known('drums', d.tone)) throw new Error(`jam.yaml: ${d.id} has unknown kit ${d.tone}`);
  for (const g of m.generated) if (!known(g.part, g.tone)) throw new Error(`jam.yaml: ${g.id} has unknown tone ${g.tone} for ${g.part}`);
  return m;
}
