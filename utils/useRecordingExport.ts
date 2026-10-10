import { useRef, useState } from 'react';
import { MediaMap, RecordingMeta, SlideData } from '../types';
import type { ExportKind } from './exportRecording';

const PREFERENCE_KEY = 'webpressive_export';

export interface ExportJob {
  name: string; // Recording being exported
  index: number; // Its place among the recordings asked for (0-based)
  count: number;
  kind: ExportKind;
  progress: number; // 0..1 for the current recording
}

function loadPreference(): { kind: ExportKind; height: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCE_KEY) || '{}');
    return { kind: saved.kind === 'audio' ? 'audio' : 'video', height: [720, 1080, 1440].includes(saved.height) ? saved.height : 1440 };
  } catch {
    return { kind: 'video', height: 1440 };
  }
}

/**
 * Downloads recordings as files, one after another: a video of what the audience saw with the camera
 * and sound, or the sound only. One export at a time; the choice of kind and size is remembered.
 */
export function useRecordingExport(slides: SlideData[], mediaMap: MediaMap, deckName: string, onNotice: (text: string) => void) {
  const [job, setJob] = useState<ExportJob | null>(null);
  const [preference, setPreferenceState] = useState(loadPreference);
  const abortRef = useRef<AbortController | null>(null);

  const setPreference = (changes: Partial<{ kind: ExportKind; height: number }>) => {
    const next = { ...preference, ...changes };
    setPreferenceState(next);
    try {
      localStorage.setItem(PREFERENCE_KEY, JSON.stringify(next));
    } catch {
      // Per session only
    }
  };

  const run = async (recordings: RecordingMeta[], kind: ExportKind = preference.kind) => {
    if (job || recordings.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    let saved = 0;
    try {
      // The encoder library loads on the first download only
      const { exportRecording, downloadBlob } = await import('./exportRecording');
      for (let i = 0; i < recordings.length; i++) {
        const recording = recordings[i];
        setJob({ name: recording.name, index: i, count: recordings.length, kind, progress: 0 });
        const { blob, extension } = await exportRecording(recording, slides, mediaMap, {
          kind,
          height: preference.height,
          signal: controller.signal,
          onProgress: (progress) => setJob((current: ExportJob | null) => current && { ...current, progress }),
        });
        downloadBlob(blob, `${deckName || 'Talk'} - ${recording.name}.${extension}`);
        saved++;
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') onNotice(saved > 0 ? `Download stopped after ${saved} file${saved === 1 ? '' : 's'}.` : 'Download cancelled.');
      else {
        console.error('Export failed:', error);
        onNotice(`Could not create the file: ${(error as Error)?.message ?? error}`);
      }
    } finally {
      abortRef.current = null;
      setJob(null);
    }
  };

  return { job, preference, setPreference, run, cancel: () => abortRef.current?.abort() };
}

export type RecordingExport = ReturnType<typeof useRecordingExport>;
