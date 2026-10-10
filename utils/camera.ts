import React, { useEffect, useRef, useState } from 'react';
import { CameraSettings, SlideCamera } from '../types';
import { ImageBounds } from './slideImageBounds';

// The presenter window shares its live camera with the projector window it opened
declare global {
  interface Window {
    webpressiveCameraStream?: MediaStream | null;
  }
}

export const CAMERA_SCHEME = 'wpcamera:';
const CAMERA_SETTINGS_KEY = 'webpressive_camera';

export const CAMERA_SIZE_MIN = 0.1; // Camera width, fraction of the slide width
export const CAMERA_SIZE_MAX = 0.4;
const CAMERA_MARGIN = 0.025; // Gap between a corner-placed camera and the slide edges, fraction of the slide width
const RECTANGLE_ASPECT = 16 / 9; // Rounded and rectangle shapes; the video is cropped to fill

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  videoDeviceId: '',
  audioDeviceId: '',
  position: 'bottom-right',
  size: 0.2,
  shape: 'circle',
  mirror: true,
  border: true,
};

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const SHAPES = ['circle', 'rounded', 'rectangle'];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Saved settings, with anything missing or malformed replaced by the default
export function loadCameraSettings(): CameraSettings {
  const settings = { ...DEFAULT_CAMERA_SETTINGS };
  try {
    const saved = JSON.parse(localStorage.getItem(CAMERA_SETTINGS_KEY) || '{}');
    if (typeof saved.videoDeviceId === 'string') settings.videoDeviceId = saved.videoDeviceId;
    if (typeof saved.audioDeviceId === 'string') settings.audioDeviceId = saved.audioDeviceId;
    if (CORNERS.includes(saved.position)) settings.position = saved.position;
    else if (saved.position && isFinite(saved.position.x) && isFinite(saved.position.y)) {
      settings.position = { x: clamp(saved.position.x, 0, 1), y: clamp(saved.position.y, 0, 1) };
    }
    if (isFinite(saved.size)) settings.size = clamp(saved.size, CAMERA_SIZE_MIN, CAMERA_SIZE_MAX);
    if (SHAPES.includes(saved.shape)) settings.shape = saved.shape;
    if (typeof saved.mirror === 'boolean') settings.mirror = saved.mirror;
    if (typeof saved.border === 'boolean') settings.border = saved.border;
  } catch {
    // Unreadable storage: defaults
  }
  return settings;
}

export function storeCameraSettings(settings: CameraSettings) {
  try {
    localStorage.setItem(CAMERA_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked (private window): settings last for this session only
  }
}

/**
 * Classifies a raw link URI: `wpcamera:` (or any argument other than off) places the camera in the link's
 * box on that slide; `wpcamera:off` hides it there. Null for every other link.
 */
export function getCameraMarker(raw: string | undefined): 'place' | 'hide' | null {
  if (!raw || !raw.toLowerCase().startsWith(CAMERA_SCHEME)) return null;
  const arg = raw.slice(CAMERA_SCHEME.length).trim().toLowerCase();
  return arg === 'off' || arg === 'hide' ? 'hide' : 'place';
}

/**
 * The camera's box in the same pixel space as `bounds` (the unzoomed slide frame), or null when the slide
 * hides the camera. A `wpcamera:` box from the PDF wins over the corner/free position of the settings.
 */
export function cameraBox(settings: CameraSettings, slideCamera: SlideCamera | undefined, bounds: ImageBounds): ImageBounds | null {
  if (slideCamera?.hidden) return null;

  if (slideCamera) {
    let x = bounds.x + slideCamera.x * bounds.width;
    let y = bounds.y + slideCamera.y * bounds.height;
    let width = slideCamera.width * bounds.width;
    let height = slideCamera.height * bounds.height;
    if (settings.shape === 'circle') {
      // The largest square centred in the box
      const side = Math.min(width, height);
      x += (width - side) / 2;
      y += (height - side) / 2;
      width = height = side;
    }
    return { x, y, width, height };
  }

  const width = settings.size * bounds.width;
  const height = settings.shape === 'circle' ? width : width / RECTANGLE_ASPECT;
  const position = settings.position;
  let x: number;
  let y: number;
  if (typeof position === 'string') {
    const margin = CAMERA_MARGIN * bounds.width;
    x = position.endsWith('left') ? bounds.x + margin : bounds.x + bounds.width - margin - width;
    y = position.startsWith('top') ? bounds.y + margin : bounds.y + bounds.height - margin - height;
  } else {
    x = bounds.x + position.x * bounds.width - width / 2;
    y = bounds.y + position.y * bounds.height - height / 2;
  }
  // Keep the whole camera on the slide
  x = clamp(x, bounds.x, bounds.x + bounds.width - width);
  y = clamp(y, bounds.y, bounds.y + bounds.height - height);
  return { x, y, width, height };
}

// --- Capture ---

export function isCaptureAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

// A capture failure in words the presenter can act on
export function captureErrorMessage(error: unknown, device: 'camera' | 'microphone'): string {
  if (!isCaptureAvailable()) {
    return `The ${device} needs a secure page: open WebPressive over https:// or on localhost.`;
  }
  const name = (error as { name?: string })?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `${device === 'camera' ? 'Camera' : 'Microphone'} access is blocked. Allow it in the browser's site settings (the icon left of the address), then try again.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No ${device} found. Connect one and try again.`;
    case 'NotReadableError':
    case 'AbortError':
      return `The ${device} is busy or could not start. Close other apps that use it (video calls) and try again.`;
    case 'TrackEndedError':
      return `The ${device} stopped (unplugged or taken by another app).`;
    default:
      return `The ${device} could not start${error instanceof Error && error.message ? `: ${error.message}` : '.'}`;
  }
}

