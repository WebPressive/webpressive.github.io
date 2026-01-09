import React, { useEffect, useState } from 'react';
import { Maximize, Minimize, Grid, Sun, ChevronLeft, ChevronRight, Clock, Monitor, MousePointer2, Info } from 'lucide-react';
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
  toggleOverview: () => void;
  toggleSpotlight: () => void;
  toggleLaser?: () => void;
  toggleDualScreen?: () => void;
  nextSlide: () => void;
  prevSlide: () => void;
  onAboutClick?: () => void;
  isReceiver?: boolean; // If true, hide interactive controls except fullscreen
}

const Controls: React.FC<ControlsProps> = ({
  currentSlide,
  totalSlides,
  mode,
  isSpotlight,
  isLaser = false,
  startTime,
  zoomLevel = 1.0,
  toggleOverview,
  toggleSpotlight,
  toggleLaser,
  toggleDualScreen,
  nextSlide,
  prevSlide,
  onAboutClick,
  isReceiver = false
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const [opacity, setOpacity] = useState(0);

  // Auto-hide controls logic
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const show = () => {
      setOpacity(1);
      clearTimeout(timeout);
      timeout = setTimeout(() => setOpacity(0), 3000);
    };

    window.addEventListener('mousemove', show);
    return () => {
      window.removeEventListener('mousemove', show);
      clearTimeout(timeout);
    };
  }, []);

  // Timer logic
  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const m = Math.floor(diff / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

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

      {/* Floating Controls */}
      <div 
        className={clsx(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2",
          "bg-neutral-900/90 backdrop-blur-md border border-white/10 p-2 rounded-2xl shadow-2xl transition-opacity duration-300",
          mode === AppMode.OVERVIEW ? "opacity-100" : (opacity === 0 ? "opacity-0 pointer-events-none" : "opacity-100")
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

        <div className="w-px h-6 bg-white/10 mx-2" />

        {zoomLevel !== 1.0 && (
          <>
            <div className="text-sm font-mono text-neutral-400 px-2">
              {Math.round(zoomLevel * 100)}%
            </div>
            <div className="w-px h-6 bg-white/10 mx-2" />
          </>
        )}

        <div className="flex items-center space-x-2 px-2">
            <Clock className="w-4 h-4 text-neutral-500" />
            <span className="text-sm font-mono text-neutral-300">{elapsed}</span>
        </div>
      </div>
    </>
  );
};

export default Controls;