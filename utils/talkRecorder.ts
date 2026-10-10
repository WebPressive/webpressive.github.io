import { Annotation, AudienceState, CameraSettings, ClipData, ClipSummary, TimelineEvent } from '../types';
import { deleteClips, putChunk, putClip, summaryOf } from './recordingStore';

// What the recorder needs to know about the audience view; App passes a new one on every change
export interface RecorderInput {
  state: AudienceState;
  annotations: Annotation[]; // Ink on state.index
  draft: Annotation | null; // Stroke being drawn on state.index
  camera: CameraSettings;
}

const CHUNK_MS = 1000; // MediaRecorder timeslice: a crash loses at most this much
const CLIP_FLUSH_MS = 5000; // Timeline saved this often while a clip records
const DRAFT_MIN_INTERVAL_MS = 40; // Live strokes sampled at up to 25 per second
const MIN_CLIP_MS = 250; // Shorter clips (slides flipped past) are dropped
const VIDEO_BITS_PER_SECOND = 2_500_000; // 720p camera: a clear face (~1.1 GB per hour stored)
const AUDIO_BITS_PER_SECOND = 96_000;

export function pickMimeType(hasVideo: boolean): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = hasVideo
    ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && pickMimeType(false) !== '';
}

const round = (value: number) => Math.round(value * 10000) / 10000;
const roundPoint = (p: { x: number; y: number } | null) => (p ? { x: round(p.x), y: round(p.y) } : null);

// Fields of `next` that differ from `prev` (positions rounded, so sub-pixel jitter is not stored)
function stateDiff(prev: AudienceState, next: AudienceState): Partial<AudienceState> | null {
  const diff: Partial<AudienceState> = {};
  let changed = false;
  (Object.keys(next) as (keyof AudienceState)[]).forEach((key) => {
    const a = prev[key];
    const b = next[key];
    if (a === b) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b)) return;
    (diff as Record<string, unknown>)[key] = key === 'spotlightPosition' || key === 'laserPosition' ? roundPoint(b as { x: number; y: number } | null) : b;
    changed = true;
  });
  return changed ? diff : null;
}

interface ActiveClip {
  data: ClipData;
  recorder: MediaRecorder;
  videoTrack: MediaStreamTrack | null; // Our clone of the camera track, stopped with the clip
  t0: number;
  seq: number;
  writes: Promise<void>[];
  flushTimer: ReturnType<typeof setInterval>;
  lastDraftAt: number;
}

export interface TalkRecorderCallbacks {
  onClipStarted?: (clip: ClipSummary) => void;
  onClipFinished?: (clip: ClipSummary) => void; // Not called for dropped (too short) clips
  onClipDropped?: (clipId: string) => void;
  onError?: (message: string) => void;
}

/**
 * Records a talk as a series of clips. Each clip holds one slide with the camera either shown or not,
 * its microphone (+ camera) media from a MediaRecorder, and a timeline of what the audience saw.
 * A slide change, showing/hiding the camera, or a pause ends the clip; the next one starts at once.
 */
export class TalkRecorder {
  status: 'recording' | 'paused' | 'stopped' = 'paused';
  private active: ActiveClip | null = null;
  private latest: RecorderInput;
  private videoTrack: MediaStreamTrack | null;
  private finishedMs = 0;
  private pending: Promise<void>[] = [];

  constructor(
    private recordingId: string,
    private mic: MediaStream,
    input: RecorderInput,
    videoTrack: MediaStreamTrack | null,
    private callbacks: TalkRecorderCallbacks = {}
  ) {
    this.latest = input;
    this.videoTrack = videoTrack;
  }

  start() {
    if (this.status !== 'paused') return;
    this.status = 'recording';
    this.startClip();
  }

  /** Recorded time so far (pauses excluded). */
  elapsedMs(): number {
    return this.finishedMs + (this.active ? performance.now() - this.active.t0 : 0);
  }

  update(input: RecorderInput) {
    const prev = this.latest;
    this.latest = input;
    const clip = this.active;
    if (this.status !== 'recording' || !clip) return;
    if (input.state.index !== clip.data.slideIndex) {
      this.roll();
      return;
    }
    const t = Math.round(performance.now() - clip.t0);
    const events = clip.data.events;
    const diff = stateDiff(prev.state, input.state);
    if (diff) events.push({ t, k: 's', d: diff });
    if (input.annotations !== prev.annotations) events.push({ t, k: 'a', d: input.annotations });
    if (input.draft !== prev.draft) {
      const changesStroke = !input.draft || !prev.draft || input.draft.id !== prev.draft.id;
      if (changesStroke || t - clip.lastDraftAt >= DRAFT_MIN_INTERVAL_MS) {
        events.push({ t, k: 'd', d: input.draft });
        clip.lastDraftAt = t;
      }
    }
    if (input.camera !== prev.camera) events.push({ t, k: 'c', d: input.camera });
  }

