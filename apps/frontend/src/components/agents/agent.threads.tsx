'use client';

import { useCallback, useId, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { Input } from '@contentfactory/react/form/input';
import { OpeningBand } from '@contentfactory/react/layout';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Popover } from '@contentfactory/frontend/components/ui/layers';
import { ConfirmButton } from '@contentfactory/frontend/components/ui/confirm-button';
import { usePopoverTrigger } from '@contentfactory/frontend/components/ui/use-popover-trigger';
import {
  AGENT_DOORS,
  AGENT_THREAD_TITLE_MAX,
  readThreadList,
  type AgentThreadSummary,
} from './agent.contract';
import type { AgentWords } from './agent.copy';
import { AgentGlyph } from './agent.icons';

/**
 * The person's own conversations (spec §1.6, §6.1; canvas C): the current
 * one's name is the head of the chat column, and pressing it opens the list —
 * every conversation, plus renaming or deleting the one open. «Новый
 * разговор» sits beside it. Threads are personal: the doors answer only the
 * caller's own.
 */

/** SWR key of the list, shared with the screen that refreshes it. */
export const THREADS_KEY = AGENT_DOORS.threads;

export const useAgentThreads = () => {
  const request = useFetch();
  return useSWR<AgentThreadSummary[]>(
    THREADS_KEY,
    async () => {
      const response = await request(AGENT_DOORS.threads);
      if (!response.ok) throw new Error(String(response.status));
      return readThreadList(await response.json());
    },
    { revalidateOnFocus: false }
  );
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
}) {
  const w = words.threads;
  const request = useFetch();
  const threads = useAgentThreads();
  const { open, setOpen, holder } = usePopoverTrigger<HTMLDivElement>();
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

  return (
    <OpeningBand className="mb-0 shrink-0 gap-[8px] border-b border-cf-border bg-cf-surface px-[12px] md:px-[16px]">
      <div ref={holder} className="relative min-w-0 flex-1">
        <Button
          type="button"
          variant="quiet"
          density="dense"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-haspopup="dialog"
          onClick={() => {
            setOpen(!open);
            setRenaming(false);
            setFailed(false);
          }}
          className="max-w-full justify-start"
          // The label wrapper may shrink, or a long title overflows the
          // button on both sides at 390 px instead of ending in «…»
          // (kcxz.29 recheck).
          innerClassName="min-w-0 justify-start"
        >
          <span className="min-w-0 truncate cf-label-md">{title}</span>
          <AgentGlyph name="chevron" size={14} />
        </Button>
        {open ? (
          <Popover
            role="dialog"
            className="absolute start-0 top-[calc(100%+4px)] z-[60] flex w-[min(360px,calc(100vw-24px))] flex-col gap-[4px] p-[8px]"
          >
            <div id={listId} aria-label={w.label} className="flex flex-col gap-[4px]">
              <p className="px-[8px] pb-[4px] pt-[4px] cf-label-sm text-cf-ink-muted">
                {w.label}
              </p>
              {threads.error ? (
                <p className="px-[8px] cf-body-sm text-cf-ink-muted">{w.failed}</p>
              ) : !list.length && !threads.isLoading ? (
                <p className="px-[8px] cf-body-sm text-cf-ink-muted">{w.empty}</p>
              ) : (
                <ul className="flex max-h-[320px] flex-col gap-[4px] overflow-y-auto">
                  {list.map((thread) => {
                    const current = thread.id === threadId;
                    return (
                      <li key={thread.id}>
                        <ButtonLink
                          href={`/agents/${encodeURIComponent(thread.id)}`}
                          variant={current ? 'secondary' : 'quiet'}
                          density="dense"
                          aria-current={current ? 'page' : undefined}
                          onClick={() => {
                            setOpen(false);
                            onOpen(thread.id);
                          }}
                          className="w-full justify-between gap-[12px]"
                        >
                          <span className="min-w-0 truncate">
                            {thread.title ?? w.untitled}
                          </span>
                          <span className="shrink-0 cf-caption text-cf-ink-muted">
                            {formatWhen(thread.updatedAt, language)}
                          </span>
                        </ButtonLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
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
          </Popover>
        ) : null}
      </div>
      <Button
        iconOnly
        type="button"
        variant="quiet"
        density="dense"
        aria-label={w.newThread}
        title={w.newThread}
        onClick={onNew}
      >
        <AgentGlyph name="plus" />
      </Button>
    </OpeningBand>
  );
}
