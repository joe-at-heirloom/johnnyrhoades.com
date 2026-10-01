/*
  Submits the booking and mailing-list forms without leaving the page.
  Still posts to Netlify Forms as in v1; Phase 5 moves delivery to src/lib/forms.ts.
*/
import { $, $$ } from './dom';

const MESSAGES = {
  'mailing-list': 'Thanks, you’re on the list.',
  booking: 'Thanks, got it. I’ll get back to you soon.',
  error: 'That didn’t go through. Try again, or message me on Facebook.',
} as const;

for (const form of $$<HTMLFormElement>('[data-ajax-form]')) {
  const status = $('[data-form-status]', form);
  const button = $<HTMLButtonElement>('button[type="submit"]', form);
  if (!status || !button) continue;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    status.className = 'form-status';
    status.textContent = 'Sending…';
    button.disabled = true;

    try {
      const data = new URLSearchParams();
      new FormData(form).forEach((value, key) => data.append(key, String(value)));
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: data.toString(),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      status.classList.add('is-ok');
      status.textContent = form.name === 'mailing-list' ? MESSAGES['mailing-list'] : MESSAGES.booking;
    } catch {
      status.classList.add('is-error');
      status.textContent = MESSAGES.error;
    } finally {
      button.disabled = false;
    }
  });
}
