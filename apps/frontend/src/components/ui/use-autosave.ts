'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';

/** Pause after the last keystroke before a field saves itself. */
export const AUTOSAVE_MS = 800;

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * One opinion about when a field is «saved» (`content-factory-next-97dq.58`).
 *
 * The rule is the adaptation editor's (`piece.container.tsx`, `saveBody` /
 * `changeBody` / `flush`): a change waits `AUTOSAVE_MS` for the next one, then
 * goes; leaving the field sends what is waiting at once; the status reads
 * «saving… / saved · HH:mm / not saved · retry». The editor keeps its own
 * copy because it runs one timer per adaptation; a single form uses this.
 *
 * `save` answers `true` when the value is stored, `false` when it was refused
 * or not sent (an invalid form is `null`: nothing was tried, the status goes
 * back to where it was). Only the newest attempt may set the status, so a slow
 * early answer never paints «saved» over a later failure.
 */
export function useAutosave<Value>(
  save: (value: Value) => Promise<boolean | null>,
  { delay = AUTOSAVE_MS }: { delay?: number } = {}
) {
  const [state, setState] = useState<AutosaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ value: Value } | null>(null);
  const last = useRef<{ value: Value } | null>(null);
  const attempt = useRef(0);
  const settled = useRef<AutosaveState>('idle');

  const run = useCallback(async (value: Value): Promise<boolean> => {
    clearTimeout(timer.current);
    pending.current = null;
    last.current = { value };
    const mine = ++attempt.current;
    setState('saving');
    let ok: boolean | null;
    try {
      ok = await saveRef.current(value);
    } catch {
      ok = false;
    }
    if (mine !== attempt.current) return ok === true;
    if (ok === null) {
      setState(settled.current);
      return false;
    }
    settled.current = ok ? 'saved' : 'failed';
    if (ok) setSavedAt(dayjs().format('HH:mm'));
    setState(settled.current);
    return ok;
  }, []);

  /** A change: saves `delay` ms after the last one. */
  const schedule = useCallback(
    (value: Value) => {
      pending.current = { value };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const waiting = pending.current;
        if (waiting) void run(waiting.value);
      }, delay);
    },
    [delay, run]
  );

  /** What is waiting, now: on blur and before leaving. */
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    const waiting = pending.current;
    if (!waiting) return true;
    return run(waiting.value);
  }, [run]);

  /** The same value again after «не сохранилось». */
  const retry = useCallback(async (): Promise<boolean> => {
    const again = pending.current ?? last.current;
    if (!again) return true;
    return run(again.value);
  }, [run]);

  // Leaving the screen mid-pause must not lose the last words.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const waiting = pending.current;
      pending.current = null;
      if (waiting) void saveRef.current(waiting.value);
    },
    []
  );

  return { state, savedAt, schedule, flush, saveNow: run, retry };
}
