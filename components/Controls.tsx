import React, { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, Grid, ChevronUp, Sun, ChevronLeft, ChevronRight, Clock, Monitor, MousePointer2, PenLine, Info, Pause, Play, Video, Circle, Captions } from 'lucide-react';
import { clsx } from 'clsx';
import { AppMode } from '../types';

interface ControlsProps {
  currentSlide: number;
  totalSlides: number;
  mode: AppMode;
  isSpotlight: boolean;
  isLaser?: boolean;
  startTime: number | null;
  zoomLevel?: number;
  isPaused?: boolean;
  pausedTime?: number;
  togglePause?: () => void;
  resetTimer?: () => void;
  toggleOverview: () => void;
  toggleSpotlight: () => void;
  toggleLaser?: () => void;
  isAnnotating?: boolean;
  toggleAnnotate?: () => void;
  isCameraOn?: boolean;
  onCameraClick?: () => void; // Opens the camera settings
  isRecording?: boolean;
  onRecordClick?: () => void; // Opens the recording panel
  isTranscriptOn?: boolean;
  onTranscriptClick?: () => void; // Turns the live transcript on/off
  toggleDualScreen?: () => void;
  nextSlide: () => void;
  prevSlide: () => void;
  onAboutClick?: () => void;
  isReceiver?: boolean; // If true, hide interactive controls except fullscreen
  // 'pointer': any pointer move shows the menu. 'edge' (presenter view): hidden until called by the
  // bottom edge, the tab there, or `openRequest`; then it slides up over the content.
  reveal?: 'pointer' | 'edge';
  openRequest?: number; // Bumped (O key) to show the menu, or hide it when shown
}

const HIDE_DELAY = 3000; // ms after the pointer leaves (or stops moving, with 'pointer')
const EDGE_ZONE = 24; // px from the window's bottom edge that call the menu

