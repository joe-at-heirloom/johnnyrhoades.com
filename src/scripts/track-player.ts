/*
  Drop the needle (ADR 0016): play a 30-second clip from the tracklist. One
  audio element, made on the first press, so nothing loads until someone
  asks. While a clip plays, the tonearm sits on the record and a thin bar
  fills under the song.
*/
import { $, $$ } from './dom';
import { track } from './track';

const list = $('[data-tracklist]');
const art = $('[data-album-art]');
const status = $('[data-album-status]');
const buttons = list ? $$<HTMLButtonElement>('[data-preview]', list) : [];

if (list && buttons.length) {
  const hint = status?.textContent ?? '';
  let audio: HTMLAudioElement | null = null;
  let current: HTMLButtonElement | null = null;

  const progress = (btn: HTMLButtonElement, p: number) =>
    btn.closest('li')?.style.setProperty('--p', String(Math.min(1, Math.max(0, p))));

  const show = (btn: HTMLButtonElement, playing: boolean) => {
    btn.setAttribute('aria-pressed', String(playing));
    btn.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} a clip of ${btn.dataset.title}`);
    btn.closest('li')?.classList.toggle('is-playing', playing);
    art?.classList.toggle('is-playing', playing);
    if (playing) art?.classList.add('is-visible');
  };

  const stop = () => {
    if (!current) return;
    show(current, false);
    progress(current, 0);
  };

  const player = () => {
    if (audio) return audio;
    const a = new Audio();
    a.preload = 'none';
    a.addEventListener('timeupdate', () => current && a.duration && progress(current, a.currentTime / a.duration));
    a.addEventListener('ended', () => {
      stop();
      current = null;
    });
    a.addEventListener('error', () => {
      if (!current) return;
      stop();
      if (status) status.textContent = `Couldn’t load that clip. ${current.dataset.title} is on Apple Music.`;
      current = null;
    });
    audio = a;
    return a;
  };

  list.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-preview]');
    if (!btn) return;
    const a = player();
    if (btn === current && !a.paused) {
      a.pause();
      show(btn, false);
      return;
    }
    if (btn !== current) {
      stop();
      current = btn;
      a.src = btn.dataset.preview ?? '';
      track('track_preview', { track: btn.dataset.title ?? '' });
    }
    if (status) status.textContent = hint;
    show(btn, true);
    a.play().catch(() => {
      // Autoplay refused or the clip failed; the error handler explains the second case.
      if (btn === current && a.paused) show(btn, false);
    });
  });
}
