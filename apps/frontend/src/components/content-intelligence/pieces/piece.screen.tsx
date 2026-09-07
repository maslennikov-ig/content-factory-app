'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Panel } from '@contentfactory/react/layout';
import { Segmented } from '../../ui/segmented';
import {
  ErrorState,
  RestrictedState,
  SkeletonRows,
  Status,
} from '../../ui/surface';
import { voiceCopy } from '../../brand-voice/voice-copy';
import { SlopFindings } from '../intake/slop-findings';
import { SuggestedQuestionsCard } from '../intake/questions.card';
import { intakeCopy } from '../intake/intake.copy';
import { RECEIPT_FIELDS, type BriefFieldOriginV1 } from '../intake/intake.adapter';
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
  questionsSlot,
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
  /**
   * Уточнения заготовки — первым блоком после шапки
   * (`content-factory-next-m2eg`). Слот, а не готовая карточка: вопросы зовут
   * дверь, а этот файл рисует и ничего не просит.
   */
  questionsSlot?: ReactNode;
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

  /*
    Вопросы адаптации живут внутри панели «Куда адаптировать», под кнопкой,
    которая их вызвала, — и экран доводит их до глаз сам. До 07.09.2026 они
    рендерились в самом низу страницы: человек нажимал «Адаптировать»,
    ничего видимого не происходило, и он нажимал ещё раз. Прокрутка `nearest`,
    а не `center`: если карточка и так на экране, двигать ничего не надо.
    `prefers-reduced-motion` снимает саму анимацию, а не переход.
  */
  const askRef = useRef<HTMLDivElement | null>(null);
  const asked = questions.length;
  useEffect(() => {
    const card = askRef.current;
    // jsdom не реализует прокрутку вовсе, и проверка здесь не про тесты: это
    // тот же случай, что старый браузер без `scrollIntoView` — вопросы всё
    // равно на экране, просто до них надо долистать самому.
    if (asked === 0 || !card || typeof card.scrollIntoView !== 'function') return;
    const still =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({
      behavior: still ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [asked]);

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
  const i = intakeCopy[locale];

  const originWord =
    piece.origin === 'thought'
      ? t.originThought
      : piece.origin === 'link'
      ? t.originLink
      : piece.origin === 'foreign_post'
      ? t.originForeign
      : piece.origin === 'lead'
      ? t.originLead
      : piece.origin === 'legacy'
      ? t.originLegacy
      : t.originManual;

  const originOfField = (origin: BriefFieldOriginV1) =>
    origin === 'input'
      ? i.originInput
      : origin === 'person'
      ? i.originPerson
      : origin === 'avatar'
      ? i.originAvatar
      : origin === 'memory'
      ? i.originMemory
      : origin === 'search'
      ? i.originSearch
      : i.originModel;

  const briefLabel: Record<(typeof RECEIPT_FIELDS)[number], string> = {
    thesis: v.briefThesis,
    position: v.briefPosition,
    disagreement: v.briefDisagreement,
    audience: v.briefAudience,
    goal: v.briefGoal,
    format: v.briefFormat,
  };

  const findings = core?.slop?.findings?.length ?? 0;

  /*
    Одна строка вместо двух блоков: проверка на штампы и своё число — это два
    факта о том же тексте, и оба помещаются в подпись под ним. Развёрнутые
    находки появляются ниже только если они есть; пустой блок «находок нет» с
    заголовком и пояснением занимал четверть колонки и ничего не сообщал.
  */
  const verdictLine = core
    ? `${t.slopTitle}: ${findings > 0 ? t.slopFound(findings) : t.slopNoFindings} · ${
        core.authorNumbers ? t.ownNumberHas : t.ownNumberNone
      }`
    : null;

  const available = detail.targets.filter(
    (target) => target.available && target.channels.length > 0
  );
  const unavailable = detail.targets.filter(
    (target) => !target.available || target.channels.length === 0
  );

  return (
    <section
      data-content-panel="piece"
      data-piece-state={state}
      data-piece-id={piece.id}
      aria-busy={busy}
      className="flex min-w-0 flex-col gap-[24px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      {/*
        Хлебная крошка вместо строки метаданных: код, дата и происхождение
        стоят там же, где ответ на «где я и как вернуться», и не спорят с
        заголовком за первую строку страницы.
      */}
      <nav
        aria-label={t.breadcrumbSection}
        className="flex min-w-0 flex-wrap items-center gap-[8px] cf-caption text-cf-ink-muted"
      >
        <a
          href="/content?tab=materials"
          className="underline underline-offset-2 hover:text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
        >
          {t.breadcrumbSection}
        </a>
        <span aria-hidden="true">/</span>
        <a
          href="/content?tab=materials"
          className="underline underline-offset-2 hover:text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
        >
          {t.title}
        </a>
        <span aria-hidden="true">/</span>
        <span className="cf-label-sm text-cf-signature">{piece.code}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{piece.date}</span>
        <span aria-hidden="true">·</span>
        <span data-piece-origin={piece.origin}>{originWord}</span>
        {piece.archivedAt ? <Status>{t.archived}</Status> : null}
      </nav>

      <div className="flex min-w-0 flex-wrap items-start gap-[24px]">
        <h1 className="min-w-0 max-w-[60ch] flex-1 cf-heading-lg text-cf-ink [text-wrap:balance]">
          {piece.title}
        </h1>
        {/*
          «В архив» — второстепенное действие в одной строке с заголовком, а не
          главная кнопка страницы. Подтверждения нет намеренно: архив прячет
          заготовку из списка и не трогает ни одного поста, в том числе
          опубликованного, — спрашивать «вы уверены?» о том, что ничего не
          ломает, значит обесценить вопрос там, где он нужен.
        */}
        {!piece.archivedAt ? (
          <Button
            type="button"
            variant="quiet"
            density="dense"
            className="shrink-0"
            data-piece-archive="true"
            disabled={!canWrite || busy}
            onClick={onArchive}
          >
            {t.archive}
          </Button>
        ) : null}
      </div>

      {readOnlyNote}

      {questionsSlot}

      {detail.notice ? (
        <p role="status" className="cf-body-sm text-cf-accent">
          {detail.notice}
        </p>
      ) : null}

      <div className="grid min-w-0 items-start gap-[32px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-[24px]">

          <section className="flex min-w-0 flex-col gap-[12px]">
            <h2 className="cf-label-sm uppercase text-cf-ink-muted">
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

            {/*
              Суть — главный текст страницы, и она читается как текст: мера в
              72 знака, `body-lg` и никакой рамки. Панель вокруг неё делала из
              неё вложенную карточку среди трёх других и ровно ничем не
              отличала главное от служебного.
            */}
            <article
              data-piece-core={core ? 'core' : 'legacy'}
              className={clsx(
                'min-w-0 max-w-[72ch] cf-body-lg text-cf-ink [text-wrap:pretty]',
                core && 'whitespace-pre-wrap'
              )}
            >
              {core ? core.text : detail.legacyBody ?? ''}
            </article>

            {verdictLine ? (
              <p
                data-piece-verdict="true"
                className="cf-caption text-cf-ink-muted"
              >
                {verdictLine}
              </p>
            ) : null}

            {/*
              Находки проверки на штампы: считаны при создании сути, а не по
              кнопке, и разворачиваются только когда они есть. Вердикт
              `rewrite` — совет, а не запрет: «Адаптировать» ниже остаётся
              нажимаемым, и об этом сказано словами.
            */}
            {core && findings > 0 ? (
              <div className="flex min-w-0 flex-col gap-[4px]">
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
          </section>

          {/* --- Куда адаптировать ---------------------------------------- */}

          <Panel
            contentPadding="none"
            contentClassName="flex min-w-0 flex-col gap-[16px] p-[20px]"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-[16px]">
              <h2 className="cf-label-sm uppercase text-cf-ink-muted">
                {t.targetsTitle}
              </h2>
              {/*
                Выбор вида — только там, где видов больше одного. Полоса из
                одного варианта ничего не спрашивает, а место и внимание
                занимает.
              */}
              {available.map((target) =>
                target.kinds.length > 1 ? (
                  <Segmented<AdaptationKindV1>
                    key={`kind-${target.platform}`}
                    label={`${t.kindLabel} · ${target.name}`}
                    value={chosenKinds[target.platform] ?? target.kinds[0]}
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
                ) : null
              )}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
              {available.map((target) => {
                const kind =
                  chosenKinds[target.platform] ?? target.kinds[0] ?? 'post';
                const channel = target.channels[0];
                return (
                  <span
                    key={target.platform}
                    data-piece-target={target.platform}
                    data-piece-target-available="true"
                    data-piece-target-kind={kind}
                    className="inline-flex items-center gap-[8px]"
                  >
                    <Button
                      type="button"
                      variant="primary"
                      disabled={!canWrite || busy}
                      onClick={() => channel && onAdapt(channel.id, kind)}
                    >
                      {`${t.adapt} · ${target.name}`}
                    </Button>
                    {target.channels.length > 1 ? (
                      <span className="cf-caption text-cf-ink-muted">
                        {t.more(target.channels.length - 1)}
                      </span>
                    ) : null}
                  </span>
                );
              })}

              {/*
                Площадка без канала — чип, а не выключенная кнопка: выключенная
                кнопка обещает, что когда-нибудь включится сама. Причина и
                дорога к каналам стоят в доступном имени и в ссылке рядом, то
                есть до нажатия, а не отказом после.
              */}
              {unavailable.map((target) => (
                <span
                  key={target.platform}
                  data-piece-target={target.platform}
                  data-piece-target-available="false"
                  className="inline-flex items-center gap-[4px]"
                >
                  <Status tone="neutral" className="border-dashed opacity-70">
                    {`${target.name} · ${t.stateNoChannel}`}
                  </Status>
                  {/*
                    Причина живёт в имени ссылки, а не в `title` чипа: чип
                    ничего не делает и фокуса не принимает, так что подсказка на
                    нём доступна одной только мыши.
                  */}
                  <a
                    href="/launches"
                    aria-label={`${t.toChannels} — ${t.noChannelReason}`}
                    className="cf-caption text-cf-ink-muted underline underline-offset-2 hover:text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
                  >
                    {t.toChannels}
                  </a>
                </span>
              ))}

              {/*
                Видео и аудио — подпись, а не выключенные кнопки: выключенная
                кнопка обещает скорое включение, подпись честно говорит, что
                этого нет.
              */}
              {detail.later.length > 0 ? (
                <span
                  data-piece-later="true"
                  className="ms-auto cf-caption text-cf-ink-muted"
                >
                  {t.laterShort}
                </span>
              ) : null}
            </div>

            {/*
              Всё, что кнопка вызвала, происходит под ней и внутри той же
              панели: шаг стрима, отмена и вопросы адаптации.
            */}
            <div ref={askRef} className="flex min-w-0 flex-col gap-[12px]">
              {busy ? (
                <div className="flex flex-wrap items-center gap-[8px]">
                  <p
                    aria-live="polite"
                    data-piece-step={step ?? 'started'}
                    className="cf-body-sm text-cf-ink-muted"
                  >
                    {adaptingChannel ? `${t.adapting} ${adaptingChannel}` : t.adapting}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    density="dense"
                    onClick={onCancel}
                  >
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
            </div>
          </Panel>

          {/* --- Адаптации ------------------------------------------------ */}

          <section className="flex min-w-0 flex-col gap-[12px]">
            <h2 className="cf-label-sm uppercase text-cf-ink-muted">
              {t.adaptationsLabel}
            </h2>
            {detail.adaptations.length === 0 ? (
              <p className="cf-body-sm text-cf-ink-muted">{t.adaptationsEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-[8px]">
                {detail.adaptations.map((adaptation) => (
                  <li
                    key={adaptation.id}
                    data-piece-adaptation={adaptation.id}
                    className="flex flex-wrap items-center gap-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px] ps-[16px]"
                  >
                    <Status tone="neutral">{adaptation.platform}</Status>
                    <span className="min-w-0 cf-body-sm text-cf-ink">
                      {`${kindWord(adaptation.kind)} · ${
                        adaptation.integrationName ?? adaptation.platform
                      }`}
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
                    <span className="flex-1" />
                    {adaptation.postId ? (
                      <Button
                        type="button"
                        variant="secondary"
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
        </div>

        {/* --- Правая колонка ---------------------------------------------- */}

        <aside className="flex min-w-0 flex-col gap-[16px]">
          {/*
            Квитанция здесь компактная и только на чтение: шесть строк «поле —
            значение — откуда взято» в сетке. Правится она там, где её можно
            потратить — на входе (`BriefReceipt`), — а на этой странице бриф
            уже израсходован, и полная карточка с кнопками «Поправить» на
            каждой строке обещала бы пересборку, которой здесь нет.
          */}
          {core ? (
            <Panel
              contentPadding="none"
              contentClassName="flex min-w-0 flex-col gap-[12px] p-[16px]"
            >
              <h2 className="cf-label-sm uppercase text-cf-ink-muted">
                {i.receiptTitle}
              </h2>
              <dl
                data-piece-receipt="true"
                className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-x-[12px] gap-y-[8px]"
              >
                {RECEIPT_FIELDS.map((field) => {
                  const value = core.brief[field];
                  if (typeof value !== 'string' || !value) return null;
                  const origin = core.brief.origins?.[field] ?? 'model';
                  return (
                    <Fragment key={field}>
                      <dt className="cf-caption text-cf-ink-muted">
                        {briefLabel[field]}
                      </dt>
                      <dd
                        data-brief-origin={origin}
                        className="min-w-0 cf-body-sm text-cf-ink [text-wrap:pretty]"
                      >
                        {value}{' '}
                        <span className="cf-caption text-cf-ink-muted">
                          {`· ${originOfField(origin)}`}
                        </span>
                      </dd>
                    </Fragment>
                  );
                })}
              </dl>
            </Panel>
          ) : null}

          {/*
            Своё число — то же ненавязчивое предложение, что показывает окно
            поста, теми же словами (`voice-copy.ts`, `draft-gap-note.tsx`).
            Ничего не блокирует и не окрашено тревогой: заготовка готова.
          */}
          {core && !core.authorNumbers ? (
            <Panel
              contentPadding="none"
              contentClassName="flex min-w-0 flex-col gap-[8px] p-[16px]"
            >
              <h2
                data-piece-own-number="true"
                className="cf-label-sm uppercase text-cf-ink-muted"
              >
                {t.ownNumberLabel}
              </h2>
              <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                {v.draftGapOwnMeasurement}
              </p>
              <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.ownNumberOptional}
              </p>
            </Panel>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

export default PieceScreen;
