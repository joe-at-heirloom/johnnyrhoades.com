/*
  Fit-to-width type, the posters' typographic signature (PLAN.md section 4.1).

  Archivo comes in a ladder of widths, from wide (125%) to condensed (62%).
  For a venue name, try every width and every way of breaking it into one to
  three lines, and keep whichever sets the type biggest without overflowing
  the box. Short names end up wide and huge; long names end up condensed
  and stacked. A tie goes to the wider cut and fewer lines.

  Pure: text measurement comes in as a function, so tests don't need fonts.
*/

/** Width of `text` set at 1px in the given font, letter-spacing excluded. */
export type Measure = (text: string, font: string) => number;

export type FitOptions = {
  text: string;
  box: { width: number; height: number };
  fonts: string[]; // widest first
  measure: Measure;
  lineHeight?: number; // multiple of the font size
  letterSpacing?: number; // em
  maxLines?: number;
  maxSize?: number;
};

export type Fit = { font: string; size: number; lines: string[]; width: number; height: number };

/** Every way to break `words` into exactly `count` non-empty lines, in order. */
export function lineBreaks(words: string[], count: number): string[][] {
  if (count === 1) return [[words.join(' ')]];
  if (words.length < count) return [];
  const out: string[][] = [];
  for (let i = 1; i <= words.length - count + 1; i++) {
    for (const rest of lineBreaks(words.slice(i), count - 1)) out.push([words.slice(0, i).join(' '), ...rest]);
  }
  return out;
}

export function lineWidth(line: string, font: string, size: number, measure: Measure, letterSpacing: number): number {
  const chars = [...line].length;
  return measure(line, font) * size + letterSpacing * size * Math.max(0, chars - 1);
}

export function fitText({
  text,
  box,
  fonts,
  measure,
  lineHeight = 0.88,
  letterSpacing = 0,
  maxLines = 3,
  maxSize = Infinity,
}: FitOptions): Fit {
  const words = text.trim().split(/\s+/);
  let best: Fit | null = null;
  const better = (a: Fit, b: Fit | null) => !b || a.size > b.size * 1.02;

  for (const font of fonts) {
    for (let count = 1; count <= Math.min(maxLines, words.length); count++) {
      for (const lines of lineBreaks(words, count)) {
        const widest = Math.max(...lines.map((l) => lineWidth(l, font, 1, measure, letterSpacing)));
        const size = Math.min(maxSize, box.width / widest, box.height / (count * lineHeight));
        const candidate: Fit = { font, size, lines, width: widest * size, height: count * lineHeight * size };
        if (better(candidate, best)) best = candidate;
      }
    }
  }
  if (!best) throw new Error(`Can't fit "${text}"`);
  return best;
}
