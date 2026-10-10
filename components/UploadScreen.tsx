import React, { useState, useEffect } from 'react';
import { Upload, Play, FileText, Loader2, Info, FolderOpen } from 'lucide-react';
import { SlideData, MediaFile } from '../types';
import { getEmbeddedMediaFiles, pdfToSlides } from '../utils/pdfUtils';
import { InputFile, MEDIA_ACCEPT, resolveMediaFiles } from '../utils/mediaUtils';
import AboutModal from './AboutModal';

// Media files matched to the deck's wpmedia: links, and the link paths no file was found for
export interface LoadedMedia {
  files: MediaFile[];
  missing: string[];
}

interface UploadScreenProps {
  onSlidesLoaded: (slides: SlideData[], media?: LoadedMedia) => void;
}

const isPdfName = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
const pathDepth = (path: string) => path.split('/').length;

// Folders that never hold a deck's media; skipped when walking a dropped folder
const SKIPPED_FOLDERS = new Set(['node_modules', '.git']);

// Recursively collects the files of a dropped file or folder entry (webkitGetAsEntry)
async function readDroppedEntry(entry: any, folder: string, out: InputFile[]): Promise<void> {
  if (entry.isFile) {
    const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
    out.push({ file, path: `${folder}${file.name}` });
  } else if (entry.isDirectory && !SKIPPED_FOLDERS.has(entry.name)) {
    const reader = entry.createReader();
    // readEntries returns the folder in batches; an empty batch means done
    for (;;) {
      const batch: any[] = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      for (const child of batch) await readDroppedEntry(child, `${folder}${entry.name}/`, out);
    }
  }
}

