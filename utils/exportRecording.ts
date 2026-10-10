import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  QUALITY_HIGH,
  WavOutputFormat,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import type { AudioCodec, OutputFormat, VideoCodec, WrappedCanvas } from 'mediabunny';
import { ClipData, MediaMap, RecordingMeta, SlideData } from '../types';
import { getClip, getClipBlob } from './recordingStore';
import { TimelineCursor } from './timelineCursor';
import { AnimatedMedia, CompositorAssets, drawFrame } from './compositor';

export type ExportKind = 'video' | 'audio';

export interface ExportOptions {
  kind: ExportKind;
  height: number; // Video height in pixels (the width follows the slides' aspect ratio)
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

const FPS = 30;
const SAMPLE_RATE = 48000; // Opus decodes at 48 kHz

/** The file a recording becomes: a video, or its sound only. Picks what this browser can encode. */
async function chooseFormat(kind: ExportKind, width: number, height: number) {
  const audioOptions = { numberOfChannels: 1, sampleRate: SAMPLE_RATE };
  const aac = await canEncodeAudio('aac', audioOptions);
  const opus = await canEncodeAudio('opus', audioOptions);
  if (kind === 'audio') {
    if (aac) return { format: new Mp4OutputFormat({ fastStart: 'in-memory' }) as OutputFormat, audio: 'aac' as AudioCodec, extension: 'm4a', mime: 'audio/mp4' };
    if (opus) return { format: new OggOutputFormat() as OutputFormat, audio: 'opus' as AudioCodec, extension: 'ogg', mime: 'audio/ogg' };
    return { format: new WavOutputFormat() as OutputFormat, audio: 'pcm-s16' as AudioCodec, extension: 'wav', mime: 'audio/wav' };
  }
  const videoOptions = { width, height };
  if (await canEncodeVideo('avc', videoOptions)) {
    // H.264 plays everywhere; AAC sound where the system has an encoder (Windows, macOS), else Opus
    return { format: new Mp4OutputFormat({ fastStart: 'in-memory' }) as OutputFormat, video: 'avc' as VideoCodec, audio: (aac ? 'aac' : 'opus') as AudioCodec, extension: 'mp4', mime: 'video/mp4' };
  }
  const video: VideoCodec | null = (await canEncodeVideo('vp9', videoOptions)) ? 'vp9' : (await canEncodeVideo('vp8', videoOptions)) ? 'vp8' : null;
  if (!video || !opus) throw new Error('This browser cannot encode video. Use a current Chrome or Edge, or the desktop app.');
  return { format: new WebMOutputFormat() as OutputFormat, video, audio: 'opus' as AudioCodec, extension: 'webm', mime: 'video/webm' };
}

const abortError = () => new DOMException('Export cancelled', 'AbortError');

async function blobOf(slide: SlideData): Promise<Blob> {
  if (slide.file) return slide.file;
  return (await fetch(slide.src)).blob();
}

// GIF frames by time, decoded on demand (one frame kept)
async function gifMedia(blob: Blob): Promise<AnimatedMedia | null> {
  const ImageDecoderClass = (window as unknown as { ImageDecoder?: any }).ImageDecoder;
  if (!ImageDecoderClass) return null;
  const decoder = new ImageDecoderClass({ data: await blob.arrayBuffer(), type: 'image/gif' });
  await decoder.tracks.ready;
  const count: number = decoder.tracks.selectedTrack?.frameCount ?? 1;
  const starts: number[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    const ms = (image.duration ?? 0) / 1000;
    image.close();
    starts.push(total);
    total += ms > 10 ? ms : 100; // Browsers show 0-10 ms GIF frames for 100 ms
  }
  let current: { index: number; frame: VideoFrame } | null = null;
  return {
    durationMs: total,
    async frameAt(ms: number) {
      let index = 0;
      while (index + 1 < starts.length && starts[index + 1] <= ms) index++;
      if (current?.index === index) return current.frame;
      const { image } = await decoder.decode({ frameIndex: index });
      current?.frame.close();
      current = { index, frame: image };
      return image;
    },
    close() {
      current?.frame.close();
      decoder.close();
    },
  };
}

// Looping video media (MP4/WebM over a still), muted as on screen
async function videoMedia(blob: Blob): Promise<AnimatedMedia | null> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) return null;
  const first = await track.getFirstTimestamp();
  const durationMs = ((await track.computeDuration()) - first) * 1000;
  const sink = new CanvasSink(track, { poolSize: 2 });
  return {
    durationMs,
    async frameAt(ms: number) {
      return (await sink.getCanvas(first + ms / 1000))?.canvas ?? null;
    },
    close() {
      input.dispose?.();
    },
  };
}

