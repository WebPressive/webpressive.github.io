import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipSummary, RecordingMeta } from '../types';
import { useMicrophoneStream } from './camera';
import { RecorderInput, TalkRecorder, isRecordingSupported } from './talkRecorder';
import {
  deleteClips,
  deleteRecording,
  listRecordings,
  putRecording,
  requestPersistentStorage,
  storageEstimate,
  updateRecording,
} from './recordingStore';

export type RecordingStatus = 'idle' | 'countdown' | 'recording' | 'paused' | 'stopping';

const COUNTDOWN_KEY = 'webpressive_recording_countdown';
const COUNTDOWN_SECONDS = 3;

interface Options {
  enabled: boolean; // Presenter window with a deck loaded
  deckKey: string | null;
  deckName: string;
  input: RecorderInput; // New object whenever something the audience sees changes
  videoTrack: MediaStreamTrack | null; // The camera, when it is shown on the slides
  micDeviceId: string;
  onNotice: (text: string) => void;
}

/**
 * Talk recording for the presenter window: start (with a countdown) / pause / stop, re-recording one
 * slide, and this deck's saved recordings. Clips go into the selected recording; with none selected,
 * the next start makes a new one.
 */
export function useTalkRecording({ enabled, deckKey, deckName, input, videoTrack, micDeviceId, onNotice }: Options) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [countdown, setCountdown] = useState(0);
  const [replaceSlide, setReplaceSlide] = useState<number | null>(null);
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  // undefined: not chosen yet (the newest is used); null: "new recording" on the next start
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [isMuted, setIsMuted] = useState(false);
  const [micDevice, setMicDevice] = useState(micDeviceId); // Fixed for the length of a recording
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [useCountdown, setUseCountdownState] = useState(() => {
    try {
      return localStorage.getItem(COUNTDOWN_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  const recorderRef = useRef<TalkRecorder | null>(null);
  const sessionRef = useRef<{ recordingId: string; replaceSlide: number | null; clips: ClipSummary[] } | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve()); // Recording updates, one at a time
  const inputRef = useRef(input);
  inputRef.current = input;
  const videoTrackRef = useRef(videoTrack);
  videoTrackRef.current = videoTrack;
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  const mic = useMicrophoneStream(enabled && status !== 'idle', micDevice);

  const queue = (task: () => Promise<unknown>) => {
    queueRef.current = queueRef.current.then(task).catch((error: unknown) => {
      console.warn('Recording update failed:', error);
    });
    return queueRef.current;
  };

  const refresh = useCallback(async () => {
    if (!deckKey) {
      setRecordings([]);
      return;
    }
    try {
      setRecordings(await listRecordings(deckKey));
    } catch (error) {
      console.warn('Could not read recordings:', error);
    }
    setStorage(await storageEstimate());
  }, [deckKey]);

  useEffect(() => {
    setSelectedId(undefined);
    refresh();
  }, [refresh]);

  // The recording new clips go into (undefined selection: the newest; a deleted one: none)
  const selected: RecordingMeta | null =
    selectedId === undefined ? recordings[recordings.length - 1] ?? null : recordings.find((r) => r.id === selectedId) ?? null;

  const setUseCountdown = (value: boolean) => {
    setUseCountdownState(value);
    try {
      localStorage.setItem(COUNTDOWN_KEY, String(value));
    } catch {
      // Per session only
    }
  };

  const start = (options: { replaceSlide?: number } = {}) => {
    if (!enabled || status !== 'idle' || !deckKey) return;
    if (!isRecordingSupported()) {
      noticeRef.current('This browser cannot record. Use a current Chrome, Edge or Firefox, or the desktop app.');
      return;
    }
    if (options.replaceSlide !== undefined && !selected) return;
    setMicDevice(micDeviceId);
    setReplaceSlide(options.replaceSlide ?? null);
    setIsMuted(false);
    setCountdown(useCountdown ? COUNTDOWN_SECONDS : 0);
    setStatus('countdown');
  };

  const cancelCountdown = () => {
    if (status === 'countdown') {
      setStatus('idle');
      setReplaceSlide(null);
    }
  };

  // 3, 2, 1
  useEffect(() => {
    if (status !== 'countdown' || countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((n: number) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown]);

  // Countdown over and microphone open: go
  useEffect(() => {
    if (status !== 'countdown' || countdown > 0 || !mic.stream) return;
    if (replaceSlide !== null && inputRef.current.state.index !== replaceSlide) {
      setStatus('idle');
      setReplaceSlide(null);
      return;
    }
    let recording = selected;
    if (!recording) {
      const now = Date.now();
      recording = {
        id: crypto.randomUUID(),
        deckKey: deckKey!,
        deckName,
        name: `Recording ${recordings.length + 1}`,
        createdAt: now,
        updatedAt: now,
        clips: [],
      };
      const created = recording;
      queue(() => putRecording(created));
      setSelectedId(created.id);
    }
    requestPersistentStorage();

    const recordingId = recording.id;
    const append = replaceSlide === null;
    const session = { recordingId, replaceSlide, clips: [] as ClipSummary[] };
    sessionRef.current = session;
    const recorder = new TalkRecorder(recordingId, mic.stream, inputRef.current, videoTrackRef.current, {
      // Appended clips are listed as soon as they start, so a crash keeps what was recorded
      onClipStarted: (clip) => {
        session.clips.push(clip);
        if (append) queue(() => updateRecording(recordingId, (r) => ({ ...r, clips: [...r.clips, clip] })));
      },
      onClipFinished: (clip) => {
        session.clips = session.clips.map((c) => (c.id === clip.id ? clip : c));
        if (append) queue(() => updateRecording(recordingId, (r) => ({ ...r, clips: r.clips.map((c) => (c.id === clip.id ? clip : c)) })));
      },
      onClipDropped: (clipId) => {
        session.clips = session.clips.filter((c) => c.id !== clipId);
        if (append) queue(() => updateRecording(recordingId, (r) => ({ ...r, clips: r.clips.filter((c) => c.id !== clipId) })));
      },
      onError: (message) => noticeRef.current(message),
    });
    recorderRef.current = recorder;
    recorder.start();
    setStatus('recording');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, countdown, mic.stream]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) {
      cancelCountdown();
      return;
    }
    recorderRef.current = null;
    setStatus('stopping');
    await recorder.stop();
    await queueRef.current;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session && session.replaceSlide !== null && session.clips.length > 0) {
      // Re-recorded slide: its new clips take the place of the old ones (or its place in slide order)
      const slide = session.replaceSlide;
      let replaced: string[] = [];
      await queue(() =>
        updateRecording(session.recordingId, (r) => {
          replaced = r.clips.filter((c) => c.slideIndex === slide).map((c) => c.id);
          const first = r.clips.findIndex((c) => c.slideIndex === slide);
          const others = r.clips.filter((c) => c.slideIndex !== slide);
          let at = first >= 0 ? first : others.findIndex((c) => c.slideIndex > slide);
          if (at < 0) at = others.length;
          return { ...r, clips: [...others.slice(0, at), ...session.clips, ...others.slice(at)] };
        })
      );
      await deleteClips(replaced).catch(() => {});
    }
    setStatus('idle');
    setReplaceSlide(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, status]);

  const pause = () => {
    if (status !== 'recording') return;
    recorderRef.current?.pause();
    setStatus('paused');
  };
  const resume = () => {
    if (status !== 'paused') return;
    recorderRef.current?.resume();
    setStatus('recording');
  };
  const togglePause = () => (status === 'paused' ? resume() : pause());

  // A microphone that fails or stops ends the recording
  useEffect(() => {
    if (!mic.error || status === 'idle' || status === 'stopping') return;
    noticeRef.current(mic.error);
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic.error]);

  // Re-recording one slide ends when the presenter leaves it. Declared before the input effect below,
  // so it stops the recorder before the slide change could start a clip on the next slide.
  useEffect(() => {
    if (replaceSlide !== null && (status === 'recording' || status === 'paused') && input.state.index !== replaceSlide) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.state.index]);

  useEffect(() => {
    recorderRef.current?.update(input);
  }, [input]);

  useEffect(() => {
    recorderRef.current?.setVideoTrack(videoTrack);
  }, [videoTrack]);

  useEffect(() => {
    mic.stream?.getAudioTracks().forEach((track: MediaStreamTrack) => {
      track.enabled = !isMuted;
    });
  }, [isMuted, mic.stream]);

  // Closing or reloading the page while recording asks first
  useEffect(() => {
    if (status === 'idle') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  const remove = async (id: string) => {
    await deleteRecording(id).catch((error: unknown) => noticeRef.current(`Could not delete: ${(error as Error)?.message ?? error}`));
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  const clearSlide = async (recordingId: string, slideIndex: number) => {
    let removed: string[] = [];
    await queue(() =>
      updateRecording(recordingId, (r) => {
        removed = r.clips.filter((c) => c.slideIndex === slideIndex).map((c) => c.id);
        return { ...r, clips: r.clips.filter((c) => c.slideIndex !== slideIndex) };
      })
    );
    await deleteClips(removed).catch(() => {});
    refresh();
  };

  return {
    status,
    countdown,
    replaceSlide,
    isActive: status === 'recording' || status === 'paused',
    elapsedMs: () => recorderRef.current?.elapsedMs() ?? 0,
    micStream: mic.stream,
    isMuted,
    toggleMute: () => setIsMuted(!isMuted),
    useCountdown,
    setUseCountdown,
    recordings,
    selected,
    select: (id: string | null) => setSelectedId(id),
    storage,
    start,
    cancelCountdown,
    pause,
    resume,
    togglePause,
    stop,
    remove,
    clearSlide,
    refresh,
  };
}

export type TalkRecording = ReturnType<typeof useTalkRecording>;
