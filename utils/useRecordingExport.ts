import { useRef, useState } from 'react';
import { ClipData, MediaMap, RecordingMeta, SlideData } from '../types';
import type { ExportKind } from './exportRecording';
import { getClip } from './recordingStore';
import { downloadBlob } from './download';
import { recordingLines, toPlainText, toSrt } from './transcriptExport';

// A video or sound file, or the spoken text: subtitles (.srt) or a plain transcript (.txt)
export type DownloadKind = ExportKind | 'subtitles' | 'transcript';
const KINDS: DownloadKind[] = ['video', 'audio', 'subtitles', 'transcript'];

const PREFERENCE_KEY = 'webpressive_export';

export interface ExportJob {
  name: string; // Recording being exported
  index: number; // Its place among the recordings asked for (0-based)
  count: number;
  kind: DownloadKind;
  progress: number; // 0..1 for the current recording
}

function loadPreference(): { kind: DownloadKind; height: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCE_KEY) || '{}');
    return { kind: KINDS.includes(saved.kind) ? saved.kind : 'video', height: [720, 1080, 1440].includes(saved.height) ? saved.height : 1440 };
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

  const setPreference = (changes: Partial<{ kind: DownloadKind; height: number }>) => {
    const next = { ...preference, ...changes };
    setPreferenceState(next);
    try {
      localStorage.setItem(PREFERENCE_KEY, JSON.stringify(next));
    } catch {
      // Per session only
    }
  };

  const run = async (recordings: RecordingMeta[], kind: DownloadKind = preference.kind) => {
    if (job || recordings.length === 0) return;
    if (kind === 'subtitles' || kind === 'transcript') {
      await downloadText(recordings, kind);
      return;
    }
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

  // Text files are quick: no progress, no encoder
  const downloadText = async (recordings: RecordingMeta[], kind: 'subtitles' | 'transcript') => {
    let saved = 0;
    try {
      for (const recording of recordings) {
        const clips = (await Promise.all(recording.clips.map((c) => getClip(c.id)))).filter((c): c is ClipData => !!c && c.durationMs > 0);
        const lines = recordingLines(clips);
        if (lines.length === 0) continue;
        const text = kind === 'subtitles' ? toSrt(lines) : toPlainText(lines);
        const extension = kind === 'subtitles' ? 'srt' : 'txt';
        downloadBlob(new Blob([text], { type: kind === 'subtitles' ? 'application/x-subrip' : 'text/plain' }), `${deckName || 'Talk'} - ${recording.name}.${extension}`);
        saved++;
      }
      if (saved < recordings.length) {
        onNotice(
          saved === 0
            ? `No transcript in ${recordings.length === 1 ? 'this recording' : 'these recordings'}: turn the transcript on (W) while recording.`
            : `${recordings.length - saved} of the recordings had no transcript.`
        );
      }
    } catch (error) {
      onNotice(`Could not create the file: ${(error as Error)?.message ?? error}`);
    }
  };

  return { job, preference, setPreference, run, cancel: () => abortRef.current?.abort() };
}

export type RecordingExport = ReturnType<typeof useRecordingExport>;
