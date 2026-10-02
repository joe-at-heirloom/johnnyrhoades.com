/* The booking form's date check (src/lib/availability.ts): says whether Johnny is already playing that day. */
import { availability, type BookedDay } from '../lib/availability';

const input = document.querySelector<HTMLInputElement>('#b-date');
const note = document.querySelector<HTMLElement>('[data-date-note]');

if (input && note) {
  let booked: BookedDay[] = [];
  try {
    booked = JSON.parse(document.getElementById('booked-days')?.textContent ?? '[]') as BookedDay[];
  } catch {
    booked = [];
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
  input.min = today;

  const update = () => {
    const result = availability(input.value, booked, today);
    note.textContent = result?.text ?? '';
    note.dataset.kind = result?.kind ?? '';
  };
  input.addEventListener('change', update);
  input.addEventListener('input', update);
  input.form?.addEventListener('reset', () => setTimeout(update));
}
