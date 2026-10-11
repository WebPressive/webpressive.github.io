/**
 * Live transcript: the microphone is cut into spoken segments (a segment ends at a short pause), and
 * each segment is transcribed on this computer by the speech worker (`transcribeWorker.ts`).
 * While the worker has nothing else to do, the segment still being spoken is transcribed as a preview.
 */

const SAMPLE_RATE = 16000;
const FRAME = 480; // 30 ms at 16 kHz: the unit of speech detection
const FRAME_MS = (FRAME / SAMPLE_RATE) * 1000;
const PRE_ROLL_FRAMES = 10; // 300 ms kept before speech starts, so the first syllable is not cut
const END_SILENCE_MS = 600; // A pause this long ends the segment
const MAX_SEGMENT_MS = 6000; // Longer speech is cut at its quietest moment in the last 1.5 s
const CUT_SEARCH_MS = 1500;
const MIN_SPEECH_MS = 250; // Less speech than this (a click, a cough) is not transcribed
const TRAILING_SILENCE_FRAMES = 7; // ~200 ms of the closing pause kept with the segment
const PREVIEW_MIN_MS = 1000; // A preview needs this much audio,
const PREVIEW_STEP_MS = 800; // and this much more than the previous preview
const MIN_THRESHOLD = 0.006; // RMS below this is never speech
const NOISE_FACTOR = 3; // Speech: RMS this many times above the room's noise floor

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FinalLine {
  id: number;
  start: number; // performance.now() when the segment started / ended
  end: number;
  text: string;
}

// --- Speech engine: one worker for the page, kept once loaded (turning the transcript off and on is instant) ---

interface Job {
  id: number;
  audio: Float32Array;
  resolve: (text: string) => void;
  reject: (error: Error) => void;
}

class SpeechEngine {
  status: EngineStatus = 'idle';
  progress = 0; // Model download, 0-1
  error: string | null = null;
  private worker: Worker | null = null;
  private listeners = new Set<() => void>();
  private queue: Job[] = [];
  private inFlight: Job | null = null;
  private nextId = 1;
  private idleWaiters: (() => void)[] = [];

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  /** Starts the worker and loads the model (again after an error). */
  load() {
    if (this.status === 'loading' || this.status === 'ready') return;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./transcribeWorker.ts', import.meta.url), { type: 'module' });
      } catch (error) {
        this.fail(`The transcript cannot run in this browser: ${(error as Error).message}`);
        return;
      }
      this.worker.onmessage = (event: MessageEvent) => this.onMessage(event.data);
      this.worker.onerror = (event: ErrorEvent) => this.fail(event.message || 'The speech worker stopped.');
    }
    this.status = 'loading';
    this.error = null;
    this.emit();
    this.worker.postMessage({ type: 'load' });
  }

  private fail(message: string) {
    this.status = 'error';
    this.error = message;
    const jobs = [...(this.inFlight ? [this.inFlight] : []), ...this.queue];
    this.inFlight = null;
    this.queue = [];
    jobs.forEach((job) => job.reject(new Error(message)));
    this.settle();
    this.emit();
  }

  private onMessage(data: { type: string; progress?: number; id?: number; text?: string; message?: string }) {
    switch (data.type) {
      case 'progress':
        this.progress = data.progress ?? 0;
        this.emit();
        break;
      case 'ready':
        this.status = 'ready';
        this.progress = 1;
        this.emit();
        this.pump();
        break;
      case 'result':
        if (this.inFlight && this.inFlight.id === data.id) {
          this.inFlight.resolve(data.text ?? '');
          this.inFlight = null;
          this.pump();
        }
        break;
      case 'error':
        if (data.id !== undefined && this.inFlight?.id === data.id) {
          // One segment failed: skip it, keep going
          console.warn('Transcript segment failed:', data.message);
          this.inFlight.reject(new Error(data.message));
          this.inFlight = null;
          this.pump();
        } else {
          this.fail(friendlyLoadError(data.message ?? 'unknown error'));
        }
        break;
    }
  }

  get isBusy(): boolean {
    return !!this.inFlight || this.queue.length > 0 || this.status !== 'ready';
  }

  /** Transcribes in order. A preview is skipped (null) when anything else is waiting. */
  transcribe(audio: Float32Array, preview = false): Promise<string> | null {
    if (preview && this.isBusy) return null;
    if (this.status === 'error') return Promise.resolve(''); // Not waiting for a retry that may never come
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, audio, resolve, reject });
      this.pump();
    });
  }

  private pump() {
    if (this.inFlight || this.status !== 'ready' || !this.worker) {
      if (!this.inFlight && this.queue.length === 0) this.settle();
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      this.settle();
      return;
    }
    this.inFlight = job;
    this.worker.postMessage({ type: 'transcribe', id: job.id, audio: job.audio }, [job.audio.buffer]);
  }

  private settle() {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  /** Resolves when every queued segment is done (or the engine failed). */
  whenIdle(): Promise<void> {
    if (!this.inFlight && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }
}

function friendlyLoadError(message: string): string {
  if (/fetch|network|Load failed|NetworkError/i.test(message)) {
    return 'Could not download the speech model. Check the internet connection and try again (it is needed once; afterwards the transcript works offline).';
  }
  return `The speech model could not start: ${message}`;
}

let engine: SpeechEngine | null = null;
export function speechEngine(): SpeechEngine {
  if (!engine) engine = new SpeechEngine();
  return engine;
}

// --- Microphone capture ---

// Posts the microphone's samples (mono) to the page in blocks of 2048
const CAPTURE_PROCESSOR = `
class WpTranscriptCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (channels && channels.length) {
      const first = channels[0];
      for (let i = 0; i < first.length; i++) {
        let v = first[i];
        if (channels.length > 1) { v = 0; for (let c = 0; c < channels.length; c++) v += channels[c][i]; v /= channels.length; }
        this.buf[this.n++] = v;
        if (this.n === this.buf.length) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(2048); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('wp-transcript-capture', WpTranscriptCapture);
`;

// Box-filter downsampler from the device rate to 16 kHz (averaging also keeps out most aliasing)
class Downsampler {
  private next: number;
  private index = 0;
  private sum = 0;
  private count = 0;
  constructor(private ratio: number) {
    this.next = ratio;
  }
  push(input: Float32Array, out: number[]) {
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      this.index++;
      if (this.index >= this.next) {
        out.push(this.sum / this.count);
        this.sum = 0;
        this.count = 0;
        this.next += this.ratio;
      }
    }
  }
}

