'use client';

import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../../interface-review/fixture-contract';
import { ReviewLocaleProvider } from '../../interface-review/review-i18n';
import {
  PIECES_FIXTURE_RESPONSE,
  PIECES_FIXTURE_EMPTY,
  PIECE_FIXTURE_DETAIL,
  PIECE_FIXTURE_ROWS,
  PIECE_FIXTURE_TELEGRAM_QUESTIONS,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/pieces.fixture';
import { PiecesScreen } from './pieces.screen';
import { PieceScreen } from './piece.screen';
import { PieceCoreTab } from './piece-core-tab';
import { PieceChannelTab } from './piece-channel-tab';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import {
  DEFAULT_POST_OPTIONS,
  PIECE_TAB_CORE,
  emptyPiecesFilters,
  platformName,
  readPieceDetail,
  visibleColumns,
  workspaceChannels,
  type WorkspaceChannel,
} from './pieces.adapter';
import { SuggestedQuestionsCard } from '../intake/questions.card';

/**
 * Заготовки во всех девяти состояниях, без единого запроса.
 *
 * Смотреть надо не на «нарисовалось», а на места, где это легче всего
 * сделать неправильно: пустая клетка — читается ли она возможностью, а не
 * долгом; клетка без канала — объясняет ли себя до нажатия; строка без
 * клеток — говорит ли «пока не знаем», а не «ещё нет»; первая колонка при
 * боковой прокрутке. И рабочее место заготовки (`97dq.37`): вкладка «Суть»,
 * вкладка канала с черновиком и вкладка канала, где текста ещё нет.
 *
 * Данные — фикстура контракта (`pieces.fixture.ts`), общая правда шести
 * потоков волны. Ничего отсюда не идёт в базу и не зовёт модель.
 */

export const PIECES_REVIEW_STATES = [
  'loading',
  'empty',
  'default',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
] as const satisfies readonly InterfaceReviewState[];

export const scene = defineInterfaceReviewScene({
  id: 'content-intelligence/pieces',
  fixture: {
    columns: PIECES_FIXTURE_RESPONSE.columns.map((column) => column.platform),
    pieces: PIECE_FIXTURE_ROWS.length,
  },
  states: PIECES_REVIEW_STATES,
});

const NOTES: Partial<Record<InterfaceReviewState, { ru: string; en: string }>> = {
  loading: {
    ru: 'Список ещё едет: скелет повторяет строки таблицы, а не крутится кружком.',
    en: 'The list is still on its way: the skeleton repeats the rows instead of spinning.',
  },
  empty: {
    ru: 'Заготовок нет. Это не поломка, а первый шаг, и экран называет его.',
    en: 'No pieces. Not a fault but a first step, and the screen names it.',
  },
  default: {
    ru: 'Шесть состояний клетки разом. Пустая — пунктиром и спокойно: ни счётчиков, ни тревоги.',
    en: 'Six cell states at once. The empty one is dashed and calm: no counters, no alarm.',
  },
  selected: {
    ru: 'Строка раскрыта на месте: суть, квитанция, адаптации и находки — без ухода со списка.',
    en: 'A row expanded in place: substance, receipt, adaptations and findings without leaving the list.',
  },
  success: {
    ru: 'Вкладка канала: варианты, правка руками, ряд действий, «Для этого поста», предпросмотр и «Запланировать».',
    en: 'A channel tab: versions, manual editing, the action row, “For this post”, the preview and “Schedule”.',
  },
  error: {
    ru: 'Список не загрузился. Сказано, что заготовки на месте, и предложено повторить.',
    en: 'The list did not load. It says the pieces are intact and offers a retry.',
  },
  restricted: {
    ru: 'Читателю таблица видна, но ничего не начинается — причина стоит текстом.',
    en: 'A reader sees the table, but nothing starts — the reason stands in words.',
  },
  disabled: {
    ru: 'Канал без текста: один вопрос перед текстом и «Адаптировать для ВКонтакте».',
    en: 'A channel without text: one question before the text and “Adapt for VK”.',
  },
  'long-content': {
    ru: 'Вкладка «Суть»: «Что вы прислали» свёрнуто, суть с рядом действий, «Куда дальше», справа квитанция.',
    en: 'The “Substance” tab: “What you sent” folded, the substance with its action row, “Where next”, the receipt on the right.',
  },
};

const noop = (): void => undefined;

/*
  Заготовка стенда: адаптация Telegram — черновик, «Что вы прислали» — свой
  текст. Ничего отсюда не уходит в базу.
*/
const SCENE_DETAIL = readPieceDetail({
  ...PIECE_FIXTURE_DETAIL,
  core: {
    ...PIECE_FIXTURE_DETAIL.core,
    personText:
      'Из шести дедлайнов, которые я ставил себе сам, сдвинулись пять. С клиентом не сдвинулся ни один.',
  },
  adaptations: PIECE_FIXTURE_DETAIL.adaptations.map((adaptation, index) =>
    index === 0
      ? { ...adaptation, state: 'draft', date: null, url: null }
      : adaptation
  ),
});

function PieceScene({
  locale,
  state,
}: {
  locale: PiecesLocale;
  state: InterfaceReviewState;
}) {
  const t = piecesCopy[locale];
  const channels = workspaceChannels(SCENE_DETAIL);
  const telegram = channels.find((one) => one.id === 'int-tg-main');
  const empty = channels.find((one) => one.adaptations.length === 0);
  const tab =
    state === 'success'
      ? telegram?.id ?? PIECE_TAB_CORE
      : state === 'disabled'
      ? empty?.id ?? PIECE_TAB_CORE
      : PIECE_TAB_CORE;
  const channelTab = (channel: WorkspaceChannel) => {
    const adaptation = channel.adaptations[0] ?? null;
    const label = platformName(channel.platform, locale, channel.platformName);
    return (
      <PieceChannelTab
        key={channel.id}
        locale={locale}
        channel={channel}
        platformLabel={label}
        adaptation={adaptation}
        canWrite
        adapting={false}
        adaptingLabel={t.adaptingFor(channel.name)}
        questionsSlot={
          state === 'disabled' ? (
            <SuggestedQuestionsCard
              words={{
                badge: t.interviewBadge,
                title: t.interviewTitle,
                lead: t.interviewTakeawayLead,
                suggestedLead: t.suggestedLead,
                yes: t.answerYes,
                fix: t.answerFix,
                decide: t.answerDecide,
                skip: t.answerSkip,
                ownAnswerLabel: t.ownAnswerLabel,
                ownAnswerHint: t.ownAnswerHint,
                ownOptionPlaceholder: t.ownOptionPlaceholder,
                send: t.interviewSend,
                skipAll: t.answerDecideAll,
                own: t.ownAnswer,
              }}
              questions={PIECE_FIXTURE_TELEGRAM_QUESTIONS.slice(1).map(
                (question) => ({
                  key: question.key,
                  question: question.question,
                  options: question.options,
                  suggested: question.suggested,
                })
              )}
              onSubmit={noop}
              onSkipAll={noop}
            />
          ) : undefined
        }
        body={adaptation?.body ?? ''}
        onBodyChange={noop}
        saveState="saved"
        savedAt="19:04"
        onRetrySave={noop}
        maxLength={4096}
        image={null}
        onPickImage={noop}
        onRemoveImage={noop}
        checks={adaptation?.checks ?? null}
        postOptions={DEFAULT_POST_OPTIONS}
        avatars={[]}
        onPostOptionsChange={noop}
        rememberState="idle"
        onRemember={noop}
        when={<span className="cf-body-sm text-cf-ink">19:30</span>}
        scheduleBusy={null}
        calendarHref="/launches"
        onSelectAdaptation={noop}
        onAdapt={noop}
        onCancelAdapt={noop}
        onSchedule={noop}
        onPublishNow={noop}
        onUnschedule={noop}
        onDelete={noop}
      />
    );
  };
  return (
    <PieceScreen
      locale={locale}
      state="default"
      detail={SCENE_DETAIL}
      channels={channels}
      tab={tab}
      canWrite
      busy={false}
      coreTab={
        <PieceCoreTab
          locale={locale}
          detail={SCENE_DETAIL}
          channels={channels}
          unavailable={SCENE_DETAIL.targets.filter(
            (target) => !target.available || target.channels.length === 0
          )}
          canWrite
          busy={false}
          factSelectable={false}
          onOpenChannel={noop}
          onAdaptChannel={noop}
        />
      }
      renderChannelTab={channelTab}
      restrictedReason={t.restrictedBody}
      onTabChange={noop}
      onArchive={noop}
      onDelete={noop}
      onRetry={noop}
    />
  );
}

export function Scene({ context }: { context: InterfaceReviewContext }) {
  const locale = context.locale;
  const t = piecesCopy[locale];
  const note = NOTES[context.state];
  const state = context.state;

  const showsPiece =
    state === 'success' || state === 'disabled' || state === 'long-content';
  const response =
    state === 'empty' ? PIECES_FIXTURE_EMPTY : PIECES_FIXTURE_RESPONSE;
  const { shown, rest } = visibleColumns(response.columns, null);

  return (
    <ReviewLocaleProvider locale={locale}>
      <InterfaceReviewFrame scene={scene} context={context}>
        <div
          data-interface-review-data="synthetic"
          className="flex min-w-0 flex-col gap-[16px] p-[16px] sm:p-[20px] lg:p-[24px]"
        >
          {showsPiece ? (
            <PieceScene locale={locale} state={state} />
          ) : (
            <PiecesScreen
              locale={locale}
              state={
                state === 'loading'
                  ? 'loading'
                  : state === 'empty'
                  ? 'empty'
                  : state === 'error'
                  ? 'error'
                  : state === 'restricted'
                  ? 'restricted'
                  : 'default'
              }
              rows={response.pieces}
              columns={shown}
              restColumns={rest}
              filters={emptyPiecesFilters}
              expandedId={state === 'selected' ? PIECE_FIXTURE_ROWS[0].id : null}
              expansion={
                state === 'selected'
                  ? {
                      core: PIECE_FIXTURE_DETAIL.core,
                      adaptations: PIECE_FIXTURE_DETAIL.adaptations,
                      loading: false,
                      failed: false,
                    }
                  : undefined
              }
              canWrite={state !== 'restricted'}
              restrictedReason={t.restrictedBody}
              columnsMenuOpen={false}
              chosenColumns={[]}
              onFilterChange={noop}
              onToggleColumn={noop}
              onToggleColumnsMenu={noop}
              onExpand={noop}
              onOpenPiece={noop}
              onAdapt={noop}
              onDelete={noop}
              onOpenPost={noop}
              onNewPiece={noop}
              onRetry={noop}
            />
          )}
          {note ? (
            <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
              {note[locale]}
            </p>
          ) : null}
        </div>
      </InterfaceReviewFrame>
    </ReviewLocaleProvider>
  );
}