const UploadScreen: React.FC<UploadScreenProps> = ({ onSlidesLoaded }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showAbout, setShowAbout] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // Several candidate PDFs in a picked/dropped folder: the user chooses which one is the deck
  const [pdfChoice, setPdfChoice] = useState<{ pdfs: InputFile[]; files: InputFile[] } | null>(null);
  const clustrmapsRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);

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


  // Renders the PDF and matches the deck's media links to the files supplied with it
  const processDeck = async (pdf: InputFile, files: InputFile[]) => {
    setPdfChoice(null);
    setIsProcessing(true);
    setProcessingStatus('Processing PDF...');
    setProgress({ current: 0, total: 0 });

    try {
      const slides = await pdfToSlides(
        pdf.file, 
        pdf.file.name.replace(/\.pdf$/i, ''),
        (current, total) => {
          setProgress({ current, total });
          setProcessingStatus(`Processing page ${current} of ${total}...`);
        }
      );
      if (slides.length === 0) {
        throw new Error('PDF appears to be empty or could not be processed');
      }
      // Media embedded in the PDF itself plays without any files being chosen
      const embedded = await getEmbeddedMediaFiles();
      const { resolved, missing } = resolveMediaFiles(slides, [...files, ...embedded], pdf.path);
      setProcessingStatus(`Loaded ${slides.length} slides`);
      onSlidesLoaded(slides, { files: resolved, missing });
    } catch (error) {
      console.error('Error processing PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error processing PDF: ${errorMessage}\n\nPlease make sure it is a valid PDF file and check the browser console for details.`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      setProgress({ current: 0, total: 0 });
    }
  };

  // Accepts a PDF on its own, a PDF with its GIF/video files, or a whole Beamer project folder
  const loadFiles = (files: InputFile[]) => {
    let pdfs = files.filter((f) => isPdfName(f.file));
    // Some browsers do not set a MIME type; a lone untyped file is assumed to be the PDF
    if (pdfs.length === 0 && files.length === 1 && files[0].file.type === '') pdfs = files;
    if (pdfs.length === 0) {
      alert('Please upload a PDF file (Beamer presentation)');
      return;
    }
    // In a project folder, figures/ holds PDFs too; the deck is among the shallowest ones
    const minDepth = Math.min(...pdfs.map((f) => pathDepth(f.path)));
    const decks = pdfs
      .filter((f) => pathDepth(f.path) === minDepth)
      .sort((a, b) => a.path.localeCompare(b.path));
    if (decks.length === 1) {
      processDeck(decks[0], files);
    } else {
      setPdfChoice({ pdfs: decks, files });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files as FileList).map((file) => ({
        file,
        path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      }));
      loadFiles(files);
    }
    // Reset file input to allow re-uploading the same file
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    // Entries must be taken synchronously; the DataTransfer is emptied after the first await
    const entries = Array.from(e.dataTransfer.items as DataTransferItemList)
      .map((item) => (item.kind === 'file' ? (item as any).webkitGetAsEntry?.() : null))
      .filter(Boolean);
    const plainFiles = Array.from(e.dataTransfer.files as FileList);
    let files: InputFile[];
    if (entries.length > 0) {
      files = [];
      for (const entry of entries) {
        // A dropped file (not folder) is taken from the DataTransfer itself: in the desktop app that
        // File keeps its disk path, which is needed to find media next to the PDF
        const plain = entry.isFile ? plainFiles.find((f) => f.name === entry.name) : undefined;
        if (plain) files.push({ file: plain, path: plain.name });
        else await readDroppedEntry(entry, '', files);
      }
    } else {
      files = plainFiles.map((file) => ({ file, path: file.name }));
    }
    if (files.length > 0) loadFiles(files);
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
      
      // The demo deck carries its animations as attachments
      const embedded = await getEmbeddedMediaFiles();
      const { resolved, missing } = resolveMediaFiles(slides, embedded, file.name);
      setProcessingStatus(`Loaded ${slides.length} slides`);
      onSlidesLoaded(slides, { files: resolved, missing });
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
          {/* Upload Card: a PDF, a PDF with its GIFs/videos, or a dropped project folder */}
          <div
            onClick={() => !isProcessing && !pdfChoice && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isProcessing) setIsDragging(true);
            }}
            onDragLeave={(e) => {
              // Ignore leaving into a child element
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
            }}
            onDrop={handleDrop}
            className={`group relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl hover:border-blue-500 hover:bg-neutral-800/50 transition-all cursor-pointer ${
              isDragging ? 'border-blue-500 bg-neutral-800/50' : 'border-neutral-700'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={`.pdf,application/pdf,${MEDIA_ACCEPT}`}
              multiple
              className="hidden"
              onChange={handleFileChange}
              onClick={(e) => e.stopPropagation()} // The programmatic click must not bubble back to the card
              disabled={isProcessing}
            />
            <input
              ref={(el) => {
                folderInputRef.current = el;
                el?.setAttribute('webkitdirectory', '');
              }}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              onClick={(e) => e.stopPropagation()} // The programmatic click must not bubble back to the card
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
            {!isProcessing && !pdfChoice && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  folderInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-blue-300 transition-colors"
                title="Pick the folder with the PDF and its GIFs/videos to play animations"
              >
                <FolderOpen className="w-4 h-4" />
                <span className="underline">Open folder with animations</span>
              </button>
            )}
            {pdfChoice && (
              <div className="w-full space-y-2" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs text-neutral-400">Several PDFs found. Which one is the deck?</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {pdfChoice.pdfs.map((pdf) => (
                    <button
                      key={pdf.path}
                      type="button"
                      onClick={() => processDeck(pdf, pdfChoice.files)}
                      className="w-full text-left text-sm px-3 py-1.5 rounded bg-neutral-800 hover:bg-blue-500/20 border border-neutral-700 hover:border-blue-500 truncate"
                      title={pdf.path}
                    >
                      {pdf.file.name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPdfChoice(null)}
                  className="text-xs text-neutral-500 hover:text-neutral-300 underline"
                >
                  Cancel
                </button>
              </div>
            )}
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
          </div>

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
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(4,auto)] justify-center gap-x-8 gap-y-3 text-sm text-neutral-500">
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
              <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">N</span>
              <span>Annotate</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">M</span>
              <span>Animations</span>
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
              className="relative flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
              title="About (A)"
            >
              {/* The icon hangs left of the key, so the A key lines up with the keys above it */}
              <Info className="absolute -left-6 top-1/2 -translate-y-1/2 w-4 h-4" />
              <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">A</span>
              <span>About</span>
            </button>
          </div>

          {/* Standalone Version */}
          <div className="flex justify-center items-center gap-4 text-sm relative z-50">
            <span className="text-neutral-500">Standalone version:</span>
            <a
              href="https://github.com/WebPressive/webpressive.github.io/releases/tag/v0.1.7"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors font-semibold underline cursor-pointer relative z-50"
            >
              v0.1.7
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