import { useCallback, useEffect, useRef } from 'react';

/**
 * Talk pacing from the speaker notes: each slide gets a time budget from its notes' length, and the
 * presenter sees the time on this slide against its budget and the talk time against the schedule.
 *
 * A unit is one or more consecutive pages with the same notes (Beamer steps that repeat a frame's note
 * count once); pages with different notes, e.g. one note per click, are separate units.
 */
export interface PaceSettings {
  wpm: number; // Speaking rate, words per minute
  emptySeconds: number; // Budget of a slide without notes
}

export const DEFAULT_PACE: PaceSettings = { wpm: 130, emptySeconds: 15 };
export const WPM_RANGE = { min: 80, max: 250, step: 5 };
export const EMPTY_RANGE = { min: 0, max: 120, step: 5 };

const SETTINGS_KEY = 'webpressive_pace_settings';
const TALK_END_KEY = 'webpressive_talk_end:';

export interface PaceUnit {
  first: number; // Page indices, inclusive
  last: number;
  budget: number; // ms
  backup: boolean; // After the talk end: not in the total
}

export interface PacePlan {
  units: PaceUnit[];
  unitOf: number[]; // Page index -> unit index
  before: number[]; // Unit index -> talk budget of the units before it, ms
  total: number; // Talk budget, ms
}

// [time: 1:30], [time 90s], [time: 2m], [time: 1.5 min], [time: 45]
const TIME_TAG = /\[\s*time\s*:?\s*(\d+(?::\d{1,2})?(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?)?\s*\]/i;

/** A `[time: ...]` tag in the notes sets the slide's time; the tag itself is not shown. */
export function parseTimeTag(notes?: string): { text: string; seconds: number | null } {
  if (!notes) return { text: '', seconds: null };
  const match = notes.match(TIME_TAG);
  if (!match) return { text: notes, seconds: null };
  const [value, unit] = [match[1], (match[2] ?? '').toLowerCase()];
  let seconds: number;
  if (value.includes(':')) {
    const [m, s] = value.split(':');
    seconds = Number(m) * 60 + Number(s);
  } else {
    seconds = Number(value) * (unit.startsWith('m') ? 60 : 1);
  }
  const text = notes.replace(TIME_TAG, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  return { text, seconds: Number.isFinite(seconds) ? seconds : null };
}

export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Budgets for every page. `talkEnd`: the last page index of the talk; later pages are backup. */
export function buildPlan(pages: { notes?: string }[], settings: PaceSettings, talkEnd: number): PacePlan {
  const units: PaceUnit[] = [];
  const unitOf: number[] = [];
  let previous: string | null = null;
  pages.forEach((page, index) => {
    const notes = (page.notes ?? '').trim();
    // Same notes as the page before: another step of the same unit. Pages without notes stay apart.
    if (notes && notes === previous) {
      units[units.length - 1].last = index;
    } else {
      const { text, seconds } = parseTimeTag(notes);
      const words = countWords(text);
      const budget = seconds !== null ? seconds * 1000 : words > 0 ? (words / settings.wpm) * 60000 : settings.emptySeconds * 1000;
      units.push({ first: index, last: index, budget: Math.round(budget), backup: index > talkEnd });
    }
    unitOf.push(units.length - 1);
    previous = notes;
  });
  const before: number[] = [];
  let total = 0;
  units.forEach((unit) => {
    before.push(total);
    if (!unit.backup) total += unit.budget;
  });
  return { units, unitOf, before, total };
}

/**
 * How far behind the schedule the talk is (negative: ahead), ms. While within this slide's budget the
 * offset holds still; it grows once the slide runs over. On a backup slide: talk time - talk budget.
 */
export function scheduleOffset(plan: PacePlan, unit: number, talkMs: number, unitMs: number): number {
  const u = plan.units[unit];
  if (!u) return 0;
  if (u.backup) return talkMs - plan.total;
  return talkMs - plan.before[unit] - Math.min(unitMs, u.budget);
}

export type PaceTone = 'ok' | 'warn' | 'over' | 'ahead';

/** This slide: within its budget, a little over (25 %, at least 10 s), or well over. */
export function slideTone(unitMs: number, budget: number): PaceTone {
  const over = unitMs - budget;
  if (over <= 0) return 'ok';
  return over <= Math.max(0.25 * budget, 10000) ? 'warn' : 'over';
}

/** The whole talk: on time (within 2 %, at least 10 s), a little late (8 %, at least 45 s), late, or well ahead. */
export function totalTone(offset: number, total: number): PaceTone {
  const onTime = Math.max(10000, 0.02 * total);
  if (offset < -onTime) return 'ahead';
  if (offset <= onTime) return 'ok';
  return offset <= Math.max(45000, 0.08 * total) ? 'warn' : 'over';
}

/** m:ss (h:mm:ss from an hour). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** +m:ss behind, -m:ss ahead, 0:00 on time. */
export function formatOffset(ms: number): string {
  const rounded = Math.round(ms / 1000) * 1000;
  if (rounded === 0) return '0:00';
  return `${rounded > 0 ? '+' : '-'}${formatClock(Math.abs(rounded))}`;
}

/** The talk's last page by default: the one before the PDF's Appendix bookmark, else the last page. */
export function defaultTalkEnd(pages: { appendix?: boolean }[]): number {
  const first = pages.findIndex((page) => page.appendix);
  return first > 0 ? first - 1 : pages.length - 1;
}

export function loadPaceSettings(): PaceSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    return { ...DEFAULT_PACE, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return DEFAULT_PACE;
  }
}

export function savePaceSettings(settings: PaceSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Per session only
  }
}

/** The talk end chosen for a deck (page index), or null for the default. */
export function loadTalkEnd(deckKey: string | null): number | null {
  if (!deckKey) return null;
  try {
    const saved = localStorage.getItem(TALK_END_KEY + deckKey);
    return saved === null ? null : Number(saved);
  } catch {
    return null;
  }
}

export function saveTalkEnd(deckKey: string | null, talkEnd: number | null) {
  if (!deckKey) return;
  try {
    if (talkEnd === null) localStorage.removeItem(TALK_END_KEY + deckKey);
    else localStorage.setItem(TALK_END_KEY + deckKey, String(talkEnd));
  } catch {
    // Per session only
  }
}

/**
 * Time spent on each unit, without pauses, kept across visits. Cleared when the timer restarts
 * (`startTime` changes). Read with `unitMs(unit)`, so the caller's display ticks on its own.
 */
export function useUnitClock(unit: number, startTime: number | null, isPaused: boolean): (unit: number) => number {
  const state = useRef({ start: null as number | null, unit: -1, entered: null as number | null, spent: {} as Record<number, number> });

  useEffect(() => {
    const s = state.current;
    const now = Date.now();
    if (s.start !== startTime) {
      s.start = startTime;
      s.spent = {};
    } else if (s.entered !== null) {
      s.spent[s.unit] = (s.spent[s.unit] ?? 0) + now - s.entered;
    }
    s.unit = unit;
    s.entered = startTime && !isPaused ? now : null;
  }, [unit, startTime, isPaused]);

  return useCallback((of: number): number => {
    const s = state.current;
    // Asked for a unit just navigated to, before the effect above has run: its earlier visits only
    if (of !== s.unit) return s.spent[of] ?? 0;
    return (s.spent[of] ?? 0) + (s.entered !== null ? Date.now() - s.entered : 0);
  }, []);
}
