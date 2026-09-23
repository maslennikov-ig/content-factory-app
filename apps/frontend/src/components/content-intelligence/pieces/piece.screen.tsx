'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Tab, TabList, TabPanel, Tabs } from '@contentfactory/react/choice/tabs';
import { useEnterMotion } from '../../ui/enter-motion';
import { PlusIcon } from '@contentfactory/frontend/components/ui/icons';
import { ConfirmButton } from '../../ui/confirm-button';
import {
  ErrorState,
  RestrictedState,
  SkeletonRows,
  Status,
} from '../../ui/surface';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import { StateSquare, stateWord } from './adaptation.cell';
import {
  NEW_PIECE_PATH,
  PIECE_TAB_CORE,
  platformName,
  workspaceTabs,
  type PieceWorkspaceV1,
  type VoiceScreenStateV1,
  type WorkspaceChannel,
} from './pieces.adapter';
import { WorkspaceMenu } from './workspace-menu';

/**
 * Страница заготовки — одно рабочее место с вкладками (`97dq.37`, вариант A).
 *
 * Решение владельца 22.09.2026: «мне однозначно нравится вариант А». Первая
 * вкладка — «Суть», дальше по вкладке на канал; значок вкладки — та же клетка
 * состояния, что в таблице «Заготовки» (карандаш — черновик, часы —
 * запланировано, галочка — опубликовано, пунктирный плюс — ещё нет). Вкладка
 * живёт в адресе. Всё, что нужно довести адаптацию до публикации, — во
 * вкладке её канала; окно «Создать пост» со страницы не открывается.
 *
 * Экран рисует и ничего не просит: вкладки собирает контейнер, здесь —
 * шапка, полоса вкладок и состояния страницы (загрузка, ошибка, отказ).
 *
 * На узком экране полоса вкладок прокручивается вбок, а не переносится:
 * перенесённая полоса читается как два ряда разных вещей.
 */
