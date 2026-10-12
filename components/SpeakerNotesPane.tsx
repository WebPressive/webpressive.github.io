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

// Header row (24 px) + its bottom padding (8) + gap (8): where the first line of notes starts
const NOTES_TOP = 40;

/**
 * The presenter's speaker notes. One header row holds the current slide's name and the reading guide and
 * font size buttons, so the notes get the rest of the block. Dragged by its header into the sidebar,
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
  const button = 'p-1 rounded-md transition-colors';

  return (
    <div
      data-block="notes"
      data-notes-pane={place}
      className={clsx('rounded-2xl flex flex-col border overflow-hidden bg-neutral-800 border-neutral-700', roomy ? 'p-5' : 'px-4 py-3', place === 'floating' && 'shadow-2xl', className)}
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
        <div
          {...headerProps}
          data-notes-header
          className="h-6 flex items-center gap-2 mb-2 sticky top-0 pb-2 box-content z-20 select-none bg-neutral-800"
        >
          <h2 className="text-neutral-400 text-xs font-bold uppercase tracking-wider flex-shrink-0">Speaker Notes</h2>
          <span className="text-neutral-500 text-xs truncate flex-1 min-w-0" data-slide-name title={slideName}>
            {slideName}
          </span>
          <button
            onClick={onToggleReadingGuide}
            className={clsx(
              button,
              isReadingGuideEnabled ? 'bg-neutral-700 text-neutral-200' : 'hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200'
            )}
            title={isReadingGuideEnabled ? 'Disable reading guide' : 'Enable reading guide'}
            aria-label={isReadingGuideEnabled ? 'Disable reading guide' : 'Enable reading guide'}
          >
            <Eye size={16} />
          </button>
          <button
            onClick={onDecreaseFontSize}
            className={clsx(button, 'hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200')}
            title="Decrease font size"
            aria-label="Decrease font size"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={onIncreaseFontSize}
            className={clsx(button, 'hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200')}
            title="Increase font size"
            aria-label="Increase font size"
          >
            <Plus size={16} />
          </button>
          <GripHorizontal className="w-4 h-4 text-neutral-600 flex-shrink-0" aria-hidden="true" />
        </div>
        {/* Fixed Reading Guide Highlight - Stays at first line of text */}
        {isReadingGuideEnabled && (
          <div
            className="sticky left-0 right-2 pointer-events-none z-10"
            style={{
              top: `${NOTES_TOP}px`,
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
      {children}
    </div>
  );
};

export default SpeakerNotesPane;
