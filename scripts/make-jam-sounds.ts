/*
  Generate the blues maker's sounds with ElevenLabs, and tune them (ADR 0030).

    npm run jam:sounds                 # generate any sound that's missing, then tune
    npm run jam:sounds -- --only harp-e,harp-a   # (re)generate these, then tune
    npm run jam:sounds -- --force      # regenerate everything (spends credits)
    npm run jam:sounds -- --measure    # re-trim and re-tune from the originals, no API calls

  Reads src/data/jam.yaml. Each sound is asked for once from the
  sound-effects API and the original is kept in src/assets/jam-source/
  (committed, never served), so retuning never costs credits.

  Drums and room loops are trimmed, normalized and encoded as they are.
  Pitched sounds are tuned: ElevenLabs won't play a requested note (it
  mostly plays C), so the script measures each original's real pitch (YIN),
  and renders a sample every SAMPLE_STEP semitones across the part's range
  by PSOLA pitch-shifting the nearest original (src/lib/psola.ts). Every
  tuned sample is measured again; one more than 15 cents off is left out
  with a warning (and the unit tests fail if that leaves a gap). Everything goes to src/assets/jam/ (mono MP3) and
  src/data/jam-sounds.json, which the page reads.

  Needs ffmpeg, and ELEVENLABS_API_KEY to generate. The key is only ever
  sent to api.elevenlabs.io, never written anywhere.
*/
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { hzToMidi, midiToName, notePitch, onsetIndex, peak, tailIndex } from '../src/lib/audio-analysis.ts';
import { sampleNotes, SAMPLE_STEP, type MeasuredSound } from '../src/lib/jam.ts';
import { psolaShift } from '../src/lib/psola.ts';
import { parseJamManifest, type SoundSpec } from '../src/lib/jam-manifest.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'src/assets/jam-source');
const OUT = join(ROOT, 'src/assets/jam');
const JSON_OUT = join(ROOT, 'src/data/jam-sounds.json');
const RATE = 44100;
const MODEL = 'eleven_text_to_sound_v2';

const args = process.argv.slice(2);
const force = args.includes('--force');
const measureOnly = args.includes('--measure');
const onlyArg = args[args.indexOf('--only') + 1];
const only = args.includes('--only') && onlyArg ? new Set(onlyArg.split(',')) : null;

const sounds = parseJamManifest(parse(readFileSync(join(ROOT, 'src/data/jam.yaml'), 'utf8')));
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function generate(s: SoundSpec): Promise<void> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: s.prompt, duration_seconds: s.seconds, prompt_influence: 0.7, loop: s.loop ?? false, model_id: MODEL }),
  });
  if (!res.ok) throw new Error(`${s.id}: ElevenLabs ${res.status} ${(await res.text()).slice(0, 300)}`);
  writeFileSync(join(RAW, `${s.id}.mp3`), Buffer.from(await res.arrayBuffer()));
}

function decode(file: string): Float32Array {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function encode(samples: Float32Array, file: string): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '80k', file], {
    input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
  });
}