export function PieceScreen({
  locale,
  state,
  detail,
  channels,
  tab,
  canWrite,
  busy,
  coreTab,
  renderChannelTab,
  errorMessage,
  notice,
  restrictedReason,
  readOnlyNote,
  onTabChange,
  onArchive,
  onDelete,
  onRetry,
  onTitleSave,
}: {
  locale: PiecesLocale;
  state: VoiceScreenStateV1;
  detail: PieceWorkspaceV1 | null;
  /** Каналы рабочего места (`workspaceChannels`). */
  channels: readonly WorkspaceChannel[];
  /** `core` или идентификатор канала. */
  tab: string;
  canWrite: boolean;
  busy: boolean;
  coreTab: ReactNode;
  renderChannelTab: (channel: WorkspaceChannel) => ReactNode;
  errorMessage?: string;
  notice?: string | null;
  restrictedReason?: ReactNode;
  readOnlyNote?: ReactNode;
  onTabChange: (tab: string) => void;
  onArchive: () => void;
  /** Удалить заготовку насовсем (`97dq.30`); подтверждение — в самой кнопке. */
  onDelete: () => void;
  onRetry: () => void;
  onTitleSave?: (title: string) => Promise<void>;
}) {
  const t = piecesCopy[locale];
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState('');
  // A tab switch fades the panel in, 150ms (`97dq.59`); the tabs stay put.
  const panelMotion = useEnterMotion<HTMLDivElement>(tab, 'cf-tab-enter');

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

  const saveTitle = async (event: FormEvent) => {
    event.preventDefault();
    if (!titleValue.trim() || !onTitleSave) return;
    setTitleSaving(true);
    setTitleError('');
    try {
      await onTitleSave(titleValue.trim());
      setEditingTitle(false);
    } catch {
      setTitleError(t.titleFailed);
    } finally {
      setTitleSaving(false);
    }
  };

  const originWord =
    piece.origin === 'thought'
      ? t.originThought
      : piece.origin === 'link'
      ? t.originLink
      : piece.origin === 'foreign_post'
      ? t.originForeign
      : piece.origin === 'instruction'
      ? t.originInstruction
      : piece.origin === 'lead'
      ? t.originLead
      : piece.origin === 'legacy'
      ? t.originLegacy
      : t.originManual;

  /*
    Хост вместо полного адреса: в строке крошек длинная ссылка переносится
    посреди пути и перестаёт читаться как источник.
  */
  const hostOf = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  const { shown, more } = workspaceTabs(channels, tab);
  const tabLabel = (channel: WorkspaceChannel) =>
    `${platformName(channel.platform, locale, channel.platformName)} · ${
      channel.name
    }`;
  const active =
    tab === PIECE_TAB_CORE
      ? PIECE_TAB_CORE
      : channels.find((channel) => channel.id === tab)?.id ?? PIECE_TAB_CORE;
  const activeChannel = channels.find((channel) => channel.id === active);

  const link =
    'underline underline-offset-2 hover:text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus';

  return (
    <section
      data-content-panel="piece"
      data-piece-state={state}
      data-piece-id={piece.id}
      data-piece-tab={active}
      aria-busy={busy}
      className="flex w-full min-w-0 flex-1 flex-col gap-[20px] p-[16px] md:p-[24px] lg:px-[32px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <nav
        aria-label={t.breadcrumbSection}
        className="flex min-w-0 flex-wrap items-center gap-[8px] cf-caption text-cf-ink-muted"
      >
        <a href="/content?tab=materials" className={link}>
          {t.breadcrumbSection}
        </a>
        <span aria-hidden="true">/</span>
        <a href="/content?tab=materials" className={link}>
          {t.title}
        </a>
        <span aria-hidden="true">/</span>
        <span className="cf-label-sm text-cf-signature">{piece.code}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{piece.date}</span>
        <span aria-hidden="true">·</span>
        <span data-piece-origin={piece.origin}>{originWord}</span>
        {core?.leadSource?.url ? (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {t.leadSourceLabel}:{' '}
              <a
                data-piece-lead-source={core.leadSource.leadId || 'lead'}
                href={core.leadSource.url}
                target="_blank"
                rel="noreferrer noopener"
                title={core.leadSource.title || core.leadSource.url}
                className={clsx('break-all', link)}
              >
                {hostOf(core.leadSource.url)}
              </a>
            </span>
          </>
        ) : null}
        {piece.archivedAt ? <Status>{t.archived}</Status> : null}
      </nav>

      <div className="flex min-w-0 flex-wrap items-start gap-[16px]">
        <h1 className="min-w-0 max-w-[60ch] flex-1 cf-heading-lg text-cf-ink [text-wrap:balance]">
          {canWrite && onTitleSave ? (
            <Button
              variant="quiet"
              layout="content"
              className="min-w-0 justify-start px-0 text-start"
              disabled={busy || titleSaving}
              onClick={() => {
                setTitleValue(piece.title);
                setEditingTitle(true);
                setTitleError('');
              }}
              aria-label={`${piece.title}. ${t.titleEdit}`}
            >
              <span className="cf-heading-lg [text-wrap:balance]">
                {piece.title}
              </span>
            </Button>
          ) : (
            piece.title
          )}
        </h1>
        {/*
          Выходы со страницы и «В архив» — тихий вес в одной строке с
          заголовком: главное действие страницы живёт во вкладке.
        */}
        <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-[8px]">
          <a
            href="/content?tab=materials"
            className={buttonClassName({ variant: 'quiet', density: 'dense' })}
          >
            {t.backToList}
          </a>
          <a
            href={NEW_PIECE_PATH}
            data-piece-new="true"
            className={buttonClassName({
              variant: 'secondary',
              density: 'dense',
            })}
          >
            {t.newPiece}
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
          <ConfirmButton
            label={t.deletePiece}
            armedLabel={t.deletePieceArmed}
            disabled={!canWrite || busy}
            data-piece-delete="true"
            onConfirm={onDelete}
          />
        </div>
        {editingTitle ? (
          <form
            className="flex w-full flex-wrap items-start gap-[8px]"
            onSubmit={saveTitle}
          >
            <Input
              autoFocus
              standalone
              name="piece-title"
              label={t.titleLabel}
              value={titleValue}
              maxLength={120}
              onChange={(event) => setTitleValue(event.target.value)}
              disabled={titleSaving}
            />
            <Button
              type="submit"
              loading={titleSaving}
              disabled={!titleValue.trim()}
            >
              {t.titleSave}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={titleSaving}
              onClick={() => setEditingTitle(false)}
            >
              {t.cancel}
            </Button>
            {titleError ? (
              <p role="alert" className="w-full cf-body-sm text-cf-danger">
                {titleError}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>

      {readOnlyNote}

      {detail.notice ? (
        <p role="status" className="cf-body-sm text-cf-accent">
          {detail.notice}
        </p>
      ) : null}

      <Tabs value={active} onChange={onTabChange}>
        <div className="flex min-w-0 items-end gap-[4px] border-b border-cf-border">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <TabList
              aria-label={t.tabsLabel}
              className="flex w-max min-w-full items-end gap-[4px]"
            >
              <Tab
                value={PIECE_TAB_CORE}
                data-piece-tab-button={PIECE_TAB_CORE}
                className={tabClass(active === PIECE_TAB_CORE)}
              >
                {t.tabCore}
              </Tab>
              {shown.map((channel) => (
                <Tab
                  key={channel.id}
                  value={channel.id}
                  data-piece-tab-button={channel.id}
                  data-piece-tab-state={channel.state}
                  aria-label={`${tabLabel(channel)}: ${stateWord(
                    channel.state,
                    t
                  )}`}
                  className={tabClass(active === channel.id)}
                >
                  <StateSquare state={channel.state} />
                  <span>{tabLabel(channel)}</span>
                </Tab>
              ))}
            </TabList>
          </div>
          {more.length > 0 ? (
            <div className="shrink-0 pb-[4px]">
              <WorkspaceMenu
                dataName="more-channels"
                align="end"
                triggerClassName={buttonClassName({
                  variant: 'quiet',
                  density: 'dense',
                })}
                trigger={
                  <>
                    <PlusIcon aria-hidden="true" />
                    {t.tabMoreChannels}
                  </>
                }
                items={more.map((channel) => ({
                  id: channel.id,
                  title: tabLabel(channel),
                  description: stateWord(channel.state, t),
                  onSelect: () => onTabChange(channel.id),
                }))}
              />
            </div>
          ) : null}
        </div>

        <TabPanel
          ref={panelMotion}
          value={active}
          className="flex min-w-0 flex-col gap-[24px] pt-[8px]"
        >
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
          {activeChannel ? renderChannelTab(activeChannel) : coreTab}
        </TabPanel>
      </Tabs>
    </section>
  );
}

/** Вкладка: подчёркивание выбранной, тишина остальных — как у раздела. */
const tabClass = (selected: boolean) =>
  clsx(
    'inline-flex items-center gap-[8px] whitespace-nowrap border-b-2 px-[12px] pb-[8px] pt-[4px] cf-label-md transition-colors duration-state motion-reduce:transition-none',
    selected
      ? 'border-cf-accent text-cf-ink'
      : 'border-transparent text-cf-ink-muted hover:text-cf-ink'
  );

export default PieceScreen;
