import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Captions, GripHorizontal, Minus, MonitorUp, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { FinalLine } from '../utils/liveTranscriber';
import { LiveTranscript } from '../utils/useLiveTranscript';

interface TranscriptPaneProps {
  transcript: LiveTranscript;
  place: string; // Where it sits ('side', 'top', 'bottom', 'floating')
  fontSize: number;
  showAudience: boolean;
  onFontSize: (step: 1 | -1) => void;
  onToggleAudience: () => void;
  onClose: () => void;
  headerProps?: React.HTMLAttributes<HTMLDivElement>; // Drag the title bar to move the block
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode; // Floating: the resize corner
}

const PARAGRAPH_GAP_MS = 4000; // A longer pause starts a new paragraph
const STICK_PX = 24; // Scrolled to within this of the end: keep following new text

function paragraphs(lines: FinalLine[]): FinalLine[][] {
  const out: FinalLine[][] = [];
  lines.forEach((line, i) => {
    if (i === 0 || line.start - lines[i - 1].end > PARAGRAPH_GAP_MS) out.push([line]);
    else out[out.length - 1].push(line);
  });
  return out;
}

/**
 * The live transcript in the presenter view: the text so far (newest at the end, followed while you
 * stay scrolled to the end), the line being spoken in grey, and the pane's own settings.
 */
const TranscriptPane: React.FC<TranscriptPaneProps> = ({
  transcript,
  place,
  fontSize,
  showAudience,
  onFontSize,
  onToggleAudience,
  onClose,
  headerProps,
  className,
  style,
  children,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const { status, progress, error, lines, preview, isListening } = transcript;

  // Follow new text unless the presenter scrolled back
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [lines, preview, fontSize]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const button = 'p-1 rounded-md transition-colors text-neutral-400 hover:text-neutral-100 hover:bg-white/10';

  let body: React.ReactNode;
  if (error) {
    body = (
      <div className="text-sm text-red-300">
        {error}{' '}
        {status === 'error' && (
          <button onClick={transcript.retry} className="ml-1 underline text-red-200 hover:text-white">
            Try again
          </button>
        )}
      </div>
    );
  } else if (status === 'loading' || status === 'idle') {
    body = (
      <div className="text-sm text-neutral-400" data-transcript-loading="">
        Loading the speech model{progress > 0 && progress < 1 ? ` (${Math.round(progress * 100)}%)` : ''}… The first time downloads about 28 MB;
        afterwards it starts from this computer, also offline.
      </div>
    );
  } else if (lines.length === 0 && !preview) {
    body = <div className="text-sm text-neutral-500 italic">{isListening ? 'Listening… what you say appears here.' : 'Opening the microphone…'}</div>;
  } else {
    body = (
      <div className="leading-snug text-neutral-100" style={{ fontSize }} data-transcript-text="">
        {paragraphs(lines).map((group, i, all) => (
          <p key={group[0].id} className={clsx(i > 0 && 'mt-2')}>
            {group.map((line) => line.text).join(' ')}
            {i === all.length - 1 && preview && <span className="text-neutral-500"> {preview}</span>}
          </p>
        ))}
        {lines.length === 0 && preview && <p className="text-neutral-500">{preview}</p>}
      </div>
    );
  }

  return (
    <div
      data-block="transcript"
      data-transcript-pane={place}
      className={clsx('flex flex-col overflow-hidden border rounded-2xl bg-neutral-800 border-neutral-700', place === 'floating' && 'shadow-2xl', className)}
      style={style}
      onPointerDown={(e) => e.stopPropagation()} // Not a click on the slide (laser, ink, zoom)
    >
      <div
        {...headerProps}
        className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0 border-b border-white/5 select-none"
      >
        <Captions className={clsx('w-4 h-4 flex-shrink-0', isListening ? 'text-green-400' : 'text-neutral-500')} />
        <span className="text-neutral-400 text-xs font-bold uppercase tracking-wider mr-1">Transcript</span>
        {isListening && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="Listening" />}
        <div className="flex-1" />
        <GripHorizontal className="w-4 h-4 text-neutral-600 mr-1" aria-hidden="true" />
        <button onClick={() => onFontSize(-1)} className={button} title="Smaller text" aria-label="Smaller transcript text">
          <Minus className="w-4 h-4" />
        </button>
        <button onClick={() => onFontSize(1)} className={button} title="Larger text" aria-label="Larger transcript text">
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleAudience}
          className={clsx(button, showAudience && 'bg-blue-600/80 text-white hover:bg-blue-600')}
          title={showAudience ? 'Captions shown to the audience (click to hide)' : 'Show captions to the audience'}
          aria-label="Show captions to the audience"
          aria-pressed={showAudience}
        >
          <MonitorUp className="w-4 h-4" />
        </button>
        <button onClick={onClose} className={button} title="Turn the transcript off (W)" aria-label="Turn the transcript off">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#525252 transparent' }}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
        }}
        data-transcript-scroll=""
      >
        {body}
      </div>
      {children}
    </div>
  );
};

export default TranscriptPane;
