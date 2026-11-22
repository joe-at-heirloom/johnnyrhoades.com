/*
  The blues maker's player (/jam/, ADR 0030).

  The form holds the song (key, feel, tempo, form, and a tone for each part)
  and mirrors it into the address bar, so a song is a link. Play loads only
  the sounds the song uses, then schedules the 12-bar a bar at a time, a
  little ahead of the clock, the usual Web Audio way: what each bar holds
  comes from barEvents in src/lib/jam.ts. A change takes effect at the next
  bar. The chart of the 12 bars marks the bar that's playing.
*/
import { onsetIndex } from '../lib/audio-analysis';
import {
  PARTS,
  barEvents,
  chordName,
  drumSampleId,
  FEEL_INFO,
  parseSong,
  pickSample,
  secondsPerBeat,
  songToParams,
  type JamEvent,
  type MeasuredSound,
  type Part,
  type Song,
} from '../lib/jam';
import { track } from './track';

type Sound = MeasuredSound & { url: string };
type Loaded = { buffer: AudioBuffer; offset: number };

const playingText = (s: Song) => `Playing a ${FEEL_INFO[s.feel].label.toLowerCase()} in ${s.key}, ${s.bpm} bpm.`;

const LOOKAHEAD_S = 0.3; // schedule a bar once its downbeat is this close
const TICK_MS = 50;
const RELEASE_S = 0.06;
const LEVEL: Record<Part, number> = { drums: 0.8, bass: 0.95, guitar: 0.5, keys: 0.32, lead: 0.42, room: 0.3 };
const SEND: Record<Part, number> = { drums: 0.08, bass: 0, guitar: 0.18, keys: 0.22, lead: 0.25, room: 0 };

