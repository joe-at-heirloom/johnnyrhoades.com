/*
  Google Analytics 4 (ADR 0023), set up from data attributes on <html>
  (src/layouts/BaseLayout.astro). It runs only:
  - on the real domain (data-ga-hosts), so staging, previews and tests don't count;
  - for visitors who haven't asked not to be tracked (Global Privacy Control or Do Not Track);
  - after the page has loaded and the browser is idle, so gtag.js stays off the
    critical path and out of the first paint (CLAUDE.md, non-negotiable 7).
  Events queue in dataLayer from the start and send once gtag.js arrives.

  Clicks: any element with data-event="name" sends that event, with its
  data-event-* attributes as parameters (data-event-from="epk" → { from: "epk" }).
*/
import { track } from './track';

type Gtag = (...args: unknown[]) => void;
const w = window as unknown as { dataLayer?: unknown[]; gtag?: Gtag };
const { gaId, gaHosts = '' } = document.documentElement.dataset;
const hosts = gaHosts.split(',').map((h) => h.trim()).filter(Boolean);
const optedOut = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || navigator.doNotTrack === '1';

if (gaId && hosts.includes(location.hostname) && !optedOut && !w.gtag) {
  const dataLayer = (w.dataLayer = w.dataLayer ?? []);
  // gtag.js reads the arguments object itself, so this has to be a plain function.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  w.gtag('js', new Date());
  w.gtag('config', gaId);
  const load = () => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.append(script);
  };
  const whenIdle = () => ('requestIdleCallback' in window ? requestIdleCallback(load, { timeout: 3000 }) : setTimeout(load, 1500));
  if (document.readyState === 'complete') whenIdle();
  else addEventListener('load', whenIdle, { once: true });
}

document.addEventListener('click', (e) => {
  const el = (e.target as Element | null)?.closest<HTMLElement>('[data-event]');
  if (!el?.dataset.event) return;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(el.dataset)) {
    if (key.startsWith('event') && key !== 'event' && value) params[key.charAt(5).toLowerCase() + key.slice(6)] = value;
  }
  track(el.dataset.event, params);
});
