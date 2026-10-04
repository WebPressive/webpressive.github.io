import { MediaFile, MediaMap, PDFMedia, SlideData } from '../types';

export const MEDIA_SCHEME = 'wpmedia:';
const MEDIA_EXTENSION = /\.(gif|mp4|webm)$/i;

// File input `accept` value for a PDF plus its media
export const MEDIA_ACCEPT = '.gif,.mp4,.webm,image/gif,video/mp4,video/webm';

// A file picked or dropped by the user, with its path relative to the picked/dropped root
// (empty folder part for individually selected files)
export interface InputFile {
  file: File;
  path: string;
}

export function normalizeMediaPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
}

export function isMediaFileName(name: string): boolean {
  return MEDIA_EXTENSION.test(name);
}

/**
 * Classifies a raw link URI. Returns the media path for `wpmedia:` links and for links ending
 * in .gif/.mp4/.webm (older decks), or null for ordinary links.
 */
export function getMediaSource(raw: string | undefined): { src: string; kind: PDFMedia['kind'] } | null {
  if (!raw) return null;
  let src: string;
  if (raw.toLowerCase().startsWith(MEDIA_SCHEME)) {
    src = raw.slice(MEDIA_SCHEME.length);
  } else if (MEDIA_EXTENSION.test(raw)) {
    src = raw.replace(/^file:\/\//i, '');
  } else {
    return null;
  }
  try {
    src = decodeURI(src); // hyperref may percent-encode spaces
  } catch {
    // Keep the raw string if it is not valid percent-encoding
  }
  src = normalizeMediaPath(src);
  if (!src) return null;
  return { src, kind: /\.gif$/i.test(src) ? 'gif' : 'video' };
}

const segmentsOf = (path: string) => normalizeMediaPath(path).toLowerCase().split('/').filter(Boolean);

// Number of trailing path segments two paths share
const commonSuffixLength = (a: string[], b: string[]): number => {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
};

/**
 * Finds the file for a media path. `files` paths are relative to the PDF's folder.
 * Order: exact path; the path under figures/ (Beamer's \graphicspath{{figures/}});
 * the longest suffix match on the path; the unique basename.
 */
function matchMediaFile(src: string, files: InputFile[]): InputFile | undefined {
  const wanted = normalizeMediaPath(src).toLowerCase();
  const exact = files.find((f) => f.path.toLowerCase() === wanted);
  if (exact) return exact;
  const underFigures = files.find((f) => f.path.toLowerCase() === `figures/${wanted}`);
  if (underFigures) return underFigures;

  const wantedSegments = segmentsOf(wanted);
  let best: InputFile[] = [];
  let bestLength = 0;
  for (const f of files) {
    const length = commonSuffixLength(segmentsOf(f.path), wantedSegments);
    if (length > bestLength) {
      best = [f];
      bestLength = length;
    } else if (length === bestLength && length > 0) {
      best.push(f);
    }
  }
  // A basename-only match must be unique; a longer suffix match takes the shortest path on a tie
  if (bestLength === 0 || (bestLength === 1 && best.length > 1)) return undefined;
  return best.sort((a, b) => a.path.length - b.path.length)[0];
}

/**
 * Matches every media path referenced by `slides` to one of the supplied files.
 * `pdfPath` is the PDF's path in the same tree as `files`; file paths are made relative to its folder.
 */
export function resolveMediaFiles(
  slides: SlideData[],
  files: InputFile[],
  pdfPath: string
): { resolved: MediaFile[]; missing: string[] } {
  const pdfFolder = normalizeMediaPath(pdfPath).split('/').slice(0, -1).join('/');
  const prefix = pdfFolder ? `${pdfFolder}/` : '';
  const candidates = files
    .filter((f) => isMediaFileName(f.file.name))
    .map((f) => {
      const path = normalizeMediaPath(f.path || f.file.name);
      return { file: f.file, path: prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path };
    });

  const wanted = new Set<string>();
  slides.forEach((slide) => slide.media?.forEach((m) => wanted.add(m.src)));

  const resolved: MediaFile[] = [];
  const missing: string[] = [];
  wanted.forEach((src) => {
    const match = matchMediaFile(src, candidates);
    if (match) resolved.push({ path: src, file: match.file });
    else missing.push(src);
  });
  return { resolved, missing };
}

export function buildMediaMap(files: MediaFile[]): MediaMap {
  const map: MediaMap = {};
  files.forEach(({ path, file }) => {
    map[path] = URL.createObjectURL(file);
  });
  return map;
}

export function revokeMediaMap(map: MediaMap) {
  Object.values(map).forEach((url) => URL.revokeObjectURL(url));
}

/**
 * Decodes each GIF once at load time so its first display does not stutter.
 * Videos are left to the <video> element's own buffering.
 */
export function preloadMedia(map: MediaMap) {
  Object.entries(map).forEach(([path, url]) => {
    if (!/\.gif$/i.test(path)) return;
    const img = new Image();
    img.src = url;
    img.decode().catch(() => {
      // A broken file is reported by the overlay's onError; nothing to do here
    });
  });
}
