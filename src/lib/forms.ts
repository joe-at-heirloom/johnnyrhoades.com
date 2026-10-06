/*
  Form delivery (PLAN.md section 11, ADR 0023). GitHub Pages has no server,
  so both forms post to Formspree, which emails each submission to Johnny:
  - Booking requests, with a subject line he can triage from his phone.
  - Mailing list signups, with the region their ZIP code falls in.

  Everything provider-specific lives here, behind two small functions, so
  another service (or a Cloudflare Worker) can replace Formspree later
  without touching the markup. The form IDs are public by design: they only
  let the site send to Johnny.
*/
import { regionForZip } from './regions.ts';

/**
 * Johnny's work email, a Zoho Mail inbox (ADR 0021): the fallback when a form
 * fails, and the contact line on the press kit and in llms.txt. It lives here
 * rather than in site.ts so the form script can import it without luxon.
 */
export const BOOKING_EMAIL = 'hello@johnnyrhoades.com';

export type FormsConfig = {
  /** Formspree form IDs, the part after /f/ in the endpoint. */
  bookingForm?: string;
  signupForm?: string;
};

export const formspreeEndpoint = (form: string) => `https://formspree.io/f/${encodeURIComponent(form)}`;

export type BookingRequest = {
  name: string;
  email: string;
  phone?: string;
  date?: string;
  venue?: string;
  eventType?: string;
  act?: string;
  budget?: string;
  message?: string;
};

/** "Booking: Sat, Oct 24, Blue Goose Inn, St. Clair Shores, Bar / club", so Johnny can triage from his phone. */
export function bookingSubject(b: BookingRequest): string {
  let date = 'date open';
  if (b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
    // A calendar date with no time zone; format it as written, in UTC, so it can't shift a day.
    date = new Date(`${b.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  return `Booking: ${[date, b.venue?.trim() || 'place not given', b.eventType?.trim() || 'event type not given'].join(', ')}`;
}

/**
 * The JSON body for Formspree. `_subject` sets the email's subject, and the
 * `email` field becomes its Reply-To. Other keys become labels in the email.
 */
export function bookingPayload(b: BookingRequest): Record<string, string> {
  return {
    _subject: bookingSubject(b),
    Name: b.name,
    email: b.email,
    Phone: b.phone || '-',
    Date: b.date || '-',
    'Venue and town': b.venue || '-',
    'Event type': b.eventType || '-',
    Act: b.act || '-',
    Budget: b.budget || '-',
    Details: b.message || '-',
  };
}

/** A signup, with the region its ZIP code falls in, so show announcements can go to people nearby. */
export function signupPayload({ email, zip }: { email: string; zip?: string }): Record<string, string> {
  const region = zip ? regionForZip(zip) : null;
  return {
    _subject: `Mailing list signup${region ? `: ${region}` : ''}`,
    email,
    ZIP: zip?.trim() || '-',
    Region: region ?? '-',
  };
}

async function post(form: string, body: Record<string, string>): Promise<void> {
  const res = await fetch(formspreeEndpoint(form), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; errors?: { message?: string }[] };
  if (!res.ok || data.ok === false) throw new Error(data.errors?.[0]?.message || `HTTP ${res.status}`);
}

export async function sendBooking(b: BookingRequest, config: FormsConfig): Promise<void> {
  if (!config.bookingForm) throw new Error('The booking form is not connected yet.');
  await post(config.bookingForm, bookingPayload(b));
}

export async function sendSignup(fields: { email: string; zip?: string }, config: FormsConfig): Promise<void> {
  if (!config.signupForm) throw new Error('The mailing list is not connected yet.');
  await post(config.signupForm, signupPayload(fields));
}
