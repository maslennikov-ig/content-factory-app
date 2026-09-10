'use client';

import { factKind, factStatus, type PieceFactV2 } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece-facts.v2';
import { CoreAnswerDiff, type CoreAnswerFeedback } from './core-answer-diff';
import type { BriefFilledV2 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/intake-v2.contract';

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Panel } from '@contentfactory/react/layout';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { Segmented } from '../../ui/segmented';
import { Progress } from '../../ui/progress';
import { Table, Td, Th, Tr } from '../../ui/table';
import {
  ErrorState,
  RestrictedState,
  SkeletonRows,
  Status,
} from '../../ui/surface';
import { SuggestedQuestionsCard } from '../intake/questions.card';
import { intakeCopy } from '../intake/intake.copy';
import {
  RECEIPT_FIELDS,
  type BriefFieldOriginV1,
  type QualityChecksV1,
} from '../intake/intake.adapter';
import { OWN_NUMBERS_GAP, QualityLine } from '../shared/quality-line';
import { voiceCopy } from '../../brand-voice/voice-copy';
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
  draftAdaptationId,
  initialPlatform,
  renderReview,
  renderChannelProfile,
  draftChecks,
  draftGaps,
  adaptingChannel,
  errorMessage,
  notice,
  restrictedReason,
  readOnlyNote,
  questionsSlot,
  coreAnswer,
  coreRewriteSlot,
  reviewQuestionsSlot,
  onAdapt,
  onArchive,
  onAnswer,
  onSkipInterview,
  onCancel,
  onOpenPost,
  onDeleteAdaptation,
  onOpenEditor,
  onRetry,
  onTitleSave,
  onFactSelect,
}: {
  locale: PiecesLocale;
  state: VoiceScreenStateV1;
  detail: PieceDetailV1 | null;
  canWrite: boolean;
  busy: boolean;
  step: string | null;
  questions: readonly PieceQuestionV1[];
  draftText: string | null;
  draftAdaptationId?: string | null;
  initialPlatform?: string;
  renderReview?: (adaptation: AdaptationV1 & { body: string }) => ReactNode;
  renderChannelProfile?: (channel: { id: string; name: string }) => ReactNode;
  /** Проверки адаптации: приезжают событием стрима вместе с текстом. */
  draftChecks?: QualityChecksV1 | null;
  /** Чего в адаптации нет из привычек автора — тем же событием. */
  draftGaps?: readonly unknown[] | null;
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
  coreAnswer?: CoreAnswerFeedback | null;
  coreRewriteSlot?: ReactNode;
  reviewQuestionsSlot?: ReactNode;
  onAdapt: (channelId: string, kind: AdaptationKindV1) => void;
  onArchive: () => void;
  onAnswer: (
    answers: readonly {
      key: string;
      text: string;
      origin: 'person' | 'confirmed';
    }[],
    decideKeys: readonly string[]
  ) => void;
  onSkipInterview: () => void;
  onCancel: () => void;
  onOpenPost: (adaptation: AdaptationV1) => void;
  onDeleteAdaptation: (adaptation: AdaptationV1) => void;
  onOpenEditor: () => void;
  onRetry: () => void;
  onTitleSave?: (title: string) => Promise<void>;
  onFactSelect?: (statement: string, selected: boolean) => Promise<void>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const [factSaving, setFactSaving] = useState<string | null>(null);
  const [factError, setFactError] = useState('');
  const [titleError, setTitleError] = useState('');
  const saveTitle = async (event: FormEvent) => {
    event.preventDefault();
    if (!titleValue.trim() || !onTitleSave) return;
    setTitleSaving(true);
    setTitleError('');
    try {
      await onTitleSave(titleValue.trim());
      setEditingTitle(false);
    } catch {
      setTitleError(locale === 'ru' ? 'Заголовок не сохранён. Попробуйте ещё раз.' : 'Title was not saved. Try again.');
    } finally {
      setTitleSaving(false);
    }
  };
  const t = piecesCopy[locale];
  const v = voiceCopy[locale];
  const targetRef = useRef<HTMLDivElement>(null);
  const [selectedPlatform, setSelectedPlatform] = useState(initialPlatform);
  const [chosenChannels, setChosenChannels] = useState<Record<string, string>>(
    {}
  );
  const [expandedAdaptations, setExpandedAdaptations] = useState<
    Record<string, boolean>
  >({});
  useEffect(() => {
    if (draftAdaptationId)
      setExpandedAdaptations((current) => ({
        ...current,
        [draftAdaptationId]: true,
      }));
  }, [draftAdaptationId]);
  useEffect(() => {
    if (initialPlatform && detail) {
      targetRef.current?.scrollIntoView?.({ block: 'nearest' });
      targetRef.current?.focus({ preventScroll: true });
    }
  }, [initialPlatform, detail?.piece.id]);

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
    if (asked === 0 || !card || typeof card.scrollIntoView !== 'function')
      return;
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

  /*
    Хост вместо полного адреса: в колонке 360px длинная ссылка переносится
    посреди пути и перестаёт читаться как источник. Адрес, который не разбирается
    в `URL`, показывается как есть — это чужая строка, и молча прятать её нельзя.
  */
  const hostOf = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  const briefLabel: Record<(typeof RECEIPT_FIELDS)[number], string> = {
    thesis: v.briefThesis,
    position: v.briefPosition,
    disagreement: v.briefDisagreement,
    audience: v.briefAudience,
    goal: v.briefGoal,
    format: v.briefFormat,
  };

  const facts = core?.brief.facts ?? [];
  const ungrounded = core?.brief.ungrounded ?? [];

  const available = detail.targets.filter(
    (target) => target.available && target.channels.length > 0
  );
  const unavailable = detail.targets.filter(
    (target) => !target.available || target.channels.length === 0
  );

  const overviewState = (adaptation: AdaptationV1 | undefined) => {
    if (!adaptation)
      return {
        label: t.stateNone,
        tone: 'neutral' as const,
      };
    if (adaptation.state === 'published')
      return { label: t.statePublished, tone: 'accent' as const };
    if (adaptation.state === 'queued')
      return { label: t.stateQueued, tone: 'info' as const };
    if (adaptation.state === 'error')
      return { label: t.stateError, tone: 'danger' as const };
    return {
      label: locale === 'ru' ? 'готово' : 'ready',
      tone: 'neutral' as const,
    };
  };

  const showAdaptation = (adaptationId: string) => {
    setExpandedAdaptations((current) => ({
      ...current,
      [adaptationId]: true,
    }));
    window.requestAnimationFrame(() => {
      document
        .getElementById(`adaptation-${adaptationId}`)
        ?.closest('[data-piece-adaptation]')
        ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    });
  };

  return (
    <section
      data-content-panel="piece"
      data-piece-state={state}
      data-piece-id={piece.id}
      aria-busy={busy}
      className="flex w-full min-w-0 flex-1 flex-col gap-[24px] p-[16px] md:p-[24px] lg:px-[32px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
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
          {canWrite && onTitleSave ? (
            <Button variant="quiet" layout="content" className="min-w-0 justify-start px-0 text-left" disabled={busy || titleSaving}
              onClick={() => { setTitleValue(piece.title); setEditingTitle(true); setTitleError(''); }}
              aria-label={`${piece.title}. ${locale === 'ru' ? 'Изменить заголовок' : 'Edit title'}`}>
              <span className="cf-heading-lg [text-wrap:balance]">{piece.title}</span>
            </Button>
          ) : piece.title}
        </h1>
        {editingTitle ? <form className="flex w-full flex-wrap items-start gap-[8px]" onSubmit={saveTitle}>
          <Input autoFocus name="piece-title" label={locale === 'ru' ? 'Заголовок' : 'Title'} value={titleValue} maxLength={120} onChange={(event) => setTitleValue(event.target.value)} disabled={titleSaving} />
          <Button type="submit" loading={titleSaving} disabled={!titleValue.trim()}>{locale === 'ru' ? 'Сохранить' : 'Save'}</Button>
          <Button type="button" variant="secondary" disabled={titleSaving} onClick={() => setEditingTitle(false)}>{locale === 'ru' ? 'Отмена' : 'Cancel'}</Button>
          {titleError ? <p role="alert" className="w-full cf-body-sm text-cf-ink">{titleError}</p> : null}
        </form> : null}
        {/*
          «В архив» — второстепенное действие в одной строке с заголовком, а не
          главная кнопка страницы. Подтверждения нет намеренно: архив прячет
          заготовку из списка и не трогает ни одного поста, в том числе
          опубликованного, — спрашивать «вы уверены?» о том, что ничего не
          ломает, значит обесценить вопрос там, где он нужен.
        */}
        <div className="flex shrink-0 flex-wrap items-center gap-[8px]">
          <a
            href="/content?tab=materials"
            className={buttonClassName({
              variant: 'secondary',
              density: 'dense',
            })}
          >
            {t.backToList}
          </a>
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
      </div>

      {readOnlyNote}

      {detail.notice ? (
        <p role="status" className="cf-body-sm text-cf-accent">
          {detail.notice}
        </p>
      ) : null}

      {/*
        Короткая карта работы стоит до текста заготовки: в ней одна строка на
        площадку и выбранный канал. Состояние и счётчик не склеивают каналы
        одной площадки: переключатель меняет ровно ту строку, с которой
        человек затем запускает ещё один вариант.
      */}
      <div
        ref={targetRef}
        tabIndex={-1}
        data-piece-adapt-focus={initialPlatform}
        className="rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cf-focus"
      >
        <Panel
          contentPadding="none"
          contentClassName="flex min-w-0 flex-col gap-[16px] p-[20px]"
        >
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-[8px]">
            <h2 className="cf-label-sm uppercase text-cf-ink-muted">
              {t.targetsTitle}
            </h2>
            {detail.later.length > 0 ? (
              <span
                data-piece-later="true"
                className="cf-caption text-cf-ink-muted"
              >
                {t.laterShort}
              </span>
            ) : null}
          </div>

          <Table
            caption={
              locale === 'ru'
                ? 'Адаптации по площадкам и каналам'
                : 'Adaptations by platform and channel'
            }
            className="min-w-[760px]"
          >
            <thead>
              <Tr>
                <Th banded>{locale === 'ru' ? 'Площадка' : 'Platform'}</Th>
                <Th banded>{locale === 'ru' ? 'Канал' : 'Channel'}</Th>
                <Th banded>{t.kindLabel}</Th>
                <Th banded>{locale === 'ru' ? 'Состояние' : 'State'}</Th>
                <Th banded numeric>
                  {locale === 'ru' ? 'Адаптаций' : 'Adaptations'}
                </Th>
                <Th banded>{locale === 'ru' ? 'Действия' : 'Actions'}</Th>
              </Tr>
            </thead>
            <tbody>
              {available.map((target) => {
                const kind =
                  chosenKinds[target.platform] ?? target.kinds[0] ?? 'post';
                const channel =
                  target.channels.find(
                    (one) => one.id === chosenChannels[target.platform]
                  ) ?? target.channels[0];
                const channelAdaptations = detail.adaptations
                  .filter(
                    (adaptation) =>
                      adaptation.platform === target.platform &&
                      adaptation.integrationId === channel.id
                  )
                  .sort((left, right) =>
                    right.createdAt.localeCompare(left.createdAt)
                  );
                const latest = channelAdaptations[0];
                const status = overviewState(latest);
                return (
                  <Tr
                    key={target.platform}
                    data-piece-target={target.platform}
                    data-piece-target-available="true"
                    data-piece-target-kind={kind}
                    data-piece-target-selected={
                      selectedPlatform === target.platform ? 'true' : undefined
                    }
                    selected={selectedPlatform === target.platform}
                  >
                    <Td>
                      <span className="flex min-w-0 items-center gap-[8px]">
                        <PlatformBadge
                          identifier={channel.providerIdentifier}
                          size={24}
                        />
                        <span className="min-w-0 truncate">{target.name}</span>
                      </span>
                    </Td>
                    <Td>
                      <div className="flex min-w-[180px] flex-col gap-[4px]">
                        {target.channels.length > 1 ? (
                          <Select
                            standalone
                            aria-label={`${t.targetsTitle} · ${target.name}`}
                            value={channel.id}
                            onChange={(event) =>
                              setChosenChannels((current) => ({
                                ...current,
                                [target.platform]: event.target.value,
                              }))
                            }
                            className="max-w-full"
                          >
                            {target.channels.map((one) => (
                              <option key={one.id} value={one.id}>
                                {one.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="cf-body-sm text-cf-ink">
                            {channel.name}
                          </span>
                        )}
                        {renderChannelProfile?.(channel) ?? null}
                      </div>
                    </Td>
                    <Td>
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
                      ) : (
                        <span className="cf-body-sm text-cf-ink">
                          {kindWord(kind)}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Status tone={status.tone}>{status.label}</Status>
                    </Td>
                    <Td numeric>{channelAdaptations.length}</Td>
                    <Td>
                      <div className="flex min-w-[220px] flex-wrap items-center gap-[8px]">
                        {latest ? (
                          <Button
                            type="button"
                            variant="quiet"
                            density="dense"
                            data-piece-overview-view={latest.id}
                            onClick={() => showAdaptation(latest.id)}
                          >
                            {locale === 'ru' ? 'Посмотреть' : 'View'}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant={latest ? 'secondary' : 'primary'}
                          loading={busy}
                          loadingLabel={locale === 'ru' ? 'Адаптируем…' : 'Adapting…'}
                          disabled={!canWrite || busy || Boolean(core && !core.text.trim())}
                          aria-label={`${t.adapt} · ${target.name}`}
                          onClick={() => {
                            setSelectedPlatform(target.platform);
                            onAdapt(channel.id, kind);
                          }}
                        >
                          {latest
                            ? locale === 'ru'
                              ? 'Ещё вариант'
                              : 'Another version'
                            : t.adapt}
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}

              {unavailable.map((target) => (
                <Tr
                  key={target.platform}
                  data-piece-target={target.platform}
                  data-piece-target-available="false"
                >
                  <Td>
                    <span className="flex min-w-0 items-center gap-[8px]">
                      <PlatformBadge identifier={target.platform} size={24} />
                      <span className="min-w-0 truncate">{target.name}</span>
                    </span>
                  </Td>
                  <Td>
                    <span className="cf-body-sm text-cf-ink-muted">
                      {t.stateNoChannel}
                    </span>
                  </Td>
                  <Td>
                    <span className="cf-body-sm text-cf-ink-muted">—</span>
                  </Td>
                  <Td>
                    <Status tone="neutral">{t.stateNoChannel}</Status>
                  </Td>
                  <Td numeric>0</Td>
                  <Td>
                    <a
                      href="/channels"
                      aria-label={`${t.toChannels} — ${t.noChannelReason}`}
                      className="cf-label-md text-cf-ink underline underline-offset-2 hover:text-cf-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
                    >
                      {t.toChannels}
                    </a>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          {/* Всё, что вызвано строкой, остаётся сразу под этой таблицей. */}
          <div ref={askRef} className="flex min-w-0 flex-col gap-[12px]">
            {busy ? (
              <div className="flex flex-wrap items-center gap-[8px]">
                <Progress
                  mode="indeterminate"
                  label={
                    adaptingChannel
                      ? `${t.adapting} ${adaptingChannel}`
                      : t.adapting
                  }
                  className="w-[128px] shrink-0"
                />
                <p
                  aria-live="polite"
                  data-piece-step={step ?? 'started'}
                  className="cf-body-sm text-cf-ink-muted"
                >
                  {adaptingChannel
                    ? `${t.adapting} ${adaptingChannel}`
                    : t.adapting}
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
                  lead: locale === 'ru' ? `Не хватает для канала «${adaptingChannel || ''}»` : `Missing for channel ${adaptingChannel || ''}`,
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
                  options: question.options,
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
      </div>

      <div className="flex min-w-0 flex-col gap-[24px]">
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

            {questionsSlot}
            {core && !core.text ? <p className="cf-body-sm text-cf-ink-muted">{locale === 'ru' ? 'Суть появится после ответов. Можно выбрать «Реши сама».' : 'The core will appear after your answers. You can let the model decide.'}</p> : null}
            {core?.text && core.writtenBy === 'fallback' ? (
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
              {core ? (
                coreAnswer && coreAnswer.body === core.text ? (
                  <CoreAnswerDiff {...coreAnswer} locale={locale} />
                ) : (
                  core.text
                )
              ) : (
                detail.legacyBody ?? ''
              )}
            </article>

            {/*
              Одна строка вместо вердикта и блока находок.
              Решение владельца 07.09.2026 (`content-factory-next-fn33.28.4`).
              До него строка печаталась всегда — и над чистой сутью говорила
              «находок нет · своё число есть», то есть занимала место, чтобы
              сообщить, что сообщать нечего. Теперь чистая суть не получает
              ничего, а находки и своё число называются словом каждая и
              раскрываются по нажатию.

              Проверки считаны при создании сути, а не по кнопке. Вердикт
              `rewrite` — совет, а не запрет: «Адаптировать» ниже остаётся
              нажимаемым, и об этом сказано словами.
            */}
            {coreRewriteSlot}
            {core?.text ? (
              <div className="flex min-w-0 flex-col gap-[4px]">
                <QualityLine
                  locale={locale}
                  slop={core.slop}
                  draftGaps={core.authorNumbers ? null : OWN_NUMBERS_GAP}
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


          {/* --- Адаптации ------------------------------------------------ */}

          <section className="flex min-w-0 flex-col gap-[12px]">
            <h2 className="cf-label-sm uppercase text-cf-ink-muted">
              {t.adaptationsLabel}
            </h2>
            {detail.adaptations.length === 0 ? (
              <p className="cf-body-sm text-cf-ink-muted">
                {t.adaptationsEmpty}
              </p>
            ) : (
              <ul className="flex flex-col gap-[8px]">
                {detail.adaptations.map((adaptation) => {
                  const currentDraft = draftAdaptationId === adaptation.id;
                  const text = currentDraft ? draftText : adaptation.body;
                  const checks = currentDraft ? draftChecks : adaptation.checks;
                  const open = expandedAdaptations[adaptation.id] ?? false;
                  return (
                    <li
                      key={adaptation.id}
                      data-piece-adaptation={adaptation.id}
                      className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface"
                    >
                      <div className="flex flex-wrap items-center gap-[12px] p-[12px]">
                        <Button
                          type="button"
                          variant="quiet"
                          density="dense"
                          aria-expanded={open}
                          aria-controls={`adaptation-${adaptation.id}`}
                          onClick={() =>
                            setExpandedAdaptations((current) => ({
                              ...current,
                              [adaptation.id]: !open,
                            }))
                          }
                        >
                          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                          {`${adaptation.platform} · ${kindWord(
                            adaptation.kind
                          )} · ${
                            adaptation.integrationName ?? adaptation.platform
                          }`}
                        </Button>
                        <Status
                          tone={
                            adaptation.state === 'published'
                              ? 'accent'
                              : adaptation.state === 'error'
                              ? 'danger'
                              : adaptation.state === 'queued'
                              ? 'info'
                              : 'neutral'
                          }
                        >
                          {stateWord(adaptation.state, t)}
                        </Status>
                        <span className="flex-1" />
                        {adaptation.postId && adaptation.state !== 'draft' ? (
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
                          disabled={!canWrite || busy}
                          onClick={() => onDeleteAdaptation(adaptation)}
                        >
                          {t.deleteAdaptation}
                        </Button>
                      </div>
                      <div
                        id={`adaptation-${adaptation.id}`}
                        hidden={!open}
                        className="border-t border-cf-border p-[16px]"
                      >
                        {text ? (
                          <article
                            data-intake-draft="true"
                            data-piece-draft-id={
                              currentDraft ? adaptation.id : undefined
                            }
                            className="max-w-[72ch] whitespace-pre-wrap cf-body-lg text-cf-ink [overflow-wrap:anywhere]"
                          >
                            {text}
                          </article>
                        ) : (
                          <p className="cf-body-sm text-cf-ink-muted">
                            {locale === 'ru'
                              ? 'Текст доступен в посте.'
                              : 'The text is available in the post.'}
                          </p>
                        )}
                        <QualityLine
                          locale={locale}
                          slop={checks?.slop}
                          antiCopy={checks?.antiCopy}
                          voice={checks?.voice}
                          draftGaps={currentDraft ? draftGaps : null}
                        />
                        {text
                          ? renderReview?.({ ...adaptation, body: text })
                          : null}
                      </div>
                    </li>
                  );
                })}
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
        </div>

        <aside className="flex min-w-0 flex-col gap-[24px]">
          {/*
            Квитанция здесь только на чтение: шесть строк «поле — значение —
            откуда взято» в сетке. Она занимает всю рабочую ширину, а не
            узкую правую колонку; мера ограничена только у читаемого текста.
            Бриф на этой странице уже
            израсходован, и кнопки «Поправить» на каждой строке обещали бы
            пересборку, которой здесь нет. Правки брифа живут на входе.
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
                {(core.brief as BriefFilledV2).inputSources?.some(
                  (source) => source?.kind === 'link'
                ) && core.brief.inputKind === 'foreign_post' ? (
                  <>
                    <dt className="cf-caption text-cf-ink-muted">
                      {locale === 'ru' ? 'Понято как' : 'Understood as'}
                    </dt>
                    <dd className="cf-body-sm text-cf-ink">
                      {locale === 'ru'
                        ? 'чужой пост + ссылка'
                        : 'foreign post + link'}
                    </dd>
                  </>
                ) : null}
                {RECEIPT_FIELDS.map((field) => {
                  const value = core.brief[field];
                  if (
                    typeof value !== 'string' ||
                    !value.trim() ||
                    value.trim().toLowerCase() === 'null'
                  )
                    return null;
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
                        {field === 'format'
                          ? (
                              {
                                auto: t.formatAutomatic,
                                opinion: i.formatOpinion,
                                announcement: i.formatAnnouncement,
                                list: i.formatList,
                                expert: i.formatExpert,
                                case: i.formatCase,
                                story: i.formatStory,
                              } as Record<string, string>
                            )[value] ?? value
                          : value}{' '}
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
            На что опирается текст. Решение владельца 07.09.2026: единственное,
            чего не было в компактной квитанции, — опоры и то, что опорой не
            стало. Ради них жила несмонтированная карточка расписки; она
            удалена, а эти два списка переехали сюда.

            Подтверждение печатается словом, а не значком и не цветом: «не
            подтверждено» — это право строки на недоверие, и читать его должен
            и тот, кто цвета не различает. Источник — хост, а не полный адрес.

            Пусто и там и там — блока нет вовсе. Заголовок «На что это
            опирается» над пустотой отвечал бы «ни на что», а это неправда:
            у старого материала брифа просто нет.
          */}
          {core && (facts.length > 0 || ungrounded.length > 0 || reviewQuestionsSlot) ? (
            <details
              id="piece-text-sources"
              open={reviewQuestionsSlot ? true : undefined}
              data-piece-sources="true"
              className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
            >
              <summary className="cursor-pointer cf-label-sm uppercase text-cf-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus">
                {locale === 'ru' ? 'Опоры текста' : 'Text sources'}
              </summary>

              <div className="mt-[12px] flex min-w-0 flex-col gap-[12px]">
                {reviewQuestionsSlot}
                {facts.some((fact) => factKind(fact, core.brief.inputKind) === 'found') ? <p className="cf-body-sm text-cf-ink-muted">{locale === 'ru' ? '«Берём» — использовать при следующем написании. Выбор не подтверждает факт.' : 'Include uses the source on the next draft. Selecting it does not verify the claim.'}</p> : null}
                {factError ? <p role="alert" className="cf-body-sm text-cf-ink">{factError}</p> : null}
                {facts.length > 0 ? (
                  <div data-piece-facts="true"><Table caption={locale === 'ru' ? 'Опоры текста' : 'Text sources'}>
                    <thead>
                      <Tr>
                        <Th>{locale === 'ru' ? 'Опора' : 'Source material'}</Th>
                        <Th>{locale === 'ru' ? 'Тип' : 'Type'}</Th>
                        <Th>{locale === 'ru' ? 'Статус' : 'Status'}</Th>
                        <Th>{locale === 'ru' ? 'Источник' : 'Source'}</Th>
                        <Th>{locale === 'ru' ? 'Берём' : 'Include'}</Th>
                      </Tr>
                    </thead>
                    <tbody>
                      {facts.map((fact: PieceFactV2, index) => (
                        <Tr key={`${fact.statement}-${index}`}>
                          <Td><span className="cf-body-sm text-cf-ink [text-wrap:pretty]">{fact.statement}</span></Td>
                          <Td><span data-fact-kind={factKind(fact, core.brief.inputKind)}>{locale === 'ru' ? { own: 'своё', external: 'внешнее', found: 'найдено' }[factKind(fact, core.brief.inputKind)] : factKind(fact, core.brief.inputKind)}</span></Td>
                          <Td><span data-piece-fact-verified={String(fact.verified)}>{locale === 'ru' ? { confirmed: 'подтверждено', conflicting: 'расходится', not_found: 'не нашлось', unverified: 'не проверено' }[factStatus(fact)] : factStatus(fact)}</span></Td>
                          <Td>{fact.sourceUrl ? <a href={fact.sourceUrl} target="_blank" rel="noreferrer noopener" className="break-all underline underline-offset-2 hover:text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus">{hostOf(fact.sourceUrl)}</a> : '—'}</Td>
                          <Td>{factKind(fact, core.brief.inputKind) === 'found' && onFactSelect ? (
                            <CheckboxField label={locale === 'ru' ? 'Берём' : 'Include'} checked={fact.selected === true} disabled={!canWrite || factSaving !== null}
                              onChange={async (event) => {
                                const selected = event.target.checked;
                                setFactSaving(fact.statement);
                                setFactError('');
                                try { await onFactSelect(fact.statement, selected); }
                                catch { setFactError(locale === 'ru' ? 'Выбор не сохранён. Попробуйте ещё раз.' : 'Selection was not saved. Try again.'); }
                                finally { setFactSaving(null); }
                              }} />
                          ) : null}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table></div>
                ) : null}

                {/*
                Утверждения, которые нечем подтвердить, стоят отдельно от фактов
                нарочно: в текст они не пошли, и строка про них — объяснение
                отсутствия, а не ещё одна опора.
              */}
                {ungrounded.length > 0 ? (
                  <div className="flex min-w-0 flex-col gap-[4px] border-t border-cf-border pt-[12px]">
                    <h3 className="cf-caption text-cf-ink-muted">
                      {i.ungroundedLabel}
                    </h3>
                    <ul className="flex min-w-0 flex-col gap-[4px]">
                      {ungrounded.map((statement, index) => (
                        <li
                          key={`${statement}-${index}`}
                          data-piece-ungrounded="true"
                          className="min-w-0 cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
                        >
                          {statement}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

export default PieceScreen;
