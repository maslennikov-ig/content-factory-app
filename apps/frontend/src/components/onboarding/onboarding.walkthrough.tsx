'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { Panel } from '@contentfactory/react/layout';
import { Disclosure } from '../ui/disclosure';
import {
  ONBOARDING_FACT_HREF,
  ONBOARDING_STEP_KEYS,
  currentStep,
  doneCount,
  factIsDone,
  nextStep,
  previousStep,
  stepDetail,
  stepHref,
  stepIsDone,
  tourHref,
  type OnboardingProgress,
  type OnboardingStepKey,
} from './onboarding.adapter';
import { useOnboardingProgress } from './use-onboarding-progress';
import { onboardingCopy, resolveOnboardingLocale } from './onboarding.copy';
import { OnboardingTelegramGuide } from './onboarding.telegram';

/**
 * «С чего начать» — variant B «Один шаг на экране» of the 25.09.2026 canvas,
 * chosen by the owner (2q28.5, built in 2q28.6).
 *
 * A strip of five labelled segments on top, one step in the middle, and a
 * footer with «Назад», «Сделаю позже» and «Дальше: …». The step on the screen
 * is navigation state and nothing else: which step you are *looking at* is
 * kept here, whether a step is *done* is never kept anywhere but in the
 * workspace. A step is done when the thing exists — an avatar, a channel, a
 * piece, an adaptation, a post in the schedule or a chosen channel plan —
 * which is the one reading that cannot lie to a person about their own work.
 * «Сделаю позже» moves on without ticking anything; the skipped step stays
 * open on the strip, and every segment of the strip can be pressed.
 */

type View = OnboardingStepKey | 'done';

const headingClass =
  'text-cf-ink [text-wrap:balance] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus';

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

type Words = (typeof onboardingCopy)['ru'];

/** The optional claim: offered, ticked when it exists, never in the count. */
function OptionalFact({
  t,
  progress,
}: {
  t: Words;
  progress: OnboardingProgress;
}) {
  const done = factIsDone(progress);
  const total = progress.facts + progress.pieceFacts;
  return (
    <div
      data-onboarding-optional="fact"
      data-onboarding-optional-state={done ? 'done' : 'todo'}
      className="flex flex-col gap-[8px] rounded-[8px] border border-dashed border-cf-border-strong p-[16px]"
    >
      <span className="cf-caption text-cf-ink-muted">{t.fact.label}</span>
      <span className="cf-label-md text-cf-ink">{t.fact.title}</span>
      {done ? (
        <span className="flex items-center gap-[8px] cf-body-sm text-cf-ink">
          <span className="text-cf-accent">
            <CheckIcon />
          </span>
          {t.fact.done(total)}
        </span>
      ) : (
        <>
          <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.fact.body}
          </p>
          <Link
            href={ONBOARDING_FACT_HREF}
            data-onboarding-optional-action="fact"
            className={buttonClassName({
              variant: 'quiet',
              className: 'self-start underline underline-offset-4',
            })}
          >
            {t.fact.action}
          </Link>
        </>
      )}
    </div>
  );
}

