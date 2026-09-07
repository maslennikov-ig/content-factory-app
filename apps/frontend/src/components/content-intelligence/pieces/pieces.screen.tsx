'use client';

import { Fragment, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import {
  EmptyState,
  ErrorState,
  RestrictedState,
  SkeletonRows,
  Status,
} from '../../ui/surface';
import { BriefReceipt } from '../intake/brief.receipt';
import { SlopFindings } from '../intake/slop-findings';
import { AdaptationCell } from './adaptation.cell';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import {
  PIECE_TABLE_MIN_WIDTH,
  cellOf,
  type AdaptationV1,
  type PieceCellV1,
  type PieceColumnV1,
  type PieceRowV1,
  type PiecesFilters,
  type VoiceScreenStateV1,
  type ZagotovkaCoreV1,
} from './pieces.adapter';

/**
 * Таблица заготовок: по колонке на площадку, в клетке — состояние.
 *
 * Решение владельца 06.09.2026, §11.4–11.7 карты раздела. Экран рисует и
 * ничего не просит: ни одного `fetch`, ни одного SWR-ключа — всё приходит
 * сверху от `pieces.container.tsx`, как у входа рядом. Сцены обзора открывают
 * этот файл во всех состояниях без сети именно поэтому.
 *
 * Четыре вещи в разметке — решения, а не оформление.
 *
 * **Первая колонка закреплена** (`sticky`): при боковой прокрутке по десяти
 * площадкам код и заголовок остаются на месте, иначе человек читает ряд
 * состояний, не зная, чьи они.
 *
 * **Ниже `PIECE_TABLE_MIN_WIDTH` таблицы нет вовсе.** Не «таблица с
 * прокруткой», а карточки: горизонтально прокручиваемая таблица на 390 px —
 * это способ спрятать половину состояний за краем экрана.
 *
 * **Строка раскрывается на месте**, а не уводит на страницу: `aria-expanded`
 * на кнопке кода — тот же приём, что в старой таблице материалов, и то же
 * обещание, что нажатие ничего не потеряет.
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

export function PiecesScreen({
  locale,
  state,
  rows,
  columns,
  restColumns,
  filters,
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
    row.coreExtracted ? originWord(row) : `${originWord(row)} · ${t.coreMissing}`;

  const head = (
    <header className="flex min-w-0 flex-col gap-[8px]">
      <div className="flex flex-wrap items-start justify-between gap-[16px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.title}
          </h2>
          <p className="cf-caption text-cf-ink-muted">{t.subtitle(rows.length)}</p>
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
      <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {t.lead}
      </p>
    </header>
  );

  const controls = (
    <div className="flex min-w-0 flex-wrap items-end gap-[8px]">
      <Input
        disableForm
        removeError
        name="pieces-search"
        label={t.searchLabel}
        placeholder={t.searchPlaceholder}
        value={filters.q}
        onChange={(event) => onFilterChange('q', event.target.value)}
      />
      <Select
        disableForm
        name="pieces-missing-on"
        label={t.missingOnLabel}
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
        disableForm
        name="pieces-state"
        label={t.stateFilterLabel}
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
      </Select>

      {/*
        «Площадки ▾» появляется только когда колонок больше, чем показано:
        меню, которое всегда одинаково полное, ничего не сообщает о выборе.
      */}
      {allColumns.length > columns.length || chosenColumns.length > 0 ? (
        <div className="flex flex-col gap-[4px]">
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
            <div className="flex min-w-0 flex-col gap-[4px] rounded-[8px] border border-cf-border bg-cf-surface p-[8px]">
              {allColumns.map((column) => (
                <CheckboxField
                  key={column.platform}
                  name={`pieces-column-${column.platform}`}
                  label={column.name}
                  checked={columns.some((one) => one.platform === column.platform)}
                  onChange={() => onToggleColumn(column.platform)}
                />
              ))}
              <p className="max-w-[48ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.columnsHint}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const expanded = (row: PieceRowV1) => (
    <div className="flex min-w-0 flex-col gap-[12px]">
      {expansion?.loading ? (
        <SkeletonRows rows={2} label={t.loading} />
      ) : null}

      <div className="grid min-w-0 gap-[16px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="cf-body-sm text-cf-ink-muted">{t.coreMissing}</p>
          )}

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
                  <span>{adaptation.integrationName ?? adaptation.platform}</span>
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

          <div className="flex flex-wrap gap-[8px]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenPiece(row.id)}
            >
              {t.openPiece}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!canWrite}
              onClick={() => onAdapt(row.id)}
            >
              {t.adapt}
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-[16px]">
          {expansion?.core ? (
            <BriefReceipt
              locale={locale}
              brief={expansion.core.brief}
              overrides={{}}
              readOnly
              onOverride={() => undefined}
              onKindChange={() => undefined}
              onRevert={() => undefined}
            />
          ) : null}
          {expansion?.core ? (
            <SlopFindings
              locale={locale}
              text={expansion.core.text}
              report={expansion.core.slop}
            />
          ) : null}
        </div>
      </div>
    </div>
  );

  /** Одна строка как карточка — то, чем таблица становится на узком экране. */
  const card = (row: PieceRowV1) => (
    <li
      key={`${row.id}-card`}
      data-piece-card={row.code}
      className="flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
    >
      <div className="flex flex-wrap items-baseline gap-[8px]">
        <span className="cf-label-sm text-cf-ink-muted">{row.code}</span>
        <span className="cf-caption text-cf-ink-muted">{row.date}</span>
      </div>
      <p className="cf-body-md text-cf-ink [text-wrap:pretty]">{row.title}</p>
      <p className="cf-caption text-cf-ink-muted">{subtitle(row)}</p>
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
      <Button type="button" variant="secondary" onClick={() => onOpenPiece(row.id)}>
        {t.openPiece}
      </Button>
    </li>
  );

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
            всегда, а переключает их брейкпоинт: узкий экран, который
            прокручивает таблицу вбок, прячет ровно то, ради чего таблица и
            заведена, — состояние по площадкам.
          */}
          <ul
            data-piece-cards="true"
            className="flex flex-col gap-[8px] min-[720px]:hidden"
          >
            {rows.map((row) => card(row))}
          </ul>

          <div
            data-piece-table="true"
            data-piece-table-min-width={PIECE_TABLE_MIN_WIDTH}
            className="hidden min-w-0 overflow-x-auto rounded-[8px] border border-cf-border bg-cf-surface min-[720px]:block"
          >
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-cf-border">
                  <th
                    scope="col"
                    className="sticky start-0 z-[1] bg-cf-surface px-[12px] py-[8px] text-start cf-label-sm uppercase text-cf-ink-muted"
                  >
                    {t.columnCode}
                  </th>
                  <th
                    scope="col"
                    className="px-[12px] py-[8px] text-start cf-label-sm uppercase text-cf-ink-muted"
                  >
                    {t.columnFormat}
                  </th>
                  <th
                    scope="col"
                    className="px-[12px] py-[8px] text-start cf-label-sm uppercase text-cf-ink-muted"
                  >
                    {t.columnDate}
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.platform}
                      scope="col"
                      data-piece-column={column.platform}
                      className="px-[12px] py-[8px] text-start cf-label-sm uppercase text-cf-ink-muted"
                    >
                      {column.name}
                    </th>
                  ))}
                  {restColumns.length > 0 ? (
                    <th
                      scope="col"
                      data-piece-column-rest="true"
                      className="px-[12px] py-[8px] text-start cf-label-sm uppercase text-cf-ink-muted"
                    >
                      {t.columnRest(restColumns.length)}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const open = expandedId === row.id;
                  const span = 3 + columns.length + (restColumns.length > 0 ? 1 : 0);
                  return (
                    <Fragment key={row.id}>
                      <tr
                        data-piece-row={row.code}
                        data-piece-row-open={open ? 'true' : undefined}
                        className={clsx(
                          'border-b border-cf-border',
                          open && 'bg-cf-surface-subtle'
                        )}
                      >
                        <th
                          scope="row"
                          className={clsx(
                            'sticky start-0 z-[1] px-[12px] py-[8px] text-start align-top',
                            open ? 'bg-cf-surface-subtle' : 'bg-cf-surface'
                          )}
                        >
                          <Button
                            type="button"
                            variant="quiet"
                            aria-expanded={open}
                            data-piece-expand={row.code}
                            onClick={() => onExpand(row.id)}
                          >
                            <span className="flex min-w-0 flex-col items-start gap-[4px]">
                              <span className="cf-label-sm text-cf-ink-muted">
                                {row.code}
                              </span>
                              <span className="cf-body-sm text-cf-ink [overflow-wrap:anywhere]">
                                {row.title}
                              </span>
                              <span
                                data-piece-origin={row.origin}
                                className="cf-caption text-cf-ink-muted"
                              >
                                {subtitle(row)}
                              </span>
                            </span>
                          </Button>
                        </th>
                        <td className="px-[12px] py-[8px] align-top cf-caption text-cf-ink-muted">
                          {row.format}
                        </td>
                        <td className="px-[12px] py-[8px] align-top cf-caption tabular-nums text-cf-ink-muted">
                          {row.date}
                        </td>
                        {columns.map((column) => (
                          <td
                            key={`${row.id}-${column.platform}`}
                            className="px-[12px] py-[8px] align-top"
                          >
                            <AdaptationCell
                              locale={locale}
                              cell={cellOf(row, column.platform)}
                              platformName={column.name}
                              disabled={!canWrite}
                              onOpenPost={onOpenPost}
                              onAdapt={(cell) => onAdapt(row.id, cell.platform)}
                            />
                          </td>
                        ))}
                        {restColumns.length > 0 ? (
                          <td className="px-[12px] py-[8px] align-top cf-caption text-cf-ink-muted">
                            {t.columnRest(restColumns.length)}
                          </td>
                        ) : null}
                      </tr>
                      {open ? (
                        <tr data-piece-row-expansion={row.code}>
                          <td colSpan={span} className="px-[12px] pb-[16px]">
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
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default PiecesScreen;
