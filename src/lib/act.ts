/*
  Which act is playing: solo, trio, full band, Johnny as a guest in someone
  else's band, or hosting. Johnny doesn't have to type anything special: the
  act is read from the title if he fills it in, or from the label he has put
  in front of the venue name for years ("Solo Acoustic @ The Whiskey Six").
  Anything unrecognized stays unspecified and is billed as plain "Johnny
  Rhoades". Overrides in show-overrides.yaml win. ADR 0020.
*/
import type { Act } from './shows-schema.ts';

const GUEST = /^(?:with|w\/)\s*(.+)$/i;
/** "Acoustic Duo w/ Brett Lucas", but also "Motor City Josh and the Big 3 w/horns". */
const WITH_TAIL = /^(.*?)\s*\b(?:with|w\/)\s*(.+)$/i;
/** Words that describe the format rather than name anyone. */
const FORMAT_WORDS = /\b(?:solo|acoustic|electric|duo|trio|full|band|brunch|set|friends|guests?)\b/gi;
/** Trailing words that describe the night rather than the act. */
const NIGHT_SUFFIX = /\s+(?:open\s+jam|jam|double\s+bill|event|show)$/i;
/** A name that ends like an act: "Pat Smillie Band", "Brett Lucas Duo". */
const ACT_SUFFIX = /\b(?:band|duo|trio|quartet|orchestra|revue)$/i;
const HOST = /\bhost|^open mic$/i;

/** The acts Johnny plays in most, under every spelling he has used. */
const ALIASES: [RegExp, string][] = [
  [/^(?:motor city josh|mcj)(?:\s+(?:and|&)\s+(?:the\s+)?big\s*(?:3|three))?\s+big band$/i, 'Motor City Josh Big Band'],
  [/^motor city josh\s+(?:and|&)\s+(?:the\s+)?big\s*(?:3|three)$/i, 'Motor City Josh & The Big 3'],
  [/^motor city josh$/i, 'Motor City Josh'],
];

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Drops "(open jam)", "(with horns!)" and trailing punctuation. */
const tidy = (s: string) => squash(s.replace(/\([^)]*\)/g, ' ').replace(/[!.,;:]+\s*$/, ''));
const stripConnectors = (s: string) => squash(s.replace(/^(?:&|and|\+|-)\s+|\s+(?:&|and|\+|-)$/gi, '').replace(/^(?:&|and)$/i, ''));
const withoutNight = (s: string) => {
  let out = s;
  while (NIGHT_SUFFIX.test(out)) out = out.replace(NIGHT_SUFFIX, '');
  return out;
};

function canonicalLeader(name: string): string {
  const n = squash(withoutNight(tidy(name)).replace(/^the\s+/i, ''));
  return ALIASES.find(([re]) => re.test(n))?.[1] ?? n;
}

const isAlias = (s: string) => ALIASES.some(([re]) => re.test(squash(withoutNight(tidy(s)).replace(/^the\s+/i, ''))));
const isFormatOnly = (s: string) => squash(s.replace(FORMAT_WORDS, ' ').replace(/[&+,/-]|\band\b/gi, ' ')) === '';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type Label = { act: Act; leader?: string; jam?: boolean };

/** Reads a free-text label: a Bandsintown title, or the part of a venue name before "@". */
export function readLabel(label: string, artistName: string): Label {
  const raw = tidy(label);
  if (!raw) return { act: 'unspecified' };
  if (HOST.test(raw)) return { act: 'host', jam: /\bjam\b/i.test(raw) };

  const guest = raw.match(GUEST);
  if (guest) return { act: 'guest', leader: canonicalLeader(guest[1]!) };
  const tail = raw.match(WITH_TAIL);
  if (tail && isFormatOnly(tail[1]!)) return { act: 'guest', leader: canonicalLeader(tail[2]!) };
  // "Motor City Josh and the Big 3 w/horns": the tail qualifies the act, it doesn't name it.
  const text = tail ? tail[1]! : raw;

  const mine = new RegExp(`\\b${escape(artistName)}\\b`, 'i');
  if (mine.test(text)) {
    const rest = stripConnectors(squash(text.replace(mine, ' ')));
    // "Pat Smillie & Johnny Rhoades Acoustic": a shared bill with someone else.
    const other = stripConnectors(squash(withoutNight(rest).replace(FORMAT_WORDS, ' ')));
    if (other) return { act: 'guest', leader: canonicalLeader(other) };
    return { act: ownFormat(rest) };
  }
  if (isFormatOnly(withoutNight(text))) return { act: ownFormat(text) };

  const leader = squash(withoutNight(text));
  if (isAlias(leader) || ACT_SUFFIX.test(leader)) return { act: 'guest', leader: canonicalLeader(leader) };
  return { act: 'unspecified' };
}

function ownFormat(text: string): Act {
  if (/\btrio\b/i.test(text)) return 'trio';
  if (/\bband\b/i.test(text)) return 'band';
  if (/\bduo\b/i.test(text)) return 'unspecified'; // a duo with someone unnamed
  if (/\bsolo\b|\bacoustic\b/i.test(text)) return 'solo';
  return 'unspecified';
}

/**
 * Splits a venue name Johnny has labeled: "Solo Acoustic @ The Whiskey Six",
 * "Pat Smillie Band - Octopus' Beer Garden", "Pat Smillie Band Open Jam at
 * Kapone's". "@" always splits; " - " and " at " only when the left side reads
 * as an act, so a venue called "Eat at Joe's" stays whole.
 */
export function splitVenueLabel(name: string, artistName: string): { label?: string; venue: string } {
  const at = name.indexOf('@');
  if (at > 0 && name.slice(at + 1).trim()) return { label: squash(name.slice(0, at)), venue: squash(name.slice(at + 1)) };
  for (const sep of [/\s+[-–—]\s+/, /\s+at\s+/i]) {
    const m = name.match(sep);
    if (!m || m.index === undefined) continue;
    const left = squash(name.slice(0, m.index));
    const right = squash(name.slice(m.index + m[0].length));
    if (left && right && readLabel(left, artistName).act !== 'unspecified') return { label: left, venue: right };
  }
  return { venue: squash(name) };
}

/** Precedence matters: "Acoustic trio" is a trio, "With the Lucas Rhoades Band" is a guest spot. */
export function inferAct({ title, lineup, artistName }: { title: string; lineup: string[]; artistName: string }): Act {
  const fromLabel = readLabel(title, artistName).act;
  if (fromLabel !== 'unspecified') return fromLabel;
  const leader = lineup[0];
  if (leader && leader.toLowerCase() !== artistName.toLowerCase()) return 'guest';
  return 'unspecified';
}

/** Who's billed: "Johnny Rhoades Trio", or "Motor City Josh & The Big 3, with Johnny Rhoades". */
export function billingFor({ act, title, lineup, artistName }: { act: Act; title: string; lineup: string[]; artistName: string }): string {
  const label = readLabel(title, artistName);
  switch (act) {
    case 'trio':
      return `${artistName} Trio`;
    case 'band':
      return `${artistName} Band`;
    case 'guest': {
      const leader = label.leader ?? lineup.find((name) => name.toLowerCase() !== artistName.toLowerCase());
      return leader ? `${leader}, with ${artistName}` : artistName;
    }
    case 'host':
      return `${label.jam ? 'Open jam' : 'Open mic'} hosted by ${artistName}`;
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
      return billing.startsWith('Open jam') ? 'Hosting the open jam' : 'Hosting the open mic';
    default:
      return '';
  }
}
