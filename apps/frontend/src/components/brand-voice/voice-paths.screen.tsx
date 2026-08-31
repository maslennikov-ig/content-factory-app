'use client';

import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * Three ways to get a voice, offered as equals.
 *
 * The third one explains itself before it is chosen, and that is the whole
 * reason it looks different from the other two. "Взять манеру у автора"
 * without the two columns beside it reads as "write as this person", which is
 * the thing ADR-0011 says the product must never offer. Listing what is taken
 * and what is not, before the click, is how the boundary reaches the person
 * who is about to cross it.
 *
 * Which is why the reference path can be switched off by policy and the other
 * two cannot: an organisation may decide it does not want that door at all.
 */

export type VoicePath = 'manual' | 'own' | 'reference';

export type VoicePathsState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

export type VoicePathsAvailability = Readonly<{
  manual: boolean;
  own: boolean;
  reference: boolean;
}>;

const ALL_AVAILABLE: VoicePathsAvailability = {
  manual: true,
  own: true,
  reference: true,
};

function PathCard({
  index,
  title,
  body,
  recommended,
  selected,
  disabled,
  disabledReason,
  action,
  facts,
  columns,
  onChoose,
  locale,
}: {
  index: number;
  title: string;
  body: string;
  recommended?: boolean;
  selected?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  action: string;
  facts?: { label: string; value: string }[];
  columns?: { heading: string; items: readonly string[]; tone: 'take' | 'leave' }[];
  onChoose?: () => void;
  locale: VoiceLocale;
}) {
  const t = voiceCopy[locale];
  return (
    <article
      data-voice-path-index={index}
      data-voice-path-selected={selected ? 'true' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      className={clsx(
        'flex flex-col rounded-[8px] border bg-cf-surface p-[16px]',
        selected
          ? 'border-cf-accent bg-cf-accent-soft'
          : 'border-cf-border',
        disabled && 'opacity-60'
      )}
    >
      <div className="flex flex-wrap items-center gap-[8px]">
        <span className="cf-label-sm uppercase text-cf-ink-muted">
          {t.path} {index}
        </span>
        {recommended ? (
          <span className="rounded-[4px] border border-cf-accent px-[8px] py-[4px] cf-label-sm uppercase text-cf-accent">
            {t.recommended}
          </span>
        ) : null}
        {selected ? (
          // Selection is a border, a fill and a word. Colour alone would leave
          // the choice invisible to a reader who cannot see the hue.
          <span className="cf-label-sm uppercase text-cf-accent">✓</span>
        ) : null}
      </div>

      <h3 className="mt-[12px] cf-heading-md text-cf-ink [text-wrap:balance]">
        {title}
      </h3>
      <p className="mt-[8px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {body}
      </p>

      {facts ? (
        <dl className="mt-[16px] flex flex-wrap gap-x-[24px] gap-y-[8px]">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="cf-label-sm uppercase text-cf-ink-muted">
                {fact.label}
              </dt>
              <dd className="mt-[4px] cf-body-sm text-cf-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {columns ? (
        <div className="mt-[16px] grid gap-[12px] sm:grid-cols-2">
          {columns.map((column) => (
            <div
              key={column.heading}
              data-voice-column={column.tone}
              className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px]"
            >
              <p
                className={clsx(
                  'cf-label-sm uppercase',
                  column.tone === 'take' ? 'text-cf-accent' : 'text-cf-ink-muted'
                )}
              >
                {column.heading}
              </p>
              <ul className="mt-[8px] flex flex-col gap-[4px]">
                {column.items.map((item) => (
                  <li key={item} className="cf-body-sm text-cf-ink">
                    {column.tone === 'take' ? '+ ' : '− '}
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {disabled && disabledReason ? (
        <p className="mt-[16px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {disabledReason}
        </p>
      ) : null}

      <div className="mt-[16px] flex grow items-end">
        <Button
          type="button"
          onClick={onChoose}
          disabled={disabled}
          variant="secondary"
        >
          {action}
        </Button>
      </div>
    </article>
  );
}

export function VoicePathsScreen({
  locale,
  state = 'default',
  selected,
  available = ALL_AVAILABLE,
  disabledReasons,
  onChoose,
  onCancel,
}: {
  locale: VoiceLocale;
  state?: VoicePathsState;
  selected?: VoicePath;
  available?: VoicePathsAvailability;
  disabledReasons?: Partial<Record<VoicePath, string>>;
  onChoose?: (path: VoicePath) => void;
  onCancel?: () => void;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const long = state === 'long-content';

  return (
    <section
      data-voice-surface="paths"
      data-voice-state={state}
      aria-busy={busy ? 'true' : undefined}
      className="flex flex-col gap-[20px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-[12px]">
        <div>
          <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.pathsTitle}
          </h2>
          <p className="mt-[4px] cf-caption text-cf-ink-muted">{t.pathsStep}</p>
        </div>
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
        >
          {t.cancel}
        </Button>
      </header>

      <p className="max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
        {t.pathsLead}
      </p>

      {state === 'error' ? (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {locale === 'ru'
            ? 'Мастер не запустился. Выбор пути сохранён — попробуйте ещё раз.'
            : 'The wizard did not start. Your choice was kept — try again.'}
        </p>
      ) : null}

      {state === 'success' ? (
        <p
          role="status"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {locale === 'ru'
            ? 'Черновик голоса создан.'
            : 'A draft voice has been created.'}
        </p>
      ) : null}

      <div className="grid gap-[16px] lg:grid-cols-3">
        <PathCard
          locale={locale}
          index={1}
          title={t.manualTitle}
          body={t.manualBody}
          selected={selected === 'manual'}
          disabled={!available.manual}
          disabledReason={disabledReasons?.manual}
          action={t.manualTitle}
          facts={[
            { label: t.labelTime, value: t.manualTime },
            { label: t.labelNeedsTexts, value: t.manualNeeds },
            { label: t.labelFields, value: t.manualFields },
          ]}
          onChoose={() => onChoose?.('manual')}
        />
        <PathCard
          locale={locale}
          index={2}
          title={t.ownTitle}
          body={t.ownBody}
          recommended
          selected={selected === 'own'}
          disabled={!available.own}
          disabledReason={disabledReasons?.own}
          action={t.ownTitle}
          facts={[
            { label: t.labelTime, value: t.ownTime },
            { label: t.labelNeedsChars, value: t.ownNeeds },
            { label: t.labelSources, value: t.ownSources },
          ]}
          onChoose={() => onChoose?.('own')}
        />
        <PathCard
          locale={locale}
          index={3}
          title={
            long
              ? `${t.referenceTitle}${
                  locale === 'ru'
                    ? ', включая разбор пунктуации и порядка слов'
                    : ', including punctuation and word order'
                }`
              : t.referenceTitle
          }
          body={t.referenceBody}
          selected={selected === 'reference'}
          disabled={!available.reference}
          disabledReason={disabledReasons?.reference}
          action={t.nameAuthor}
          columns={[
            {
              heading: t.referenceTake,
              items: t.referenceTakeItems,
              tone: 'take',
            },
            {
              heading: t.referenceLeave,
              items: t.referenceLeaveItems,
              tone: 'leave',
            },
          ]}
          onChoose={() => onChoose?.('reference')}
        />
      </div>

      <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
        {t.pathsFooter}
      </p>
    </section>
  );
}
