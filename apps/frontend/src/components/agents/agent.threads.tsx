'use client';

import { useCallback, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import useSWRInfinite, { unstable_serialize } from 'swr/infinite';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { Input } from '@contentfactory/react/form/input';
import { OpeningBand } from '@contentfactory/react/layout';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Dialog, Popover } from '@contentfactory/frontend/components/ui/layers';
import { ConfirmButton } from '@contentfactory/frontend/components/ui/confirm-button';
import { SkeletonRows } from '@contentfactory/frontend/components/ui/surface';
import {
  AGENT_DOORS,
  AGENT_THREAD_TITLE_MAX,
  readAgentNotifications,
  readThreadList, readPagination,
  type AgentNotificationFeed,
  type AgentPagination,
  type AgentThreadSummary,
} from './agent.contract';
import type { AgentWords } from './agent.copy';
import { AgentGlyph } from './agent.icons';

/**
 * Personal native threads, shared by the primary navigation and the compact
 * chat toolbar. The list pages on demand; rename/delete stay in its dialog.
 */

/** SWR key of the list, shared with the screen that refreshes it. */
type ThreadPage = { threads: AgentThreadSummary[]; pagination?: AgentPagination };
const threadPageKey = (page: number, previous: ThreadPage | null) =>
  previous && !previous.pagination?.hasMore ? null : `${AGENT_DOORS.threads}?page=${page}&perPage=100`;
export const THREADS_KEY = unstable_serialize(threadPageKey);

export const useAgentThreads = () => {
  const request = useFetch();
  const result = useSWRInfinite<ThreadPage>(threadPageKey, async (url: string) => {
    const response = await request(url);
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json();
    return { threads: readThreadList(body), pagination: readPagination(body) };
  }, { revalidateOnFocus: false });
  const rows = result.data?.flatMap((page) => page.threads);
  return { ...result, data: rows ? [...new Map(rows.map((row) => [row.id, row])).values()] : undefined,
    hasMore: result.data?.at(-1)?.pagination?.hasMore ?? false,
    loadingMore: result.isValidating && !!result.data,
    loadMore: () => result.setSize(result.size + 1),
  };
};

export const useAgentNotifications = () => {
  const request = useFetch();
  return useSWR<AgentNotificationFeed>(
    AGENT_DOORS.notifications,
    async (url: string) => {
      const response = await request(url);
      if (!response.ok) throw new Error(String(response.status));
      return readAgentNotifications(await response.json());
    },
    { revalidateOnFocus: false }
  );
};

