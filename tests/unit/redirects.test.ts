import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRedirectMap, redirectMatches } from '../../src/lib/redirects.ts';

describe('redirect map', () => {
  const rows = parseRedirectMap(readFileSync('docs/redirect-map.csv', 'utf8'));

  it('covers every URL found on the old site, once each', () => {
    expect(rows.map((r) => r.from)).toContain('/home');
    expect(rows.filter((r) => r.from.startsWith('/track/'))).toHaveLength(5);
    expect(new Set(rows.map((r) => r.from)).size).toBe(rows.length);
    expect(rows.every((r) => r.status === 301)).toBe(true);
  });

  it('parses quoted notes and rejects bad rows', () => {
    expect(parseRedirectMap('from,to,status,note\n/a,/b,301,"one, two"')).toEqual([{ from: '/a', to: '/b', status: 301, note: 'one, two' }]);
    expect(() => parseRedirectMap('from,to,status,note\na,/b,301,x')).toThrow(/must start with \//);
    expect(() => parseRedirectMap('from,to,status,note\n/a,/b,302,x')).toThrow(/301 or 308/);
    expect(() => parseRedirectMap('old,new\n/a,/b')).toThrow(/must start with: from,to,status,note/);
  });

  it('matches a response by status and resolved Location', () => {
    const row = { from: '/home', to: '/', status: 301, note: '' };
    const base = 'https://johnnyrhoades.com';
    expect(redirectMatches(row, base, 301, 'https://johnnyrhoades.com/')).toBe(true);
    expect(redirectMatches(row, base, 301, '/')).toBe(true);
    expect(redirectMatches(row, base, 302, '/')).toBe(false);
    expect(redirectMatches(row, base, 301, '/shows/')).toBe(false);
    expect(redirectMatches(row, base, 200, null)).toBe(false);
  });
});
