export interface PDFLink {
  // Normalized coordinates (0-1 range relative to page dimensions)
  x: number;
  y: number;
  width: number;
  height: number;
  // Link destination
  url?: string; // External URL
  dest?: number; // Internal page number (0-indexed)
}

// Animated media (GIF/video) drawn over its poster still. Marked in the PDF by a link whose
// URI is `wpmedia:<relative/path>` (or, for older decks, ends in .gif/.mp4/.webm).
export interface PDFMedia {
  // Normalized coordinates (0-1 range relative to page dimensions), same convention as PDFLink
  x: number;
  y: number;
  width: number;
  height: number;
  src: string; // Path from the link, relative to the PDF's folder, e.g. "videos/mri/mri_spine.gif"
  kind: 'gif' | 'video'; // .gif -> gif; .mp4/.webm -> video
}

// A media file supplied alongside the PDF, keyed by the `src` of the PDFMedia that uses it
export interface MediaFile {
  path: string;
  file: Blob;
}

// Media path -> object URL (blob:). Each window builds its own from the MediaFile blobs.
export type MediaMap = Record<string, string>;

export interface SlideData {
  id: string;
  src: string;
  name: string;
  file?: File; // Needed to transfer blob data between windows
  imageData?: string; // Base64 image data for sharing via BroadcastChannel
  notes?: string; // Speaker notes from Beamer PDF
  links?: PDFLink[]; // Embedded links from PDF
  media?: PDFMedia[]; // Animated media regions (wpmedia: links)
}

export enum AppMode {
  UPLOAD = 'UPLOAD',
  PRESENTATION = 'PRESENTATION',
  OVERVIEW = 'OVERVIEW',
}

export interface PresentationState {
  currentSlideIndex: number;
  slides: SlideData[];
  mode: AppMode;
  isSpotlightActive: boolean;
  startTime: number | null;
}

export interface ZoomState {
  level: number; // Zoom level (1.0 = 100%, 2.0 = 200%, etc.)
  panX: number; // Normalized Pan offset X (fraction of image width, e.g. 0.1 = 10%)
  panY: number; // Normalized Pan offset Y (fraction of image height)
}

// --- Annotations (on-slide ink) ---

export type AnnotationTool = 'pen' | 'highlighter' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'eraser';

export interface AnnotationPoint {
  // Normalized coordinates (0-1 range relative to the unzoomed slide image)
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  tool: Exclude<AnnotationTool, 'eraser'>;
  color: string;
  width: number; // Stroke width as a fraction of the slide image width (resolution independent)
  // pen/highlighter: polyline; line/arrow/rect/ellipse: [start, end]; text: [top-left anchor]
  points: AnnotationPoint[];
  text?: string; // text tool only; '\n' separates lines
  fontSize?: number; // text tool only; fraction of the slide image width
}

// Slide index -> annotations on that slide
export type AnnotationMap = Record<number, Annotation[]>;

export type SyncMessage =
  | { type: 'SYNC_REQUEST' }
  | { type: 'SYNC_INIT'; slides: SlideData[]; startTime: number | null }
  | { type: 'STATE_UPDATE'; index: number; isSpotlight: boolean; spotlightPosition?: { x: number; y: number } | null; mode: AppMode; isLaserActive?: boolean; laserPosition?: { x: number; y: number } | null; zoomState?: ZoomState; isMediaActive?: boolean }
  | { type: 'ANNOTATIONS_SYNC'; annotations: AnnotationMap }
  | { type: 'ANNOTATION_DRAFT'; index: number; annotation: Annotation | null }
  | { type: 'MEDIA_SYNC'; files: MediaFile[] };
