import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Annotation, AnnotationPoint, AnnotationTool } from '../types';
import { HIGHLIGHTER_OPACITY, HIGHLIGHTER_WIDTH_FACTOR, TEXT_SIZE_FACTOR, TEXT_LINE_HEIGHT, TEXT_FONT_FAMILY } from '../constants';
import { ImageBounds, useSlideImageBounds } from '../utils/slideImageBounds';

interface AnnotationLayerProps {
  annotations: Annotation[];
  draft: Annotation | null;
  containerRef: React.RefObject<HTMLElement>;
  zoomLevel?: number;
  panX?: number;
  panY?: number;
  // Presenter-only editing props. When `editable` is false the layer is display-only (receiver).
  editable?: boolean;
  tool?: AnnotationTool;
  color?: string;
  strokeWidth?: number;
  onDraftChange?: (draft: Annotation | null) => void;
  onCommit?: (annotation: Annotation) => void;
  // Replace annotation `id` with `replacements` (the surviving pieces; empty = remove it)
  onErase?: (id: string, replacements?: Annotation[]) => void;
  onEraseEnd?: () => void; // Fired when an eraser drag finishes, so the whole drag can be one undo step
}

export type Px = [number, number];

const MIN_POINT_DISTANCE_PX = 1.5; // Skip pointer samples closer than this to the previous point
const ERASER_MIN_RADIUS_PX = 10;
const ERASER_RADIUS_WIDTH_FACTOR = 3; // Eraser radius relative to the selected stroke width

// --- Geometry helpers (all in pixel space) ---

const distanceToSegment = (p: Px, a: Px, b: Px): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
};

// Cut a freehand stroke where the eraser circle touches it.
// Returns the surviving runs of point indices [start, end] (inclusive); a single full run means untouched.
const splitAroundCircle = (pts: Px[], center: Px, radius: number): [number, number][] => {
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < pts.length; i++) {
    const inside = Math.hypot(pts[i][0] - center[0], pts[i][1] - center[1]) <= radius;
    if (inside) {
      if (start !== -1) runs.push([start, i - 1]);
      start = -1;
      continue;
    }
    // Neither endpoint is inside, but the segment between them may still cross the circle
    if (start !== -1 && distanceToSegment(center, pts[i - 1], pts[i]) <= radius) {
      runs.push([start, i - 1]);
      start = i;
      continue;
    }
    if (start === -1) start = i;
  }
  if (start !== -1) runs.push([start, pts.length - 1]);
  return runs;
};

