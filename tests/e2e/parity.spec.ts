/*
  Phase 0 acceptance: the Astro port matches the v1 prototype (reference/v1/)
  at 390, 768 and 1440 px within a small tolerance.

  Both pages render with reduced motion (so entrance animations and the record
  are at rest) and with the Bandsintown widget blocked (it shows live data).

  Photos are masked: v2 re-encodes them through Astro's image pipeline from
  full-size masters, so their pixels differ slightly by design. The masks are
  painted over each image's box, so a photo that moves or changes size still
  shows up as a difference.
*/
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { V1_URL } from '../../playwright.config';
import { blockThirdParties, loadEverything } from './helpers';

/** Share of pixels allowed to differ: the Németh fix, font hinting, sub-pixel rounding. */
const MAX_DIFF_RATIO = 0.002;
/** Allowed difference in page height, in CSS pixels. */
const MAX_HEIGHT_DELTA = 4;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

test.use({ reducedMotion: 'reduce' });

async function capture(page: Page, url: string): Promise<PNG> {
  await blockThirdParties(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await loadEverything(page);
  const shot = await page.screenshot({
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    mask: [page.locator('img[src]:not([src=""])')],
    maskColor: '#808080',
  });
  return PNG.sync.read(shot);
}

/** Pads an image to the given size with magenta, so any missing area counts as different. */
function pad(img: PNG, width: number, height: number): PNG {
  if (img.width === width && img.height === height) return img;
  const out = new PNG({ width, height, fill: true });
  out.data.fill(0);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255;
  }
  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
  return out;
}

for (const viewport of VIEWPORTS) {
  test(`home matches v1 at ${viewport.width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const v1 = await capture(await context.newPage(), `${V1_URL}/`);
    const v2 = await capture(await context.newPage(), '/');
    await context.close();

    const width = Math.max(v1.width, v2.width);
    const height = Math.max(v1.height, v2.height);
    const a = pad(v1, width, height);
    const b = pad(v2, width, height);
    const diff = new PNG({ width, height });
    const changed = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
    const ratio = changed / (width * height);

    // Saved next to the test results so they're easy to look at (CLAUDE.md: look at the screenshots).
    for (const [name, img] of [['v1', v1], ['v2', v2], ['diff', diff]] as const) {
      const path = testInfo.outputPath(`${name}.png`);
      writeFileSync(path, PNG.sync.write(img));
      await testInfo.attach(`${name}.png`, { path, contentType: 'image/png' });
    }
    console.log(
      `${viewport.width}px: ${(ratio * 100).toFixed(3)}% of pixels differ; height v1 ${v1.height}px, v2 ${v2.height}px`,
    );

    expect(Math.abs(v1.height - v2.height), 'page height differs from v1').toBeLessThanOrEqual(MAX_HEIGHT_DELTA);
    expect(ratio, 'share of pixels that differ from v1').toBeLessThan(MAX_DIFF_RATIO);
  });
}
