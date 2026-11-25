/*
  Build the blues maker's sounds (ADRs 0030, 0031 and 0032).

    npm run jam:sounds                    # render the instruments; generate any room loop that's missing
    npm run jam:sounds -- --force         # also regenerate the room loops (spends ElevenLabs credits)
    npm run jam:sounds -- --only room-bar # regenerate just these room loops

  Reads src/data/jam.yaml.

  - Instruments and drums: real recordings. From a sampled-instrument library
    (an .sfz program, rendered with sfizz's sfizz_render) or from the
    MuseScore General soundfont (rendered with FluidSynth), dry. Each pitched
    tone gets a note every SAMPLE_STEP semitones across what its part plays
    (sampleNotes); each note and drum hit is recorded at every loudness layer
    and in every take the manifest asks for, takes a few velocity steps apart
    so a library's round robins and finer layers come through. One render per
    instrument or kit, cut apart afterwards: loading a library is the slow
    part. Every note is checked for pitch and octave (checkPitch) and the run
    fails on one more than 25 cents out or in the wrong octave.
  - Room loops: generated once with ElevenLabs; the originals are kept in
    src/assets/jam-source/, so rebuilding never costs credits.

  None of the sources are committed. The soundfont goes in .cache/soundfont/
  and each library's archive in .cache/libraries/<id>/archive.zip, from the
  URLs in the manifest; the script checks their sha256 and unpacks the
  archives. sfizz_render is built from source (see ADR 0032) and found at
  .cache/tools/sfizz/build/library/bin/sfizz_render, or SFIZZ_RENDER.

  Every sound is trimmed to itself, faded at the tail, leveled by loudness
  and encoded as mono MP3 into src/assets/jam/; src/data/jam-sounds.json
  lists them for the page. Needs ffmpeg, fluidsynth, sfizz_render and unzip,
  and ELEVENLABS_API_KEY only to generate a loop. The key is only ever sent
  to api.elevenlabs.io, never written anywhere.
*/
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { checkPitch, levelTo, loudness, midiToName, onsetIndex, peak, tailIndex } from '../src/lib/audio-analysis.ts';
import { sampleNotes, SAMPLE_STEP, type MeasuredSound } from '../src/lib/jam.ts';
import { parseJamManifest, sampleId, type DrumSpec, type GeneratedSpec, type ToneSpec } from '../src/lib/jam-manifest.ts';
import { notesMidi, slotStart } from '../src/lib/midi.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src/assets/jam-source');
const OUT = join(ROOT, 'src/assets/jam');
const JSON_OUT = join(ROOT, 'src/data/jam-sounds.json');
const RATE = 44100;
const MODEL = 'eleven_text_to_sound_v2';
// A real recording can be a little out (a bass's low E often is). Each sample's measured pitch is kept and the
// browser tunes from it, so that's fine; past half a semitone, though, something's wrong with the sample.
const WARN_CENTS = 25;
const MAX_CENTS = 50;
const TAKE_STEP = 4; // velocity steps between takes of the same note
const SFIZZ = process.env.SFIZZ_RENDER ?? join(ROOT, '.cache/tools/sfizz/build/library/bin/sfizz_render');

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyArg = args[args.indexOf('--only') + 1];
const only = args.includes('--only') && onlyArg ? new Set(onlyArg.split(',')) : null;

