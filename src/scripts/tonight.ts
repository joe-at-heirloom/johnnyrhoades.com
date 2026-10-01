/*
  Tonight (PLAN.md section 4.2). Pages are built a few times a day; this keeps
  them right in between, using the visitor's clock and Detroit's calendar date.

  - Hides shows in upcoming lists that have ended since the last build.
  - Fills the Tonight bar when a show is on today and hasn't ended.
  - Keeps the hero's "Next show" current, and says "Tonight" on the day.
  - On a show page whose show has ended, shows "This show has happened. Next up: …"

  The times here are full ISO strings with UTC offsets, written at build time,
  so Date.parse reads them exactly. (Bandsintown's offset-less times never
  reach the browser.)
*/
type NextShow = {
  url: string;
  day: string;
  end: string;
  venue: string;
  town: string;
  date: string;
  time: string;
  directions: string;
  rsvp: string;
};

const now = Date.now();
const ended = (iso: string | undefined) => !!iso && Date.parse(iso) <= now;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

let next: NextShow[] = [];
try {
  next = JSON.parse(document.getElementById('next-shows')?.textContent ?? '[]') as NextShow[];
} catch {
  next = [];
}
const upcoming = next.filter((s) => !ended(s.end));

// 1. Drop shows that have ended from upcoming lists.
for (const list of document.querySelectorAll<HTMLElement>('[data-upcoming]')) {
  const rows = [...list.querySelectorAll<HTMLElement>('[data-show-end]')];
  for (const row of rows) if (ended(row.dataset.showEnd)) row.hidden = true;
  const empty = list.querySelector<HTMLElement>('[data-show-empty]');
  if (empty && rows.length > 0 && rows.every((r) => r.hidden)) empty.hidden = false;
}

const set = (root: ParentNode, sel: string, text: string) => {
  const el = root.querySelector(sel);
  if (el) el.textContent = text;
};
const link = (root: ParentNode, sel: string, href: string) => {
  const el = root.querySelector<HTMLAnchorElement>(sel);
  if (el) el.href = href;
};

// 2. The Tonight bar.
const bar = document.querySelector<HTMLElement>('[data-tonight]');
const tonight = upcoming.find((s) => s.day === today);
if (bar && tonight) {
  set(bar, '[data-tonight-venue]', tonight.venue);
  set(bar, '[data-tonight-town]', tonight.town);
  set(bar, '[data-tonight-time]', tonight.time);
  link(bar, '[data-tonight-link]', tonight.url);
  link(bar, '[data-tonight-directions]', tonight.directions);
  link(bar, '[data-tonight-rsvp]', tonight.rsvp);
  bar.hidden = false;
}

// 3. The hero's "Next show": move on once it has ended, and say "Tonight" on the day.
const heroNext = document.querySelector<HTMLAnchorElement>('[data-hero-next]');
if (heroNext && ended(heroNext.dataset.showEnd)) {
  const first = upcoming[0];
  if (first) {
    heroNext.href = first.url;
    heroNext.dataset.day = first.day;
    set(heroNext, '[data-hero-next-venue]', first.venue);
    set(heroNext, '[data-hero-next-when]', `${first.date} · ${first.time} · ${first.town}`);
  } else {
    heroNext.hidden = true;
  }
}
if (heroNext && heroNext.dataset.day === today) set(heroNext, '[data-hero-next-label]', 'Tonight');

// 4. A show page for a show that has ended.
const page = document.querySelector<HTMLElement>('[data-show-page]');
const banner = document.querySelector<HTMLElement>('[data-past-banner]');
if (page && banner?.hidden && ended(page.dataset.showEnd)) {
  const following = upcoming.find((s) => s.url !== location.pathname);
  if (following) {
    link(banner, '[data-past-next]', following.url);
    set(banner, '[data-past-next]', `${following.date} at ${following.venue}, ${following.town}`);
  } else {
    banner.querySelector('[data-past-next-wrap]')?.remove();
  }
  banner.hidden = false;
}