  /** The camera picture to record (null: audio only). A change starts a new clip. */
  setVideoTrack(track: MediaStreamTrack | null) {
    if (track === this.videoTrack) return;
    this.videoTrack = track;
    if (this.status === 'recording') this.roll();
  }

  pause() {
    if (this.status !== 'recording') return;
    this.status = 'paused';
    this.endClip(this.active);
    this.active = null;
  }

  resume() {
    if (this.status !== 'paused') return;
    this.status = 'recording';
    this.startClip();
  }

  /** Ends the recording; resolves once every clip is saved. */
  async stop(): Promise<void> {
    if (this.status === 'stopped') return;
    this.status = 'stopped';
    this.endClip(this.active);
    this.active = null;
    await Promise.all(this.pending);
  }

  // The next clip starts before the previous one stops, so no sound falls between them
  private roll() {
    const previous = this.active;
    this.startClip();
    this.endClip(previous);
  }

  private startClip() {
    const videoTrack = this.videoTrack && this.videoTrack.readyState === 'live' ? this.videoTrack.clone() : null;
    const mimeType = pickMimeType(!!videoTrack);
    const tracks = [...this.mic.getAudioTracks(), ...(videoTrack ? [videoTrack] : [])];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(new MediaStream(tracks), {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
        videoBitsPerSecond: videoTrack ? VIDEO_BITS_PER_SECOND : undefined,
      });
    } catch (error) {
      videoTrack?.stop();
      this.active = null;
      this.callbacks.onError?.(`Recording could not start: ${(error as Error).message}`);
      return;
    }

    const { state, annotations, camera } = this.latest;
    const data: ClipData = {
      id: crypto.randomUUID(),
      recordingId: this.recordingId,
      slideIndex: state.index,
      durationMs: 0,
      bytes: 0,
      hasVideo: !!videoTrack,
      mimeType: recorder.mimeType || mimeType,
      createdAt: Date.now(),
      complete: false,
      initial: { state, annotations, camera },
      events: [],
    };
    const clip: ActiveClip = {
      data,
      recorder,
      videoTrack,
      t0: performance.now(),
      seq: 0,
      writes: [],
      flushTimer: setInterval(() => {
        data.durationMs = Math.round(performance.now() - clip.t0);
        clip.writes.push(putClip({ ...data, events: [...data.events] }).catch(() => {}));
      }, CLIP_FLUSH_MS),
      lastDraftAt: -Infinity,
    };
    recorder.ondataavailable = (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;
      data.bytes += event.data.size;
      clip.writes.push(
        putChunk(data.id, clip.seq++, event.data).catch((error: unknown) => {
          this.callbacks.onError?.(`Could not save the recording: ${(error as Error)?.message ?? error}. The disk may be full.`);
        })
      );
    };
    recorder.onerror = (event: Event) => {
      this.callbacks.onError?.(`Recording stopped with an error: ${(event as unknown as { error?: Error }).error?.message ?? 'unknown'}`);
    };
    this.active = clip;
    recorder.start(CHUNK_MS);
    clip.writes.push(putClip(data).catch(() => {}));
    this.callbacks.onClipStarted?.(summaryOf(data));
  }

  private endClip(clip: ActiveClip | null) {
    if (!clip) return;
    clearInterval(clip.flushTimer);
    const durationMs = Math.round(performance.now() - clip.t0);
    // stop() delivers the last chunk, then fires 'stop'
    const stopped =
      clip.recorder.state === 'inactive'
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            clip.recorder.addEventListener('stop', () => resolve(), { once: true });
            clip.recorder.stop();
          });
    this.finishedMs += durationMs;

    const saved = (async () => {
      await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 3000))]);
      clip.videoTrack?.stop();
      await Promise.all(clip.writes);
      const data = clip.data;
      if (durationMs < MIN_CLIP_MS) {
        // A slide flipped past: not worth a clip
        this.finishedMs -= durationMs;
        await deleteClips([data.id]).catch(() => {});
        this.callbacks.onClipDropped?.(data.id);
        return;
      }
      data.durationMs = durationMs;
      data.complete = true;
      await putClip(data);
      this.callbacks.onClipFinished?.(summaryOf(data));
    })().catch((error: unknown) => {
      this.callbacks.onError?.(`Could not save a recording clip: ${(error as Error)?.message ?? error}`);
    });
    this.pending.push(saved);
  }
}
