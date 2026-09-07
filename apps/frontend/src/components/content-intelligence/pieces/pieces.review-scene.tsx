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
  PIECE_FIXTURE_DETAIL_LEGACY,
  PIECE_FIXTURE_ROWS,
  PIECE_FIXTURE_TELEGRAM_QUESTIONS,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/pieces.fixture';
import { PiecesScreen } from './pieces.screen';
import { PieceScreen } from './piece.screen';
import { piecesCopy } from './pieces.copy';
import { emptyPiecesFilters, visibleColumns } from './pieces.adapter';

/**
 * Заготовки во всех девяти состояниях, без единого запроса.
 *
 * Смотреть надо не на «нарисовалось», а на пять мест, где эту таблицу легче
 * всего сделать неправильно: пустая клетка — читается ли она возможностью, а
 * не долгом; клетка без канала — объясняет ли себя до нажатия; строка без
 * клеток — говорит ли «пока не знаем», а не «ещё нет»; первая колонка при
 * боковой прокрутке; и страница старого материала — видно ли, что там текст
 * одного канала, а не суть.
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
    ru: 'Страница заготовки: суть слева, квитанция справа, находки под текстом.',
    en: 'The piece page: substance on the left, receipt on the right, findings under the text.',
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
    ru: 'Идёт адаптация: вопросы под канал, у каждого ответ модели и четыре способа закрыть его.',
    en: 'An adaptation is running: channel questions, each with the model’s answer and four ways to close it.',
  },
  'long-content': {
    ru: 'Страница старого материала: сути нет, текст одного канала и предупреждение над ним.',
    en: 'The page of older material: no substance, one channel’s text and a warning above it.',
  },
};

const noop = (): void => undefined;

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
            <PieceScreen
              locale={locale}
              state="default"
              detail={
                state === 'long-content'
                  ? PIECE_FIXTURE_DETAIL_LEGACY
                  : PIECE_FIXTURE_DETAIL
              }
              canWrite={true}
              busy={state === 'disabled'}
              step={state === 'disabled' ? 'started' : null}
              questions={
                state === 'disabled' ? PIECE_FIXTURE_TELEGRAM_QUESTIONS : []
              }
              draftText={null}
              adaptingChannel={state === 'disabled' ? 'Мой канал' : null}
              restrictedReason={t.restrictedBody}
              onAdapt={noop}
              onArchive={noop}
              onAnswer={noop}
              onSkipInterview={noop}
              onCancel={noop}
              onOpenPost={noop}
              onDeleteAdaptation={noop}
              onOpenEditor={noop}
              onRetry={noop}
            />
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