// Smooth a freehand polyline with quadratic curves through segment midpoints
export const smoothPath = (pts: Px[]): string => {
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[0][0]} ${pts[0][1]}`; // Dot (round caps)
  if (pts.length === 2) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
};

export const straightPath = (pts: Px[]): string =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ') + (pts.length === 1 ? ` L ${pts[0][0]} ${pts[0][1]}` : '');

// Pixel outline used for eraser hit-testing (rect and ellipse are approximated by their outline)
const outlinePx = (a: Annotation, toPx: (p: AnnotationPoint) => Px): Px[] => {
  const pts = a.points.map(toPx);
  if (a.tool === 'rect' && pts.length === 2) {
    const [[x1, y1], [x2, y2]] = pts;
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
  }
  if (a.tool === 'ellipse' && pts.length === 2) {
    const [[x1, y1], [x2, y2]] = pts;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    const samples: Px[] = [];
    for (let i = 0; i <= 36; i++) {
      const t = (i / 36) * Math.PI * 2;
      samples.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    return samples;
  }
  return pts;
};

const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
  annotations,
  draft,
  containerRef,
  zoomLevel = 1.0,
  panX = 0,
  panY = 0,
  editable = false,
  tool = 'pen',
  color = '#ef4444',
  strokeWidth = 0.004,
  onDraftChange,
  onCommit,
  onErase,
  onEraseEnd,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const draftRef = useRef<Annotation | null>(null);
  const isErasingRef = useRef(false);
  const boundsRef = useRef<ImageBounds | null>(null);
  const [eraserPos, setEraserPos] = useState<Px | null>(null); // Eraser cursor, relative to the SVG
  // Text being typed: the textarea overlays the slide, and the same text is broadcast as the draft
  const [textEdit, setTextEdit] = useState<{ anchor: AnnotationPoint; value: string } | null>(null);
  const textEditRef = useRef<{ anchor: AnnotationPoint; value: string } | null>(null);

  // Bounds relative to this SVG so that the parent container's overflow clipping applies when zoomed
  const bounds = useSlideImageBounds(containerRef, editable, [zoomLevel, panX, panY], svgRef);
  boundsRef.current = bounds;

  const toPx: (p: AnnotationPoint) => Px = useCallback((p: AnnotationPoint): Px => {
    const b = boundsRef.current!;
    return [b.x + p.x * b.width, b.y + p.y * b.height];
  }, []);

  const eventToNorm = (e: React.PointerEvent<SVGSVGElement>): AnnotationPoint | null => {
    const b = boundsRef.current;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!b || !svgRect) return null;
    const x = (e.clientX - svgRect.left - b.x) / b.width;
    const y = (e.clientY - svgRect.top - b.y) / b.height;
    return { x, y };
  };

  const clamp01 = (p: AnnotationPoint): AnnotationPoint => ({
    x: Math.max(0, Math.min(1, p.x)),
    y: Math.max(0, Math.min(1, p.y)),
  });

  const eraserRadiusPx = bounds
    ? Math.max(ERASER_MIN_RADIUS_PX, strokeWidth * bounds.width * ERASER_RADIUS_WIDTH_FACTOR)
    : ERASER_MIN_RADIUS_PX;

  // Freehand strokes are cut where the eraser passes; shapes are removed whole
  const eraseAt = (p: AnnotationPoint) => {
    const b = boundsRef.current;
    if (!b || !onErase) return;
    const center = toPx(p);
    for (const a of annotations) {
      const radius = eraserRadiusPx + (a.width * b.width) / 2;

      if (a.tool === 'pen' || a.tool === 'highlighter') {
        const pts = a.points.map(toPx);
        const runs = splitAroundCircle(pts, center, radius);
        if (runs.length === 1 && runs[0][0] === 0 && runs[0][1] === pts.length - 1) continue; // Untouched
        const replacements = runs
          .filter(([start, end]) => end > start) // Drop single-point crumbs
          .map(([start, end]) => ({ ...a, id: crypto.randomUUID(), points: a.points.slice(start, end + 1) }));
        onErase(a.id, replacements);
        continue;
      }

      // Text: hit-test against its approximate bounding box
      let outline: Px[];
      if (a.tool === 'text') {
        const [x, y] = toPx(a.points[0]);
        const fontPx = (a.fontSize ?? 0) * b.width;
        const lines = (a.text ?? '').split('\n');
        const w = Math.max(...lines.map((l) => l.length)) * fontPx * 0.55;
        const h = lines.length * fontPx * TEXT_LINE_HEIGHT;
        outline = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
      } else {
        outline = outlinePx(a, toPx);
      }
      for (let i = 0; i < outline.length - 1; i++) {
        if (distanceToSegment(center, outline[i], outline[i + 1]) <= radius) {
          onErase(a.id);
          break;
        }
      }
    }
  };

  // --- Text tool ---
  const startTextEdit = (anchor: AnnotationPoint) => {
    const edit = { anchor, value: '' };
    textEditRef.current = edit;
    setTextEdit(edit);
    draftRef.current = {
      id: crypto.randomUUID(),
      tool: 'text',
      color,
      width: 0,
      fontSize: strokeWidth * TEXT_SIZE_FACTOR,
      points: [anchor],
      text: '',
    };
    onDraftChange?.(draftRef.current);
  };

  const updateTextEdit = (value: string) => {
    if (!textEditRef.current || !draftRef.current) return;
    textEditRef.current = { ...textEditRef.current, value };
    setTextEdit(textEditRef.current);
    draftRef.current = { ...draftRef.current, text: value };
    onDraftChange?.(draftRef.current);
  };

  // Commit (or drop, if empty) the text being typed
  const finishTextEdit = (cancel = false) => {
    const edit = textEditRef.current;
    const annotation = draftRef.current;
    textEditRef.current = null;
    draftRef.current = null;
    setTextEdit(null);
    onDraftChange?.(null);
    if (!cancel && edit && annotation && edit.value.trim()) {
      onCommit?.({ ...annotation, text: edit.value });
    }
  };

  // Leaving annotation mode mid-typing keeps what was typed so far
  useEffect(() => {
    if (!editable && textEditRef.current) finishTextEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editable || e.button !== 0) return;
    const p = eventToNorm(e);
    if (!p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return; // Ignore presses outside the slide
    e.preventDefault();

    // Clicking elsewhere while typing finishes the current text first
    if (textEditRef.current) finishTextEdit();

    if (tool === 'text') {
      startTextEdit(p);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === 'eraser') {
      isErasingRef.current = true;
      eraseAt(p);
      return;
    }

    const width = tool === 'highlighter' ? strokeWidth * HIGHLIGHTER_WIDTH_FACTOR : strokeWidth;
    draftRef.current = { id: crypto.randomUUID(), tool, color, width, points: [p] };
    onDraftChange?.(draftRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editable) return;
    if (tool === 'eraser') {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (svgRect) setEraserPos([e.clientX - svgRect.left, e.clientY - svgRect.top]);
    }
    const raw = eventToNorm(e);
    if (!raw) return;
    const p = clamp01(raw);

    if (isErasingRef.current) {
      eraseAt(p);
      return;
    }

    const current = draftRef.current;
    if (!current) return;

    let points: AnnotationPoint[];
    if (current.tool === 'pen' || current.tool === 'highlighter') {
      const last = current.points[current.points.length - 1];
      const [lx, ly] = toPx(last);
      const [px, py] = toPx(p);
      if (Math.hypot(px - lx, py - ly) < MIN_POINT_DISTANCE_PX) return;
      points = [...current.points, p];
    } else {
      points = [current.points[0], p];
    }
    draftRef.current = { ...current, points };
    onDraftChange?.(draftRef.current);
  };

  const finishStroke = () => {
    if (isErasingRef.current) {
      isErasingRef.current = false;
      onEraseEnd?.();
      return;
    }
    const current = draftRef.current;
    if (!current) return;
    draftRef.current = null;
    onDraftChange?.(null);

    // Shapes need two distinct points; a click without drag draws nothing
    const isShape = current.tool !== 'pen' && current.tool !== 'highlighter';
    if (isShape && current.points.length < 2) return;
    onCommit?.(current);
  };

  const renderAnnotation = (a: Annotation, b: ImageBounds) => {
    const pts = a.points.map(toPx);
    const sw = Math.max(1, a.width * b.width);
    const common = { stroke: a.color, strokeWidth: sw, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

    switch (a.tool) {
      case 'text': {
        if (!a.text || pts.length < 1) return null;
        const [x, top] = pts[0];
        const fontPx = (a.fontSize ?? 0) * b.width;
        const y = top + (fontPx * (TEXT_LINE_HEIGHT - 1)) / 2; // Half-leading, to match the textarea's line box
        return (
          <text
            key={a.id}
            x={x}
            y={y}
            fill={a.color}
            fontSize={fontPx}
            fontFamily={TEXT_FONT_FAMILY}
            dominantBaseline="text-before-edge"
            style={{ whiteSpace: 'pre', userSelect: 'none' }}
          >
            {a.text.split('\n').map((line, i) => (
              <tspan key={i} x={x} dy={i === 0 ? 0 : fontPx * TEXT_LINE_HEIGHT}>
                {line || ' '}
              </tspan>
            ))}
          </text>
        );
      }
      case 'pen':
        return <path key={a.id} d={smoothPath(pts)} {...common} />;
      case 'highlighter':
        return (
          <path
            key={a.id}
            d={straightPath(pts)}
            {...common}
            strokeOpacity={HIGHLIGHTER_OPACITY}
            style={{ mixBlendMode: 'multiply' }}
          />
        );
      case 'line': {
        if (pts.length < 2) return null;
        const [[x1, y1], [x2, y2]] = pts;
        return <line key={a.id} x1={x1} y1={y1} x2={x2} y2={y2} {...common} />;
      }
      case 'arrow': {
        if (pts.length < 2) return null;
        const [[x1, y1], [x2, y2]] = pts;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len === 0) return null;
        const ux = dx / len, uy = dy / len;
        const headLen = Math.min(len, Math.max(12, sw * 5));
        const headHalf = headLen * 0.5;
        const bx = x2 - ux * headLen, by = y2 - uy * headLen; // Base of the arrowhead
        return (
          <g key={a.id}>
            <line x1={x1} y1={y1} x2={bx} y2={by} {...common} />
            <polygon
              points={`${x2},${y2} ${bx - uy * headHalf},${by + ux * headHalf} ${bx + uy * headHalf},${by - ux * headHalf}`}
              fill={a.color}
              stroke={a.color}
              strokeWidth={Math.min(sw, 2)}
              strokeLinejoin="round"
            />
          </g>
        );
      }
      case 'rect': {
        if (pts.length < 2) return null;
        const [[x1, y1], [x2, y2]] = pts;
        return (
          <rect
            key={a.id}
            x={Math.min(x1, x2)}
            y={Math.min(y1, y2)}
            width={Math.abs(x2 - x1)}
            height={Math.abs(y2 - y1)}
            {...common}
          />
        );
      }
      case 'ellipse': {
        if (pts.length < 2) return null;
        const [[x1, y1], [x2, y2]] = pts;
        return (
          <ellipse
            key={a.id}
            cx={(x1 + x2) / 2}
            cy={(y1 + y2) / 2}
            rx={Math.abs(x2 - x1) / 2}
            ry={Math.abs(y2 - y1) / 2}
            {...common}
          />
        );
      }
      default:
        return null;
    }
  };

  const hasContent = annotations.length > 0 || draft !== null;
  if (!editable && !hasContent) return null;

  // The textarea sits beside the SVG (HTML can't live inside it) and is styled to match the
  // rendered <text> exactly, so what you type is what the audience sees.
  const textFontPx = bounds ? strokeWidth * TEXT_SIZE_FACTOR * bounds.width : 16;
  const textEditor = editable && textEdit && bounds ? (
    <textarea
      autoFocus
      value={textEdit.value}
      rows={textEdit.value.split('\n').length}
      onChange={(e) => updateTextEdit(e.target.value)}
      onBlur={() => finishTextEdit()}
      onKeyDown={(e) => {
        e.stopPropagation(); // Keep presenter shortcuts (S, L, N, Space…) from firing while typing
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finishTextEdit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finishTextEdit(true);
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      spellCheck={false}
      placeholder="Type…"
      className="absolute z-30 bg-transparent resize-none overflow-hidden outline-none border border-dashed border-white/60 p-0 m-0"
      style={{
        left: bounds.x + textEdit.anchor.x * bounds.width,
        top: bounds.y + textEdit.anchor.y * bounds.height,
        width: Math.max(80, bounds.width * (1 - textEdit.anchor.x)), // Up to the slide's right edge
        color,
        fontSize: textFontPx,
        lineHeight: TEXT_LINE_HEIGHT,
        fontFamily: TEXT_FONT_FAMILY,
        caretColor: color,
        mixBlendMode: 'normal',
      }}
    />
  ) : null;

  return (
    <>
    <svg
      ref={svgRef}
      data-annotation-layer=""
      className="absolute inset-0 w-full h-full"
      style={{
        zIndex: 20,
        pointerEvents: editable ? 'auto' : 'none',
        touchAction: 'none',
        // The eraser draws its own cursor (a circle showing its size)
        cursor: editable ? (tool === 'eraser' ? 'none' : 'crosshair') : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      onPointerLeave={() => setEraserPos(null)}
      onContextMenu={(e) => { if (editable) e.preventDefault(); }}
    >
      {bounds && (
        <>
          {annotations.map((a) => renderAnnotation(a, bounds))}
          {/* While typing locally the textarea shows the text; the SVG copy is for the receiver */}
          {draft && !(draft.tool === 'text' && textEdit) && renderAnnotation(draft, bounds)}
        </>
      )}
      {editable && tool === 'eraser' && eraserPos && (
        <circle
          cx={eraserPos[0]}
          cy={eraserPos[1]}
          r={eraserRadiusPx}
          fill="rgba(255, 255, 255, 0.25)"
          stroke="white"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          style={{ mixBlendMode: 'difference' }} // Visible on both light and dark slides
          pointerEvents="none"
        />
      )}
    </svg>
    {textEditor}
    </>
  );
};

export default AnnotationLayer;
