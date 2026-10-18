'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { Input } from '@contentfactory/react/form/input';
import { Tabs, Tab, TabList, TabPanel } from '@contentfactory/react/choice/tabs';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { Dialog } from '@contentfactory/frontend/components/ui/layers';
import { ErrorState, SkeletonRows } from '@contentfactory/frontend/components/ui/surface';
import { voiceCopy } from '@contentfactory/frontend/components/brand-voice/voice-copy';
import { ChannelStatus } from '@contentfactory/frontend/components/channels/channel-parts';
import type { ChannelRow } from '@contentfactory/frontend/components/channels/channel-model';
import { calendarPlanningCopy } from '@contentfactory/frontend/components/launches/calendar-planning.copy';
import { piecesCopy } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.copy';
import { AGENT_DOORS, type AgentArtifact } from './agent.contract';
import type { AgentWords } from './agent.copy';
import { PIECES_API } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.adapter';

type BrowserKind = 'piece' | 'avatar' | 'channel' | 'plan';
type BrowserRow = { artifact: AgentArtifact; state: ReactNode };
const LIMIT = 24;
const sectionHref: Record<BrowserKind, string> = { piece: '/content?tab=materials', avatar: '/content?tab=avatars', channel: '/channels', plan: '/launches' };

export function AgentWorkspaceBrowserContent({ onSelect, words, initialKind = 'piece' }: { onSelect: (artifact: AgentArtifact) => void; words: AgentWords; initialKind?: BrowserKind }) {
  const t = useT();
  const language = useInterfaceLanguage();
  const locale = language.startsWith('ru') ? 'ru' : 'en';
  const request = useFetch();
  const [kind, setKind] = useState<BrowserKind>(initialKind);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Array<string | null>>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim().slice(0, 200)); setCursor(null); setPrevious([]); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const url = useMemo(() => {
    const params = new URLSearchParams({ limit: String(LIMIT) });
    if (kind !== 'piece') params.set('kind', kind);
    if (search) params.set('q', search);
    if (cursor) params.set('cursor', cursor);
    return `${kind === 'piece' ? PIECES_API.browser : AGENT_DOORS.workspaceBrowser}?${params}`;
  }, [kind, search, cursor]);
  const list = useSWR([url, kind, language], async () => {
    const response = await request(url);
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json();
    let rows: BrowserRow[] = [];
    if (kind === 'avatar') {
      if (!Array.isArray(body.items)) throw new Error('avatars unavailable');
      rows = body.items.map((avatar: { id: string; name: string | null; analysed: boolean }): BrowserRow => ({
        artifact: { kind: 'avatar', id: avatar.id, title: avatar.name ?? voiceCopy[locale].avatarsNoName, code: null, data: { id: avatar.id } },
        state: avatar.analysed ? voiceCopy[locale].avatarsReady : voiceCopy[locale].avatarsNotAnalysed,
      }));
    } else if (kind === 'channel') {
      if (!Array.isArray(body.items)) throw new Error('channels unavailable');
      rows = body.items.map((channel: Pick<ChannelRow, 'id' | 'name' | 'disabled' | 'refreshNeeded' | 'inBetweenSteps'>): BrowserRow => ({
        artifact: { kind: 'channel', id: channel.id, title: channel.name, code: null, data: { id: channel.id } },
        state: <ChannelStatus row={channel as ChannelRow} locale={locale} />,
      }));
    } else if (kind === 'plan') {
      if (!Array.isArray(body.items)) throw new Error('plans unavailable');
      rows = body.items.map((row: { id: string; title: string; postId: string; pieceId: string; channelId: string; adaptationId: string; slot: { status: 'queued' | 'reserved'; date: string | null } }): BrowserRow => ({
        artifact: { kind: 'plan', id: row.adaptationId, title: row.title, code: null, data: { id: row.adaptationId, postId: row.postId, pieceId: row.pieceId, channelId: row.channelId, adaptationId: row.adaptationId, at: row.slot.date } },
        state: row.slot.status === 'queued' ? calendarPlanningCopy[locale].slotQueued : calendarPlanningCopy[locale].slotReserved,
      }));
    } else {
      if (!Array.isArray(body.items)) throw new Error('pieces unavailable');
      rows = body.items.map((row: { id: string; title: string | null; archivedAt: string | null }): BrowserRow => ({
        artifact: { kind: 'piece', id: row.id, title: row.title, code: null, data: { id: row.id } },
        state: row.archivedAt ? piecesCopy[locale].archived : t('active', 'Active'),
      }));
    }
    return {
      rows,
      hasMore: body.hasMore === true,
      cursor: typeof body.cursor === 'string' ? body.cursor : null,
    };
  }, { revalidateOnFocus: false });
  const rows = list.data?.rows ?? [];
  const visible = rows;
  const labels: Record<BrowserKind, string> = { piece: t('assistant_pieces', 'Pieces'), avatar: t('assistant_avatars', 'Avatars'), channel: t('channels', 'Channels'), plan: t('calendar', 'Calendar') };
  const nextPage = list.data?.hasMore && !!list.data.cursor;
  return <div className="flex min-h-0 min-w-0 flex-col gap-[12px]">
    <Input standalone name="workspace-search" label={t('assistant_workspace_search', 'Search workspace')} value={query} onChange={(event) => setQuery(event.target.value)} />
    <Tabs value={kind} onChange={(value) => { setKind(value as BrowserKind); setCursor(null); setPrevious([]); }}>
      <TabList activation="manual" aria-label={t('assistant_workspace', 'Workspace')} className="flex flex-wrap gap-[4px] border-b border-cf-border pb-[8px]">
        {(Object.keys(labels) as BrowserKind[]).map((value) => <Tab key={value} value={value} className="rounded-[8px] px-[12px] py-[8px] cf-label-md text-cf-ink aria-selected:bg-cf-accent-soft aria-selected:text-cf-accent">{labels[value]}</Tab>)}
      </TabList>
    <TabPanel value={kind} className="flex min-h-0 min-w-0 flex-col gap-[12px]">
    {list.isLoading ? <SkeletonRows rows={4} label={words.panel.loading} /> : list.error ? <ErrorState title={/403/.test(String(list.error)) ? t('assistant_access_restricted', 'Access restricted') : words.history.failedTitle} action={<Button type="button" variant="secondary" density="dense" onClick={() => void list.mutate()}>{words.history.retry}</Button>} /> : !visible.length ? <p className="py-[16px] cf-body-sm text-cf-ink-muted">{search ? t('assistant_no_results', 'No matching objects') : t('assistant_workspace_empty', 'No objects in this workspace yet')}</p> : <ul className="max-h-[44dvh] overflow-y-auto">
      {visible.map(({ artifact, state }) => <li key={`${artifact.kind}:${artifact.id}`} className="border-b border-cf-border last:border-b-0">
        <Button type="button" variant="quiet" className="w-full justify-start py-[12px]" innerClassName="min-w-0 flex-1 justify-start" onClick={() => onSelect(artifact)}>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-[4px] text-start"><span className="max-w-full truncate cf-label-md">{artifact.title || labels[kind]}</span><span className="cf-caption text-cf-ink-muted">{state}</span></span>
          <span className="shrink-0 cf-caption">{t('assistant_select', 'Select')}</span>
        </Button>
      </li>)}
    </ul>}
    <div className="flex flex-wrap items-center justify-between gap-[8px] border-t border-cf-border pt-[12px]">
      <ButtonLink href={sectionHref[kind]} variant="quiet" density="dense">{t('assistant_open_in_section', 'Open in section')}</ButtonLink>
      <div className="flex gap-[8px]">
        <Button type="button" variant="quiet" density="dense" disabled={!previous.length} onClick={() => { setCursor(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>{t('previous', 'Previous')}</Button>
        <Button type="button" variant="quiet" density="dense" disabled={!nextPage} onClick={() => { setPrevious([...previous, cursor]); setCursor(list.data?.cursor ?? null); }}>{t('next', 'Next')}</Button>
      </div>
    </div>
    </TabPanel>
    </Tabs>
  </div>;
}

/** Listing requests exist only while explicitly browsing; all writes stay in the shared editors. */
export function AgentWorkspaceBrowser({ onSelect, words }: { onSelect: (artifact: AgentArtifact) => void; words: AgentWords }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="quiet" density="dense" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{t('assistant_workspace', 'Workspace')}</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title={t('assistant_workspace', 'Workspace')}>
      {open ? <AgentWorkspaceBrowserContent words={words} onSelect={(artifact) => { onSelect(artifact); setOpen(false); }} /> : null}
    </Dialog>
  </>;
}
