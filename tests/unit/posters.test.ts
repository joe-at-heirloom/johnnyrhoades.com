/*
  Phase 3 acceptance (PLAN.md section 4.1), for the show card (ADR 0017): the
  longest venue name fits in every format, the name is billed biggest, text
  contrast passes WCAG AA, renders stay under 150 ms, and snapshot tests
  cover five fixtures. Cached rebuilds skip unchanged posters.

  Update snapshots after an intended design change:
    UPDATE_POSTER_SNAPSHOTS=1 npm test -- posters
*/
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { mergeShows } from '../../src/lib/merge.ts';
import { posterContent } from '../../src/lib/posters/content.ts';
import { fitText, lineBreaks, type Measure } from '../../src/lib/posters/fit.ts';
import { DISPLAY_LADDER, measure } from '../../src/lib/posters/fonts.ts';
import { FORMATS, formatByKey } from '../../src/lib/posters/formats.ts';
import { printFinish } from '../../src/lib/posters/print.ts';
import { cacheKey, CACHE_DIR, posterSvg, renderContent, renderPoster } from '../../src/lib/posters/render.ts';
import { CARD_COLORS, cardFits, cardLayout, fillLine } from '../../src/lib/posters/show-card.ts';
import { parseShowsFile } from '../../src/lib/shows-file.ts';
import type { Show } from '../../src/lib/shows-schema.ts';
import { at, fresh } from './helpers.ts';

const SNAPSHOTS = 'tests/unit/__snapshots__/posters';
const UPDATE = process.env.UPDATE_POSTER_SNAPSHOTS === '1';

function makeShow(e: Parameters<typeof fresh>[0], status?: Show['status']): Show {
  const [show] = mergeShows({ existing: [], fresh: [fresh(e)], overrides: {}, now: at('2026-09-01T00:00:00-04:00'), artistName: 'Johnny Rhoades' }).shows;
  return { ...show!, ...(status && { status }) };
}

/** Synthetic test shows: the five snapshot fixtures. Not Johnny's real calendar. */
const FIXTURES: Record<string, Show> = {
  short: makeShow({ id: 'f1', datetime: '2026-11-06T20:00:00', venue: { name: 'The Ark', city: 'Ann Arbor' } }),
  long: makeShow({ id: 'f2', datetime: '2027-01-30T19:00:00', venue: { name: 'Detroit Blues Society Anti-Freeze Blues Festival at the Magic Bag', city: 'Ferndale' } }),
  guest: makeShow({ id: 'f3', datetime: '2026-12-12T21:00:00', title: 'With Motor City Josh & The Big 3', venue: { name: "Callahan's Music Hall", city: 'Auburn Hills' } }),
  free: makeShow({ id: 'f4', datetime: '2026-11-14T14:00:00', title: 'Solo acoustic', free: true, venue: { name: 'Octopus’ Beer Garden', city: 'Mount Clemens' } }),
  cancelled: makeShow({ id: 'f5', datetime: '2026-10-23T21:00:00', venue: { name: 'Blue Goose Inn', city: 'St. Clair Shores' } }, 'cancelled'),
};

describe('fitText', () => {
  // A fake font family: every character is 0.6em wide in the 100% cut, scaled by the cut's width.
  const widths: Record<string, number> = { wide: 1.25, normal: 1, condensed: 0.62 };
  const fake: Measure = (text, font) => [...text].length * 0.6 * (widths[font] ?? 1);
  const fonts = ['wide', 'normal', 'condensed'];

  it('lists every way to break words into lines', () => {
    expect(lineBreaks(['A', 'B', 'C'], 2)).toEqual([['A', 'B C'], ['A B', 'C']]);
    expect(lineBreaks(['A'], 2)).toEqual([]);
  });

  it('sets a short name wide and big', () => {
    const fit = fitText({ text: 'ARK', box: { width: 1000, height: 1000 }, fonts, measure: fake, maxSize: 400 });
    expect(fit).toMatchObject({ font: 'wide', lines: ['ARK'], size: 400 });
  });

  it('sets a long name condensed, on more lines', () => {
    const fit = fitText({ text: 'THREE BLIND MICE IRISH PUB', box: { width: 1000, height: 600 }, fonts, measure: fake });
    expect(fit.font).toBe('condensed');
    expect(fit.lines.length).toBeGreaterThan(1);
  });

  it('never overflows the box', () => {
    for (const text of ['ARK', 'BLUE GOOSE INN', 'A VERY LONG VENUE NAME THAT GOES ON AND ON AND ON']) {
      const fit = fitText({ text, box: { width: 900, height: 400 }, fonts, measure: fake });
      expect(fit.width).toBeLessThanOrEqual(900 + 1e-6);
      expect(fit.height).toBeLessThanOrEqual(400 + 1e-6);
    }
  });
});

