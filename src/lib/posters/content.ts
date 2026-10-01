/*
  What a poster says. Every fact here is also real text on the show page
  (PLAN.md section 4.1), and the alt text spells all of it out.
*/
import { actLabel } from '../act.ts';
import type { Show } from '../shows-schema.ts';
import { clockTime, longDate } from '../time.ts';

export type PosterContent = {
  billing: string;
  venue: string;
  date: string;
  timeAndTown: string;
  tags: string[];
  cancelled: boolean;
  alt: string;
};

export function posterContent(show: Show): PosterContent {
  const zone = show.venue.timeZone;
  const town = [show.venue.city, show.venue.region].filter(Boolean).join(', ');
  const time = clockTime(show.start, zone);
  const act = actLabel(show.act, show.billing);
  const cancelled = show.status === 'cancelled';
  // A guest spot's billing already names the band, so its act tag would just repeat it.
  const tags = [show.act === 'guest' ? '' : act, show.tickets?.free ? 'Free' : ''].filter(Boolean);
  return {
    billing: show.billing,
    venue: show.venue.name,
    date: longDate(show.start, zone),
    timeAndTown: `${time} · ${town}`,
    tags,
    cancelled,
    alt: `Poster: ${cancelled ? 'cancelled, ' : ''}${show.billing} at ${show.venue.name}, ${show.venue.city}, ${longDate(show.start, zone)}, ${time}.${tags.length ? ` ${tags.join('. ')}.` : ''}`,
  };
}
