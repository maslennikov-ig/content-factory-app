'use client';

import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * What was not taken from someone else's writing, shown before consent.
 *
 * The tone is a calm account, not a warning. A person choosing this path has
 * done nothing wrong, and the screen's job is to make the boundary legible —
 * five categories, a count each, a few examples — so that agreeing to it is an
 * informed act rather than a click past a dialog.
 *
 * The one thing it must never say is that nothing leaked. A provably clean
 * separation of style from content does not exist, so the similarity line
 * reports a measurement and the sentence under it says exactly what that
 * measurement is worth. ADR-0011 makes this a rule rather than a preference.
 *
 * What stayed in the profile is shown as numbers, because numbers are all that
 * stayed: this screen is the reference renderer's output, and it has no field
 * a quote could occupy.
 */

export type RedactionCategory =
  | 'PERSON'
  | 'FACT_NUMBER'
  | 'LINK'
  | 'MENTION'
  | 'VERBATIM';

export type RedactionRow = Readonly<{
  category: RedactionCategory;
  occurrences: number;
  examples: readonly string[];
}>;

export type KeptMetric = Readonly<{ label: string; value: string }>;

export type VoiceRedactionsState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

const CATEGORY_ORDER: readonly RedactionCategory[] = [
  'PERSON',
  'FACT_NUMBER',
  'LINK',
  'MENTION',
  'VERBATIM',
];

const categoryLabel = (
  category: RedactionCategory,
  t: (typeof voiceCopy)['ru'] | (typeof voiceCopy)['en']
) =>
  ({
    PERSON: t.categoryPerson,
    FACT_NUMBER: t.categoryFactNumber,
    LINK: t.categoryLink,
    MENTION: t.categoryMention,
    VERBATIM: t.categoryVerbatim,
  }[category]);

export function VoiceRedactionsScreen({
  locale,
  state = 'default',
  redactions,
  kept,
  referenceCount,
  finishedAt,
  longestMatch,
  expandedCategory,
  consentGiven = false,
  onExpand,
  onConsentChange,
  onProceed,
  onChangeReference,
  notice,
}: {
  locale: VoiceLocale;
  state?: VoiceRedactionsState;
  redactions: readonly RedactionRow[];
  kept: readonly KeptMetric[];
  referenceCount: number;
  finishedAt: string;
  longestMatch: number;
  expandedCategory?: RedactionCategory;
  consentGiven?: boolean;
  onExpand?: (category: RedactionCategory) => void;
  onConsentChange?: (checked: boolean) => void;
  onProceed?: () => void;
  onChangeReference?: () => void;
  notice?: string;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const readOnly = state === 'restricted';

  return (
    <section
      data-voice-surface="redactions"
      data-voice-state={state}
      aria-busy={busy ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header>
        <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {t.redactionsTitle}
        </h2>
        <p className="mt-[4px] cf-caption text-cf-ink-muted">
          {t.redactionsSubtitle(referenceCount, finishedAt)}
        </p>
        <ol className="mt-[8px] flex flex-wrap gap-x-[16px] gap-y-[4px]">
          {[
            t.referenceStep1,
            t.referenceStep2,
            t.referenceStep3,
            t.referenceStep4,
          ].map((step, index) => (
            <li
              key={step}
              className={clsx(
                'cf-label-sm uppercase',
                index === 2 ? 'text-cf-accent' : 'text-cf-ink-muted'
              )}
            >
              {index + 1} {step}
            </li>
          ))}
        </ol>
      </header>

      {state === 'error' ? (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {notice ?? t.referenceUnreadable(4, referenceCount)}
        </p>
      ) : null}

      {state === 'disabled' ? (
        <p className="rounded-[8px] border border-cf-border bg-cf-surface p-[12px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.referenceDisabled}
        </p>
      ) : null}

      {state === 'success' ? (
        <p
          role="status"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          <span className="text-cf-ink">{t.consentRecorded}.</span>{' '}
          {t.consentRecordedBody}
        </p>
      ) : null}

      <p className="max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
        {t.redactionsLead}
      </p>

      {redactions.length === 0 ? (
        <div
          className="rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
          data-voice-redactions-empty="true"
        >
          <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.redactionsEmpty}
          </h3>
          {/* "Пустой список — тоже результат. Показываем его, а не прячем
              экран." A screen that disappears when it has nothing to report
              teaches the reader that the check is optional. */}
          <p className="mt-[8px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.redactionsEmptyBody}
          </p>
        </div>
      ) : (
        <ul className="flex min-w-0 flex-col gap-[8px]">
          {CATEGORY_ORDER.map((category) => {
            const row = redactions.find((one) => one.category === category);
            if (!row) return null;
            const expanded = expandedCategory === category;
            return (
              <li
                key={category}
                data-voice-redaction={category}
                data-voice-redaction-expanded={expanded ? 'true' : undefined}
                className={clsx(
                  'min-w-0 rounded-[8px] border bg-cf-surface p-[12px]',
                  expanded ? 'border-cf-accent' : 'border-cf-border'
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => onExpand?.(category)}
                  >
                    {categoryLabel(category, t)}
                  </Button>
                  <span className="cf-label-sm text-cf-ink-muted">
                    {t.categoryPlaces(row.occurrences)}
                  </span>
                </div>

                {row.examples.length > 0 ? (
                  <ul className="mt-[8px] flex flex-wrap gap-[8px]">
                    {row.examples.map((example) => (
                      <li
                        key={example}
                        className="rounded-[4px] border border-cf-border bg-cf-surface-subtle px-[8px] py-[4px] cf-caption text-cf-ink-muted"
                      >
                        {example}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {category === 'FACT_NUMBER' ? (
                  <p className="mt-[8px] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                    {t.factNumberNote}
                  </p>
                ) : null}
                {category === 'VERBATIM' ? (
                  <p className="mt-[8px] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                    {t.verbatimNote}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid min-w-0 gap-[12px] sm:grid-cols-2">
        <div className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[12px]">
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {t.keptTitle}
          </p>
          <dl className="mt-[8px] flex flex-wrap gap-x-[24px] gap-y-[8px]">
            {kept.map((metric) => (
              <div key={metric.label}>
                <dt className="cf-caption text-cf-ink-muted">
                  {metric.label}
                </dt>
                <dd className="mt-[4px] cf-label-md text-cf-ink">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[12px]">
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {t.similarityTitle}
          </p>
          <p className="mt-[8px] cf-body-sm text-cf-ink [text-wrap:pretty]">
            {t.similarityBody(longestMatch)}
          </p>
          {/* The sentence the product is never allowed to leave out. */}
          <p className="mt-[8px] cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {t.similarityNoPromise}
          </p>
        </div>
      </div>

      {readOnly ? null : (
        <div className="flex min-w-0 flex-col gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
          <CheckboxField
            checked={consentGiven}
            disabled={state === 'disabled'}
            onChange={(event) => onConsentChange?.(event.target.checked)}
            label={
              <span className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                {t.consentRead}
              </span>
            }
          />
          <div className="flex flex-wrap gap-[8px]">
            <Button
              type="button"
              variant="primary"
              // Consent is its own action, recorded before activation. A
              // checkbox nobody had to tick is a dialog nobody read.
              disabled={!consentGiven || state === 'disabled'}
              onClick={onProceed}
            >
              {t.proceed}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onChangeReference}
            >
              {t.changeReference}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
