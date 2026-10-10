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

// Where the presenter's camera goes on one slide, from a `wpcamera:` link in the PDF:
// the link's box (normalized 0-1, like PDFLink), or `hidden` for `wpcamera:off`
export interface SlideCamera {
  x: number;
  y: number;
  width: number;
  height: number;
  hidden?: boolean;
}

export interface SlideData {
  id: string;
  src: string;
  name: string;
  file?: File; // Needed to transfer blob data between windows
  imageData?: string; // Base64 image data for sharing via BroadcastChannel
  notes?: string; // Speaker notes from Beamer PDF
  links?: PDFLink[]; // Embedded links from PDF
  media?: PDFMedia[]; // Animated media regions (wpmedia: links)
  camera?: SlideCamera; // Camera placement for this slide (wpcamera: link)
}

// --- Presenter camera (shown on the slides) ---

export type CameraShape = 'circle' | 'rounded' | 'rectangle';
export type CameraCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface CameraSettings {
  videoDeviceId: string; // '' = the system default camera
  audioDeviceId: string; // '' = the system default microphone (used by recordings)
  // A corner preset, or the camera's centre dragged to a free spot (normalized 0-1 in the slide)
  position: CameraCorner | { x: number; y: number };
  size: number; // Camera width as a fraction of the slide width
  shape: CameraShape;
  mirror: boolean;
  border: boolean;
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

// --- Talk recordings ---

// Everything the audience sees, apart from ink and the camera (recorded separately)
export interface AudienceState {
  index: number;
  mode: AppMode;
  isSpotlight: boolean;
  spotlightPosition: { x: number; y: number } | null;
  isLaser: boolean;
  laserPosition: { x: number; y: number } | null;
  zoomState: ZoomState;
  isMediaActive: boolean;
  isBlackScreen: boolean;
}

// What a clip starts from, so every clip plays on its own
export interface ClipInitialState {
  state: AudienceState;
  annotations: Annotation[]; // Ink on the clip's slide
  camera: CameraSettings;
}

// A change during a clip, `t` ms after the clip started:
// s = audience state fields that changed, a = ink on the slide, d = stroke being drawn, c = camera settings
export type TimelineEvent =
  | { t: number; k: 's'; d: Partial<AudienceState> }
  | { t: number; k: 'a'; d: Annotation[] }
  | { t: number; k: 'd'; d: Annotation | null }
  | { t: number; k: 'c'; d: CameraSettings };

// One continuous piece of a recording: one slide, camera shown or not throughout.
// A slide change, showing/hiding the camera, or a pause starts the next clip.
export interface ClipSummary {
  id: string;
  slideIndex: number;
  durationMs: number;
  bytes: number;
  hasVideo: boolean;
}

export interface ClipData extends ClipSummary {
  recordingId: string;
  mimeType: string;
  createdAt: number;
  complete: boolean; // false while recording (or if the page closed mid-clip)
  initial: ClipInitialState;
  events: TimelineEvent[];
}

export interface RecordingMeta {
  id: string;
  deckKey: string; // PDF name + slide count, as for annotations
  deckName: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clips: ClipSummary[]; // In playback order
}

export type SyncMessage =
  | { type: 'SYNC_REQUEST' }
  | { type: 'SYNC_INIT'; slides: SlideData[]; startTime: number | null }
  | { type: 'STATE_UPDATE'; index: number; isSpotlight: boolean; spotlightPosition?: { x: number; y: number } | null; mode: AppMode; isLaserActive?: boolean; laserPosition?: { x: number; y: number } | null; zoomState?: ZoomState; isMediaActive?: boolean; isBlackScreen?: boolean }
  | { type: 'ANNOTATIONS_SYNC'; annotations: AnnotationMap }
  | { type: 'ANNOTATION_DRAFT'; index: number; annotation: Annotation | null }
  | { type: 'MEDIA_SYNC'; files: MediaFile[] }
  // Camera on the slides. `active` once the presenter's stream is live; the projector window borrows that
  // stream (matched by `streamId`) from its opener, or opens `deviceId` itself.
  | { type: 'CAMERA_SYNC'; active: boolean; settings: CameraSettings; streamId?: string; deviceId?: string }
  // Receiver -> presenter: a key pressed (e.g. by a clicker) or a wheel step taken in the projector window
  | { type: 'KEY_FORWARD'; key: string; code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }
  | { type: 'WHEEL_STEP'; direction: 1 | -1 };
