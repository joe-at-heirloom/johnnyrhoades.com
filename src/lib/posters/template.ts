/*
  The poster layout: a bill built from type (PLAN.md section 4.1).

    BILLING                       (label, red)
    VENUE NAME, AS BIG AS IT FITS (display ladder, bone)
    FRIDAY, OCTOBER 23            (condensed display, red)
    9 PM · ST. CLAIR SHORES, MI   (text, bone)
    SOLO ACOUSTIC · FREE          (label, muted)
    ─────────────────────────────
    [logo]          JOHNNYRHOADES.COM

  Built as plain element objects for satori (no JSX toolchain needed).
  Every size is computed here, so tests can check that nothing overflows.
*/
import type { PosterContent } from './content.ts';
import { fitText, lineWidth, type Fit, type Measure } from './fit.ts';
import type { PosterFormat } from './formats.ts';

export const TEMPLATE_VERSION = 5; // bump when the layout changes, to invalidate cached renders

export const POSTER_COLORS = {
  ground: '#0d0b0a',
  frame: 'rgba(239, 230, 211, 0.22)',
  bone: '#efe6d3',
  bone2: '#c9bfad',
  muted: '#a99f8e',
  red: '#c02e28',
  redHi: '#e8503f',
} as const;

export type Element = { type: string; props: Record<string, unknown> };

const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Element => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});

export type Layout = {
  pad: number;
  contentWidth: number;
  label: number;
  venue: Fit;
  date: Fit;
  detail: number;
  tags: number;
  logoWidth: number;
  url: number;
};

/** Every size on the poster, for a format and its content. */
export function layout(content: PosterContent, format: PosterFormat, measure: Measure, ladder: string[]): Layout {
  const { width: w, height: h } = format;
  const short = Math.min(w, h);
  const landscape = w > h * 1.2;
  const pad = Math.round(short * 0.075);
  const contentWidth = w - pad * 2;
  const venueShare = landscape ? 0.36 : format.key === 'story' ? 0.5 : format.key === '1x1' ? 0.36 : 0.42;

  const venue = fitText({
    text: content.venue.toUpperCase(),
    box: { width: contentWidth * 0.98, height: h * venueShare },
    fonts: ladder,
    measure,
    maxLines: format.key === 'story' ? 4 : 3,
    maxSize: short * 0.32,
  });
  const date = fitText({
    text: content.date.toUpperCase(),
    box: { width: contentWidth * 0.98, height: short * 0.11 },
    fonts: [ladder.at(-1) ?? 'display-62'],
    measure,
    maxLines: 1,
    maxSize: short * (landscape ? 0.085 : 0.095),
    lineHeight: 1,
  });
  return {
    pad,
    contentWidth,
    label: Math.round(short * 0.034),
    venue,
    date,
    detail: Math.round(short * 0.042),
    tags: Math.round(short * 0.03),
    logoWidth: Math.round(short * (landscape ? 0.3 : 0.28)),
    url: Math.round(short * 0.024),
  };
}

/** True when every line of text fits inside the content box (the acceptance check). */
export function fitsWithin(l: Layout, content: PosterContent, measure: Measure): boolean {
  const venueOk = l.venue.lines.every((line) => lineWidth(line, l.venue.font, l.venue.size, measure, 0) <= l.contentWidth);
  const dateOk = lineWidth(content.date.toUpperCase(), l.date.font, l.date.size, measure, 0) <= l.contentWidth;
  return venueOk && dateOk;
}

/** Portrait formats have room for a photo above the type; landscape ones stay type-only. */
export const hasPhotoSlot = (format: PosterFormat) => format.height >= format.width;
export const photoSize = (format: PosterFormat) => ({ width: format.width, height: Math.round(format.height * 0.62) });

export function posterElement(content: PosterContent, format: PosterFormat, l: Layout, logoDataUri: string, photoDataUri?: string): Element {
  const c = POSTER_COLORS;
  const photo =
    photoDataUri && hasPhotoSlot(format)
      ? [
          { type: 'img', props: { src: photoDataUri, ...photoSize(format), style: { position: 'absolute', top: 0, left: 0 } } },
          h('div', {
            position: 'absolute',
            top: 0,
            left: 0,
            width: format.width,
            height: photoSize(format).height,
            backgroundImage: `linear-gradient(to bottom, rgba(13, 11, 10, 0.15) 0%, rgba(13, 11, 10, 0.35) 45%, ${c.ground} 100%)`,
            display: 'flex',
          }),
        ]
      : [];
  const tracking = (em: number, size: number) => `${(em * size).toFixed(2)}px`;

  const venueLines = l.venue.lines.map((line) =>
    h('div', { display: 'flex', fontFamily: l.venue.font, fontSize: l.venue.size, lineHeight: 0.88, color: content.cancelled ? c.muted : c.bone, whiteSpace: 'nowrap' }, line),
  );


  return h(
    'div',
    {
      width: format.width,
      height: format.height,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: c.ground,
      padding: l.pad,
      overflow: 'hidden',
    },
    ...photo,
    // a thin frame, like a printed bill
    h('div', {
      position: 'absolute',
      top: l.pad * 0.45,
      left: l.pad * 0.45,
      right: l.pad * 0.45,
      bottom: l.pad * 0.45,
      border: `2px solid ${c.frame}`,
      display: 'flex',
    }),
    content.cancelled
      ? h(
          'div',
          {
            display: 'flex',
            alignSelf: 'flex-start',
            fontFamily: 'display-62',
            fontSize: l.label * 2,
            letterSpacing: tracking(0.06, l.label * 2),
            lineHeight: 1,
            color: c.bone,
            background: c.red,
            padding: `${Math.round(l.label * 0.35)}px ${Math.round(l.label * 0.6)}px`,
          },
          'CANCELLED',
        )
      : h(
          'div',
          {
            display: 'flex',
            fontFamily: 'label',
            fontSize: l.label,
            letterSpacing: tracking(0.2, l.label),
            color: c.redHi,
            lineHeight: 1.2,
            maxWidth: l.contentWidth,
          },
          content.billing.toUpperCase(),
        ),
    h(
      'div',
      { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end' },
      ...venueLines,
      h(
        'div',
        { display: 'flex', fontFamily: l.date.font, fontSize: l.date.size, lineHeight: 1, color: content.cancelled ? c.muted : c.redHi, marginTop: l.date.size * 0.3, whiteSpace: 'nowrap' },
        content.date.toUpperCase(),
      ),
      h(
        'div',
        { display: 'flex', fontFamily: 'text', fontSize: l.detail, color: c.bone, marginTop: l.detail * 0.45, lineHeight: 1.2 },
        content.timeAndTown.toUpperCase(),
      ),
      ...(content.tags.length
        ? [
            h(
              'div',
              { display: 'flex', fontFamily: 'label', fontSize: l.tags, letterSpacing: tracking(0.16, l.tags), color: c.muted, marginTop: l.tags * 0.5 },
              content.tags.join(' · ').toUpperCase(),
            ),
          ]
        : []),
    ),
    h(
      'div',
      {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: l.pad * 0.6,
        paddingTop: l.pad * 0.45,
        borderTop: `2px solid ${c.frame}`,
      },
      { type: 'img', props: { src: logoDataUri, width: l.logoWidth, height: Math.round((l.logoWidth * 434) / 1400) } },
      h('div', { display: 'flex', fontFamily: 'label', fontSize: l.url, letterSpacing: tracking(0.14, l.url), color: c.muted }, 'JOHNNYRHOADES.COM'),
    ),
  );
}
