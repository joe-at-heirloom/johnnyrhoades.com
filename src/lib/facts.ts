/*
  The facts ledger (PLAN.md section 6.4). Pages never state a biographical
  claim directly: they ask for it by id and context, and get an error, at
  build time and in `npm run check`, if the claim's status isn't allowed there.
*/
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const STATUSES = ['verified', 'confirmed_by_johnny', 'unverified'] as const;
export type FactStatus = (typeof STATUSES)[number];

/** Where a claim may appear, by status (PLAN.md section 6.4). */
export const ALLOWED: Record<FactContext, readonly FactStatus[]> = {
  home: ['verified', 'confirmed_by_johnny'],
  epk: ['verified', 'confirmed_by_johnny'],
  schema: ['verified'],
};
export type FactContext = 'home' | 'epk' | 'schema';

const SourceSchema = z.strictObject({ url: z.url().optional(), note: z.string().min(1) });

export const FactSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9-]+$/),
    third: z.string().min(1),
    first: z.string().min(1).optional(),
    status: z.enum(STATUSES),
    tags: z.array(z.enum(['festival', 'highlight'])).optional(),
    sources: z.array(SourceSchema).default([]),
    needs: z.string().optional(),
    detect: z.string().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.status === 'verified' && !f.sources.some((s) => s.url))
      ctx.addIssue({ code: 'custom', message: `${f.id}: verified facts need a source with a URL` });
    if (f.status === 'unverified' && !f.needs)
      ctx.addIssue({ code: 'custom', message: `${f.id}: unverified facts need a "needs" note` });
    if (f.status === 'unverified' && !f.detect)
      ctx.addIssue({ code: 'custom', message: `${f.id}: unverified facts need a "detect" string so built pages can be checked` });
  });

export type Fact = z.infer<typeof FactSchema>;

export function parseFacts(yamlText: string): Fact[] {
  const facts = z.array(FactSchema).parse(parseYaml(yamlText) ?? []);
  const seen = new Set<string>();
  for (const f of facts) {
    if (seen.has(f.id)) throw new Error(`Duplicate fact id "${f.id}"`);
    seen.add(f.id);
  }
  return facts;
}

export class FactUseError extends Error {
  override name = 'FactUseError';
}

/** A ledger with the status rules built in. */
export function ledger(facts: Fact[]) {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const get = (id: string, context: FactContext): Fact => {
    const fact = byId.get(id);
    if (!fact) throw new FactUseError(`No fact "${id}" in facts.yaml`);
    if (!ALLOWED[context].includes(fact.status)) {
      throw new FactUseError(`Fact "${id}" is ${fact.status}, which can't appear in ${context} (PLAN.md section 6.4)`);
    }
    return fact;
  };
  return {
    all: facts,
    get,
    /** Johnny's voice for the home page. */
    first: (id: string) => {
      const f = get(id, 'home');
      if (!f.first) throw new FactUseError(`Fact "${id}" has no first-person wording`);
      return f.first;
    },
    third: (id: string, context: FactContext = 'epk') => get(id, context).third,
    tagged: (tag: 'festival' | 'highlight', context: FactContext = 'epk') =>
      facts.filter((f) => f.tags?.includes(tag) && ALLOWED[context].includes(f.status)),
    allowed: (context: FactContext) => facts.filter((f) => ALLOWED[context].includes(f.status)),
    unverified: () => facts.filter((f) => f.status === 'unverified'),
  };
}

export type Ledger = ReturnType<typeof ledger>;

/** "*Title*" → segments, so pages can set titles in <cite> and plain text stays plain. */
export function segments(text: string): { text: string; title: boolean }[] {
  return text
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .map((part) => (part.startsWith('*') && part.endsWith('*') ? { text: part.slice(1, -1), title: true } : { text: part, title: false }));
}

export const plain = (text: string) => text.replace(/\*([^*]+)\*/g, '$1');
