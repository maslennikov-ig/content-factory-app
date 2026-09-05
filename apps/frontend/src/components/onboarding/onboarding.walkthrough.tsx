'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { buttonClassName } from '@contentfactory/react/form/button';
import {
  EMPTY_PROGRESS,
  ONBOARDING_PROGRESS_API,
  ONBOARDING_STEP_HREF,
  ONBOARDING_STEP_KEYS,
  currentStep,
  doneCount,
  readProgress,
  stepDetail,
  stepIsDone,
  type OnboardingStepKey,
} from './onboarding.adapter';
import { onboardingCopy, resolveOnboardingLocale } from './onboarding.copy';

/**
 * «С чего начать» — direction A of the 02.09.2026 canvas, chosen by the owner.
 *
 * A page rather than the modal it replaces, and the difference is not
 * cosmetic: every step's button leaves for the place where the work is done.
 * A modal you have to close in order to act, and that forgets you were in it,
 * is fighting its own instructions. This page is a place you leave and come
 * back to, and it reads its own state from the workspace each time.
 *
 * No local «I finished this» flag anywhere. A step is done when the thing
 * exists — a channel, a sample, a claim, a draft, a scheduled post — which is
 * the one reading that cannot lie to a person about their own workspace. It
 * also means the page is correct for someone who did the work months ago and
 * never opened it.
 */

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M4 12l5 5L20 6" />
  </svg>
);

