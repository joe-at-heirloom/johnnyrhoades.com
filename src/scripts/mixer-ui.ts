/*
  The mixer's controls (ADR 0030). Reads and writes the mix (src/lib/mixer.ts)
  and calls back on every move: `live` while a control is moving, so the
  sound follows the hand, and not live when the move ends, so the player can
  write the link and rebuild the reverb once.

  Meters show each strip's peak, with a peak-hold line that falls back slowly.
*/
import { PARTS, type Part } from '../lib/jam';
import { DEFAULT_MIX, cloneMix, faderText, meterLevel, type Mix } from '../lib/mixer';

type Key = Part | 'master';
const PEAK_HOLD_S = 1.2;
const CLIP = meterLevel(1); // 0 dBFS on the meter
const PEAK_FALL_PER_S = 0.5; // of the meter's height

export type MixerUI = {
  setMix(mix: Mix): void;
  setMeters(levels: Partial<Record<Key, number>>, now: number): void;
  /** Dim the strips of parts the song has switched off. */
  setPartsOn(on: (part: Part) => boolean): void;
};

export function initMixerUI(root: HTMLElement, initial: Mix, onChange: (mix: Mix, live: boolean) => void): MixerUI {
  let mix = cloneMix(initial);
  const strips = new Map([...root.querySelectorAll<HTMLElement>('[data-strip]')].map((el) => [el.dataset.strip as Key, el]));
  const peaks = new Map<Key, { level: number; at: number }>();

  const value = (key: Key, control: string): number | boolean => {
    if (key === 'master') return mix.master[control as keyof Mix['master']];
    return mix.strips[key][control as keyof Mix['strips'][Part]];
  };
  const defaultOf = (key: Key, control: string) =>
    (key === 'master' ? DEFAULT_MIX.master[control as keyof Mix['master']] : DEFAULT_MIX.strips[key][control as keyof Mix['strips'][Part]]) as number;
  const set = (m: Mix, key: Key, control: string, v: number | boolean) => {
    if (key === 'master') (m.master as Record<string, number>)[control] = v as number;
    else (m.strips[key] as Record<string, number | boolean>)[control] = v;
  };

  function draw() {
    for (const [key, el] of strips) {
      for (const input of el.querySelectorAll<HTMLInputElement>('input[data-mix]')) {
        const v = value(key, input.dataset.mix!) as number;
        input.value = String(v);
        const knob = input.closest<HTMLElement>('.knob');
        if (knob) knob.style.setProperty('--turn', String((v - Number(input.min)) / (Number(input.max) - Number(input.min))));
        if (input.dataset.mix === 'db') {
          input.setAttribute('aria-valuetext', faderText(v));
          const out = el.querySelector('[data-mix-out]');
          if (out) out.textContent = faderText(v);
        }
      }
      for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-mix]')) b.setAttribute('aria-pressed', String(value(key, b.dataset.mix!)));
    }
    // A strip that can't be heard because something else is soloed reads as quiet.
    const anySolo = PARTS.some((p) => mix.strips[p].solo);
    for (const p of PARTS) strips.get(p)?.toggleAttribute('data-silenced', mix.strips[p].mute || (anySolo && !mix.strips[p].solo));
  }

  function change(live: boolean) {
    draw();
    onChange(cloneMix(mix), live);
  }

  for (const [key, el] of strips) {
    for (const input of el.querySelectorAll<HTMLInputElement>('input[data-mix]')) {
      const control = input.dataset.mix!;
      input.addEventListener('input', () => {
        set(mix, key, control, Number(input.value));
        change(true);
      });
      input.addEventListener('change', () => change(false));
      // Double-click puts a control back where it started.
      input.addEventListener('dblclick', () => {
        set(mix, key, control, defaultOf(key, control));
        change(false);
      });
    }
    for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-mix]')) {
      b.addEventListener('click', () => {
        set(mix, key, b.dataset.mix!, !value(key, b.dataset.mix!));
        change(false);
      });
    }
  }
  root.querySelector('[data-mix-reset]')?.addEventListener('click', () => {
    mix = cloneMix(DEFAULT_MIX);
    change(false);
  });

  function setMeters(levels: Partial<Record<Key, number>>, now: number) {
    for (const [key, el] of strips) {
      const level = levels[key] ?? 0;
      el.querySelector<HTMLElement>('[data-meter]')?.style.setProperty('transform', `scaleY(${level.toFixed(3)})`);
      // The peak line holds a moment, then falls.
      let peak = peaks.get(key) ?? { level: 0, at: now };
      if (level >= peak.level) peak = { level, at: now };
      else if (now - peak.at > PEAK_HOLD_S) peak = { level: Math.max(level, peak.level - PEAK_FALL_PER_S * (now - peak.at - PEAK_HOLD_S)), at: peak.at };
      peaks.set(key, peak);
      el.querySelector<HTMLElement>('[data-meter-peak]')?.style.setProperty('bottom', `${(peak.level * 100).toFixed(1)}%`);
      el.querySelector<HTMLElement>('[data-meter-peak]')?.toggleAttribute('data-hot', peak.level > CLIP); // past 0 dBFS
      el.querySelector<HTMLElement>('[data-meter-peak]')?.toggleAttribute('data-on', peak.level > 0);
    }
  }

  function setPartsOn(on: (part: Part) => boolean) {
    for (const p of PARTS) strips.get(p)?.toggleAttribute('data-off', !on(p));
  }

  draw();
  return {
    setMix(m) {
      mix = cloneMix(m);
      draw();
    },
    setMeters,
    setPartsOn,
  };
}
