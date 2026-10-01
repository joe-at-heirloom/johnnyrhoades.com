/*
  Loads the Bandsintown widget when the shows list gets close to the viewport.
  Temporary: Phase 2 replaces the widget with shows rendered at build time.
*/
import { $ } from './dom';

const WIDGET_SRC = 'https://widgetv3.bandsintown.com/main.min.js';
const shows = $('[data-shows]');

if (shows) {
  let loaded = false;

  const loadWidget = () => {
    if (loaded) return;
    loaded = true;
    const s = document.createElement('script');
    s.src = WIDGET_SRC;
    s.async = true;
    document.body.appendChild(s);

    // Hide the "Loading…" line once the widget has drawn something.
    const mo = new MutationObserver(() => {
      if ($('.bit-widget, .bit-widget-container', shows)) {
        shows.classList.add('is-loaded');
        mo.disconnect();
      }
    });
    mo.observe(shows, { childList: true, subtree: true });

    // If it never renders (ad blocker, offline), point people to Bandsintown instead.
    window.setTimeout(() => {
      if (shows.classList.contains('is-loaded')) return;
      const first = $('[data-shows-fallback]', shows)?.firstChild;
      if (first) first.textContent = 'Couldn’t load shows here. ';
    }, 10000);
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadWidget();
          io.disconnect();
        }
      },
      { rootMargin: '900px 0px' },
    );
    io.observe(shows);
  } else {
    loadWidget();
  }
}
