import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Pause, Play, Square } from 'lucide-react';
import { clsx } from 'clsx';
import { TalkRecording } from '../utils/useTalkRecording';
import { useAudioLevel } from '../utils/camera';
import { formatDuration } from '../utils/recordingStore';

/**
 * Presenter-only recording UI: the 3-2-1 countdown, then a REC badge (time, microphone level, mute,
 * pause, stop). Neither is part of the recording or shown on the projector.
 */
const RecordingIndicator: React.FC<{ recording: TalkRecording }> = ({ recording }) => {
  const { status, countdown } = recording;
  const [elapsed, setElapsed] = useState(0);
  const level = useAudioLevel(recording.isActive && !recording.isMuted ? recording.micStream : null);

  useEffect(() => {
    if (!recording.isActive && status !== 'stopping') return;
    setElapsed(recording.elapsedMs());
    const timer = setInterval(() => setElapsed(recording.elapsedMs()), 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.isActive, status]);

  if (status === 'idle') return null;

  if (status === 'countdown') {
    return (
      <div data-recording-countdown="" className="fixed inset-0 z-[85] flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-4 bg-neutral-900/85 backdrop-blur-md border border-white/10 rounded-3xl px-12 py-8 shadow-2xl pointer-events-auto">
          <div className="text-sm font-semibold uppercase tracking-wider text-red-400">
            {recording.replaceSlide !== null ? `Re-recording slide ${recording.replaceSlide + 1}` : 'Recording starts in'}
          </div>
          <div className="text-7xl font-bold font-mono text-white tabular-nums">{countdown > 0 ? countdown : '…'}</div>
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              recording.cancelCountdown();
            }}
            className="text-sm text-neutral-300 hover:text-white px-3 py-1 rounded-lg hover:bg-white/10"
          >
            Cancel (Esc)
          </button>
        </div>
      </div>
    );
  }

  const isPaused = status === 'paused';
  const isSaving = status === 'stopping';
  const buttonClass = 'p-1.5 rounded-lg hover:bg-white/10 text-neutral-200 transition-colors disabled:opacity-40';

  return (
    <div
      data-recording-indicator=""
      role="status"
      className="fixed bottom-6 left-6 z-[55] flex items-center gap-2 bg-neutral-900/90 backdrop-blur-md border border-red-500/40 rounded-2xl pl-3 pr-1.5 py-1.5 shadow-2xl text-white"
    >
      <span className={clsx('w-2.5 h-2.5 rounded-full', isPaused || isSaving ? 'bg-neutral-500' : 'bg-red-500 animate-pulse')} />
      <span className="text-xs font-bold tracking-wider text-red-400">{isSaving ? 'SAVING' : isPaused ? 'PAUSED' : 'REC'}</span>
      <span className="text-sm font-mono tabular-nums w-14" data-recording-elapsed="">
        {formatDuration(elapsed)}
      </span>
      {recording.replaceSlide !== null && (
        <span className="text-xs text-neutral-400 whitespace-nowrap">slide {recording.replaceSlide + 1} only</span>
      )}
      <div className="w-12 h-1.5 bg-neutral-700 rounded-full overflow-hidden" aria-label="Microphone level">
        <div className={clsx('h-full rounded-full', level > 0.85 ? 'bg-red-500' : 'bg-green-500')} style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      <button
        onClick={(e) => {
          e.currentTarget.blur();
          recording.toggleMute();
        }}
        className={clsx(buttonClass, recording.isMuted && 'text-red-400')}
        disabled={isSaving}
        title={recording.isMuted ? 'Unmute microphone' : 'Mute microphone'}
        aria-label={recording.isMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {recording.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
      <button
        onClick={(e) => {
          e.currentTarget.blur();
          recording.togglePause();
        }}
        className={buttonClass}
        disabled={isSaving}
        title={isPaused ? 'Resume recording (P)' : 'Pause recording (P)'}
        aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
      >
        {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
      </button>
      <button
        onClick={(e) => {
          e.currentTarget.blur();
          recording.stop();
        }}
        className={clsx(buttonClass, 'text-red-400')}
        disabled={isSaving}
        title="Stop recording"
        aria-label="Stop recording"
      >
        <Square className="w-4 h-4 fill-current" />
      </button>
    </div>
  );
};

export default RecordingIndicator;
