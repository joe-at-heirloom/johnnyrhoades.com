/*
  The redirect map (docs/redirect-map.csv): old Bandzoogle URLs and where
  they go now (PLAN.md section 14). Cloudflare does the redirecting; this
  file only reads the map so tests and scripts/check-redirects.ts can hold
  Cloudflare to it.
*/

export type Redirect = { from: string; to: string; status: number; note: string };

/** Plain CSV with a header row. Notes may be quoted to hold commas. */
export function parseRedirectMap(csv: string): Redirect[] {
  const [header, ...rows] = csv.trim().split('\n');
  if (header?.trim() !== 'from,to,status,note') throw new Error('redirect-map.csv must start with: from,to,status,note');
  return rows.map((line, i) => {
    const cells = [...line.matchAll(/("([^"]*(?:""[^"]*)*)"|[^,]*)(,|$)/g)].map((m) => (m[2] !== undefined ? m[2].replaceAll('""', '"') : (m[1] ?? '')));
    const [from = '', to = '', status = '', note = ''] = cells;
    const row = { from: from.trim(), to: to.trim(), status: Number(status), note: note.trim() };
    if (!row.from.startsWith('/') || !row.to.startsWith('/')) throw new Error(`redirect-map.csv line ${i + 2}: paths must start with /`);
    if (![301, 308].includes(row.status)) throw new Error(`redirect-map.csv line ${i + 2}: status must be 301 or 308`);
    return row;
  });
}

/** Whether a response matches its row: the right status and a Location that resolves to the target. */
export function redirectMatches(row: Redirect, base: string, status: number, location: string | null): boolean {
  if (status !== row.status || !location) return false;
  return new URL(location, base).href === new URL(row.to, base).href;
}
