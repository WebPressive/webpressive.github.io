import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The presenter view's blocks (next slide, speaker notes, live transcript) and where they sit:
 * the sidebar beside the current slide (stacked), a strip above or below the current slide (side by side),
 * or a floating window. A block is moved by dragging its title bar onto one of those places; every edge
 * between sections resizes (double-click resets it). Kept in localStorage.
 */
export type BlockId = 'next' | 'notes' | 'transcript';
export type DockId = 'side' | 'top' | 'bottom';
export const BLOCKS: BlockId[] = ['next', 'notes', 'transcript'];
export const BLOCK_NAMES: Record<BlockId, string> = { next: 'Next slide', notes: 'Speaker notes', transcript: 'Transcript' };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PresenterLayout {
  docks: Record<DockId, BlockId[]>; // Blocks in each place, in order (stacked in the sidebar, side by side in a strip)
  floating: Partial<Record<BlockId, Rect>>; // Floating blocks: fractions of the window
  weights: Record<BlockId, number>; // A block's share of its place
  sideWidth: number; // Sidebar, % of the width
  topHeight: number; // Strip above the slide, % of the slide column
  bottomHeight: number; // Strip below the slide
  fontSize: number; // Transcript text, px
}

export const DEFAULT_LAYOUT: PresenterLayout = {
  docks: { side: ['next', 'notes', 'transcript'], top: [], bottom: [] },
  floating: {},
  weights: { next: 55, notes: 45, transcript: 35 },
  sideWidth: 33.33,
  topHeight: 30,
  bottomHeight: 30,
  fontSize: 18,
};

const DEFAULT_FLOAT: Record<BlockId, Rect> = {
  next: { x: 0.66, y: 0.06, w: 0.3, h: 0.3 },
  notes: { x: 0.04, y: 0.5, w: 0.36, h: 0.32 },
  transcript: { x: 0.52, y: 0.6, w: 0.4, h: 0.24 },
};

const STORAGE_KEY = 'webpressive_presenter_layout_v2';
const DRAG_THRESHOLD = 5; // px before a press on a title bar becomes a move
const MIN_SHARE = 0.12; // Of its place, for every block
export const TRANSCRIPT_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40];
const DOCKS: DockId[] = ['side', 'top', 'bottom'];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function load(): PresenterLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object' || !saved.docks) return DEFAULT_LAYOUT;
    const layout: PresenterLayout = { ...DEFAULT_LAYOUT, ...saved, weights: { ...DEFAULT_LAYOUT.weights, ...saved.weights } };
    // Every block exactly once: in one place, or floating
    const seen = new Set<BlockId>();
    const docks = {} as Record<DockId, BlockId[]>;
    DOCKS.forEach((dock) => {
      docks[dock] = (Array.isArray(saved.docks[dock]) ? saved.docks[dock] : []).filter((id: BlockId) => BLOCKS.includes(id) && !seen.has(id) && seen.add(id));
    });
    const floating: Partial<Record<BlockId, Rect>> = {};
    BLOCKS.forEach((id) => {
      const rect = saved.floating?.[id];
      if (!seen.has(id) && rect && typeof rect.x === 'number') {
        floating[id] = rect;
        seen.add(id);
      }
    });
    BLOCKS.forEach((id) => !seen.has(id) && docks.side.push(id));
    return { ...layout, docks, floating };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export type DropTarget = { kind: 'dock'; dock: DockId; index: number } | { kind: 'float'; rect: Rect };

export interface BlockDrag {
  id: BlockId;
  x: number; // Pointer, px
  y: number;
  target: DropTarget | null;
  preview: { left: number; top: number; width: number; height: number } | null; // Where it would land, px
}

// The edge being dragged: sidebar|slide, strip|slide, or between two blocks of a place (`after`: the block before it)
export type Edge = { kind: 'side' } | { kind: 'strip'; dock: 'top' | 'bottom' } | { kind: 'between'; dock: DockId; after: BlockId };

interface Options {
  container: React.RefObject<HTMLElement>; // Slide column + sidebar
  column: React.RefObject<HTMLElement>; // Slide column, with its strips
  isVisible: (id: BlockId) => boolean; // The transcript only while on
}

const px = (r: DOMRect) => ({ left: r.left, top: r.top, width: r.width, height: r.height });

