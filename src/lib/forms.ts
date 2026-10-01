/*
  Form delivery (PLAN.md section 11). GitHub Pages has no server, so forms
  post to hosted services:
  - Booking requests: Web3Forms, which emails them to Johnny.
  - Mailing list: Buttondown, with a region tag from the ZIP code.

  Everything provider-specific lives here, behind two small functions, so a
  Cloudflare Worker can replace either service later without touching the
  markup. The IDs are public by design (they only allow sending to Johnny),
  and come from PUBLIC_* build variables (.env.example).
*/
import { regionForZip } from './regions.ts';

export type FormsConfig = {
  web3formsKey?: string;
  buttondownUser?: string;
  siteUrl: string;
};

export const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
export const buttondownEndpoint = (user: string) => `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(user)}`;

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

/** The JSON body Web3Forms expects. Field names become labels in Johnny's email. */
export function bookingPayload(b: BookingRequest, config: FormsConfig): Record<string, string> {
  return {
    access_key: config.web3formsKey ?? '',
    subject: bookingSubject(b),
    from_name: 'johnnyrhoades.com',
    replyto: b.email,
    Name: b.name,
    Email: b.email,
    Phone: b.phone || '-',
    Date: b.date || '-',
    'Venue and town': b.venue || '-',
    'Event type': b.eventType || '-',
    Act: b.act || '-',
    Budget: b.budget || '-',
    Details: b.message || '-',
  };
}

/** Form fields for Buttondown's embed subscribe endpoint. */
export function signupPayload({ email, zip }: { email: string; zip?: string }): URLSearchParams {
  const body = new URLSearchParams({ email });
  const region = zip ? regionForZip(zip) : null;
  if (region) body.append('tag', region);
  if (zip?.trim()) body.append('metadata__zip', zip.trim());
  return body;
}

export async function sendBooking(b: BookingRequest, config: FormsConfig): Promise<void> {
  if (!config.web3formsKey) throw new Error('The booking form is not connected yet.');
  const res = await fetch(WEB3FORMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(bookingPayload(b, config)),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
  if (!res.ok || data.success === false) throw new Error(data.message || `HTTP ${res.status}`);
}

export async function sendSignup(fields: { email: string; zip?: string }, config: FormsConfig): Promise<void> {
  if (!config.buttondownUser) throw new Error('The mailing list is not connected yet.');
  // Buttondown's embed endpoint doesn't send CORS headers; no-cors posts still deliver,
  // we just can't read the response, so success means "sent without a network error".
  await fetch(buttondownEndpoint(config.buttondownUser), { method: 'POST', mode: 'no-cors', body: signupPayload(fields) });
}
