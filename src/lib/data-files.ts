/* Validation for the hand-kept data files in src/data/. A typo should fail the sync loudly, not ship. */
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { Overrides } from './merge.ts';
import { ACTS, STATUSES } from './shows-schema.ts';
import type { VenueBook } from './venues.ts';

const VenueEntrySchema = z.strictObject({
  match: z.array(z.string()).optional(),
  name: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.coerce.string().optional(),
  url: z.string().optional(),
  blurb: z.string().optional(),
});

const OverrideSchema = z.strictObject({
  act: z.enum(ACTS).optional(),
  billing: z.string().min(1).optional(),
  status: z.enum(STATUSES).optional(),
  public: z.boolean().optional(),
  note: z.string().optional(),
});

export const SyncMetaSchema = z.object({
  source: z.enum(['api', 'fixtures']),
  heartbeatAt: z.string(),
  lastChangeAt: z.string().optional(),
  lastChangeSummary: z.string().optional(),
  counts: z.object({ upcoming: z.number().int(), past: z.number().int(), total: z.number().int() }),
});
export type SyncMeta = z.infer<typeof SyncMetaSchema>;

export function parseVenueBook(yamlText: string): VenueBook {
  return z.record(z.string(), VenueEntrySchema).parse(parseYaml(yamlText) ?? {});
}

export function parseOverrides(yamlText: string): Overrides {
  return z.record(z.string(), OverrideSchema).parse(parseYaml(yamlText) ?? {});
}

export function parseSyncMeta(text: string): SyncMeta {
  return SyncMetaSchema.parse(JSON.parse(text));
}

export const serializeSyncMeta = (meta: SyncMeta) => `${JSON.stringify(meta, null, 2)}\n`;
