'use client';

import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * The radar and the brief, and the gate between them and a draft.
 *
 * The design did not draw these two: they are the last step of the target
 * cycle and were only worth building once voice and sources were in use. So
 * this is written in the system's language rather than invented — the same
 * cards, the same empty state that is not a failure, the same rule that a
 * refusal explains itself.
 *
 * What it refuses is the interesting part. A model asked to write about a
 * topic with no substance produces something fluent, because that is what it
 * is for, and the result reads like content and says nothing. So the gate
 * answers with the missing question instead of a paragraph, and one of those
 * questions is always "what could somebody disagree with here" — a piece
 * nobody could argue with is a piece nobody needed.
 */

export type RadarTopic = Readonly<{
  id: string;
  title: string;
  score: number;
  evidenceCount: number;
  reasons: readonly string[];
}>;

export type BriefQuestionRow = Readonly<{ field: string; question: string }>;

export type VoiceBriefState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

export function VoiceBriefScreen({
  locale,
  state = 'default',
  topics,
  selectedTopicId,
  brief,
  questions,
  ungroundedFacts = [],
  onPick,
  onCreateDraft,
  notice,
}: {
  locale: VoiceLocale;
  state?: VoiceBriefState;
  topics: readonly RadarTopic[];
  selectedTopicId?: string;
  brief?: Readonly<Record<string, string>>;
  questions: readonly BriefQuestionRow[];
  ungroundedFacts?: readonly string[];
  onPick?: (id: string) => void;
  onCreateDraft?: () => void;
  notice?: string;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const ready = questions.length === 0;

  return (
    <section
      data-voice-surface="brief"
      data-voice-state={state}
      data-voice-brief-ready={ready ? 'true' : 'false'}
      aria-busy={busy ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header>
        <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {t.radarTitle}
        </h2>
        <p className="mt-[4px] cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {t.radarSubtitle}
        </p>
      </header>

      {state === 'error' ? (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {notice ??
            (locale === 'ru'
              ? 'Радар не собрался. Бриф и его ответы сохранены.'
              : 'The radar did not build. The brief and its answers are kept.')}
        </p>
      ) : null}

      {state === 'success' ? (
        <p
          role="status"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {t.briefReadyNote}
        </p>
      ) : null}

      {topics.length === 0 ? (
        <div
          className="rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
          data-voice-radar-empty="true"
        >
          <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.radarEmptyTitle}
          </h3>
          <p className="mt-[8px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.radarEmptyBody}
          </p>
        </div>
      ) : (
        <ul className="grid min-w-0 gap-[12px] lg:grid-cols-2">
          {topics.map((topic) => (
            <li
              key={topic.id}
              data-voice-topic={topic.id}
              data-voice-topic-picked={
                selectedTopicId === topic.id ? 'true' : undefined
              }
              className={clsx(
                'min-w-0 rounded-[8px] border bg-cf-surface p-[12px]',
                selectedTopicId === topic.id
                  ? 'border-cf-accent bg-cf-accent-soft'
                  : 'border-cf-border'
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
                <h3 className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                  {topic.title}
                </h3>
                <span className="cf-label-sm text-cf-ink-muted">
                  {t.radarEvidence} {topic.evidenceCount}
                </span>
              </div>
              <p className="mt-[8px] cf-label-sm uppercase text-cf-ink-muted">
                {t.radarWhy}
              </p>
              {/* The reason, not only the score. A ranking nobody can argue
                  with is the same failure the gate below prevents, one step
                  earlier. */}
              <ul className="mt-[4px] flex flex-col gap-[4px]">
                {topic.reasons.map((reason) => (
                  <li key={reason} className="cf-caption text-cf-ink-muted">
                    · {reason}
                  </li>
                ))}
              </ul>
              {state === 'restricted' ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-[12px]"
                  onClick={() => onPick?.(topic.id)}
                >
                  {t.radarPick}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
        <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {t.briefTitle}
        </h3>
        <p className="mt-[4px] cf-caption text-cf-ink-muted">
          {t.briefSubtitle}
        </p>

        {brief ? (
          <dl className="mt-[16px] grid gap-[12px] sm:grid-cols-2">
            {[
              ['goal', t.briefGoal],
              ['thesis', t.briefThesis],
              ['channel', t.briefChannel],
              ['format', t.briefFormat],
              ['position', t.briefPosition],
              ['disagreement', t.briefDisagreement],
              ['audience', t.briefAudience],
            ].map(([key, label]) =>
              brief[key] ? (
                <div key={key} className="min-w-0">
                  <dt className="cf-label-sm uppercase text-cf-ink-muted">
                    {label}
                  </dt>
                  <dd className="mt-[4px] cf-body-sm text-cf-ink [text-wrap:pretty]">
                    {brief[key]}
                  </dd>
                </div>
              ) : null
            )}
          </dl>
        ) : null}

        {ready ? null : (
          <div
            className="mt-[16px] rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[12px]"
            data-voice-brief-blocked="true"
          >
            <p className="cf-label-sm uppercase text-cf-ink">
              {t.briefBlockedTitle}
            </p>
            <p className="mt-[8px] max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
              {t.briefBlockedBody}
            </p>
            <ul className="mt-[12px] flex flex-col gap-[8px]">
              {questions.map((row) => (
                <li
                  key={row.field}
                  data-voice-brief-question={row.field}
                  className="cf-body-sm text-cf-ink [text-wrap:pretty]"
                >
                  {row.question}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ungroundedFacts.length > 0 ? (
          <div className="mt-[12px]" data-voice-brief-ungrounded="true">
            <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
              {t.briefUngrounded}
            </p>
            <ul className="mt-[4px] flex flex-col gap-[4px]">
              {ungroundedFacts.map((fact) => (
                <li key={fact} className="cf-body-sm text-cf-ink-muted">
                  «{fact}»
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button
          type="button"
          variant="primary"
          className="mt-[16px]"
          // The gate. Not a warning next to an enabled button: a draft built
          // from nothing reads like content and says nothing, and nobody
          // notices until it is published.
          disabled={!ready || state === 'disabled' || state === 'restricted'}
          onClick={onCreateDraft}
        >
          {t.briefReady}
        </Button>
      </div>
    </section>
  );
}
