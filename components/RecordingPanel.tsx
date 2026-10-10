import React, { useEffect, useRef, useState } from 'react';
import { Circle, Download, GripHorizontal, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { RecordingMeta } from '../types';
import { TalkRecording } from '../utils/useTalkRecording';
import { RecordingExport } from '../utils/useRecordingExport';
import { useDraggablePanel } from '../utils/draggablePanel';
import { formatBytes, formatDuration, recordingBytes, recordingDuration } from '../utils/recordingStore';

interface RecordingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  recording: TalkRecording;
  exporter: RecordingExport;
  currentSlide: number;
  isCameraOn: boolean;
  onRecord: () => void; // From the current slide
  onRerecordSlide: (slideIndex: number) => void;
  onPlay: (recordingId: string, clipIndex?: number) => void;
}

const formatDate = (time: number) =>
  new Date(time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// A recording's slides in the order they were first presented, with the time spent on each
function slidesOf(recording: RecordingMeta): { slideIndex: number; durationMs: number; firstClip: number }[] {
  const slides = new Map<number, { slideIndex: number; durationMs: number; firstClip: number }>();
  recording.clips.forEach((clip, index) => {
    const entry = slides.get(clip.slideIndex);
    if (entry) entry.durationMs += clip.durationMs;
    else slides.set(clip.slideIndex, { slideIndex: clip.slideIndex, durationMs: clip.durationMs, firstClip: index });
  });
  return Array.from(slides.values());
}

const iconButton = 'p-1.5 rounded-md hover:bg-white/10 text-neutral-300 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none';

/**
 * Talk recording: start one, and this deck's recordings (play, delete, and per slide: play from there,
 * re-record, clear). Ticked recordings download as video or sound-only files. Same side panel as the
 * camera settings: drag its header to move it.
 */
const RecordingPanel: React.FC<RecordingPanelProps> = ({ isOpen, onClose, recording, exporter, currentSlide, isCameraOn, onRecord, onRerecordSlide, onPlay }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const { isDocked, handleProps, panelStyle } = useDraggablePanel(panelRef);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // Recording id, or `${id}:${slide}`
  const [ticked, setTicked] = useState<string[]>([]); // Recordings to download

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  useEffect(() => {
    if (isOpen) recording.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const { selected, recordings, status } = recording;
  const isIdle = status === 'idle';
  const toDownload = recordings.filter((r) => ticked.includes(r.id) && r.clips.length > 0);
  const job = exporter.job;
  const recordLabel = selected ? (selected.clips.length > 0 ? `Continue “${selected.name}”` : `Record “${selected.name}”`) : 'Record a new recording';

  return (
    <div
      role="dialog"
      aria-label="Recording"
      ref={panelRef}
      data-recording-panel=""
      className={clsx(
        'fixed z-[60] w-80 overflow-y-auto bg-neutral-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl text-white',
        isDocked && 'top-4 right-4'
      )}
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#525252 #171717', ...panelStyle }}
    >
      <div
        data-recording-panel-handle=""
        className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10 cursor-move select-none sticky top-0 bg-neutral-900 z-10 rounded-t-2xl"
        {...handleProps}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Circle className="w-4 h-4 text-red-500 fill-current" />
          Recording
          <GripHorizontal className="w-4 h-4 text-neutral-500" aria-hidden="true" />
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white" aria-label="Close recording">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Start */}
        <div className="space-y-3">
          {isIdle ? (
            <button
              disabled={!!job}
              onClick={(e) => {
                e.currentTarget.blur();
                onRecord();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 font-semibold text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none"
              title={job ? 'Wait for the download to finish' : undefined}
            >
              <Circle className="w-3.5 h-3.5 fill-current" />
              <span className="truncate">{recordLabel}</span>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                recording.stop();
              }}
              disabled={status === 'stopping'}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {status === 'stopping' ? 'Saving…' : status === 'countdown' ? 'Cancel' : 'Stop recording'}
            </button>
          )}
          <p className="text-xs text-neutral-400 leading-snug">
            Starts on slide {currentSlide + 1}. Your voice, the slides, ink, laser, spotlight, zoom and{' '}
            {isCameraOn ? 'your camera' : 'your camera (when shown, V)'} are recorded. Each slide visit is saved as its own clip;{' '}
            <kbd className="px-1 bg-neutral-800 rounded border border-neutral-700">P</kbd> pauses.
          </p>
          <label className="flex items-center justify-between text-sm">
            <span>3-second countdown</span>
            <input
              type="checkbox"
              checked={recording.useCountdown}
              onChange={(e) => recording.setUseCountdown(e.target.checked)}
              className="w-4 h-4 accent-red-500"
            />
          </label>
        </div>

        {/* This deck's recordings */}
        <div className="pt-4 border-t border-white/10">
          <h3 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-2">Recordings of this deck</h3>
          {recordings.length === 0 && <p className="text-xs text-neutral-500 mb-2">None yet.</p>}
          <ul className="space-y-2">
            {recordings.map((r) => {
              const isSelected = selected?.id === r.id;
              return (
                <li
                  key={r.id}
                  data-recording-item={r.name}
                  className={clsx('rounded-xl border transition-colors', isSelected ? 'border-red-500/60 bg-red-500/5' : 'border-neutral-800 hover:border-neutral-700')}
                >
                  <div className="flex items-center gap-2 p-2">
                    <input
                      type="checkbox"
                      checked={ticked.includes(r.id)}
                      disabled={r.clips.length === 0 || !!job}
                      onChange={(e) => setTicked(e.target.checked ? [...ticked, r.id] : ticked.filter((id) => id !== r.id))}
                      className="w-4 h-4 shrink-0 accent-blue-500"
                      aria-label={`Download ${r.name}`}
                      title="Tick to download"
                    />
                    <button
                      onClick={() => recording.select(r.id)}
                      disabled={!isIdle}
                      className="flex-1 min-w-0 text-left"
                      aria-pressed={isSelected}
                      title="New recordings go into the selected one"
                    >
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-neutral-500">
                        {formatDate(r.createdAt)} · {formatDuration(recordingDuration(r))} · {formatBytes(recordingBytes(r))}
                      </div>
                    </button>
                    <button
                      onClick={() => onPlay(r.id)}
                      disabled={!isIdle || r.clips.length === 0}
                      className={iconButton}
                      title="Play"
                      aria-label={`Play ${r.name}`}
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => (confirmDelete === r.id ? recording.remove(r.id) : setConfirmDelete(r.id))}
                      disabled={!isIdle}
                      className={clsx(iconButton, confirmDelete === r.id && 'bg-red-600 text-white hover:bg-red-500')}
                      title={confirmDelete === r.id ? 'Click again to delete' : 'Delete'}
                      aria-label={confirmDelete === r.id ? `Confirm delete ${r.name}` : `Delete ${r.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {isSelected && r.clips.length > 0 && (
                    <ul className="border-t border-white/5 px-2 py-1 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                      {slidesOf(r).map((s) => {
                        const key = `${r.id}:${s.slideIndex}`;
                        return (
                          <li key={s.slideIndex} data-recording-slide={s.slideIndex + 1} className="flex items-center gap-1 text-xs py-0.5">
                            <span className={clsx('flex-1', s.slideIndex === currentSlide ? 'text-white font-medium' : 'text-neutral-400')}>
                              Slide {s.slideIndex + 1}
                            </span>
                            <span className="font-mono text-neutral-500 w-12 text-right">{formatDuration(s.durationMs)}</span>
                            <button onClick={() => onPlay(r.id, s.firstClip)} disabled={!isIdle} className={iconButton} title="Play from this slide" aria-label={`Play from slide ${s.slideIndex + 1}`}>
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => onRerecordSlide(s.slideIndex)} disabled={!isIdle} className={iconButton} title="Re-record this slide" aria-label={`Re-record slide ${s.slideIndex + 1}`}>
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => (confirmDelete === key ? recording.clearSlide(r.id, s.slideIndex) : setConfirmDelete(key))}
                              disabled={!isIdle}
                              className={clsx(iconButton, confirmDelete === key && 'bg-red-600 text-white hover:bg-red-500')}
                              title={confirmDelete === key ? 'Click again to clear' : 'Clear this slide'}
                              aria-label={confirmDelete === key ? `Confirm clear slide ${s.slideIndex + 1}` : `Clear slide ${s.slideIndex + 1}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
            {!selected && recordings.length > 0 && (
              <li className="rounded-xl border border-red-500/60 bg-red-500/5 p-2 text-xs text-neutral-300">
                New recording: starts when you press Record.
              </li>
            )}
          </ul>
          {selected && (
            <button
              onClick={() => recording.select(null)}
              disabled={!isIdle}
              className="mt-2 flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              New recording
            </button>
          )}

          {/* Download the ticked recordings */}
          {recordings.length > 0 && (
            <div data-recording-download="" className="mt-3 p-2.5 rounded-xl border border-neutral-800 space-y-2">
              <div className="flex gap-2">
                <select
                  value={exporter.preference.kind}
                  onChange={(e) => exporter.setPreference({ kind: e.target.value as 'video' | 'audio' })}
                  disabled={!!job}
                  className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs"
                  aria-label="Download as"
                >
                  <option value="video">Video</option>
                  <option value="audio">Audio only</option>
                </select>
                {exporter.preference.kind === 'video' && (
                  <select
                    value={exporter.preference.height}
                    onChange={(e) => exporter.setPreference({ height: Number(e.target.value) })}
                    disabled={!!job}
                    className="shrink-0 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs"
                    aria-label="Video size"
                  >
                    <option value={1440}>1440p</option>
                    <option value={1080}>1080p</option>
                    <option value={720}>720p</option>
                  </select>
                )}
              </div>
              {job ? (
                <div className="space-y-1.5" role="status">
                  <div className="flex items-center justify-between text-xs text-neutral-300">
                    <span className="truncate">
                      {job.count > 1 ? `${job.index + 1}/${job.count}: ` : ''}
                      {job.name}
                    </span>
                    <span className="font-mono" data-export-progress="">
                      {Math.round(job.progress * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-[width]" style={{ width: `${job.progress * 100}%` }} />
                  </div>
                  <button onClick={exporter.cancel} className="w-full text-xs py-1 rounded-lg hover:bg-white/5 text-neutral-300">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    exporter.run(toDownload);
                  }}
                  disabled={toDownload.length === 0 || !isIdle}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Download className="w-4 h-4" />
                  {toDownload.length === 0 ? 'Tick recordings to download' : `Download${toDownload.length > 1 ? ` ${toDownload.length} files` : ''}`}
                </button>
              )}
              <p className="text-[11px] text-neutral-500 leading-snug">
                {exporter.preference.kind === 'video'
                  ? 'A video of what the audience saw, with your camera and voice (MP4, or WebM where the browser cannot make MP4). Takes a while for long talks; keep this window open.'
                  : 'Your voice only (M4A, or Ogg where M4A is not available).'}
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-neutral-500 leading-snug">
          Recordings stay in this browser on this computer.
          {recording.storage && (
            <> Using {formatBytes(recording.storage.usage)}; {formatBytes(Math.max(0, recording.storage.quota - recording.storage.usage))} free.</>
          )}
        </p>
      </div>
    </div>
  );
};

export default RecordingPanel;
