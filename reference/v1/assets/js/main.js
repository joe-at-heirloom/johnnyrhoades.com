(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header: solid background once you scroll ---------- */
  const header = $('[data-header]');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobile nav ---------- */
  const toggle = $('[data-nav-toggle]');
  const nav = $('[data-nav]');
  const setNav = (open) => {
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle.addEventListener('click', () => setNav(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && header.classList.contains('nav-open')) setNav(false); });

  /* ---------- Highlight the nav link for the section in view ---------- */
  const navLinks = $$('.site-nav a');
  const sections = navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => {
          if (a.getAttribute('href') === '#' + entry.target.id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  /* ---------- Reveal on scroll ---------- */
  const revealTargets = $$('.section-head, .album-art, .album-info, .video-stage, .about-photo, .about-copy, .gallery li, .book-copy, .card, .list-inner');
  if ('IntersectionObserver' in window && !reduceMotion) {
    revealTargets.forEach((el) => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    $$('.album-art').forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Shows: load the Bandsintown widget ---------- */
  const shows = $('[data-shows]');
  if (shows) {
    let loaded = false;
    const loadWidget = () => {
      if (loaded) return;
      loaded = true;
      const s = document.createElement('script');
      s.src = 'https://widgetv3.bandsintown.com/main.min.js';
      s.async = true;
      s.charset = 'utf-8';
      document.body.appendChild(s);

      // Hide the "Loading…" line once the widget has drawn something.
      const mo = new MutationObserver(() => {
        if ($('.bit-widget, .bit-widget-container', shows)) {
          shows.classList.add('is-loaded');
          mo.disconnect();
        }
      });
      mo.observe(shows, { childList: true, subtree: true });

      // If it never renders (blocked by an ad blocker, offline), point people to Bandsintown instead.
      setTimeout(() => {
        if (shows.classList.contains('is-loaded')) return;
        const fb = $('[data-shows-fallback]', shows);
        if (fb) fb.firstChild.textContent = 'Couldn’t load shows here. ';
      }, 10000);
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { loadWidget(); io.disconnect(); }
      }, { rootMargin: '900px 0px' });
      io.observe(shows);
    } else {
      loadWidget();
    }
  }

  /* ---------- Video: lightweight YouTube facade ---------- */
  const frame = $('[data-video-frame]');
  const items = $$('.video-item');
  if (frame) {
    let currentId = items[0]?.dataset.video;
    let currentTitle = items[0]?.dataset.title || '';

    const embed = (id, title) => {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
      iframe.title = title;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      frame.replaceChildren(iframe);
    };

    frame.addEventListener('click', (e) => {
      if (e.target.closest('[data-video-play]')) embed(currentId, currentTitle);
    });

    items.forEach((item) => {
      item.addEventListener('click', () => {
        currentId = item.dataset.video;
        currentTitle = item.dataset.title;
        items.forEach((i) => { i.classList.toggle('is-active', i === item); i.removeAttribute('aria-current'); });
        item.setAttribute('aria-current', 'true');
        embed(currentId, currentTitle);
        if (window.matchMedia('(max-width: 900px)').matches) {
          frame.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        }
      });
    });
  }

  /* ---------- Photo lightbox ---------- */
  const gallery = $('[data-gallery]');
  const lb = $('[data-lightbox]');
  if (gallery && lb && typeof lb.showModal === 'function') {
    const buttons = $$('button', gallery);
    const img = $('[data-lb-img]', lb);
    let index = 0;

    const show = (i) => {
      index = (i + buttons.length) % buttons.length;
      const btn = buttons[index];
      const thumb = $('img', btn);
      img.src = btn.dataset.full;
      img.alt = thumb.alt;
    };

    buttons.forEach((btn, i) => btn.addEventListener('click', () => { show(i); lb.showModal(); }));
    $('[data-lb-prev]', lb).addEventListener('click', () => show(index - 1));
    $('[data-lb-next]', lb).addEventListener('click', () => show(index + 1));
    $('[data-lb-close]', lb).addEventListener('click', () => lb.close());
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb-figure')) lb.close(); });
    lb.addEventListener('close', () => buttons[index]?.focus());
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });

    // swipe on touch screens
    let startX = null;
    lb.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      startX = null;
    });
  }

  /* ---------- Forms: submit to Netlify without leaving the page ---------- */
  $$('[data-ajax-form]').forEach((form) => {
    const status = $('[data-form-status]', form);
    const button = $('button[type="submit"]', form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      status.className = 'form-status';
      status.textContent = 'Sending…';
      button.disabled = true;

      try {
        const res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)).toString(),
        });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        status.classList.add('is-ok');
        status.textContent = form.name === 'mailing-list'
          ? 'Thanks, you’re on the list.'
          : 'Thanks, got it. I’ll get back to you soon.';
      } catch {
        status.classList.add('is-error');
        status.textContent = 'That didn’t go through. Try again, or message me on Facebook.';
      } finally {
        button.disabled = false;
      }
    });
  });

  /* ---------- Footer year ---------- */
  const year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
