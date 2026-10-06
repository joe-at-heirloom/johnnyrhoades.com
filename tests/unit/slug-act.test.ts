import { describe, expect, it } from 'vitest';
import { actLabel, billingFor, inferAct, splitVenueLabel } from '../../src/lib/act.ts';
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

describe('reading Johnny’s own labels (ADR 0020)', () => {
  const me = 'Johnny Rhoades';
  const bill = (label: string) => {
    const act = inferAct({ title: label, lineup: [me], artistName: me });
    return [act, billingFor({ act, title: label, lineup: [me], artistName: me })];
  };

  // Every label below is one he has typed into Bandsintown (captured 2026-10-05).
  it.each([
    ['Solo Acoustic', 'solo', me],
    ['Solo Acoustic Brunch', 'solo', me],
    ['Johnny Rhoades Trio', 'trio', 'Johnny Rhoades Trio'],
    ['Johnny Rhoades Band', 'band', 'Johnny Rhoades Band'],
    ['Motor City Josh and the Big 3', 'guest', 'Motor City Josh & The Big 3, with Johnny Rhoades'],
    ['Motor City Josh and Big 3', 'guest', 'Motor City Josh & The Big 3, with Johnny Rhoades'],
    ['Motor City Josh and the Big 3 (with horns!)', 'guest', 'Motor City Josh & The Big 3, with Johnny Rhoades'],
    ['Motor City Josh and the Big 3 w/horns', 'guest', 'Motor City Josh & The Big 3, with Johnny Rhoades'],
    ['Motor City Josh and the Big 3 (DBS Monthly Open Jam)', 'guest', 'Motor City Josh & The Big 3, with Johnny Rhoades'],
    ['MCJ Big Band!', 'guest', 'Motor City Josh Big Band, with Johnny Rhoades'],
    ['Motor City Josh and the Big 3 BIG BAND', 'guest', 'Motor City Josh Big Band, with Johnny Rhoades'],
    ['Pat Smillie Band Open Jam', 'guest', 'Pat Smillie Band, with Johnny Rhoades'],
    ['Pat Smillie Band (open jam)', 'guest', 'Pat Smillie Band, with Johnny Rhoades'],
    ['The Pat Smillie Band', 'guest', 'Pat Smillie Band, with Johnny Rhoades'],
    ['Pat Smillie Duo (acoustic)', 'guest', 'Pat Smillie Duo, with Johnny Rhoades'],
    ['Pat Smillie & Johnny Rhoades (acoustic)', 'guest', 'Pat Smillie, with Johnny Rhoades'],
    ['Brett Lucas & Johnny Rhoades Acoustic Duo', 'guest', 'Brett Lucas, with Johnny Rhoades'],
    ['Acoustic Duo w/ Brett Lucas', 'guest', 'Brett Lucas, with Johnny Rhoades'],
    ['The Lucas Rhoades Band', 'guest', 'Lucas Rhoades Band, with Johnny Rhoades'],
    ['w/ Theo Spight Band', 'guest', 'Theo Spight Band, with Johnny Rhoades'],
    ['Hosting open jam', 'host', 'Open jam hosted by Johnny Rhoades'],
    ['Johnny Rhoades Hosts Open Jam', 'host', 'Open jam hosted by Johnny Rhoades'],
    ['Hosting Acoustic Open Mic', 'host', 'Open mic hosted by Johnny Rhoades'],
    // Not enough to go on: billed as plain Johnny Rhoades rather than guessed.
    ['Duo', 'unspecified', me],
    ['Joe Cocker Tribute', 'unspecified', me],
    ['Julianne Ankley', 'unspecified', me],
  ])('"%s" → %s, billed "%s"', (label, act, billing) => {
    expect(bill(label)).toEqual([act, billing]);
  });

  it.each([
    ['Solo Acoustic @ The Whiskey Six', 'Solo Acoustic', 'The Whiskey Six'],
    ['Motor City Josh and the Big 3 @Three Blind Mice', 'Motor City Josh and the Big 3', 'Three Blind Mice'],
    ["Pat Smillie Band - Octopus' Beer Garden", 'Pat Smillie Band', "Octopus' Beer Garden"],
    ["Pat Smillie Band Open Jam at Kapone's", 'Pat Smillie Band Open Jam', "Kapone's"],
    ['Blue Goose Inn', undefined, 'Blue Goose Inn'],
    ["Eat at Joe's", undefined, "Eat at Joe's"],
    ['Bar - Grill', undefined, 'Bar - Grill'],
  ])('splits the venue name "%s"', (name, label, venue) => {
    expect(splitVenueLabel(name, me)).toEqual(label ? { label, venue } : { venue });
  });

  it('labels the open jam', () => {
    expect(actLabel('host', 'Open jam hosted by Johnny Rhoades')).toBe('Hosting the open jam');
    expect(actLabel('host', 'Open mic hosted by Johnny Rhoades')).toBe('Hosting the open mic');
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
