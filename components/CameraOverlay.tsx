import React, { useRef, useState } from 'react';
import { CameraSettings, SlideCamera } from '../types';
import { ImageBounds, useSlideImageBounds } from '../utils/slideImageBounds';
import { cameraBox, useVideoStream } from '../utils/camera';

interface CameraOverlayProps {
  stream: MediaStream | null; // The live camera
  // Instead of a live stream: a recorded clip's <video> (recording playback). It stays mounted, so its
  // sound keeps playing while the picture is hidden (`hidden`, or a slide without a camera).
  children?: React.ReactNode;
  hidden?: boolean;
  settings: CameraSettings;
  slideCamera?: SlideCamera; // Placement from the slide's wpcamera: link
  containerRef: React.RefObject<HTMLElement>;
  slideId: string; // Re-measures the slide when it changes
  // Presenter side only: dragging the camera moves it to a free spot (centre, normalized 0-1 in the slide)
  onMove?: (position: { x: number; y: number }) => void;
  onOpenSettings?: () => void; // Presenter side only: double-click opens the camera settings
}

/**
 * The presenter's camera on the slide (PowerPoint's "Cameo"). Placed in the unzoomed slide frame, so it
 * stays put while the slide zooms or pans. Sits above the slide, media and links, below ink, spotlight,
 * laser and black screen. The video is always muted.
 */
const CameraOverlay: React.FC<CameraOverlayProps> = ({ stream, children, hidden = false, settings, slideCamera, containerRef, slideId, onMove, onOpenSettings }) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const measured = useSlideImageBounds(containerRef, false, [slideId], layerRef, true);
  // Keep the last bounds while a new slide image loads, so the camera does not blink on every slide change
  const lastBoundsRef = useRef<ImageBounds | null>(null);
  if (measured) lastBoundsRef.current = measured;
  const bounds = measured ?? lastBoundsRef.current;
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useVideoStream(videoRef, stream);

  const hasContent = !!stream || children !== undefined;
  const box = hasContent && !hidden && bounds ? cameraBox(settings, slideCamera, bounds) : null;
  const canDrag = !!onMove && !slideCamera && !!box;
  const isInteractive = canDrag || (!!onOpenSettings && !!box);

  const borderWidth = box ? Math.max(2, Math.round(box.width * 0.015)) : 0;
  const radius = settings.shape === 'circle' ? '50%' : settings.shape === 'rounded' && box ? `${Math.round(box.width * 0.08)}px` : '0';

  // Pointer position -> the camera centre that keeps the grab point under the pointer
  const moveTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const layer = layerRef.current?.getBoundingClientRect();
    if (!layer || !bounds || !box || !dragRef.current || !onMove) return;
    const cx = e.clientX - layer.left - dragRef.current.dx;
    const cy = e.clientY - layer.top - dragRef.current.dy;
    const halfW = box.width / 2 / bounds.width;
    const halfH = box.height / 2 / bounds.height;
    onMove({
      x: Math.max(halfW, Math.min(1 - halfW, (cx - bounds.x) / bounds.width)),
      y: Math.max(halfH, Math.min(1 - halfH, (cy - bounds.y) / bounds.height)),
    });
  };

  // The layer stays mounted without a stream so the bounds are always measured relative to it
  return (
    <div ref={layerRef} data-camera-layer="" className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 15 }}>
      {hasContent && (
        <div
          data-camera=""
          className="absolute overflow-hidden bg-neutral-900"
          style={{
            display: box ? 'block' : 'none', // Stays mounted on slides without a camera, so it reappears at once
            left: box?.x,
            top: box?.y,
            width: box?.width,
            height: box?.height,
            borderRadius: radius,
            border: settings.border ? `${borderWidth}px solid rgba(255, 255, 255, 0.9)` : 'none',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.45)',
            boxSizing: 'border-box',
            pointerEvents: isInteractive ? 'auto' : 'none',
            cursor: canDrag ? (isDragging ? 'grabbing' : 'grab') : undefined,
            touchAction: 'none',
          }}
          onPointerDown={(e) => {
            if (!canDrag || e.button !== 0 || !box) return;
            e.preventDefault();
            e.stopPropagation();
            const layer = layerRef.current!.getBoundingClientRect();
            dragRef.current = {
              dx: e.clientX - layer.left - (box.x + box.width / 2),
              dy: e.clientY - layer.top - (box.y + box.height / 2),
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsDragging(true);
          }}
          onPointerMove={(e) => {
            if (dragRef.current) moveTo(e);
          }}
          onPointerUp={() => {
            dragRef.current = null;
            setIsDragging(false);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setIsDragging(false);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onOpenSettings?.();
          }}
          title={canDrag ? 'Drag to move the camera, double-click for its settings' : onOpenSettings ? 'Double-click for camera settings' : undefined}
        >
          <div className="w-full h-full" style={{ transform: settings.mirror ? 'scaleX(-1)' : undefined }}>
            {children !== undefined ? (
              children
            ) : (
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraOverlay;
