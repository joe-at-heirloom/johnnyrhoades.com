/*
  What a poster says. Every fact here is also real text on the show page
  (PLAN.md section 4.1), and the alt text spells all of it out, in the
  order the card bills it: Johnny's name first, even on a guest spot
  (ADR 0017), with the act under it.
*/
import { actLabel } from '../act.ts';
import { ARTIST } from '../site.ts';
import type { Show } from '../shows-schema.ts';
import { clockTime, longDate } from '../time.ts';

export type PosterContent = {
  /** Under the name: "Trio", "Solo acoustic", "With Motor City Josh & The Big 3". Empty when unknown. */
  act: string;
  venue: string;
  town: string;
  date: string;
  time: string;
  free: boolean;
  cancelled: boolean;
  alt: string;
};

export function posterContent(show: Show): PosterContent {
  const zone = show.venue.timeZone;
  const town = [show.venue.city, show.venue.region].filter(Boolean).join(', ');
  const date = longDate(show.start, zone);
  const time = clockTime(show.start, zone);
  const act = actLabel(show.act, show.billing);
  const free = Boolean(show.tickets?.free);
  const cancelled = show.status === 'cancelled';
  // "Johnny Rhoades Trio at…", or on a guest spot "Johnny Rhoades, with Motor City Josh & The Big 3, at…".
  const billed = show.act === 'guest' && act ? `${ARTIST}, ${act.charAt(0).toLowerCase()}${act.slice(1)},` : show.billing;
  const tags = [show.act === 'guest' ? '' : act, free ? 'Free' : ''].filter(Boolean);
  return {
    act,
    venue: show.venue.name,
    town,
    date,
    time,
    free,
    cancelled,
    alt: `Poster: ${cancelled ? 'cancelled, ' : ''}${billed} at ${show.venue.name}, ${show.venue.city}, ${date}, ${time}.${tags.length ? ` ${tags.join('. ')}.` : ''}`,
  };
}
