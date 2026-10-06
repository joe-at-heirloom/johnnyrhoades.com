/*
  The poster template (ADR 0017): a show card, after the letterpress cards
  blues acts toured on in the '50s and '60s. Bone card stock, black and red
  ink, and Johnny's name as big as the card allows, on every show, guest
  spots included.

    ★ IN PERSON ★                  (red band, bone type)
    JOHNNY                         (each line fills the width; the cut is
    RHOADES                         picked per line, like wood type from a case)
    TRIO                           (act, red; only when it's known)
    ═════════════════════════════
    BLUE GOOSE INN                 (venue, fit-to-width, black)
    ST. CLAIR SHORES, MI
    ┌───────────────────────────┐
    │ FRIDAY, OCTOBER 23        │  (red panel, bone type)
    │ 9 PM · FREE               │
    └───────────────────────────┘
    JOHNNYRHOADES.COM

  Wide formats (og, 16:9) put the venue and the date panel side by side
  under a one-line name. The site's palette and Archivo; no new colors or
  typefaces.

  Built as plain element objects for satori (no JSX toolchain needed).
  Every size is computed here, so tests can check that nothing overflows.
*/
import { ARTIST } from '../site.ts';
import type { PosterContent } from './content.ts';
import { fitText, lineWidth, type Fit, type Measure } from './fit.ts';
import type { PosterFormat } from './formats.ts';

export const TEMPLATE_VERSION = 6; // bump when the layout changes, to invalidate cached renders

export type Element = { type: string; props: Record<string, unknown> };

const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Element => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});

/** Ink on bone stock. Contrast is checked in tests/unit/posters.test.ts. */
export const CARD_COLORS = {
  paper: '#efe6d3', // bone
  ink: '#0d0b0a',
  red: '#c02e28', // bone on red is 4.6:1, and so is red on bone
  ink2: '#3a332c', // --ink-on-bone-2
  muted: '#5f574b', // --ink-on-bone-3, for a cancelled show
} as const;

/** Wood type: one line set to fill `width`, in whichever cut lands closest under `maxSize`. */
export type Line = { text: string; font: string; size: number; width: number };

export function fillLine(text: string, width: number, fonts: string[], measure: Measure, maxSize: number): Line {
  let best: Line | null = null;
  for (const font of fonts) {
    const unit = measure(text, font);
    const fill = width / unit;
    // A line may come up to 4% short of the full width rather than drop to a wider, much smaller cut.
    if (fill > maxSize * 1.04) continue;
    const size = Math.min(fill, maxSize);
    if (!best || size > best.size) best = { text, font, size, width: unit * size };
  }
  // Even the widest cut overshoots (a very wide box): set it at maxSize, centered.
  if (!best) {
    const font = fonts[0]!;
    best = { text, font, size: maxSize, width: measure(text, font) * maxSize };
  }
  return best;
}

/** The name as one line or two, whichever sets it bigger in the space it has. */
export function nameLines(width: number, height: number, fonts: string[], measure: Measure, lineHeight: number, maxSize: number): Line[] {
  const words = ARTIST.toUpperCase().split(' ');
  const options = [[words.join(' ')], words].map((lines) =>
    lines.map((text) => fillLine(text, width, fonts, measure, Math.min(maxSize, height / (lines.length * lineHeight)))),
  );
  const smallest = (lines: Line[]) => Math.min(...lines.map((l) => l.size));
  return options.reduce((a, b) => (smallest(b) > smallest(a) * 1.02 ? b : a));
}

export type CardLayout = {
  wide: boolean;
  pad: { x: number; top: number; bottom: number };
  contentWidth: number;
  banner: { height: number; size: number; star: number };
  gap: number;
  name: Line[];
  nameLineHeight: number;
  act: Fit | null;
  rule: { thick: number; thin: number; space: number; margin: number };
  venue: Fit;
  town: number;
  panel: { width: number; padX: number; padY: number };
  date: Fit;
  time: number;
  url: number;
};

const NAME_LINE_HEIGHT = 0.86;

