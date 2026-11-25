/*
  The blues maker's player (/jam/, ADR 0030).

  The form holds the song (key, feel, tempo, form, intro, and a tone for each
  part) and mirrors it, with the mix, into the address bar, so a song is a
  link. Play loads only the sounds the song uses, counts it in, and schedules
  the band a bar at a time, a little ahead of the clock, the usual Web Audio
  way. What each bar holds comes from barEvents in src/lib/jam.ts, for the
  kind of chorus it's in: the band's own choice (autoSection), or the one
  the visitor calls. "Take it home" plays the ending and stops.

  Around it: the stage (bandstand.ts), the console (console.ts and
  mixer-ui.ts), sitting in (sit-in.ts), recording a take (recorder.ts) and
  the styles (src/lib/styles.ts).
*/
import { onsetIndex } from '../lib/audio-analysis';
import {
  SECTIONS,
  SECTION_LABELS,
  TONES,
  autoSection,
  barEvents,
  COUNT_IN,
  humanize,
  RELEASE,
  chordName,
  degreeName,
  drumSampleId,
  FEEL_INFO,
  parseSong,
  pickSample,
  secondsPerBeat,
  songToParams,
  startBar,
  type JamEvent,
  type MeasuredSound,
  type Part,
  type Section,
  type Song,
} from '../lib/jam';
import { cloneMix, parseMix, mixToParam, type Mix } from '../lib/mixer';
import type { Style } from '../lib/styles';
import { initBandstand } from './bandstand';
import { createDesk, type Desk } from './console';
import { initMixerUI } from './mixer-ui';
import { initRecorder } from './recorder';
import { initSitIn } from './sit-in';
import { prefersReducedMotion } from './dom';
import { track } from './track';

type Sound = MeasuredSound & { url: string };
type Loaded = { buffer: AudioBuffer; offset: number };

const playingText = (s: Song) => `Playing a ${FEEL_INFO[s.feel].label.toLowerCase()} in ${s.key}, ${s.bpm} bpm.`;

/** A drummer counts in by clicking sticks; the closed hi-hat is the nearest thing in the kit. */
const COUNT_IN_SOUND = 'sticks-hat';
const LIGHT_S = 0.09; // how long a part's drawing stays marked for a note

const LOOKAHEAD_S = 0.3; // schedule a bar once its downbeat is this close
const TICK_MS = 50;
const ATTACK_S = 0.004; // every note fades in this fast, so none clicks
const SCOOP_S = 0.09; // how long a scooped note takes to slide up to pitch
const METER_TAIL_S = 3; // the meters keep reading this long after Stop, while the reverb rings out
const LAST_CHORD_RING_S = 3; // after the last chord of an ending, how long before the band is done
const LAY_OUT_BARS = 2; // the fills stay out this long after you play a note