interface Frame {
  samples: Float32Array;
  rms: number;
  time: number; // performance.now() at the frame's start
  speech: boolean;
}

interface Segment {
  id: number;
  frames: Frame[];
  speechFrames: number;
  silenceRun: number;
  previewedMs: number;
}

export interface LiveTranscriberCallbacks {
  onFinal: (line: FinalLine) => void;
  onPreview: (text: string | null) => void;
}

const concat = (frames: Frame[]): Float32Array => {
  const out = new Float32Array(frames.length * FRAME);
  frames.forEach((frame, i) => out.set(frame.samples, i * FRAME));
  return out;
};

const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text);

/**
 * Transcribes one microphone stream until `stop()`. `muted` drops the audio (as the recording's mute does).
 */
export class LiveTranscriber {
  muted = false;
  private context: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private downsampler: Downsampler | null = null;
  private pending: number[] = []; // 16 kHz samples not yet in a frame
  private produced = 0; // 16 kHz samples produced so far
  private preRoll: Frame[] = [];
  private segment: Segment | null = null;
  private nextSegmentId = 1;
  private noiseFloor = 0.01;
  private finished = new Set<number>(); // Segments whose final text has arrived
  private previewOf: number | null = null;
  private stopped = false;
  private chain: Promise<void> = Promise.resolve(); // Final lines delivered in spoken order

  constructor(private stream: MediaStream, private callbacks: LiveTranscriberCallbacks) {}