/** Every size on the card, for a format and its content. */
export function cardLayout(content: PosterContent, format: PosterFormat, measure: Measure, ladder: string[]): CardLayout {
  const { width: w, height: h } = format;
  const s = Math.min(w, h);
  const wide = w >= h * 1.5;
  // Stories lose their top and bottom to Instagram's own buttons; keep the type out of there.
  const padX = Math.round(s * 0.065);
  const pad = format.key === 'story' ? { x: padX, top: Math.round(h * 0.11), bottom: Math.round(h * 0.13) } : { x: padX, top: padX, bottom: padX };
  const contentWidth = w - padX * 2;
  const innerHeight = h - pad.top - pad.bottom;

  const banner = { height: Math.round(s * (wide ? 0.085 : 0.09)), size: Math.round(s * (wide ? 0.048 : 0.05)), star: Math.round(s * (wide ? 0.036 : 0.036)) };
  const gap = Math.round(s * 0.03);
  const rule = { thick: Math.max(4, Math.round(s * 0.008)), thin: Math.max(2, Math.round(s * 0.0025)), space: Math.max(3, Math.round(s * 0.006)), margin: Math.round(s * (wide ? 0.028 : 0.032)) };
  const ruleHeight = rule.thick + rule.space + rule.thin + rule.margin * 2;
  const town = Math.round(s * (wide ? 0.036 : 0.034));
  const time = Math.round(s * (wide ? 0.04 : 0.036));
  const url = Math.round(s * (wide ? 0.026 : 0.022));
  const urlHeight = url * 1.2 + s * 0.022;

  const act = content.act
    ? fitText({ text: content.act.toUpperCase(), box: { width: contentWidth, height: s * 0.07 }, fonts: ladder, measure, maxLines: 1, maxSize: s * (wide ? 0.05 : 0.055), lineHeight: 1 })
    : null;
  const actHeight = act ? act.size * 1.0 + s * 0.012 : 0;

  // The date panel: red, with the date as big as it fits and the time under it.
  const panelPadX = Math.round(s * 0.035);
  const panelPadY = Math.round(s * (wide ? 0.035 : 0.03));
  const panelWidth = wide ? Math.round(contentWidth * 0.42) : contentWidth;
  const date = fitText({
    text: content.date.toUpperCase().replace(',', wide ? '' : ','),
    box: { width: panelWidth - panelPadX * 2, height: s * (wide ? 0.2 : 0.1) },
    fonts: ladder,
    measure,
    maxLines: wide ? 2 : 1,
    maxSize: s * (wide ? 0.1 : 0.085),
    lineHeight: 0.92,
  });
  const panelHeight = panelPadY * 2 + date.height + time * 1.2 + time * 0.35;

  // Fixed blocks first; the name takes whatever height is left, the venue a set share of it.
  const venueShare = wide ? 0 : format.key === 'story' ? 0.15 : format.key === 'feed' ? 0.13 : 0.12;
  const venueBox = { width: contentWidth, height: h * venueShare };
  const townHeight = town * 1.2 + s * 0.012;
  const stackFixed = banner.height + gap + actHeight + ruleHeight + venueBox.height + townHeight + gap + panelHeight + urlHeight;
  const wideFixed = banner.height + gap + actHeight + ruleHeight + panelHeight;
  const nameBudget = innerHeight - (wide ? wideFixed + s * 0.06 : stackFixed);
  const name = nameLines(contentWidth, nameBudget, ladder, measure, NAME_LINE_HEIGHT, s * 0.34);
  const nameHeight = name.length * NAME_LINE_HEIGHT * Math.max(...name.map((l) => l.size));

  // Wide formats: the venue sits beside the date panel, in what's left of that row.
  const venue = wide
    ? fitText({
        text: content.venue.toUpperCase(),
        box: { width: contentWidth - panelWidth - s * 0.05, height: Math.max(panelHeight, innerHeight - (banner.height + gap + nameHeight + actHeight + ruleHeight)) - townHeight - urlHeight },
        fonts: ladder,
        measure,
        maxLines: 3,
        maxSize: s * 0.13,
      })
    : fitText({ text: content.venue.toUpperCase(), box: { width: venueBox.width * 0.98, height: venueBox.height }, fonts: ladder, measure, maxLines: format.key === 'story' ? 3 : 2, maxSize: s * 0.12 });

  return {
    wide,
    pad,
    contentWidth,
    banner,
    gap,
    name,
    nameLineHeight: NAME_LINE_HEIGHT,
    act,
    rule,
    venue,
    town,
    panel: { width: panelWidth, padX: panelPadX, padY: panelPadY },
    date,
    time,
    url,
  };
}

/**
 * True when every line of type stays inside its box (PLAN.md section 4.1's acceptance check).
 * Half a pixel of slack: a line sized to fill its box exactly can measure 1e-13 px over in floating point.
 */
export function cardFits(l: CardLayout, measure: Measure): boolean {
  const SLACK = 0.5;
  const name = l.name.every((line) => line.width <= l.contentWidth + SLACK);
  const venueWidth = l.wide ? l.contentWidth - l.panel.width : l.contentWidth;
  const venue = l.venue.lines.every((line) => lineWidth(line, l.venue.font, l.venue.size, measure, 0) <= venueWidth + SLACK);
  const date = l.date.lines.every((line) => lineWidth(line, l.date.font, l.date.size, measure, 0) <= l.panel.width - l.panel.padX * 2 + SLACK);
  return name && venue && date;
}

const star = (size: number, color: string): Element => ({
  type: 'img',
  props: {
    width: size,
    height: size,
    src: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="${color}" d="M50 3l13.8 31 33.7 3.6-25.2 22.7 7.1 33.2L50 76.6 20.6 93.5l7.1-33.2L2.5 37.6 36.2 34z"/></svg>`,
    )}`,
  },
});

