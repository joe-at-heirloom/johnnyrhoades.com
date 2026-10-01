/*
  Booking and mailing-list forms. With JavaScript they submit in place and say
  what happened; without it they post straight to the service (the booking
  form then lands on /thanks/). Delivery details live in src/lib/forms.ts.
*/
import { sendBooking, sendSignup, type BookingRequest, type FormsConfig } from '../lib/forms';
import { $, $$ } from './dom';
import { track } from './track';

const FALLBACK = 'or message me on Facebook';
const MESSAGES = {
  booking: 'Thanks, got it. I’ll get back to you soon.',
  signup: 'Thanks, you’re on the list.',
};

const value = (form: HTMLFormElement, name: string) => {
  const el = form.elements.namedItem(name);
  return el && 'value' in el ? String(el.value).trim() : '';
};

function configFor(form: HTMLFormElement): FormsConfig {
  return {
    web3formsKey: form.dataset.web3formsKey || undefined,
    buttondownUser: form.dataset.buttondownUser || undefined,
    siteUrl: location.origin,
  };
}

for (const form of $$<HTMLFormElement>('[data-form]')) {
  const kind = form.dataset.form as 'booking' | 'signup';
  const status = $('[data-form-status]', form);
  const button = $<HTMLButtonElement>('button[type="submit"]', form);
  if (!status || !button) continue;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    // Honeypot: people never see this box; bots fill everything in.
    if ((form.elements.namedItem('botcheck') as HTMLInputElement | null)?.checked) return;

    status.className = 'form-status';
    status.textContent = 'Sending…';
    button.disabled = true;
    const config = configFor(form);

    try {
      if (kind === 'booking') {
        const request: BookingRequest = {
          name: value(form, 'name'),
          email: value(form, 'email'),
          phone: value(form, 'phone'),
          date: value(form, 'date'),
          venue: value(form, 'venue'),
          eventType: value(form, 'event_type'),
          act: value(form, 'act'),
          budget: value(form, 'budget'),
          message: value(form, 'message'),
        };
        await sendBooking(request, config);
        track('booking_submit', { eventType: request.eventType || 'unknown' });
      } else {
        await sendSignup({ email: value(form, 'email'), zip: value(form, 'metadata__zip') }, config);
        track('list_signup');
      }
      form.reset();
      status.classList.add('is-ok');
      status.textContent = MESSAGES[kind];
    } catch (err) {
      if (kind === 'booking') track('booking_error');
      const notConnected = err instanceof Error && /not connected/.test(err.message);
      status.classList.add('is-error');
      status.textContent = notConnected ? `${(err as Error).message} Message me on Facebook for now.` : `That didn’t go through. Try again, ${FALLBACK}.`;
    } finally {
      button.disabled = false;
    }
  });
}
