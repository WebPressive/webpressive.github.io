import React, { useEffect, useRef, useState } from 'react';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const VISIBLE_HEADER = 64; // A moved panel keeps at least its whole header on screen, so it can be dragged back

/**
 * A side panel moved by dragging its header. Docked (top-right, from the panel's own classes) until
 * moved; double-clicking the header docks it again. The position lasts while the panel stays mounted.
 * Spread `handleProps` on the header and `panelStyle` on the panel; leave the docking classes off when
 * `isDocked` is false.
 */
export function useDraggablePanel(panelRef: React.RefObject<HTMLElement>) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // Keep a moved panel reachable when the window shrinks
  useEffect(() => {
    if (!position) return;
    const keepOnScreen = () => {
      const width = panelRef.current?.offsetWidth ?? 320;
      setPosition((prev: { x: number; y: number } | null) =>
        prev && {
          x: clamp(prev.x, 0, Math.max(0, window.innerWidth - width)),
          y: clamp(prev.y, 0, Math.max(0, window.innerHeight - VISIBLE_HEADER)),
        }
      );
    };
    window.addEventListener('resize', keepOnScreen);
    return () => window.removeEventListener('resize', keepOnScreen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position !== null]);

  const handleProps = {
    style: { touchAction: 'none' } as React.CSSProperties,
    title: 'Drag to move',
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return; // Header buttons stay buttons
      const rect = panelRef.current!.getBoundingClientRect();
      dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const width = panelRef.current?.offsetWidth ?? 320;
      setPosition({
        x: clamp(e.clientX - drag.dx, 0, Math.max(0, window.innerWidth - width)),
        y: clamp(e.clientY - drag.dy, 0, Math.max(0, window.innerHeight - VISIBLE_HEADER)),
      });
    },
    onPointerUp: () => {
      dragRef.current = null;
    },
    onPointerCancel: () => {
      dragRef.current = null;
    },
    onDoubleClick: (e: React.MouseEvent<HTMLElement>) => {
      if (!(e.target as HTMLElement).closest('button')) setPosition(null); // Double-click docks it back
    },
  };

  const panelStyle: React.CSSProperties = {
    left: position?.x,
    top: position?.y,
    // Above the control bar when docked; down to the window's bottom edge when moved
    maxHeight: position ? `max(${VISIBLE_HEADER}px, calc(100vh - ${position.y}px - 1rem))` : 'calc(100vh - 8rem)',
  };

  return { isDocked: !position, handleProps, panelStyle };
}
