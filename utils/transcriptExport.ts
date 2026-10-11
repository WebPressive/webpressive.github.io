import { ClipData, TranscriptSegment } from '../types';

// A transcript line placed in the whole recording (clips one after another, as played)
export interface RecordingLine {
  start: number; // ms
  end: number;
  text: string;
  slideIndex: number;
}

const MIN_CUE_MS = 800; // Subtitles shorter than this flash by

export function hasTranscript(clips: ClipData[]): boolean {
  return clips.some((clip) => (clip.transcript?.length ?? 0) > 0);
}

export function recordingLines(clips: ClipData[]): RecordingLine[] {
  const lines: RecordingLine[] = [];
  let offset = 0;
  clips.forEach((clip) => {
    (clip.transcript ?? []).forEach((segment: TranscriptSegment) => {
      const start = offset + Math.min(segment.t, clip.durationMs);
      const end = offset + Math.min(Math.max(segment.e, segment.t + MIN_CUE_MS), clip.durationMs);
      lines.push({ start, end: Math.max(end, start + 1), text: segment.x, slideIndex: clip.slideIndex });
    });
    offset += clip.durationMs;
  });
  return lines.sort((a, b) => a.start - b.start);
}

/** The line to show as a caption `t` ms into a clip: the latest started, held a moment after it ends. */
export function captionAt(transcript: TranscriptSegment[] | undefined, t: number, holdMs = 1500): string | null {
  if (!transcript) return null;
  let found: TranscriptSegment | null = null;
  for (const segment of transcript) {
    if (segment.t > t) break;
    if (t <= Math.max(segment.e, segment.t + MIN_CUE_MS) + holdMs) found = segment;
  }
  return found?.x ?? null;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const srtTime = (ms: number) => {
  const total = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(total / 3600000))}:${pad(Math.floor(total / 60000) % 60)}:${pad(Math.floor(total / 1000) % 60)},${pad(total % 1000, 3)}`;
};

/** SubRip subtitles; a cue never runs into the next one. */
export function toSrt(lines: RecordingLine[]): string {
  return lines
    .map((line, i) => {
      const next = lines[i + 1];
      const end = next ? Math.min(line.end, next.start) : line.end;
      return `${i + 1}\n${srtTime(line.start)} --> ${srtTime(Math.max(end, line.start + 1))}\n${line.text}\n`;
    })
    .join('\n');
}

/** Plain text, a paragraph per slide visit, headed by the slide number. */
export function toPlainText(lines: RecordingLine[]): string {
  const parts: string[] = [];
  let slide = -1;
  lines.forEach((line) => {
    if (line.slideIndex !== slide) {
      slide = line.slideIndex;
      parts.push(`${parts.length ? '\n\n' : ''}[Slide ${slide + 1}]\n`);
    } else {
      parts.push(' ');
    }
    parts.push(line.text);
  });
  return parts.join('') + '\n';
}
