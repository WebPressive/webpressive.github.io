import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ClipData, MediaMap, RecordingMeta, SlideData } from '../types';
import AudienceView from './AudienceView';
import { formatDuration, getClip, getClipBlob, getRecording } from '../utils/recordingStore';
import { PlaybackFrame, TimelineCursor } from '../utils/timelineCursor';
import { RecordingExport } from '../utils/useRecordingExport';

interface PlaybackViewProps {
  recordingId: string;
  startClip?: number;
  slides: SlideData[];
  mediaMap: MediaMap;
  exporter: RecordingExport;
  onClose: () => void;
}

const SPEEDS = [1, 1.25, 1.5, 2];
const CONTROLS_HIDE_MS = 2500;

/**
 * Plays a recording in the presenter window: each clip's sound and camera from its media file, and
 * what the audience saw from its timeline, drawn by the same AudienceView as the projector window.
 * Space plays/pauses, ←/→ go to the previous/next clip, Esc closes.
 */
const PlaybackView: React.FC<PlaybackViewProps> = ({ recordingId, startClip = 0, slides, mediaMap, exporter, onClose }) => {
  const [recording, setRecording] = useState<RecordingMeta | null>(null);
  const [clips, setClips] = useState<ClipData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clipIndex, setClipIndex] = useState(startClip);
  const [src, setSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState<PlaybackFrame | null>(null);
  const [time, setTime] = useState(0); // ms into the whole recording, for the controls
  const [showControls, setShowControls] = useState(true);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cursorRef = useRef<TimelineCursor | null>(null);
  const frameRef = useRef<PlaybackFrame | null>(null);
  const pendingSeekRef = useRef(0); // ms into the clip being loaded
  const loadingRef = useRef(true); // The <video> still holds the previous clip (or nothing)
  // Object URLs of the current and next clip (the next one is read ahead, so switching is quick)
  const urlsRef = useRef(new Map<string, Promise<string>>());
  // The camera picture is frozen over the player while the next clip loads, so it does not blink at slide changes
  const holdRef = useRef<HTMLCanvasElement>(null);
  const [isHolding, setIsHolding] = useState(false);
  const scrubbingRef = useRef(false);

  // Clip start times within the whole recording
  const offsets = useMemo(() => {
    let sum = 0;
    return (clips ?? []).map((clip) => {
      const start = sum;
      sum += clip.durationMs;
      return start;
    });
  }, [clips]);
  const total = clips ? clips.reduce((sum, clip) => sum + clip.durationMs, 0) : 0;
  const clip = clips?.[clipIndex] ?? null;

  const live = useRef({ clipIndex, clips, offsets, isPlaying, speed });
  live.current = { clipIndex, clips, offsets, isPlaying, speed };

  // Load the recording and every clip's timeline
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await getRecording(recordingId);
      if (!meta) throw new Error('This recording no longer exists.');
      const loaded = (await Promise.all(meta.clips.map((c) => getClip(c.id)))).filter((c): c is ClipData => !!c && c.durationMs > 0);
      if (loaded.length === 0) throw new Error('This recording has nothing to play.');
      if (cancelled) return;
      setRecording(meta);
      setClips(loaded);
      setClipIndex(Math.min(Math.max(0, startClip), loaded.length - 1));
    })().catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [recordingId, startClip]);

  const clipUrl = (c: ClipData): Promise<string> => {
    const urls = urlsRef.current;
    if (!urls.has(c.id)) urls.set(c.id, getClipBlob(c.id, c.mimeType).then((blob: Blob) => URL.createObjectURL(blob)));
    return urls.get(c.id)!;
  };

  // Load the current clip's media and timeline; read the next clip ahead
  useEffect(() => {
    if (!clip || !clips) return;
    let cancelled = false;
    loadingRef.current = true;
    // Freeze the camera's current picture until the new clip shows its first frame
    const video = videoRef.current;
    const hold = holdRef.current;
    if (video && hold && video.readyState >= 2 && video.videoWidth) {
      hold.width = video.videoWidth;
      hold.height = video.videoHeight;
      hold.getContext('2d')?.drawImage(video, 0, 0);
      setIsHolding(true);
    }
    const cursor = new TimelineCursor(clip);
    cursorRef.current = cursor;
    const first = cursor.at(pendingSeekRef.current);
    frameRef.current = first;
    setFrame(first);
    clipUrl(clip).then(
      (url: string) => !cancelled && setSrc(url),
      (e: Error) => !cancelled && setError(`Could not read the recording: ${e.message}`)
    );
    // Keep only the current and next clip in memory
    const next = clips[clipIndex + 1];
    if (next) clipUrl(next).catch(() => {});
    urlsRef.current.forEach((url: Promise<string>, id: string) => {
      if (id !== clip.id && id !== next?.id) {
        url.then((u: string) => URL.revokeObjectURL(u), () => {});
        urlsRef.current.delete(id);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((url: Promise<string>) => url.then((u: string) => URL.revokeObjectURL(u), () => {}));
    },
    []
  );

  // The new clip's first frame is on screen: drop the frozen picture
  const releaseHold = () => {
    const video = videoRef.current as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }) | null;
    const release = () => setIsHolding(false);
    if (video?.requestVideoFrameCallback) video.requestVideoFrameCallback(release);
    setTimeout(release, 1000); // In case no frame is presented (paused, or a clip without picture)
  };

  const goToClip = useCallback((index: number, offsetMs = 0) => {
    const { clips: list, clipIndex: current } = live.current;
    if (!list || index < 0 || index >= list.length) return;
    setIsFinished(false);
    if (index === current) {
      const video = videoRef.current;
      // A clip still loading takes the seek once its media is ready (the element holds the previous clip)
      if (loadingRef.current) pendingSeekRef.current = offsetMs;
      else if (video) video.currentTime = offsetMs / 1000;
      const cursor = cursorRef.current;
      if (cursor) {
        frameRef.current = cursor.at(offsetMs);
        setFrame(frameRef.current);
      }
      return;
    }
    pendingSeekRef.current = offsetMs;
    setClipIndex(index);
  }, []);

  const seek = useCallback(
    (ms: number) => {
      const { offsets: starts } = live.current;
      let index = 0;
      while (index + 1 < starts.length && starts[index + 1] <= ms) index++;
      goToClip(index, Math.max(0, ms - (starts[index] ?? 0)));
      setTime(ms);
    },
    [goToClip]
  );

  const next = useCallback(() => {
    const { clips: list, clipIndex: current } = live.current;
    if (list && current + 1 < list.length) goToClip(current + 1);
  }, [goToClip]);

  const previous = useCallback(() => {
    const video = videoRef.current;
    if (video && video.currentTime > 2) goToClip(live.current.clipIndex, 0);
    else goToClip(live.current.clipIndex - 1);
  }, [goToClip]);

  const togglePlay = useCallback(() => {
    if (isFinished) {
      seek(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying(!isPlaying);
  }, [isFinished, isPlaying, seek]);

  // A clip's media is ready: jump to the wanted spot, then play if playing
  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = live.current.speed;
    if (pendingSeekRef.current > 0) video.currentTime = pendingSeekRef.current / 1000;
    pendingSeekRef.current = 0;
    loadingRef.current = false;
    releaseHold();
    if (live.current.isPlaying) video.play().catch(() => setIsPlaying(false));
  };

  const onEnded = () => {
    if (loadingRef.current) return;
    const { clips: list, clipIndex: current } = live.current;
    if (list && current + 1 < list.length) {
      goToClip(current + 1);
    } else {
      setIsPlaying(false);
      setIsFinished(true);
      setTime(total);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (isPlaying && !isFinished) video.play().catch(() => {});
    else video.pause();
  }, [isPlaying, isFinished, src]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  // Follow the media clock: the frame changes only when an event falls due
  useEffect(() => {
    if (!clips) return;
    let raf = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      const video = videoRef.current;
      const cursor = cursorRef.current;
      if (video && cursor && !loadingRef.current) {
        const t = video.currentTime * 1000;
        const f = cursor.at(t);
        if (f !== frameRef.current) {
          frameRef.current = f;
          setFrame(f);
        }
        if (now - lastUi > 100 && !scrubbingRef.current) {
          lastUi = now;
          const { offsets: starts, clipIndex: current } = live.current;
          setTime((starts[current] ?? 0) + Math.min(t, live.current.clips?.[current]?.durationMs ?? t));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clips]);

  // Keys (the presenter's own shortcuts are off while this is open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'SELECT' || target.tagName === 'INPUT')) return;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault();
          next();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          previous();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
      setShowControls(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, next, previous, onClose]);

  // Controls hide while playing and the mouse rests
  useEffect(() => {
    if (!showControls || !isPlaying || isFinished) return;
    const timer = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(timer);
  }, [showControls, isPlaying, isFinished, time]);

  const scrubTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * total);
  };

  const video = (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        src={src ?? undefined}
        className="w-full h-full object-cover"
        playsInline
        preload="auto"
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onError={() => {
          if (src) {
            console.warn('A recording clip could not be played; skipping it');
            loadingRef.current = false;
            setIsHolding(false);
            onEnded();
          }
        }}
      />
      <canvas ref={holdRef} data-camera-hold="" className="absolute inset-0 w-full h-full object-cover" style={{ display: isHolding ? 'block' : 'none' }} />
    </div>
  );

  return (
    <div
      data-playback=""
      className={clsx('fixed inset-0 z-[80] bg-black', !showControls && isPlaying && 'cursor-none')}
      onMouseMove={() => setShowControls(true)}
    >
      {frame && clip ? (
        <div className="absolute inset-0" onClick={togglePlay}>
          <AudienceView
            className="playback-container"
            slides={slides}
            state={frame.state}
            annotations={frame.annotations}
            draft={frame.draft}
            mediaMap={mediaMap}
            camera={{ settings: frame.camera, video, hidden: !clip.hasVideo }}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">{error ?? 'Loading the recording…'}</div>
      )}

      {/* Title */}
      <div
        className={clsx(
          'absolute top-4 left-4 z-[90] px-3 py-1.5 rounded-xl bg-neutral-900/80 text-sm text-neutral-200 transition-opacity',
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        )}
      >
        ▶ {recording?.name ?? 'Recording'}
      </div>

      {/* Controls */}
      <div
        data-playback-controls=""
        className={clsx(
          'absolute bottom-6 left-1/2 -translate-x-1/2 z-[90] w-[min(56rem,calc(100%-2rem))] flex items-center gap-2 bg-neutral-900/90 backdrop-blur-md border border-white/10 rounded-2xl px-3 py-2 shadow-2xl text-white transition-opacity',
          showControls || !isPlaying || error || isDownloadMenuOpen || exporter.job ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={previous} disabled={!clips} className="p-2 rounded-xl hover:bg-white/10 disabled:opacity-30" title="Previous clip (←)" aria-label="Previous clip">
          <SkipBack className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => {
            e.currentTarget.blur();
            togglePlay();
          }}
          disabled={!clips}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30"
          title={isFinished ? 'Play again' : isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={isFinished ? 'Play again' : isPlaying ? 'Pause' : 'Play'}
        >
          {isFinished ? <RotateCcw className="w-5 h-5" /> : isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button onClick={next} disabled={!clips} className="p-2 rounded-xl hover:bg-white/10 disabled:opacity-30" title="Next clip (→)" aria-label="Next clip">
          <SkipForward className="w-5 h-5" />
        </button>
        <span className="text-xs font-mono tabular-nums text-neutral-300 whitespace-nowrap" data-playback-time="">
          {formatDuration(time)} / {formatDuration(total)}
        </span>
        {/* Scrub bar, with a mark where each slide starts */}
        <div
          data-playback-scrub=""
          className="relative flex-1 h-6 cursor-pointer group"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            if (!total) return;
            scrubbingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubTo(e);
          }}
          onPointerMove={(e) => scrubbingRef.current && scrubTo(e)}
          onPointerUp={() => (scrubbingRef.current = false)}
          onPointerCancel={() => (scrubbingRef.current = false)}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
            <div className="h-full bg-red-500" style={{ width: total ? `${(time / total) * 100}%` : 0 }} />
          </div>
          {clips?.map((c, i) =>
            i > 0 && c.slideIndex !== clips[i - 1].slideIndex ? (
              <div
                key={c.id}
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-neutral-400/70"
                style={{ left: `${(offsets[i] / total) * 100}%` }}
                title={`Slide ${c.slideIndex + 1}`}
              />
            ) : null
          )}
        </div>
        <span className="text-xs text-neutral-400 whitespace-nowrap">
          Slide {(frame?.state.index ?? 0) + 1}/{slides.length}
        </span>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="bg-neutral-800 border border-neutral-700 rounded-lg px-1.5 py-1 text-xs"
          aria-label="Playback speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        {/* Download this recording */}
        <div className="relative">
          {exporter.job ? (
            <button
              onClick={exporter.cancel}
              className="px-2 py-1.5 rounded-xl hover:bg-white/10 text-xs font-mono text-blue-300 whitespace-nowrap"
              title="Creating the file; click to cancel"
              aria-label="Cancel download"
              data-export-progress=""
            >
              {Math.round(exporter.job.progress * 100)}% ✕
            </button>
          ) : (
            <button
              onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
              disabled={!recording}
              className="p-2 rounded-xl hover:bg-white/10 disabled:opacity-30"
              title="Download"
              aria-label="Download"
              aria-expanded={isDownloadMenuOpen}
            >
              <Download className="w-5 h-5" />
            </button>
          )}
          {isDownloadMenuOpen && recording && !exporter.job && (
            <div className="absolute bottom-full right-0 mb-2 w-56 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl p-1 text-sm" role="menu">
              {([
                ['video', 'Video', 'Slides, camera and voice'],
                ['audio', 'Audio only', 'Your voice'],
              ] as const).map(([kind, label, detail]) => (
                <button
                  key={kind}
                  role="menuitem"
                  onClick={() => {
                    setIsDownloadMenuOpen(false);
                    exporter.run([recording], kind);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10"
                >
                  <div>{label}</div>
                  <div className="text-xs text-neutral-500">{detail}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10" title="Close (Esc)" aria-label="Close playback">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default PlaybackView;
