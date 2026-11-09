"use client";

import { useCallback, useState } from "react";

const LIMIT = 100;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  key: string | null;
}

/**
 * Undo/redo over immutable snapshots. Consecutive updates sharing a `coalesceKey`
 * (e.g. every pointer move of one drag) collapse into a single undo step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [], key: null });

  const update = useCallback((fn: (prev: T) => T, coalesceKey?: string) => {
    setState((s) => {
      const next = fn(s.present);
      if (next === s.present) return s;
      if (coalesceKey && coalesceKey === s.key) return { ...s, present: next, future: [] };
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [], key: coalesceKey ?? null };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) =>
      s.past.length
        ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future], key: null }
        : s
    );
  }, []);

  const redo = useCallback(() => {
    setState((s) =>
      s.future.length
        ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), key: null }
        : s
    );
  }, []);

  const reset = useCallback((value: T) => {
    setState({ past: [], present: value, future: [], key: null });
  }, []);

  return {
    present: state.present,
    update,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
