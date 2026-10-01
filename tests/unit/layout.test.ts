/* The design pass: the gallery grid and the date blocks in show lists. */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { galleryLayout, type Shape } from '../../src/lib/gallery.ts';
import { parseMedia } from '../../src/lib/media.ts';
import { showSummary } from '../../src/lib/shows-data.ts';
import { parseShowsFile } from '../../src/lib/shows-file.ts';

const media = parseMedia(readFileSync('src/data/media.yaml', 'utf8'));
const gallery = media.photos.filter((p) => p.use.includes('gallery'));
const cells = { feature: 4, tall: 2, small: 1 } as const;

describe('gallery layout', () => {
  it('lays out the real photos as feature, two talls; two talls, feature; then four smalls', () => {
    const layout = galleryLayout(gallery);
    expect(layout.map((l) => l.slot)).toEqual(['feature', 'tall', 'tall', 'tall', 'tall', 'feature', 'small', 'small', 'small', 'small']);
    expect(layout.filter((l) => l.slot === 'tall').every((l) => l.photo.shape === 'portrait')).toBe(true);
    expect(layout.filter((l) => l.slot !== 'tall').every((l) => l.photo.shape === 'landscape')).toBe(true);
  });

  it('closes square on four columns and on two', () => {
    const total = galleryLayout(gallery).reduce((n, l) => n + cells[l.slot], 0);
    expect(total % 4).toBe(0);
  });

  it('keeps every photo exactly once, and falls back to small tiles', () => {
    const photos = (['landscape', 'landscape', 'portrait'] as Shape[]).map((shape, i) => ({ shape, i }));
    const layout = galleryLayout(photos);
    expect(layout.map((l) => l.photo.i).sort()).toEqual([0, 1, 2]);
    expect(layout.every((l) => l.slot === 'small')).toBe(true);
  });

  it('has each photo’s shape right, checked against the image file', async () => {
    for (const p of gallery) {
      const { width = 0, height = 0 } = await sharp(`src/assets/${p.file}`).metadata();
      expect(p.shape, p.file).toBe(width >= height ? 'landscape' : 'portrait');
    }
  });

  it('refuses a gallery photo without a shape', () => {
    const yaml = readFileSync('src/data/media.yaml', 'utf8').replace('    shape: portrait\n', '');
    expect(() => parseMedia(yaml)).toThrow(/need a shape/);
  });
});

describe('date blocks in show lists', () => {
  const shows = parseShowsFile(readFileSync('src/data/shows.json', 'utf8'));

  it('split the date in the venue’s time zone', () => {
    const goose = shows.find((s) => s.slug === '2026-10-23-blue-goose-inn-st-clair-shores')!;
    expect(showSummary(goose)).toMatchObject({ date: 'Fri, Oct 23', weekday: 'Fri', monthShort: 'Oct', day: '23', time: '9 pm' });
  });
});
