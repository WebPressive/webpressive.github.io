import React, { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Annotation, AppMode, AudienceState, CameraSettings, MediaMap, SlideData } from '../types';
import SpotlightLayer from './SpotlightLayer';
import LaserPointer from './LaserPointer';
import LinkOverlay from './LinkOverlay';
import AnnotationLayer from './AnnotationLayer';
import MediaOverlay from './MediaOverlay';
import CameraOverlay from './CameraOverlay';
import { clsx } from 'clsx';

interface AudienceViewProps {
  slides: SlideData[];
  state: AudienceState;
  annotations: Annotation[]; // Ink on the current slide
  draft: Annotation | null; // Stroke being drawn on the current slide
  mediaMap: MediaMap;
  camera: {
    settings: CameraSettings;
    stream?: MediaStream | null; // Live camera (projector window)
    video?: React.ReactNode; // Recorded camera clip (playback)
    hidden?: boolean;
  };
  className?: string; // Marks the container (e.g. 'receiver-container')
}

/**
 * What the audience sees: the slide with its media, ink, camera, spotlight, laser and black screen.
 * Pure display, driven by props: the projector window feeds it live state, recording playback feeds
 * it a recorded timeline.
 */
const AudienceView: React.FC<AudienceViewProps> = ({ slides, state, annotations, draft, mediaMap, camera, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const slide = slides[state.index] ?? slides[0];
  const { zoomState } = state;

  return (
    <div
      ref={containerRef}
      className={clsx('relative w-full h-screen bg-black overflow-hidden select-none', className, state.isSpotlight || state.isLaser ? 'cursor-none' : 'cursor-default')}
    >
      <AnimatePresence mode="wait">
        {state.mode === AppMode.PRESENTATION && (
          <motion.div
            key="presentation-view"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Enforce 16:9 Aspect Ratio Container for Matching Viewport */}
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: '100%' }}>
              <img
                key={`slide-${slide.id}`}
                src={slide.src}
                alt={slide.name}
                className="w-auto h-auto max-w-full max-h-full object-contain transition-transform duration-200"
                style={{
                  transform: zoomState.level > 1.0
                    ? `scale(${zoomState.level}) translate(${zoomState.panX * 100}%, ${zoomState.panY * 100}%)`
                    : 'none',
                  transformOrigin: 'center center',
                }}
              />
              <MediaOverlay
                media={slide.media || []}
                mediaMap={mediaMap}
                containerRef={containerRef}
                slideId={slide.id}
                zoomLevel={zoomState.level}
                panX={zoomState.panX}
                panY={zoomState.panY}
                playing={state.isMediaActive}
              />
              {/* Links visible but disabled (the audience screen has no clickable links) */}
              <LinkOverlay
                links={slide.links || []}
                containerRef={containerRef}
                disabled={true}
                zoomLevel={zoomState.level}
                panX={zoomState.panX}
                panY={zoomState.panY}
              />
              {/* Presenter's ink, read-only */}
              <AnnotationLayer
                annotations={annotations}
                draft={draft}
                containerRef={containerRef}
                zoomLevel={zoomState.level}
                panX={zoomState.panX}
                panY={zoomState.panY}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In overview mode the audience sees the slide grid */}
      <AnimatePresence>
        {state.mode === AppMode.OVERVIEW && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-8">
              {slides.map((s, index) => (
                <div key={s.id} className={clsx('opacity-50', index === state.index && 'opacity-100 ring-2 ring-blue-500')}>
                  <img src={s.src} className="w-full aspect-video object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Outside the presentation fade, so the camera stays steady through slide changes */}
      <CameraOverlay
        stream={state.mode === AppMode.PRESENTATION ? camera.stream ?? null : null}
        hidden={camera.hidden || state.mode !== AppMode.PRESENTATION}
        settings={camera.settings}
        slideCamera={slide.camera}
        containerRef={containerRef}
        slideId={slide.id}
      >
        {camera.video}
      </CameraOverlay>
      <SpotlightLayer
        isActive={state.isSpotlight}
        position={state.spotlightPosition}
        containerRef={containerRef}
        zoomLevel={zoomState.level}
        panX={zoomState.panX}
        panY={zoomState.panY}
      />
      <LaserPointer
        isActive={state.isLaser}
        position={state.laserPosition}
        containerRef={containerRef}
        zoomLevel={zoomState.level}
        panX={zoomState.panX}
        panY={zoomState.panY}
      />
      {/* Black screen (B or . on the presenter or a clicker) */}
      {state.isBlackScreen && <div className="fixed inset-0 z-[70] bg-black" aria-label="Black screen" />}
    </div>
  );
};

export default AudienceView;
