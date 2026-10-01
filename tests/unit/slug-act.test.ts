import { describe, expect, it } from 'vitest';
import { actLabel, billingFor, inferAct } from '../../src/lib/act.ts';
import { showSlug, slugify } from '../../src/lib/slug.ts';

describe('slugify', () => {
  it.each([
    ['Blue Goose Inn', 'blue-goose-inn'],
    ["Octopus' Beer Garden", 'octopus-beer-garden'],
    ['St. Clair Shores', 'st-clair-shores'],
    ['Motor City Josh & The Big 3', 'motor-city-josh-and-the-big-3'],
    ['John Németh', 'john-nemeth'],
    ['  15th Street Tavern  ', '15th-street-tavern'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('showSlug', () => {
  it('joins date, venue and town', () => {
    expect(showSlug('2026-10-23', 'Blue Goose Inn', 'St. Clair Shores')).toBe('2026-10-23-blue-goose-inn-st-clair-shores');
  });
  it("doesn't repeat a town the venue name already ends with", () => {
    expect(showSlug('2026-07-04', 'Ferndale', 'Ferndale')).toBe('2026-07-04-ferndale');
    expect(showSlug('2026-07-04', 'Bar Detroit', 'Detroit')).toBe('2026-07-04-bar-detroit');
  });
});

describe('inferAct (PLAN.md section 6.2 and Appendix A)', () => {
  const me = 'Johnny Rhoades';
  it.each([
    ['Solo acoustic', 'solo'],
    ['Acoustic', 'solo'],
    ['Trio', 'trio'],
    ['Acoustic trio', 'trio'],
    ['Full band', 'band'],
    ['With Motor City Josh & The Big 3', 'guest'],
    ['w/ Jill Jack', 'guest'],
    ['With the Lucas Rhoades Band', 'guest'],
    ['Hosting open mic', 'host'],
    ['', 'unspecified'],
    ['Halloween party', 'unspecified'],
  ])('title "%s" → %s', (title, act) => {
    expect(inferAct({ title, lineup: [me], artistName: me })).toBe(act);
  });

  it('treats a lineup led by someone else as a guest spot', () => {
    expect(inferAct({ title: '', lineup: ['Jill Jack', me], artistName: me })).toBe('guest');
  });
});

describe('billing and labels', () => {
  const me = 'Johnny Rhoades';
  it('names the act', () => {
    expect(billingFor({ act: 'trio', title: 'Trio', lineup: [me], artistName: me })).toBe('Johnny Rhoades Trio');
    expect(billingFor({ act: 'band', title: 'Full band', lineup: [me], artistName: me })).toBe('Johnny Rhoades Band');
    expect(billingFor({ act: 'unspecified', title: '', lineup: [me], artistName: me })).toBe('Johnny Rhoades');
    expect(billingFor({ act: 'guest', title: 'With Motor City Josh & The Big 3', lineup: [me], artistName: me })).toBe(
      'Motor City Josh & The Big 3, with Johnny Rhoades',
    );
    expect(billingFor({ act: 'guest', title: '', lineup: ['Jill Jack', me], artistName: me })).toBe('Jill Jack, with Johnny Rhoades');
  });

  it('labels shows for lists and posters', () => {
    expect(actLabel('solo', 'Johnny Rhoades')).toBe('Solo acoustic');
    expect(actLabel('guest', 'Jill Jack, with Johnny Rhoades')).toBe('With Jill Jack');
    expect(actLabel('unspecified', 'Johnny Rhoades')).toBe('');
  });
});
