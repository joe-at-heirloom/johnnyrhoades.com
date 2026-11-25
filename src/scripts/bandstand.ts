/*
  The bandstand's moves (ADR 0030). The player hands it each note as it's
  scheduled, with its audio-clock start and end, and calls `frame` with the
  audio clock on every animation frame, so what moves is what you hear.

  - Strings (bass, guitar): the string the note is played on shakes and
    turns red, then rings out (swing in src/lib/bandstand.ts).
  - Drums: the piece that's hit dips and flashes red.
  - Keys: the keys of the chord go down and stay down while it sounds.
  - Harmonica holes and sax keys light while the note sounds.

  With reduced motion nothing shakes or dips; the colors still change.
*/
import { BASS_STRINGS, GUITAR_STRINGS, hit, holeFor, keyFor, stringFor, swing } from '../lib/bandstand';
import { TONES, TONE_LABELS, type JamEvent, type Part, type Song } from '../lib/jam';

type Note = { e: JamEvent; at: number; end: number };
type Str = { el: SVGPathElement; x1: number; y1: number; x2: number; y2: number; nx: number; ny: number };

const RING_S = 0.6; // how long a plucked string or a hit keeps moving

export type Bandstand = {
  setSong(song: Song): void;
  note(e: JamEvent, at: number, end: number): void;
  frame(now: number): void;
  reset(): void;
  /** Put the "Solo" tag on whoever's soloing (the fills, or you), or on nobody. */
  spotlight(part: Part | null): void;
};

