/*
  "Am I free that night?" for the booking form (ADR 0016). The form knows
  Johnny's public calendar, so picking a date says straight away whether he's
  already playing somewhere. Only public shows count, and an empty date is
  never promised as free: only "nothing listed".
*/

export type BookedDay = { day: string; venue: string; city: string };
export type Availability = { kind: 'past' | 'booked' | 'open'; text: string };

/** "The Fed Community in Clarkston", or two of them joined with "and". */
const gigs = (list: BookedDay[]) => list.map((b) => `${b.venue} in ${b.city}`).join(' and ');

/** What to say about a date (YYYY-MM-DD) picked in the booking form, given today in Detroit. */
export function availability(day: string, booked: BookedDay[], today: string): Availability | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (day < today) return { kind: 'past', text: 'That date has already gone by.' };
  const that = booked.filter((b) => b.day === day);
  if (that.length) {
    return { kind: 'booked', text: `I’m already playing ${gigs(that)} that day. Pick another date, or send it anyway and we’ll talk.` };
  }
  return { kind: 'open', text: 'I don’t have anything listed that day.' };
}
