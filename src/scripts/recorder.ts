/*
  Recording a take (ADR 0030): the master output, through MediaRecorder, into
  a file the visitor can download. Nothing is uploaded; the file is made in
  the browser and handed over as a download link. It records in whatever the
  browser can (WebM or Ogg Opus in most, MP4 in Safari). Record starts the
  band if it isn't playing, and the take ends when the band stops, once the
  last chord has rung out, so a take never runs on in silence.
*/

const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
const EXTENSION: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };

export type RecorderDeps = {
  /** Start the audio and hand back the master output, on a gesture. */
  stream(): Promise<MediaStream | null>;
  /** The download's name, without an extension: "blues-in-e-shuffle-104-bpm". */
  name(): string;
  playing(): boolean;
  /** Start the band. */
  play(): Promise<void>;
};

export type Recorder = {
  /** The band started: a take that was about to end keeps going. */
  bandStarted(): void;
  /** The band stopped: the take ends once the room has rung out. */
  bandStopped(): void;
};

/** How long a take runs on after the band stops, for the last chord and the room. */
const TAIL_MS = 1500;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function initRecorder(root: HTMLElement, deps: RecorderDeps): Recorder {
  const none: Recorder = { bandStarted() {}, bandStopped() {} };
  const button = root.querySelector<HTMLButtonElement>('[data-record]');
  const time = root.querySelector<HTMLElement>('[data-record-time]');
  const take = root.querySelector<HTMLAnchorElement>('[data-take]');
  if (!button || !time || !take) return none;
  if (typeof MediaRecorder === 'undefined') {
    button.hidden = true;
    return none;
  }
  const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  let recorder: MediaRecorder | null = null;
  let started = 0;
  let ticker = 0;
  let url = '';
  let ending = 0;

  button.addEventListener('click', async () => {
    if (recorder) {
      window.clearTimeout(ending);
      recorder.stop();
      return;
    }
    const stream = await deps.stream();
    if (!stream) return;
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    recorder.addEventListener('dataavailable', (e) => e.data.size && chunks.push(e.data));
    recorder.addEventListener('stop', () => {
      window.clearInterval(ticker);
      const seconds = (performance.now() - started) / 1000;
      const blob = new Blob(chunks, { type: recorder?.mimeType || type || 'audio/webm' });
      recorder = null;
      button.setAttribute('aria-pressed', 'false');
      button.textContent = 'Record a take';
      time.textContent = '';
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      const ext = EXTENSION[blob.type.split(';')[0] ?? ''] ?? 'webm';
      take.href = url;
      take.download = `${deps.name()}.${ext}`;
      take.textContent = `Download your take (${clock(seconds)})`;
      take.hidden = false;
    });
    recorder.start(1000);
    started = performance.now();
    button.setAttribute('aria-pressed', 'true');
    button.textContent = 'Stop recording';
    take.hidden = true;
    time.textContent = '0:00';
    ticker = window.setInterval(() => (time.textContent = clock((performance.now() - started) / 1000)), 500);
    if (!deps.playing()) await deps.play();
  });

  return {
    bandStarted: () => window.clearTimeout(ending),
    bandStopped() {
      window.clearTimeout(ending);
      if (recorder) ending = window.setTimeout(() => recorder?.state === 'recording' && recorder.stop(), TAIL_MS);
    },
  };
}