export function initBandstand(root: HTMLElement, reduceMotion: boolean): Bandstand {
  const figures = new Map([...root.querySelectorAll<HTMLElement>('[data-band]')].map((el) => [el.dataset.band as Part, el]));
  let notes: Note[] = [];
  let tones: Partial<Record<Part, string>> = {};

  // The visible drawing for each part, refreshed when the tone changes.
  const strings = new Map<Part, Str[]>();
  const holes = new Map<Part, { els: SVGElement[]; lo: number; hi: number; bell: SVGElement | null }>();
  const drums = new Map<string, SVGGElement>();
  const keyEls = new Map<number, SVGRectElement>();
  let keyRange: [number, number] = [48, 76];

  for (const g of root.querySelectorAll<SVGGElement>('[data-drum]')) drums.set(g.dataset.drum!, g);
  const keysGroup = root.querySelector<SVGGElement>('[data-keys]');
  if (keysGroup) {
    keyRange = [Number(keysGroup.dataset.lo), Number(keysGroup.dataset.hi)];
    for (const k of keysGroup.querySelectorAll<SVGRectElement>('[data-key]')) keyEls.set(Number(k.dataset.key), k);
  }

  function visible(part: Part): SVGGElement[] {
    return [...(figures.get(part)?.querySelectorAll<SVGGElement>('[data-tone]') ?? [])].filter((g) => !g.hasAttribute('hidden'));
  }

  function setSong(song: Song) {
    tones = {};
    for (const [part, fig] of figures) {
      const tone = song.parts[part] ?? TONES[part][0];
      tones[part] = tone;
      fig.toggleAttribute('data-off', song.parts[part] === null);
      fig.querySelector('[data-band-toggle]')?.setAttribute('aria-checked', String(song.parts[part] !== null));
      for (const g of fig.querySelectorAll<SVGGElement>('[data-tone]')) g.toggleAttribute('hidden', !g.dataset.tone!.split(' ').includes(tone));
      const label = fig.querySelector('[data-band-tone]');
      if (label) label.textContent = song.parts[part] ? (TONE_LABELS[tone] ?? tone) : 'off';
    }
    for (const part of ['bass', 'guitar'] as const) {
      const els = visible(part).flatMap((g) => [...g.querySelectorAll<SVGPathElement>('[data-string]')]);
      strings.set(
        part,
        els.map((el) => {
          const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((k) => Number(el.dataset[k]));
          const len = Math.hypot(x2! - x1!, y2! - y1!) || 1;
          return { el, x1: x1!, y1: y1!, x2: x2!, y2: y2!, nx: -(y2! - y1!) / len, ny: (x2! - x1!) / len };
        }),
      );
    }
    const group = visible('lead').find((g) => g.hasAttribute('data-holes'));
    if (group)
      holes.set('lead', {
        els: [...group.querySelectorAll<SVGElement>('[data-hole]')],
        lo: Number(group.dataset.lo),
        hi: Number(group.dataset.hi),
        bell: group.querySelector('[data-bell]'),
      });
    reset();
  }

  function note(e: JamEvent, at: number, end: number) {
    if (figures.has(e.part)) notes.push({ e, at, end });
  }

  function drawString(s: Str, amp: number) {
    // A quadratic curve peaks at half its control point's offset, so double it.
    const mx = (s.x1 + s.x2) / 2 + s.nx * amp * 2;
    const my = (s.y1 + s.y2) / 2 + s.ny * amp * 2;
    s.el.setAttribute('d', amp === 0 ? `M${s.x1} ${s.y1} L${s.x2} ${s.y2}` : `M${s.x1} ${s.y1} Q${mx.toFixed(2)} ${my.toFixed(2)} ${s.x2} ${s.y2}`);
  }

  function frame(now: number) {
    notes = notes.filter((n) => now < Math.max(n.end, n.at + RING_S));
    const sounding = notes.filter((n) => n.at <= now);

    // Strings: each shows its latest note.
    for (const part of ['bass', 'guitar'] as const) {
      const open = part === 'bass' ? BASS_STRINGS : GUITAR_STRINGS;
      const strs = strings.get(part) ?? [];
      const latest = new Map<number, Note>();
      for (const n of sounding) if (n.e.part === part && n.e.midi !== undefined) latest.set(Math.min(strs.length - 1, stringFor(n.e.midi, open)), n);
      strs.forEach((s, i) => {
        const n = latest.get(i);
        const t = n ? now - n.at : Infinity;
        drawString(s, n && !reduceMotion ? swing(t, n.e.gain, part === 'bass' ? 3 : 2.2) : 0);
        s.el.toggleAttribute('data-hot', t < 0.25);
      });
    }

    // Drums: the piece dips (and flashes) on its hit.
    for (const [piece, g] of drums) {
      let k = 0;
      for (const n of sounding) if (n.e.drum === piece) k = Math.max(k, hit(now - n.at, n.e.gain));
      g.toggleAttribute('data-hot', k > 0);
      if (!reduceMotion) g.setAttribute('transform', k > 0 ? `translate(0 ${(k * 2.5).toFixed(2)})` : '');
    }

    // Keys: down while the chord sounds.
    const down = new Set<number>();
    for (const n of sounding) if (n.e.part === 'keys' && n.e.midi !== undefined && now < n.end) down.add(keyFor(n.e.midi, ...keyRange));
    for (const [midi, el] of keyEls) el.toggleAttribute('data-down', down.has(midi));

    // Harmonica holes and sax keys: lit while the note sounds.
    const h = holes.get('lead');
    if (h) {
      const lit = new Set<number>();
      for (const n of sounding) if (n.e.part === 'lead' && n.e.midi !== undefined && now < n.end) lit.add(holeFor(n.e.midi, h.lo, h.hi, h.els.length));
      h.els.forEach((el, i) => el.toggleAttribute('data-hot', lit.has(i)));
      h.bell?.toggleAttribute('data-hot', lit.size > 0);
    }
  }

  function reset() {
    notes = [];
    for (const strs of strings.values()) for (const s of strs) {
      drawString(s, 0);
      s.el.removeAttribute('data-hot');
    }
    for (const g of drums.values()) {
      g.removeAttribute('data-hot');
      g.setAttribute('transform', '');
    }
    for (const el of keyEls.values()) el.removeAttribute('data-down');
    for (const h of holes.values()) {
      h.els.forEach((el) => el.removeAttribute('data-hot'));
      h.bell?.removeAttribute('data-hot');
    }
  }

  let lit: Part | null = null;
  function spotlight(part: Part | null) {
    if (part === lit) return;
    lit = part;
    for (const [p, fig] of figures) fig.toggleAttribute('data-spotlight', p === part);
  }

  return { setSong, note, frame, reset, spotlight };
}
