'use client';

import { Fragment, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { ConfirmButton } from '../../ui/confirm-button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { Hint } from '@contentfactory/react/layout/hint';
import { Panel } from '@contentfactory/react/layout';
import {
  EmptyState,
  ErrorState,
  RestrictedState,
  SkeletonRows,
  Status,
} from '../../ui/surface';
import { Table, Td, Th, Tr } from '../../ui/table';
import { FiltersRow } from '../../ui/filters-row';
import { HighlightedWords } from '../content-search-words';
import {
  AdaptationCell,
  AdaptationLegend,
  FILTER_STATES,
  StateGlyph,
  stateWord,
} from './adaptation.cell';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import {
  PIECE_TABLE_MIN_WIDTH,
  cellOf,
  isPieceSort,
  platformName,
  type AdaptationV1,
  type PieceCellV1,
  type PieceColumnV1,
  type PieceRowV1,
  type PieceSort,
  type PieceSortDirection,
  type PieceSortField,
  type PiecesFilters,
  type VoiceScreenStateV1,
  type ZagotovkaCoreV1,
} from './pieces.adapter';

/**
 * Таблица заготовок: по колонке на площадку, в клетке — состояние.
 *
 * Решение владельца 06.09.2026, §11.4–11.7 карты раздела; вид приведён к
 * макету, одобренному 07.09.2026. Экран рисует и ничего не просит: ни одного
 * `fetch`, ни одного SWR-ключа — всё приходит сверху от
 * `pieces.container.tsx`, как у входа рядом. Сцены обзора открывают этот файл
 * во всех состояниях без сети именно поэтому.
 *
 * Пять вещей в разметке — решения, а не оформление.
 *
 * **Брейкпоинт таблицы именованный, и это не мелочь.** До 07.09.2026 здесь
 * стоял произвольный брейкпоинт на 720 px, записанный вариантом `min` с
 * шириной в скобках. Tailwind 3.4 такие варианты не выпускает вовсе, пока в
 * `screens` есть хоть один объект с `raw` — их шесть, — и молчит об этом в
 * логе сборки. Правила не было в CSS, таблица держала `hidden` и на боевой не
 * отрисовалась ни разу: человек видел только карточки. Экран `table` (720px,
 * то же число, что `PIECE_TABLE_MIN_WIDTH`) — обычный брейкпоинт, и
 * `tests/design.guard.test.cjs` с тех пор роняет сборку на любом произвольном
 * варианте в разметке.
 *
 * **Ниже 720 px таблицы нет вовсе.** Не «таблица с прокруткой», а карточки:
 * горизонтально прокручиваемая таблица на 390 px — это способ спрятать
 * половину состояний за краем экрана. Раскрытие есть и там: та же кнопка, тот
 * же `aria-expanded`.
 *
 * **Строка раскрывается на месте**, а не уводит на страницу, и раскрывает её
 * кнопка-стрелка в первой колонке со своим именем — «Раскрыть строку» и
 * «Свернуть строку». Раньше кнопкой был весь блок кода и заголовка: без имени,
 * с тремя строками текста внутри и без единого признака, что это вообще
 * нажимается.
 *
 * **Первые две колонки закреплены** (`sticky`): при боковой прокрутке по
 * десяти площадкам стрелка и код остаются на месте, иначе человек читает ряд
 * состояний, не зная, чьи они.
 *
 * **Пустых счётчиков нет.** Ни «заполнено 2 из 5», ни тревожного цвета над
 * незанятой клеткой: таблица показывает возможность, решает человек.
 */

export type PieceExpansion = {
  core: ZagotovkaCoreV1 | null;
  adaptations: readonly AdaptationV1[];
  loading: boolean;
  failed: boolean;
};

/**
 * Ширина закреплённой стрелки. Одно число, а не два: код отодвигается ровно на
 * него, и колонка объявляет ту же ширину, — иначе закреплённые ячейки
 * разъезжаются при первой правке одной из трёх копий.
 */
const ARROW_WIDTH = 44;

/*
  `strongestRowState` жил здесь до 18.09.2026 и считал «самое сильное»
  состояние строки из её же клеток. Клетка теперь несёт состояние площадки
  сама, и вторая, свёрнутая до одного слова копия того же факта рядом с кодом
  спорила с ней: «черновик» у кода и «опубликовано» в двух колонках из трёх —
  это один ответ, разобранный на два разных. Пилюля ушла вместе с функцией.
*/

/**
 * Полоса фишек — один вопрос и его ответы на виду.
 *
 * Роль, стрелки и остановку Tab пишет `RadioGroup`: выбор здесь дёшев и
 * обратим, так что он следует за фокусом, как и просит правило семейства. Вид
 * принадлежит этому экрану — примитив не навязывает ни цвета, ни геометрии, а
 * высоту фишки (32 px, плотный вариант) держит `density`, а не класс отсюда.
 *
 * На телефоне вопрос занимает две строки, а не четыре. Ниже экрана `table` —
 * того же, на котором таблица становится карточками, — подпись встаёт над
 * фишками, а сами фишки едут одной строкой вбок: два переносящихся ряда по
 * девять фишек на 400 px съедали весь первый экран, и список начинался под
 * сгибом. Прокрутка вертикальных полей не съедает: `overflow-x` делает
 * `overflow-y` тоже прокручиваемым, поэтому кольцо фокуса живёт в собственных
 * 4 px отступа, снятых отрицательным полем, — геометрия ряда от этого не
 * меняется.
 */
function ChipFilter({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string; icon?: ReactNode }[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      data-piece-filter={name}
      className="flex min-w-0 flex-col gap-[4px] table:flex-row table:flex-wrap table:items-center table:gap-[8px]"
    >
      <span className="cf-label-sm text-cf-ink-muted">{label}</span>
      <RadioGroup
        value={value}
        onChange={onChange}
        aria-label={label}
        data-piece-filter-scroller="true"
        className={clsx(
          'flex min-w-0 flex-nowrap items-center gap-[8px] overflow-x-auto',
          '-my-[4px] py-[4px]',
          'table:flex-wrap table:overflow-visible table:my-0 table:py-0'
        )}
      >
        {options.map((option) => {
          const chosen = option.value === value;
          return (
            <RadioOption
              key={option.value}
              value={option.value}
              density="dense"
              data-piece-filter-option={`${name}:${option.value}`}
              className={clsx(
                // Фишка не сжимается: на узкой полосе ряд едет вбок целиком,
                // а не превращается в колонку раздавленных слов.
                'inline-flex flex-none items-center gap-[8px] rounded-full border px-[12px] cf-label-sm',
                'transition-colors duration-state motion-reduce:transition-none',
                chosen
                  ? 'border-cf-accent bg-cf-accent-soft text-cf-accent'
                  : 'border-cf-border-control text-cf-ink hover:bg-cf-surface-subtle'
              )}
            >
              {option.icon}
              {option.label}
            </RadioOption>
          );
        })}
      </RadioGroup>
    </div>
  );
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d={open ? 'M2 8l4-4 4 4' : 'M2 4l4 4 4-4'} />
  </svg>
);

export function PiecesScreen({
  locale,
  state,
  rows,
  columns,
  restColumns,
  filters,
  query,
  expandedId,
  expansion,
  canWrite,
  notice,
  errorMessage,
  restrictedReason,
  readOnlyNote,
  columnsMenuOpen,
  chosenColumns,
  onFilterChange,
  onToggleColumn,
  onToggleColumnsMenu,
  onExpand,
  onOpenPiece,
  onAdapt,
  onDelete,
  onOpenPost,
  onNewPiece,
  onRetry,
}: {
  locale: PiecesLocale;
  state: VoiceScreenStateV1;
  rows: readonly PieceRowV1[];
  /** Колонки, которые видно, в порядке ответа сервера. */
  columns: readonly PieceColumnV1[];
  /** Площадки, свёрнутые в «ещё N». */
  restColumns: readonly PieceColumnV1[];
  filters: PiecesFilters;
  /**
   * Успокоившийся запрос: по нему уже отобраны строки, и ровно его слова
   * подсвечиваются. Подсветка по тому, что человек ещё дописывает, обещала бы
   * отбор, которого пока нет.
   */
  query?: string;
  expandedId: string | null;
  expansion?: PieceExpansion;
  canWrite: boolean;
  notice?: string | null;
  errorMessage?: string;
  restrictedReason?: ReactNode;
  readOnlyNote?: ReactNode;
  columnsMenuOpen: boolean;
  chosenColumns: readonly string[];
  onFilterChange: <K extends keyof PiecesFilters>(
    key: K,
    value: PiecesFilters[K]
  ) => void;
  onToggleColumn: (platform: string) => void;
  onToggleColumnsMenu: () => void;
  onExpand: (id: string) => void;
  onOpenPiece: (id: string) => void;
  onAdapt: (id: string, platform?: string) => void;
  /** Удалить заготовку из раскрытой строки (`97dq.30`). */
  onDelete: (id: string) => void;
  /** Клетка с адаптацией ведёт во вкладку её канала на странице заготовки. */
  onOpenPost: (pieceId: string, cell: PieceCellV1) => void;
  onNewPiece: () => void;
  onRetry: () => void;
}) {
  const t = piecesCopy[locale];
  const busy = state === 'loading';
  const allColumns = [...columns, ...restColumns];
  const found = query ?? '';
  /*
    Имя площадки человеку, а не идентификатор провайдера: сервер кладёт в
    `name` сам `telegram`, и шапка, фишка, подсказка и доступное имя берут его
    из одного места — `platformName` в адаптере.
  */
  const columnName = (column: PieceColumnV1) =>
    platformName(column.platform, locale, column.name);
  const sortWords =
    locale === 'ru'
      ? {
          label: 'Сортировка',
          dateDesc: 'Сначала новые',
          dateAsc: 'Сначала старые',
          titleAsc: 'Название А–Я',
          titleDesc: 'Название Я–А',
          formatAsc: 'Формат А–Я',
          formatDesc: 'Формат Я–А',
        }
      : {
          label: 'Sort by',
          dateDesc: 'Newest first',
          dateAsc: 'Oldest first',
          titleAsc: 'Name A–Z',
          titleDesc: 'Name Z–A',
          formatAsc: 'Format A–Z',
          formatDesc: 'Format Z–A',
        };

  const sortParts = filters.sort.split(':');
  const activeSortField = sortParts[0] as PieceSortField;
  const activeSortDirection = sortParts[1] as PieceSortDirection;

  const sortFor = (field: PieceSortField) => ({
    direction:
      activeSortField === field ? activeSortDirection : null,
    onToggle: () => {
      const direction: PieceSortDirection =
        activeSortField === field
          ? activeSortDirection === 'asc'
            ? 'desc'
            : 'asc'
          : 'asc';
      onFilterChange('sort', `${field}:${direction}` as PieceSort);
    },
  });

  const originWord = (row: PieceRowV1) =>
    row.origin === 'thought'
      ? t.originThought
      : row.origin === 'link'
      ? t.originLink
      : row.origin === 'foreign_post'
      ? t.originForeign
      : row.origin === 'instruction'
      ? t.originInstruction
      : row.origin === 'lead'
      ? t.originLead
      : row.origin === 'legacy'
      ? t.originLegacy
      : t.originManual;

  /** Подстрока происхождения под заголовком, и «суть не выделена» рядом. */
  const subtitle = (row: PieceRowV1) =>
    row.coreExtracted
      ? originWord(row)
      : `${originWord(row)} · ${t.coreMissing}`;

  /*
    Счёт стоит подписью рядом с названием, а не отдельной строкой под ним: это
    та же вещь — «Заготовки, их три», — и разнесённая на два абзаца она
    читается как заголовок и сообщение.
  */
  const head = (
    <header className="flex min-w-0 flex-col gap-[8px]">
      <div className="flex flex-wrap items-end justify-between gap-[16px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.title}{' '}
            <span className="cf-caption text-cf-ink-muted">
              {`· ${t.subtitle(rows.length)}`}
            </span>
          </h2>
          <p className="max-w-[66ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.lead}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          disabled={!canWrite}
          onClick={onNewPiece}
        >
          {t.newPiece}
        </Button>
      </div>
    </header>
  );

  /* Accessible names remain on the controls; visible labels are omitted so
     every list screen has one toolbar row with one vertical alignment. */
  const controls = (
    <FiltersRow
      aria-label={t.title}
      trailing={
        allColumns.length > columns.length || chosenColumns.length > 0 ? (
          <>
            <Button
              type="button"
              variant="secondary"
              aria-expanded={columnsMenuOpen}
              data-piece-columns-menu={columnsMenuOpen ? 'open' : 'closed'}
              onClick={onToggleColumnsMenu}
            >
              {t.columnsLabel}
            </Button>
            {columnsMenuOpen ? (
              <div className="absolute end-0 top-[100%] z-[300] mt-[8px] flex min-w-[240px] flex-col gap-[4px] rounded-[8px] border border-cf-border bg-cf-surface-raised p-[8px]">
                {allColumns.map((column) => (
                  <CheckboxField
                    key={column.platform}
                    name={`pieces-column-${column.platform}`}
                    label={column.name}
                    checked={columns.some(
                      (one) => one.platform === column.platform
                    )}
                    onChange={() => onToggleColumn(column.platform)}
                  />
                ))}
                <p className="max-w-[48ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                  {t.columnsHint}
                </p>
              </div>
            ) : null}
          </>
        ) : null
      }
    >
      <Input
        standalone
        name="pieces-search"
        aria-label={t.searchLabel}
        placeholder={t.searchPlaceholder}
        fieldClassName="w-[320px] max-w-full"
        value={filters.q}
        onChange={(event) => onFilterChange('q', event.target.value)}
      />
      {/*
        Две полосы фишек вместо двух списков, и это не украшение: пара
        «Площадка + Состояние» читается одной фразой, а два закрытых списка
        прятали и то, какие площадки вообще есть, и то, что состояний семь.
        Площадки — ровно те, что пришли колонками; выдуманных здесь нет.
      */}
      <ChipFilter
        name="platform"
        label={t.platformFilterLabel}
        value={filters.platform}
        onChange={(value) => onFilterChange('platform', value)}
        options={[
          { value: 'ALL', label: t.platformFilterAll },
          ...allColumns.map((column) => ({
            value: column.platform,
            label: columnName(column),
          })),
        ]}
      />
      <ChipFilter
        name="state"
        label={t.stateFilterLabel}
        value={filters.state}
        onChange={(value) =>
          onFilterChange('state', value as PiecesFilters['state'])
        }
        options={[
          { value: 'ALL', label: t.stateFilterAll },
          ...FILTER_STATES.map((state) => ({
            value: state,
            label: stateWord(state, t),
            icon: <StateGlyph state={state} />,
          })),
          { value: 'archived', label: t.archived },
        ]}
      />
      <Select
        standalone
        name="pieces-sort"
        aria-label={sortWords.label}
        className="w-[176px] max-w-full table:hidden"
        value={filters.sort}
        onChange={(event) => {
          const value = event.target.value;
          onFilterChange('sort', isPieceSort(value) ? value : 'date:desc');
        }}
      >
        <option value="date:desc">{sortWords.dateDesc}</option>
        <option value="date:asc">{sortWords.dateAsc}</option>
        <option value="title:asc">{sortWords.titleAsc}</option>
        <option value="title:desc">{sortWords.titleDesc}</option>
        <option value="format:asc">{sortWords.formatAsc}</option>
        <option value="format:desc">{sortWords.formatDesc}</option>
      </Select>
    </FiltersRow>
  );

  /**
   * Что стоит рядом с кодом строки.
   *
   * Только архив. Пилюля «самого сильного состояния» отсюда ушла: она
   * считалась из тех же клеток, что стоят в этой же строке правее, и на
   * одобренном макете её нет — строка говорила «черновик», не называя, где
   * именно черновик, а колонка площадки отвечала на тот же вопрос точнее.
   * «В архиве» осталось: этого клетки не знают, это свойство самой заготовки.
   */
  const rowStatuses = (row: PieceRowV1) =>
    row.archivedAt ? (
      <span data-piece-row-status="archived" className="flex flex-wrap gap-[4px]">
        <Status tone="warning">{t.archived}</Status>
      </span>
    ) : null;

  /** Кнопка раскрытия: своё имя, стрелка вместо подписи, одна на оба вида. */
  const expandButton = (row: PieceRowV1, open: boolean) => (
    <Button
      type="button"
      variant="quiet"
      density="dense"
      iconOnly
      aria-label={open ? t.collapse : t.expand}
      aria-expanded={open}
      data-piece-expand={row.code}
      onClick={() => onExpand(row.id)}
    >
      <Chevron open={open} />
    </Button>
  );

  /** Что видно под раскрытой строкой: суть слева, адаптации и действия справа. */
  const expanded = (row: PieceRowV1) => (
    <div className="flex min-w-0 flex-col gap-[12px]">
      {expansion?.loading ? <SkeletonRows rows={2} label={t.loading} /> : null}

      <div className="grid min-w-0 gap-[24px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-[8px]">
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {t.excerptLabel}
          </p>
          {row.excerpt.length > 0 ? (
            <div className="flex flex-col gap-[4px]">
              {row.excerpt.map((line, index) => (
                <p
                  key={`${row.id}-line-${index}`}
                  className="max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]"
                >
                  <HighlightedWords
                    text={line}
                    query={found}
                    matchedForms={row.matchedForms}
                  />
                </p>
              ))}
            </div>
          ) : (
            <p className="cf-body-sm text-cf-ink-muted">{t.coreMissing}</p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-[8px]">
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {t.adaptationsLabel}
          </p>
          {expansion && expansion.adaptations.length > 0 ? (
            <ul className="flex flex-col gap-[4px]">
              {expansion.adaptations.map((adaptation) => (
                <li
                  key={adaptation.id}
                  data-piece-adaptation={adaptation.id}
                  className="flex flex-wrap items-center gap-[8px] cf-body-sm text-cf-ink"
                >
                  <span>
                    {adaptation.integrationName ?? adaptation.platform}
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
                    {adaptation.state === 'published'
                      ? t.statePublished
                      : adaptation.state === 'queued'
                      ? t.stateQueued
                      : adaptation.state === 'error'
                      ? t.stateError
                      : t.stateDraft}
                  </Status>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cf-body-sm text-cf-ink-muted">{t.adaptationsEmpty}</p>
          )}

          <div className="mt-[4px] flex flex-wrap gap-[8px]">
            <Button
              type="button"
              variant="quiet"
              density="dense"
              disabled={!canWrite}
              onClick={() => onAdapt(row.id)}
            >
              {t.adapt}
            </Button>
            <ConfirmButton
              label={t.deletePiece}
              armedLabel={t.deletePieceArmed}
              disabled={!canWrite}
              data-piece-delete={row.code}
              onConfirm={() => onDelete(row.id)}
            />
          </div>
        </div>
      </div>
    </div>
  );

  /** Одна строка как карточка — то, чем таблица становится на узком экране. */
  const card = (row: PieceRowV1) => {
    const open = expandedId === row.id;
    return (
      <li
        key={`${row.id}-card`}
        data-piece-card={row.code}
        className={clsx(
          'flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border p-[16px]',
          open ? 'bg-cf-surface-subtle' : 'bg-cf-surface'
        )}
      >
        <div className="flex flex-wrap items-baseline gap-[8px]">
          {/*
            Раскрытие есть и на карточке: узкий экран — не повод отобрать у
            человека способ посмотреть суть, не уходя со списка.
          */}
          {expandButton(row, open)}
          <span className="cf-label-sm text-cf-signature">{row.code}</span>
          {rowStatuses(row)}
          <span className="cf-caption tabular-nums text-cf-ink-muted">
            {row.date}
          </span>
        </div>
        <a
          href={`/content/pieces/${encodeURIComponent(row.id)}`}
          className="cf-label-md text-cf-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cf-focus"
        >
          <HighlightedWords
            text={row.title}
            query={found}
            matchedForms={row.matchedForms}
          />
        </a>
        <p className="cf-body-sm text-cf-ink-muted">
          <HighlightedWords
            text={row.searchSnippet ?? row.excerpt.join(' ').slice(0, 160)}
            query={found}
            matchedForms={row.matchedForms}
          />
        </p>
        <p
          data-piece-card-origin={row.origin}
          className="cf-caption text-cf-ink-muted"
        >
          {subtitle(row)}
        </p>
        <div className="flex flex-wrap gap-[8px]">
          {columns.map((column) => (
            <AdaptationCell
              key={`${row.id}-${column.platform}-card`}
              locale={locale}
              cell={cellOf(row, column.platform)}
              platformName={columnName(column)}
              /* Колонок здесь нет — площадку называет сама клетка. */
              showPlatformName
              disabled={!canWrite}
              onOpenPost={(cell) => onOpenPost(row.id, cell)}
              onAdapt={(cell) => onAdapt(row.id, cell.platform)}
            />
          ))}
        </div>
        {open ? expanded(row) : null}
      </li>
    );
  };

  return (
    <section
      data-content-panel="pieces"
      data-piece-state={state}
      aria-busy={busy}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      {head}

      {state === 'restricted' ? (
        <RestrictedState title={t.restrictedTitle} reason={restrictedReason} />
      ) : state === 'error' ? (
        <ErrorState
          title={t.errorTitle}
          description={errorMessage ?? t.errorBody}
          action={
            <Button type="button" variant="secondary" onClick={onRetry}>
              {t.retry}
            </Button>
          }
        />
      ) : state === 'loading' ? (
        // Скелетон стоит здесь ровно один раз — до первого ответа. Дальше
        // контейнер держит прежний список (`keepPreviousData`), и поиск
        // перестал подменяться скелетоном на каждой букве, забирая каретку.
        <SkeletonRows rows={4} label={t.loading} className="[&>*]:h-[56px]" />
      ) : state === 'empty' ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyBody}
          action={
            <Button type="button" variant="primary" onClick={onNewPiece}>
              {t.emptyAction}
            </Button>
          }
        />
      ) : (
        <>
          {readOnlyNote}
          {controls}
          {notice ? (
            <p role="status" className="cf-body-sm text-cf-accent">
              {notice}
            </p>
          ) : null}

          {/*
            Ниже 720 px — карточки, выше — таблица. Оба списка в разметке
            всегда, а переключает их именованный экран `table`: узкий экран,
            который прокручивает таблицу вбок, прячет ровно то, ради чего
            таблица и заведена, — состояние по площадкам.
          */}
          <ul
            data-piece-cards="true"
            className="flex flex-col gap-[8px] table:hidden"
          >
            {rows.map((row) => card(row))}
          </ul>

          <Panel
            contentPadding="none"
            className="hidden min-w-0 overflow-hidden table:block"
          >
            <div
              data-piece-table="true"
              data-piece-table-min-width={PIECE_TABLE_MIN_WIDTH}
            >
              <Table caption={t.title}>
                <thead>
                  <tr>
                    <Th
                      banded
                      className="sticky start-0 z-[2]"
                      style={{ width: ARROW_WIDTH }}
                    >
                      <span className="sr-only">{t.expand}</span>
                    </Th>
                    <Th
                      banded
                      className="sticky z-[2] w-[96px]"
                      style={{ insetInlineStart: ARROW_WIDTH }}
                      sort={sortFor('code')}
                    >
                      {t.columnCode}
                    </Th>
                    <Th banded sort={sortFor('title')}>
                      {t.columnTitle}
                    </Th>
                    <Th banded className="w-[96px]" sort={sortFor('format')}>
                      {t.columnFormat}
                    </Th>
                    <Th banded className="w-[96px]" sort={sortFor('date')}>
                      {t.columnDate}
                    </Th>
                    {columns.map((column) => (
                      <Th
                        banded
                        key={column.platform}
                        data-piece-column={column.platform}
                        /* Колонка под квадрат 28 px, а не под слово: до этой
                           волны каждая занимала 160 px под «запланировано». */
                        className="w-[84px] text-center"
                      >
                        {columnName(column)}
                      </Th>
                    ))}
                    {restColumns.length > 0 ? (
                      <Th
                        banded
                        data-piece-column-rest="true"
                        className="w-[96px]"
                      >
                        {t.columnRest(restColumns.length)}
                      </Th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const open = expandedId === row.id;
                    const span =
                      5 + columns.length + (restColumns.length > 0 ? 1 : 0);
                    const pinned = open
                      ? 'bg-cf-surface-subtle'
                      : 'bg-cf-surface';
                    return (
                      <Fragment key={row.id}>
                        <Tr
                          data-piece-row={row.code}
                          onClick={() => onOpenPiece(row.id)}
                          data-piece-row-open={open ? 'true' : undefined}
                          className={clsx(open && 'bg-cf-surface-subtle')}
                        >
                          <Td
                            className={clsx(
                              'sticky start-0 z-[1] py-[8px] align-top',
                              pinned
                            )}
                            style={{ width: ARROW_WIDTH }}
                          >
                            {expandButton(row, open)}
                          </Td>
                          <Td
                            className={clsx(
                              'sticky z-[1] py-[8px] align-top cf-label-sm text-cf-signature',
                              pinned
                            )}
                            style={{ insetInlineStart: ARROW_WIDTH }}
                          >
                            <span className="flex flex-col items-start gap-[4px]">
                              <span>{row.code}</span>
                              {rowStatuses(row)}
                            </span>
                          </Td>
                          <Td className="py-[8px] align-top">
                            <span className="flex min-w-0 flex-col gap-[4px]">
                              <a
                                href={`/content/pieces/${encodeURIComponent(
                                  row.id
                                )}`}
                                className="cf-label-md text-cf-ink [overflow-wrap:anywhere] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cf-focus"
                              >
                                <HighlightedWords
                                  text={row.title}
                                  query={found}
                                  matchedForms={row.matchedForms}
                                />
                              </a>
                              <span
                                data-piece-snippet="true"
                                className="cf-body-sm text-cf-ink-muted"
                              >
                                <HighlightedWords
                                  text={
                                    row.searchSnippet ??
                                    row.excerpt.join(' ').slice(0, 160)
                                  }
                                  query={found}
                                  matchedForms={row.matchedForms}
                                />
                              </span>
                              <span
                                data-piece-origin={row.origin}
                                className="cf-caption text-cf-ink-muted"
                              >
                                {subtitle(row)}
                              </span>
                            </span>
                          </Td>
                          <Td className="py-[8px] align-top cf-body-sm text-cf-ink-muted">
                            {row.format}
                          </Td>
                          <Td className="py-[8px] align-top cf-caption tabular-nums text-cf-ink-muted">
                            {row.date}
                          </Td>
                          {columns.map((column) => (
                            <Td
                              key={`${row.id}-${column.platform}`}
                              className="py-[8px] align-top"
                            >
                              {/*
                                Все колонки прижаты кверху: строка многострочная,
                                и начало строки читается по верху. Клетка по
                                центру высоты стояла ниже кода и заголовка
                                (`97dq.35`). Блочная обёртка, а не `text-center`:
                                инлайновая клетка садилась бы на базовую линию
                                строки ячейки и съезжала вниз на её выносной
                                элемент.
                              */}
                              <span
                                data-piece-cell-slot="true"
                                className="flex justify-center"
                              >
                                <AdaptationCell
                                  locale={locale}
                                  cell={cellOf(row, column.platform)}
                                  platformName={columnName(column)}
                                  disabled={!canWrite}
                                  onOpenPost={(cell) => onOpenPost(row.id, cell)}
                                  onAdapt={(cell) =>
                                    onAdapt(row.id, cell.platform)
                                  }
                                />
                              </span>
                            </Td>
                          ))}
                          {restColumns.length > 0 ? (
                            <Td className="py-[8px] align-top cf-caption text-cf-ink-muted">
                              {t.columnRest(restColumns.length)}
                            </Td>
                          ) : null}
                        </Tr>
                        {open ? (
                          <tr
                            data-piece-row-expansion={row.code}
                            className="bg-cf-surface-subtle"
                          >
                            <td
                              colSpan={span}
                              className="border-b border-cf-border px-[12px] pb-[20px] pt-[4px]"
                            >
                              {expansion?.failed ? (
                                <ErrorState
                                  title={t.errorTitle}
                                  description={t.errorBody}
                                  action={
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      onClick={onRetry}
                                    >
                                      {t.retry}
                                    </Button>
                                  }
                                />
                              ) : (
                                expanded(row)
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Panel>

          {/*
            Легенда — не украшение под таблицей, а место, где слово состояния
            остаётся видимым без наведения: из клетки оно ушло в подсказку, и
            без легенды цвет со значком остались бы единственным носителем.
            Одна на оба вида списка: карточки и таблица читаются одинаково.
          */}
          <div className="flex flex-wrap items-center gap-[8px]">
            <AdaptationLegend locale={locale} />
            <Hint label={t.legendHintLabel}>{t.legendHint}</Hint>
          </div>
        </>
      )}
    </section>
  );
}

export default PiecesScreen;
