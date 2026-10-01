/* Click-to-load YouTube player: nothing from YouTube loads until someone presses play. */
import { $, $$, prefersReducedMotion } from './dom';

const frame = $('[data-video-frame]');
const items = $$<HTMLButtonElement>('[data-video]');

if (frame) {
  let currentId = items[0]?.dataset.video ?? frame.dataset.videoId ?? '';
  let currentTitle = items[0]?.dataset.title ?? frame.dataset.videoTitle ?? '';

  const embed = (id: string, title: string) => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
    iframe.title = title;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
  };

  frame.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-video-play]')) embed(currentId, currentTitle);
  });

  for (const item of items) {
    item.addEventListener('click', () => {
      currentId = item.dataset.video ?? '';
      currentTitle = item.dataset.title ?? '';
      for (const i of items) {
        i.classList.toggle('is-active', i === item);
        i.removeAttribute('aria-current');
      }
      item.setAttribute('aria-current', 'true');
      embed(currentId, currentTitle);
      if (window.matchMedia('(max-width: 900px)').matches) {
        frame.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      }
    });
  }
}