const Controls: React.FC<ControlsProps> = ({
  currentSlide,
  totalSlides,
  mode,
  isSpotlight,
  isLaser = false,
  startTime,
  zoomLevel = 1.0,
  isPaused = false,
  pausedTime = 0,
  togglePause,
  resetTimer,
  toggleOverview,
  toggleSpotlight,
  toggleLaser,
  isAnnotating = false,
  toggleAnnotate,
  isCameraOn = false,
  onCameraClick,
  isRecording = false,
  onRecordClick,
  isTranscriptOn = false,
  onTranscriptClick,
  toggleDualScreen,
  nextSlide,
  prevSlide,
  onAboutClick,
  isReceiver = false,
  reveal = 'pointer',
  openRequest = 0
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const [isShown, setIsShown] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isOverMenuRef = useRef(false);

  // Shows the menu, hiding it again after a while (unless the pointer is on it)
  const show = (delay = HIDE_DELAY) => {
    setIsShown(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => !isOverMenuRef.current && setIsShown(false), delay);
  };

  // Auto-hide controls logic
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (reveal === 'pointer' || isOverMenuRef.current || e.clientY >= window.innerHeight - EDGE_ZONE) show();
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  // O: show the menu (a little longer, as the pointer may be elsewhere), or hide it
  useEffect(() => {
    if (!openRequest) return;
    if (isShown) {
      clearTimeout(hideTimerRef.current);
      isOverMenuRef.current = false;
      setIsShown(false);
    } else {
      show(5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  // Timer logic (accounts for paused time)
  useEffect(() => {
    if (!startTime) return;
    
    // If paused, show the last calculated time without updating
    if (isPaused) {
      const diff = Math.floor((Date.now() - startTime - pausedTime) / 1000);
      const m = Math.floor(diff / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${m}:${s}`);
      return;
    }
    
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime - pausedTime) / 1000);
      const m = Math.floor(diff / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, isPaused, pausedTime]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const progress = ((currentSlide + 1) / totalSlides) * 100;

  if (isReceiver) return null; // Receiver window has no controls

  return (
    <>
      {/* Progress Bar - Always visible but subtle */}
      <div className="fixed bottom-0 left-0 w-full h-1 bg-neutral-800 z-40">
        <div 
          className="h-full bg-blue-500 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Presenter view: the tab that calls the menu, at the bottom edge */}
      {reveal === 'edge' && (
        <button
          data-menu-tab
          onClick={() => show()}
          className={clsx(
            "fixed bottom-1 left-1/2 -translate-x-1/2 z-40 w-12 h-3 flex items-center justify-center rounded-t-md",
            "bg-neutral-700/80 hover:bg-blue-600 text-neutral-300 transition-opacity duration-300",
            isShown || mode === AppMode.OVERVIEW ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
          title="Menu (O)"
          aria-label="Show the menu"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
      )}

      {/* Floating Controls */}
      <div 
        data-controls={isShown || mode === AppMode.OVERVIEW ? 'shown' : 'hidden'}
        onMouseEnter={() => {
          isOverMenuRef.current = true;
          clearTimeout(hideTimerRef.current);
        }}
        onMouseLeave={() => {
          isOverMenuRef.current = false;
          show();
        }}
        className={clsx(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2",
          "bg-neutral-900/90 backdrop-blur-md border border-white/10 p-2 rounded-2xl shadow-2xl transition-all duration-300",
          mode === AppMode.OVERVIEW || isShown
            ? "opacity-100 translate-y-0"
            : clsx("opacity-0 pointer-events-none", reveal === 'edge' && "translate-y-[calc(100%+1.5rem)]")
        )}
      >
        <button onClick={prevSlide} className="p-2 hover:bg-white/10 rounded-xl transition-colors" title="Previous (Left Arrow)">
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        <span className="text-sm font-mono text-neutral-400 w-16 text-center">
          {currentSlide + 1} / {totalSlides}
        </span>

        <button onClick={nextSlide} className="p-2 hover:bg-white/10 rounded-xl transition-colors" title="Next (Space/Right Arrow)">
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="w-px h-6 bg-white/10 mx-2" />

        <button 
          onClick={toggleOverview} 
          className={clsx("p-2 rounded-xl transition-colors", mode === AppMode.OVERVIEW ? "bg-blue-600 text-white" : "hover:bg-white/10")}
          title="Overview (TAB)"
        >
          <Grid className="w-5 h-5" />
        </button>

        <button 
          onClick={toggleSpotlight} 
          className={clsx("p-2 rounded-xl transition-colors", isSpotlight ? "bg-yellow-600 text-white" : "hover:bg-white/10")}
          title="Spotlight (S)"
        >
          <Sun className="w-5 h-5" />
        </button>

        {toggleLaser && (
          <button 
            onClick={toggleLaser} 
            className={clsx("p-2 rounded-xl transition-colors", isLaser ? "bg-red-600 text-white" : "hover:bg-white/10")}
            title="Laser Pointer (L)"
          >
            <MousePointer2 className="w-5 h-5" />
          </button>
        )}

        {toggleAnnotate && (
          <button
            onClick={toggleAnnotate}
            className={clsx("p-2 rounded-xl transition-colors", isAnnotating ? "bg-blue-600 text-white" : "hover:bg-white/10")}
            title="Annotate (N)"
          >
            <PenLine className="w-5 h-5" />
          </button>
        )}

        {onCameraClick && (
          <button
            onClick={onCameraClick}
            className={clsx("p-2 rounded-xl transition-colors", isCameraOn ? "bg-blue-600 text-white" : "hover:bg-white/10")}
            title="Camera (V shows/hides it)"
            aria-label="Camera settings"
          >
            <Video className="w-5 h-5" />
          </button>
        )}

        {onRecordClick && (
          <button
            onClick={onRecordClick}
            className={clsx("p-2 rounded-xl transition-colors", isRecording ? "bg-red-600 text-white" : "hover:bg-white/10")}
            title="Record the talk"
            aria-label="Recording"
          >
            <Circle className={clsx("w-5 h-5", isRecording ? "fill-current animate-pulse" : "text-red-500")} />
          </button>
        )}

        {onTranscriptClick && (
          <button
            onClick={onTranscriptClick}
            className={clsx("p-2 rounded-xl transition-colors", isTranscriptOn ? "bg-blue-600 text-white" : "hover:bg-white/10")}
            title={isTranscriptOn ? "Transcript on (W turns it off)" : "Live transcript (W)"}
            aria-label="Live transcript"
            aria-pressed={isTranscriptOn}
          >
            <Captions className="w-5 h-5" />
          </button>
        )}

        {toggleDualScreen && (
          <button 
            onClick={toggleDualScreen} 
            className="p-2 hover:bg-white/10 rounded-xl transition-colors" 
            title="Dual Screen Mode"
          >
            <Monitor className="w-5 h-5" />
          </button>
        )}

        <button onClick={toggleFullscreen} className="p-2 hover:bg-white/10 rounded-xl transition-colors" title="Fullscreen (F)">
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>

        {onAboutClick && (
          <button 
            onClick={onAboutClick} 
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            title="About (A)"
          >
            <Info className="w-5 h-5" />
          </button>
        )}

        {togglePause && startTime && (
          <button 
            onClick={togglePause} 
            className={clsx("p-2 rounded-xl transition-colors", isPaused ? "bg-yellow-600 text-white" : "hover:bg-white/10")}
            title={isPaused ? "Resume (P)" : "Pause (P)"}
          >
            {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
          </button>
        )}

        <div className="w-px h-6 bg-white/10 mx-2" />

        {zoomLevel !== 1.0 && (
          <>
            <div className="text-sm font-mono text-neutral-400 px-2">
              {Math.round(zoomLevel * 100)}%
            </div>
            <div className="w-px h-6 bg-white/10 mx-2" />
          </>
        )}

        {resetTimer && startTime ? (
          <button
            onClick={resetTimer}
            className="flex items-center space-x-2 px-2 hover:bg-white/10 rounded-xl transition-colors"
            title="Reset Timer (Click clock)"
          >
            <Clock className="w-4 h-4 text-neutral-500" />
            <span className="text-sm font-mono text-neutral-300">{elapsed}</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2 px-2">
            <Clock className="w-4 h-4 text-neutral-500" />
            <span className="text-sm font-mono text-neutral-300">{elapsed}</span>
          </div>
        )}
      </div>
    </>
  );
};

export default Controls;