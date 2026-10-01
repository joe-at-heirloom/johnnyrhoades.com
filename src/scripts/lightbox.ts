/* Photo lightbox on a native <dialog>: arrows, swipe, Escape, and focus goes back to the photo. */
import { $, $$ } from './dom';

const gallery = $('[data-gallery]');
const lb = $<HTMLDialogElement>('[data-lightbox]');

if (gallery && lb && typeof lb.showModal === 'function') {
  const buttons = $$<HTMLButtonElement>('button', gallery);
  // Created here rather than in the markup: an <img> has to have a real src.
  const img = document.createElement('img');
  img.dataset.lbImg = '';
  $('[data-lb-figure]', lb)?.append(img);
  let index = 0;

  const show = (i: number) => {
    index = (i + buttons.length) % buttons.length;
    const btn = buttons[index];
    const thumb = btn ? $<HTMLImageElement>('img', btn) : null;
    if (!btn || !thumb) return;
    img.src = btn.dataset.full ?? thumb.src;
    img.alt = thumb.alt;
  };

  buttons.forEach((btn, i) =>
    btn.addEventListener('click', () => {
      show(i);
      lb.showModal();
    }),
  );
  $('[data-lb-prev]', lb)?.addEventListener('click', () => show(index - 1));
  $('[data-lb-next]', lb)?.addEventListener('click', () => show(index + 1));
  $('[data-lb-close]', lb)?.addEventListener('click', () => lb.close());
  lb.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t === lb || t.classList.contains('lb-figure')) lb.close();
  });
  lb.addEventListener('close', () => buttons[index]?.focus());
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  // Swipe on touch screens.
  let startX: number | null = null;
  lb.addEventListener('touchstart', (e) => { startX = e.touches[0]?.clientX ?? null; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0]?.clientX;
    if (startX === null || endX === undefined) return;
    const dx = endX - startX;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    startX = null;
  });
}
