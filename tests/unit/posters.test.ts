/*
  Phase 3 acceptance (PLAN.md section 4.1): the longest venue name fits in
  every format, text contrast passes WCAG AA, renders stay under 150 ms, and
  snapshot tests cover five fixtures. Cached rebuilds skip unchanged posters.

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
import { duotone, pickPhoto } from '../../src/lib/posters/duotone.ts';
import { fitText, lineBreaks, type Measure } from '../../src/lib/posters/fit.ts';
import { DISPLAY_LADDER, measure } from '../../src/lib/posters/fonts.ts';
import { FORMATS, formatByKey } from '../../src/lib/posters/formats.ts';
import { cacheKey, CACHE_DIR, renderContent, renderPoster } from '../../src/lib/posters/render.ts';
import { fitsWithin, layout, POSTER_COLORS } from '../../src/lib/posters/template.ts';
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

  it.each(FORMATS.map((f) => [f.key, f] as const))('every venue name fits in %s, including the longest', (_key, format) => {
    for (const show of all) {
      const content = posterContent(show);
      const l = layout(content, format, measure, DISPLAY_LADDER);
      expect(fitsWithin(l, content, measure), `${show.venue.name} in ${format.key}`).toBe(true);
    }
    expect(longest.venue.name).toMatch(/Anti-Freeze/);
  });

  it('runs short names wide and long names condensed', () => {
    const feed = formatByKey('feed')!;
    const short = layout(posterContent(FIXTURES.short!), feed, measure, DISPLAY_LADDER);
    const long = layout(posterContent(FIXTURES.long!), feed, measure, DISPLAY_LADDER);
    expect(DISPLAY_LADDER.indexOf(short.venue.font)).toBeLessThan(DISPLAY_LADDER.indexOf(long.venue.font));
    expect(short.venue.size).toBeGreaterThan(long.venue.size);
  });
});

describe('poster contrast (WCAG AA)', () => {
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
  const c = POSTER_COLORS;

  it.each([
    ['venue and details, bone on black', c.bone, c.ground],
    ['billing and date, red on black', c.redHi, c.ground],
    ['tags and URL, muted on black', c.muted, c.ground],
    ['cancelled band, bone on red', c.bone, c.red],
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
    expect(posterContent(FIXTURES.guest!).billing).toBe("Motor City Josh & The Big 3, with Johnny Rhoades");
  });
});

describe('rendering', () => {
  it('renders each format in under 150 ms once warm', async () => {
    const content = posterContent(FIXTURES.long!);
    await renderContent(content, formatByKey('og')!); // load fonts
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

describe('duotone photos', () => {
  const photos = [
    { file: 'a.jpg', acts: 'all' as const },
    { file: 'b.jpg', acts: ['band', 'trio'] as Show['act'][] },
  ];

  it('picks the same photo for the same show, from those that fit the act', () => {
    expect(pickPhoto('108955500', 'unspecified', photos)?.file).toBe('a.jpg');
    const band = new Set(Array.from({ length: 20 }, (_, i) => pickPhoto(String(i), 'band', photos)?.file));
    expect(band).toEqual(new Set(['a.jpg', 'b.jpg']));
    expect(pickPhoto('42', 'band', photos)).toEqual(pickPhoto('42', 'band', photos));
    expect(pickPhoto('42', 'solo', [])).toBeNull();
  });

  it('maps a photo onto the black-to-red ramp at the requested size', async () => {
    const uri = await duotone(readFileSync('src/assets/photos/hero.jpg'), { width: 120, height: 80 });
    const img = sharp(Buffer.from(uri.split(',')[1]!, 'base64'));
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([120, 80]);
    // The ramp runs from #0d0b0a to #c02e28: red leads overall, green and blue stay low
    // (JPEG adds a few levels of noise near black, so this checks averages and ceilings).
    const sum = [0, 0, 0];
    let maxGreenBlue = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
      maxGreenBlue = Math.max(maxGreenBlue, data[i + 1]!, data[i + 2]!);
    }
    expect(sum[0]!).toBeGreaterThan(sum[1]! * 1.8);
    expect(sum[0]!).toBeGreaterThan(sum[2]! * 1.8);
    expect(maxGreenBlue).toBeLessThanOrEqual(100); // the ramp tops out at 46; JPEG chroma overshoots at red edges
  });
});
