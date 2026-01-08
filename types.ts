export interface SlideData {
  id: string;
  src: string;
  name: string;
  file?: File; // Needed to transfer blob data between windows
  imageData?: string; // Base64 image data for sharing via BroadcastChannel
  notes?: string; // Speaker notes from Beamer PDF
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

export type SyncMessage = 
  | { type: 'SYNC_REQUEST' }
  | { type: 'SYNC_INIT'; slides: SlideData[]; startTime: number | null }
  | { type: 'STATE_UPDATE'; index: number; isSpotlight: boolean; mode: AppMode };