export function initJam(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-jam-form]');
  const play = root.querySelector<HTMLButtonElement>('[data-jam-play]');
  const status = root.querySelector<HTMLElement>('[data-jam-status]');
  const tempo = root.querySelector<HTMLInputElement>('[data-jam-tempo]');
  const tempoOut = root.querySelector<HTMLOutputElement>('[data-jam-tempo-out]');
  const leaderNow = root.querySelector<HTMLElement>('[data-leader-now]');
  const cueButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-cue]')];
  const styleButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-style]')];
  const cells = [...root.querySelectorAll<HTMLElement>('[data-jam-bar]')];
  const dataEl = document.getElementById('jam-sounds');
  const stylesEl = document.getElementById('jam-styles');
  const lights = new Map([...root.querySelectorAll<HTMLElement>('[data-jam-light]')].map((el) => [el.dataset.jamLight as Part, el]));
  const band = initBandstand(root, prefersReducedMotion());
  if (!form || !play || !tempo || !dataEl) return;
  const sounds: Sound[] = JSON.parse(dataEl.textContent ?? '[]');
  const styles: Style[] = JSON.parse(stylesEl?.textContent ?? '[]');
  const byId = new Map(sounds.map((s) => [s.id, s]));

  /* ---------- The song and the mix, in the form and the address bar ---------- */

  const readForm = (): Song => parseSong(new URLSearchParams(new FormData(form) as unknown as Record<string, string>));
  let song = parseSong(new URLSearchParams(location.search));
  let mix: Mix = parseMix(new URLSearchParams(location.search).get('mix'));
  let desk: Desk | null = null;

  /** The song and, when it isn't the default, the mix: the link to what's playing. */
  const link = (s: Song, m: Mix) => {
    const params = songToParams(s);
    const p = mixToParam(m);
    if (p) params.set('mix', p);
    return params.toString();
  };
  const writeUrl = () => {
    history.replaceState(null, '', `?${link(song, mix)}`);
    // A style stays marked only while the song and mix are still exactly it.
    const here = link(song, mix);
    for (const b of styleButtons) {
      const st = styles.find((x) => x.id === b.dataset.style);
      b.setAttribute('aria-pressed', String(!!st && link(st.song, st.mix) === here));
    }
  };

  const mixer = initMixerUI(root, mix, (m, live) => {
    mix = m;
    desk?.apply(m);
    if (!live) {
      desk?.setRoom(m.master.room);
      writeUrl();
    }
  });

  function writeForm(s: Song) {
    for (const [name, value] of songToParams(s)) {
      if (name === 'change') {
        const box = form!.querySelector<HTMLInputElement>('input[type="checkbox"][name="change"]');
        if (box) box.checked = value === 'quick';
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
      const degree = cell.querySelector('[data-jam-degree]');
      if (degree) degree.textContent = degreeName(s, i);
    });
    band.setSong(s);
    mixer.setPartsOn((part) => s.parts[part] !== null);
    sitIn?.setKey(s.key);
  }

  /** The song changed (the form, a switch, a style): show it, link it, and if the band is playing, bring it in at the next bar. */
  function songChanged(before: Song) {
    writeForm(song);
    writeUrl();
    if (playing) {
      if (status) status.textContent = playingText(song);
      if (!blink) setLights((part) => song.parts[part] !== null);
      void load(song);
      if (song.parts.room !== before.parts.room) void startRoom();
    }
  }

  form.addEventListener('change', (e) => {
    const before = song;
    song = readForm();
    // A new feel starts at its own natural tempo.
    if ((e.target as HTMLInputElement).name === 'feel' && song.feel !== before.feel) song = { ...song, bpm: FEEL_INFO[song.feel].bpm };
    songChanged(before);
  });
  // Each instrument's switch brings it in or sits it out. Bringing it back picks up the tone it had.
  const lastTone = new Map<Part, string>();
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-band-toggle]')) {
    button.addEventListener('click', () => {
      const part = button.dataset.bandToggle as Part;
      const current = song.parts[part];
      if (current) lastTone.set(part, current);
      const next = current ? 'off' : (lastTone.get(part) ?? TONES[part][0]);
      const radio = form.querySelector<HTMLInputElement>(`input[name="${part}"][value="${next}"]`);
      if (!radio) return;
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  // The drawing is a bigger target for the same switch.
  for (const art of root.querySelectorAll<HTMLElement>('[data-band-art]')) {
    art.addEventListener('click', () => root.querySelector<HTMLButtonElement>(`[data-band-toggle="${art.dataset.bandArt}"]`)?.click());
  }
  tempo.addEventListener('input', () => {
    if (tempoOut) tempoOut.value = `${tempo.value} bpm`;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void toggle();
  });

  // Styles: a whole band and mix in one click, as if you'd followed its link.
  for (const b of styleButtons) {
    b.addEventListener('click', () => {
      const st = styles.find((x) => x.id === b.dataset.style);
      if (!st) return;
      const before = song;
      song = { ...st.song, parts: { ...st.song.parts } };
      mix = cloneMix(st.mix);
      mixer.setMix(mix);
      desk?.apply(mix);
      desk?.setRoom(mix.master.room);
      songChanged(before);
      track('jam_style', { style: st.id });
    });
  }

  /* ---------- Sound ---------- */

  let ctx: AudioContext | null = null;
  const loaded = new Map<string, Promise<Loaded | null>>();
  const ready = new Map<string, Loaded>();

  function initAudio(): AudioContext | null {
    if (ctx) return ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    desk = createDesk(ctx, mix);
    return ctx;
  }
  /** The audio, started and awake. Only call it from a click, a tap or a key. */
  async function ensureAudio(): Promise<AudioContext | null> {
    const audio = initAudio();
    if (audio?.state === 'suspended') await audio.resume();
    return audio;
  }

  function loadSound(id: string): Promise<Loaded | null> {
    if (!ctx) return Promise.resolve(null); // nothing to decode into yet; try again once the audio starts
    let p = loaded.get(id);
    if (!p) {
      const s = byId.get(id);
      const audio = ctx;
      p = !s
        ? Promise.resolve(null)
        : fetch(s.url)
            .then((r) => r.arrayBuffer())
            .then((data) => audio.decodeAudioData(data))
            .then((buffer) => {
              const got = { buffer, offset: s.loop ? 0 : onsetIndex(buffer.getChannelData(0), buffer.sampleRate) / buffer.sampleRate };
              ready.set(id, got);
              return got;
            })
            .catch(() => {
              loaded.delete(id);
              return null;
            });
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

  /** Only what this song can play, in its key and feel, in any kind of chorus: a few dozen samples, not the library. */
  const load = (s: Song) => {
    const ids = new Set<string>();
    for (const section of SECTIONS) for (let bar = 0; bar < 24; bar++) for (const e of barEvents(s, bar, section)) ids.add(sampleFor(e, s)?.id ?? '');
    if (s.parts.room) ids.add(`room-${s.parts.room}`);
    ids.add(COUNT_IN_SOUND);
    ids.delete('');
    return Promise.all([...ids].map(loadSound));
  };

  /** Play one event at audio time `when`. */
  function voice(e: JamEvent, when: number, spb: number, gainScale = 1, forced?: { id: string; rate: number }) {
    if (!ctx) return;
    const sample = forced ?? sampleFor(e, song);
    if (!sample) return;
    const { id, rate } = sample;
    const got = ready.get(id); // never wait on a fetch mid-song: a tone still loading just sits out
    const out = desk?.input(e.part);
    if (!got || !out) return;
    const src = ctx.createBufferSource();
    src.buffer = got.buffer;
    const start = Math.max(when, ctx.currentTime);
    // A scoop starts flat and slides up to the note.
    if (e.bend) {
      src.playbackRate.setValueAtTime(rate * Math.pow(2, e.bend / 12), start);
      src.playbackRate.linearRampToValueAtTime(rate, start + SCOOP_S);
    } else src.playbackRate.value = rate;
    const g = ctx.createGain();
    const end = when + e.beats * spb;
    const level = Math.min(1, e.gain * gainScale);
    // A quick fade in, then the note's length, then it lets go on its own curve and rings into the
    // next one (RELEASE in src/lib/jam.ts). Drums don't let go early: each hit plays out.
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(level, start + ATTACK_S);
    src.connect(g).connect(out);
    src.start(start, got.offset);
    const tau = RELEASE[e.part];
    if (tau > 0) {
      g.gain.setValueAtTime(level, Math.max(end, start + ATTACK_S));
      g.gain.setTargetAtTime(0, Math.max(end, start + ATTACK_S), tau);
      src.stop(Math.max(end, start) + tau * 6);
    }
    flashes.push({ at: when, part: e.part });
    band.note(e, when, end);
  }

  /* ---------- Sitting in, and recording a take ---------- */

  const sitIn = initSitIn(root, {
    audio: ensureAudio,
    liveInput: (part) => desk?.liveInput(part) ?? null,
    load: loadSound,
    sounds,
    key: () => song.key,
    show: (e, at, end) => {
      band.note(e, at, end);
      if (!playing) requestAnimationFrame(sitInFrame);
    },
  });
  initRecorder(root, {
    stream: async () => ((await ensureAudio()) && desk ? desk.recordStream() : null),
    name: () => `blues-in-${song.key.toLowerCase()}-${song.feel}-${song.bpm}-bpm`,
  });
  writeForm(song);
  writeUrl();

  /* ---------- The meters ---------- */

  // The meters run while the band plays and a few seconds after, so you can watch the reverb ring out.
  let metersUntil = 0;
  let metering = false;
  function meterLoop() {
    if (!ctx || !desk) return;
    const now = ctx.currentTime;
    if (now > metersUntil && now - sitIn.lastPlayed() > METER_TAIL_S) {
      metering = false;
      mixer.setMeters({}, now);
      return;
    }
    metering = true;
    mixer.setMeters(desk.meters(), now);
    requestAnimationFrame(meterLoop);
  }
  // Sitting in while the band is stopped still moves the meters and the drawing.
  function sitInFrame() {
    if (!ctx || playing) return;
    if (!metering) meterLoop();
    band.frame(ctx.currentTime);
    band.spotlight(sitIn.playingPart());
    if (ctx.currentTime - sitIn.lastPlayed() < 1 || sitIn.playingPart()) requestAnimationFrame(sitInFrame);
    else band.spotlight(null);
  }

  /* ---------- The bandstand ---------- */

  // Each instrument plays along (src/scripts/bandstand.ts), and its drawing is marked on while it
  // sounds, both read off the audio clock so they're in time with what you hear. With reduced
  // motion nothing moves, and a playing part's drawing just stays marked.
  const blink = !prefersReducedMotion();
  const flashes: { at: number; part: Part }[] = [];
  const offAt = new Map<Part, number>();
  let frame = 0;
  let soloing = false; // whether the fills have the spotlight in the chorus that's sounding

  function setLights(state: (part: Part) => boolean) {
    for (const [part, el] of lights) el.toggleAttribute('data-on', state(part));
  }

  function drawLights() {
    if (!ctx || !playing) return;
    const now = ctx.currentTime;
    for (let i = flashes.length - 1; i >= 0; i--) {
      if (flashes[i]!.at > now) continue;
      offAt.set(flashes[i]!.part, flashes[i]!.at + LIGHT_S);
      flashes.splice(i, 1);
    }
    if (blink) setLights((part) => (part === 'room' ? song.parts.room !== null : (offAt.get(part) ?? 0) > now));
    band.frame(now);
    // The spotlight: whoever's soloing, and you, the moment you play.
    band.spotlight(sitIn.playingPart() ?? (now - sitIn.lastPlayed() < 1 ? null : soloing && song.parts.lead ? 'lead' : null));
    frame = requestAnimationFrame(drawLights);
    if (!metering) meterLoop();
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
    const out = desk?.input('room');
    if (!out) return;
    src.connect(out);
    src.start();
    roomSrc = src;
  }

  /* ---------- Leading the band ---------- */

  // What each chorus will be: the visitor's call where they've made one, the band's own otherwise.
  const calls = new Map<number, Section>();
  let homeChorus: number | null = null; // the chorus that ends with the ending, once "Take it home" is called
  let introChorus = -1; // chorus 0 is just the intro's four bars when the song starts on the turnaround

  const sectionOf = (chorus: number, inForm: number): Section =>
    homeChorus === chorus && inForm >= 10 ? 'ending' : (calls.get(chorus) ?? autoSection(chorus));
  /** The chorus after the one sounding (during the count-in, after the first): where a call lands. */
  const nextChorus = () => Math.max(soundingChorus + 1, Math.ceil(bar / 12));
  const chorusName = (c: number) => (c === introChorus ? 'The intro' : `Chorus ${c - (introChorus === 0 ? 0 : -1)}`);

  function showLeader(sounding: number) {
    const next = nextChorus();
    const kind = calls.get(next) ?? autoSection(next);
    const whose = calls.has(next) ? 'your call' : 'the band’s call';
    for (const b of cueButtons) {
      const cue = b.dataset.cue as Section;
      b.disabled = !playing;
      b.setAttribute('aria-pressed', String(cue === 'ending' ? homeChorus !== null : calls.get(next) === cue));
    }
    if (!leaderNow) return;
    if (!playing) return;
    const now = sounding === introChorus ? 'The intro.' : `${chorusName(sounding)}: ${SECTION_LABELS[sectionOf(sounding, 0)].toLowerCase()}.`;
    leaderNow.textContent =
      homeChorus !== null ? `${now} Taking it home at the end of ${homeChorus === sounding ? 'this' : 'the next'} chorus.` : `${now} Next: ${SECTION_LABELS[kind].toLowerCase()} (${whose}).`;
  }

  for (const b of cueButtons) {
    b.addEventListener('click', () => {
      if (!playing) return;
      const cue = b.dataset.cue as Section;
      if (cue === 'ending') {
        // The ending lands in bars 11 and 12: this chorus if the band hasn't got that far, else the next.
        homeChorus = homeChorus !== null ? null : bar % 12 <= 10 ? Math.floor(bar / 12) : Math.floor(bar / 12) + 1;
      } else {
        const next = nextChorus();
        if (calls.get(next) === cue) calls.delete(next);
        else calls.set(next, cue);
      }
      showLeader(soundingChorus);
      track('jam_cue', { cue });
    });
  }

  /* ---------- The clock ---------- */

  let playing = false;
  let timer = 0;
  let bar = 0; // the next bar to schedule, counted from the top of the first chorus
  let nextBarAt = 0;
  let soundingChorus = 0;
  let done = false; // the ending has been scheduled; nothing more to play
  const marks: number[] = [];

  function schedule() {
    if (!ctx || !playing) return;
    while (!done && nextBarAt < ctx.currentTime + LOOKAHEAD_S) {
      const spb = secondsPerBeat(song.bpm);
      const chorus = Math.floor(bar / 12);
      const inForm = bar % 12;
      const section = sectionOf(chorus, inForm);
      // The fills lay out while you're sitting in.
      const youre = ctx.currentTime - sitIn.lastPlayed() < LAY_OUT_BARS * 4 * spb || sitIn.playingPart() !== null;
      const b = bar;
      barEvents(song, b, section)
        .filter((e) => !(youre && e.part === 'lead'))
        .forEach((e, i) => {
          const feel = humanize(b, i, e.part);
          voice(e, nextBarAt + e.at * spb + feel.seconds, spb, feel.gain);
        });
      marks.push(window.setTimeout(onBar, Math.max(0, (nextBarAt - ctx.currentTime) * 1000), chorus, inForm, section));
      nextBarAt += 4 * spb;
      bar++;
      if (section === 'ending' && inForm === 11) {
        done = true;
        marks.push(window.setTimeout(() => stop('That’s the end. Press Play to go again.'), (nextBarAt - 4 * spb - ctx.currentTime + LAST_CHORD_RING_S) * 1000));
      }
    }
  }

  /** As each bar starts: mark it on the chart, and at the top of a chorus, say what it is. */
  function onBar(chorus: number, inForm: number, section: Section) {
    highlight(inForm);
    soloing = section === 'solo' || section === 'stop';
    if (chorus !== soundingChorus || inForm === 0) {
      soundingChorus = chorus;
      showLeader(chorus);
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
    const audio = await ensureAudio();
    if (!audio || !desk) {
      if (status) status.textContent = 'This browser can’t play sound.';
      return;
    }
    play!.disabled = true;
    if (status) status.textContent = 'Getting the band together…';
    await load(song);
    play!.disabled = false;
    playing = true;
    done = false;
    calls.clear();
    homeChorus = null;
    desk.openSession();
    metersUntil = Infinity;
    play!.textContent = 'Stop';
    play!.setAttribute('aria-pressed', 'true');
    if (status) status.textContent = playingText(song);
    bar = startBar(song);
    introChorus = bar > 0 ? 0 : -1;
    soundingChorus = Math.floor(bar / 12);
    // Count it in, then the band comes in on one.
    const spb = secondsPerBeat(song.bpm);
    nextBarAt = audio.currentTime + 0.1 + COUNT_IN.length * spb;
    COUNT_IN.forEach((beat, i) =>
      voice({ at: beat, part: 'drums', drum: 'hat', gain: i === 0 ? 0.7 : 0.55, beats: 0.5 }, nextBarAt + beat * spb, spb, 1, { id: COUNT_IN_SOUND, rate: 1 }),
    );
    schedule();
    showLeader(soundingChorus);
    frame = requestAnimationFrame(drawLights);
    if (!blink) setLights((part) => song.parts[part] !== null);
    timer = window.setInterval(schedule, TICK_MS);
    void startRoom();
    track('jam_play', { feel: song.feel, key: song.key });
  }

  function stop(message = 'Stopped.') {
    if (!playing) return;
    playing = false;
    window.clearInterval(timer);
    marks.splice(0).forEach((t) => window.clearTimeout(t));
    desk?.closeSession();
    metersUntil = (ctx?.currentTime ?? 0) + METER_TAIL_S;
    if (!metering) meterLoop();
    const room = roomSrc;
    roomSrc = null;
    if (room && ctx) room.stop(ctx.currentTime + 0.2);
    highlight(null);
    cancelAnimationFrame(frame);
    flashes.length = 0;
    offAt.clear();
    setLights(() => false);
    band.reset();
    band.spotlight(null);
    soloing = false;
    play!.textContent = 'Play';
    play!.setAttribute('aria-pressed', 'false');
    if (status) status.textContent = message;
    showLeader(soundingChorus);
    if (leaderNow) leaderNow.textContent = 'Press Play, then call the next chorus, or let the band choose.';
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) stop();
  });
}
