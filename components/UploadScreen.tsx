import React, { useState } from 'react';
import { Upload, Play, FileText, Loader2 } from 'lucide-react';
import { SlideData } from '../types';
import { DEMO_SLIDES } from '../constants';
import { pdfToSlides } from '../utils/pdfUtils';

interface UploadScreenProps {
  onSlidesLoaded: (slides: SlideData[]) => void;
}

const UploadScreen: React.FC<UploadScreenProps> = ({ onSlidesLoaded }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

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

      try {
        const slides = await pdfToSlides(file, file.name.replace(/\.pdf$/i, ''));
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
        // Reset file input to allow re-uploading the same file
        e.target.value = '';
      }
    }
  };

  const loadDemo = () => {
    onSlidesLoaded(DEMO_SLIDES);
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-8 relative">
      <div className="max-w-2xl w-full text-center space-y-12">
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
            <p className="text-sm text-neutral-500 text-center">
              {isProcessing ? (
                processingStatus
              ) : (
                <>
                  Select a Beamer PDF presentation.<br />Each page will become a slide.
                </>
              )}
            </p>
          </label>

          {/* Demo Card */}
          <button
            onClick={loadDemo}
            className="group relative flex flex-col items-center justify-center p-12 border-2 border-neutral-700 rounded-2xl hover:border-purple-500 hover:bg-neutral-800/50 transition-all"
          >
            <div className="mb-4 p-4 bg-neutral-800 rounded-full group-hover:bg-purple-500/20 transition-colors">
              <Play className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Start Demo</h3>
            <p className="text-sm text-neutral-500 text-center">
              Load a sample deck to try out<br />transitions and spotlight effects.
            </p>
          </button>
        </div>

        <div className="flex justify-center space-x-8 text-sm text-neutral-500">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">TAB</span>
            <span>Overview</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">Z</span>
            <span>Spotlight</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">L</span>
            <span>Laser Pointer</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">F</span>
            <span>Fullscreen</span>
          </div>
        </div>
      </div>

      {/* Footer - positioned at bottom */}
      <div className="absolute bottom-8 left-0 right-0 text-center space-y-2">
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
          <span>Copyright (c) </span>
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
  );
};

export default UploadScreen;