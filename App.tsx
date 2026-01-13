import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Plus, Minus, Eye } from 'lucide-react';
import { SlideData, AppMode, SyncMessage, ZoomState } from './types';
import UploadScreen from './components/UploadScreen';
import Controls from './components/Controls';
import SpotlightLayer from './components/SpotlightLayer';
import LaserPointer from './components/LaserPointer';
import LinkOverlay from './components/LinkOverlay';
import RegionSelector from './components/RegionSelector';
import ReceiverView from './components/ReceiverView';
import AboutModal from './components/AboutModal';
import { renderPageAtZoom } from './utils/pdfUtils';
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
  const [overviewHighlightIndex, setOverviewHighlightIndex] = useState(0); // Highlighted slide in overview mode
  const overviewSlideRefs = useRef<(HTMLDivElement | null)[]>([]); // Refs for overview slides
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [isSpotlightActive, setIsSpotlightActive] = useState(false);
  const [spotlightPosition, setSpotlightPosition] = useState<{ x: number; y: number } | null>(null);
  const [isLaserActive, setIsLaserActive] = useState(false);
  const [laserPosition, setLaserPosition] = useState<{ x: number; y: number } | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedTime, setPausedTime] = useState(0); // Accumulated paused time in milliseconds
  const [pauseStartTime, setPauseStartTime] = useState<number | null>(null);
  
  // Dual Screen State
  const [isDualScreen, setIsDualScreen] = useState(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const receiverWindowRef = useRef<Window | null>(null);
  
  // Resizable panels state
  const [mainWidth, setMainWidth] = useState(66.67); // Percentage
  const [nextHeight, setNextHeight] = useState(60); // Percentage of sidebar
  const [isResizing, setIsResizing] = useState<string | null>(null);
  
  // Refs for laser pointer containers
  const presenterSlideRef = useRef<HTMLDivElement>(null);
  const normalViewRef = useRef<HTMLDivElement>(null);
  
  // Ref for speaker notes container (for scrolling)
  const speakerNotesRef = useRef<HTMLDivElement>(null);
  
  // Speaker notes font size state
  const [speakerNotesFontSize, setSpeakerNotesFontSize] = useState(() => {
    const saved = localStorage.getItem('speakerNotesFontSize');
    return saved ? parseInt(saved, 10) : 14; // Default 14px
  });
  
  // Reading guide state
  const [isReadingGuideEnabled, setIsReadingGuideEnabled] = useState(() => {
    const saved = localStorage.getItem('isReadingGuideEnabled');
    return saved === 'true';
  });
  
  // Zoom state
  const [zoomState, setZoomState] = useState<ZoomState>({ level: 1.0, panX: 0, panY: 0 });
  const [isZooming, setIsZooming] = useState(false);
  const [isRegionSelecting, setIsRegionSelecting] = useState(false);
  const [regionStart, setRegionStart] = useState<{ x: number; y: number } | null>(null);
  const [regionCurrent, setRegionCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const isDraggingRef = useRef(false);
  const regionStartRef = useRef<{ x: number; y: number } | null>(null);
  const regionCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [zoomedSlideSrc, setZoomedSlideSrc] = useState<string | null>(null);
  const zoomedSlideRef = useRef<string | null>(null); // Track which slide is currently zoomed

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
        // Send current state immediately (including zoom)
          channel.postMessage({
          type: 'STATE_UPDATE',
          index: currentSlideIndex,
          isSpotlight: isSpotlightActive,
          spotlightPosition: spotlightPosition,
          mode: mode,
          isLaserActive: isLaserActive,
          laserPosition: laserPosition,
          zoomState: zoomState
        } as SyncMessage);
      }
    };

    return () => channel.close();
  }, [isReceiver, slides, startTime, currentSlideIndex, isSpotlightActive, spotlightPosition, mode, isLaserActive, laserPosition, zoomState]);

  // Broadcast state changes
  useEffect(() => {
    if (!isReceiver && broadcastChannelRef.current && mode !== AppMode.UPLOAD) {
      broadcastChannelRef.current.postMessage({
        type: 'STATE_UPDATE',
        index: currentSlideIndex,
        isSpotlight: isSpotlightActive,
        spotlightPosition: spotlightPosition,
        mode: mode,
        isLaserActive: isLaserActive,
        laserPosition: laserPosition,
        zoomState: zoomState
      });
    }
  }, [currentSlideIndex, isSpotlightActive, spotlightPosition, mode, isReceiver, isLaserActive, laserPosition, zoomState]);

  const toggleDualScreen = useCallback(() => {
    if (isDualScreen && receiverWindowRef.current) {
      // Close dual-screen mode
      receiverWindowRef.current.close();
      receiverWindowRef.current = null;
      setIsDualScreen(false);
    } else {
      // Open dual-screen mode
      const receiverWindow = window.open(
        `${window.location.pathname}?mode=receiver`, 
        'WebPressiveReceiver', 
        'width=800,height=600'
      );
      if (receiverWindow) {
        receiverWindowRef.current = receiverWindow;
        setIsDualScreen(true);
        
        // Check if window was closed by user (manually)
        const checkWindowClosed = setInterval(() => {
          if (receiverWindow.closed) {
            clearInterval(checkWindowClosed);
            receiverWindowRef.current = null;
            setIsDualScreen(false);
          }
        }, 500);
      }
    }
  }, [isDualScreen]);

  // --- Navigation Logic ---
  const startPresentation = (newSlides: SlideData[]) => {
    setSlides(newSlides);
    setMode(AppMode.PRESENTATION);
    setStartTime(Date.now());
    setCurrentSlideIndex(0);
    setIsPaused(false);
    setPausedTime(0);
    setPauseStartTime(null);
  };

  // --- Timer Reset Logic ---
  const resetTimer = useCallback(() => {
    setStartTime(Date.now());
    setIsPaused(false);
    setPausedTime(0);
    setPauseStartTime(null);
  }, []);

  // --- Timer Pause Logic ---
  const togglePause = useCallback(() => {
    if (!startTime) return;
    
    if (isPaused) {
      // Resuming: add the paused duration to accumulated paused time
      if (pauseStartTime) {
        const pauseDuration = Date.now() - pauseStartTime;
        setPausedTime(prev => prev + pauseDuration);
        setPauseStartTime(null);
      }
      setIsPaused(false);
    } else {
      // Pausing: record when we started pausing
      setPauseStartTime(Date.now());
      setIsPaused(true);
    }
  }, [isPaused, startTime, pauseStartTime]);

  // Speaker notes font size handlers
  const increaseFontSize = useCallback(() => {
    setSpeakerNotesFontSize((prev) => {
      const newSize = Math.min(prev + 1, 24); // Max 24px
      localStorage.setItem('speakerNotesFontSize', newSize.toString());
      return newSize;
    });
  }, []);

  const decreaseFontSize = useCallback(() => {
    setSpeakerNotesFontSize((prev) => {
      const newSize = Math.max(prev - 1, 8); // Min 8px
      localStorage.setItem('speakerNotesFontSize', newSize.toString());
      return newSize;
    });
  }, []);

  // Reading guide toggle
  const toggleReadingGuide = useCallback(() => {
    setIsReadingGuideEnabled((prev) => {
      const newValue = !prev;
      localStorage.setItem('isReadingGuideEnabled', newValue.toString());
      // Reset scroll position to top when enabling the reading guide
      if (newValue && speakerNotesRef.current) {
        speakerNotesRef.current.scrollTop = 0;
      }
      return newValue;
    });
  }, []);

  // Zoom functions
  const applyZoom = useCallback(async (zoomLevel: number, resetPan: boolean = false) => {
    if (slides.length === 0) return;
    
    setIsZooming(true);
    try {
      const pageNumber = currentSlideIndex + 1; // PDF pages are 1-indexed
      const newBlobUrl = await renderPageAtZoom(pageNumber, zoomLevel);
      
      // Clean up old zoomed image if it exists
      if (zoomedSlideSrc && zoomedSlideSrc !== slides[currentSlideIndex].src) {
        URL.revokeObjectURL(zoomedSlideSrc);
      }
      
      setZoomedSlideSrc(newBlobUrl);
      zoomedSlideRef.current = slides[currentSlideIndex].id;
      
      setZoomState((prev) => {
        const newZoomState = {
          level: zoomLevel,
          panX: resetPan ? 0 : prev.panX,
          panY: resetPan ? 0 : prev.panY,
        };

        // Broadcast zoom state for dual screen
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'STATE_UPDATE',
            index: currentSlideIndex,
            isSpotlight: isSpotlightActive,
            spotlightPosition: spotlightPosition,
            mode: mode,
            isLaserActive: isLaserActive,
            laserPosition: laserPosition,
            zoomState: newZoomState,
          } as SyncMessage);
        }

        return newZoomState;
      });
    } catch (error) {
      console.error('Failed to apply zoom:', error);
    } finally {
      setIsZooming(false);
    }
  }, [slides, currentSlideIndex, isSpotlightActive, mode, isLaserActive, laserPosition, zoomState]);

  const resetZoom = useCallback(() => {
    if (zoomedSlideSrc && zoomedSlideSrc !== slides[currentSlideIndex]?.src) {
      URL.revokeObjectURL(zoomedSlideSrc);
    }
    setZoomedSlideSrc(null);
    zoomedSlideRef.current = null;
    setZoomState({ level: 1.0, panX: 0, panY: 0 });
    
    // Broadcast reset
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'STATE_UPDATE',
        index: currentSlideIndex,
        isSpotlight: isSpotlightActive,
        spotlightPosition: spotlightPosition,
        mode: mode,
        isLaserActive: isLaserActive,
        laserPosition: laserPosition,
        zoomState: { level: 1.0, panX: 0, panY: 0 },
      } as SyncMessage);
    }
  }, [zoomedSlideSrc, slides, currentSlideIndex, isSpotlightActive, spotlightPosition, mode, isLaserActive, laserPosition]);

  const nextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
    resetZoom(); // Reset zoom when changing slides
    // Scroll speaker notes to top when in dual screen mode
    if (isDualScreen && speakerNotesRef.current) {
      speakerNotesRef.current.scrollTop = 0;
    }
  }, [slides.length, resetZoom, isDualScreen]);

  const prevSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => Math.max(prev - 1, 0));
    resetZoom(); // Reset zoom when changing slides
    // Scroll speaker notes to top when in dual screen mode
    if (isDualScreen && speakerNotesRef.current) {
      speakerNotesRef.current.scrollTop = 0;
    }
  }, [resetZoom, isDualScreen]);

  const toggleOverview = useCallback(() => {
    setMode((prev) => {
      if (prev === AppMode.PRESENTATION) {
        // Entering overview mode - set highlight to current slide
        setOverviewHighlightIndex(currentSlideIndex);
        // Scroll to current slide after entering overview
        setTimeout(() => {
          overviewSlideRefs.current[currentSlideIndex]?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest', 
            inline: 'nearest' 
          });
        }, 100);
        return AppMode.OVERVIEW;
      } else {
        return AppMode.PRESENTATION;
      }
    });
    setIsSpotlightActive(false); 
  }, [currentSlideIndex]);

  const selectSlide = (index: number) => {
    setCurrentSlideIndex(index);
    setMode(AppMode.PRESENTATION);
    resetZoom(); // Reset zoom when changing slides
    // Scroll speaker notes to top when in dual screen mode
    if (isDualScreen && speakerNotesRef.current) {
      speakerNotesRef.current.scrollTop = 0;
    }
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

  // Track mouse position for spotlight and laser pointer (shared calculation logic)
  useEffect(() => {
    if ((!isSpotlightActive && !isLaserActive) || mode !== AppMode.PRESENTATION) {
      setSpotlightPosition(null);
      setLaserPosition(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Find the image element to get its actual rendered bounds
      let container: HTMLElement | null = null;
      if (isDualScreen && presenterSlideRef.current) {
        container = presenterSlideRef.current;
      } else if (!isDualScreen && normalViewRef.current) {
        container = normalViewRef.current;
      }
      
      if (!container) {
        container = document.querySelector('.presenter-container') || document.body;
      }

      const img = container.querySelector('img[class*="object-contain"]') as HTMLImageElement;
      
      if (img && img.naturalWidth && img.naturalHeight) {
        const rect = img.getBoundingClientRect();
        
        // Calculate rendered content dimensions (accounting for object-fit: contain)
        const naturalRatio = img.naturalWidth / img.naturalHeight;
        const visibleRatio = rect.width / rect.height;
        
        let renderedWidth = rect.width;
        let renderedHeight = rect.height;
        let contentLeft = 0;
        let contentTop = 0;
        
        if (visibleRatio > naturalRatio) {
          // Wider than content -> height constrained
          renderedWidth = rect.height * naturalRatio;
          contentLeft = (rect.width - renderedWidth) / 2;
        } else {
          // Taller than content -> width constrained
          renderedHeight = rect.width / naturalRatio;
          contentTop = (rect.height - renderedHeight) / 2;
        }
        
        // Calculate position relative to the CONTENT
        const relativeX = (e.clientX - rect.left - contentLeft) / renderedWidth;
        const relativeY = (e.clientY - rect.top - contentTop) / renderedHeight;
        
        // Only update if mouse is within CONTENT bounds
        if (relativeX >= 0 && relativeX <= 1 && relativeY >= 0 && relativeY <= 1) {
          const normalizedPos = { x: relativeX, y: relativeY };
          if (isSpotlightActive) {
            setSpotlightPosition(normalizedPos);
          }
          if (isLaserActive) {
            setLaserPosition(normalizedPos);
          }
        } else {
          if (isSpotlightActive) {
            setSpotlightPosition(null);
          }
          if (isLaserActive) {
            setLaserPosition(null);
          }
        }
      } else {
        // Hide if no image found or dimensions are zero
        if (isSpotlightActive) {
          setSpotlightPosition(null);
        }
        if (isLaserActive) {
          setLaserPosition(null);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isSpotlightActive, isLaserActive, mode, isDualScreen]);

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
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            const newIndex = Math.min(overviewHighlightIndex + 1, slides.length - 1);
            setOverviewHighlightIndex(newIndex);
            // Scroll into view after state update
            setTimeout(() => {
              overviewSlideRefs.current[newIndex]?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'nearest' 
              });
            }, 0);
          } else if (mode === AppMode.PRESENTATION) {
            nextSlide();
          }
          break;
        case 'ArrowLeft':
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            const newIndex = Math.max(overviewHighlightIndex - 1, 0);
            setOverviewHighlightIndex(newIndex);
            // Scroll into view after state update
            setTimeout(() => {
              overviewSlideRefs.current[newIndex]?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'nearest' 
              });
            }, 0);
          } else if (mode === AppMode.PRESENTATION) {
            prevSlide();
          }
          break;
        case 'ArrowDown':
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            // Move down in grid (4 columns)
            const cols = 4;
            const newIndex = Math.min(overviewHighlightIndex + cols, slides.length - 1);
            setOverviewHighlightIndex(newIndex);
            // Scroll into view after state update
            setTimeout(() => {
              overviewSlideRefs.current[newIndex]?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'nearest' 
              });
            }, 0);
          }
          break;
        case 'ArrowUp':
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            // Move up in grid (4 columns)
            const cols = 4;
            const newIndex = Math.max(overviewHighlightIndex - cols, 0);
            setOverviewHighlightIndex(newIndex);
            // Scroll into view after state update
            setTimeout(() => {
              overviewSlideRefs.current[newIndex]?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'nearest' 
              });
            }, 0);
          }
          break;
        case 'Enter':
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            selectSlide(overviewHighlightIndex);
          }
          break;
        case ' ':
        case 'PageDown':
          if (mode === AppMode.PRESENTATION) nextSlide();
          break;
        case 'PageUp':
        case 'Backspace':
          if (mode === AppMode.PRESENTATION) prevSlide();
          break;
        case 'Tab':
          e.preventDefault();
          toggleOverview();
          break;
        case 's':
        case 'S':
          toggleSpotlight();
          break;
        case 'l':
        case 'L':
          toggleLaser();
          break;
        case 'd':
        case 'D':
          if (mode === AppMode.PRESENTATION) {
            toggleDualScreen();
          }
          break;
        case 'f':
        case 'F':
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
          break;
        case '1':
          if (mode === AppMode.PRESENTATION) applyZoom(0.5, true);
          break;
        case '2':
          if (mode === AppMode.PRESENTATION) applyZoom(1.0, true);
          break;
        case '3':
          if (mode === AppMode.PRESENTATION) applyZoom(1.5, true);
          break;
        case '4':
          if (mode === AppMode.PRESENTATION) applyZoom(2.0, true);
          break;
        case 'r':
        case 'R':
          if (mode === AppMode.PRESENTATION) resetZoom();
          break;
        case 'z':
        case 'Z':
          if (mode === AppMode.PRESENTATION && !isRegionSelecting) {
            setIsRegionSelecting(true);
          }
          break;
        case 'a':
        case 'A':
          if (mode === AppMode.PRESENTATION || mode === AppMode.OVERVIEW) {
            setShowAbout(true);
          }
          break;
        case 'p':
        case 'P':
          if (mode === AppMode.PRESENTATION && startTime) {
            togglePause();
          }
          break;
        case 'h':
        case 'H':
          // Pan right (only when zoomed)
          if (mode === AppMode.PRESENTATION && zoomState.level > 1.0) {
            e.preventDefault();
            const panStep = 50; // pixels per keypress
            setZoomState((prev) => {
              const newPanX = prev.panX + panStep;
              // Broadcast pan update
              if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({
                  type: 'STATE_UPDATE',
                  index: currentSlideIndex,
                  isSpotlight: isSpotlightActive,
                  spotlightPosition: spotlightPosition,
                  mode: mode,
                  isLaserActive: isLaserActive,
                  laserPosition: laserPosition,
                  zoomState: { ...prev, panX: newPanX },
                } as SyncMessage);
              }
              return { ...prev, panX: newPanX };
            });
          }
          break;
        case 'j':
        case 'J':
          // Pan up (only when zoomed)
          if (mode === AppMode.PRESENTATION && zoomState.level > 1.0) {
            e.preventDefault();
            const panStep = 50; // pixels per keypress
            setZoomState((prev) => {
              const newPanY = prev.panY - panStep;
              // Broadcast pan update
              if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({
                  type: 'STATE_UPDATE',
                  index: currentSlideIndex,
                  isSpotlight: isSpotlightActive,
                  spotlightPosition: spotlightPosition,
                  mode: mode,
                  isLaserActive: isLaserActive,
                  laserPosition: laserPosition,
                  zoomState: { ...prev, panY: newPanY },
                } as SyncMessage);
              }
              return { ...prev, panY: newPanY };
            });
          }
          break;
        case 'k':
        case 'K':
          // Pan left (only when zoomed)
          if (mode === AppMode.PRESENTATION && zoomState.level > 1.0) {
            e.preventDefault();
            const panStep = 50; // pixels per keypress
            setZoomState((prev) => {
              const newPanX = prev.panX - panStep;
              // Broadcast pan update
              if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({
                  type: 'STATE_UPDATE',
                  index: currentSlideIndex,
                  isSpotlight: isSpotlightActive,
                  spotlightPosition: spotlightPosition,
                  mode: mode,
                  isLaserActive: isLaserActive,
                  laserPosition: laserPosition,
                  zoomState: { ...prev, panX: newPanX },
                } as SyncMessage);
              }
              return { ...prev, panX: newPanX };
            });
          }
          break;
        case 'u':
        case 'U':
          // Pan down (only when zoomed)
          if (mode === AppMode.PRESENTATION && zoomState.level > 1.0) {
            e.preventDefault();
            const panStep = 50; // pixels per keypress
            setZoomState((prev) => {
              const newPanY = prev.panY + panStep;
              // Broadcast pan update
              if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({
                  type: 'STATE_UPDATE',
                  index: currentSlideIndex,
                  isSpotlight: isSpotlightActive,
                  spotlightPosition: spotlightPosition,
                  mode: mode,
                  isLaserActive: isLaserActive,
                  laserPosition: laserPosition,
                  zoomState: { ...prev, panY: newPanY },
                } as SyncMessage);
              }
              return { ...prev, panY: newPanY };
            });
          }
          break;
        case 't':
        case 'T':
          // Scroll speaker notes up (line-by-line) in dual screen mode
          if (mode === AppMode.PRESENTATION && isDualScreen && speakerNotesRef.current) {
            e.preventDefault();
            const lineHeight = speakerNotesFontSize * 1.625; // Match leading-relaxed (1.625)
            speakerNotesRef.current.scrollBy({
              top: -lineHeight,
              behavior: 'smooth'
            });
          }
          break;
        case 'g':
        case 'G':
          // Scroll speaker notes down (line-by-line) in dual screen mode
          if (mode === AppMode.PRESENTATION && isDualScreen && speakerNotesRef.current) {
            e.preventDefault();
            const lineHeight = speakerNotesFontSize * 1.625; // Match leading-relaxed (1.625)
            speakerNotesRef.current.scrollBy({
              top: lineHeight,
              behavior: 'smooth'
            });
          }
          break;
        case 'Escape':
          if (showAbout) {
            setShowAbout(false);
          } else if (mode === AppMode.OVERVIEW) {
            setMode(AppMode.PRESENTATION);
          } else if (isSpotlightActive) {
            setIsSpotlightActive(false);
          } else if (isLaserActive) {
            setIsLaserActive(false);
          } else if (isRegionSelecting) {
            setIsRegionSelecting(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, nextSlide, prevSlide, toggleOverview, toggleSpotlight, toggleLaser, toggleDualScreen, isSpotlightActive, isLaserActive, applyZoom, resetZoom, isRegionSelecting, showAbout, zoomState, currentSlideIndex, laserPosition, slides.length, overviewHighlightIndex, selectSlide, isDualScreen, startTime, togglePause]);

  // Mouse wheel zoom (Mode B) - Shift + Wheel
  useEffect(() => {
    if (mode !== AppMode.PRESENTATION || isRegionSelecting) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.5, Math.min(3.0, zoomState.level + delta));
        applyZoom(newZoom, false);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [mode, zoomState.level, applyZoom, isRegionSelecting]);

  // Right-click drag panning
  useEffect(() => {
    if (mode !== AppMode.PRESENTATION || zoomState.level <= 1.0) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) { // Right mouse button
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning && panStart) {
        const deltaX = e.clientX - panStart.x;
        const deltaY = e.clientY - panStart.y;
        
        setZoomState((prev) => ({
          ...prev,
          panX: prev.panX + deltaX,
          panY: prev.panY + deltaY,
        }));
        
        setPanStart({ x: e.clientX, y: e.clientY });
        
        // Broadcast pan update
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'STATE_UPDATE',
            index: currentSlideIndex,
            isSpotlight: isSpotlightActive,
            spotlightPosition: spotlightPosition,
            mode: mode,
            isLaserActive: isLaserActive,
            laserPosition: laserPosition,
            zoomState: {
              level: zoomState.level,
              panX: zoomState.panX + deltaX,
              panY: zoomState.panY + deltaY,
            },
          } as SyncMessage);
        }
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
      setPanStart(null);
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [mode, zoomState, isPanning, panStart, currentSlideIndex, isSpotlightActive, isLaserActive, laserPosition]);

  // Region selection with Z key (Mode C)
  useEffect(() => {
    if (!isRegionSelecting || mode !== AppMode.PRESENTATION) {
      setRegionStart(null);
      setRegionCurrent(null);
      isDraggingRef.current = false;
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && !isDraggingRef.current) { // Left mouse button
        e.preventDefault();
        e.stopPropagation();
        isDraggingRef.current = true;
        
        const container = (isDualScreen ? presenterSlideRef.current : normalViewRef.current) || document.body;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        
        const point = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
        
        regionStartRef.current = point;
        regionCurrentRef.current = point;
        setRegionStart(point);
        setRegionCurrent(point);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !regionStartRef.current) return;
      
      const container = (isDualScreen ? presenterSlideRef.current : normalViewRef.current) || document.body;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      
      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      
      regionCurrentRef.current = point;
      setRegionCurrent(point);
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!isDraggingRef.current || !regionStartRef.current || !regionCurrentRef.current) {
        isDraggingRef.current = false;
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = false;
      
      const container = (isDualScreen ? presenterSlideRef.current : normalViewRef.current) || document.body;
      if (!container) return;
      
      const img = container.querySelector('img[class*="object-contain"]') as HTMLImageElement;
      if (!img) {
        setIsRegionSelecting(false);
        setRegionStart(null);
        setRegionCurrent(null);
        return;
      }

      // We need BOTH container rect (unzoomed base) AND img rect (zoomed visual)
      const containerRect = container.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      
      // 1. Calculate region relative to the current visual image (normalized 0-1)
      const currentVisualLeft = imgRect.left - containerRect.left;
      const currentVisualTop = imgRect.top - containerRect.top;
      
      // Calculate start/end in 0-1 coords relative to the visual image
      const startX = Math.max(0, Math.min(1, (regionStartRef.current.x - currentVisualLeft) / imgRect.width));
      const startY = Math.max(0, Math.min(1, (regionStartRef.current.y - currentVisualTop) / imgRect.height));
      const endXNorm = Math.max(0, Math.min(1, (regionCurrentRef.current.x - currentVisualLeft) / imgRect.width));
      const endYNorm = Math.max(0, Math.min(1, (regionCurrentRef.current.y - currentVisualTop) / imgRect.height));
      
      const regionWidth = Math.abs(endXNorm - startX);
      const regionHeight = Math.abs(endYNorm - startY);
      
      if (regionWidth > 0.01 && regionHeight > 0.01) { // Minimum region size (1%)
        const newZoomLevel = Math.max(1.5, Math.min(3.0, 1 / Math.max(regionWidth, regionHeight)));
        
        // Calculate center of region in normalized coordinates (0-1 relative to content)
        const centerX = (startX + endXNorm) / 2;
        const centerY = (startY + endYNorm) / 2;
        
        // Apply zoom first
        await applyZoom(newZoomLevel, true);
        
        // Calculate pan to center the region using base rendered dimensions
        const naturalRatio = img.naturalWidth / img.naturalHeight;
        const visibleRatio = containerRect.width / containerRect.height;
        let baseRenderedWidth: number;
        let baseRenderedHeight: number;
        
        if (visibleRatio > naturalRatio) {
          baseRenderedHeight = containerRect.height;
          baseRenderedWidth = containerRect.height * naturalRatio;
        } else {
          baseRenderedWidth = containerRect.width;
          baseRenderedHeight = containerRect.width / naturalRatio;
        }
        
        // Pan offset = (0.5 - centerX) * baseWidth * newZoom
        const panX = (0.5 - centerX) * baseRenderedWidth * newZoomLevel;
        const panY = (0.5 - centerY) * baseRenderedHeight * newZoomLevel;
        
        // Update pan state
        setZoomState((prev) => ({
          ...prev,
          panX: panX,
          panY: panY,
        }));
        
        // Broadcast pan update
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'STATE_UPDATE',
            index: currentSlideIndex,
            isSpotlight: isSpotlightActive,
            spotlightPosition: spotlightPosition,
            mode: mode,
            isLaserActive: isLaserActive,
            laserPosition: laserPosition,
            zoomState: {
              level: newZoomLevel,
              panX: panX,
              panY: panY,
            },
          } as SyncMessage);
        }
      }
      
      setIsRegionSelecting(false);
      setRegionStart(null);
      setRegionCurrent(null);
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      isDraggingRef.current = false;
    };
  }, [isRegionSelecting, mode, isDualScreen, applyZoom, currentSlideIndex, isSpotlightActive, isLaserActive, laserPosition]);

  // --- Render Logic ---

  if (isReceiver) {
    return <ReceiverView />;
  }

  if (mode === AppMode.UPLOAD) {
    return <UploadScreen onSlidesLoaded={startPresentation} />;
  }

  // Safety check: if no slides loaded, show upload screen
  if (slides.length === 0) {
    return <UploadScreen onSlidesLoaded={startPresentation} />;
  }

  // --- Presenter View (Dual Screen Active) ---
  if (isDualScreen && mode === AppMode.PRESENTATION) {
    const nextIndex = Math.min(currentSlideIndex + 1, slides.length - 1);
    
    return (
      <div className={`w-full h-screen bg-neutral-900 text-white flex flex-col overflow-hidden ${isLaserActive ? 'cursor-none' : ''}`}>
        {/* Presenter Dashboard */}
        <div className="flex-1 flex gap-4 p-4 h-full presenter-container">
            
            {/* Main Slide (Left, Resizable) */}
            <div 
              ref={presenterSlideRef}
              className={`bg-black rounded-2xl flex items-center justify-center relative overflow-hidden border border-neutral-700 ${isLaserActive ? 'cursor-none' : ''}`}
              style={{ width: `${mainWidth}%` }}
            >
               <img 
                 src={zoomedSlideSrc && zoomedSlideRef.current === slides[currentSlideIndex].id 
                   ? zoomedSlideSrc 
                   : slides[currentSlideIndex].src} 
                 className="w-full h-full object-contain transition-transform duration-200"
                 alt={slides[currentSlideIndex].name}
                 style={{
                   transform: zoomState.level > 1.0 
                     ? `scale(${zoomState.level}) translate(${zoomState.panX / zoomState.level}px, ${zoomState.panY / zoomState.level}px)`
                     : 'none',
                   transformOrigin: 'center center',
                 }}
               />
               <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded-full text-sm font-mono text-red-400 border border-red-500/30">
                 LIVE ON PROJECTOR
               </div>
               {isRegionSelecting && (
                 <div className="absolute top-4 right-4 bg-blue-600/90 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 text-white text-sm font-medium shadow-lg border border-blue-400/30 z-50">
                   <Search className="w-4 h-4" />
                   <span>Click, drag & release to zoom</span>
                 </div>
               )}
               <LinkOverlay 
                 links={slides[currentSlideIndex].links || []} 
                 containerRef={presenterSlideRef}
                 onNavigate={selectSlide}
                 disabled={isSpotlightActive || isLaserActive}
                 zoomLevel={zoomState.level}
                 panX={zoomState.panX}
                 panY={zoomState.panY}
               />
               <RegionSelector
                 isActive={isRegionSelecting}
                 start={regionStart}
                 current={regionCurrent}
                 containerRef={presenterSlideRef}
               />
               <SpotlightLayer 
                 isActive={isSpotlightActive} 
                 position={spotlightPosition}
                 containerRef={presenterSlideRef}
                 zoomLevel={zoomState.level}
                 panX={zoomState.panX}
                 panY={zoomState.panY}
               />
               <LaserPointer 
                 isActive={isLaserActive} 
                 position={laserPosition} 
                 containerRef={presenterSlideRef} 
                 zoomLevel={zoomState.level}
                 panX={zoomState.panX}
                 panY={zoomState.panY}
               />
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
                    <div 
                      ref={speakerNotesRef}
                      className="flex-1 overflow-y-auto pr-2 relative" 
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#525252 #262626'
                      }}
                    >
                        <h2 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-3 sticky top-0 bg-neutral-800 pb-2 z-20">Speaker Notes</h2>
                        {/* Fixed Reading Guide Highlight - Stays at first line of text */}
                        {isReadingGuideEnabled && (
                            <div 
                                className="sticky left-0 right-2 pointer-events-none z-10"
                                style={{
                                    top: '32px', // Position after heading (approx heading height)
                                    height: `${speakerNotesFontSize * 1.625}px`, // Match line height
                                    backgroundColor: 'rgba(156, 163, 175, 0.15)',
                                    borderTop: '1px solid rgba(156, 163, 175, 0.3)',
                                    borderBottom: '1px solid rgba(156, 163, 175, 0.3)',
                                    marginBottom: `-${speakerNotesFontSize * 1.625}px` // Pull next content up under highlight
                                }}
                            />
                        )}
                        {slides[currentSlideIndex].notes ? (
                            <div 
                                className="text-neutral-200 whitespace-pre-wrap leading-relaxed" 
                                style={{ 
                                    fontSize: `${speakerNotesFontSize}px`,
                                    paddingBottom: isReadingGuideEnabled ? '80%' : '0' // Allow last line to scroll to highlight
                                }}
                            >
                                {slides[currentSlideIndex].notes}
                            </div>
                        ) : (
                            <p className="text-neutral-500 italic" style={{ fontSize: `${speakerNotesFontSize}px` }}>No notes available for this slide.</p>
                        )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-neutral-700 flex-shrink-0">
                        <div className="flex items-end justify-between">
                            <div className="flex-1 min-w-0">
                                <h2 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-1">Current Slide</h2>
                                <p className="text-neutral-300 truncate" style={{ fontSize: `${speakerNotesFontSize}px` }}>{slides[currentSlideIndex].name}</p>
                            </div>
                            <div className="flex items-center gap-1 ml-4">
                                <button
                                    onClick={toggleReadingGuide}
                                    className={clsx(
                                        "p-1.5 rounded-md transition-colors",
                                        isReadingGuideEnabled 
                                            ? "bg-neutral-700 text-neutral-200" 
                                            : "hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200"
                                    )}
                                    title={isReadingGuideEnabled ? "Disable reading guide" : "Enable reading guide"}
                                    aria-label={isReadingGuideEnabled ? "Disable reading guide" : "Enable reading guide"}
                                >
                                    <Eye size={16} />
                                </button>
                                <button
                                    onClick={decreaseFontSize}
                                    className="p-1.5 rounded-md hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200"
                                    title="Decrease font size"
                                    aria-label="Decrease font size"
                                >
                                    <Minus size={16} />
                                </button>
                                <button
                                    onClick={increaseFontSize}
                                    className="p-1.5 rounded-md hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200"
                                    title="Increase font size"
                                    aria-label="Increase font size"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>
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
                zoomLevel={zoomState.level}
                isPaused={isPaused}
                pausedTime={pausedTime + (pauseStartTime ? Date.now() - pauseStartTime : 0)}
                togglePause={togglePause}
                resetTimer={resetTimer}
                toggleOverview={toggleOverview}
                toggleSpotlight={toggleSpotlight}
                toggleLaser={toggleLaser}
                toggleDualScreen={toggleDualScreen}
                nextSlide={nextSlide}
                prevSlide={prevSlide}
                onAboutClick={() => setShowAbout(true)}
            />
        </div>
      </div>
    );
  }

  // --- Normal Presentation View ---
  return (
    <div ref={normalViewRef} className={`w-full h-screen bg-black text-white relative overflow-hidden normal-presentation-container ${isLaserActive ? 'cursor-none' : ''}`}>
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
            src={zoomedSlideSrc && zoomedSlideRef.current === slides[currentSlideIndex].id 
              ? zoomedSlideSrc 
              : slides[currentSlideIndex].src} 
            className="w-full h-full object-contain transition-transform duration-200"
            alt={slides[currentSlideIndex].name}
            style={{
              transform: zoomState.level > 1.0 
                ? `scale(${zoomState.level}) translate(${zoomState.panX / zoomState.level}px, ${zoomState.panY / zoomState.level}px)`
                : 'none',
              transformOrigin: 'center center',
            }}
          />
          <LinkOverlay 
            links={slides[currentSlideIndex].links || []} 
            containerRef={normalViewRef}
            onNavigate={selectSlide}
            disabled={isSpotlightActive || isLaserActive}
            zoomLevel={zoomState.level}
            panX={zoomState.panX}
            panY={zoomState.panY}
          />
          {isRegionSelecting && (
            <div className="absolute top-4 right-4 bg-blue-600/90 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 text-white text-sm font-medium shadow-lg border border-blue-400/30 z-50">
              <Search className="w-4 h-4" />
              <span>Click, drag & release to zoom</span>
            </div>
          )}
          <RegionSelector
            isActive={isRegionSelecting}
            start={regionStart}
            current={regionCurrent}
            containerRef={normalViewRef}
          />
          <SpotlightLayer 
            isActive={isSpotlightActive} 
            position={spotlightPosition}
            containerRef={normalViewRef}
            zoomLevel={zoomState.level}
            panX={zoomState.panX}
            panY={zoomState.panY}
          />
          <LaserPointer 
            isActive={isLaserActive} 
            position={laserPosition} 
            containerRef={normalViewRef} 
            zoomLevel={zoomState.level}
            panX={zoomState.panX}
            panY={zoomState.panY}
          />
        </motion.div>
      </AnimatePresence>

      <Controls
        currentSlide={currentSlideIndex}
        totalSlides={slides.length}
        mode={mode}
        isSpotlight={isSpotlightActive}
        isLaser={isLaserActive}
        startTime={startTime}
        zoomLevel={zoomState.level}
        isPaused={isPaused}
        pausedTime={pausedTime + (pauseStartTime ? Date.now() - pauseStartTime : 0)}
        togglePause={togglePause}
        resetTimer={resetTimer}
        toggleOverview={toggleOverview}
        toggleSpotlight={toggleSpotlight}
        toggleLaser={toggleLaser}
        toggleDualScreen={toggleDualScreen}
        nextSlide={nextSlide}
        prevSlide={prevSlide}
        onAboutClick={() => setShowAbout(true)}
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
                ref={(el) => {
                  overviewSlideRefs.current[index] = el;
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => selectSlide(index)}
                className={clsx(
                  "cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                  index === currentSlideIndex
                    ? "border-blue-500 ring-2 ring-blue-500/50"
                    : index === overviewHighlightIndex
                    ? "border-yellow-500 ring-2 ring-yellow-500/50 bg-yellow-500/10"
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

      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
};

export default App;