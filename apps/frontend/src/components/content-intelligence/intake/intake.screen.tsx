'use client';

import type { ReactNode } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import {
  PicksSocialsView,
  type ChannelPickerIntegration,
} from '../../new-launch/picks.socials.component';
import {
  EmptyState,
  ErrorState,
  RestrictedState,
  Status,
} from '../../ui/surface';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import { BriefReceipt, type BriefOverrides } from './brief.receipt';
import { QuestionsCard } from './questions.card';
import { SlopFindings } from './slop-findings';
import type {
  BriefField,
  BriefFilledV1,
  IntakeBlockReason,
  IntakeInputKindV1,
  IntakeQuestionV1,
  IntakeScreenState,
  ReceiptField,
} from './intake.adapter';

/**
 * Экран «Написать из мысли»: одно поле, каналы, кнопка и результат.
 *
 * Рисует и ничего не просит. Ни одного `fetch`, ни одного SWR-ключа: всё
 * состояние приходит сверху от `intake.container.tsx`, и это тот же раздел
 * ответственности, что у `voice-brief.screen.tsx` рядом. Стенд
 * `/interface-review` открывает этот файл во всех девяти состояниях без сети
 * именно поэтому.
 *
 * Три вещи в разметке — решения, а не оформление.
 *
 * Строка «похоже на ссылку» появляется только для URL и живёт в
 * `role="status"`: она сообщает о том, что продукт сейчас сделает иначе
 * (прочитает страницу), и человек, который не смотрит на экран, должен об
 * этом услышать. Для мысли и чужого поста строки нет — экран не гадает вслух.
 *
 * Причина, по которой «Написать» не нажимается, стоит рядом с кнопкой
 * текстом, а не всплывающей подсказкой: правило системы — выключенный
 * элемент объясняет себя, и объяснение это текст.
 *
 * Результат — две колонки: слева текст, справа квитанция и находки. Текст
 * шире (3:2), потому что читают его, а не расписку; на узком экране колонки
 * встают друг под друга, и первым остаётся текст.
 */

export type IntakeChannel = ChannelPickerIntegration & {
  contentLanguage?: 'en' | 'ru';
};

