'use client';

import { useCallback, useId, useState, type ReactNode } from 'react';
import useSWRInfinite, { unstable_serialize } from 'swr/infinite';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { Input } from '@contentfactory/react/form/input';
import { OpeningBand } from '@contentfactory/react/layout';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Dialog } from '@contentfactory/frontend/components/ui/layers';
import { ConfirmButton } from '@contentfactory/frontend/components/ui/confirm-button';
import { SkeletonRows } from '@contentfactory/frontend/components/ui/surface';
import {
  AGENT_DOORS,
  AGENT_THREAD_TITLE_MAX,
  readThreadList, readPagination,
  type AgentPagination,
  type AgentThreadSummary,
} from './agent.contract';
import type { AgentWords } from './agent.copy';
import { AgentGlyph } from './agent.icons';

/**
 * The person's own conversations (spec §1.6, §6.1; canvas C): the current
 * one's name stays visible beside explicit Chats and New chat actions.
 * The native list pages on demand; rename and delete stay in its dialog. Threads are personal: the doors answer only the
 * caller's own.
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

export function ThreadSwitcher({
  threadId,
  title,
  language,
  onOpen,
  onNew,
  onRemoved,
  words,
  actions,
  contextual = false,
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
  const listId = useId();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'rename' | 'remove' | null>(null);
  const [failed, setFailed] = useState(false);

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

  const list = threads.data ?? [];

  const navigation = <nav aria-label={w.label} id={listId} className="flex min-h-0 flex-col gap-[8px]">
    {threads.isLoading ? <SkeletonRows rows={3} label={w.loading} /> : null}
    {threads.error ? <div role="status" className="flex flex-wrap items-center gap-[8px] cf-body-sm text-cf-ink-muted">
      {w.failed}<Button type="button" variant="quiet" density="dense" onClick={() => void threads.mutate()}>{w.retry}</Button>
    </div> : null}
    {!list.length && !threads.isLoading && !threads.error ? <p className="cf-body-sm text-cf-ink-muted">{w.empty}</p> : null}
    <ul className="flex max-h-[min(50dvh,360px)] flex-col gap-[4px] overflow-y-auto">
      {list.map((thread) => <li key={thread.id}>
        <ButtonLink prefetch={false} href={`/agents/${encodeURIComponent(thread.id)}`} variant={thread.id === threadId ? 'secondary' : 'quiet'} density="dense" aria-current={thread.id === threadId ? 'page' : undefined}
          onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); setOpen(false); onOpen(thread.id); }} className="w-full justify-between gap-[12px]">
          <span className="min-w-0 truncate">{thread.title ?? w.untitled}</span>
          <span className="shrink-0 cf-caption text-cf-ink-muted">{formatWhen(thread.updatedAt, language)}</span>
        </ButtonLink>
      </li>)}
    </ul>
    {threads.hasMore ? <Button type="button" variant="quiet" density="dense" loading={threads.loadingMore} loadingLabel={w.loading} onClick={() => void threads.loadMore()}>{w.more}</Button> : null}
  </nav>;

  return <>
    <OpeningBand className="mb-0 shrink-0 gap-[8px] border-b border-cf-border bg-cf-surface px-[12px] md:px-[16px]" wrap>
      <Button type="button" variant="secondary" density="dense" aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen(true); setRenaming(false); setFailed(false); }}>
        {w.label}<AgentGlyph name="chevron" size={14} />
      </Button>
      <span className="min-w-0 flex-1 truncate cf-label-md" title={title}>{title}</span>
      <Button type="button" variant="secondary" density="dense" onClick={onNew}><AgentGlyph name="plus" />{w.newThread}</Button>
      {actions}
    </OpeningBand>
    {!contextual ? <div className="hidden shrink-0 border-b border-cf-border bg-cf-surface-subtle px-[16px] py-[8px] xl:block [&_ul]:max-h-[144px]">{!open ? navigation : null}</div> : null}
    <Dialog open={open} onClose={() => setOpen(false)} title={w.label} footer={<Button type="button" variant="quiet" onClick={() => setOpen(false)}>{w.close}</Button>}>
      {navigation}
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