export function OnboardingWalkthrough() {
  const request = useFetch();
  const { language } = useVariables();
  const t = onboardingCopy[resolveOnboardingLocale(language)];

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

  const progress = answer.data ? readProgress(answer.data) : EMPTY_PROGRESS;
  const done = doneCount(progress);
  const total = ONBOARDING_STEP_KEYS.length;
  /**
   * Whether the workspace has answered yet (`content-factory-next-za05`,
   * item 5). Before it does, `progress` is `EMPTY_PROGRESS` — the right
   * default for a reader that must never congratulate anyone, and the wrong
   * thing to *print*: the bar read «0 из 6» and pointed at step one before
   * anything had been looked at, which is a claim about someone's workspace
   * made out of not knowing. An error still counts as an answer: the page
   * says so in words above, and the ticks are honestly missing.
   */
  const answered = Boolean(answer.data) || Boolean(answer.error);
  const active: OnboardingStepKey | null = answered
    ? currentStep(progress)
    : null;
  const activeIndex = active ? ONBOARDING_STEP_KEYS.indexOf(active) : -1;
  const step = active ? t.steps[active] : null;

  return (
    <section
      data-onboarding-walkthrough="true"
      aria-labelledby="onboarding-title"
      className="w-full rounded-[8px] border border-cf-border bg-cf-surface"
    >
      <header className="border-b border-cf-border p-[20px]">
        <h1
          id="onboarding-title"
          className="cf-heading-lg text-cf-ink [text-wrap:balance]"
        >
          {t.pageTitle}
        </h1>
        <p className="mt-[4px] max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
          {t.pageLead}
        </p>
      </header>

      {answer.error && (
        <p
          role="alert"
          className="m-[20px] rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {t.failed}
        </p>
      )}

      <div className="flex flex-col md:flex-row md:items-stretch">
        {/*
          The rail: what is behind, what is now, what is left. It is a list of
          states, not a set of controls — the step you are on is the one the
          product will let you finish, and letting someone jump to step five
          would just move the refusal from here to the brief gate.
        */}
        <nav
          aria-label={t.pageTitle}
          className="w-full shrink-0 border-b border-cf-border py-[20px] md:w-[320px] md:border-b-0 md:border-e md:border-cf-border"
        >
          <div className="px-[20px] pb-[16px]">
            <div className="flex items-baseline justify-between">
              <span className="cf-caption uppercase text-cf-ink-muted">
                {t.progressLabel}
              </span>
              <span
                data-onboarding-progress={
                  answered ? `${done}/${total}` : 'pending'
                }
                className="cf-caption text-cf-ink"
              >
                {answered ? t.progressValue(done, total) : t.progressPending}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              // An indeterminate bar leaves `aria-valuenow` out; a zero here
              // would announce «nothing done» to a screen reader for the same
              // reason the sighted bar printed «0 из 6».
              aria-valuenow={answered ? done : undefined}
              aria-valuetext={
                answered ? t.progressValue(done, total) : t.progressPending
              }
              aria-busy={answered ? undefined : true}
              className="mt-[8px] h-[4px] overflow-hidden rounded-[4px] bg-cf-surface-raised"
            >
              <div
                className="h-[4px] bg-cf-accent transition-[width] duration-state motion-reduce:transition-none"
                style={{
                  width: answered
                    ? `${Math.round((done / total) * 100)}%`
                    : '0%',
                }}
              />
            </div>
          </div>

          <ol className="flex flex-col">
            {ONBOARDING_STEP_KEYS.map((key, index) => {
              const finished = stepIsDone(key, progress);
              const isActive = key === active;
              const detail = stepDetail(key, progress, {
                channels: t.channels,
                samples: t.samples,
                facts: t.facts,
              });
              return (
                <li
                  key={key}
                  data-onboarding-step={key}
                  data-onboarding-step-state={
                    finished ? 'done' : isActive ? 'current' : 'todo'
                  }
                  aria-current={isActive ? 'step' : undefined}
                  className={clsx(
                    'flex items-start gap-[12px] px-[20px] py-[12px]',
                    isActive && 'border-s-[4px] border-cf-accent bg-cf-surface-subtle'
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      'flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full cf-caption',
                      finished
                        ? 'bg-cf-accent text-cf-accent-ink'
                        : isActive
                        ? 'border border-cf-accent bg-cf-accent-soft text-cf-accent'
                        : 'border border-cf-border-strong text-cf-ink-muted'
                    )}
                  >
                    {finished ? <CheckIcon /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={clsx(
                        'block cf-label-md',
                        finished ? 'text-cf-ink-muted' : 'text-cf-ink'
                      )}
                    >
                      {t.steps[key].short}
                    </span>
                    {detail && (
                      <span className="block cf-caption text-cf-ink-muted">
                        {detail}
                      </span>
                    )}
                    {isActive && !detail && (
                      <span className="block cf-caption text-cf-ink-muted">
                        {t.current}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 flex-1 p-[20px]">
          {!answer.data && !answer.error ? (
            <p aria-busy="true" className="cf-body-sm text-cf-ink-muted">
              {t.loading}
            </p>
          ) : step && active ? (
            <>
              <p className="cf-caption uppercase text-cf-ink-muted">
                {t.stepOf(activeIndex + 1, total)}
              </p>
              <h2 className="mt-[8px] cf-heading-md text-cf-ink [text-wrap:balance]">
                {step.title}
              </h2>
              <p className="mt-[8px] max-w-[62ch] cf-body-lg text-cf-ink [text-wrap:pretty]">
                {step.why}
              </p>

              <div className="mt-[20px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[16px]">
                <p className="cf-caption uppercase text-cf-ink-muted">
                  {t.todoLabel}
                </p>
                <p className="mt-[4px] max-w-[62ch] cf-body-md text-cf-ink [text-wrap:pretty]">
                  {step.todo}
                </p>
                <div className="mt-[16px] flex flex-wrap items-center gap-[8px]">
                  {/*
                    The primitive's own paint and geometry, not a second copy
                    of them (`content-factory-next-za05`, item 7). This anchor
                    had spelled out the accent fill, the padding, the focus
                    ring and a `min-h-[40px]` by hand — one more place for the
                    action scale to drift. `buttonClassName` is the branch the
                    system already keeps for a control that has to stay a link.
                  */}
                  <Link
                    href={ONBOARDING_STEP_HREF[active]}
                    data-onboarding-action={active}
                    className={buttonClassName({ variant: 'primary' })}
                  >
                    {step.action}
                  </Link>
                </div>
              </div>

              {/*
                One sentence, not two. Seen live on 02.09.2026: printing the
                step's own «what closes this» beside the general «there is no
                done button» read as the same thing said twice, one line apart.
                The step's own sentence is the specific one, so it stays.
              */}
              <p className="mt-[16px] max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {step.closes}
              </p>
            </>
          ) : (
            <>
              <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
                {t.allDoneTitle}
              </h2>
              <p className="mt-[8px] max-w-[62ch] cf-body-lg text-cf-ink [text-wrap:pretty]">
                {t.allDoneBody}
              </p>
            </>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-[12px] border-t border-cf-border p-[16px]">
        <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.comeBack}
        </p>
        {/*
          One element, not a `<button>` wrapped in an `<a>`
          (`content-factory-next-za05`, item 6). Nested interactive elements
          are invalid HTML and give a keyboard or screen-reader user two stops
          for one action, with the inner one carrying the label and the outer
          one carrying the destination.
        */}
        <Link
          href="/launches"
          className={buttonClassName({
            variant: 'secondary',
            className: 'shrink-0',
          })}
        >
          {t.leave}
        </Link>
      </footer>
    </section>
  );
}

export default OnboardingWalkthrough;
