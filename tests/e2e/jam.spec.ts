/* The blues maker (/jam/, ADR 0030): it plays, it follows the form, and a song is a link. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { blockThirdParties, collectConsoleErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

test('the home page links to it from under the strum, and features it after the music', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.strum').getByRole('link', { name: 'Play it with a band' })).toHaveAttribute('href', '/jam/');
  const feature = page.locator('#sit-in');
  await expect(feature.getByRole('heading', { name: 'Sit in with the band' })).toBeVisible();
  await expect(feature.getByRole('link', { name: 'Play a gig' })).toHaveAttribute('href', '/jam/');
  // Each gig is a link to its card in the game, which marks it.
  await expect(feature.getByRole('link', { name: /Friday night/ })).toHaveAttribute('href', '/jam/#gig-friday');
  await feature.getByRole('link', { name: /Friday night/ }).click();
  await expect(page).toHaveURL(/\/jam\/#gig-friday$/);
  // Once the page has gone to the fragment, the card is the target, marked, and in view below the header.
  await expect.poll(() => page.locator('#gig-friday').evaluate((el) => el.matches(':target'))).toBe(true);
  await expect(page.locator('#gig-friday')).toHaveCSS('border-top-color', 'rgb(192, 46, 40)');
  await expect(page.locator('#gig-friday')).toBeInViewport();
  expect((await page.locator('#gig-friday').boundingBox())!.y).toBeGreaterThan(60);
});

test('it plays the 12 bars, loading only the sounds the song uses, and stops', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const mp3s: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('.mp3')) mp3s.push(r.url().split('/').pop()!.replace(/\.[^.]+\.mp3$/, ''));
  });
  await page.goto('/jam/?mode=advanced&feel=boogie&bpm=176&guitar=off&keys=off&lead=off&intro=none');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make a 12-bar blues');
  await expect(page.locator('[data-jam-chord]')).toHaveText(['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7']);
  expect(mp3s).toEqual([]); // nothing loads before Play

  const play = page.getByRole('button', { name: 'Play' });
  await play.click();
  await expect(page.locator('[data-jam-status]')).toHaveText('Playing a boogie in E, 176 bpm.');
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // At 176 bpm a bar is about 1.4 s: the marker starts on bar 1 and moves on.
  await expect(page.locator('[data-jam-bar][aria-current]')).toHaveCount(1);
  await expect(page.locator('[data-jam-bar]').nth(1)).toHaveAttribute('aria-current', 'true', { timeout: 4000 });
  expect(new Set(mp3s.map((f) => f.split('-')[0]))).toEqual(new Set(['sticks', 'upright']));

  // The drawn band plays along: the parts that are playing are marked on their notes, the ones that are off never are.
  await expect(page.locator('[data-jam-light="drums"][data-on]')).toHaveCount(1, { timeout: 3000 });
  await expect(page.locator('[data-jam-light="bass"][data-on]')).toHaveCount(1, { timeout: 3000 });
  await expect(page.locator('[data-jam-light="drums"]')).not.toHaveAttribute('data-on', { timeout: 3000 });
  expect(await page.locator('[data-jam-light="keys"][data-on], [data-jam-light="guitar"][data-on]').count()).toBe(0);
  // A bass string shakes (it's drawn as a curve while it rings) and a drum takes the hit.
  await expect.poll(() => page.locator('[data-band="bass"] [data-string][data-hot]').evaluateAll((els) => els.some((el) => el.getAttribute('d')!.includes('Q'))), { timeout: 3000 }).toBe(true);
  await expect.poll(() => page.locator('[data-drum][data-hot]').count(), { timeout: 3000 }).toBeGreaterThan(0);
  await expect(page.locator('[data-band="drums"]')).not.toHaveAttribute('data-off');
  await expect(page.locator('[data-band="keys"]')).toHaveAttribute('data-off', '');

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('[data-jam-status]')).toHaveText('Stopped.');
  await expect(page.locator('[data-jam-bar][aria-current]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a song is a link: the form reads the address bar and writes it back', async ({ page }) => {
  await page.goto('/jam/?mode=advanced&key=A&feel=slow&bpm=60&change=quick&drums=brushes&room=vinyl');
  await expect(page.getByRole('radio', { name: 'A', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Slow blues' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Quick change/ })).toBeChecked();
  await expect(page.locator('[data-jam-tempo-out]')).toHaveText('60 bpm');
  await expect(page.locator('[data-jam-chord]').nth(1)).toHaveText('D7');

  await page.getByRole('radio', { name: 'G', exact: true }).check();
  await expect(page).toHaveURL(/[?&]key=G(&|$)/);
  await expect(page.locator('[data-jam-chord]').first()).toHaveText('G7');
  // A new feel starts at its own tempo.
  await page.getByRole('radio', { name: 'Shuffle' }).check();
  await expect(page.locator('[data-jam-tempo-out]')).toHaveText('100 bpm');
  await expect(page).toHaveURL(/feel=shuffle&bpm=100/);
  await page.getByRole('switch', { name: 'Fills' }).click();
  await expect(page).toHaveURL(/lead=off/);
});

test('it has no serious accessibility problems', async ({ page }) => {
  await page.goto('/jam/?mode=advanced');
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('every control can be reached and used from the keyboard', async ({ page }) => {
  await page.goto('/jam/?mode=advanced');
  await page.getByRole('button', { name: 'Play' }).focus();
  // Play, then Record; the bandleader's cues wait (disabled) until the band plays; then the band:
  // the drum kit is a switch, then its tones.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Record a take' })).toBeFocused();
  await page.keyboard.press('Tab');
  const drums = page.getByRole('switch', { name: 'Drums' });
  await expect(drums).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(drums).toHaveAttribute('aria-checked', 'false');
  await expect(page).toHaveURL(/drums=off/);
  await page.keyboard.press('Space');
  await expect(drums).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('group', { name: 'Drums' }).getByRole('radio', { name: 'Sticks' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/drums=brushes/);
  // Then the key.
  await page.getByRole('radio', { name: 'E', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'A', exact: true })).toBeChecked();
  await expect(page).toHaveURL(/key=A/);
});

test('an instrument’s switch (or its drawing) sits it out, and brings it back with the tone it had', async ({ page }) => {
  await page.goto('/jam/?mode=advanced&guitar=acoustic');
  const guitar = page.getByRole('switch', { name: 'Guitar' });
  await expect(guitar).toHaveAttribute('aria-checked', 'true');
  await guitar.click();
  await expect(guitar).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('[data-band="guitar"]')).toHaveAttribute('data-off', '');
  await expect(page.locator('input[name="guitar"][value="off"]')).toBeChecked();
  await expect(page.getByRole('group', { name: 'Guitar' }).getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(page).toHaveURL(/guitar=off/);
  await guitar.click();
  await expect(page.getByRole('group', { name: 'Guitar' }).getByRole('radio', { name: 'Acoustic' })).toBeChecked();
  await expect(page).toHaveURL(/guitar=acoustic/);
  // Clicking the drawing flips the same switch.
  await page.locator('[data-band-art="guitar"]').click();
  await expect(guitar).toHaveAttribute('aria-checked', 'false');
  // Picking a tone brings a part that's off back in, in that tone.
  await page.getByRole('group', { name: 'Guitar' }).getByRole('radio', { name: 'Clean hollowbody' }).check();
  await expect(guitar).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/guitar=clean/);
  // A part that starts off comes in on its first tone.
  await page.goto('/jam/?mode=advanced&keys=off');
  await page.getByRole('switch', { name: 'Keys' }).click();
  await expect(page.getByRole('group', { name: 'Keys' }).getByRole('radio', { name: 'Upright piano' })).toBeChecked();
});

test('the drawings follow the tones, and the keys and harmonica play the notes', async ({ page }) => {
  await page.goto('/jam/?mode=advanced&bass=electric&guitar=off&keys=piano&lead=harp&feel=slow&bpm=76&intro=none');
  await expect(page.locator('[data-band="bass"] [data-tone="electric"]')).toBeVisible();
  await expect(page.locator('[data-band="bass"] [data-tone="upright"]')).toBeHidden();
  await expect(page.getByRole('group', { name: 'Bass' }).getByRole('radio', { name: 'Electric' })).toBeChecked();
  await page.getByRole('group', { name: 'Fills' }).getByRole('radio', { name: 'Tenor sax' }).check();
  await expect(page.locator('[data-band="lead"] [data-tone="sax"]')).toBeVisible();
  await page.getByRole('group', { name: 'Fills' }).getByRole('radio', { name: 'Harmonica' }).check();

  await page.getByRole('button', { name: 'Play' }).click();
  // The slow-blues piano plays triplet chords on every beat: four keys down at once.
  // (At a chord change the old and new chords overlap for a moment, so at least four.)
  await expect.poll(() => page.locator('.band-key[data-down]').count(), { timeout: 8000 }).toBeGreaterThanOrEqual(4);
  // The harmonica answers in bar 3, after a four-beat count-in and two bars (about 9.5 s at 76 bpm).
  await expect.poll(() => page.locator('[data-band="lead"] .band-hole[data-hot]').count(), { timeout: 15000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('.band-key[data-down], .band-svg [data-hot]')).toHaveCount(0);
});

test('with reduced motion nothing moves, and the playing parts hold steady', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/jam/?mode=advanced&guitar=off&room=vinyl');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('[data-jam-status]')).toHaveText(/Playing/);
  const on = () => page.locator('[data-jam-light][data-on]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.jamLight).sort());
  await expect.poll(on).toEqual(['bass', 'drums', 'keys', 'lead']);
  // Colors still follow the notes, but no string ever bends and no drum moves.
  // A hit is red for about a tenth of a second, so watch for it from inside the page rather than polling.
  const sawHit = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const seen = () => document.querySelector('[data-drum][data-hot]') !== null;
        if (seen()) return resolve(true);
        const watch = new MutationObserver(() => seen() && (watch.disconnect(), resolve(true)));
        watch.observe(document.querySelector('[data-bandstand]')!, { attributes: true, subtree: true, attributeFilter: ['data-hot'] });
        setTimeout(() => (watch.disconnect(), resolve(false)), 5000);
      }),
  );
  expect(sawHit).toBe(true);
  for (let i = 0; i < 10; i++) {
    expect(await page.locator('[data-string]').evaluateAll((els) => els.some((el) => el.getAttribute('d')!.includes('Q')))).toBe(false);
    expect(await page.locator('[data-drum]').evaluateAll((els) => els.some((el) => (el.getAttribute('transform') ?? '') !== ''))).toBe(false);
    await page.waitForTimeout(70);
  }
  expect(await on()).toEqual(['bass', 'drums', 'keys', 'lead']);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  expect(await on()).toEqual([]);
});

test.describe('the mixer', () => {
  const meter = (page: import('@playwright/test').Page, strip: string) =>
    page.locator(`[data-strip="${strip}"] [data-meter]`).evaluate((el) => Number(/scaleY\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1] ?? 0));

  test('the meters read the band, and mute and solo silence the right strips', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/jam/?mode=advanced&feel=boogie&bpm=176&lead=off');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect.poll(() => meter(page, 'bass'), { timeout: 5000 }).toBeGreaterThan(0.3);
    await expect.poll(() => meter(page, 'master'), { timeout: 5000 }).toBeGreaterThan(0.3);

    // Mute the bass: its meter drops to nothing while the drums keep going.
    await page.getByRole('button', { name: 'Mute Bass' }).click();
    await expect(page.getByRole('button', { name: 'Mute Bass' })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(400); // let the fader's glide finish before listening for silence
    await expect.poll(async () => { let max = 0; for (let i = 0; i < 8; i++) { max = Math.max(max, await meter(page, 'bass')); await page.waitForTimeout(60); } return max; }, { timeout: 8000 }).toBeLessThan(0.05);
    await expect.poll(() => meter(page, 'drums'), { timeout: 3000 }).toBeGreaterThan(0.2);
    await expect(page).toHaveURL(/mix=b%3A[^&]*m/);

    // Solo the drums: everything else goes quiet, bass still muted.
    await page.getByRole('button', { name: 'Mute Bass' }).click();
    await page.getByRole('button', { name: 'Solo Drums' }).click();
    await expect(page.locator('[data-strip="guitar"]')).toHaveAttribute('data-silenced', '');
    await page.waitForTimeout(400);
    await expect.poll(async () => { let max = 0; for (let i = 0; i < 8; i++) { max = Math.max(max, await meter(page, 'guitar')); await page.waitForTimeout(60); } return max; }, { timeout: 8000 }).toBeLessThan(0.05);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    expect(errors).toEqual([]);
  });

  test('faders and knobs move the mix, read out in dB, go into the link, and reset', async ({ page }) => {
    await page.goto('/jam/?mode=advanced');
    const fader = page.getByRole('slider', { name: 'Guitar level' });
    await fader.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-strip="guitar"] [data-mix-out]')).toHaveText('−4.0 dB');
    await expect(fader).toHaveAttribute('aria-valuetext', '−4.0 dB');
    await page.getByRole('slider', { name: 'Keys pan' }).focus();
    await page.keyboard.press('End');
    await expect(page).toHaveURL(/mix=/);
    // A shared link brings the mix back.
    await page.reload();
    await expect(page.locator('[data-strip="guitar"] [data-mix-out]')).toHaveText('−4.0 dB');
    await expect(page.getByRole('slider', { name: 'Keys pan' })).toHaveValue('1');
    // Double-click a control to put it back; Reset puts everything back.
    await page.getByRole('slider', { name: 'Keys pan' }).dblclick();
    await expect(page.getByRole('slider', { name: 'Keys pan' })).toHaveValue('0.25');
    await page.getByRole('button', { name: 'Reset the mix' }).click();
    await expect(page.locator('[data-strip="guitar"] [data-mix-out]')).toHaveText('−6.0 dB');
    await expect(page).not.toHaveURL(/mix=/);
  });

  test('a part the song leaves out has a dimmed strip', async ({ page }) => {
    await page.goto('/jam/?mode=advanced&keys=off');
    await expect(page.locator('[data-strip="keys"]')).toHaveAttribute('data-off', '');
    await page.getByRole('switch', { name: 'Keys' }).click();
    await expect(page.locator('[data-strip="keys"]')).not.toHaveAttribute('data-off');
  });
});

test.describe('leading the band', () => {
  test('the cues wait for the band, then call the next chorus; taking it home plays the ending and stops', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectConsoleErrors(page);
    await page.goto('/jam/?mode=advanced&feel=boogie&bpm=176');
    const solo = page.getByRole('button', { name: 'A solo' });
    const home = page.getByRole('button', { name: 'Take it home' });
    await expect(solo).toBeDisabled();
    await page.getByRole('button', { name: 'Play' }).click();
    // It starts on the turnaround: bar 9 is the first bar lit.
    await expect(page.locator('[data-jam-bar]').nth(8)).toHaveAttribute('aria-current', 'true', { timeout: 5000 });
    await expect(page.locator('[data-leader-now]')).toContainText('The intro.');
    await expect(solo).toBeEnabled();
    await solo.click();
    await expect(solo).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-leader-now]')).toContainText('Next: a solo (your call)');
    await solo.click(); // call it off again
    await expect(page.locator('[data-leader-now]')).toContainText('(the band’s call)');
    // Taking it home during the intro: the ending comes right at the end of it.
    await home.click();
    await expect(home).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-leader-now]')).toContainText('Taking it home');
    await expect(page.locator('[data-jam-status]')).toHaveText('That’s the end. Press Play to go again.', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
    await expect(home).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('the band arranges itself: the tune, then the spotlight moves to the fills for a solo', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/jam/?mode=advanced&feel=boogie&bpm=176&intro=none');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('[data-leader-now]')).toContainText('Chorus 1: the tune.', { timeout: 5000 });
    // Call the solo for chorus 2 and wait for it.
    await page.getByRole('button', { name: 'A solo' }).click();
    await expect(page.locator('[data-leader-now]')).toContainText('Chorus 2: a solo.', { timeout: 25_000 });
    await expect(page.locator('[data-band="lead"]')).toHaveAttribute('data-spotlight', '', { timeout: 3000 });
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.locator('[data-band][data-spotlight]')).toHaveCount(0);
  });
});

test.describe('sitting in', () => {
  const meter = (page: import('@playwright/test').Page, strip: string) =>
    page.locator(`[data-strip="${strip}"] [data-meter]`).evaluate((el) => Number(/scaleY\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1] ?? 0));

  test('the pads play the blues scale in the song’s key, from the keyboard too, through the instrument’s strip', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/jam/?mode=advanced&key=A');
    const pads = page.locator('[data-pad-name]');
    await expect(pads).toHaveText(['A', 'C', 'D', 'Eb', 'E', 'G', 'A', 'C']);
    await expect(page.locator('[data-pad]').nth(3)).toHaveAttribute('aria-label', 'E flat, the flat 5 (key F)');
    // Changing the key relabels them.
    await page.getByRole('radio', { name: 'E', exact: true }).check();
    await expect(pads.first()).toHaveText('E');

    // Hold G: the fifth sounds through the harp's strip (the band needn't be playing), and the harp is in the spotlight.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.down('g');
    await expect(page.locator('[data-pad]').nth(4)).toHaveAttribute('data-down', '');
    await expect.poll(() => meter(page, 'lead'), { timeout: 3000 }).toBeGreaterThan(0.2);
    await expect(page.locator('[data-band="lead"]')).toHaveAttribute('data-spotlight', '');
    await page.keyboard.up('g');
    await expect(page.locator('[data-pad]').nth(4)).not.toHaveAttribute('data-down');

    // On guitar, the notes go through the guitar's strip.
    await page.getByRole('radio', { name: 'Guitar', exact: true }).check();
    const pad = page.locator('[data-pad]').first();
    await pad.dispatchEvent('pointerdown', { pointerId: 3, isPrimary: true, clientX: 10, clientY: 10 });
    await expect.poll(() => meter(page, 'guitar'), { timeout: 3000 }).toBeGreaterThan(0.2);
    await pad.dispatchEvent('pointerup', { pointerId: 3, isPrimary: true });
    expect(errors).toEqual([]);
  });
});

test.describe('styles and takes', () => {
  test('a style sets the whole band and mix, as a link, and stays marked until something changes', async ({ page }) => {
    await page.goto('/jam/?mode=advanced');
    const jump = page.getByRole('button', { name: /Jump boogie/ });
    await jump.click();
    await expect(jump).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/key=C&feel=boogie&bpm=150/);
    await expect(page).toHaveURL(/mix=/);
    await expect(page.getByRole('group', { name: 'Fills' }).getByRole('radio', { name: 'Tenor sax' })).toBeChecked();
    await expect(page.locator('[data-strip="lead"] [data-mix-out]')).toHaveText('−3.5 dB');
    // A shared link to it is marked too.
    await page.reload();
    await expect(page.getByRole('button', { name: /Jump boogie/ })).toHaveAttribute('aria-pressed', 'true');
    // Change anything and it's your own band now.
    await page.getByRole('radio', { name: 'G', exact: true }).check();
    await expect(page.getByRole('button', { name: /Jump boogie/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('recording a take starts the band, hands over a file named after the song, and ends with the band', async ({ page }) => {
    await page.goto('/jam/?mode=advanced&feel=boogie&bpm=176&intro=none');
    await page.getByRole('button', { name: 'Record a take' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toHaveAttribute('aria-pressed', 'true');
    // Record starts the band.
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    const take = page.getByRole('link', { name: /Download your take \(0:0[1-4]\)/ });
    await expect(take).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), take.click()]);
    expect(download.suggestedFilename()).toMatch(/^blues-in-e-boogie-176-bpm\.(webm|ogg|m4a)$/);
    expect((await download.path()) && (await import('node:fs')).statSync((await download.path())!).size).toBeGreaterThan(1000);

    // A take that's still recording when the band stops ends a moment later, not in silence.
    await page.getByRole('button', { name: 'Record a take' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Record a take' })).toBeVisible({ timeout: 5_000 });
    await expect(take).toBeVisible();
  });
});

test.describe('the game', () => {
  test('opens as a game: gigs, the stage and the pads, with the advanced controls a switch away', async ({ page }) => {
    await page.goto('/jam/');
    await expect(page.getByRole('heading', { name: 'Play a gig' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open mic/ })).toBeVisible();
    await expect(page.locator('[data-pad]').first()).toBeVisible();
    await expect(page.locator('[data-band="drums"] svg')).toBeVisible();
    for (const hidden of ['The mixer', 'Lead the band', 'Start from a style']) await expect(page.getByRole('heading', { name: hidden })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeHidden();

    const advanced = page.getByRole('switch', { name: 'Advanced controls' });
    await advanced.click();
    await expect(advanced).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('heading', { name: 'The mixer' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Play a gig' })).toBeHidden();
    await expect(page).toHaveURL(/mode=advanced/);
    // A link made with the advanced controls opens with them.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'The mixer' })).toBeVisible();
    await page.getByRole('switch', { name: 'Advanced controls' }).click();
    await expect(page).not.toHaveURL(/mode=/);
  });

  test('a gig: the band calls on the pads, you answer on the keys, each answer is scored, and the crowd decides', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectConsoleErrors(page);
    await page.goto('/jam/?choruses=1');
    // You pick what you play: sax tonight.
    await page.locator('input[name="you-play"][value="sax"]').check();
    await page.getByRole('button', { name: /Saturday, late/ }).click();
    const prompt = page.locator('[data-gig-prompt]');
    const live = page.locator('[data-gig-live]');
    await expect(live).toBeVisible();
    // The pads switched to the gig's instrument.
    await expect(page.locator('input[name="sit-in"][value="sax"]')).toBeChecked();
    await expect(page.locator('[data-gig-name]')).toHaveText('Saturday, late:');
    await expect(page.locator('[data-gig-line]')).toHaveText('line 1 of 3', { timeout: 10_000 });

    // Straight in: no intro, the first call comes right after the count-in.
    await expect(prompt).toHaveText('Listen…', { timeout: 10_000 });
    // The panel and the pads under it are on one screen.
    const viewport = page.viewportSize()!;
    const lastPad = (await page.locator('[data-pad]').last().boundingBox())!;
    expect((await live.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect(lastPad.y + lastPad.height).toBeLessThanOrEqual(viewport.height);

    // The band's on stage, and you lead it: the piano calls on Saturday; tap the guitar to trade with
    // it instead, and the drummer for a fill.
    const act = (part: string) => page.locator(`[data-band-act="${part}"]`);
    // Each chip says what a tap does, and its button's name starts with the chip's words.
    await expect(act('keys')).toHaveAccessibleName(/^Calling: the piano/);
    await expect(act('keys')).toHaveAttribute('data-on', '');
    await expect(act('guitar')).toHaveAccessibleName(/^Call next: the guitar plays the next call$/);
    await expect(act('bass')).toHaveAccessibleName(/^Play alone:/);
    await expect(act('lead')).toHaveAccessibleName(/^You: sax\. You answer on the pads$/);
    await expect(page.locator('[data-band="lead"] [data-band-game-name]')).toHaveText('You');
    await act('guitar').click();
    await expect(act('guitar')).toHaveAccessibleName(/^Calling: the guitar/);
    await expect(act('keys')).toHaveAccessibleName(/^Call next/);
    await expect(page.locator('[data-gig-hint]')).toHaveText('The guitar takes the next call.');
    await expect(act('drums')).toHaveAccessibleName(/^Drum fill:/);
    await act('drums').click();
    await expect(act('drums')).toHaveAccessibleName(/^Fill coming:/);

    // Three turns in a one-chorus gig, the last line too. Answer each with four notes, ending on the 1.
    for (let turn = 0; turn < 3; turn++) {
      await expect(prompt).toHaveText('Listen…', { timeout: 15_000 });
      // The call shows on the pads and on the line as it plays.
      await expect(page.locator('[data-pad][data-call]').first()).toBeAttached({ timeout: 6_000 });
      await expect(page.locator('.gig-note[data-kind="call"]').first()).toBeAttached();
      await expect(prompt).toHaveText('Your turn!', { timeout: 10_000 });
      await expect(live).toHaveAttribute('data-turn', '');
      await expect(page.locator('[data-sit-in]')).toHaveAttribute('data-phase', 'turn');
      for (const key of ['h', 'g', 'd', 'a']) {
        await page.keyboard.down(key);
        await page.waitForTimeout(150);
        await page.keyboard.up(key);
        await page.waitForTimeout(250);
      }
      // Each note is on the line, marked on time or not.
      await expect(page.locator('.gig-note[data-kind="you"]')).toHaveCount(4);
      await expect(page.locator('.gig-note[data-kind="you"][data-hit]')).toHaveCount(4);
      // Scored the moment the turn ends, with the breakdown.
      await expect(page.locator('[data-gig-feedback]')).toHaveText(/^\+\d+/, { timeout: 10_000 });
      await expect(page.locator('[data-part="timing"] [data-part-value]')).toHaveText(/^\d+\/35$/);
      // The drummer's fill played at the end of the first line, and the chip let go.
      if (turn === 0) await expect(act('drums')).toHaveAccessibleName(/^Drum fill:/);
    }
    expect(Number(await page.locator('[data-gig-score]').textContent())).toBeGreaterThan(0);

    // The band takes it home, then the summary: stars, the total, the best answer, what to work on.
    const summary = page.locator('[data-gig-summary]');
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-gig-summary-title]')).toHaveText('That’s the gig');
    await expect(page.locator('[data-gig-stars]')).toHaveAttribute('aria-label', /^[0-3] of 3 stars$/);
    await expect(page.locator('[data-gig-total]')).toContainText('of 300 points');
    await expect(page.locator('[data-gig-best-answer]')).toHaveText(/^Your best answer scored \d+\.$/);
    await expect(page.locator('[data-gig-work-on]')).not.toBeEmpty();
    await expect(page.locator('[data-gig-summary-title]')).toBeFocused();
    // The best is remembered on the gig's card.
    await page.getByRole('button', { name: 'Choose a gig' }).click();
    await expect(page.locator('[data-gig-best="saturday"]')).toContainText('Your best:');
    expect(errors).toEqual([]);
  });

  test('before a gig, tapping a player on stage plays a little of what they do', async ({ page }) => {
    await page.goto('/jam/');
    const guitar = page.locator('[data-band-act="guitar"]');
    await expect(guitar).toHaveAccessibleName('Listen to the guitar');
    await expect(page.getByText('In a gig, tap them to lead the band')).toBeVisible();
    await guitar.click();
    // Lit while it plays, then it lets go.
    await expect(guitar).toHaveAttribute('data-on', '');
    // The drawing plays along: a string lights as it sounds.
    await expect(page.locator('[data-band="guitar"] [data-hot]').first()).toBeAttached({ timeout: 10_000 });
    await expect(guitar).not.toHaveAttribute('data-on', '', { timeout: 10_000 });
    // In advanced mode the drawings are the switches again.
    await page.getByRole('switch', { name: 'Advanced controls' }).click();
    await expect(guitar).toBeHidden();
  });

  test('you can play guitar: the guitar’s spot on stage is you, and the piano calls', async ({ page }) => {
    await page.goto('/jam/?choruses=1');
    await page.locator('input[name="you-play"][value="guitar"]').check();
    await expect(page.locator('[data-band="guitar"] [data-band-game-name]')).toHaveText('You');
    await page.getByRole('button', { name: /Friday night/ }).click();
    await expect(page.locator('input[name="sit-in"][value="guitar"]')).toBeChecked();
    const act = (part: string) => page.locator(`[data-band-act="${part}"]`);
    await expect(act('keys')).toHaveAccessibleName(/^Calling: the piano/);
    await expect(act('guitar')).toHaveAccessibleName(/^You: guitar/);
    // The harp can call you too.
    await expect(act('lead')).toHaveAccessibleName(/^Call next: the harmonica/);
    await act('lead').click();
    await expect(act('lead')).toHaveAccessibleName(/^Calling: the harmonica/);
    await page.getByRole('button', { name: 'Leave the stage' }).click();
    // It's remembered next time.
    await page.reload();
    await expect(page.locator('input[name="you-play"][value="guitar"]')).toBeChecked();
  });

  test('miss three turns and the crowd walks out', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/jam/?choruses=2');
    await page.getByRole('button', { name: /Saturday, late/ }).click();
    // The house starts lukewarm: some seats full, some empty.
    await expect(page.locator('.gig-house .fan[data-state="in"]')).toHaveCount(5);
    await expect(page.locator('[data-gig-feedback]')).toHaveText(/missed your turn/, { timeout: 15_000 });
    // A missed turn, and fans get up and walk out.
    await expect(page.locator('.gig-house .fan[data-state="going"]').first()).toBeAttached();
    await expect(page.locator('.gig-house .fan[data-state="in"]')).toHaveCount(3);
    await expect(page.locator('[data-gig-summary-title]')).toHaveText('They walked out', { timeout: 30_000 });
    await expect(page.locator('[data-gig-total]')).toContainText('walked out after 3 of 6 answers');
    await expect(page.locator('[data-gig-stars]')).toHaveAttribute('aria-label', '0 of 3 stars');
  });

  test('on a phone: the gig, then the pads, then the chart, and a gig fits the panel and the pads on one screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/jam/');
    const y = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
    expect(await y('[data-gig]')).toBeLessThan(await y('[data-pad]'));
    expect(await y('[data-pad]')).toBeLessThan(await y('.jam-chart'));
    await page.getByRole('button', { name: /Open mic/ }).click();
    await expect(page.locator('[data-gig-live]')).toBeVisible();
    // The panel and every pad fit on the screen together.
    const lastPad = (await page.locator('[data-pad]').last().boundingBox())!;
    expect((await page.locator('[data-gig-live]').boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect(lastPad.y + lastPad.height).toBeLessThanOrEqual(667);
    await page.getByRole('button', { name: 'Leave the stage' }).click();
  });

  test('leaving the stage stops the band and goes back to the gigs', async ({ page }) => {
    await page.goto('/jam/?choruses=1');
    await page.getByRole('button', { name: /Open mic/ }).click();
    await expect(page.locator('[data-gig-live]')).toBeVisible();
    await page.getByRole('button', { name: 'Leave the stage' }).click();
    await expect(page.locator('[data-gig-live]')).toBeHidden();
    await expect(page.getByRole('button', { name: /Open mic/ })).toBeVisible();
    await expect(page.locator('[data-gig-summary]')).toBeHidden();
  });
});
