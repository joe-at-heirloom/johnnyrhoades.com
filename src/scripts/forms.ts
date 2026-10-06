/*
  Booking and mailing-list forms. With JavaScript they submit in place and say
  what happened; without it they post straight to Formspree, which shows its
  own thank-you page. Delivery details live in src/lib/forms.ts.
*/
import { BOOKING_EMAIL, sendBooking, sendSignup, type BookingRequest, type FormsConfig } from '../lib/forms';
import { $, $$ } from './dom';
import { track } from './track';

const MESSAGES = {
  booking: 'Thanks, got it. I’ll get back to you soon.',
  signup: 'Thanks, you’re on the list.',
};

const value = (form: HTMLFormElement, name: string) => {
  const el = form.elements.namedItem(name);
  return el && 'value' in el ? String(el.value).trim() : '';
};

/** An error message that ends by offering the email, as a link. */
function sayWithEmail(status: HTMLElement, before: string, after: string) {
  const link = document.createElement('a');
  link.href = `mailto:${BOOKING_EMAIL}`;
  link.textContent = BOOKING_EMAIL;
  status.replaceChildren(before, link, after);
}

function configFor(form: HTMLFormElement): FormsConfig {
  return {
    bookingForm: form.dataset.bookingForm || undefined,
    signupForm: form.dataset.signupForm || undefined,
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
    // Honeypot: people never see this field; bots fill everything in. Formspree drops these too.
    if (value(form, '_gotcha')) return;

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
        track('booking_submit', { event_type: request.eventType || 'unknown' });
      } else {
        await sendSignup({ email: value(form, 'email'), zip: value(form, 'zip') }, config);
        track('list_signup');
      }
      form.reset();
      status.classList.add('is-ok');
      status.textContent = MESSAGES[kind];
    } catch (err) {
      if (kind === 'booking') track('booking_error');
      const notConnected = err instanceof Error && /not connected/.test(err.message);
      status.classList.add('is-error');
      if (notConnected) sayWithEmail(status, `${(err as Error).message} Email me at `, ' for now.');
      else sayWithEmail(status, 'That didn’t go through. Try again, or email me at ', '.');
    } finally {
      button.disabled = false;
    }
  });
}