export function initJam(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-jam-form]');
  const play = root.querySelector<HTMLButtonElement>('[data-jam-play]');
  const status = root.querySelector<HTMLElement>('[data-jam-status]');
  const tempo = root.querySelector<HTMLInputElement>('[data-jam-tempo]');
  const tempoOut = root.querySelector<HTMLOutputElement>('[data-jam-tempo-out]');
  const cells = [...root.querySelectorAll<HTMLElement>('[data-jam-bar]')];
  const dataEl = document.getElementById('jam-sounds');
  if (!form || !play || !tempo || !dataEl) return;
  const sounds: Sound[] = JSON.parse(dataEl.textContent ?? '[]');
  const byId = new Map(sounds.map((s) => [s.id, s]));

  /* ---------- The song, in the form and the address bar ---------- */

  const readForm = (): Song => parseSong(new URLSearchParams(new FormData(form) as unknown as Record<string, string>));
  let song = parseSong(new URLSearchParams(location.search));

  function writeForm(s: Song) {
    for (const [name, value] of songToParams(s)) {
      if (name === 'change') {
        const box = form!.elements.namedItem('change');
        if (box instanceof HTMLInputElement) box.checked = value === 'quick';
        continue;
      }
      const field = form!.elements.namedItem(name);
      if (field instanceof RadioNodeList) field.value = value;
      else if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = value;
    }
    const info = FEEL_INFO[s.feel];
    tempo!.min = String(info.min);
    tempo!.max = String(info.max);
    tempo!.value = String(s.bpm);
    if (tempoOut) tempoOut.value = `${s.bpm} bpm`;
    cells.forEach((cell, i) => {
      const name = cell.querySelector('[data-jam-chord]');
      if (name) name.textContent = chordName(s, i);
    });
  }
  writeForm(song);

  form.addEventListener('change', (e) => {
    const before = song;
    song = readForm();
    // A new feel starts at its own natural tempo.
    if ((e.target as HTMLInputElement).name === 'feel' && song.feel !== before.feel) song = { ...song, bpm: FEEL_INFO[song.feel].bpm };
    writeForm(song);
    history.replaceState(null, '', `?${songToParams(song)}`);
    if (playing) {
      if (status) status.textContent = playingText(song);
      void load(song);
      if (song.parts.room !== before.parts.room) startRoom();
    }
  });
  tempo.addEventListener('input', () => {
    if (tempoOut) tempoOut.value = `${tempo.value} bpm`;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void toggle();
  });

  /* ---------- Sound ---------- */

  let ctx: AudioContext | null = null;
  const bus = new Map<Part, GainNode>();
  const loaded = new Map<string, Promise<Loaded | null>>();
  const ready = new Map<string, Loaded>();
  let master: GainNode | null = null;
  let session: GainNode | null = null; // everything one Play schedules goes through this, so Stop can fade it all

  function initAudio(): AudioContext | null {
    if (ctx) return ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const audio = new AC();
    master = audio.createGain();
    master.gain.value = 0.9;
    const glue = audio.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.2;
    master.connect(glue).connect(audio.destination);

    // A little room, shared by the parts that want it.
    const room = audio.createConvolver();
    const len = Math.floor(audio.sampleRate * 1.4);
    const ir = audio.createBuffer(2, len, audio.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    room.buffer = ir;
    const wet = audio.createGain();
    wet.gain.value = 0.5;
    room.connect(wet).connect(master);
    reverb = room;
    ctx = audio;
    return audio;
  }

  let reverb: ConvolverNode | null = null;

  /** A fresh set of part buses for one Play. */
  function openSession(audio: AudioContext) {
    session = audio.createGain();
    session.connect(master!);
    for (const part of PARTS) {
      const g = audio.createGain();
      g.gain.value = LEVEL[part];
      g.connect(session);
      if (SEND[part] && reverb) {
        const send = audio.createGain();
        send.gain.value = SEND[part];
        g.connect(send).connect(reverb);
      }
      bus.set(part, g);
    }
  }

  /** Fade out everything a Play scheduled, including notes already queued for the coming bar. */
  function closeSession() {
    if (!ctx || !session) return;
    const old = session;
    const olds = [...bus.values()];
    const t = ctx.currentTime;
    old.gain.setValueAtTime(old.gain.value, t);
    old.gain.linearRampToValueAtTime(0, t + 0.15);
    for (const g of olds) {
      // the reverb send bypasses the session gain, so cut the buses too
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.15);
    }
    window.setTimeout(() => {
      old.disconnect();
      olds.forEach((g) => g.disconnect());
    }, 300);
    session = null;
  }

  function loadSound(id: string): Promise<Loaded | null> {
    let p = loaded.get(id);
    if (!p) {
      const s = byId.get(id);
      p = !s || !ctx
        ? Promise.resolve(null)
        : fetch(s.url)
            .then((r) => r.arrayBuffer())
            .then((data) => ctx!.decodeAudioData(data))
            .then((buffer) => {
              const got = { buffer, offset: s.loop ? 0 : onsetIndex(buffer.getChannelData(0), buffer.sampleRate) / buffer.sampleRate };
              ready.set(id, got);
              return got;
            })
            .catch(() => null);
      loaded.set(id, p);
    }
    return p;
  }

  /** The one sample an event plays, and the rate that tunes it. */
  function sampleFor(e: JamEvent, s: Song): { id: string; rate: number } | null {
    const tone = s.parts[e.part];
    if (!tone) return null;
    if (e.drum) return { id: drumSampleId(tone, e.drum), rate: 1 };
    const picked = pickSample(
      sounds.filter((x) => x.part === e.part && x.tone === tone),
      e.midi ?? 60,
    );
    return picked && { id: picked.sound.id, rate: picked.rate };
  }

  /** Only what this song plays, in its key and feel: a dozen or two samples, not the whole library. */
  const load = (s: Song) => {
    const ids = new Set<string>();
    for (let bar = 0; bar < 12; bar++) for (const e of barEvents(s, bar)) ids.add(sampleFor(e, s)?.id ?? '');
    if (s.parts.room) ids.add(`room-${s.parts.room}`);
    ids.delete('');
    return Promise.all([...ids].map(loadSound));
  };

  /** Play one event at audio time `when`. */
  function voice(e: JamEvent, when: number, spb: number) {
    if (!ctx) return;
    const sample = sampleFor(e, song);
    if (!sample) return;
    const { id, rate } = sample;
    const got = ready.get(id); // never wait on a fetch mid-song: a tone still loading just sits out
    const out = bus.get(e.part);
    if (!got || !out) return;
    const src = ctx.createBufferSource();
    src.buffer = got.buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const end = when + e.beats * spb;
    g.gain.setValueAtTime(e.gain, when);
    g.gain.setValueAtTime(e.gain, end);
    g.gain.linearRampToValueAtTime(0, end + RELEASE_S);
    src.connect(g).connect(out);
    src.start(Math.max(when, ctx.currentTime), got.offset);
    src.stop(end + RELEASE_S + 0.01);
  }

  let roomSrc: AudioBufferSourceNode | null = null;
  async function startRoom() {
    roomSrc?.stop((ctx?.currentTime ?? 0) + 0.05);
    roomSrc = null;
    const tone = song.parts.room;
    if (!tone || !ctx || !playing) return;
    const got = await loadSound(`room-${tone}`);
    if (!got || !ctx || !playing || song.parts.room !== tone) return;
    const src = ctx.createBufferSource();
    src.buffer = got.buffer;
    src.loop = true;
    const out = bus.get('room');
    if (!out) return;
    src.connect(out);
    src.start();
    roomSrc = src;
  }

  /* ---------- The clock ---------- */

  let playing = false;
  let timer = 0;
  let bar = 0;
  let nextBarAt = 0;
  const marks: number[] = [];

  function schedule() {
    if (!ctx || !playing) return;
    while (nextBarAt < ctx.currentTime + LOOKAHEAD_S) {
      const spb = secondsPerBeat(song.bpm);
      for (const e of barEvents(song, bar)) voice(e, nextBarAt + e.at * spb, spb);
      marks.push(window.setTimeout(highlight, Math.max(0, (nextBarAt - ctx.currentTime) * 1000), bar));
      nextBarAt += 4 * spb;
      bar = (bar + 1) % 12;
    }
  }

  function highlight(i: number | null) {
    cells.forEach((cell, n) => {
      if (n === i) cell.setAttribute('aria-current', 'true');
      else cell.removeAttribute('aria-current');
    });
  }

  async function toggle() {
    if (playing) return stop();
    const audio = initAudio();
    if (!audio) {
      if (status) status.textContent = 'This browser can’t play sound.';
      return;
    }
    if (audio.state === 'suspended') await audio.resume();
    play!.disabled = true;
    if (status) status.textContent = 'Getting the band together…';
    await load(song);
    play!.disabled = false;
    playing = true;
    openSession(audio);
    play!.textContent = 'Stop';
    play!.setAttribute('aria-pressed', 'true');
    if (status) status.textContent = playingText(song);
    bar = 0;
    nextBarAt = audio.currentTime + 0.1;
    schedule();
    timer = window.setInterval(schedule, TICK_MS);
    void startRoom();
    track('jam_play', { feel: song.feel, key: song.key });
  }

  function stop() {
    playing = false;
    window.clearInterval(timer);
    marks.splice(0).forEach((t) => window.clearTimeout(t));
    closeSession();
    const room = roomSrc;
    roomSrc = null;
    if (room && ctx) room.stop(ctx.currentTime + 0.2);
    highlight(null);
    play!.textContent = 'Play';
    play!.setAttribute('aria-pressed', 'false');
    if (status) status.textContent = 'Stopped.';
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) stop();
  });
}