export function openCamera(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      // `ideal`: a saved camera that is gone falls back to the default one instead of failing
      deviceId: deviceId ? { ideal: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  });
}

export function openMicrophone(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { ideal: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Holds a capture stream while `enabled`: opens it with `open` (again whenever `key` changes) and stops
 * every track when disabled or unmounted, so the device (and its light) is released.
 * `error` is a message for the presenter, set when opening fails or the device stops.
 */
function useCaptureStream(
  enabled: boolean,
  key: string,
  open: () => Promise<MediaStream>,
  device: 'camera' | 'microphone'
): { stream: MediaStream | null; error: string | null } {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!enabled) {
      setStream(null);
      return;
    }
    let cancelled = false;
    let current: MediaStream | null = null;
    setError(null);

    if (!isCaptureAvailable()) {
      setError(captureErrorMessage(null, device));
      return;
    }

    openRef.current().then(
      (opened: MediaStream) => {
        if (cancelled) {
          stopStream(opened);
          return;
        }
        current = opened;
        opened.getTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            if (cancelled) return;
            setError(captureErrorMessage({ name: 'TrackEndedError' }, device));
            setStream(null);
          });
        });
        setStream(opened);
      },
      (err: unknown) => {
        if (cancelled) return;
        console.warn(`Could not open the ${device}:`, err);
        setError(captureErrorMessage(err, device));
        setStream(null);
      }
    );

    return () => {
      cancelled = true;
      stopStream(current);
      setStream(null);
    };
  }, [enabled, key, device]);

  return { stream, error };
}

// `attempt`: bump it to try again after a failure with the same device
export function useCameraStream(enabled: boolean, deviceId: string, attempt = 0) {
  return useCaptureStream(enabled, `${deviceId}#${attempt}`, () => openCamera(deviceId), 'camera');
}

export function useMicrophoneStream(enabled: boolean, deviceId: string) {
  return useCaptureStream(enabled, deviceId, () => openMicrophone(deviceId), 'microphone');
}

/**
 * Cameras and microphones of this computer. Labels are empty until the page has been granted access,
 * so the list is read again when `refreshKey` changes (pass the open stream) and on device plug/unplug.
 */
export function useMediaDevices(refreshKey: unknown): { cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[] } {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    const read = () => {
      mediaDevices.enumerateDevices().then(
        (list: MediaDeviceInfo[]) => {
          if (!cancelled) setDevices(list);
        },
        () => {}
      );
    };
    read();
    mediaDevices.addEventListener?.('devicechange', read);
    return () => {
      cancelled = true;
      mediaDevices.removeEventListener?.('devicechange', read);
    };
  }, [refreshKey]);

  // Before access is granted the browser lists placeholder devices with empty ids: leave those out
  return {
    cameras: devices.filter((d) => d.kind === 'videoinput' && d.deviceId),
    microphones: devices.filter((d) => d.kind === 'audioinput' && d.deviceId),
  };
}

/** Live input level of an audio stream, 0 (silence) to 1, updated every frame. */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    context.resume().catch(() => {});
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      // Speech sits around 0.02-0.2 RMS; a square-root curve makes quiet input visible, and only
      // near-clipping input (RMS above ~0.36) reaches the red end of the meter
      setLevel(Math.min(1, Math.sqrt(rms * 2)));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      context.close().catch(() => {});
    };
  }, [stream]);

  return level;
}

/**
 * The presenter's live camera stream, when this window was opened by the presenter window and the stream
 * is the one announced in CAMERA_SYNC. Null otherwise (the caller then opens the camera itself).
 */
export function getOpenerCameraStream(streamId: string | undefined): MediaStream | null {
  if (!streamId) return null;
  try {
    const stream = window.opener?.webpressiveCameraStream as MediaStream | null | undefined;
    if (stream && stream.id === streamId && stream.getVideoTracks().some((t) => t.readyState === 'live')) {
      return stream;
    }
  } catch {
    // Opener from another origin, or already closed
  }
  return null;
}

/** Plays `stream` in a <video> element (srcObject cannot be set as a React prop). */
export function useVideoStream(videoRef: React.RefObject<HTMLVideoElement>, stream: MediaStream | null) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (stream) video.play().catch(() => {});
  });
}
