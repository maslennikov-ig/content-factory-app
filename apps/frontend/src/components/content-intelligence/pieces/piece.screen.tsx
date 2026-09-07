'use client';

import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { Segmented } from '../../ui/segmented';
import {
  EmptyState,
  ErrorState,
  RestrictedState,
  SkeletonRows,
  Status,
} from '../../ui/surface';
import { voiceCopy } from '../../brand-voice/voice-copy';
import { BriefReceipt } from '../intake/brief.receipt';
import { SlopFindings } from '../intake/slop-findings';
import { SuggestedQuestionsCard } from '../intake/questions.card';
import { DraftResult } from '../shared/draft-result';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import { stateWord } from './adaptation.cell';
import type {
  AdaptationKindV1,
  AdaptationV1,
  PieceDetailV1,
  PieceQuestionV1,
  VoiceScreenStateV1,
} from './pieces.adapter';

/**
 * Страница заготовки: суть слева, квитанция справа, адаптации под ними.
 *
 * §11.8 карты раздела, решение владельца 06.09.2026. Экран рисует и ничего не
 * просит — весь стрим, все запросы и все отказы живут в
 * `piece.container.tsx`.
 *
 * Четыре места, где эту страницу легче всего сделать неправильно.
 *
 * **Проверка на штампы уже считана.** Она снята при создании сути, а не по
 * кнопке, и лежит рядом с текстом. Вердикт `rewrite` ничего не запрещает:
 * страница говорит совет вслух и оставляет «Адаптировать» нажимаемым — это
 * совет, а не ворота.
 *
 * **Старый материал не притворяется сутью.** У материала до этой волны тело —
 * HTML одного канала, и над ним стоит предупреждение: адаптация будет
 * опираться на него как есть.
 *
 * **Площадка без канала выключена с причиной и ссылкой на каналы.** Отказ до
 * нажатия, а не ошибка после — то же правило, что у клетки таблицы.
 *
 * **Видео и аудио — строка «позже», а не выключенные кнопки.** Выключенная
 * кнопка обещает, что скоро включится; строка честно говорит, что этого
 * сейчас нет.
 *
 * **Вид адаптации выбирает человек, а не первая строка списка.** Пока
 * площадка умеет один вид, выбора нет и спрашивать нечего. Умеет несколько —
 * рядом с «Адаптировать» стоит полоса `Segmented`, и до запроса видно, что
 * именно сейчас напишется: подпись или статья — это два разных текста, и
 * «первый из списка» здесь был решением экрана за человека.
 */

