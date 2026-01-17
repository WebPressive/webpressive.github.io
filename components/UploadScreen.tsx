import React, { useState, useEffect } from 'react';
import { Upload, Play, FileText, Loader2, Info } from 'lucide-react';
import { SlideData } from '../types';
import { pdfToSlides } from '../utils/pdfUtils';
import AboutModal from './AboutModal';

interface UploadScreenProps {
  onSlidesLoaded: (slides: SlideData[]) => void;
}

const UploadScreen: React.FC<UploadScreenProps> = ({ onSlidesLoaded }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showAbout, setShowAbout] = useState(false);
  const clustrmapsRef = React.useRef<HTMLDivElement>(null);

  // Load ClustrMaps globe
  useEffect(() => {
    if (!clustrmapsRef.current) return;

    const script = document.createElement('script');
    script.id = 'clstr_globe';
    script.type = 'text/javascript';
    script.src = 'https://clustrmaps.com/globe.js?d=lh_pbpBsSJdTCWJ6nm60pxdicJ1dPW0e6qPJ_hDl45M';
    script.async = true;

    clustrmapsRef.current.appendChild(script);

    return () => {
      const existing = document.getElementById('clstr_globe');
      if (existing) existing.remove();
    };
  }, []);

  // Keyboard shortcut for About (A key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A') {
        setShowAbout(true);
      }
      if (e.key === 'Escape' && showAbout) {
        setShowAbout(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAbout]);


  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Check file type - some browsers may not set MIME type correctly
      const isPDF = file.type === 'application/pdf' || 
                    file.name.toLowerCase().endsWith('.pdf') ||
                    file.type === '';
      
      if (!isPDF) {
        alert('Please upload a PDF file (Beamer presentation)');
        return;
      }

      setIsProcessing(true);
      setProcessingStatus('Processing PDF...');
      setProgress({ current: 0, total: 0 });

      try {
        const slides = await pdfToSlides(
          file, 
          file.name.replace(/\.pdf$/i, ''),
          (current, total) => {
            setProgress({ current, total });
            setProcessingStatus(`Processing page ${current} of ${total}...`);
          }
        );
        if (slides.length === 0) {
          throw new Error('PDF appears to be empty or could not be processed');
        }
        setProcessingStatus(`Loaded ${slides.length} slides`);
        onSlidesLoaded(slides);
      } catch (error) {
        console.error('Error processing PDF:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        alert(`Error processing PDF: ${errorMessage}\n\nPlease make sure it is a valid PDF file and check the browser console for details.`);
      } finally {
        setIsProcessing(false);
        setProcessingStatus('');
        setProgress({ current: 0, total: 0 });
        // Reset file input to allow re-uploading the same file
        e.target.value = '';
      }
    }
  };

  const loadDemo = async () => {
    setIsProcessing(true);
    setProcessingStatus('Loading demo PDF...');
    setProgress({ current: 0, total: 0 });

    try {
      // Fetch the demo PDF file from HRG Beamer Template submodule
      const response = await fetch('/hrg-beamer-template/slides.pdf');
      if (!response.ok) {
        throw new Error('Failed to load demo PDF');
      }
      
      const blob = await response.blob();
      const file = new File([blob], 'demo.pdf', { type: 'application/pdf' });
      
      setProcessingStatus('Processing demo PDF...');
      const slides = await pdfToSlides(
        file, 
        'Demo Presentation',
        (current, total) => {
          setProgress({ current, total });
          setProcessingStatus(`Processing page ${current} of ${total}...`);
        }
      );
      
      if (slides.length === 0) {
        throw new Error('Demo PDF appears to be empty or could not be processed');
      }
      
      setProcessingStatus(`Loaded ${slides.length} slides`);
      onSlidesLoaded(slides);
    } catch (error) {
      console.error('Error loading demo PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error loading demo PDF: ${errorMessage}\n\nPlease check that the demo PDF file exists.`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center p-8 relative">
      <div className="max-w-2xl w-full text-center space-y-12 relative z-10 flex flex-col items-center pt-2">
        <div className="space-y-4">
          <h1 className="text-6xl font-black tracking-tighter bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            WebPressive
          </h1>
          <p className="text-xl text-neutral-400">
            A dual-screen presenter for LaTeX Beamer PDFs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upload Card */}
          <label className="group relative flex flex-col items-center justify-center p-12 border-2 border-dashed border-neutral-700 rounded-2xl hover:border-blue-500 hover:bg-neutral-800/50 transition-all cursor-pointer">
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
            <div className="mb-4 p-4 bg-neutral-800 rounded-full group-hover:bg-blue-500/20 transition-colors">
              {isProcessing ? (
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              ) : (
                <FileText className="w-8 h-8 text-blue-400" />
              )}
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {isProcessing ? 'Processing PDF...' : 'Upload Beamer PDF'}
            </h3>
            <p className="text-sm text-neutral-500 text-center mb-3">
              {isProcessing ? (
                processingStatus
              ) : (
                <>
                  Select a Beamer PDF presentation.<br />Each page will become a slide.
                </>
              )}
            </p>
            {isProcessing && progress.total > 0 && (
              <div className="w-full max-w-xs mx-auto">
                <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-neutral-400 mt-2 text-center">
                  {Math.round((progress.current / progress.total) * 100)}%
                </p>
              </div>
            )}
          </label>

          {/* Demo Card */}
          <button
            onClick={loadDemo}
            disabled={isProcessing}
            className="group relative flex flex-col items-center justify-center p-12 border-2 border-neutral-700 rounded-2xl hover:border-purple-500 hover:bg-neutral-800/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="mb-4 p-4 bg-neutral-800 rounded-full group-hover:bg-purple-500/20 transition-colors">
              {isProcessing ? (
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
              ) : (
                <Play className="w-8 h-8 text-purple-400" />
              )}
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {isProcessing ? 'Loading Demo...' : 'Start Demo'}
            </h3>
            <p className="text-sm text-neutral-500 text-center mb-3">
              {isProcessing ? (
                processingStatus
              ) : (
                <>
                  Load a sample Beamer PDF to try out transitions, spotlight, and laser pointer.
                </>
              )}
            </p>
            {isProcessing && progress.total > 0 && (
              <div className="w-full max-w-xs mx-auto">
                <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-purple-500 h-full transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-neutral-400 mt-2 text-center">
                  {Math.round((progress.current / progress.total) * 100)}%
                </p>
              </div>
            )}
          </button>
        </div>

        <div className="space-y-4 -mt-16">
          {/* Keyboard Shortcuts */}
          <div className="flex justify-center space-x-8 text-sm text-neutral-500">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">TAB</span>
              <span>Overview</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">S</span>
              <span>Spotlight</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">L</span>
              <span>Laser Pointer</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">D</span>
              <span>Dual Screen</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">F</span>
              <span>Fullscreen</span>
            </div>
            <button
              onClick={() => setShowAbout(true)}
              className="flex items-center space-x-2 text-blue-400 hover:text-blue-300 transition-colors"
              title="About (A)"
            >
              <Info className="w-4 h-4" />
              <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">A</span>
              <span>About</span>
            </button>
          </div>

          {/* Standalone Version */}
          <div className="flex justify-center items-center gap-4 text-sm relative z-50">
            <span className="text-neutral-500">Standalone version:</span>
            <a
              href="https://github.com/WebPressive/webpressive/releases/tag/0.1.0"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors font-semibold underline cursor-pointer relative z-50"
            >
              v0.1.0
            </a>
          </div>

          {/* ClustrMaps Globe - squeezed small */}
          <div className="flex justify-center items-center w-full mt-2 mb-2">
            <div
              ref={clustrmapsRef}
              style={{
                width: '100px',
                height: '60px',
                transform: 'scale(0.4)',
                transformOrigin: 'center center'
              }}
            />
          </div>

        </div>
      </div>

      {/* Footer - positioned at bottom */}
      <div className="absolute bottom-8 left-0 right-0 text-center z-20">
        <div className="space-y-4">
          <div className="text-sm text-neutral-600">
            <span>Inspired by </span>
            <a 
              href="https://impressive.sourceforge.net/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors underline"
            >
              Impressive
            </a>
          </div>
          <div className="text-sm text-neutral-600">
            <span>Copyright (c) 2026 </span>
            <a 
              href="https://hsbank.info" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Sinan Bank
            </a>
          </div>
        </div>
      </div>

      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
};

export default UploadScreen;