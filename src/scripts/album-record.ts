/* Slides the record half out of its sleeve the first time the album scrolls into view. */
import { $$, prefersReducedMotion } from './dom';

const arts = $$('[data-album-art]');

if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
  arts.forEach((el) => el.classList.add('is-visible'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  arts.forEach((el) => io.observe(el));
}