export function PieceScreen({
  locale,
  state,
  detail,
  canWrite,
  busy,
  step,
  questions,
  draftText,
  draftPlatform,
  adaptingChannel,
  errorMessage,
  notice,
  restrictedReason,
  readOnlyNote,
  onAdapt,
  onArchive,
  onAnswer,
  onSkipInterview,
  onCancel,
  onOpenPost,
  onDeleteAdaptation,
  onOpenEditor,
  onRetry,
}: {
  locale: PiecesLocale;
  state: VoiceScreenStateV1;
  detail: PieceDetailV1 | null;
  canWrite: boolean;
  busy: boolean;
  step: string | null;
  questions: readonly PieceQuestionV1[];
  draftText: string | null;
  draftPlatform?: string;
  /** Канал, под который идёт адаптация прямо сейчас. */
  adaptingChannel: string | null;
  errorMessage?: string;
  notice?: string | null;
  restrictedReason?: ReactNode;
  readOnlyNote?: ReactNode;
  onAdapt: (channelId: string, kind: AdaptationKindV1) => void;
  onArchive: () => void;
  onAnswer: (
    answers: readonly { key: string; text: string; origin: 'person' | 'confirmed' }[],
    decideKeys: readonly string[]
  ) => void;
  onSkipInterview: () => void;
  onCancel: () => void;
  onOpenPost: (adaptation: AdaptationV1) => void;
  onDeleteAdaptation: (adaptation: AdaptationV1) => void;
  onOpenEditor: () => void;
  onRetry: () => void;
}) {
  const t = piecesCopy[locale];
  const v = voiceCopy[locale];

  /*
    Выбранный вид — по площадке, а не один на страницу: Instagram и сайт
    отвечают на разные вопросы, и общий выбор перепрыгивал бы между ними.
    Пусто — значит человек ещё не выбирал, и берётся первый вид площадки.
  */
  const [chosenKinds, setChosenKinds] = useState<
    Readonly<Record<string, AdaptationKindV1>>
  >({});

  const kindWord = (kind: AdaptationKindV1) =>
    kind === 'caption'
      ? t.kindCaption
      : kind === 'article'
      ? t.kindArticle
      : kind === 'newsletter'
      ? t.kindNewsletter
      : kind === 'video'
      ? t.kindVideo
      : kind === 'audio'
      ? t.kindAudio
      : t.kindPost;

  if (state === 'restricted') {
    return (
      <section data-content-panel="piece" data-piece-state={state}>
        <RestrictedState title={t.restrictedTitle} reason={restrictedReason} />
      </section>
    );
  }

  if (state === 'loading' || !detail) {
    return (
      <section
        data-content-panel="piece"
        data-piece-state={state}
        aria-busy="true"
      >
        {state === 'error' ? (
          <ErrorState
            title={t.pieceErrorTitle}
            description={errorMessage ?? t.pieceNotFound}
            action={
              <Button type="button" variant="secondary" onClick={onRetry}>
                {t.retry}
              </Button>
            }
          />
        ) : (
          <SkeletonRows rows={4} label={t.loading} className="[&>*]:h-[56px]" />
        )}
      </section>
    );
  }

  const piece = detail.piece;
  const core = detail.core;

  return (
    <section
      data-content-panel="piece"
      data-piece-state={state}
      data-piece-id={piece.id}
      aria-busy={busy}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header className="flex min-w-0 flex-col gap-[4px]">
        <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
          <span className="cf-label-sm text-cf-ink-muted">{piece.code}</span>
          <span className="cf-caption tabular-nums text-cf-ink-muted">
            {piece.date}
          </span>
          {piece.archivedAt ? <Status>{t.archived}</Status> : null}
          {/*
            «В архив» — второстепенное действие рядом с состоянием, а не
            главная кнопка страницы. Подтверждения нет намеренно: архив прячет
            заготовку из списка и не трогает ни одного поста, в том числе
            опубликованного, — спрашивать «вы уверены?» о том, что ничего не
            ломает, значит обесценить вопрос там, где он нужен.
          */}
          {!piece.archivedAt ? (
            <Button
              type="button"
              variant="secondary"
              density="dense"
              data-piece-archive="true"
              disabled={!canWrite || busy}
              onClick={onArchive}
            >
              {t.archive}
            </Button>
          ) : null}
        </div>
        <h1 className="cf-heading-lg text-cf-ink [text-wrap:balance]">
          {piece.title}
        </h1>
      </header>

      {readOnlyNote}

      {detail.notice ? (
        <p role="status" className="cf-body-sm text-cf-accent">
          {detail.notice}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-[16px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-[8px]">
          <h2 className="cf-heading-md text-cf-ink">
            {core ? t.coreTitle : t.legacyTitle}
          </h2>

          {/*
            Старый материал: тело — текст одного канала, а не нейтральная
            суть. Предупреждение стоит над текстом, потому что оно про то,
            что человек сейчас читает.
          */}
          {!core ? (
            <p
              role="status"
              data-piece-legacy="true"
              className="max-w-[72ch] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
            >
              {t.legacyWarning}
            </p>
          ) : null}

          {core?.writtenBy === 'fallback' ? (
            <p
              role="status"
              data-piece-core-fallback="true"
              className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
            >
              {t.coreFallback}
            </p>
          ) : null}

          <article
            data-piece-core={core ? 'core' : 'legacy'}
            className={clsx(
              'min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[16px] cf-body-md text-cf-ink [text-wrap:pretty]',
              core && 'whitespace-pre-wrap'
            )}
          >
            {core ? core.text : detail.legacyBody ?? ''}
          </article>

          {/*
            Находки проверки на штампы: считаны при создании сути, а не по
            кнопке. Вердикт `rewrite` — совет, а не запрет: «Адаптировать»
            ниже остаётся нажимаемым, и об этом сказано словами.
          */}
          {core ? (
            <div className="flex min-w-0 flex-col gap-[4px]">
              <p className="cf-label-sm uppercase text-cf-ink-muted">
                {t.slopTitle}
              </p>
              <p className="cf-caption text-cf-ink-muted">{t.slopAtCreation}</p>
              <SlopFindings
                locale={locale}
                text={core.text}
                report={core.slop}
              />
              {core.slop?.verdict === 'rewrite' ? (
                <p
                  data-piece-slop-rewrite="true"
                  className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
                >
                  {t.slopRewriteNote}
                </p>
              ) : null}
            </div>
          ) : null}

          {/*
            Своё число — то же ненавязчивое предложение, что показывает окно
            поста, теми же словами (`voice-copy.ts`, `draft-gap-note.tsx`).
            Ничего не блокирует и не окрашено тревогой: заготовка готова.
          */}
          {core && !core.authorNumbers ? (
            <div
              data-piece-own-number="true"
              className="rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
            >
              <p className="cf-label-sm uppercase text-cf-ink-muted">
                {v.draftGapLabel}
              </p>
              <p className="mt-[8px] max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
                {v.draftGapOwnMeasurement}
              </p>
              <p className="mt-[12px] max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.ownNumberOptional}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-[16px]">
          {core ? (
            <BriefReceipt
              locale={locale}
              brief={core.brief}
              overrides={{}}
              readOnly
              onOverride={() => undefined}
              onKindChange={() => undefined}
              onRevert={() => undefined}
            />
          ) : null}
        </div>
      </div>

      {/* --- Адаптации ---------------------------------------------------- */}

      <section className="flex min-w-0 flex-col gap-[8px]">
        <h2 className="cf-heading-md text-cf-ink">{t.adaptationsLabel}</h2>
        {detail.adaptations.length === 0 ? (
          <EmptyState title={t.adaptationsEmpty} />
        ) : (
          <ul className="flex flex-col gap-[8px]">
            {detail.adaptations.map((adaptation) => (
              <li
                key={adaptation.id}
                data-piece-adaptation={adaptation.id}
                className="flex flex-wrap items-center gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
              >
                <PlatformBadge
                  identifier={adaptation.platform}
                  name={adaptation.platform}
                  size={16}
                />
                <span className="cf-body-sm text-cf-ink">
                  {adaptation.integrationName ?? adaptation.platform}
                </span>
                <span className="cf-caption text-cf-ink-muted">
                  {kindWord(adaptation.kind)}
                </span>
                <Status
                  tone={
                    adaptation.state === 'published'
                      ? 'accent'
                      : adaptation.state === 'queued'
                      ? 'info'
                      : adaptation.state === 'error'
                      ? 'danger'
                      : 'neutral'
                  }
                >
                  {stateWord(adaptation.state, t)}
                </Status>
                {adaptation.postId ? (
                  <Button
                    type="button"
                    variant="quiet"
                    density="dense"
                    onClick={() => onOpenPost(adaptation)}
                  >
                    {t.openPost}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="quiet"
                  density="dense"
                  data-piece-delete-adaptation={adaptation.id}
                  disabled={!canWrite}
                  onClick={() => onDeleteAdaptation(adaptation)}
                >
                  {t.deleteAdaptation}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Куда адаптировать -------------------------------------------- */}

      <section className="flex min-w-0 flex-col gap-[8px]">
        <h2 className="cf-heading-md text-cf-ink">{t.targetsTitle}</h2>
        <ul className="flex flex-wrap gap-[8px]">
          {detail.targets.map((target) => {
            const kind =
              chosenKinds[target.platform] ?? target.kinds[0] ?? 'post';
            const channel = target.channels[0];
            const off = !target.available || !channel || !canWrite || busy;
            return (
              <li
                key={target.platform}
                data-piece-target={target.platform}
                data-piece-target-available={target.available ? 'true' : 'false'}
                data-piece-target-kind={kind}
                className="flex min-w-0 flex-col items-start gap-[4px]"
              >
                {/*
                  Выбор вида — только там, где видов больше одного. Полоса из
                  одного варианта ничего не спрашивает, а место и внимание
                  занимает.
                */}
                {target.kinds.length > 1 ? (
                  <Segmented<AdaptationKindV1>
                    label={`${t.kindLabel} · ${target.name}`}
                    value={kind}
                    options={target.kinds.map((one) => ({
                      value: one,
                      label: kindWord(one),
                    }))}
                    onChange={(next) =>
                      setChosenKinds((current) => ({
                        ...current,
                        [target.platform]: next,
                      }))
                    }
                    data-piece-kind-choice={target.platform}
                  />
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={off}
                  title={target.available ? undefined : t.noChannelReason}
                  onClick={() => channel && onAdapt(channel.id, kind)}
                >
                  {`${t.adapt} · ${target.name}`}
                </Button>
                {target.channels.length > 1 ? (
                  <span className="cf-caption text-cf-ink-muted">
                    {t.more(target.channels.length - 1)}
                  </span>
                ) : null}
                {!target.available ? (
                  <span className="flex flex-col gap-[4px]">
                    <span className="max-w-[32ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                      {t.noChannelReason}
                    </span>
                    <a
                      href="/launches"
                      className="cf-caption text-cf-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
                    >
                      {t.toChannels}
                    </a>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        {/*
          Видео и аудио — строка, а не выключенные кнопки: выключенная кнопка
          обещает скорое включение, строка честно говорит, что этого нет.
        */}
        {detail.later.length > 0 ? (
          <p
            data-piece-later="true"
            className="max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]"
          >
            {`${t.laterTitle}: ${detail.later
              .map((kind) => kindWord(kind))
              .join(', ')} — ${t.laterBody}`}
          </p>
        ) : null}
      </section>

      {busy ? (
        <div className="flex flex-wrap items-center gap-[8px]">
          <p aria-live="polite" data-piece-step={step ?? 'started'} className="cf-body-sm text-cf-ink-muted">
            {adaptingChannel ? `${t.adapting} ${adaptingChannel}` : t.adapting}
          </p>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t.cancel}
          </Button>
        </div>
      ) : null}

      {questions.length > 0 ? (
        <SuggestedQuestionsCard
          words={{
            badge: t.interviewBadge,
            title: t.interviewTitle,
            lead: t.interviewLead,
            suggestedLead: t.suggestedLead,
            yes: t.answerYes,
            fix: t.answerFix,
            decide: t.answerDecide,
            skip: t.answerSkip,
            ownAnswerLabel: t.ownAnswerLabel,
            ownAnswerHint: t.ownAnswerHint,
            send: t.interviewSend,
            skipAll: t.skipInterview,
          }}
          questions={questions.map((question) => ({
            key: question.key,
            question: question.question,
            suggested: question.suggested,
            ...(question.why ? { why: question.why } : {}),
          }))}
          busy={busy}
          onSubmit={(answers, decideKeys) =>
            onAnswer(
              answers.map((answer) => ({
                key: answer.key,
                text: answer.text,
                origin: answer.origin,
              })),
              decideKeys
            )
          }
          onSkipAll={onSkipInterview}
        />
      ) : null}

      {state === 'error' && errorMessage ? (
        <ErrorState
          title={t.pieceErrorTitle}
          description={errorMessage}
          action={
            <Button type="button" variant="secondary" onClick={onRetry}>
              {t.retry}
            </Button>
          }
        />
      ) : null}

      {notice ? (
        <p role="status" className="cf-body-sm text-cf-accent">
          {notice}
        </p>
      ) : null}

      {draftText !== null ? (
        <DraftResult
          locale={locale}
          text={draftText}
          platform={draftPlatform}
          onOpenEditor={onOpenEditor}
        />
      ) : null}
    </section>
  );
}

export default PieceScreen;
