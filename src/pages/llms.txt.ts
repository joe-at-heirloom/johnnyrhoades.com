/*
  /llms.txt (PLAN.md section 10): who Johnny is, the canonical URLs and how to
  book, for answer engines. Sentences come from the facts ledger under the
  press kit's rules (LLMS_ABOUT in src/lib/copy.ts); shows from the data.
*/
import type { APIRoute } from 'astro';
import { LLMS_ABOUT } from '../lib/copy';
import { llmsTxt } from '../lib/discovery';
import { facts, profiles } from '../lib/load-content';
import { allShows, BUILD_NOW } from '../lib/load-shows';
import { liveLinks } from '../lib/media';

export const GET: APIRoute = () =>
  new Response(
    llmsTxt({
      about: LLMS_ABOUT.map((id) => facts.third(id, 'epk')),
      shows: allShows,
      now: BUILD_NOW,
      links: liveLinks(profiles),
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
