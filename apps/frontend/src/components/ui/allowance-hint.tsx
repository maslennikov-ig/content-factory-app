'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

/**
 * `content-factory-next-fn33.28.3`: how much AI is left, beside the button
 * that spends it.
 *
 * The owner's rule of 04.09.2026 — «квоту, конечно, лучше показывать». Until
 * now the number lived on the administrator's settings screen and nowhere
 * else, so the person pressing «Найти» or «Разобрать» learned the allowance
 * was gone from a refusal after the wait.
 *
 * It is not a `Hint`. That component is a tooltip and by its own rule never
 * holds the only copy of a state; this is the state itself, read out loud in
 * one line that is always visible.
 *
 * One line, one request: SWR keys it by the door, so two of these on a screen
 * ask once. It never blocks the button — a workspace whose allowance cannot
 * be read may still press it and hear the server's own answer.
 */

export const ALLOWANCE_API = '/settings/ai/allowance';

export type AllowanceState =
  | { status: 'loading' }
  | { status: 'error' }
  /** A workspace key has no counted ceiling: say so, do not invent a number. */
  | { status: 'workspace_key' }
  /**
   * Нечем позвать модель вовсе: ни включённого лимита, ни ключа
   * (`content-factory-next-fn33.28.9`).
   *
   * Это НЕ «исчерпано». Человек, который ничего не потратил, не должен слышать,
   * что у него что-то кончилось; ему надо сказать, чего нет и куда идти.
   */
  | { status: 'unavailable' }
  /**
   * Ключ есть, а включённого лимита пространству не выдали: тратить можно
   * будет, когда появится тариф. Тоже не «исчерпано» — тратить ещё не начинали.
   */
  | { status: 'no_allowance' }
  | { status: 'exhausted' }
  | {
      status: 'included';
      remaining: number;
      limit: number;
      resetsAt: string;
    };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The answer, read defensively: an unreadable body is «not shown», never a
 * made-up remainder.
 */
export const readAllowance = (body: unknown): AllowanceState => {
  const answer = body as Record<string, unknown> | null;
  if (!answer || typeof answer !== 'object') return { status: 'error' };
  if (answer.mode === 'unavailable') return { status: 'unavailable' };
  if (answer.mode === 'workspace_key') return { status: 'workspace_key' };
  if (answer.mode !== 'included') return { status: 'error' };
  if (
    !isFiniteNumber(answer.remaining) ||
    !isFiniteNumber(answer.limit) ||
    typeof answer.resetsAt !== 'string'
  ) {
    return { status: 'error' };
  }
  /**
   * Две разные правды, которые раньше печатались одной строкой.
   *
   * `limit <= 0` — лимита не выдавали, тратить ещё не начинали.
   * `remaining <= 0` при `limit > 0` — тратили и потратили всё. Первое
   * называть исчерпанием значит сказать человеку неправду о том, что он делал
   * (`content-factory-next-fn33.28.9`).
   */
  if (answer.limit <= 0) return { status: 'no_allowance' };
  if (answer.remaining <= 0) return { status: 'exhausted' };
  return {
    status: 'included',
    remaining: answer.remaining,
    limit: answer.limit,
    resetsAt: answer.resetsAt,
  };
};

/**
 * The reset date in the workspace's language. UTC on both sides of hydration:
 * the server and the browser must print the same day or React replaces the
 * line and the number flickers.
 */
export const formatResetDate = (iso: string, language: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language || 'en', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

/**
 * The line itself, with no data source of its own, so a test and a review
 * scene can put it in any state without a network.
 */
export const AllowanceHintView = ({
  state,
  language = 'en',
}: {
  state: AllowanceState;
  language?: string;
}) => {
  const t = useT();

  if (state.status === 'loading') {
    return (
      <span className="cf-caption text-cf-ink-muted" aria-live="polite">
        {t('ai_allowance_loading', 'Checking the allowance…')}
      </span>
    );
  }

  if (state.status === 'error') {
    return (
      <span className="cf-caption text-cf-ink-muted" aria-live="polite">
        {t('ai_allowance_unknown', 'The allowance cannot be shown right now.')}
      </span>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <span className="cf-caption text-cf-ink-muted" aria-live="polite">
        {t(
          'ai_allowance_unavailable',
          'AI is not connected yet: no included allowance and no workspace key. An administrator can set this up in Settings → AI.'
        )}
      </span>
    );
  }

  if (state.status === 'no_allowance') {
    return (
      <span className="cf-caption text-cf-ink-muted" aria-live="polite">
        {t(
          'ai_allowance_none',
          'This workspace has no included AI allowance. An administrator can add a plan or choose a workspace key in Settings → AI.'
        )}
      </span>
    );
  }

  if (state.status === 'workspace_key') {
    return (
      <span className="cf-caption text-cf-ink-muted" aria-live="polite">
        {t('ai_allowance_workspace_key', 'Workspace key: no counted limit')}
      </span>
    );
  }

  // Exhausted borrows the settings screen's wording, which is the wording of
  // the server's own 429: a person must not meet two different sentences for
  // one refusal.
  if (state.status === 'exhausted') {
    return (
      <span className="cf-caption text-cf-danger" role="status">
        {t(
          'ai_usage_exhausted',
          'The included AI allowance is exhausted. Wait for it to refresh or choose Workspace API key.'
        )}
      </span>
    );
  }

  return (
    <span className="cf-caption text-cf-ink-muted" aria-live="polite">
      {t('ai_allowance_included', '{{remaining}} of {{limit}} left until {{date}}', {
        remaining: state.remaining,
        limit: state.limit,
        date: formatResetDate(state.resetsAt, language),
      })}
    </span>
  );
};

/** The same line, reading the door. */
export const AllowanceHint = () => {
  const request = useFetch();
  const { language } = useVariables();

  const load = useCallback(
    async () => (await request(ALLOWANCE_API)).json(),
    [request]
  );

  const { data, error, isLoading } = useSWR(ALLOWANCE_API, load, {
    revalidateOnFocus: false,
  });

  const state: AllowanceState = isLoading
    ? { status: 'loading' }
    : error
    ? { status: 'error' }
    : readAllowance(data);

  return <AllowanceHintView state={state} language={language} />;
};

export default AllowanceHint;
