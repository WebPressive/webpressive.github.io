import React from 'react';
import { Pencil, Highlighter, Slash, ArrowUpRight, Square, Circle, Type, Eraser, Undo2, Redo2, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { AnnotationTool } from '../types';
import { ANNOTATION_COLORS, ANNOTATION_WIDTHS } from '../constants';

interface AnnotationToolbarProps {
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSlideAnnotations: boolean;
  onToolChange: (tool: AnnotationTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearSlide: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

const TOOLS: { id: AnnotationTool; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'pen', label: 'Pen', Icon: Pencil },
  { id: 'highlighter', label: 'Highlighter', Icon: Highlighter },
  { id: 'line', label: 'Line', Icon: Slash },
  { id: 'arrow', label: 'Arrow', Icon: ArrowUpRight },
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'text', label: 'Text — click on the slide and type (Enter to finish, Shift+Enter for new line)', Icon: Type },
  { id: 'eraser', label: 'Eraser (E) — drag over ink to erase just that part', Icon: Eraser },
];

// Prevent buttons from taking focus so keyboard shortcuts (Space, arrows) keep going to the window
const noFocus = (e: React.MouseEvent) => e.preventDefault();

const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  tool,
  color,
  strokeWidth,
  canUndo,
  canRedo,
  hasSlideAnnotations,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onRedo,
  onClearSlide,
  onClearAll,
  onClose,
}) => {
  return (
    <div
      className={clsx(
        'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-1',
        'bg-neutral-900/90 backdrop-blur-md border border-white/10 p-1.5 rounded-2xl shadow-2xl'
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {TOOLS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onToolChange(id)}
          onMouseDown={noFocus}
          className={clsx('p-2 rounded-xl transition-colors', tool === id ? 'bg-blue-600 text-white' : 'hover:bg-white/10 text-neutral-300')}
          title={label}
          aria-label={label}
          aria-pressed={tool === id}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}

      <div className="w-px h-6 bg-white/10 mx-1" />

      {ANNOTATION_COLORS.map((c) => (
        <button
          key={c.value}
          onClick={() => onColorChange(c.value)}
          onMouseDown={noFocus}
          className={clsx(
            'w-7 h-7 rounded-xl flex items-center justify-center transition-colors',
            color === c.value ? 'bg-white/20' : 'hover:bg-white/10'
          )}
          title={c.name}
          aria-label={`${c.name} color`}
          aria-pressed={color === c.value}
        >
          <span
            className={clsx('block w-4 h-4 rounded-full border', color === c.value ? 'border-white' : 'border-white/30')}
            style={{ backgroundColor: c.value }}
          />
        </button>
      ))}

      <div className="w-px h-6 bg-white/10 mx-1" />

      {ANNOTATION_WIDTHS.map((w, i) => (
        <button
          key={w.value}
          onClick={() => onWidthChange(w.value)}
          onMouseDown={noFocus}
          className={clsx(
            'w-7 h-7 rounded-xl flex items-center justify-center transition-colors',
            strokeWidth === w.value ? 'bg-white/20' : 'hover:bg-white/10'
          )}
          title={w.name}
          aria-label={`${w.name} stroke`}
          aria-pressed={strokeWidth === w.value}
        >
          <span className="block rounded-full bg-neutral-200" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
        </button>
      ))}

      <div className="w-px h-6 bg-white/10 mx-1" />

      <button
        onClick={onUndo}
        onMouseDown={noFocus}
        disabled={!canUndo}
        className="p-2 rounded-xl hover:bg-white/10 text-neutral-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        onClick={onRedo}
        onMouseDown={noFocus}
        disabled={!canRedo}
        className="p-2 rounded-xl hover:bg-white/10 text-neutral-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
        aria-label="Redo"
      >
        <Redo2 className="w-4 h-4" />
      </button>
      <button
        onClick={(e) => (e.shiftKey ? onClearAll() : onClearSlide())}
        onMouseDown={noFocus}
        disabled={!hasSlideAnnotations}
        className="p-2 rounded-xl hover:bg-white/10 text-neutral-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        title="Clear slide (C) — Shift+click or Shift+C clears all slides"
        aria-label="Clear annotations on this slide"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <button
        onClick={onClose}
        onMouseDown={noFocus}
        className="p-2 rounded-xl hover:bg-white/10 text-neutral-300 transition-colors"
        title="Exit annotation mode (N / Esc)"
        aria-label="Exit annotation mode"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default AnnotationToolbar;
