import { $, $$ } from './dom';

const header = $('[data-header]');
const toggle = $<HTMLButtonElement>('[data-nav-toggle]');
const nav = $('[data-nav]');

if (header && toggle && nav) {
  // Solid background once you scroll.
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile nav.
  const setNav = (open: boolean) => {
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle.addEventListener('click', () => setNav(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) setNav(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('nav-open')) setNav(false);
  });

  // Highlight the nav link for the section in view.
  const links = $$<HTMLAnchorElement>('a', nav);
  const sections = links
    .map((a) => {
      const id = a.hash.slice(1);
      return id ? document.getElementById(id) : null;
    })
    .filter((el): el is HTMLElement => el !== null);

  if ('IntersectionObserver' in window && sections.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const a of links) {
            if (a.hash === `#${entry.target.id}`) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
          }
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((s) => spy.observe(s));
  }
}