function createAssets(slides: SlideData[], mediaMap: MediaMap, W: number, H: number) {
  const scaled = new Map<number, Promise<ImageBitmap | null>>();
  const full = new Map<number, Promise<ImageBitmap | null>>();
  const media = new Map<string, Promise<AnimatedMedia | null>>();
  const assets: CompositorAssets = {
    slide(index, fullResolution) {
      const cache = fullResolution ? full : scaled;
      if (!cache.has(index)) {
        const slide = slides[index];
        cache.set(
          index,
          slide
            ? blobOf(slide)
                .then((blob) => (fullResolution ? createImageBitmap(blob) : createImageBitmap(blob, { resizeWidth: W, resizeHeight: H, resizeQuality: 'high' })))
                .catch(() => null)
            : Promise.resolve(null)
        );
      }
      return cache.get(index)!;
    },
    media(src) {
      if (!media.has(src)) {
        const url = mediaMap[src];
        media.set(
          src,
          url
            ? fetch(url)
                .then((r) => r.blob())
                .then((blob) => (/\.gif$/i.test(src) ? gifMedia(blob) : videoMedia(blob)))
                .catch((error) => {
                  console.warn(`Export: could not decode "${src}"; its still is used`, error);
                  return null;
                })
            : Promise.resolve(null)
        );
      }
      return media.get(src)!;
    },
  };
  const close = async () => {
    for (const bitmap of [...scaled.values(), ...full.values()]) (await bitmap)?.close();
    for (const m of media.values()) (await m)?.close();
  };
  return { assets, close };
}

/** One clip's sound as a mono buffer of exactly its recorded length (silence where nothing decodes). */
async function clipAudio(input: Input, clip: ClipData): Promise<AudioBuffer> {
  const length = Math.max(1, Math.round((clip.durationMs / 1000) * SAMPLE_RATE));
  const samples = new Float32Array(length);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (track && (await track.canDecode())) {
      const first = await track.getFirstTimestamp();
      for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
        const ratio = buffer.sampleRate / SAMPLE_RATE;
        const start = Math.round((timestamp - first) * SAMPLE_RATE);
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
        const outLength = Math.floor(buffer.length / ratio);
        for (let i = 0; i < outLength; i++) {
          const at = start + i;
          if (at < 0) continue;
          if (at >= length) break;
          const src = Math.min(buffer.length - 1, Math.round(i * ratio));
          let sum = 0;
          for (const data of channels) sum += data[src];
          samples[at] = sum / channels.length; // Downmix to mono
        }
      }
    }
  } catch (error) {
    console.warn('Export: a clip\'s sound could not be decoded; it is silent in the file', error);
  }
  const audio = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: SAMPLE_RATE });
  audio.copyToChannel(samples, 0);
  return audio;
}

/**
 * Renders a recording to one file: the audience view frame by frame with the camera and sound
 * ('video'), or the sound only ('audio'). Runs faster than real time where the machine allows.
 */
