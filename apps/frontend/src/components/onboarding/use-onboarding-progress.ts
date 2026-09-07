'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import {
  EMPTY_PROGRESS,
  ONBOARDING_PROGRESS_API,
  readProgress,
  type OnboardingProgress,
} from './onboarding.adapter';

/**
 * Насколько область прошла шесть шагов — один запрос на два читателя.
 *
 * The walkthrough asked this on its own page. Since 07.09.2026 the sidebar
 * asks it too, because «С чего начать» is a menu row that has to disappear
 * once there is nothing left to start. Two components calling `useSWR` with
 * this same key share one request and one cache entry; two components spelling
 * the fetch out separately would share nothing, and the row would go on
 * showing a state the page had already moved past.
 *
 * `answered` is the part worth keeping in one place. Before the workspace
 * replies, `progress` is `EMPTY_PROGRESS` — the right default for a reader
 * that must never congratulate anyone, and the wrong thing to act on: a menu
 * that hid the row while the answer was still in flight, or a bar that printed
 * «0 из 6», is making a claim about someone's workspace out of not knowing. An
 * error counts as an answer: the ticks are then honestly missing, and the row
 * stays.
 */
export type OnboardingProgressState = {
  progress: OnboardingProgress;
  /** The workspace has replied, one way or the other. */
  answered: boolean;
  loading: boolean;
  error: unknown;
};

export function useOnboardingProgress(): OnboardingProgressState {
  const request = useFetch();

  const read = useMemo(
    () => async (url: string) => {
      const response = await request(url);
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    },
    [request]
  );

  const answer = useSWR(
    ONBOARDING_PROGRESS_API,
    () => read(ONBOARDING_PROGRESS_API),
    { revalidateOnFocus: true }
  );

  const answered = Boolean(answer.data) || Boolean(answer.error);

  return {
    progress: answer.data ? readProgress(answer.data) : EMPTY_PROGRESS,
    answered,
    loading: !answered,
    error: answer.error,
  };
}