export function usePresenterLayout({ container, column, isVisible }: Options) {
  const [layout, setLayout] = useState<PresenterLayout>(load);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [drag, setDrag] = useState<BlockDrag | null>(null);
  const [resizing, setResizing] = useState<BlockId | null>(null);
  const pressRef = useRef<{ id: BlockId; x0: number; y0: number; dx: number; dy: number; started: boolean } | null>(null);
  const resizeRef = useRef<{ x0: number; y0: number; w0: number; h0: number } | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const visibleRef = useRef(isVisible);
  visibleRef.current = isVisible;

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
      } catch {
        // Per session only
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [layout]);

  const update = useCallback((change: Partial<PresenterLayout>) => setLayout((prev: PresenterLayout) => ({ ...prev, ...change })), []);

  const shown = (l: PresenterLayout, dock: DockId) => l.docks[dock].filter((id) => visibleRef.current(id));

  /** Puts a block in a place (at `index` among the shown blocks there) or floating. */
  const place = useCallback((id: BlockId, target: DropTarget) => {
    setLayout((prev: PresenterLayout) => {
      const docks = {} as Record<DockId, BlockId[]>;
      DOCKS.forEach((d) => (docks[d] = prev.docks[d].filter((b) => b !== id)));
      const floating = { ...prev.floating };
      delete floating[id];
      if (target.kind === 'float') {
        floating[id] = target.rect;
      } else {
        // `index` counts shown blocks; insert before the shown block at that index
        const list = docks[target.dock];
        const shownList = list.filter((b) => visibleRef.current(b));
        const before = shownList[target.index];
        const at = before ? list.indexOf(before) : list.length;
        list.splice(at, 0, id);
      }
      return { ...prev, docks, floating };
    });
  }, []);

  // Where a block dropped at (x, y) goes, and the area to highlight
  const targetAt = (id: BlockId, x: number, y: number, dx: number, dy: number): { target: DropTarget; preview: BlockDrag['preview'] } => {
    const l = layoutRef.current;
    const root = container.current;
    const C = root?.getBoundingClientRect();
    const col = column.current?.getBoundingClientRect();
    const others = (dock: DockId) => shown(l, dock).filter((b) => b !== id);
    const rectOfBlock = (b: BlockId) => root?.querySelector(`[data-block="${b}"]`)?.getBoundingClientRect();
    const indexAmong = (dock: DockId, horizontal: boolean) =>
      others(dock).filter((b) => {
        const r = rectOfBlock(b);
        return r ? (horizontal ? r.left + r.width / 2 < x : r.top + r.height / 2 < y) : false;
      }).length;
    if (C && col) {
      // The sidebar (or, with none, the right quarter)
      const sideEl = root?.querySelector('[data-dock="side"]')?.getBoundingClientRect();
      const side = sideEl && others('side').length > 0 ? px(sideEl) : { left: C.right - C.width * 0.25, top: C.top, width: C.width * 0.25, height: C.height };
      if (x >= side.left && x <= C.right + 8 && y >= C.top && y <= C.bottom) {
        return { target: { kind: 'dock', dock: 'side', index: indexAmong('side', false) }, preview: side };
      }
      if (x >= col.left && x <= col.right && y >= col.top - 8 && y <= col.bottom + 8) {
        const topEl = root?.querySelector('[data-dock="top"]')?.getBoundingClientRect();
        const bottomEl = root?.querySelector('[data-dock="bottom"]')?.getBoundingClientRect();
        const topH = Math.max(col.height * 0.22, topEl && others('top').length ? topEl.height : 0);
        const bottomH = Math.max(col.height * 0.22, bottomEl && others('bottom').length ? bottomEl.height : 0);
        if (y <= col.top + topH) {
          return {
            target: { kind: 'dock', dock: 'top', index: indexAmong('top', true) },
            preview: { left: col.left, top: col.top, width: col.width, height: (col.height * l.topHeight) / 100 },
          };
        }
        if (y >= col.bottom - bottomH) {
          const h = (col.height * l.bottomHeight) / 100;
          return {
            target: { kind: 'dock', dock: 'bottom', index: indexAmong('bottom', true) },
            preview: { left: col.left, top: col.bottom - h, width: col.width, height: h },
          };
        }
      }
    }
    // Anywhere else: a floating window there
    const W = window.innerWidth;
    const H = window.innerHeight;
    const size = l.floating[id] ?? DEFAULT_FLOAT[id];
    const rect = { w: size.w, h: size.h, x: clamp((x - dx) / W, 0, 1 - size.w), y: clamp((y - dy) / H, 0, 1 - Math.min(size.h, 0.08)) };
    return { target: { kind: 'float', rect }, preview: { left: rect.x * W, top: rect.y * H, width: rect.w * W, height: rect.h * H } };
  };

  // Moving a block: press on its title bar, drag past a few pixels, drop
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      if (!press.started) {
        if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_THRESHOLD) return;
        press.started = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      const { target, preview } = targetAt(press.id, e.clientX, e.clientY, press.dx, press.dy);
      setDrag({ id: press.id, x: e.clientX, y: e.clientY, target, preview });
    };
    const up = (e: PointerEvent) => {
      const press = pressRef.current;
      pressRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (!press?.started) return;
      const { target } = targetAt(press.id, e.clientX, e.clientY, press.dx, press.dy);
      setDrag(null);
      place(press.id, target);
    };
    const cancel = () => {
      pressRef.current = null;
      setDrag(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Spread on a block's title bar: drag it to move the block; double-click a floating one to put it back in the sidebar. */
  const moveHandleProps = (id: BlockId) => ({
    'data-move-handle': id,
    title: 'Drag to move',
    style: { touchAction: 'none', cursor: 'grab' } as React.CSSProperties,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      const el = (e.currentTarget as HTMLElement).closest('[data-block]')?.getBoundingClientRect();
      pressRef.current = { id, x0: e.clientX, y0: e.clientY, dx: el ? e.clientX - el.left : 0, dy: el ? e.clientY - el.top : 0, started: false };
      e.preventDefault();
    },
    onDoubleClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (layoutRef.current.floating[id]) place(id, { kind: 'dock', dock: 'side', index: Infinity });
    },
  });

  // Resizing: sections' edges and a floating block's corner
  useEffect(() => {
    if (!edge && !resizing) return;
    const move = (e: PointerEvent) => {
      setLayout((prev: PresenterLayout) => {
        if (resizing) {
          const start = resizeRef.current;
          const rect = prev.floating[resizing];
          if (!start || !rect) return prev;
          const w = clamp(start.w0 + (e.clientX - start.x0) / window.innerWidth, 0.12, 1 - rect.x);
          const h = clamp(start.h0 + (e.clientY - start.y0) / window.innerHeight, 0.1, 1 - rect.y);
          return { ...prev, floating: { ...prev.floating, [resizing]: { ...rect, w, h } } };
        }
        if (!edge) return prev;
        const C = container.current?.getBoundingClientRect();
        const col = column.current?.getBoundingClientRect();
        if (edge.kind === 'side' && C) return { ...prev, sideWidth: clamp(((C.right - e.clientX) / C.width) * 100, 18, 60) };
        if (edge.kind === 'strip' && col) {
          const from = edge.dock === 'top' ? e.clientY - col.top : col.bottom - e.clientY;
          // With strips both above and below, the slide keeps at least a quarter of the column
          const other = edge.dock === 'top' ? 'bottom' : 'top';
          const room = shown(prev, other).length > 0 ? 75 - (other === 'top' ? prev.topHeight : prev.bottomHeight) : 60;
          const value = clamp((from / col.height) * 100, 10, Math.max(10, Math.min(60, room)));
          return edge.dock === 'top' ? { ...prev, topHeight: value } : { ...prev, bottomHeight: value };
        }
        if (edge.kind === 'between') {
          const dockEl = container.current?.querySelector(`[data-dock="${edge.dock}"]`)?.getBoundingClientRect();
          if (!dockEl) return prev;
          const horizontal = edge.dock !== 'side';
          const list = shown(prev, edge.dock);
          const i = list.indexOf(edge.after);
          if (i < 0 || i + 1 >= list.length) return prev;
          const total = list.reduce((sum, b) => sum + prev.weights[b], 0);
          const f = horizontal ? (e.clientX - dockEl.left) / dockEl.width : (e.clientY - dockEl.top) / dockEl.height;
          const before = list.slice(0, i).reduce((sum, b) => sum + prev.weights[b], 0);
          const pair = prev.weights[list[i]] + prev.weights[list[i + 1]];
          const a = clamp(f * total - before, MIN_SHARE * total, pair - MIN_SHARE * total);
          return { ...prev, weights: { ...prev.weights, [list[i]]: a, [list[i + 1]]: pair - a } };
        }
        return prev;
      });
    };
    const end = () => {
      setEdge(null);
      setResizing(null);
      resizeRef.current = null;
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    document.body.style.cursor = resizing ? 'nwse-resize' : edge?.kind === 'side' || (edge?.kind === 'between' && edge.dock !== 'side') ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge, resizing]);

  /** Props for an edge between sections: drag to resize, double-click to reset. */
  const edgeProps = (target: Edge) => ({
    'data-divider': target.kind === 'side' ? 'side' : target.kind === 'strip' ? target.dock : `${target.dock}-after-${target.after}`,
    title: 'Drag to resize · double-click to reset',
    style: { touchAction: 'none' } as React.CSSProperties,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setEdge(target);
    },
    onDoubleClick: () => {
      if (target.kind === 'side') update({ sideWidth: DEFAULT_LAYOUT.sideWidth });
      else if (target.kind === 'strip') update(target.dock === 'top' ? { topHeight: DEFAULT_LAYOUT.topHeight } : { bottomHeight: DEFAULT_LAYOUT.bottomHeight });
      else {
        // Both neighbours back to an equal share of what they have together
        setLayout((prev: PresenterLayout) => {
          const list = shown(prev, target.dock);
          const i = list.indexOf(target.after);
          if (i < 0 || i + 1 >= list.length) return prev;
          const half = (prev.weights[list[i]] + prev.weights[list[i + 1]]) / 2;
          return { ...prev, weights: { ...prev.weights, [list[i]]: half, [list[i + 1]]: half } };
        });
      }
    },
  });

  /** A floating block's corner: drag to resize. */
  const floatResizeProps = (id: BlockId) => ({
    'data-divider': `floating-resize-${id}`,
    title: 'Drag to resize',
    style: { touchAction: 'none' } as React.CSSProperties,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = layoutRef.current.floating[id];
      if (!rect) return;
      resizeRef.current = { x0: e.clientX, y0: e.clientY, w0: rect.w, h0: rect.h };
      setResizing(id);
    },
  });

  return { layout, update, place, drag, moveHandleProps, edgeProps, floatResizeProps, shownIn: (dock: DockId) => shown(layout, dock) };
}
