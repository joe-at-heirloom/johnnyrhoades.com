/*
  The game's runtime (ADR 0033). The player (jam.ts) tells it about each bar
  as it's scheduled, so it knows to the sample when each line's call starts
  and when your turn starts and ends on the audio clock, and about each note
  you play on the pads. It shows the call on the pads and on the line as it
  plays, marks each of your notes on time or not as you play it, scores the
  answer the moment the turn ends (scoreTurn in src/lib/game.ts), keeps the
  streak, moves the crowd, plays their reaction, and when the band takes it
  home (or the crowd walks out), shows how the gig went. The rules are in
  src/lib/game.ts; this is the bookkeeping and the panel.

  It also runs the band on stage. Before a gig, tapping a player plays a
  little of what they do. During one, the guitar or the keys take the calls,
  the drummer throws a fill into the next line, the bass drops the band out
  under your answers, and tapping yourself switches your horn. The player
  asks for the band's moves bar by bar (`moves`), and the band plays to the
  crowd: softer when it's cool, digging in when it's hot, and shouting a
  great answer back.
*/
import {
  CROWD_START,
  GIGS,
  ON_TIME,
  PART_NAMES,
  SHOUT_AT,
  STREAK_AT,
  TIPS,
  TURN_BEATS,
  WEIGHTS,
  bandLevel,
  crowdGone,
  gigTurns,
  isHot,
  moveCrowd,
  offGrid,
  scoreTurn,
  stars,
  streakBonus,
  timingScore,
  workOn,
  type Breakdown,
  type Gig,
  type Part,
  type TurnNote,
} from '../lib/game';
import type { BandMoves, Caller, Part as Player, Section, Song } from '../lib/jam';
import { SIT_IN, padFor, type SitInInstrument } from '../lib/sit-in';

export type GameHooks = {
  /** Set the band up for a gig and start it. */
  play(gig: Gig): Promise<void>;
  stop(): void;
  /** Play one of the crowd's reactions. */
  crowd(id: 'crowd-clap' | 'crowd-cheer' | 'crowd-ovation'): void;
  /** The audio clock, in seconds. */
  now(): number;
  /** Who's in the band now, and on what. */
  parts(): Song['parts'];
  /** Play a little of what a player does, on their own (before a gig). Resolves with how long it plays, in seconds. */
  preview(part: Player): Promise<number>;
  /** Bring a player who's sitting out into the band. */
  bringIn(part: Player): void;
  /** Put you on a different horn, on the pads and on the stage. */
  setInstrument(instrument: SitInInstrument): void;
};

/** A note of the band's call: its beat in the bar, its pitch and its length in beats. */
export type CallNote = { beat: number; midi: number; beats: number };
export type ScheduledBar = { chorus: number; inForm: number; section: Section; at: number; spb: number; swing: number; keyPc: number; lead: CallNote[] };

export type Game = {
  active(): boolean;
  scheduled(bar: ScheduledBar): void;
  sounding(bar: { chorus: number; inForm: number; section: Section }): void;
  played(midi: number, at: number): void;
  /** What the band does in the bar about to be scheduled, starting at `time` on the audio clock. */
  moves(bar: { inForm: number; section: Section; time: number }): BandMoves;
  /** The band stopped: at the end of the gig, or because you left. */
  ended(finished: boolean): void;
};

/** A line of the blues: the band's call (two bars) and your turn (the next two). */
type Line = {
  /** Who plays this line's call: chosen at its downbeat, so a tap mid-call waits for the next line. */
  caller: Exclude<Caller, 'lead'>;
  chorus: number;
  inForm: number;
  start: number;
  spb: number;
  swing: number;
  keyPc: number;
  /** The call, in beats from its downbeat. */
  call: CallNote[];
  /** Your turn, on the audio clock, once its bars are scheduled. */
  turnStart: number;
  end: number;
  /** What you played, in beats from the turn's downbeat. */
  notes: TurnNote[];
  scored: boolean;
};