export async function exportRecording(
  recording: RecordingMeta,
  slides: SlideData[],
  mediaMap: MediaMap,
  { kind, height, signal, onProgress }: ExportOptions
): Promise<{ blob: Blob; extension: string }> {
  const clips = (await Promise.all(recording.clips.map((c) => getClip(c.id)))).filter((c): c is ClipData => !!c && c.durationMs > 0);
  if (clips.length === 0) throw new Error('This recording has nothing to export.');

  // Output size: the slides' aspect ratio at the chosen height, even dimensions for the encoder
  let aspect = 16 / 9;
  try {
    const first = await createImageBitmap(await blobOf(slides[0]));
    aspect = first.width / first.height;
    first.close();
  } catch {
    // Keep 16:9
  }
  const H = Math.round(height / 2) * 2;
  const W = Math.round((H * aspect) / 2) * 2;

  const plan = await chooseFormat(kind, W, H);
  const output = new Output({ format: plan.format, target: new BufferTarget() });
  const audioSource = new AudioBufferSource({ codec: plan.audio, bitrate: QUALITY_HIGH });
  output.addAudioTrack(audioSource);

  let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  let videoSource: CanvasSource | null = null;
  if (plan.video) {
    canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    // About 0.08 bits per pixel per frame: 4.4 Mbit/s at 1680x1080, 8 Mbit/s at 1440p. An upper bound: still
    // slides take far less, so text stays sharp without large files.
    videoSource = new CanvasSource(canvas, { codec: plan.video, bitrate: Math.round(W * H * FPS * 0.08), keyFrameInterval: 5 });
    output.addVideoTrack(videoSource, { frameRate: FPS });
  }
  await output.start();

  const { assets, close } = createAssets(slides, mediaMap, W, H);
  const totalMs = clips.reduce((sum, c) => sum + c.durationMs, 0);
  const totalFrames = Math.ceil((totalMs / 1000) * FPS);
  let framesDone = 0;
  let clipStartMs = 0;
  // The camera picture on screen, copied out of the decoder's reused canvases. It stays until the next
  // camera frame is due (webcams deliver frames unevenly), also across a clip change.
  const heldCamera = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(2, 2) : Object.assign(document.createElement('canvas'), { width: 2, height: 2 });
  const heldCtx = heldCamera.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  let hasHeldCamera = false;
  const holdCamera = (picture: CanvasImageSource | null): CanvasImageSource | null => {
    if (picture) {
      const { width, height } = picture as HTMLCanvasElement | OffscreenCanvas;
      if (heldCamera.width !== width || heldCamera.height !== height) {
        heldCamera.width = width;
        heldCamera.height = height;
      }
      heldCtx.drawImage(picture, 0, 0);
      hasHeldCamera = true;
    }
    return hasHeldCamera ? heldCamera : null;
  };
  // Animations restart when their slide is (re)entered or turned back on, as on screen
  let mediaEpochMs = 0;
  let lastMediaKey = '';

  try {
    for (let c = 0; c < clips.length; c++) {
      if (signal?.aborted) throw abortError();
      const clip = clips[c];
      const input = new Input({ source: new BlobSource(await getClipBlob(clip.id, clip.mimeType)), formats: ALL_FORMATS });
      // This clip's camera frames, read in order as a player does (closed in `finally`, also on cancel).
      // Each output frame shows the latest camera frame at or before its moment. (Asking the decoder for
      // "the frame at time t" instead returned nothing for long stretches with real webcams' uneven timing.)
      let cameraFrames: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;
      let nextCamera: WrappedCanvas | null = null;
      let cameraFirst = 0;
      try {
        await audioSource.add(await clipAudio(input, clip));

        if (videoSource && ctx) {
          const cursor = new TimelineCursor(clip);
          // Output frames that fall inside this clip
          const firstFrame = Math.ceil((clipStartMs / 1000) * FPS);
          const endFrame = Math.ceil(((clipStartMs + clip.durationMs) / 1000) * FPS);
          const times = Array.from({ length: Math.max(0, endFrame - firstFrame) }, (_, i) => ((firstFrame + i) * 1000) / FPS - clipStartMs);

          if (clip.hasVideo) {
            try {
              const track = await input.getPrimaryVideoTrack();
              if (track && (await track.canDecode())) {
                cameraFirst = await track.getFirstTimestamp();
                const sink = new CanvasSink(track, { width: Math.min(1280, track.displayWidth), poolSize: 3 });
                cameraFrames = sink.canvases();
                nextCamera = (await cameraFrames.next()).value || null;
                if (!hasHeldCamera && nextCamera) holdCamera(nextCamera.canvas); // Nothing earlier to show yet
              }
            } catch (error) {
              console.warn('Export: a clip\'s camera could not be decoded', error);
            }
          }

          for (let i = 0; i < times.length; i++) {
            if (signal?.aborted) throw abortError();
            const frame = cursor.at(times[i]);
            const globalMs = clipStartMs + times[i];
            const mediaKey = `${frame.state.index}|${frame.state.isMediaActive}|${frame.state.mode}`;
            if (mediaKey !== lastMediaKey) {
              lastMediaKey = mediaKey;
              mediaEpochMs = globalMs;
            }
            let camera: CanvasImageSource | null = null;
            if (cameraFrames) {
              const at = cameraFirst + times[i] / 1000 + 0.001;
              while (nextCamera && nextCamera.timestamp <= at) {
                holdCamera(nextCamera.canvas);
                nextCamera = (await cameraFrames.next()).value || null;
              }
              camera = holdCamera(null);
            }
            await drawFrame(ctx, W, H, frame, slides, assets, camera, globalMs - mediaEpochMs);
            await videoSource.add((firstFrame + i) / FPS, 1 / FPS);
            framesDone++;
            if (framesDone % 15 === 0) onProgress?.(framesDone / totalFrames);
          }
        } else {
          onProgress?.((clipStartMs + clip.durationMs) / totalMs);
        }
      } finally {
        await cameraFrames?.return(undefined).catch(() => {});
        input.dispose?.();
      }
      clipStartMs += clip.durationMs;
    }
    await output.finalize();
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {});
    throw error;
  } finally {
    await close();
  }

  onProgress?.(1);
  const buffer = (output.target as BufferTarget).buffer!;
  return { blob: new Blob([buffer], { type: plan.mime }), extension: plan.extension };
}

/** Saves a file through the browser's download (the desktop app asks where to save it). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
