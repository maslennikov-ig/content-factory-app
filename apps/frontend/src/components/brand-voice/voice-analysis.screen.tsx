'use client';

import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { formatChars, voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * Screen 04: the deterministic pass, before a model is asked anything.
 *
 * The design draws five discrete steps, a rhythm sparkline and a highlighted
 * quote pulled live from a sample. None of the three travels on the wire:
 * `VoiceAnalysisResponseV1` carries one percentage and one of two stages while
 * the run is `pending`, and the counted totals, the lexicon and the
 * punctuation shares once it is `ready` — nothing that would let this screen
 * reconstruct a five-step checklist or point at a specific sentence without
 * inventing the rest. Filling those gaps with plausible-looking numbers is
 * exactly what `component-authoring-rules.md` rules out for an empty state,
 * and a running one is no different: a guess dressed as a measurement is
 * worse than a screen that says less.
 *
 * So this shows what the route actually hands over: a progress bar with the
 * stage it is in, and — once the pass finishes — the four things it counted
 * for certain (average sentence length, vocabulary, punctuation habits,
 * anything left out of the count). The mismatch with the mockup's step list
 * and quote panel is recorded rather than papered over; the numbers it does
 * show are the numbers the analysis actually produced.
 */

export type VoiceAnalysisState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

export type AnalysisStage = 'MEASURING' | 'ASSISTING';

export type AnalysisLexiconRow = Readonly<{ term: string; count: number }>;

export type AnalysisPunctuationRow = Readonly<{
  dashInsteadOfCopula: number | null;
  colonBeforeList: number | null;
  questionAtEnd: number | null;
  exclamation: number | null;
}>;

export type AnalysisRejectedReason = 'AI_ARTEFACT' | 'TOO_SHORT' | 'LANGUAGE';

export type AnalysisRejectedRow = Readonly<{
  code: string;
  reason: AnalysisRejectedReason;
}>;

const PUNCTUATION_ROWS = [
  ['dashInsteadOfCopula', 'analysisPunctuationDash'],
  ['colonBeforeList', 'analysisPunctuationColon'],
  ['questionAtEnd', 'analysisPunctuationQuestion'],
  ['exclamation', 'analysisPunctuationExclaim'],
] as const;

function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-[8px] w-full overflow-hidden rounded-[4px] border border-cf-border bg-cf-surface-subtle"
    >
      <div
        className="h-full rounded-[4px] bg-cf-accent"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export function VoiceAnalysisScreen({
  locale,
  state = 'default',
  progress,
  stage,
  sampleCount,
  charCount,
  holdoutCount,
  wordCount,
  sentenceCount,
  lexicon = [],
  punctuation,
  rejected = [],
  notice,
  onContinue,
  onRetry,
  onStop,
}: {
  locale: VoiceLocale;
  state?: VoiceAnalysisState;
  /** 0–100. Present while the run is `pending`. */
  progress?: number;
  stage?: AnalysisStage;
  sampleCount?: number;
  charCount?: number;
  /** Accepted samples deliberately kept out of the measurement. */
  holdoutCount?: number;
  wordCount?: number;
  sentenceCount?: number;
  lexicon?: readonly AnalysisLexiconRow[];
  punctuation?: AnalysisPunctuationRow;
  rejected?: readonly AnalysisRejectedRow[];
  notice?: string;
  onContinue?: () => void;
  onRetry?: () => void;
  onStop?: () => void;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading' || (state === 'default' && progress != null);
  const ready = state === 'success';
  // `long-content` is a review state for a finished pass with an
  // unusually long entry, not a fourth outcome of the request — it shows
  // the same measured panel `success` does, wrapping included.
  /**
   * A refusal that still carries numbers is one half of the run failing.
   *
   * The arithmetic finishes in the POST and is saved before the model is
   * asked; only the proposal is lost when the model does not answer, and the
   * server's own refusal says as much. Treating `error` as "nothing to show"
   * put «Числа появятся, когда разбор досчитает до конца» directly under an
   * alert stating they were saved, at 0% — and the only way to see them was
   * to pay for the run a second time.
   */
  const counted = sampleCount != null && charCount != null;
  const countedOnly = state === 'error' && counted;
  const showMeasured = ready || state === 'long-content' || countedOnly;
  const shownPercent = progress ?? (ready || countedOnly ? 100 : 0);
  const stageLabel =
    stage === 'ASSISTING' ? t.analysisStageAssisting : t.analysisStageMeasuring;
  const progressLabel = ready
    ? t.analysisDone
    : countedOnly
      ? t.analysisCountedOnly
      : stageLabel;

  // A state that already carries its own alert or status banner (error,
  // restricted, disabled) does not also make the progress line a second live
  // region — two status regions announcing at once is worse than one.
  const progressStatusRole =
    state === 'disabled' || state === 'error' || state === 'restricted'
      ? undefined
      : 'status';

  const avgSentenceLength =
    wordCount && sentenceCount
      ? new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
          maximumFractionDigits: 1,
        }).format(wordCount / sentenceCount)
      : null;

  return (
    <section
      data-voice-surface="analysis"
      data-voice-state={state}
      aria-busy={busy ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[20px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header>
        <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {t.analysisTitle}
        </h2>
        {sampleCount != null && charCount != null ? (
          <p className="mt-[4px] cf-caption text-cf-ink-muted">
            {t.analysisSubtitle(sampleCount, formatChars(charCount, locale))}
          </p>
        ) : null}
        {/*
          Where the rest of the corpus went. A person who pasted eight texts
          reads «6 образцов» here, and nothing was rejected — the two are held
          back on purpose, and saying so is the difference between a design and
          a loss.
        */}
        {holdoutCount ? (
          <p
            className="mt-[4px] cf-caption text-cf-ink-muted [text-wrap:pretty]"
            data-voice-analysis-holdout={holdoutCount}
          >
            {t.analysisHoldout(holdoutCount)}
          </p>
        ) : null}
      </header>

      {state === 'error' ? (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          <span className="cf-label-sm uppercase text-cf-danger">
            {t.analysisErrorTitle}
          </span>{' '}
          {notice ?? t.analysisErrorFallback}
        </p>
      ) : null}

      {state === 'restricted' ? (
        <p className="rounded-[8px] border border-cf-border bg-cf-surface p-[12px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          <span className="text-cf-ink">{t.analysisRestrictedTitle}.</span>{' '}
          {t.analysisRestrictedBody}
        </p>
      ) : null}

      {state === 'disabled' ? (
        <p
          role="status"
          className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
        >
          {notice ?? t.analysisDisabledFallback}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-[20px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-[12px]">
          <h3 className="cf-label-sm uppercase text-cf-ink-muted">
            {t.analysisProgressHeading}
          </h3>
          <div
            className={clsx(
              'flex flex-col gap-[8px] rounded-[8px] border p-[16px]',
              state === 'selected'
                ? 'border-cf-accent bg-cf-surface'
                : 'border-cf-border bg-cf-surface'
            )}
          >
            {state === 'loading' && progress == null ? (
              <>
                <p role={progressStatusRole} className="cf-body-sm text-cf-ink">
                  {t.analysisLoading}
                </p>
                <ProgressBar percent={6} label={t.analysisLoading} />
              </>
            ) : (
              <>
                <div
                  role={progressStatusRole}
                  className="flex items-baseline gap-[8px]"
                >
                  <span className="cf-label-md text-cf-ink">
                    {progressLabel}
                  </span>
                  <span className="ms-auto cf-label-sm text-cf-ink-muted">
                    {shownPercent}%
                  </span>
                </div>
                <ProgressBar percent={shownPercent} label={stageLabel} />
              </>
            )}
          </div>
          <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {t.analysisNote}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-[12px]">
          <h3 className="cf-label-sm uppercase text-cf-ink-muted">
            {t.analysisMeasuredHeading}
          </h3>

          {state === 'empty' ? (
            <div
              className="rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
              data-voice-analysis-empty="true"
            >
              <p className="cf-body-sm text-cf-ink">{t.analysisEmptyTitle}</p>
              <p className="mt-[8px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {t.analysisEmptyBody}
              </p>
            </div>
          ) : !showMeasured ? (
            <div className="rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
              <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {t.analysisAwaiting}
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-[12px] sm:grid-cols-2">
                <div className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
                  <span className="cf-label-sm uppercase text-cf-ink-muted">
                    {t.analysisSentenceLength}
                  </span>
                  {avgSentenceLength ? (
                    <>
                      <span
                        className="cf-display-num text-cf-ink"
                        data-voice-analysis-sentence-length="true"
                      >
                        {avgSentenceLength}
                      </span>
                      <span className="cf-caption text-cf-ink-muted">
                        {t.analysisSentenceLengthUnit}
                      </span>
                    </>
                  ) : (
                    <span className="cf-body-sm text-cf-ink-muted">
                      {t.analysisNoData}
                    </span>
                  )}
                </div>

                <div
                  className={clsx(
                    'flex min-w-0 flex-col gap-[8px] rounded-[8px] border bg-cf-surface p-[16px]',
                    state === 'long-content'
                      ? 'border-cf-border-strong'
                      : 'border-cf-border'
                  )}
                >
                  <span className="cf-label-sm uppercase text-cf-ink-muted">
                    {t.analysisLexicon}
                  </span>
                  {lexicon.length === 0 ? (
                    <span className="cf-body-sm text-cf-ink-muted">
                      {t.analysisNoData}
                    </span>
                  ) : (
                    <div className="flex flex-col gap-[8px]">
                      {lexicon.slice(0, 4).map((entry) => (
                        <div
                          key={entry.term}
                          className="flex items-baseline justify-between gap-[8px] border-b border-cf-border pb-[8px] last:border-b-0 last:pb-0"
                        >
                          <span className="min-w-0 cf-body-sm text-cf-ink [text-wrap:pretty] [overflow-wrap:anywhere]">
                            {entry.term}
                          </span>
                          <span className="whitespace-nowrap cf-label-sm text-cf-ink-muted">
                            {entry.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px] sm:col-span-2">
                  <span className="cf-label-sm uppercase text-cf-ink-muted">
                    {t.analysisPunctuation}
                  </span>
                  <div className="flex flex-col gap-[8px]">
                    {PUNCTUATION_ROWS.map(([key, labelKey]) => {
                      const value = punctuation?.[key] ?? null;
                      const percent = value != null ? Math.round(value) : 0;
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-[8px]"
                          data-voice-punctuation={key}
                        >
                          <span className="w-[132px] flex-none cf-caption text-cf-ink-muted">
                            {t[labelKey]}
                          </span>
                          <span
                            role="img"
                            aria-label={`${t[labelKey]}: ${
                              value != null
                                ? `${percent}%`
                                : t.analysisNoData
                            }`}
                            className="h-[4px] flex-1 overflow-hidden rounded-[4px] bg-cf-surface-subtle"
                          >
                            <span
                              className="block h-full rounded-[4px] bg-cf-accent"
                              style={{ width: `${percent}%` }}
                            />
                          </span>
                          <span className="w-[36px] flex-none text-end cf-label-sm text-cf-ink-muted">
                            {value != null
                              ? `${percent}%`
                              : t.analysisNoData}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {rejected.length > 0 ? (
                <div
                  className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px]"
                  data-voice-analysis-rejected="true"
                >
                  <p className="cf-label-sm uppercase text-cf-ink-muted">
                    {t.analysisRejectedTitle}
                  </p>
                  <p className="mt-[8px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                    {rejected
                      .map(
                        (row) =>
                          `${row.code} — ${t.analysisRejectedReasons[row.reason]}`
                      )
                      .join('; ')}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[8px]">
        <Button
          type="button"
          variant="primary"
          disabled={!ready}
          onClick={onContinue}
        >
          {t.analysisNext}
        </Button>
        {state === 'error' ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            {t.analysisRetry}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={state === 'restricted' || ready}
            onClick={onStop}
          >
            {t.analysisStop}
          </Button>
        )}
      </div>
    </section>
  );
}

export default VoiceAnalysisScreen;