export function AgentNotificationsBell({
  language,
  words,
  onOpenThread,
}: {
  language: string;
  words: AgentWords;
  onOpenThread: (id: string) => void;
}) {
  const nw = words.notifications;
  const request = useFetch();
  const feed = useAgentNotifications();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const notifications = feed.data?.notifications ?? [];
  const tasks = feed.data?.backgroundTasks ?? [];
  const unreadCount = feed.data?.unreadCount ?? 0;

  const markRead = useCallback(
    async (id: string, threadId: string | null) => {
      try {
        await request(AGENT_DOORS.notificationRead(id), {
          method: 'POST',
          body: JSON.stringify(threadId ? { threadId } : {}),
        });
        await feed.mutate();
      } catch {
        /* Keep inbox open on transient failure. */
      }
    },
    [feed, request]
  );

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await request(AGENT_DOORS.notificationsReadAll, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await feed.mutate();
    } catch {
      /* Keep inbox open on transient failure. */
    } finally {
      setMarkingAll(false);
    }
  }, [feed, request]);

  return (
    <div className="relative inline-flex items-center">
      <Button
        type="button"
        variant="quiet"
        density="dense"
        aria-label={nw.label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void feed.mutate();
        }}
      >
        <AgentGlyph name="bell" size={14} />
        {unreadCount > 0 ? (
          <span className="cf-label-sm font-mono text-cf-accent">
            {unreadCount}
          </span>
        ) : null}
      </Button>
      {open ? (
        <Popover
          role="dialog"
          className="absolute right-0 top-[calc(100%+4px)] z-[40] flex w-[320px] max-w-[calc(100vw-24px)] flex-col gap-[8px] p-[12px]"
        >
          <div className="flex items-center justify-between gap-[8px]">
            <span className="cf-label-md text-cf-ink">{nw.label}</span>
            {notifications.some(
              (item) =>
                item.status === 'pending' || item.status === 'dispatched'
            ) ? (
              <Button
                type="button"
                variant="quiet"
                density="dense"
                loading={markingAll}
                loadingLabel={nw.markAllRead}
                onClick={() => void markAllRead()}
              >
                {nw.markAllRead}
              </Button>
            ) : null}
          </div>
          {tasks.length === 0 && notifications.length === 0 ? (
            <p className="cf-body-sm text-cf-ink-muted">{nw.empty}</p>
          ) : (
            <ul className="flex max-h-[280px] flex-col gap-[8px] overflow-y-auto">
              {tasks.map((task) => (
                <li
                  key={task.taskId}
                  className="flex flex-col gap-[4px] rounded-[4px] border border-cf-border bg-cf-surface-subtle p-[8px]"
                >
                  <div className="flex items-center justify-between gap-[8px]">
                    <span className="truncate cf-label-md text-cf-ink">
                      {task.description}
                    </span>
                    <span className="shrink-0 cf-label-sm font-mono text-cf-ink-muted">
                      {task.status}
                    </span>
                  </div>
                  {task.error ? (
                    <p className="cf-caption font-mono text-cf-danger">
                      {task.error}
                    </p>
                  ) : null}
                  {task.threadId ? (
                    <div>
                      <Button
                        type="button"
                        variant="quiet"
                        density="dense"
                        onClick={() => {
                          setOpen(false);
                          onOpenThread(task.threadId!);
                        }}
                      >
                        {nw.openThread}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
              {notifications.map((item) => {
                const unread =
                  item.status === 'pending' || item.status === 'dispatched';
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-[4px] rounded-[4px] border border-cf-border bg-cf-surface p-[8px]"
                  >
                    <div className="flex items-center justify-between gap-[8px]">
                      <span className="truncate cf-label-md text-cf-ink">
                        {item.title}
                      </span>
                      <span className="shrink-0 cf-caption font-mono text-cf-ink-muted">
                        {formatWhen(item.createdAt, language)}
                      </span>
                    </div>
                    {item.message ? (
                      <p className="cf-body-sm text-cf-ink-muted">
                        {item.message}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-[8px]">
                      {item.threadId ? (
                        <Button
                          type="button"
                          variant="quiet"
                          density="dense"
                          onClick={() => {
                            if (unread) void markRead(item.id, item.threadId);
                            setOpen(false);
                            onOpenThread(item.threadId!);
                          }}
                        >
                          {nw.openThread}
                        </Button>
                      ) : null}
                      {unread ? (
                        <Button
                          type="button"
                          variant="quiet"
                          density="dense"
                          onClick={() => void markRead(item.id, item.threadId)}
                        >
                          {nw.markRead}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Popover>
      ) : null}
    </div>
  );
}

const formatWhen = (iso: string | null, language: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
};

/** The same native, paginated list in the rail and in the toolbar's dialog. */
export function AgentThreadList({ threadId, language, words, onOpen, sidebar = false }: {
  threadId: string | null;
  language: string;
  words: AgentWords['threads'];
  onOpen?: (id: string) => void;
  sidebar?: boolean;
}) {
  const threads = useAgentThreads();
  const list = threads.data ?? [];
  const quiet = sidebar ? 'navigation' : 'quiet';
  return <div className="flex min-h-0 min-w-0 flex-col gap-[8px]">
    {threads.isLoading ? <SkeletonRows rows={3} label={words.loading} /> : null}
    {threads.error ? <div role="status" className="flex flex-wrap items-center gap-[8px] cf-body-sm">
      {words.failed}<Button type="button" variant={quiet} density="dense" onClick={() => void threads.mutate()}>{words.retry}</Button>
    </div> : null}
    {!list.length && !threads.isLoading && !threads.error ? <p className="cf-body-sm">{words.empty}</p> : null}
    <ul className={`flex min-w-0 flex-col gap-[4px] overflow-y-auto ${sidebar ? 'max-h-[40dvh]' : 'max-h-[min(50dvh,360px)]'}`}>
      {list.map((thread) => <li key={thread.id} className="min-w-0">
        <ButtonLink prefetch={false} href={`/agents/${encodeURIComponent(thread.id)}`} variant={thread.id === threadId ? sidebar ? 'navigation-current' : 'secondary' : quiet} density="dense" aria-current={thread.id === threadId ? 'page' : undefined}
          title={thread.title ?? words.untitled}
          onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !onOpen) return; event.preventDefault(); onOpen(thread.id); }} className="w-full justify-between gap-[12px]">
          <span className="inline-flex min-w-0 items-center gap-[4px]">
            {thread.forkedFromThreadId ? <AgentGlyph name="branch" size={12} /> : null}
            <span className="min-w-0 truncate">{thread.title ?? words.untitled}</span>
          </span>
          {!sidebar ? <span className="shrink-0 cf-caption text-cf-ink-muted">{formatWhen(thread.updatedAt, language)}</span> : null}
        </ButtonLink>
      </li>)}
    </ul>
    {threads.hasMore ? <Button type="button" variant={quiet} density="dense" loading={threads.loadingMore} loadingLabel={words.loading} onClick={() => void threads.loadMore()}>{words.more}</Button> : null}
  </div>;
}

export function ThreadSwitcher({
  threadId,
  title,
  language,
  onOpen,
  onNew,
  onRemoved,
  words,
  actions,
}: {
  /** The thread open now; `null` before its first message. */
  threadId: string | null;
  /** The name shown in the head. */
  title: string;
  language: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** The open thread was deleted. */
  onRemoved: () => void;
  words: AgentWords;
  actions?: ReactNode;
  contextual?: boolean;
}) {
  const w = words.threads;
  const request = useFetch();
  const threads = useAgentThreads();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'rename' | 'remove' | 'fork' | null>(null);
  const [failed, setFailed] = useState(false);

  const fork = useCallback(async () => {
    if (!threadId) return;
    setBusy('fork');
    setFailed(false);
    try {
      const response = await request(AGENT_DOORS.forkThread(threadId), {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(String(response.status));
      const cloned = (await response.json()) as { id?: unknown };
      if (typeof cloned?.id !== 'string' || !cloned.id) {
        throw new Error('fork_failed');
      }
      await threads.mutate();
      setOpen(false);
      onOpen(cloned.id);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [onOpen, request, threadId, threads]);

  const rename = useCallback(async () => {
    const next = draft.trim().slice(0, AGENT_THREAD_TITLE_MAX);
    if (!threadId || !next) return;
    setBusy('rename');
    setFailed(false);
    try {
      const response = await request(AGENT_DOORS.thread(threadId), {
        method: 'PATCH',
        body: JSON.stringify({ title: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      await threads.mutate();
      setRenaming(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [draft, request, threadId, threads]);

  const remove = useCallback(async () => {
    if (!threadId) return;
    setBusy('remove');
    setFailed(false);
    try {
      const response = await request(AGENT_DOORS.thread(threadId), {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(String(response.status));
      await threads.mutate();
      setOpen(false);
      onRemoved();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }, [onRemoved, request, setOpen, threadId, threads]);

  return <>
    <OpeningBand className="mb-0 shrink-0 gap-[8px] border-b border-cf-border bg-cf-surface px-[12px] md:px-[16px]" wrap>
      <Button type="button" variant="secondary" density="dense" aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen(true); setRenaming(false); setFailed(false); }}>
        {w.label}<AgentGlyph name="chevron" size={14} />
      </Button>
      <span className="min-w-0 flex-1 truncate cf-label-md" title={title}>{title}</span>
      <AgentNotificationsBell language={language} words={words} onOpenThread={onOpen} />
      <Button type="button" variant="secondary" density="dense" onClick={onNew}><AgentGlyph name="plus" />{w.newThread}</Button>
      {actions}
    </OpeningBand>
    <Dialog open={open} onClose={() => setOpen(false)} title={w.label} footer={<Button type="button" variant="quiet" onClick={() => setOpen(false)}>{w.close}</Button>}>
      <nav aria-label={w.label}><AgentThreadList threadId={threadId} language={language} words={w} onOpen={(id) => { setOpen(false); onOpen(id); }} /></nav>
            {threadId ? (
              <div className="flex flex-col gap-[8px] border-t border-cf-border px-[4px] pt-[8px]">
                {renaming ? (
                  <form
                    className="flex min-w-0 items-end gap-[8px]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename();
                    }}
                  >
                    <Input
                      standalone
                      density="dense"
                      label={w.renameLabel}
                      value={draft}
                      maxLength={AGENT_THREAD_TITLE_MAX}
                      autoFocus
                      fieldClassName="min-w-0 flex-1"
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <Button
                      type="submit"
                      density="dense"
                      disabled={!draft.trim()}
                      loading={busy === 'rename'}
                      loadingLabel={w.renameSave}
                    >
                      {w.renameSave}
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-[8px]">
                    <Button
                      type="button"
                      variant="quiet"
                      density="dense"
                      onClick={() => {
                        setDraft(title);
                        setRenaming(true);
                      }}
                    >
                      <AgentGlyph name="pen" size={14} />
                      {w.rename}
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      density="dense"
                      loading={busy === 'fork'}
                      loadingLabel={words.conversation.forking}
                      onClick={() => void fork()}
                    >
                      <AgentGlyph name="branch" size={14} />
                      {words.conversation.forkThread}
                    </Button>
                    <ConfirmButton
                      label={w.remove}
                      armedLabel={w.removeArmed}
                      density="dense"
                      loading={busy === 'remove'}
                      loadingLabel={w.remove}
                      onConfirm={() => void remove()}
                    />
                  </div>
                )}
                {failed ? (
                  <p role="status" className="cf-caption text-cf-danger">
                    {w.actionFailed}
                  </p>
                ) : null}
              </div>
            ) : null}
    </Dialog>
  </>;
}
