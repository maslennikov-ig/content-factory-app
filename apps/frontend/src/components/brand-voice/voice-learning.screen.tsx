'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Hint } from '@contentfactory/react/layout/hint';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * Чему аватар научился на том, что человек в его черновиках переписал.
 *
 * Блок на странице аватара, а не отдельный экран настроек: обучение — это
 * свойство вот этого аватара, и читать его надо там же, где паспорт голоса и
 * история версий. Третья дверь к одному объекту заставила бы человека помнить,
 * в каком из двух мест лежит какая половина ответа.
 *
 * Показывается всегда, в том числе когда учиться не на чем. Блок, исчезающий
 * при нуле, учит читателя, что механизма нет, — а он есть и копит материал
 * молча, и это ровно то, что человек должен понимать про свои правки.
 *
 * Ничего не переписывает. Кнопка запускает разбор правок и меняет правила
 * аватара; текст постов остаётся тем, каким человек его сохранил.
 */

export type LearnedRule = Readonly<{
  id: string;
  text: string;
  learnedAt: string;
  pairs: number;
}>;

export type VoiceLearningState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

export function VoiceLearningScreen({
  locale,
  state = 'default',
  pending,
  rules,
  minPairs,
  maxRules,
  canLearn = false,
  lastRunAt,
  learning = false,
  allowanceHint,
  failure,
  onLearn,
  onForget,
}: {
  locale: VoiceLocale;
  state?: VoiceLearningState;
  /** Существенные правки, накопившиеся после последнего разбора. */
  pending: number;
  rules: readonly LearnedRule[];
  minPairs: number;
  maxRules: number;
  canLearn?: boolean;
  /** Уже отформатированная дата последнего разбора, либо пусто. */
  lastRunAt?: string;
  /** Разбор идёт прямо сейчас. Знает только браузер. */
  learning?: boolean;
  /** Подсказка про остаток допуска, как у остальных платных кнопок. */
  allowanceHint?: ReactNode;
  /** Отказ последнего нажатия, словами сервера. */
  failure?: string;
  onLearn?: () => void;
  onForget?: (ruleId: string) => void;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const readOnly = state === 'restricted' || !canLearn;
  const ready = pending >= minPairs;

  return (
    <section
      data-voice-surface="learning"
      data-voice-state={state}
      data-voice-learning-pending={pending}
      aria-busy={busy || learning ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header>
        <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {t.learnTitle}
        </h2>
        <p className="mt-[4px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.learnLead}
        </p>
      </header>

      {state === 'error' || failure ? (
        <p
          role="alert"
          data-voice-learning-failure="true"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {failure ?? t.learnFailed}
        </p>
      ) : null}

      {state === 'success' ? (
        <p
          role="status"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {t.learnCap(maxRules)}
        </p>
      ) : null}

      {state === 'restricted' ? (
        <p className="rounded-[8px] border border-cf-border bg-cf-surface p-[12px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.learnRestricted}
        </p>
      ) : null}

      {/* Сколько накопилось. Число здесь всегда, включая ноль: «пока ничего»
          это состояние механизма, а не его отсутствие. */}
      <div
        data-voice-learning-counter="true"
        className={clsx(
          'flex min-w-0 flex-wrap items-center justify-between gap-[12px] rounded-[8px] border bg-cf-surface p-[12px]',
          ready ? 'border-cf-accent' : 'border-cf-border'
        )}
      >
        <div className="min-w-0">
          <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
            {pending === 0
              ? t.learnEmptyBody
              : ready
              ? t.learnReady(pending)
              : t.learnPending(pending, minPairs)}
          </p>
          <p className="mt-[4px] cf-caption text-cf-ink-muted">
            {lastRunAt ? t.learnLastRun(lastRunAt) : t.learnNever}
          </p>
        </div>

        {readOnly ? null : (
          <span className="flex flex-none items-center gap-[8px]">
            {allowanceHint}
            <Button
              type="button"
              variant="secondary"
              disabled={!ready || learning || busy}
              onClick={onLearn}
              data-voice-learning-run="true"
            >
              {learning ? t.learnBusy : t.learnNow}
            </Button>
            {/* Кнопка называет, что начнётся, а не что станет с голосом — это
                и есть вопрос, над которым человек медлит перед нажатием. */}
            <Hint side="start" label={t.hintFor(t.learnNow)}>
              {t.learnHint}
            </Hint>
          </span>
        )}
      </div>

      {rules.length === 0 ? (
        <div
          data-voice-learning-empty="true"
          className="rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
        >
          <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.learnEmpty}
          </h3>
          <p className="mt-[8px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.learnEmptyBody}
          </p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-[8px]">
          <h3 className="cf-label-sm uppercase text-cf-ink-muted">
            {t.learnRulesTitle}
          </h3>
          <ul className="flex min-w-0 flex-col gap-[8px]">
            {rules.map((rule) => (
              <li
                key={rule.id}
                data-voice-learned-rule={rule.id}
                className="flex min-w-0 flex-wrap items-start justify-between gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
              >
                <div className="min-w-0">
                  <p className="max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
                    {rule.text}
                  </p>
                  <p className="mt-[4px] cf-caption text-cf-ink-muted">
                    {t.learnRuleMeta(rule.pairs, rule.learnedAt)}
                  </p>
                </div>
                {readOnly ? null : (
                  <Button
                    type="button"
                    variant="quiet"
                    disabled={learning || busy}
                    onClick={() => onForget?.(rule.id)}
                  >
                    {t.learnForget}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="cf-caption text-cf-ink-muted">{t.learnCap(maxRules)}</p>
        </div>
      )}
    </section>
  );
}

export default VoiceLearningScreen;