/**
 * The card as satori elements. `paper: 'transparent'` leaves the stock to the page,
 * for the show page's inline flyer (bone on screen, white when printed).
 */
export function cardElement(content: PosterContent, format: PosterFormat, l: CardLayout, { paper = CARD_COLORS.paper as string } = {}): Element {
  const c = CARD_COLORS;
  const tracking = (em: number, size: number) => `${(em * size).toFixed(2)}px`;
  const dim = content.cancelled ? c.muted : c.ink;
  const line = (text: string, style: Record<string, unknown>) => h('div', { display: 'flex', justifyContent: 'center', whiteSpace: 'nowrap', ...style }, text);

  const banner = h(
    'div',
    { display: 'flex', alignItems: 'center', justifyContent: 'center', height: l.banner.height, background: c.red, gap: l.banner.size * 0.6 },
    ...(content.cancelled
      ? [line('CANCELLED', { fontFamily: 'display-1125', fontSize: l.banner.size * 1.1, letterSpacing: tracking(0.14, l.banner.size), color: c.paper, lineHeight: 1 })]
      : [
          star(l.banner.star, c.paper),
          line('IN PERSON', { fontFamily: 'display-1125', fontSize: l.banner.size, letterSpacing: tracking(0.18, l.banner.size), color: c.paper, lineHeight: 1 }),
          star(l.banner.star, c.paper),
        ]),
  );

  const nameSize = Math.max(...l.name.map((n) => n.size));
  const name = h(
    'div',
    { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: l.gap },
    ...l.name.map((n) => line(n.text, { fontFamily: n.font, fontSize: n.size, lineHeight: `${Math.round(nameSize * l.nameLineHeight)}px`, color: c.ink })),
  );

  const act = l.act
    ? [line(l.act.lines[0] ?? '', { fontFamily: l.act.font, fontSize: l.act.size, lineHeight: 1, color: content.cancelled ? c.muted : c.red, marginTop: Math.round(l.act.size * 0.25) })]
    : [];

  const rule = h(
    'div',
    { display: 'flex', flexDirection: 'column', marginTop: l.rule.margin, marginBottom: l.rule.margin },
    h('div', { display: 'flex', height: l.rule.thick, background: c.ink }),
    h('div', { display: 'flex', height: l.rule.thin, background: c.ink, marginTop: l.rule.space }),
  );

  const venue = h(
    'div',
    { display: 'flex', flexDirection: 'column', alignItems: l.wide ? 'flex-start' : 'center' },
    ...l.venue.lines.map((v) => h('div', { display: 'flex', whiteSpace: 'nowrap', fontFamily: l.venue.font, fontSize: l.venue.size, lineHeight: 0.88, color: dim }, v)),
    h(
      'div',
      { display: 'flex', fontFamily: 'label', fontSize: l.town, letterSpacing: tracking(0.18, l.town), color: dim, marginTop: Math.round(l.town * 0.45), lineHeight: 1.2 },
      content.town.toUpperCase(),
    ),
  );

  const panel = h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: l.panel.width,
      padding: `${l.panel.padY}px ${l.panel.padX}px`,
      background: content.cancelled ? c.muted : c.red,
      color: c.paper,
    },
    ...l.date.lines.map((d) => line(d, { fontFamily: l.date.font, fontSize: l.date.size, lineHeight: 0.92 })),
    line([content.time, content.free ? 'Free' : ''].filter(Boolean).join(' · ').toUpperCase(), {
      fontFamily: 'label',
      fontSize: l.time,
      letterSpacing: tracking(0.16, l.time),
      lineHeight: 1.2,
      marginTop: Math.round(l.time * 0.35),
    }),
  );

  const url = line('JOHNNYRHOADES.COM', { fontFamily: 'label', fontSize: l.url, letterSpacing: tracking(0.2, l.url), color: c.ink2, lineHeight: 1.2 });

  const body = l.wide
    ? [
        banner,
        name,
        ...act,
        rule,
        h(
          'div',
          { display: 'flex', flexGrow: 1, alignItems: 'stretch', justifyContent: 'space-between' },
          h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }, venue, h('div', { display: 'flex' }, url)),
          panel,
        ),
      ]
    : [
        banner,
        name,
        ...act,
        rule,
        h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, venue),
        h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(Math.min(format.width, format.height) * 0.022), marginTop: l.gap }, panel, url),
      ];

  return h(
    'div',
    {
      width: format.width,
      height: format.height,
      display: 'flex',
      flexDirection: 'column',
      background: paper,
      padding: `${l.pad.top}px ${l.pad.x}px ${l.pad.bottom}px`,
      overflow: 'hidden',
    },
    ...body,
  );
}
