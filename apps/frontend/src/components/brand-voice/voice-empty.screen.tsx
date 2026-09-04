'use client';

import { Button } from '@contentfactory/react/form/button';

import type { ReactNode } from 'react';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * The Content section before a voice exists.
 *
 * Deliberately not an error state. A workspace with no profile generates in an
 * explicit neutral style, which is a working mode — the design says so in the
 * one sentence worth keeping verbatim: "Пока голоса нет, тексты собираются
 * нейтральным стилем. Это рабочий режим, а не ошибка." No alert role, no
 * warning colour, no exclamation mark.
 *
 * The second thing it does is say what a brand voice *is*, because the person
 * seeing this screen has usually never had one and the phrase alone does not
 * explain itself.
 */

/**
 * All nine review states, because the screen has to *report* the state it is
 * in even where it renders the same thing. A surface that quietly falls back
 * to `default` makes a review of the other eight a review of one.
 */
export type VoiceEmptyState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

export function VoiceEmptyScreen({
  locale,
  state = 'default',
  onCreate,
  onExample,
  onContinue,
  collected,
  note,
}: {
  locale: VoiceLocale;
  state?: VoiceEmptyState;
  onCreate?: () => void;
  onExample?: () => void;
  onContinue?: () => void;
  /**
   * What is already in the corpus, when a collection was started and left.
   *
   * The wizard promises «после сбора можно вернуться и выбрать другой путь —
   * образцы сохраняются», and this screen answered a reload with «Аватара пока
   * нет» and nothing else — so eight collected samples read as lost work
   * (`content-factory-next-fn33.45`). Absent, and not zero, when nothing has
   * been collected: zero would be a claim that the corpus was looked at.
   */
  collected?: { sampleCount: number; charCount: number };
  /** A single line the host may add, e.g. why creating is unavailable. */
  note?: ReactNode;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const blocked = state === 'restricted' || state === 'disabled';

  return (
    <section
      data-voice-surface="empty"
      data-voice-state={state}
      aria-busy={busy ? 'true' : undefined}
      className="rounded-[8px] border border-cf-border bg-cf-surface p-[20px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
        {t.emptyTitle}
      </h2>
      <p className="mt-[8px] max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
        {t.emptyBody}
      </p>
      <p className="mt-[12px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {t.emptyWhatItIs}
      </p>

      {note ? (
        <p
          // A failure has to announce itself; the other notes must not, or a
          // screen reader would hear "alert" every time a profile is merely
          // absent — which is the working mode this screen exists to state.
          role={state === 'error' ? 'alert' : undefined}
          className={
            state === 'error'
              ? 'mt-[16px] max-w-[72ch] rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]'
              : 'mt-[16px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]'
          }
          data-voice-note="true"
        >
          {note}
        </p>
      ) : null}

      {collected && collected.sampleCount > 0 ? (
        <p
          data-voice-empty-collected={String(collected.sampleCount)}
          className="mt-[16px] max-w-[72ch] rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {t.emptyCollected(collected.sampleCount, collected.charCount)}
        </p>
      ) : null}

      <div className="mt-[20px] flex flex-wrap gap-[8px]">
        {collected && collected.sampleCount > 0 ? (
          <Button
            type="button"
            onClick={onContinue}
            disabled={busy || blocked}
            variant="primary"
          >
            {t.emptyContinue}
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={onCreate}
          disabled={busy || blocked}
          variant={
            collected && collected.sampleCount > 0 ? 'secondary' : 'primary'
          }
        >
          {t.createVoice}
        </Button>
        <Button
          type="button"
          onClick={onExample}
          disabled={busy}
          variant="secondary"
        >
          {t.seeExample}
        </Button>
      </div>
    </section>
  );
}
