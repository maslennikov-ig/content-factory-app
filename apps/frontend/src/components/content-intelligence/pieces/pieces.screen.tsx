'use client';

import { Fragment, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
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
import { AdaptationCell, stateWord } from './adaptation.cell';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import {
  PIECE_TABLE_MIN_WIDTH,
  cellOf,
  type AdaptationV1,
  type PieceCellV1,
  type PieceCellStateV1,
  type PieceColumnV1,
  type PieceRowV1,
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

type RowState = Extract<
  PieceCellStateV1,
  'error' | 'queued' | 'published' | 'draft'
>;

const ROW_STATE_PRIORITY: readonly RowState[] = [
  'error',
  'queued',
  'published',
  'draft',
];

const ROW_STATE_TONE = {
  error: 'danger',
  queued: 'info',
  published: 'accent',
  draft: 'neutral',
} as const;

/** The row calls out the state that needs attention before quieter states. */
export const strongestRowState = (
  row: Pick<PieceRowV1, 'cells'>
): RowState | null =>
  ROW_STATE_PRIORITY.find((state) =>
    row.cells?.some((cell) => cell.state === state)
  ) ?? null;

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
  onOpenPost: (cell: PieceCellV1) => void;
  onNewPiece: () => void;
  onRetry: () => void;
}) {
  const t = piecesCopy[locale];
  const busy = state === 'loading';
  const allColumns = [...columns, ...restColumns];
  const found = query ?? '';

  const originWord = (row: PieceRowV1) =>
    row.origin === 'thought'
      ? t.originThought
      : row.origin === 'link'
      ? t.originLink
      : row.origin === 'foreign_post'
      ? t.originForeign
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
      <Select
        standalone
        name="pieces-missing-on"
        aria-label={t.missingOnLabel}
        className="w-[160px] max-w-full"
        value={filters.missingOn}
        onChange={(event) => onFilterChange('missingOn', event.target.value)}
      >
        <option value="ALL">{t.missingOnAll}</option>
        {allColumns.map((column) => (
          <option key={column.platform} value={column.platform}>
            {column.name}
          </option>
        ))}
      </Select>
      <Select
        standalone
        name="pieces-state"
        aria-label={t.stateFilterLabel}
        className="w-[140px] max-w-full"
        value={filters.state}
        onChange={(event) =>
          onFilterChange('state', event.target.value as PiecesFilters['state'])
        }
      >
        <option value="ALL">{t.stateFilterAll}</option>
        <option value="published">{t.statePublished}</option>
        <option value="queued">{t.stateQueued}</option>
        <option value="draft">{t.stateDraft}</option>
        <option value="error">{t.stateError}</option>
        <option value="archived">{t.archived}</option>
      </Select>
    </FiltersRow>
  );

  const rowStatuses = (row: PieceRowV1) => {
    const strongest = strongestRowState(row);
    return (
      <span
        data-piece-row-status={strongest ?? 'none'}
        className="flex flex-wrap gap-[4px]"
      >
        {row.archivedAt ? <Status tone="warning">{t.archived}</Status> : null}
        {strongest ? (
          <Status tone={ROW_STATE_TONE[strongest]}>
            {stateWord(strongest, t)}
          </Status>
        ) : null}
      </span>
    );
  };

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
              platformName={column.name}
              disabled={!canWrite}
              onOpenPost={onOpenPost}
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
                    >
                      {t.columnCode}
                    </Th>
                    <Th banded>{t.columnTitle}</Th>
                    <Th banded className="w-[96px]">
                      {t.columnFormat}
                    </Th>
                    <Th banded className="w-[96px]">
                      {t.columnDate}
                    </Th>
                    {columns.map((column) => (
                      <Th
                        banded
                        key={column.platform}
                        data-piece-column={column.platform}
                        className="w-[160px]"
                      >
                        {column.name}
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
                              <AdaptationCell
                                locale={locale}
                                cell={cellOf(row, column.platform)}
                                platformName={column.name}
                                disabled={!canWrite}
                                onOpenPost={onOpenPost}
                                onAdapt={(cell) =>
                                  onAdapt(row.id, cell.platform)
                                }
                              />
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
        </>
      )}
    </section>
  );
}

export default PiecesScreen;
