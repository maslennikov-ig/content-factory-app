'use client';

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

/** Only an unsent browser draft. Native pending payloads own accepted answers. */
export function useQuestionDraft<T>(
  key: string | undefined,
  initial: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (!key || typeof window === 'undefined') return initial;
    try {
      const saved = window.sessionStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : initial;
    } catch {
      return initial;
    }
  });
  const update: Dispatch<SetStateAction<T>> = useCallback(
    (next) =>
      setValue((previous) => {
        const resolved =
          typeof next === 'function'
            ? (next as (value: T) => T)(previous)
            : next;
        if (key) {
          try {
            window.sessionStorage.setItem(key, JSON.stringify(resolved));
          } catch {
            /* A browser draft never controls native persistence. */
          }
        }
        return resolved;
      }),
    [key]
  );
  return [value, update];
}

export const domainQuestionDraftKey = (
  scope: string | undefined,
  batchId: string,
  revision: string,
  key: string
): string | undefined =>
  scope
    ? `${scope}:question:${encodeURIComponent(batchId)}:${encodeURIComponent(
        revision
      )}:${encodeURIComponent(key)}`
    : undefined;