/** Decoded, trimmed to the sound, faded at the tail so a cut never clicks, and peaking at -1 dBFS. */
function prepare(s: SoundSpec): Float32Array {
  let x = decode(join(RAW, `${s.id}.mp3`));
  if (!s.loop) {
    const on = onsetIndex(x, RATE);
    x = x.slice(on, Math.max(on + 1, tailIndex(x)));
    const fade = Math.min(x.length, Math.round(0.04 * RATE));
    for (let i = 0; i < fade; i++) x[x.length - 1 - i]! *= i / fade;
  }
  const gain = Math.pow(10, -1 / 20) / (peak(x) || 1);
  return x.map((v) => v * gain);
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
const seconds = (x: Float32Array) => round(x.length / RATE, 3);

/** Drums and room loops: as they are. */
function plain(s: SoundSpec): MeasuredSound {
  const x = prepare(s);
  const file = `${s.id}.mp3`;
  encode(x, join(OUT, file));
  return { id: s.id, part: s.part, tone: s.tone, file, seconds: seconds(x), ...(s.loop ? { loop: true } : {}) };
}

/** A pitched tone: tuned samples every SAMPLE_STEP semitones, each from the nearest original. */
function tuned(part: SoundSpec['part'], tone: string, originals: SoundSpec[]): MeasuredSound[] {
  const sources = originals.map((s) => {
    const x = prepare(s);
    const p = notePitch(x, RATE, { minHz: 25, maxHz: 1600 });
    if (!p) throw new Error(`${s.id}: no clear pitch in the original, so it can't be tuned. Regenerate it with --only ${s.id}.`);
    console.log(`  ${s.id}: asked ${s.note}, got ${p.hz.toFixed(1)} Hz ≈ ${midiToName(Math.round(hzToMidi(p.hz)))} (clarity ${p.clarity.toFixed(2)})`);
    return { s, x, hz: p.hz, midi: hzToMidi(p.hz), clarity: p.clarity };
  });
  const out: MeasuredSound[] = [];
  const shifts: number[] = [];
  const skipped: string[] = [];
  for (const target of sampleNotes(part, tone)) {
    // Confirm it's clearly periodic at the target. The search stays within a few semitones of it, since
    // PSOLA can leave a faint undertone an octave down that a wide search would latch onto.
    const targetHz = 440 * Math.pow(2, (target - 69) / 12);
    const measure = (y: Float32Array) => {
      const p = notePitch(y, RATE, { minHz: targetHz / 1.25, maxHz: targetHz * 1.25 });
      return p ? hzToMidi(p.hz) : NaN;
    };
    // Nearest original first, but a clean one is worth a semitone or so more of shifting than a noisy one.
    const ranked = [...sources].sort((a, b) => Math.abs(a.midi - target) + 10 * (1 - a.clarity) - (Math.abs(b.midi - target) + 10 * (1 - b.clarity)));
    let y: Float32Array | null = null;
    let got = NaN;
    let src = ranked[0]!;
    let semis = 0;
    for (const candidate of ranked) {
      src = candidate;
      // Leave the first 10 ms (the pick, the hammer, the breath) as recorded. If the result lands off
      // (a note whose pitch drifts measures a little differently once shifted), shift again by the difference.
      semis = target - src.midi;
      y = psolaShift(src.x, RATE, src.hz, semis, Math.round(0.01 * RATE));
      got = measure(y);
      for (let pass = 0; pass < 2 && Math.abs(got - target) * 100 > 5; pass++) {
        semis -= got - target;
        y = psolaShift(src.x, RATE, src.hz, semis, Math.round(0.01 * RATE));
        got = measure(y);
      }
      if (Math.abs(got - target) * 100 <= 15) break;
    }
    if (!y || !(Math.abs(got - target) * 100 <= 15)) {
      skipped.push(midiToName(target));
      console.warn(`  ! ${tone} ${midiToName(target)}: no original tunes there cleanly (best: ${src.s.id}, ${Number.isNaN(got) ? 'no clear pitch' : `${round((got - target) * 100, 0)} cents off`}); its neighbors will cover it.`);
      continue;
    }
    const g = Math.pow(10, -1 / 20) / (peak(y) || 1);
    for (let i = 0; i < y.length; i++) y[i]! *= g;
    const id = `${tone}-${target}`;
    encode(y, join(OUT, `${id}.mp3`));
    out.push({ id, part, tone, file: `${id}.mp3`, midi: round(got, 2), seconds: seconds(y) });
    shifts.push(Math.abs(semis));
  }
  if (skipped.length) console.warn(`  ! ${tone}: skipped ${skipped.join(', ')}; npm test fails if that leaves a gap.`);
  console.log(`  → ${tone}: ${out.length} samples, ${midiToName(Math.round(out[0]!.midi!))}–${midiToName(Math.round(out.at(-1)!.midi!))}, shifted up to ${round(Math.max(...shifts), 1)} semitones, all within 15 cents`);
  return out;
}

const todo = sounds.filter((s) => (only ? only.has(s.id) : force || !existsSync(join(RAW, `${s.id}.mp3`))));
if (!measureOnly && todo.length) {
  console.log(`Generating ${todo.length} sound${todo.length === 1 ? '' : 's'} with ElevenLabs (${MODEL})…`);
  // Three at a time, to stay inside the API's concurrency limit.
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        await generate(s);
        console.log(`  got ${s.id}`);
      }
    }),
  );
}

console.log(`Trimming and tuning (a sample every ${SAMPLE_STEP} semitones)…`);
const missing = sounds.filter((s) => !existsSync(join(RAW, `${s.id}.mp3`)));
if (missing.length) throw new Error(`No original for: ${missing.map((s) => s.id).join(', ')}. Run without --measure first.`);
for (const f of readdirSync(OUT)) if (f.endsWith('.mp3')) rmSync(join(OUT, f));

const measured: MeasuredSound[] = [];
const done = new Set<string>();
for (const s of sounds) {
  if (!s.note) {
    measured.push(plain(s));
    continue;
  }
  const key = `${s.part}/${s.tone}`;
  if (done.has(key)) continue;
  done.add(key);
  measured.push(...tuned(s.part, s.tone, sounds.filter((o) => o.part === s.part && o.tone === s.tone)));
}
writeFileSync(JSON_OUT, JSON.stringify({ generatedWith: MODEL, step: SAMPLE_STEP, sounds: measured }, null, 2) + '\n');
console.log(`Wrote ${measured.length} sounds to src/assets/jam/ and src/data/jam-sounds.json`);