export function OnboardingWalkthrough({
  embedded = false,
}: {
  /**
   * Внутри вкладки настроек, а не на своей странице (owner, 07.09.2026). Two
   * things change and nothing else: the heading is an `h2`, because the
   * settings screen already owns the page's `h1`, and the «вернуться через
   * меню» line goes — you are already somewhere you can come back to.
   */
  embedded?: boolean;
} = {}) {
  const { language } = useVariables();
  const t = onboardingCopy[resolveOnboardingLocale(language)];

  const { progress, answered, loading, error } = useOnboardingProgress();

  /*
    The step on the screen. `null` until the workspace answers, then pinned to
    the first open step, so a step that closes while it is on the screen stays
    there and turns «Дальше» on — instead of the page jumping away under the
    person's hand.
  */
  const [chosen, setChosen] = useState<View | null>(null);
  const firstOpen: View = currentStep(progress) ?? 'done';
  const view: View = chosen ?? firstOpen;

  useEffect(() => {
    if (answered && chosen === null) setChosen(firstOpen);
    // Pin once, on the first answer; later answers only move the ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered]);

  // Focus follows a move the person made, so a screen reader hears the new step.
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const go = useCallback((next: View) => {
    moved.current = true;
    setChosen(next);
  }, []);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus();
  }, [view]);

  const total = ONBOARDING_STEP_KEYS.length;
  const done = doneCount(progress);
  const step = view === 'done' ? null : view;
  const stepIndex = step ? ONBOARDING_STEP_KEYS.indexOf(step) : -1;
  const stepDone = step ? stepIsDone(step, progress) : false;
  const words = step ? t.steps[step] : null;
  const next: View | null = step ? nextStep(step) : null;
  const back: View | null = step
    ? previousStep(step)
    : ONBOARDING_STEP_KEYS[total - 1];
  // The last step finishes rather than naming a step to go round to.
  const nextLabel =
    next === null ? '' : next === 'done' ? t.finish : t.next(t.steps[next].short);
  const detail = step
    ? stepDetail(step, progress, { channels: t.channels })
    : null;
  const openCount = total - done;
  // The settings tab already owns an `h2` for the section itself.
  // It is never larger than that section heading either.
  const Heading = embedded ? 'h3' : 'h2';
  const headingSize = embedded ? 'cf-heading-md' : 'cf-heading-lg';

  return (
    <section
      data-onboarding-walkthrough="true"
      data-onboarding-view={answered ? view : 'pending'}
      aria-labelledby={embedded ? 'onboarding-title' : undefined}
      aria-label={embedded ? undefined : t.pageTitle}
      // Its own page takes the app's page gutter (`cf-page-pad`, as the
      // calendar, content and settings do); inside the settings tab the
      // surface around it already has one.
      className={clsx(
        'flex w-full flex-col gap-[24px]',
        !embedded && 'cf-page-pad'
      )}
    >
      <header className="flex flex-col gap-[4px]">
        {embedded && (
          <h2
            id="onboarding-title"
            className="cf-heading-md text-cf-ink [text-wrap:balance]"
          >
            {t.pageTitle}
          </h2>
        )}
        <p className="max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
          {t.pageLead}
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {t.failed}
        </p>
      )}

      {/*
        The strip: five segments in menu order, every one of them a button.
        Below `sm` the labels fold to their numbers — five words side by side
        do not fit 360px — and the step's own caption says which one is on.
      */}
      <nav aria-label={t.stripLabel} className="flex flex-col gap-[8px]">
        <div className="flex items-baseline justify-between gap-[12px]">
          <span className="cf-caption text-cf-ink-muted">{t.stripLabel}</span>
          <span
            data-onboarding-progress={answered ? `${done}/${total}` : 'pending'}
            className="cf-caption text-cf-ink"
          >
            {answered ? t.progressValue(done, total) : t.progressPending}
          </span>
        </div>
        <ol className="grid grid-cols-5 gap-[4px] sm:gap-[12px]">
          {ONBOARDING_STEP_KEYS.map((key, index) => {
            const finished = answered && stepIsDone(key, progress);
            const isOn = answered && key === view;
            return (
              <li key={key} className="min-w-0">
                <Button
                  variant="quiet"
                  layout="content"
                  onClick={() => go(key)}
                  aria-current={isOn ? 'step' : undefined}
                  disabled={!answered}
                  data-onboarding-step={key}
                  data-onboarding-step-state={
                    finished ? 'done' : isOn ? 'current' : 'todo'
                  }
                  className="w-full rounded-[4px] px-[4px] py-[8px]"
                  innerClassName="flex-col justify-start gap-[8px]"
                >
                  <span
                    aria-hidden
                    className={clsx(
                      'block h-[4px] w-full rounded-full',
                      finished
                        ? 'bg-cf-accent'
                        : isOn
                        ? 'bg-cf-border-control'
                        : 'bg-cf-border'
                    )}
                  />
                  <span
                    className={clsx(
                      'flex w-full min-w-0 items-center gap-[4px] cf-label-sm',
                      isOn || finished ? 'text-cf-ink' : 'text-cf-ink-muted'
                    )}
                  >
                    {finished && (
                      <span aria-hidden className="shrink-0 text-cf-accent">
                        <CheckIcon />
                      </span>
                    )}
                    <span className="truncate">
                      {index + 1}.
                      <span className="hidden sm:inline">
                        {' '}
                        {t.steps[key].short}
                      </span>
                    </span>
                    <span className="sr-only">
                      {' '}
                      {t.steps[key].short},{' '}
                      {finished ? t.stateDone : t.stateOpen}
                    </span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[24px]">
        {loading ? (
          <p aria-busy="true" className="cf-body-sm text-cf-ink-muted">
            {t.loading}
          </p>
        ) : step && words ? (
          <>
            <div className="flex flex-col gap-[12px]">
              <p className="cf-caption text-cf-ink-muted">
                {t.stepOf(stepIndex + 1, total)} · {words.short}
              </p>
              <Heading
                ref={heading}
                tabIndex={-1}
                className={clsx(headingSize, headingClass)}
              >
                {words.title}
              </Heading>
              <p className="max-w-[62ch] cf-body-lg text-cf-ink-muted [text-wrap:pretty]">
                {words.why}
              </p>
              {stepDone && (
                <p
                  data-onboarding-step-done={step}
                  className="flex items-center gap-[8px] cf-body-sm text-cf-ink"
                >
                  <span className="text-cf-accent">
                    <CheckIcon />
                  </span>
                  {detail ?? t.doneNote}
                </p>
              )}
            </div>

            <Panel as="div" contentPadding="snug" contentClassName="flex flex-col gap-[16px] sm:p-[24px]">
              {step === 'channel' && !stepDone ? (
                <OnboardingTelegramGuide
                  words={t.telegram}
                  actionLabel={words.action}
                />
              ) : (
                <>
                  {step !== 'channel' && (
                    <p className="max-w-[62ch] cf-body-md text-cf-ink [text-wrap:pretty]">
                      {words.todo}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-[8px]">
                    <Link
                      href={stepHref(step, progress)}
                      data-onboarding-action={step}
                      className={buttonClassName({
                        variant: stepDone ? 'secondary' : 'primary',
                      })}
                    >
                      {step === 'channel'
                        ? t.openChannels
                        : (step === 'adaptation' || step === 'plan') &&
                          progress.latestPieceId
                        ? t.openLatestPiece
                        : words.action}
                    </Link>
                  </div>
                </>
              )}
              <div className="flex flex-wrap items-center gap-[8px] border-t border-cf-border pt-[16px]">
                {/*
                  The tour (stream S3) reads `?tour=<key>` on the target
                  screen; this page only makes the address.
                */}
                <Link
                  href={tourHref(step, progress)}
                  data-onboarding-tour={step}
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  {t.showOnScreen}
                </Link>
                {/* What closes the step, only while it is still open. */}
                {!stepDone && (
                  <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                    {words.closes}
                  </span>
                )}
              </div>
            </Panel>

            {step === 'piece' && <OptionalFact t={t} progress={progress} />}

            <Disclosure
              summary={<span className="cf-label-md">{t.moreLabel}</span>}
              contentClassName="pt-[8px]"
            >
              <ul className="flex list-disc flex-col gap-[8px] ps-[20px]">
                {words.more.map((line) => (
                  <li
                    key={line}
                    className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </>
        ) : (
          <div className="flex flex-col gap-[12px]">
            <Heading
              ref={heading}
              tabIndex={-1}
              className={clsx(headingSize, headingClass)}
            >
              {openCount === 0 ? t.allDoneTitle : t.leftTitle}
            </Heading>
            <p className="max-w-[62ch] cf-body-lg text-cf-ink-muted [text-wrap:pretty]">
              {openCount === 0 ? t.allDoneBody : t.leftBody(openCount)}
            </p>
            <OptionalFact t={t} progress={progress} />
          </div>
        )}

        {!loading && (
          <div className="flex flex-col gap-[8px] border-t border-cf-border pt-[20px]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              {back ? (
                <Button
                  variant="quiet"
                  onClick={() => go(back)}
                  data-onboarding-nav="back"
                >
                  {t.back}
                </Button>
              ) : (
                <span />
              )}
              {step && next !== null && (
                <div className="flex flex-wrap items-center gap-[8px]">
                  {!stepDone && (
                    <Button
                      variant="secondary"
                      onClick={() => go(next)}
                      data-onboarding-nav="later"
                    >
                      {t.later}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => go(next)}
                    disabled={!stepDone}
                    aria-describedby={stepDone ? undefined : 'onboarding-wait'}
                    data-onboarding-nav="next"
                  >
                    {nextLabel}
                  </Button>
                </div>
              )}
            </div>
            {step && !stepDone && (
              <p id="onboarding-wait" className="cf-caption text-cf-ink-muted">
                {t.waitNote}
              </p>
            )}
          </div>
        )}
      </div>

      {/*
        Where the ticks come from, and why there is no «начать заново». There
        is nothing to reset — every tick is a row of the workspace, and a
        button that unticked them would either delete someone's work or set a
        flag that lies (owner, 07.09.2026).
      */}
      <footer className="flex flex-col gap-[4px] border-t border-cf-border pt-[16px]">
        <p
          data-onboarding-note="counted"
          className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
        >
          {t.counted}
        </p>
        {!embedded && (
          <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.comeBack}
          </p>
        )}
      </footer>
    </section>
  );
}

export default OnboardingWalkthrough;
