/*
  Which act is playing: solo, trio, full band, Johnny as a guest in someone
  else's band, or hosting. Read from the title Johnny types in Bandsintown
  (PLAN.md Appendix A) and the lineup. Overrides in show-overrides.yaml win.
*/
import type { Act } from './shows-schema.ts';

const GUEST = /^(?:with|w\/)\s+(.+)$/i;

/** Precedence matters: "Acoustic trio" is a trio, "With the Lucas Rhoades Band" is a guest spot. */
export function inferAct({ title, lineup, artistName }: { title: string; lineup: string[]; artistName: string }): Act {
  const t = title.trim().toLowerCase();
  const leader = lineup[0];
  if (/\bhost|open mic\b/.test(t)) return 'host';
  if (GUEST.test(t) || (leader && leader.toLowerCase() !== artistName.toLowerCase())) return 'guest';
  if (/\btrio\b/.test(t)) return 'trio';
  if (/\bband\b/.test(t)) return 'band';
  if (/\bsolo\b|\bacoustic\b/.test(t)) return 'solo';
  return 'unspecified';
}

/** Who's billed: "Johnny Rhoades Trio", or "Motor City Josh & The Big 3, with Johnny Rhoades". */
export function billingFor({ act, title, lineup, artistName }: { act: Act; title: string; lineup: string[]; artistName: string }): string {
  switch (act) {
    case 'trio':
      return `${artistName} Trio`;
    case 'band':
      return `${artistName} Band`;
    case 'guest': {
      const fromTitle = title.trim().match(GUEST)?.[1];
      const leader = fromTitle ?? lineup.find((name) => name.toLowerCase() !== artistName.toLowerCase());
      return leader ? `${leader}, with ${artistName}` : artistName;
    }
    case 'host':
      return `Open mic hosted by ${artistName}`;
    default:
      return artistName;
  }
}

/** Short label for show lists and posters. Empty when the act isn't known. */
export function actLabel(act: Act, billing: string): string {
  switch (act) {
    case 'solo':
      return 'Solo acoustic';
    case 'trio':
      return 'Trio';
    case 'band':
      return 'Full band';
    case 'guest': {
      const leader = billing.split(', with ')[0];
      return leader ? `With ${leader}` : 'Guest spot';
    }
    case 'host':
      return 'Hosting the open mic';
    default:
      return '';
  }
}
