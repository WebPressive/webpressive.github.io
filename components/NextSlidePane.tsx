import React from 'react';
import { clsx } from 'clsx';

interface NextSlidePaneProps {
  src: string | null; // null: the last slide is showing
  place: string; // Where it sits ('side', 'top', 'bottom', 'floating')
  headerProps?: React.HTMLAttributes<HTMLDivElement>; // The whole preview is its handle: drag it to move it
  footer?: React.ReactNode; // Under the preview: the pacing timer
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode; // Floating: the resize corner
}

/** The next slide's preview in the presenter view, with the timer under it; drag the preview to move it. */
const NextSlidePane: React.FC<NextSlidePaneProps> = ({ src, place, headerProps, footer, className, style, children }) => (
  <div
    data-block="next"
    data-next-pane={place}
    className={clsx(
      'bg-black rounded-2xl flex flex-col border border-neutral-700 overflow-hidden select-none',
      // A floating block is positioned `fixed` by its caller; `relative` would override that and drop it into the page flow
      place === 'floating' ? 'shadow-2xl' : 'relative',
      className
    )}
    // A size container: the timer under the preview scales with the block (container query units)
    style={{ ...style, containerType: 'size' }}
    onPointerDown={(e) => e.stopPropagation()} // Not a click on the slide (laser, ink, zoom)
  >
    <div className="relative flex-1 min-h-0">
      <div {...headerProps} className="absolute inset-0 flex items-center justify-center">
        {src ? (
          <img src={src} className="max-w-full max-h-full object-contain opacity-75 pointer-events-none" alt="Next slide" draggable={false} />
        ) : (
          <div className="text-neutral-500">End of presentation</div>
        )}
      </div>
      <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded-full text-sm font-mono text-green-400 border border-green-500/30 pointer-events-none">
        NEXT
      </div>
    </div>
    {footer}
    {children}
  </div>
);

export default NextSlidePane;
