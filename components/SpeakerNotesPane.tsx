import React from 'react';
import { Eye, GripHorizontal, Minus, Plus } from 'lucide-react';
import { clsx } from 'clsx';

interface SpeakerNotesPaneProps {
  notes?: string;
  slideName: string;
  fontSize: number;
  isReadingGuideEnabled: boolean;
  onToggleReadingGuide: () => void;
  onDecreaseFontSize: () => void;
  onIncreaseFontSize: () => void;
  scrollRef: React.RefObject<HTMLDivElement>; // The scrolling notes (T/G, scroll to top on a slide change)
  place: string; // Where it sits ('side', 'top', 'bottom', 'floating'): roomier in the sidebar
  headerProps?: React.HTMLAttributes<HTMLDivElement>; // Drag the title bar to move the block
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode; // Floating: the resize corner
}

/**
 * The presenter's speaker notes with the current slide's name. Dragged by its title bar into the sidebar,
 * a strip above or below the current slide, or a floating window.
 */
const SpeakerNotesPane: React.FC<SpeakerNotesPaneProps> = ({
  notes,
  slideName,
  fontSize,
  isReadingGuideEnabled,
  onToggleReadingGuide,
  onDecreaseFontSize,
  onIncreaseFontSize,
  scrollRef,
  place,
  headerProps,
  className,
  style,
  children,
}) => {
  const roomy = place === 'side';

  return (
    <div
      data-block="notes"
      data-notes-pane={place}
      className={clsx('rounded-2xl flex flex-col border overflow-hidden bg-neutral-800 border-neutral-700', roomy ? 'p-6' : 'p-4', place === 'floating' && 'shadow-2xl', className)}
      style={style}
      onPointerDown={(e) => e.stopPropagation()} // Not a click on the slide (laser, ink, zoom)
    >
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto pr-2 relative"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#525252 #262626',
        }}
      >
        {/* Same height as the plain heading it replaces, so the reading guide below stays on the first line */}
        <div
          {...headerProps}
          className="h-4 flex items-center gap-2 mb-3 sticky top-0 pb-2 box-content z-20 select-none bg-neutral-800"
        >
          <h2 className="text-neutral-400 text-xs font-bold uppercase tracking-wider flex-1 min-w-0 truncate">Speaker Notes</h2>
          <GripHorizontal className="w-4 h-4 text-neutral-600" aria-hidden="true" />
        </div>
        {/* Fixed Reading Guide Highlight - Stays at first line of text */}
        {isReadingGuideEnabled && (
          <div
            className="sticky left-0 right-2 pointer-events-none z-10"
            style={{
              top: '32px', // Position after heading (approx heading height)
              height: `${fontSize * 1.625}px`, // Match line height
              backgroundColor: 'rgba(156, 163, 175, 0.15)',
              borderTop: '1px solid rgba(156, 163, 175, 0.3)',
              borderBottom: '1px solid rgba(156, 163, 175, 0.3)',
              marginBottom: `-${fontSize * 1.625}px`, // Pull next content up under highlight
            }}
          />
        )}
        {notes ? (
          <div
            className="text-neutral-200 whitespace-pre-wrap leading-relaxed"
            style={{
              fontSize: `${fontSize}px`,
              paddingBottom: isReadingGuideEnabled ? '80%' : '0', // Allow last line to scroll to highlight
            }}
          >
            {notes}
          </div>
        ) : (
          <p className="text-neutral-500 italic" style={{ fontSize: `${fontSize}px` }}>
            No notes available for this slide.
          </p>
        )}
      </div>
      <div className={clsx('flex-shrink-0 border-t border-neutral-700', roomy ? 'mt-4 pt-4' : 'mt-2 pt-2')}>
        <div className="flex items-end justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-1">Current Slide</h2>
            <p className="text-neutral-300 truncate" style={{ fontSize: `${fontSize}px` }}>
              {slideName}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-4">
            <button
              onClick={onToggleReadingGuide}
              className={clsx(
                'p-1.5 rounded-md transition-colors',
                isReadingGuideEnabled ? 'bg-neutral-700 text-neutral-200' : 'hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200'
              )}
              title={isReadingGuideEnabled ? 'Disable reading guide' : 'Enable reading guide'}
              aria-label={isReadingGuideEnabled ? 'Disable reading guide' : 'Enable reading guide'}
            >
              <Eye size={16} />
            </button>
            <button
              onClick={onDecreaseFontSize}
              className="p-1.5 rounded-md hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200"
              title="Decrease font size"
              aria-label="Decrease font size"
            >
              <Minus size={16} />
            </button>
            <button
              onClick={onIncreaseFontSize}
              className="p-1.5 rounded-md hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200"
              title="Increase font size"
              aria-label="Increase font size"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
};

export default SpeakerNotesPane;
