import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SlideData, AppMode, SyncMessage } from './types';
import UploadScreen from './components/UploadScreen';
import Controls from './components/Controls';
import SpotlightLayer from './components/SpotlightLayer';
import LaserPointer from './components/LaserPointer';
import ReceiverView from './components/ReceiverView';
import { clsx } from 'clsx';

const App: React.FC = () => {
  // --- Receiver Logic Check ---
  const [isReceiver, setIsReceiver] = useState(false);
  useEffect(() => {
    if (window.location.search.includes('mode=receiver')) {
      setIsReceiver(true);
    }
  }, []);

  // --- State ---
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [isSpotlightActive, setIsSpotlightActive] = useState(false);
  const [isLaserActive, setIsLaserActive] = useState(false);
  const [laserPosition, setLaserPosition] = useState<{ x: number; y: number } | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  
  // Dual Screen State
  const [isDualScreen, setIsDualScreen] = useState(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  
  // Resizable panels state
  const [mainWidth, setMainWidth] = useState(66.67); // Percentage
  const [nextHeight, setNextHeight] = useState(60); // Percentage of sidebar
  const [isResizing, setIsResizing] = useState<string | null>(null);
  
  // Refs for laser pointer containers
  const presenterSlideRef = useRef<HTMLDivElement>(null);
  const normalViewRef = useRef<HTMLDivElement>(null);

  // --- Dual Screen / Broadcasting Logic ---
  useEffect(() => {
    if (isReceiver) return; // Receivers don't broadcast

    const channel = new BroadcastChannel('webpressive_sync');
    broadcastChannelRef.current = channel;

    // Listen for requests from new receiver windows
    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      if (event.data.type === 'SYNC_REQUEST') {
        // Send initial data to receiver
        channel.postMessage({
          type: 'SYNC_INIT',
          slides: slides,
          startTime: startTime
        });
        // Send current state
        channel.postMessage({
          type: 'STATE_UPDATE',
          index: currentSlideIndex,
          isSpotlight: isSpotlightActive,
          mode: mode,
          isLaserActive: isLaserActive,
          laserPosition: laserPosition
        });
      }
    };

    return () => channel.close();
  }, [isReceiver, slides, startTime, currentSlideIndex, isSpotlightActive, mode, isLaserActive, laserPosition]);

  // Broadcast state changes
  useEffect(() => {
    if (!isReceiver && broadcastChannelRef.current && mode !== AppMode.UPLOAD) {
      broadcastChannelRef.current.postMessage({
        type: 'STATE_UPDATE',
        index: currentSlideIndex,
        isSpotlight: isSpotlightActive,
        mode: mode,
        isLaserActive: isLaserActive,
        laserPosition: laserPosition
      });
    }
  }, [currentSlideIndex, isSpotlightActive, mode, isReceiver, isLaserActive, laserPosition]);

  const openDualScreen = () => {
    window.open(`${window.location.pathname}?mode=receiver`, 'WebPressiveReceiver', 'width=800,height=600');
    setIsDualScreen(true);
  };

  // --- Navigation Logic ---
  const startPresentation = (newSlides: SlideData[]) => {
    setSlides(newSlides);
    setMode(AppMode.PRESENTATION);
    setStartTime(Date.now());
    setCurrentSlideIndex(0);
  };

  const nextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const toggleOverview = useCallback(() => {
    setMode((prev) => (prev === AppMode.PRESENTATION ? AppMode.OVERVIEW : AppMode.PRESENTATION));
    setIsSpotlightActive(false); 
  }, []);

  const selectSlide = (index: number) => {
    setCurrentSlideIndex(index);
    setMode(AppMode.PRESENTATION);
  };

  const toggleSpotlight = useCallback(() => {
    if (mode === AppMode.PRESENTATION) {
      setIsSpotlightActive((prev) => !prev);
      // Turn off laser when spotlight is activated
      if (!isSpotlightActive) {
        setIsLaserActive(false);
      }
    }
  }, [mode, isSpotlightActive]);

  const toggleLaser = useCallback(() => {
    if (mode === AppMode.PRESENTATION) {
      setIsLaserActive((prev) => !prev);
      // Turn off spotlight when laser is activated
      if (!isLaserActive) {
        setIsSpotlightActive(false);
      }
    }
  }, [mode, isLaserActive]);

  // Track mouse position for laser pointer (normalized relative to image bounds)
  useEffect(() => {
    if (!isLaserActive || mode !== AppMode.PRESENTATION) {
      setLaserPosition(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Find the image element to get its actual rendered bounds
      const container = document.querySelector('.presenter-container') || document.body;
      const img = container.querySelector('img[class*="object-contain"]') as HTMLImageElement;
      
      if (img) {
        const rect = img.getBoundingClientRect();
        // Calculate position relative to the image bounds
        const relativeX = (e.clientX - rect.left) / rect.width;
        const relativeY = (e.clientY - rect.top) / rect.height;
        
        // Only update if mouse is within image bounds
        if (relativeX >= 0 && relativeX <= 1 && relativeY >= 0 && relativeY <= 1) {
          setLaserPosition({ x: relativeX, y: relativeY });
        }
      } else {
        // Fallback: try to find image in normal presentation view
        const normalImg = document.querySelector('img[class*="object-contain"]') as HTMLImageElement;
        if (normalImg) {
          const rect = normalImg.getBoundingClientRect();
          const relativeX = (e.clientX - rect.left) / rect.width;
          const relativeY = (e.clientY - rect.top) / rect.height;
          
          if (relativeX >= 0 && relativeX <= 1 && relativeY >= 0 && relativeY <= 1) {
            setLaserPosition({ x: relativeX, y: relativeY });
          }
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isLaserActive, mode]);

  // Resize handlers (must be before any conditional returns)
  const handleResizeStart = useCallback((type: string) => {
    setIsResizing(type);
  }, []);
  
  const handleResizeEnd = useCallback(() => {
    setIsResizing(null);
  }, []);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    if (isResizing === 'vertical') {
      const sidebar = document.querySelector('.presenter-sidebar') as HTMLElement;
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect();
        const newHeight = ((e.clientY - rect.top) / rect.height) * 100;
        setNextHeight(Math.max(20, Math.min(80, newHeight)));
      }
    } else if (isResizing === 'horizontal') {
      const container = document.querySelector('.presenter-container') as HTMLElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
        setMainWidth(Math.max(40, Math.min(80, newWidth)));
      }
    }
  }, [isResizing]);
  
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleMouseMove, handleResizeEnd]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === AppMode.UPLOAD) return;

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          if (mode === AppMode.PRESENTATION) nextSlide();
          break;
        case 'ArrowLeft':
        case 'PageUp':
        case 'Backspace':
          if (mode === AppMode.PRESENTATION) prevSlide();
          break;
        case 'Tab':
          e.preventDefault();
          toggleOverview();
          break;
        case 'z':
        case 'Z':
        case 's': 
          toggleSpotlight();
          break;
        case 'l':
        case 'L':
          toggleLaser();
          break;
        case 'f':
        case 'F':
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
          break;
        case 'Escape':
          if (mode === AppMode.OVERVIEW) setMode(AppMode.PRESENTATION);
          else if (isSpotlightActive) setIsSpotlightActive(false);
          else if (isLaserActive) setIsLaserActive(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, nextSlide, prevSlide, toggleOverview, toggleSpotlight, toggleLaser, isSpotlightActive, isLaserActive]);

  // --- Render Logic ---

  if (isReceiver) {
    return <ReceiverView />;
  }

  if (mode === AppMode.UPLOAD) {
    return <UploadScreen onSlidesLoaded={startPresentation} />;
  }

  // --- Presenter View (Dual Screen Active) ---
  if (isDualScreen && mode === AppMode.PRESENTATION) {
    const nextIndex = Math.min(currentSlideIndex + 1, slides.length - 1);
    
    return (
      <div className="w-full h-screen bg-neutral-900 text-white flex flex-col overflow-hidden">
        {/* Presenter Dashboard */}
        <div className="flex-1 flex gap-4 p-4 h-full presenter-container">
            
            {/* Main Slide (Left, Resizable) */}
            <div 
              ref={presenterSlideRef}
              className="bg-black rounded-2xl flex items-center justify-center relative overflow-hidden border border-neutral-700"
              style={{ width: `${mainWidth}%` }}
            >
               <img 
                 src={slides[currentSlideIndex].src} 
                 className="w-full h-full object-contain"
                 alt={slides[currentSlideIndex].name}
               />
               <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded-full text-sm font-mono text-red-400 border border-red-500/30">
                 LIVE ON PROJECTOR
               </div>
               <SpotlightLayer isActive={isSpotlightActive} />
               <LaserPointer isActive={isLaserActive} position={laserPosition} containerRef={presenterSlideRef} />
            </div>
            
            {/* Resize Handle (Vertical) */}
            <div
              className="w-1 bg-neutral-700 hover:bg-blue-500 cursor-col-resize transition-colors flex items-center justify-center group"
              onMouseDown={() => handleResizeStart('horizontal')}
            >
              <div className="w-0.5 h-16 bg-neutral-600 group-hover:bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Sidebar (Next Slide + Info, Resizable) */}
            <div 
              className="flex flex-col gap-4 presenter-sidebar"
              style={{ width: `${100 - mainWidth}%` }}
            >
                {/* Next Slide Preview (Resizable Height) */}
                <div 
                  className="bg-black rounded-2xl relative flex items-center justify-center border border-neutral-700 overflow-hidden"
                  style={{ height: `${nextHeight}%` }}
                >
                    {currentSlideIndex < slides.length - 1 ? (
                        <img 
                          src={slides[nextIndex].src} 
                          className="max-w-full max-h-full object-contain opacity-75"
                          alt="Next slide"
                        />
                    ) : (
                        <div className="text-neutral-500">End of presentation</div>
                    )}
                    <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded-full text-sm font-mono text-green-400 border border-green-500/30">
                        NEXT
                    </div>
                </div>
                
                {/* Resize Handle (Horizontal) */}
                <div
                  className="h-1 bg-neutral-700 hover:bg-blue-500 cursor-row-resize transition-colors flex items-center justify-center group"
                  onMouseDown={() => handleResizeStart('vertical')}
                >
                  <div className="h-0.5 w-16 bg-neutral-600 group-hover:bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Info Panel / Notes (Resizable Height) */}
                <div 
                  className="bg-neutral-800 rounded-2xl p-6 flex flex-col border border-neutral-700 overflow-hidden"
                  style={{ height: `${100 - nextHeight}%` }}
                >
                    <div className="flex-1 overflow-y-auto pr-2" style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: '#525252 #262626'
                    }}>
                        <h2 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-3 sticky top-0 bg-neutral-800 pb-2">Speaker Notes</h2>
                        {slides[currentSlideIndex].notes ? (
                            <div className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                                {slides[currentSlideIndex].notes}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-500 italic">No notes available for this slide.</p>
                        )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-neutral-700 flex-shrink-0">
                        <h2 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-1">Current Slide</h2>
                        <p className="text-sm text-neutral-300 truncate">{slides[currentSlideIndex].name}</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Controls Bar */}
        <div className="h-20 bg-neutral-900 border-t border-neutral-700 flex items-center justify-center">
            <Controls
                currentSlide={currentSlideIndex}
                totalSlides={slides.length}
                mode={mode}
                isSpotlight={isSpotlightActive}
                isLaser={isLaserActive}
                startTime={startTime}
                toggleOverview={toggleOverview}
                toggleSpotlight={toggleSpotlight}
                toggleLaser={toggleLaser}
                toggleDualScreen={openDualScreen}
                nextSlide={nextSlide}
                prevSlide={prevSlide}
            />
        </div>
      </div>
    );
  }

  // --- Normal Presentation View ---
  return (
    <div ref={normalViewRef} className="w-full h-screen bg-black text-white relative overflow-hidden normal-presentation-container">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlideIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full h-full flex items-center justify-center"
        >
          <img 
            src={slides[currentSlideIndex].src} 
            className="w-full h-full object-contain"
            alt={slides[currentSlideIndex].name}
          />
          <SpotlightLayer isActive={isSpotlightActive} />
          <LaserPointer isActive={isLaserActive} position={laserPosition} containerRef={normalViewRef} />
        </motion.div>
      </AnimatePresence>

      <Controls
        currentSlide={currentSlideIndex}
        totalSlides={slides.length}
        mode={mode}
        isSpotlight={isSpotlightActive}
        isLaser={isLaserActive}
        startTime={startTime}
        toggleOverview={toggleOverview}
        toggleSpotlight={toggleSpotlight}
        toggleLaser={toggleLaser}
        toggleDualScreen={openDualScreen}
        nextSlide={nextSlide}
        prevSlide={prevSlide}
      />

      {/* Overview Mode */}
      {mode === AppMode.OVERVIEW && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-neutral-900 z-30 overflow-y-auto p-8"
        >
          <div className="grid grid-cols-4 gap-4 max-w-7xl mx-auto">
            {slides.map((slide, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => selectSlide(index)}
                className={clsx(
                  "cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                  index === currentSlideIndex
                    ? "border-blue-500 ring-2 ring-blue-500/50"
                    : "border-neutral-700 hover:border-neutral-600"
                )}
              >
                <img 
                  src={slide.src} 
                  className="w-full h-auto"
                  alt={slide.name}
                />
                <div className="p-2 bg-neutral-800 text-sm truncate">
                  {slide.name}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default App;