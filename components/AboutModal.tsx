import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-neutral-900 rounded-2xl border border-neutral-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-neutral-700">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                  About WebPressive
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                  title="Close (A or Escape)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Description */}
                <div>
                  <h3 className="text-lg font-semibold mb-2">What is WebPressive?</h3>
                  <p className="text-neutral-300">
                    WebPressive is a dual-screen presenter for LaTeX Beamer PDFs. It provides a modern, 
                    web-based alternative to traditional presentation software, with features like synchronized 
                    dual-screen mode, zoom, spotlight, and laser pointer functionality.
                  </p>
                </div>

                {/* Keyboard Shortcuts */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Keyboard Shortcuts</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-blue-400 mb-2">Navigation</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">←</kbd>
                          <span>Previous slide</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">→</kbd>
                          <span>Next slide</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">Space</kbd>
                          <span>Next slide</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">Page Up</kbd>
                          <span>Previous slide</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">Page Down</kbd>
                          <span>Next slide</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">Backspace</kbd>
                          <span>Previous slide</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-blue-400 mb-2">Presentation Modes</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">TAB</kbd>
                          <span>Toggle overview mode</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">S</kbd>
                          <span>Toggle spotlight</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">L</kbd>
                          <span>Toggle laser pointer</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">D</kbd>
                          <span>Toggle dual-screen mode</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">F</kbd>
                          <span>Toggle fullscreen</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">A</kbd>
                          <span>Show this about dialog (works in dual-screen mode)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">P</kbd>
                          <span>Pause/Resume timer</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">Escape</kbd>
                          <span>Exit current mode</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-blue-400 mb-2">Speaker Notes (Dual-Screen Mode)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">T</kbd>
                          <span>Scroll notes up (line-by-line)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">G</kbd>
                          <span>Scroll notes down (line-by-line)</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-blue-400 mb-2">Zoom Controls</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">1</kbd>
                          <span>Zoom to 50%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">2</kbd>
                          <span>Zoom to 100%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">3</kbd>
                          <span>Zoom to 150%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">4</kbd>
                          <span>Zoom to 200%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">R</kbd>
                          <span>Reset zoom</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">Z</kbd>
                          <span>Region zoom mode</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">Shift + Wheel</kbd>
                          <span>Continuous zoom</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">Right-Click + Drag</kbd>
                          <span>Pan when zoomed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">H</kbd>
                          <span>Pan left (when zoomed)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">J</kbd>
                          <span>Pan down (when zoomed)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">K</kbd>
                          <span>Pan right (when zoomed)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs">U</kbd>
                          <span>Pan up (when zoomed)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Usage Instructions */}
                <div>
                  <h3 className="text-lg font-semibold mb-2">How to Use</h3>
                  <ol className="list-decimal list-inside space-y-2 text-neutral-300 text-sm">
                    <li>Upload a Beamer PDF or click "Start Demo" to load a sample presentation</li>
                    <li>Use arrow keys or space to navigate between slides</li>
                    <li>Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">D</kbd> to toggle dual-screen mode for projector displays</li>
                    <li>Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">Z</kbd> then click and drag to zoom into a specific region</li>
                    <li>When zoomed, use <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">H</kbd>, <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">J</kbd>, <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">K</kbd>, <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">U</kbd> to pan, or right-click and drag</li>
                    <li>Use <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">S</kbd> for spotlight or <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">L</kbd> for laser pointer</li>
                    <li>Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">P</kbd> to pause/resume the presentation timer during preparation</li>
                    <li>In dual-screen mode, use <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">T</kbd> and <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">G</kbd> to scroll speaker notes line-by-line</li>
                    <li>Click embedded links in the PDF to navigate or open external URLs</li>
                    <li>Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">TAB</kbd> to see all slides in overview mode</li>
                    <li>Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-xs">A</kbd> to show this about dialog (works in dual-screen mode)</li>
                  </ol>
                </div>

                {/* Features */}
                <div>
                  <h3 className="text-lg font-semibold mb-2">Key Features</h3>
                  <ul className="list-disc list-inside space-y-1 text-neutral-300 text-sm">
                    <li>Synchronized dual-screen mode for presenter and projector</li>
                    <li>Automatic extraction of speaker notes from Beamer PDFs</li>
                    <li>Multiple zoom modes: fixed levels, continuous, and region selection</li>
                    <li>Pan support when zoomed in</li>
                    <li>Spotlight and laser pointer tools</li>
                    <li>Embedded PDF links are preserved and clickable</li>
                    <li>Resizable panels in presenter view</li>
                    <li>Real-time progress tracking during PDF loading</li>
                  </ul>
                </div>

                {/* Demo Presentation */}
                <div>
                  <h3 className="text-lg font-semibold mb-2">Demo Presentation</h3>
                  <p className="text-neutral-300 text-sm mb-2">
                    The demo presentation is provided by the <a 
                      href="https://github.com/bankh/hrg-beamer-template" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 transition-colors font-semibold"
                    >HRG Beamer Template</a>, 
                    which demonstrates speaker notes embedded in PDF metadata.
                  </p>
                  <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700">
                    <p className="text-sm text-neutral-300 mb-2">
                      <strong className="text-blue-400">Original Repository:</strong>
                    </p>
                    <a 
                      href="https://github.com/danielrherber/hrg-beamer-template" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 transition-colors text-sm break-all"
                    >
                      https://github.com/danielrherber/hrg-beamer-template
                    </a>
                    <p className="text-xs text-neutral-400 mt-2">
                      The template is included as a Git submodule in this repository at <code className="px-1 py-0.5 bg-neutral-900 rounded text-xs">public/hrg-beamer-template/</code>. 
                      The submodule version includes comprehensive speaker notes showing how to structure and embed notes in LaTeX Beamer presentations. 
                      View the LaTeX source code and <code className="px-1 py-0.5 bg-neutral-900 rounded text-xs">slides.pdf</code> in the submodule directory.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer with Copyright */}
              <div className="p-6 border-t border-neutral-700 bg-neutral-800/50">
                <div className="text-center space-y-2">
                  <div className="text-sm text-neutral-400">
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
                  <div className="text-xs text-neutral-500">
                    Educational use only. See LICENSE for details.
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AboutModal;