describe('poster layout with the real fonts', () => {
  const real = parseShowsFile(readFileSync('src/data/shows.json', 'utf8'));
  const all = [...real, ...Object.values(FIXTURES)];
  const longest = [...all].sort((a, b) => b.venue.name.length - a.venue.name.length)[0]!;

  it('sets one line to fill the width, in whichever cut lands closest under the cap', () => {
    const widths: Record<string, number> = { wide: 1.25, normal: 1, condensed: 0.62 };
    const fake: Measure = (text, font) => [...text].length * 0.6 * (widths[font] ?? 1);
    const fonts = ['wide', 'normal', 'condensed'];
    // 6 letters across 900px: wide 200, normal 250, condensed 403. A cap of 260 takes normal, full width.
    const line = fillLine('JOHNNY', 900, fonts, fake, 260);
    expect(line.font).toBe('normal');
    expect(line.size).toBeCloseTo(250);
    expect(line.width).toBeCloseTo(900);
    // Even the widest cut is too big for the cap: set at the cap, short of the width.
    const capped = fillLine('JOHNNY', 900, fonts, fake, 100);
    expect(capped).toMatchObject({ font: 'wide', size: 100 });
    expect(capped.width).toBeLessThan(900);
  });

  it.each(FORMATS.map((f) => [f.key, f] as const))('fits every venue in %s, and bills the name biggest', (_key, format) => {
    for (const show of all) {
      const l = cardLayout(posterContent(show), format, measure, DISPLAY_LADDER);
      expect(cardFits(l, measure), `${show.venue.name} in ${format.key}`).toBe(true);
      const name = Math.min(...l.name.map((n) => n.size));
      expect(name, `name vs venue, ${show.venue.name} in ${format.key}`).toBeGreaterThan(l.venue.size);
      // Each line of the name runs the full width, give or take the 4% a line may come up short.
      for (const line of l.name) expect(line.width / l.contentWidth).toBeGreaterThan(0.95);
    }
    expect(longest.venue.name).toMatch(/Anti-Freeze/);
  });

  it('runs short venue names wide and long ones condensed', () => {
    const feed = formatByKey('feed')!;
    const short = cardLayout(posterContent(FIXTURES.short!), feed, measure, DISPLAY_LADDER);
    const long = cardLayout(posterContent(FIXTURES.long!), feed, measure, DISPLAY_LADDER);
    expect(DISPLAY_LADDER.indexOf(short.venue.font)).toBeLessThan(DISPLAY_LADDER.indexOf(long.venue.font));
    expect(short.venue.size).toBeGreaterThan(long.venue.size);
  });
});

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

