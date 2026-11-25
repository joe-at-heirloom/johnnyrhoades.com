/*
  Build the blues maker's sounds (ADRs 0030 and 0031).

    npm run jam:sounds                    # render the instruments; generate any room loop that's missing
    npm run jam:sounds -- --force         # also regenerate the room loops (spends ElevenLabs credits)
    npm run jam:sounds -- --only room-bar # regenerate just these room loops

  Reads src/data/jam.yaml.

  - Instruments: real recorded samples from the MuseScore General soundfont
    (MIT), rendered with FluidSynth, dry. Each pitched tone gets one note every
    SAMPLE_STEP semitones across what its part plays (sampleNotes), rendered
    at that pitch, so nothing is retuned; each is measured anyway (YIN), and
    the run fails if one is more than 25 cents out. Each drum piece is one hit.
    The soundfont lives in .cache/soundfont/ (not committed); the script
    checks its sha256 against the manifest.
  - Room loops: generated once with ElevenLabs; the originals are kept in
    src/assets/jam-source/, so rebuilding never costs credits.

  Every sound is trimmed to itself, faded at the tail, leveled by loudness
  and encoded as mono MP3 into src/assets/jam/; src/data/jam-sounds.json
  lists them for the page. Needs ffmpeg and fluidsynth, and
  ELEVENLABS_API_KEY only to generate a loop. The key is only ever sent to
  api.elevenlabs.io, never written anywhere.
*/
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { hzToMidi, levelTo, loudness, midiToName, notePitch, onsetIndex, peak, tailIndex } from '../src/lib/audio-analysis.ts';
import { sampleNotes, SAMPLE_STEP, type MeasuredSound } from '../src/lib/jam.ts';
import { parseJamManifest, type DrumSpec, type GeneratedSpec, type ToneSpec } from '../src/lib/jam-manifest.ts';
import { notesMidi, slotStart, type Notes } from '../src/lib/midi.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src/assets/jam-source');
const OUT = join(ROOT, 'src/assets/jam');
const JSON_OUT = join(ROOT, 'src/data/jam-sounds.json');
const RATE = 44100;
const MODEL = 'eleven_text_to_sound_v2';
const MAX_CENTS = 25;

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyArg = args[args.indexOf('--only') + 1];
const only = args.includes('--only') && onlyArg ? new Set(onlyArg.split(',')) : null;

const manifest = parseJamManifest(parse(readFileSync(join(ROOT, 'src/data/jam.yaml'), 'utf8')));
mkdirSync(SOURCE, { recursive: true });
mkdirSync(OUT, { recursive: true });

/* ---------- The soundfont ---------- */

const soundfont = join(ROOT, '.cache/soundfont', manifest.soundfont.file);
if (!existsSync(soundfont)) {
  throw new Error(`No soundfont at ${soundfont}. Download it from ${manifest.soundfont.url} (about 40 MB) into .cache/soundfont/.`);
}
const sha = createHash('sha256').update(readFileSync(soundfont)).digest('hex');
if (sha !== manifest.soundfont.sha256) throw new Error(`${manifest.soundfont.file} isn't the file the manifest names (sha256 ${sha}). Download it again from ${manifest.soundfont.url}.`);

const scratch = mkdtempSync(join(tmpdir(), 'jam-sounds-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));

/**
 * Notes (or drum hits) rendered dry by FluidSynth in one go, one after another, and cut apart:
 * one mono buffer per note. One render an instrument, since loading the soundfont is the slow part.
 */
function render(name: string, spec: Notes): Float32Array[] {
  const mid = join(scratch, `${name}.mid`);
  const wav = join(scratch, `${name}.wav`);
  writeFileSync(mid, notesMidi(spec));
  // No reverb or chorus: the console adds the room. Float, so nothing clips before it's leveled.
  execFileSync('fluidsynth', ['-ni', '-q', '-g', '0.8', '-r', String(RATE), '-R', '0', '-C', '0', '-T', 'wav', '-O', 'float', '-F', wav, soundfont, mid]);
  const all = decode(wav);
  const at = (i: number) => Math.round(slotStart(i, spec.seconds, spec.tail) * RATE);
  return spec.notes.map((_, i) => all.slice(at(i), at(i + 1)));
}

/* ---------- Generated loops ---------- */

async function generate(s: GeneratedSpec): Promise<void> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: s.prompt, duration_seconds: s.seconds, prompt_influence: 0.7, loop: s.loop ?? false, model_id: MODEL }),
  });
  if (!res.ok) throw new Error(`${s.id}: ElevenLabs ${res.status} ${(await res.text()).slice(0, 300)}`);
  writeFileSync(join(SOURCE, `${s.id}.mp3`), Buffer.from(await res.arrayBuffer()));
}

/* ---------- Audio files ---------- */

function decode(file: string): Float32Array {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function encode(samples: Float32Array, file: string): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '80k', file], {
    input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
  });
}

/** Trimmed to the sound, and faded at the tail so a cut never clicks. */
function trim(x: Float32Array): Float32Array {
  const on = onsetIndex(x, RATE);
  const y = x.slice(on, Math.max(on + 1, tailIndex(x)));
  const fade = Math.min(y.length, Math.round(0.04 * RATE));
  for (let i = 0; i < fade; i++) y[y.length - 1 - i]! *= i / fade;
  return y;
}

/**
 * How loud each kind of sound is set, as RMS over its first 300 ms (a loop: all of it), never peaking
 * past -1 dBFS. Every note of a tone, and every tone of a part, then comes out at the same level, and
 * the mix is set by the console and the patterns' accents. The room sits well under the band.
 */