export function IntakeScreen({
  locale,
  state,
  input,
  inputKind,
  detectedLink,
  channels,
  selectedIds,
  language,
  step,
  questions,
  brief,
  overrides,
  kindOverride,
  draftText,
  draftPlatform,
  blocked,
  errorTitle,
  errorMessage,
  notice,
  restrictedReason,
  readOnlyNote,
  roundsSpent,
  slopKey,
  onInputChange,
  onToggleChannel,
  onLanguageChange,
  onWrite,
  onCancel,
  onAnswer,
  onOverride,
  onKindChange,
  onRevertOverrides,
  onRebuild,
  onOpenEditor,
  onOpenWritingProfile,
  onManual,
  onRetry,
  writingProfileStored,
}: {
  locale: IntakeLocale;
  state: IntakeScreenState;
  input: string;
  inputKind: IntakeInputKindV1 | null;
  detectedLink: boolean;
  channels: readonly IntakeChannel[];
  selectedIds: readonly string[];
  language: 'ru' | 'en';
  step: string | null;
  questions: readonly IntakeQuestionV1[];
  brief: BriefFilledV1 | null;
  overrides: BriefOverrides;
  kindOverride?: IntakeInputKindV1;
  draftText: string | null;
  draftPlatform?: string;
  blocked: IntakeBlockReason;
  errorTitle?: string;
  errorMessage?: string;
  notice?: string | null;
  restrictedReason: ReactNode;
  readOnlyNote?: ReactNode;
  roundsSpent: boolean;
  /** Меняется на каждую пересборку: находки прошлого текста стираются вместе с ним. */
  slopKey: string;
  onInputChange: (value: string) => void;
  onToggleChannel: (integration: ChannelPickerIntegration) => void;
  onLanguageChange: (language: 'ru' | 'en') => void;
  onWrite: () => void;
  onCancel: () => void;
  onAnswer: (
    answers: readonly { field: BriefField; text: string }[],
    decide: readonly BriefField[]
  ) => void;
  onOverride: (field: ReceiptField, value: string) => void;
  onKindChange: (kind: IntakeInputKindV1) => void;
  onRevertOverrides: () => void;
  onRebuild: () => void;
  onOpenEditor: () => void;
  onOpenWritingProfile: (integrationId: string) => void;
  onManual?: () => void;
  onRetry: () => void;
  writingProfileStored: Readonly<Record<string, boolean>>;
}) {
  const t = intakeCopy[locale];
  const busy = state === 'streaming';
  const receiptDirty =
    Object.keys(overrides).length > 0 ||
    (kindOverride !== undefined && brief !== null && kindOverride !== brief.inputKind);

  const blockedWord =
    blocked === 'input'
      ? t.blockedNoInput
      : blocked === 'channel'
      ? t.blockedNoChannel
      : blocked === 'checking'
      ? t.blockedChecking
      : null;

  const telegramChannels = channels.filter(
    (channel) =>
      channel.identifier === 'telegram' && selectedIds.includes(channel.id)
  );

  return (
    <section
      data-content-panel="intake"
      data-intake-state={state}
      data-intake-kind={kindOverride ?? inputKind ?? 'unknown'}
      aria-busy={busy}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header className="flex min-w-0 flex-col gap-[4px]">
        <h2 className="cf-heading-lg text-cf-ink [text-wrap:balance]">
          {t.title}
        </h2>
        <p className="max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
          {t.lead}
        </p>
      </header>

      {state === 'checking' ? (
        <p role="status" className="cf-body-sm text-cf-ink-muted">
          {t.blockedChecking}
        </p>
      ) : state === 'restricted' ? (
        <RestrictedState title={t.restrictedTitle} reason={restrictedReason} />
      ) : state === 'no-channel' ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyBody}
          action={
            // Обычная ссылка, а не кнопка с `router.push`: это переход в
            // другой раздел, и он должен открываться средним щелчком и
            // копироваться, как всякий адрес.
            <a
              href="/launches"
              className="inline-flex items-center rounded-[8px] border border-cf-border-control px-[16px] py-[8px] cf-label-md text-cf-ink transition-colors duration-state hover:bg-cf-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus motion-reduce:transition-none"
            >
              {t.emptyAction}
            </a>
          }
        />
      ) : (
        <>
          {readOnlyNote}

          <fieldset
            disabled={state === 'read-only'}
            className="contents min-w-0"
          >
            <div className="flex min-w-0 flex-col gap-[4px]">
              <label
                htmlFor="intake-input"
                className="cf-label-sm uppercase text-cf-ink-muted"
              >
                {t.inputLabel}
              </label>
              <Textarea
                standalone
                layout="content"
                id="intake-input"
                name="intake-input"
                aria-label={t.inputLabel}
                placeholder={t.inputPlaceholder}
                className="w-full"
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
              />
              {detectedLink && (
                <p
                  role="status"
                  data-intake-kind-line="link"
                  className="max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]"
                >
                  {t.kindLink}
                </p>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-[8px]">
              <p className="cf-label-sm uppercase text-cf-ink-muted">
                {t.channelsLabel}
              </p>
              <PicksSocialsView
                label={t.channelsLabel}
                integrations={channels}
                selectedIds={selectedIds}
                /*
                  `react-tooltip` здесь не поднимается: имя канала уже стоит в
                  `aria-label` кнопки, а подсказка ради того же имени — это
                  библиотека, которую платит вся страница.
                */
                toolTip={false}
                onToggle={onToggleChannel}
              />
              <p className="max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.channelsHint}
              </p>
              {/*
                Дверь в карточку канала стоит там, где канал выбран, а не в
                настройках: человек как раз решает, что и куда написать.
                Только у Telegram — в этой волне карточка есть у него одного,
                и ссылка на пустоту хуже её отсутствия.
              */}
              {telegramChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex flex-wrap items-center gap-[8px]"
                >
                  <Button
                    type="button"
                    variant="quiet"
                    density="dense"
                    data-intake-writing-profile={channel.id}
                    onClick={() => onOpenWritingProfile(channel.id)}
                  >
                    {t.writingProfileLink(channel.name)}
                  </Button>
                  <Status tone={writingProfileStored[channel.id] ? 'accent' : 'neutral'}>
                    {writingProfileStored[channel.id]
                      ? t.writingProfileStored
                      : t.writingProfileDefault}
                  </Status>
                </div>
              ))}
            </div>

            <div className="flex min-w-0 flex-col gap-[4px] sm:max-w-[280px]">
              <label
                htmlFor="intake-language"
                className="cf-label-sm uppercase text-cf-ink-muted"
              >
                {t.languageLabel}
              </label>
              <Select
                standalone
                id="intake-language"
                name="intake-language"
                aria-label={t.languageLabel}
                value={language}
                onChange={(event) =>
                  onLanguageChange(event.target.value as 'ru' | 'en')
                }
              >
                <option value="ru">{t.languageRu}</option>
                <option value="en">{t.languageEn}</option>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-[8px]">
              <Button
                type="button"
                variant="primary"
                disabled={busy || blocked !== null || state === 'read-only'}
                onClick={onWrite}
              >
                {busy ? t.writing : t.write}
              </Button>
              {busy && (
                <Button type="button" variant="secondary" onClick={onCancel}>
                  {t.cancel}
                </Button>
              )}
              {blockedWord && !busy && (
                <p
                  role="status"
                  data-intake-block-reason={blocked}
                  className="cf-caption text-cf-ink-muted"
                >
                  {blockedWord}
                </p>
              )}
            </div>
          </fieldset>

          {/*
            Шаг стрима: одна строка, которая меняется. `aria-live="polite"`
            и `data-intake-step` на одном узле — человек слышит, что работа
            идёт, а не гадает по крутящемуся кружку.
          */}
          {step && (
            <p
              aria-live="polite"
              data-intake-step={step}
              className="cf-body-sm text-cf-ink-muted"
            >
              {step === 'claims'
                ? t.stepClaims
                : step === 'search'
                ? t.stepSearch
                : step === 'writing'
                ? t.stepWriting
                : t.stepStarted}
            </p>
          )}

          {state === 'questions' && questions.length > 0 && (
            <QuestionsCard
              locale={locale}
              questions={questions}
              busy={busy}
              onSubmit={onAnswer}
              onManual={onManual}
            />
          )}

          {/*
            Третьего круга нет. Два уточнения — предел решения владельца, и
            вместо третьего вопроса экран честно предлагает два выхода:
            ручную форму брифа и добавление факта. Это не отказ, это конец
            расспросов.
          */}
          {roundsSpent && (
            <section
              data-intake-rounds-spent="true"
              className="flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[16px]"
            >
              <p className="cf-label-md text-cf-ink">{t.roundsSpentTitle}</p>
              <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {t.roundsSpentBody}
              </p>
              {onManual && (
                <div className="flex flex-wrap gap-[8px]">
                  <Button type="button" variant="secondary" onClick={onManual}>
                    {t.manualForm}
                  </Button>
                </div>
              )}
            </section>
          )}

          {state === 'error' && (
            <ErrorState
              title={errorTitle ?? t.errorTitle}
              description={errorMessage ?? t.errorFallback}
              action={
                <Button type="button" variant="secondary" onClick={onRetry}>
                  {t.retry}
                </Button>
              }
            />
          )}

          {notice && (
            <p role="status" className="cf-body-sm text-cf-accent">
              {notice}
            </p>
          )}

          {draftText !== null && brief && (
            <div className="grid min-w-0 gap-[16px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="flex min-w-0 flex-col gap-[8px]">
                <h3 className="cf-heading-md text-cf-ink">{t.draftTitle}</h3>
                <article
                  data-intake-draft="true"
                  className="min-w-0 whitespace-pre-wrap rounded-[8px] border border-cf-border bg-cf-surface p-[16px] cf-body-md text-cf-ink [text-wrap:pretty]"
                >
                  {draftText}
                </article>
                <div className="flex flex-wrap gap-[8px]">
                  <Button type="button" variant="primary" onClick={onOpenEditor}>
                    {t.openInEditor}
                  </Button>
                  {receiptDirty && (
                    <Button type="button" variant="secondary" onClick={onRebuild}>
                      {t.rebuild}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-[16px]">
                <BriefReceipt
                  locale={locale}
                  brief={brief}
                  overrides={overrides}
                  kindOverride={kindOverride}
                  readOnly={state === 'read-only'}
                  onOverride={onOverride}
                  onKindChange={onKindChange}
                  onRevert={onRevertOverrides}
                />
                <SlopFindings
                  key={slopKey}
                  locale={locale}
                  text={draftText}
                  platform={draftPlatform}
                />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default IntakeScreen;