describe('poster contrast (WCAG AA)', () => {
  const c = CARD_COLORS;

  it.each([
    ['name, venue and town, ink on bone', c.ink, c.paper],
    ['act line, red on bone', c.red, c.paper],
    ['band and date panel, bone on red', c.paper, c.red],
    ['URL, ink-on-bone-2', c.ink2, c.paper],
    ['cancelled, muted on bone and bone on muted', c.muted, c.paper],
  ])('%s passes 4.5:1', (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('poster content', () => {
  it('spells out every fact in the alt text', () => {
    expect(posterContent(FIXTURES.free!).alt).toBe(
      'Poster: Johnny Rhoades at Octopus’ Beer Garden, Mount Clemens, Saturday, November 14, 2 pm. Solo acoustic. Free.',
    );
    expect(posterContent(FIXTURES.cancelled!).alt).toMatch(/^Poster: cancelled, Johnny Rhoades at Blue Goose Inn/);
  });

  it('bills Johnny first on a guest spot, as the card does, with the band under him', () => {
    const content = posterContent(FIXTURES.guest!);
    expect(content.act).toBe('With Motor City Josh & The Big 3');
    expect(content.alt).toBe("Poster: Johnny Rhoades, with Motor City Josh & The Big 3, at Callahan's Music Hall, Auburn Hills, Saturday, December 12, 9 pm.");
  });
});

describe('rendering', () => {
  it('renders each format in under 150 ms once warm, print texture included', async () => {
    const content = posterContent(FIXTURES.long!);
    await renderContent(content, formatByKey('og')!); // load fonts and textures
    const times: number[] = [];
    for (const format of FORMATS) {
      const t = performance.now();
      await renderContent(content, format);
      times.push(performance.now() - t);
    }
    const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
    expect(median).toBeLessThan(150);
  });

  it.each(Object.keys(FIXTURES).flatMap((name) => ['feed', 'og'].map((f) => [name, f] as const)))(
    'matches the %s snapshot (%s)',
    async (name, formatKey) => {
      const format = formatByKey(formatKey)!;
      const png = await renderContent(posterContent(FIXTURES[name]!), format);
      const file = join(SNAPSHOTS, `${name}-${formatKey}.png`);
      if (UPDATE || !existsSync(file)) {
        mkdirSync(SNAPSHOTS, { recursive: true });
        writeFileSync(file, png);
        if (!UPDATE) throw new Error(`Wrote a new snapshot ${file}; review it and run again.`);
        return;
      }
      const [a, b] = [PNG.sync.read(readFileSync(file)), PNG.sync.read(png)];
      expect([b.width, b.height]).toEqual([a.width, a.height]);
      const changed = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1 });
      expect(changed / (a.width * a.height)).toBeLessThan(0.001);
    },
  );

  it('caches renders and reuses them while nothing on the poster changes', async () => {
    const show = makeShow({ id: 'cache-test', datetime: '2026-11-20T20:00:00', venue: { name: 'Cache Room', city: 'Detroit' } });
    const format = formatByKey('og')!;
    const file = join(CACHE_DIR, `${cacheKey(posterContent(show), format)}.png`);
    rmSync(file, { force: true });
    const first = await renderPoster(show, format);
    expect(existsSync(file)).toBe(true);
    writeFileSync(file, Buffer.from('cached')); // prove the second call reads the cache
    expect((await renderPoster(show, format)).toString()).toBe('cached');
    rmSync(file);
    const moved = { ...show, start: '2026-11-21T20:00:00-05:00' };
    expect(cacheKey(posterContent(moved), format)).not.toBe(cacheKey(posterContent(show), format));
    expect(first.subarray(1, 4).toString()).toBe('PNG');
  });
});

describe('print finish', () => {
  it('wears big type but leaves thin strokes whole', async () => {
    // Bone stock with a heavy block of ink and a 4px stroke, like a label's.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#efe6d3"/><rect x="40" y="40" width="300" height="500" fill="#0d0b0a"/><rect x="450" y="40" width="4" height="500" fill="#0d0b0a"/></svg>`;
    const png = await printFinish(await sharp(Buffer.from(svg)).png().toBuffer());
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    const grey = (x: number, y: number) => data[(y * info.width + x) * info.channels]!;
    let worn = 0;
    for (let y = 60; y < 520; y++) for (let x = 60; x < 320; x++) if (grey(x, y) > 120) worn++;
    expect(worn, 'voids in the heavy block').toBeGreaterThan(0);
    for (let y = 40; y < 540; y++) for (let x = 450; x < 454; x++) expect(grey(x, y), `stroke at ${x},${y}`).toBeLessThan(60);
  });
});

describe('the show page card', () => {
  it('is the feed layout as inline SVG: vector paths, no fonts, no stock of its own, labeled with the alt text', async () => {
    const svg = await posterSvg(FIXTURES.guest!);
    expect(svg).toMatch(/^<svg class="poster" role="img" aria-label="Poster: Johnny Rhoades, with Motor City Josh &amp; The Big 3, at Callahan's Music Hall, [^"]+" viewBox="0 0 1080 1350"/);
    expect(svg).not.toMatch(/<text|data:image\/(png|jpeg)/); // glyphs are paths; the only images are the vector stars
    expect(svg).not.toContain('width="1080" height="1350" fill="#efe6d3"'); // the page supplies the stock
    expect(svg).not.toMatch(/\d\.\d{2,}/); // rounded to a tenth of a pixel
  });
});
