/*
  The sync guard (PLAN.md section 6.2, rule 5). If Bandsintown suddenly
  returns no upcoming shows, or far fewer than we have stored, it's far more
  likely to be an API problem than Johnny cancelling his calendar. Fail the
  job, commit nothing, and let GitHub send the failure email.
*/
import type { DateTime } from 'luxon';
import type { FreshShow, Show } from './shows-schema.ts';
import { isAfter } from './time.ts';

export class SyncGuardError extends Error {
  override name = 'SyncGuardError';
}

export function checkGuard({ existing, freshUpcoming, now }: { existing: Show[]; freshUpcoming: FreshShow[]; now: DateTime }): void {
  const stored = existing.filter((s) => s.public && s.status === 'scheduled' && isAfter(s.start, now));
  if (stored.length < 3) return;

  if (freshUpcoming.length === 0) {
    throw new SyncGuardError(
      `Bandsintown returned no upcoming shows, but ${stored.length} future shows are stored. Nothing was committed. ` +
        'If Johnny really cleared his calendar, run the sync with --force.',
    );
  }

  const freshIds = new Set(freshUpcoming.map((s) => s.id));
  const missing = stored.filter((s) => !freshIds.has(s.id));
  if (missing.length > Math.max(3, stored.length / 2)) {
    throw new SyncGuardError(
      `${missing.length} of ${stored.length} stored future shows are missing from Bandsintown's upcoming list. ` +
        'That looks like an API problem, so nothing was committed. Run the sync with --force if it is real.',
    );
  }
}