const manifest = parseJamManifest(parse(readFileSync(join(ROOT, 'src/data/jam.yaml'), 'utf8')));
mkdirSync(SOURCE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const scratch = mkdtempSync(join(tmpdir(), 'jam-sounds-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

/* ---------- The sources ---------- */

const soundfont = join(ROOT, '.cache/soundfont', manifest.soundfont.file);
if (!existsSync(soundfont)) throw new Error(`No soundfont at ${soundfont}. Download it from ${manifest.soundfont.url} (about 40 MB) into .cache/soundfont/.`);
if (sha256(soundfont) !== manifest.soundfont.sha256) throw new Error(`${manifest.soundfont.file} isn't the file the manifest names. Download it again from ${manifest.soundfont.url}.`);

/** A library, checked and unpacked: the folder its programs are relative to. */
const unpacked = new Map<string, string>();
function library(id: string): string {
  const known = unpacked.get(id);
  if (known) return known;
  const lib = manifest.libraries[id]!;
  const dir = join(ROOT, '.cache/libraries', id);
  const archive = join(dir, 'archive.zip');
  if (!existsSync(archive)) throw new Error(`No ${lib.name} at ${archive}. Download it from ${lib.url}.`);
  const files = join(dir, 'files');
  const stamp = join(files, '.unpacked');
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== lib.sha256) {
    if (sha256(archive) !== lib.sha256) throw new Error(`${archive} isn't the archive the manifest names. Download it again from ${lib.url}.`);
    rmSync(files, { recursive: true, force: true });
    mkdirSync(files, { recursive: true });
    execFileSync('unzip', ['-q', archive, '-d', files]);
    writeFileSync(stamp, lib.sha256);
  }
  const root = join(files, lib.root);
  unpacked.set(id, root);
  return root;
}

/**
 * A wrapper beside a library's program: load whole samples into memory (sfizz
 * otherwise streams them, and an offline render can outrun the stream, which
 * cuts notes to their first fifth of a second), and define any variable the
 * library's player-specific bank file defines for it (Shinyguitar's
 * $sample_dir), then include the program itself.
 */
function wrapper(root: string, program: string): string {
  const path = join(root, program);
  const defines = readdirSync(root)
    .filter((f) => f.endsWith('.bank.xml'))
    .flatMap((f) => [...readFileSync(join(root, f), 'utf8').matchAll(/<Define name="(\$\w+)" value="([^"]*)"/g)].map((m) => `#define ${m[1]} ${m[2]}`));
  const file = join(dirname(path), `__jam-${basename(program, '.sfz')}.sfz`);
  writeFileSync(file, [...new Set(defines), '<control>', 'hint_ram_based=1', `#include "${basename(program)}"`, ''].join('\n'));
  return file;
}

/* ---------- Rendering ---------- */

type Source = { from: string; preset?: number; sfz?: string; cc?: Record<string, number> };
type Take = { key: number; velocity: number };

/**
 * Notes (or drum hits) rendered dry in one go, one after another, and cut
 * apart: one mono buffer per note. From the soundfont with FluidSynth, or
 * from a library's program with sfizz.
 */
function render(name: string, src: Source, notes: readonly Take[], seconds: number, tail: number, drums = false): Float32Array[] {
  const mid = join(scratch, `${name}.mid`);
  const wav = join(scratch, `${name}.wav`);
  const spec = { channel: drums && src.from === 'soundfont' ? 9 : 0, program: src.preset ?? 0, notes: notes.map((n) => n.key), velocity: notes.map((n) => n.velocity), seconds, tail, cc: src.cc };
  writeFileSync(mid, notesMidi(spec));
  if (src.from === 'soundfont') {
    // No reverb or chorus: the console adds the room. Float, so nothing clips before it's leveled.
    execFileSync('fluidsynth', ['-ni', '-q', '-g', '0.8', '-r', String(RATE), '-R', '0', '-C', '0', '-T', 'wav', '-O', 'float', '-F', wav, soundfont, mid]);
  } else {
    const sfz = wrapper(library(src.from), src.sfz!);
    execFileSync(SFIZZ, ['--sfz', sfz, '--midi', mid, '--wav', wav, '-s', String(RATE), '--use-eot'], { stdio: 'pipe' });
  }
  const all = decode(wav);
  const at = (i: number) => Math.round(slotStart(i, seconds, tail) * RATE);
  return notes.map((_, i) => all.slice(at(i), at(i + 1)));
}

/** Every layer and take of each key: the velocities to play, takes a few steps apart around each layer's. */
function takesOf(keys: readonly number[], layers: readonly number[], takes: number): (Take & { layer: number; take: number })[] {
  return keys.flatMap((key) =>
    layers.flatMap((v, layer) =>
      Array.from({ length: takes }, (_, take) => ({ key, layer, take, velocity: Math.max(1, Math.min(127, Math.round(v + (take - (takes - 1) / 2) * TAKE_STEP))) })),
    ),
  );
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
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** Mono samples through an ffmpeg filter chain. */
function filter(x: Float32Array, chain: string): Float32Array {
  const raw = ['-f', 'f32le', '-ar', String(RATE), '-ac', '1'];
  const buf = execFileSync('ffmpeg', ['-v', 'error', ...raw, '-i', '-', '-af', chain, ...raw, '-'], { input: Buffer.from(x.buffer, x.byteOffset, x.byteLength), maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/**
 * A small tube amp turned up, for a clean pickup recording: the lows trimmed so it doesn't flub, driven
 * into a soft clipper, a cabinet's midrange bump around 800 Hz and its roll-off above 4 kHz.
 */
const AMPS = {
  crunch: 'highpass=f=90,volume=20dB,asoftclip=type=tanh,equalizer=f=800:t=q:w=1:g=4,lowpass=f=4200,highshelf=f=3000:g=-4',
} as const;

function encode(samples: Float32Array, file: string): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '64k', file], {
    input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
  });
}

/**
 * How long each kind of sound is kept, at most: a little past the longest the patterns ever hold it
 * (src/lib/jam.ts), so a real recording's long natural tail isn't downloaded only to be faded out.
 */
const MAX_SECONDS: Record<string, number> = {
  bass: 1.6, guitar: 2.2, keys: 2.6, lead: 2.2, organ: 3.2,
  kick: 0.9, snare: 0.9, hat: 0.6, ride: 1.6, crash: 2.6, rim: 0.5,
};

/** Trimmed to the sound (and to `max` seconds), and faded at the tail so a cut never clicks. */
function trim(x: Float32Array, max = Infinity): Float32Array {
  const on = onsetIndex(x, RATE);
  const end = Math.max(on + 1, Math.min(tailIndex(x), on + Math.round(max * RATE)));
  const y = x.slice(on, end);
  const capped = end - on >= Math.round(max * RATE);
  const fade = Math.min(y.length, Math.round((capped ? 0.12 : 0.04) * RATE));
  for (let i = 0; i < fade; i++) y[y.length - 1 - i]! *= i / fade;
  return y;
}

/**
 * How loud each kind of sound is set, as RMS over its first 300 ms (a loop: all of it), never peaking
 * past -1 dBFS. Every note and layer comes out at the same level, so the patterns' accents set how hard
 * a note sounds and the layer sets its color; the console sets the mix. Notes sit 6 dB lower than they
 * might, so even a hard-played attack fits under the ceiling (at -14 the hardest layers couldn't reach
 * the target and came out quieter than the soft ones); the player brings them back up (SAMPLE_GAIN in
 * src/lib/jam.ts). The room sits under the band.
 */
const LOUDNESS_DB = { note: -20, room: -26 };
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
const layered = (p: { layer: number; take: number }, s: { layers: number[]; takes: number }) => ({
  ...(s.layers.length > 1 ? { layer: p.layer } : {}),
  ...(s.takes > 1 ? { take: p.take } : {}),
});

/* ---------- Each kind of sound ---------- */

/** A pitched tone: every note it needs, at every layer and take, each checked for pitch and octave. */
function tone(t: ToneSpec): MeasuredSound[] {
  const targets = sampleNotes(t.part, t.tone);
  const plan = takesOf(targets, t.layers, t.takes);
  const audio = render(t.tone, t, plan.map((p) => ({ key: p.key + t.transpose, velocity: p.velocity })), t.seconds, 1.5);
  let worst = 0;
  const out = plan.map((p, i): MeasuredSound => {
    let x = trim(audio[i]!, MAX_SECONDS[t.tone] ?? MAX_SECONDS[t.part]);
    const check = checkPitch(x, RATE, p.key, { anyOctave: t.octaves === 'any' });
    if ('error' in check) throw new Error(`${t.name} ${midiToName(p.key)} (velocity ${p.velocity}) ${check.error}.`);
    if (Math.abs(check.cents) > MAX_CENTS) throw new Error(`${t.name} ${midiToName(p.key)} is ${round(check.cents, 0)} cents out.`);
    worst = Math.max(worst, Math.abs(check.cents));
    if (Math.abs(check.cents) > WARN_CENTS) console.warn(`  ! ${t.name} ${midiToName(p.key)} (velocity ${p.velocity}) is ${round(check.cents, 0)} cents out; the browser tunes it from its measured pitch.`);
    if (t.amp) x = trim(filter(x, AMPS[t.amp]), MAX_SECONDS[t.part]);
    const y = level(x);
    const id = sampleId(`${t.tone}-${p.key}`, p.layer, t.layers.length, p.take, t.takes);
    encode(y, join(OUT, `${id}.mp3`));
    return { id, part: t.part, tone: t.tone, file: `${id}.mp3`, key: p.key, midi: round(p.key + check.cents / 100, 2), ...layered(p, t), seconds: seconds(y), db: db(y) };
  });
  console.log(`  ${t.tone} (${t.name}): ${targets.length} notes × ${t.layers.length} layer${t.layers.length > 1 ? 's' : ''} × ${t.takes} take${t.takes > 1 ? 's' : ''}, ${midiToName(targets[0]!)}–${midiToName(targets.at(-1)!)}, within ${round(worst, 0)} cents`);
  return out;
}

/** A kit's drum hits from one source and program, at every layer and take, each played out. */
function kit(hits: DrumSpec[]): MeasuredSound[] {
  const h = hits[0]!;
  const plan = hits.flatMap((d) => takesOf([d.key], d.layers, d.takes).map((p) => ({ ...p, d })));
  const audio = render(`kit-${h.tone}-${h.from}-${basename(h.sfz ?? String(h.preset), '.sfz')}`, h, plan, 0.3, 3.2, true);
  console.log(`  ${h.tone} kit (${manifest.libraries[h.from]?.name ?? h.from}): ${hits.map((d) => d.piece).join(', ')}`);
  return plan.map((p, i): MeasuredSound => {
    const x = trim(audio[i]!, MAX_SECONDS[p.d.piece]);
    let y = level(x);
    // A stick on a cymbal is so peaky that the ceiling stops it well short of its level, which would
    // leave the time-keeping 5 to 8 dB under the kit. Round off the top of the transient a little first.
    if (db(y) < LOUDNESS_DB.note - 3) y = level(softLimit(x, 1.5));
    const id = sampleId(`${p.d.tone}-${p.d.piece}`, p.layer, p.d.layers.length, p.take, p.d.takes);
    encode(y, join(OUT, `${id}.mp3`));
    return { id, part: 'drums', tone: p.d.tone, file: `${id}.mp3`, piece: p.d.piece, ...layered(p, p.d), seconds: seconds(y), db: db(y) };
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
console.log(`Rendering (a note every ${SAMPLE_STEP} semitones)…`);
// Drums render together where they share a source, program and controllers, so a kit loads once.
const groups = new Map<string, DrumSpec[]>();
for (const d of manifest.drums) {
  const k = `${d.tone}|${d.from}|${d.sfz ?? d.preset}|${JSON.stringify(d.cc ?? {})}`;
  groups.set(k, [...(groups.get(k) ?? []), d]);
}
const sounds: MeasuredSound[] = [...manifest.tones.flatMap(tone), ...[...groups.values()].flatMap(kit), ...manifest.generated.map(loop)];
writeFileSync(
  JSON_OUT,
  JSON.stringify(
    {
      instruments: Object.fromEntries([...manifest.tones.map((t) => [`${t.part}/${t.tone}`, t.from]), ...manifest.drums.map((d) => [`drums/${d.tone}/${d.piece}`, d.from])]),
      rooms: `ElevenLabs ${MODEL}`,
      step: SAMPLE_STEP,
      sounds,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Wrote ${sounds.length} sounds to src/assets/jam/ and src/data/jam-sounds.json`);
