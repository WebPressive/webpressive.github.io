import React, { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SlideData, SyncMessage, AppMode, ZoomState } from '../types';
import SpotlightLayer from './SpotlightLayer';
import LaserPointer from './LaserPointer';
import LinkOverlay from './LinkOverlay';
import { clsx } from 'clsx';

const ReceiverView: React.FC = () => {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSpotlight, setIsSpotlight] = useState(false);
  const [isLaser, setIsLaser] = useState(false);
  const [laserPosition, setLaserPosition] = useState<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<AppMode>(AppMode.PRESENTATION);
  const [zoomState, setZoomState] = useState<ZoomState>({ level: 1.0, panX: 0, panY: 0 });
  const receiverContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = new BroadcastChannel('webpressive_sync');

    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;

      if (msg.type === 'SYNC_INIT') {
        // Reconstruct Object URLs from Files or imageData
        const processedSlides = msg.slides.map(s => {
          // If we have imageData (base64), convert it to a blob URL
          if (s.imageData) {
            // Convert base64 data URL to blob
            const byteString = atob(s.imageData.split(',')[1]);
            const mimeString = s.imageData.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeString });
            return { ...s, src: URL.createObjectURL(blob) };
          }
          // Fallback to file if available
          if (s.file) {
            return { ...s, src: URL.createObjectURL(s.file) };
          }
          return s;
        });
        setSlides(processedSlides);
      } else if (msg.type === 'STATE_UPDATE') {
        setCurrentIndex(msg.index);
        setIsSpotlight(msg.isSpotlight);
        setMode(msg.mode);
        if (msg.isLaserActive !== undefined) {
          setIsLaser(msg.isLaserActive);
        }
        if (msg.laserPosition !== undefined) {
          setLaserPosition(msg.laserPosition);
        }
        if (msg.zoomState) {
          setZoomState(msg.zoomState);
        }
      }
    };

    // Request initial state
    channel.postMessage({ type: 'SYNC_REQUEST' });

    return () => channel.close();
  }, []);

  if (slides.length === 0) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-neutral-500">
        Connecting to presenter...
      </div>
    );
  }

  // The receiver mimics the logic of the main App for displaying slides
  // But without controls or overview interactions
  return (
    <div ref={receiverContainerRef} className={clsx("relative w-full h-screen bg-black overflow-hidden select-none receiver-container", (isSpotlight || isLaser) ? "cursor-none" : "cursor-default")}>
      <AnimatePresence mode="wait">
        {mode === AppMode.PRESENTATION && (
          <motion.div
            key="presentation-view"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
             {/* Using standard img instead of motion.img because framer-motion's 
                 animate={{ x: 0 }} overrides the style.transform used for zoom */}
              <img
                key={`slide-${slides[currentIndex].id}`}
                src={slides[currentIndex].src}
                alt={slides[currentIndex].name}
                className="w-full h-full object-contain transition-transform duration-200"
                style={{
                  transform: zoomState.level > 1.0
                    ? `scale(${zoomState.level}) translate(${zoomState.panX / zoomState.level}px, ${zoomState.panY / zoomState.level}px)`
                    : 'none',
                  transformOrigin: 'center center',
                }}
              />
            {/* Links visible on receiver but disabled (projector shouldn't have clickable links) */}
            <LinkOverlay 
              links={slides[currentIndex].links || []} 
              containerRef={receiverContainerRef}
              disabled={true}
              zoomLevel={zoomState.level}
              panX={zoomState.panX}
              panY={zoomState.panY}
            />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* If overview is active in presenter, we might want to just show black or stay on current slide. 
          For now, mimicking the main view behavior (showing slide). Impressive usually shows overview on both. */}
      <AnimatePresence>
         {mode === AppMode.OVERVIEW && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                {/* Simplified Overview for Receiver - usually projectors show overview too */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-8">
                     {slides.map((slide, index) => (
                        <div key={slide.id} className={clsx("opacity-50", index === currentIndex && "opacity-100 ring-2 ring-blue-500")}>
                             <img src={slide.src} className="w-full aspect-video object-cover" />
                        </div>
                     ))}
                </div>
            </div>
         )}
      </AnimatePresence>

      <SpotlightLayer isActive={isSpotlight} />
      <LaserPointer 
        isActive={isLaser} 
        position={laserPosition} 
        containerRef={receiverContainerRef} 
        zoomLevel={zoomState.level}
        panX={zoomState.panX}
        panY={zoomState.panY}
      />
    </div>
  );
};

export default ReceiverView;