const LOUDNESS_DB = { note: -14, room: -26 };
const BODY = Math.round(0.3 * RATE);
const level = (x: Float32Array, loop = false) => levelTo(loop ? softLimit(x) : x, loop ? LOUDNESS_DB.room : LOUDNESS_DB.note, loop ? x.length : BODY);
const db = (x: Float32Array, loop = false) => round(loudness(x, loop ? x.length : BODY), 1);

/** Round off a loop's spikes (a record's clicks) so its body can come up to level without them clipping. */
function softLimit(x: Float32Array, drive = 6): Float32Array {
  const p = peak(x) || 1;
  return x.map((v) => Math.tanh((drive * v) / p) / Math.tanh(drive));
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
const seconds = (x: Float32Array) => round(x.length / RATE, 3);

/* ---------- Each kind of sound ---------- */

/** A pitched tone: one rendered note every SAMPLE_STEP semitones, each checked for pitch. */
function tone(t: ToneSpec): MeasuredSound[] {
  const out: MeasuredSound[] = [];
  let worst = 0;
  const targets = sampleNotes(t.part, t.tone);
  const notes = render(t.tone, { channel: 0, program: t.preset, notes: targets, velocity: t.velocity, seconds: t.seconds, tail: 1.5 });
  for (const [i, target] of targets.entries()) {
    const x = trim(notes[i]!);
    // The search stays near the target first, so a strong overtone can't be mistaken for the note. An
    // organ's drawbars together only repeat a couple of octaves under the key (its E3 repeats at E1),
    // so failing that, any octave of the right note counts: what's checked is that it's in tune.
    const hz = 440 * Math.pow(2, (target - 69) / 12);
    const near = notePitch(x, RATE, { minHz: hz / 1.25, maxHz: hz * 1.25 });
    const wide = near ?? notePitch(x, RATE, { minHz: 25, maxHz: 2000 });
    const off = wide ? hzToMidi(wide.hz) - target : NaN;
    const cents = (off - 12 * Math.round(off / 12)) * 100;
    const got = target + cents / 100;
    if (!(Math.abs(cents) <= MAX_CENTS)) throw new Error(`${t.name} ${midiToName(target)} renders ${Number.isNaN(got) ? 'with no clear pitch' : `${round(cents, 0)} cents out`}.`);
    worst = Math.max(worst, Math.abs(cents));
    const y = level(x);
    const id = `${t.tone}-${target}`;
    encode(y, join(OUT, `${id}.mp3`));
    out.push({ id, part: t.part, tone: t.tone, file: `${id}.mp3`, midi: round(got, 2), seconds: seconds(y), db: db(y) });
  }
  console.log(`  ${t.tone} (${t.name}): ${out.length} notes, ${midiToName(Math.round(out[0]!.midi!))}–${midiToName(Math.round(out.at(-1)!.midi!))}, within ${round(worst, 0)} cents`);
  return out;
}

/** A kit's drum hits, each played out. */
function kit(hits: DrumSpec[]): MeasuredSound[] {
  const k = hits[0]!;
  // One render a kit and velocity, so every hit in it shares one pass.
  return [...new Set(hits.map((h) => h.velocity))].flatMap((velocity) => {
    const these = hits.filter((h) => h.velocity === velocity);
    const audio = render(`kit-${k.kit}-${velocity}`, { channel: 9, program: k.kit, notes: these.map((h) => h.key), velocity, seconds: 0.3, tail: 3 });
    return these.map((d, i): MeasuredSound => {
      const y = level(trim(audio[i]!));
      encode(y, join(OUT, `${d.id}.mp3`));
      return { id: d.id, part: 'drums', tone: d.tone, file: `${d.id}.mp3`, seconds: seconds(y), db: db(y) };
    });
  });
}

/** A generated loop, from its kept original. */
function loop(g: GeneratedSpec): MeasuredSound {
  const raw = decode(join(SOURCE, `${g.id}.mp3`));
  const y = level(g.loop ? raw : trim(raw), g.loop);
  encode(y, join(OUT, `${g.id}.mp3`));
  return { id: g.id, part: g.part, tone: g.tone, file: `${g.id}.mp3`, seconds: seconds(y), db: db(y, g.loop), ...(g.loop ? { loop: true } : {}) };
}

/* ---------- Build ---------- */

const todo = manifest.generated.filter((g) => (only ? only.has(g.id) : force || !existsSync(join(SOURCE, `${g.id}.mp3`))));
for (const g of todo) {
  console.log(`Generating ${g.id} with ElevenLabs (${MODEL})…`);
  await generate(g);
}

for (const f of readdirSync(OUT)) if (f.endsWith('.mp3')) rmSync(join(OUT, f));
console.log(`Rendering from ${manifest.soundfont.file} (a note every ${SAMPLE_STEP} semitones)…`);
const kits = [...new Set(manifest.drums.map((d) => d.kit))].map((k) => manifest.drums.filter((d) => d.kit === k));
const sounds: MeasuredSound[] = [...manifest.tones.flatMap(tone), ...kits.flatMap(kit), ...manifest.generated.map(loop)];
writeFileSync(
  JSON_OUT,
  JSON.stringify({ instruments: `${manifest.soundfont.file} (MIT) via FluidSynth`, rooms: `ElevenLabs ${MODEL}`, step: SAMPLE_STEP, sounds }, null, 2) + '\n',
);
console.log(`Wrote ${sounds.length} sounds to src/assets/jam/ and src/data/jam-sounds.json`);
