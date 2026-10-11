import { useCallback, useEffect, useRef, useState } from 'react';
import { useMicrophoneStream } from './camera';
import { EngineStatus, FinalLine, LiveTranscriber, speechEngine } from './liveTranscriber';

const MAX_LINES = 500; // Older lines drop off the live pane (recordings keep theirs)
const FLUSH_TIMEOUT_MS = 8000;

interface Options {
  enabled: boolean; // Transcript turned on (presenter window)
  micDeviceId: string;
  muted: boolean; // The recording's microphone mute
  onFinal?: (line: FinalLine) => void; // Every finished line, e.g. for the recording
}

/**
 * The live transcript: opens the microphone and the speech model while `enabled`, and collects the
 * finished lines plus a preview of the line being spoken.
 */
export function useLiveTranscript({ enabled, micDeviceId, muted, onFinal }: Options) {
  const engine = speechEngine();
  const [engineState, setEngineState] = useState<{ status: EngineStatus; progress: number; error: string | null }>({
    status: engine.status,
    progress: engine.progress,
    error: engine.error,
  });
  const [lines, setLines] = useState<FinalLine[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(
    () => engine.subscribe(() => setEngineState({ status: engine.status, progress: engine.progress, error: engine.error })),
    [engine]
  );

  useEffect(() => {
    if (enabled) engine.load();
  }, [enabled, engine]);

  const mic = useMicrophoneStream(enabled, micDeviceId);

  useEffect(() => {
    if (!mic.stream) return;
    const transcriber = new LiveTranscriber(mic.stream, {
      onFinal: (line) => {
        setLines((prev: FinalLine[]) => [...prev.slice(-(MAX_LINES - 1)), line]);
        onFinalRef.current?.(line);
      },
      onPreview: (text) => setPreview(text),
    });
    transcriber.muted = mutedRef.current;
    transcriberRef.current = transcriber;
    transcriber.start().catch((error: Error) => {
      console.warn('Transcript capture failed:', error);
    });
    return () => {
      // The last words still arrive (onFinal) after the microphone closes
      transcriber.flush().catch(() => {});
      transcriber.stop();
      if (transcriberRef.current === transcriber) transcriberRef.current = null;
      setPreview(null);
    };
  }, [mic.stream]);

  useEffect(() => {
    if (transcriberRef.current) transcriberRef.current.muted = muted;
  }, [muted]);

  /** Finishes the line being spoken; resolves when its text is in (or after a timeout). */
  const flush = useCallback(async () => {
    const transcriber = transcriberRef.current;
    const done = transcriber ? transcriber.flush() : engine.whenIdle();
    await Promise.race([done, new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS))]);
  }, [engine]);

  return {
    status: engineState.status,
    progress: engineState.progress,
    error: engineState.error ?? mic.error,
    isListening: enabled && !!mic.stream && engineState.status === 'ready',
    lines,
    preview,
    clear: () => {
      setLines([]);
      setPreview(null);
    },
    retry: () => engine.load(),
    flush,
  };
}

export type LiveTranscript = ReturnType<typeof useLiveTranscript>;
