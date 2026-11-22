/*
  The blues maker's sound manifest (src/data/jam.yaml), validated. Kept out
  of src/lib/jam.ts so the page's script never bundles zod, which probes for
  eval on load and trips the CSP (ADR 0030). Used by scripts/make-jam-sounds.ts
  and the unit tests.
*/
import { z } from 'zod';
import { PARTS, TONES } from './jam.ts';

const SoundSpec = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  part: z.enum(PARTS),
  tone: z.string(),
  prompt: z.string().min(10),
  seconds: z.number().min(0.5).max(30),
  note: z.string().optional(),
  loop: z.boolean().optional(),
});
export type SoundSpec = z.infer<typeof SoundSpec>;

export function parseJamManifest(data: unknown): SoundSpec[] {
  const sounds = z.object({ sounds: z.array(SoundSpec) }).parse(data).sounds;
  const ids = new Set<string>();
  for (const s of sounds) {
    if (ids.has(s.id)) throw new Error(`jam.yaml: duplicate id ${s.id}`);
    ids.add(s.id);
    if (!(TONES[s.part] as readonly string[]).includes(s.tone)) throw new Error(`jam.yaml: ${s.id} has unknown tone ${s.tone} for ${s.part}`);
    const pitched = s.part !== 'drums' && s.part !== 'room';
    if (pitched && !s.note) throw new Error(`jam.yaml: ${s.id} is pitched and needs a note`);
  }
  return sounds;
}

