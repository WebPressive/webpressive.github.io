import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import {
  EMPTY_RANGE,
  PacePlan,
  PaceSettings,
  PaceTone,
  WPM_RANGE,
  formatClock,
  formatOffset,
  scheduleOffset,
  slideTone,
  totalTone,
} from '../utils/pacing';

interface PaceTimerProps {
  plan: PacePlan;
  unit: number; // The current slide's unit
  unitMs: (unit: number) => number; // Time spent on a unit so far
  startTime: number | null;
  pausedTime: number; // Paused ms before the current pause
  pauseStartTime: number | null; // The current pause began (null: running)
  settings: PaceSettings;
  onSettings: (settings: PaceSettings) => void;
  talkEnd: number; // Last page index of the talk
  onTalkEnd: (talkEnd: number | null) => void; // null: back to the default
  currentIndex: number;
  slideCount: number;
  onTogglePause: () => void;
  onReset: () => void;
}

const TONE_TEXT: Record<PaceTone, string> = {
  ok: 'text-green-400',
  warn: 'text-amber-400',
  over: 'text-red-400',
  ahead: 'text-sky-400',
};

/**
 * The pacing timer under the next slide: time on this slide against its budget, talk time against the
 * script, and how far behind (+) or ahead (-) of the schedule. Click it for its settings.
 */
const PaceTimer: React.FC<PaceTimerProps> = ({
  plan,
  unit,
  unitMs,
  startTime,
  pausedTime,
  pauseStartTime,
  settings,
  onSettings,
  talkEnd,
  onTalkEnd,
  currentIndex,
  slideCount,
  onTogglePause,
  onReset,
}) => {
  const [, setTick] = useState(0);
  const [popover, setPopover] = useState<React.CSSProperties | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setTick((t: number) => t + 1), 250);
    return () => clearInterval(interval);
  }, []);

  // The popover closes on a press outside it or Escape
  useEffect(() => {
    if (!popover) return;
    const close = (e: Event) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setPopover(null);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setPopover(null);
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [popover]);

  const isPaused = pauseStartTime !== null;
  const talkMs = startTime ? (pauseStartTime ?? Date.now()) - startTime - pausedTime : 0;
  const spent = unitMs(unit);
  const current = plan.units[unit];
  const budget = current?.budget ?? 0;
  const offset = scheduleOffset(plan, unit, talkMs, spent);
  const slideColor = TONE_TEXT[slideTone(spent, budget)];
  const totalColor = TONE_TEXT[totalTone(offset, plan.total)];

  const togglePopover = () => {
    if (popover) return setPopover(null);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 300;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    // Above the timer when there is room, else below it
    setPopover(rect.top > 340 ? { left, width, bottom: window.innerHeight - rect.top + 8 } : { left, width, top: rect.bottom + 8 });
  };

  const step = (value: number, delta: number, range: { min: number; max: number }) => Math.max(range.min, Math.min(range.max, value + delta));
  const stepper = (label: string, value: string, onMinus: () => void, onPlus: () => void, minusLabel: string, plusLabel: string) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-neutral-300">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={onMinus} className="p-1 rounded-md hover:bg-neutral-700 text-neutral-400 hover:text-neutral-100" aria-label={minusLabel} title={minusLabel}>
          <Minus size={14} />
        </button>
        <span className="font-mono text-neutral-100 w-16 text-center">{value}</span>
        <button onClick={onPlus} className="p-1 rounded-md hover:bg-neutral-700 text-neutral-400 hover:text-neutral-100" aria-label={plusLabel} title={plusLabel}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        data-pace-timer
        onClick={togglePopover}
        className="w-full flex-shrink-0 px-3 py-2 border-t border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800/80 transition-colors text-left font-mono"
        title="Pacing: click for settings"
        aria-label="Pacing timer settings"
        aria-expanded={!!popover}
      >
        <div className="grid items-baseline gap-x-2" style={{ gridTemplateColumns: 'auto 1fr auto', fontSize: 'clamp(12px, min(6.5cqw, 6cqh), 26px)' }}>
          <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-neutral-500">{current?.backup ? 'Backup' : 'Slide'}</span>
          <span className="whitespace-nowrap overflow-hidden text-ellipsis" data-pace-slide>
            <span className={slideColor}>{formatClock(spent)}</span>
            <span className="text-neutral-500"> / {formatClock(budget)}</span>
          </span>
          <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-amber-400">{isPaused ? 'Paused' : ''}</span>
          <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-neutral-500">Total</span>
          <span className="whitespace-nowrap overflow-hidden text-ellipsis" data-pace-total>
            <span className={totalColor}>{formatClock(talkMs)}</span>
            <span className="text-neutral-500"> / {formatClock(plan.total)}</span>
          </span>
          <span className={clsx('whitespace-nowrap', totalColor)} data-pace-offset title="Behind (+) or ahead (-) of the schedule">
            {formatOffset(offset)}
          </span>
        </div>
      </button>
      {popover &&
        createPortal(
          <div
            ref={popoverRef}
            data-pace-settings
            className="fixed z-[95] p-4 rounded-xl bg-neutral-900 border border-neutral-700 shadow-2xl text-sm space-y-3 select-none"
            style={popover}
            onPointerDown={(e) => e.stopPropagation()} // Not a click on the slide (laser, ink, zoom)
          >
            <h3 className="text-neutral-400 text-xs font-bold uppercase tracking-wider">Pacing</h3>
            {stepper(
              'Speaking rate',
              `${settings.wpm} wpm`,
              () => onSettings({ ...settings, wpm: step(settings.wpm, -WPM_RANGE.step, WPM_RANGE) }),
              () => onSettings({ ...settings, wpm: step(settings.wpm, WPM_RANGE.step, WPM_RANGE) }),
              'Slower',
              'Faster'
            )}
            {stepper(
              'Slide without notes',
              formatClock(settings.emptySeconds * 1000),
              () => onSettings({ ...settings, emptySeconds: step(settings.emptySeconds, -EMPTY_RANGE.step, EMPTY_RANGE) }),
              () => onSettings({ ...settings, emptySeconds: step(settings.emptySeconds, EMPTY_RANGE.step, EMPTY_RANGE) }),
              'Less time',
              'More time'
            )}
            {stepper(
              'Talk ends after slide',
              String(talkEnd + 1),
              () => onTalkEnd(Math.max(0, talkEnd - 1)),
              () => onTalkEnd(Math.min(slideCount - 1, talkEnd + 1)),
              'Earlier slide',
              'Later slide'
            )}
            <div className="flex items-center justify-end gap-2 text-xs">
              <button onClick={() => onTalkEnd(currentIndex)} className="px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
                Ends on this slide
              </button>
              <button onClick={() => onTalkEnd(null)} className="px-2 py-1 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200">
                Default
              </button>
            </div>
            <p className="text-neutral-400 leading-snug">
              Script: <span className="font-mono text-neutral-200">{formatClock(plan.total)}</span> for slides 1-{talkEnd + 1}
              {talkEnd + 1 < slideCount ? `; ${slideCount - talkEnd - 1} backup` : ''}. A slide's time is its notes at your speaking rate;{' '}
              <span className="font-mono text-neutral-300">[time: 1:30]</span> in its notes sets it.
            </p>
            <div className="flex gap-2 pt-1 border-t border-neutral-800">
              <button onClick={onTogglePause} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 mt-2 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
                {isPaused ? <Play size={14} /> : <Pause size={14} />}
                {isPaused ? 'Resume (P)' : 'Pause (P)'}
              </button>
              <button onClick={onReset} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 mt-2 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
                <RotateCcw size={14} />
                Restart
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default PaceTimer;