  async start(): Promise<void> {
    const context = new AudioContext();
    this.context = context;
    this.downsampler = new Downsampler(context.sampleRate / SAMPLE_RATE);
    const source = context.createMediaStreamSource(this.stream);
    const url = URL.createObjectURL(new Blob([CAPTURE_PROCESSOR], { type: 'application/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (this.stopped) return;
    const capture = new AudioWorkletNode(context, 'wp-transcript-capture', { numberOfOutputs: 1, outputChannelCount: [1] });
    capture.port.onmessage = (event: MessageEvent) => this.onAudio(event.data as Float32Array);
    source.connect(capture);
    capture.connect(context.destination); // Pulls the graph; the node outputs silence
    this.nodes = [source, capture];
    if (context.state === 'suspended') await context.resume().catch(() => {});
  }

  stop() {
    this.stopped = true;
    this.nodes.forEach((node) => node.disconnect());
    this.nodes = [];
    this.context?.close().catch(() => {});
    this.context = null;
  }

  /** Ends the segment being spoken and resolves when its text (and everything before it) is in. */
  async flush(): Promise<void> {
    if (this.segment) this.commit(this.segment.frames.length);
    await this.chain;
  }

  private onAudio(block: Float32Array) {
    if (this.stopped || !this.downsampler) return;
    if (this.muted) {
      // Nothing is heard while muted: the words so far are finished, and the room's noise level is kept
      if (this.segment) this.commit(this.segment.frames.length);
      return;
    }
    const now = performance.now();
    this.downsampler.push(block, this.pending);
    while (this.pending.length >= FRAME) {
      const samples = Float32Array.from(this.pending.splice(0, FRAME));
      this.produced += FRAME;
      // The newest sample arrived about now; earlier ones are older by their distance from it
      const backlog = this.produced + this.pending.length;
      const time = now - ((backlog - (this.produced - FRAME)) / SAMPLE_RATE) * 1000;
      this.onFrame(samples, time);
    }
    this.maybePreview();
  }

  private onFrame(samples: Float32Array, time: number) {
    let energy = 0;
    for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
    const rms = Math.sqrt(energy / samples.length);
    // Noise floor: drops at once to a quieter frame, creeps up slowly (so speech does not raise it)
    this.noiseFloor = rms < this.noiseFloor ? rms : this.noiseFloor + (rms - this.noiseFloor) * 0.002;
    const speech = rms > Math.max(MIN_THRESHOLD, this.noiseFloor * NOISE_FACTOR);
    const frame: Frame = { samples, rms, time, speech };

    const segment = this.segment;
    if (!segment) {
      if (speech) {
        this.segment = { id: this.nextSegmentId++, frames: [...this.preRoll, frame], speechFrames: 1, silenceRun: 0, previewedMs: 0 };
        this.preRoll = [];
      } else {
        this.preRoll.push(frame);
        if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
      }
      return;
    }

    segment.frames.push(frame);
    if (speech) {
      segment.speechFrames++;
      segment.silenceRun = 0;
    } else {
      segment.silenceRun++;
    }
    if (segment.silenceRun * FRAME_MS >= END_SILENCE_MS) {
      this.commit(segment.frames.length - segment.silenceRun + TRAILING_SILENCE_FRAMES);
    } else if (segment.frames.length * FRAME_MS >= MAX_SEGMENT_MS) {
      // Cut at the quietest frame of the last 1.5 s; what follows starts the next segment
      const from = Math.max(1, segment.frames.length - Math.round(CUT_SEARCH_MS / FRAME_MS));
      let cut = from;
      for (let i = from; i < segment.frames.length; i++) if (segment.frames[i].rms < segment.frames[cut].rms) cut = i;
      this.commit(cut + 1);
    }
  }

  /** Sends the first `length` frames of the current segment off as final; the rest (if any) carries on. */
  private commit(length: number) {
    const segment = this.segment;
    if (!segment) return;
    const frames = segment.frames.slice(0, Math.min(length, segment.frames.length));
    const rest = segment.frames.slice(frames.length);
    const restSpeech = rest.filter((f) => f.speech).length;
    this.segment = restSpeech > 0 ? { id: this.nextSegmentId++, frames: rest, speechFrames: restSpeech, silenceRun: 0, previewedMs: 0 } : null;
    if (!this.segment) this.preRoll = rest.slice(-PRE_ROLL_FRAMES);

    const speechMs = frames.filter((f) => f.speech).length * FRAME_MS;
    if (speechMs < MIN_SPEECH_MS || frames.length === 0) {
      this.finish(segment.id);
      return;
    }
    const id = segment.id;
    const start = frames[0].time;
    const end = frames[frames.length - 1].time + FRAME_MS;
    const job = speechEngine().transcribe(concat(frames));
    const result = job ? job.catch(() => '') : Promise.resolve('');
    // Lines are delivered in the order they were spoken
    this.chain = this.chain.then(async () => {
      const text = (await result).trim();
      this.finish(id);
      if (hasWords(text)) this.callbacks.onFinal({ id, start, end, text });
    });
  }

  private finish(id: number) {
    this.finished.add(id);
    if (this.previewOf === id) {
      this.previewOf = null;
      this.callbacks.onPreview(null);
    }
  }

  private maybePreview() {
    const segment = this.segment;
    if (!segment) return;
    const ms = segment.frames.length * FRAME_MS;
    if (ms < PREVIEW_MIN_MS || ms - segment.previewedMs < PREVIEW_STEP_MS) return;
    const job = speechEngine().transcribe(concat(segment.frames), true);
    if (!job) return;
    segment.previewedMs = ms;
    const id = segment.id;
    job.then(
      (text: string) => {
        if (this.stopped || this.finished.has(id) || !hasWords(text)) return;
        this.previewOf = id;
        this.callbacks.onPreview(text.trim());
      },
      () => {}
    );
  }
}