const LINE_BEATS = TURN_BEATS * 2;
const PADS = 8;
const STAGE: Player[] = ['drums', 'bass', 'guitar', 'keys', 'lead'];
/** What to call each player, in a chip's label. */
const nameOf = (part: Player, parts: Song['parts']) =>
  part === 'keys' ? (parts.keys === 'organ' ? 'organ' : 'piano') : part === 'lead' ? (parts.lead === 'sax' ? 'tenor sax' : 'harmonica') : part === 'drums' ? 'drummer' : part;

const BEST_KEY = (id: string) => `jam-gig-best-${id}`;
const readBest = (id: string) => {
  try {
    return Number(localStorage.getItem(BEST_KEY(id))) || 0;
  } catch {
    return 0; // storage blocked: no best to show
  }
};
const saveBest = (id: string, points: number) => {
  try {
    if (points > readBest(id)) localStorage.setItem(BEST_KEY(id), String(points));
  } catch {
    // storage blocked: the gig still counts, it just isn't remembered
  }
};

/** A drawn star, filled or not: the site's web font has no star glyph. */
const star = (filled: boolean) =>
  `<svg class="gig-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

export function initGame(root: HTMLElement, hooks: GameHooks): Game {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const pick = $('[data-gig-pick]');
  const live = $('[data-gig-live]');
  const summary = $('[data-gig-summary]');
  const prompt = $('[data-gig-prompt]');
  const feedback = $('[data-gig-feedback]');
  const scoreEl = $('[data-gig-score]');
  const streakEl = $('[data-gig-streak]');
  const lineEl = $('[data-gig-line]');
  const hint = $('[data-gig-hint]');
  /** What to do now, in a line under the prompt. */
  const HINTS = {
    start: 'The band plays a call, then it’s your turn to answer.',
    call: 'Listen. The pads light up as the band plays its call.',
    turn: 'Answer on the pads. Borrow the call’s rhythm (the ticks) and land on a 1 or a 5.',
    ending: 'That was the last line. The band takes it home.',
  };
  const say = (k: keyof typeof HINTS) => hint && (hint.textContent = HINTS[k]);
  const meter = $('[data-gig-crowd]');
  const notesEl = $('[data-gig-notes]');
  const halves = [...root.querySelectorAll<HTMLElement>('.gig-half')];
  const beats = [...root.querySelectorAll<HTMLElement>('[data-gig-beats] li')];
  const partEls = [...root.querySelectorAll<HTMLElement>('[data-part]')];
  const sitIn = $('[data-sit-in]');
  const padEls = [...root.querySelectorAll<HTMLElement>('[data-pad]')];
  const acts = new Map(STAGE.map((p) => [p, root.querySelector<HTMLButtonElement>(`[data-band-act="${p}"]`)] as const));
  // A shorter gig for a quick go (and the tests): ?choruses=1.
  const chorusesParam = Number(new URLSearchParams(location.search).get('choruses'));

  let gig: Gig | null = null;
  let lines: Line[] = [];
  let current: Line | null = null; // the line on show
  let total = 0;
  let streak = 0;
  let crowd = CROWD_START;
  let best = 0;
  let answers: Breakdown[] = [];
  let lastAnswer: TurnNote[] = [];
  let walkedOut = false;
  let frame = 0;
  let timers: number[] = [];
  let toldToWait: Line | null = null;
  // The band, as you lead it.
  let caller: Exclude<Caller, 'lead'> = 'guitar';
  let instrument: SitInInstrument = 'harp';
  let dropped = false;
  let fillCued = false;

  const show = (el: HTMLElement | null, on: boolean) => el && (el.hidden = !on);
  /** Run something at a time on the audio clock. */
  const at = (time: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, (time - hooks.now()) * 1000)));

  function setCrowd(v: number) {
    crowd = v;
    meter?.style.setProperty('--crowd', v.toFixed(3));
    meter?.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  }

  function bestLabels() {
    for (const g of GIGS) {
      const el = root.querySelector<HTMLElement>(`[data-gig-best="${g.id}"]`);
      const b = readBest(g.id);
      if (el) el.textContent = b ? `Your best: ${b} of ${gigTurns(g) * 100}` : '';
    }
  }

  /** Each player's chip on stage: what a tap does now, and whether it's on. */
  function drawStage() {
    const parts = hooks.parts();
    for (const [part, btn] of acts) {
      if (!btn) continue;
      const name = nameOf(part, parts);
      // The chip says what a tap does, or what's happening now (lit red). The button's name starts with
      // the chip's words and says the rest.
      let text = 'Listen';
      let label = `Listen to the ${name}`;
      let on = false;
      if (gig) {
        if (part === 'drums') {
          on = fillCued;
          [text, label] = on ? ['Fill coming', 'Fill coming: the drummer fills into the next line'] : ['Drum fill', 'Drum fill: the drummer fills into the next line'];
        } else if (part === 'bass') {
          on = dropped;
          [text, label] = on ? ['Band back', 'Band back: the band plays under your answers again'] : ['Play alone', 'Play alone: the band stops under your answers'];
        } else if (part === 'lead') {
          const other: SitInInstrument = instrument === 'harp' ? 'sax' : 'harp';
          [text, label] = [`You: ${SIT_IN[instrument].label.toLowerCase()}`, `You: ${SIT_IN[instrument].label.toLowerCase()}. Tap to switch to ${SIT_IN[other].full.toLowerCase()}`];
        } else {
          on = caller === part;
          [text, label] = on
            ? ['Calling', `Calling: the ${name} plays the calls you answer`]
            : ['Call next', `Call next: the ${name} ${parts[part] ? '' : 'joins the band and '}plays the next call`];
        }
      }
      const chip = btn.querySelector('[data-band-chip]');
      if (chip) chip.textContent = text;
      btn.setAttribute('aria-label', label);
      btn.toggleAttribute('data-on', on);
    }
  }

  /** A tap on a player: before a gig, hear them; during one, lead them. */
  function act(part: Player) {
    if (!gig) {
      // Lit while they play.
      const btn = acts.get(part);
      btn?.setAttribute('data-on', '');
      void hooks.preview(part).then((seconds) => timers.push(window.setTimeout(() => !gig && btn?.removeAttribute('data-on'), seconds * 1000)));
      return;
    }
    const name = nameOf(part, hooks.parts());
    let news = '';
    if (part === 'drums') {
      fillCued = !fillCued;
      news = fillCued ? 'The drummer fills into the end of this line.' : 'No fill.';
    } else if (part === 'bass') {
      dropped = !dropped;
      news = dropped ? 'You’re playing alone: the band stops under your answers, with a hit on one. Keep the time yourself.' : 'The band’s back under your answers.';
    } else if (part === 'lead') {
      instrument = instrument === 'harp' ? 'sax' : 'harp';
      hooks.setInstrument(instrument);
      news = `You’re on ${SIT_IN[instrument].full.toLowerCase()} now.`;
    } else if (part === 'guitar' || part === 'keys') {
      if (!hooks.parts()[part]) hooks.bringIn(part);
      news = caller === part ? `You’re trading with the ${name}.` : `The ${name} takes the next call.`;
      caller = part;
    }
    if (news && hint) hint.textContent = news;
    drawStage();
  }
  for (const [part, btn] of acts) btn?.addEventListener('click', () => act(part));

  /** Where the game is: the band's call (the pads show it), your turn (they light up), or neither. */
  function phase(p: 'call' | 'turn' | null) {
    for (const el of [live, sitIn]) {
      if (!el) continue;
      if (p) el.dataset.phase = p;
      else delete el.dataset.phase;
    }
    live?.toggleAttribute('data-turn', p === 'turn');
    halves.forEach((h, i) => h.toggleAttribute('data-on', (p === 'call' && i === 0) || (p === 'turn' && i === 1)));
  }

  /** Put a note on the line: the call's on the left, yours on the right, at its beat and its pad. */
  function mark(kind: 'call' | 'you' | 'echo', beat: number, pad: number, hit?: boolean) {
    if (!notesEl) return;
    const el = document.createElement('i');
    el.className = 'gig-note';
    el.dataset.kind = kind;
    if (hit !== undefined) el.dataset.hit = hit ? 'on' : 'off';
    el.style.setProperty('--x', (Math.max(0, Math.min(LINE_BEATS - 0.25, beat)) / LINE_BEATS).toFixed(4));
    el.style.setProperty('--y', (pad / (PADS - 1)).toFixed(3));
    notesEl.append(el);
  }

  /** Show a line from its downbeat: a clean slate, the band's turn. */
  function begin(l: Line) {
    if (current === l) return;
    current = l;
    notesEl?.replaceChildren();
    if (lineEl && gig) lineEl.textContent = `line ${lines.indexOf(l) + 1} of ${gigTurns(gig)}`;
    phase('call');
    if (prompt) prompt.textContent = 'Listen…';
    say('call');
  }

  /** A note of the call as it sounds: lit on its pad, drawn on the line. */
  function callNote(l: Line, n: CallNote) {
    if (!gig) return;
    begin(l);
    const pad = padFor(n.midi, gig.song.key, instrument);
    mark('call', n.beat, pad);
    const el = padEls[pad];
    if (!el) return;
    el.setAttribute('data-call', '');
    const off = Math.max(0.12, Math.min(0.6, n.beats * l.spb));
    timers.push(window.setTimeout(() => el.removeAttribute('data-call'), off * 1000));
  }

  /** Your turn: the pads light up, and the call's rhythm shows faintly where you'll answer. */
  function turn(l: Line) {
    begin(l);
    phase('turn');
    if (prompt) prompt.textContent = 'Your turn!';
    say('turn');
    for (const n of l.call) mark('echo', TURN_BEATS + n.beat, 0);
  }

  function draw() {
    if (!gig) return;
    const l = current;
    const into = l ? (hooks.now() - l.start) / l.spb : -1;
    beats.forEach((li, i) => li.toggleAttribute('data-now', into >= i && into < i + 1));
    frame = requestAnimationFrame(draw);
  }

  function showParts(b: Breakdown | null) {
    const weakest = b && (Object.keys(WEIGHTS) as Part[]).reduce((w, k) => (WEIGHTS[k] * (1 - b[k]) > WEIGHTS[w] * (1 - b[w]) ? k : w));
    for (const el of partEls) {
      const p = el.dataset.part as Part;
      const got = b ? Math.round(WEIGHTS[p] * b[p]) : 0;
      el.style.setProperty('--part', b ? b[p].toFixed(3) : '0');
      el.toggleAttribute('data-weak', !!b && p === weakest && b[p] < 0.9);
      const v = el.querySelector('[data-part-value]');
      if (v) v.textContent = b ? `${got}/${WEIGHTS[p]}` : '–';
      el.setAttribute('aria-label', b ? `${PART_NAMES[p]}: ${got} of ${WEIGHTS[p]}` : PART_NAMES[p]);
    }
  }

  async function start(id: string) {
    const g = GIGS.find((x) => x.id === id);
    if (!g) return;
    gig = Number.isInteger(chorusesParam) && chorusesParam >= 1 && chorusesParam <= 8 ? { ...g, choruses: chorusesParam } : g;
    lines = [];
    current = null;
    total = 0;
    streak = 0;
    best = 0;
    answers = [];
    lastAnswer = [];
    walkedOut = false;
    caller = gig.caller;
    instrument = gig.instrument;
    dropped = false;
    fillCued = false;
    setCrowd(CROWD_START);
    if (scoreEl) scoreEl.textContent = '0';
    if (streakEl) streakEl.textContent = '';
    if (feedback) feedback.textContent = '';
    if (prompt) prompt.textContent = 'Count it in…';
    say('start');
    notesEl?.replaceChildren();
    showParts(null);
    phase(null);
    $('[data-gig-name]')!.textContent = `${gig.label}:`;
    if (lineEl) lineEl.textContent = `${gigTurns(gig)} lines`;
    show(pick, false);
    show(summary, false);
    show(live, true);
    // On stage: the page's introduction steps aside, and the panel and the pads under it fill the
    // screen from the top. Straight there, not scrolled: the layout has just changed under it.
    root.toggleAttribute('data-live', true);
    window.scrollTo({ top: 0, behavior: 'instant' });
    live?.focus({ preventScroll: true });
    await hooks.play(gig);
    drawStage();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }

  /** Score a turn. At the end of the gig (`last`), the crowd can't walk out: they're already leaving. */
  function score(l: Line, last = false) {
    if (l.scored || !gig) return;
    l.scored = true;
    const s = scoreTurn({ notes: l.notes, call: l.call, swing: l.swing, secondsPerBeat: l.spb, tonicPc: l.keyPc, previous: lastAnswer });
    if (l.notes.length) lastAnswer = l.notes;
    streak = s.points >= STREAK_AT ? streak + 1 : 0;
    const bonus = streakBonus(streak);
    total += s.points + bonus;
    best = Math.max(best, s.points);
    answers.push(s.breakdown);
    setCrowd(moveCrowd(crowd, s.crowd));
    if (scoreEl) scoreEl.textContent = String(total);
    if (streakEl) streakEl.textContent = streak >= 2 ? `Streak ×${streak}` : '';
    const onTime = s.marks.filter((m) => m.onTime).length;
    const notes = s.marks.length ? ` ${onTime} of ${s.marks.length} notes on time.` : '';
    if (feedback) feedback.textContent = s.points ? `+${s.points}${bonus ? `, and ${bonus} for the streak` : ''}. ${s.verdict}${notes}` : s.verdict;
    showParts(s.marks.length ? s.breakdown : null);
    if (s.cheer) hooks.crowd(s.cheer === 'cheer' ? 'crowd-cheer' : 'crowd-clap');
    if (crowdGone(crowd) && !last) {
      walkedOut = true;
      if (prompt) prompt.textContent = 'They walked out.';
      hooks.stop();
    } else if (current === l) {
      phase(null);
    }
  }

  function finish(finished: boolean) {
    cancelAnimationFrame(frame);
    timers.splice(0).forEach((t) => window.clearTimeout(t));
    padEls.forEach((el) => el.removeAttribute('data-call'));
    phase(null);
    root.toggleAttribute('data-live', false);
    show(live, false);
    // A turn the ending beat to the scoring still counts.
    if (gig && finished && !walkedOut) lines.filter((l) => l.end && l.end <= hooks.now() + 0.05).forEach((l) => score(l, true));
    const g = gig;
    gig = null;
    drawStage();
    if (!g || !(finished || walkedOut)) {
      show(pick, true);
      bestLabels();
      return;
    }
    const count = gigTurns(g);
    const earned = stars(total, count);
    if (earned === 3) hooks.crowd('crowd-ovation');
    saveBest(g.id, total);
    $('[data-gig-summary-title]')!.textContent = walkedOut ? 'They walked out' : 'That’s the gig';
    const stars$ = $('[data-gig-stars]');
    if (stars$) {
      stars$.innerHTML = [1, 2, 3].map((i) => star(i <= earned)).join('');
      stars$.setAttribute('aria-label', `${earned} of 3 stars`);
      stars$.setAttribute('role', 'img');
    }
    const crowdSaid = walkedOut ? `The crowd walked out after ${answers.length} of ${count} answers.` : `The crowd was ${crowd > 0.75 ? 'on its feet' : crowd > 0.45 ? 'with you' : 'still talking'}.`;
    $('[data-gig-total]')!.textContent = `${total} of ${count * 100} points. ${crowdSaid}`;
    $('[data-gig-best-answer]')!.textContent = best > 0 ? `Your best answer scored ${best}.` : '';
    const weak = workOn(answers);
    const share = weak ? answers.reduce((sum, b) => sum + b[weak], 0) / answers.length : 1;
    $('[data-gig-work-on]')!.textContent = !weak ? '' : share >= 0.9 ? 'Nothing to work on: that was clean.' : `Next time: ${TIPS[weak].charAt(0).toLowerCase()}${TIPS[weak].slice(1)}`;
    const next = GIGS[GIGS.findIndex((x) => x.id === g.id) + 1];
    const nextBtn = $<HTMLButtonElement>('[data-gig-next]');
    if (nextBtn) {
      nextBtn.hidden = !next;
      nextBtn.dataset.next = next?.id ?? '';
    }
    $<HTMLButtonElement>('[data-gig-again]')!.dataset.again = g.id;
    show(summary, true);
    $('[data-gig-summary-title]')?.focus();
  }

  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-gig-start]')) b.addEventListener('click', () => void start(b.dataset.gigStart!));
  $('[data-gig-stop]')?.addEventListener('click', () => hooks.stop());
  $('[data-gig-again]')?.addEventListener('click', (e) => void start((e.currentTarget as HTMLElement).dataset.again!));
  $('[data-gig-next]')?.addEventListener('click', (e) => void start((e.currentTarget as HTMLElement).dataset.next!));
  $('[data-gig-choose]')?.addEventListener('click', () => {
    show(summary, false);
    show(pick, true);
    bestLabels();
  });
  bestLabels();
  drawStage();

  return {
    active: () => gig !== null,
    scheduled(bar) {
      if (!gig || bar.section !== 'call') return;
      const pos = bar.inForm % 4;
      if (pos === 0) lines.push({ caller, chorus: bar.chorus, inForm: bar.inForm, start: bar.at, spb: bar.spb, swing: bar.swing, keyPc: bar.keyPc, call: [], turnStart: 0, end: 0, notes: [], scored: false });
      const l = lines.at(-1);
      if (!l || l.chorus !== bar.chorus || l.inForm !== bar.inForm - pos) return;
      if (pos < 2) {
        // The call, in beats from its downbeat: kept for the answer, and shown as it sounds.
        if (pos === 0) at(l.start, () => begin(l));
        for (const e of bar.lead) {
          const n = { beat: e.beat + pos * 4, midi: e.midi, beats: e.beats };
          l.call.push(n);
          at(l.start + n.beat * l.spb, () => callNote(l, n));
        }
      } else if (pos === 2) {
        l.turnStart = bar.at;
        l.end = bar.at + TURN_BEATS * bar.spb;
        at(l.turnStart, () => turn(l));
        // Scored the moment the turn ends.
        at(l.end + 0.03, () => score(l));
      }
    },
    sounding({ section }) {
      if (!gig || !prompt) return;
      if (section === 'ending') {
        prompt.textContent = 'Taking it home…';
        say('ending');
        phase(null);
      }
    },
    played(midi, time) {
      if (!gig) return;
      const l = lines.find((x) => x.end && !x.scored && time >= x.turnStart - x.spb / 4 && time <= x.end);
      if (!l) {
        // Playing over the call: say once that it's the band's turn.
        const inCall = current && time >= current.start && (current.turnStart === 0 || time < current.turnStart - current.spb / 4);
        if (current && inCall && toldToWait !== current && feedback) {
          toldToWait = current;
          feedback.textContent = 'That’s the band’s call. Answer when the pads light up.';
        }
        return;
      }
      const beat = (time - l.turnStart) / l.spb;
      l.notes.push({ beat, midi });
      mark('you', TURN_BEATS + beat, padFor(midi, gig.song.key, instrument), timingScore(offGrid(beat, l.swing, l.spb)) >= ON_TIME);
    },
    moves({ inForm, section, time }) {
      if (!gig) return {};
      const base: BandMoves = { sittingIn: true, level: bandLevel(crowd) };
      if (section !== 'call') return base;
      const pos = inForm % 4;
      const m: BandMoves = { ...base, caller: pos === 0 ? caller : (lines.at(-1)?.caller ?? caller), hot: isHot(crowd, streak) };
      if (dropped && pos >= 2) m.drop = true;
      if (fillCued && pos === 3) {
        m.fill = true;
        fillCued = false;
        at(time, drawStage);
      }
      // As the band reaches the next line, it hears how your answer's going: a great one gets shouted back.
      const prev = pos === 0 ? lines.find((l) => l.end && !l.scored && Math.abs(l.end - time) < 0.02) : undefined;
      if (prev?.notes.length) {
        const sofar = scoreTurn({ notes: prev.notes, call: prev.call, swing: prev.swing, secondsPerBeat: prev.spb, tonicPc: prev.keyPc, previous: lastAnswer });
        if (sofar.points >= SHOUT_AT) m.shout = true;
      }
      return m;
    },
    ended: finish,
  };
}
