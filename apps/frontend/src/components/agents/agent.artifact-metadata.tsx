'use client';

import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { ChannelStatus } from '@contentfactory/frontend/components/channels/channel-parts';
import type { ChannelRow } from '@contentfactory/frontend/components/channels/channel-model';
import { voiceCopy } from '@contentfactory/frontend/components/brand-voice/voice-copy';
import { piecesCopy } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.copy';
import { stateWord } from '@contentfactory/frontend/components/content-intelligence/pieces/adaptation.cell';
import { readCellState } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.adapter';
import { calendarPlanningCopy } from '@contentfactory/frontend/components/launches/calendar-planning.copy';
import { AGENT_DOORS, artifactKey, type AgentArtifact } from './agent.contract';
import { pieceIdOf, useLoadedPiece } from './agent.piece-data';

export type ArtifactMetadata = { id: string; name: string | null; analysed?: boolean; disabled?: boolean; refreshNeeded?: boolean; inBetweenSteps?: boolean };
type MetadataPage = { items: ArtifactMetadata[] };

/** Two bounded metadata-only requests for the visible avatar/channel refs, never the rich lists. */
export function useArtifactMetadata(artifacts: readonly AgentArtifact[], enabled = true) {
  const request = useFetch();
  const urlFor = (kind: 'avatar' | 'channel') => {
    const ids = [...new Set(artifacts.filter((artifact) => artifact.kind === kind).map((artifact) => artifact.id))].sort().slice(0, 24);
    return enabled && ids.length ? `${AGENT_DOORS.workspaceBrowser}?${new URLSearchParams({ kind, ids: ids.join(','), limit: '24' })}` : null;
  };
  const fetcher = async (url: string): Promise<MetadataPage> => {
    const response = await request(url);
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json();
    if (!Array.isArray(body.items)) throw new Error('metadata unavailable');
    return body;
  };
  const avatars = useSWR<MetadataPage>(urlFor('avatar'), fetcher, { revalidateOnFocus: false });
  const channels = useSWR<MetadataPage>(urlFor('channel'), fetcher, { revalidateOnFocus: false });
  const data = new Map<string, ArtifactMetadata>();
  for (const row of avatars.data?.items ?? []) data.set(`avatar:${row.id}`, row);
  for (const row of channels.data?.items ?? []) data.set(`channel:${row.id}`, row);
  return {
    data,
    error: avatars.error || channels.error,
    loading: avatars.isLoading || channels.isLoading,
    known: (artifact: AgentArtifact) => artifact.kind === 'avatar' ? !!avatars.data : artifact.kind === 'channel' ? !!channels.data : false,
    retry: () => { void avatars.mutate(); void channels.mutate(); },
    get: (artifact: AgentArtifact) => data.get(artifactKey(artifact)),
  };
}

/** Existing object status vocabulary; no status is inferred from an old chat card. */
export function AgentArtifactLiveStatus({ artifact, metadata }: { artifact: AgentArtifact; metadata?: ArtifactMetadata }) {
  const language = useInterfaceLanguage();
  const locale = language.startsWith('ru') ? 'ru' : 'en';
  const piece = useLoadedPiece(pieceIdOf(artifact));
  if (artifact.kind === 'avatar' && metadata) return <span className="cf-caption text-cf-ink-muted">{metadata.analysed ? voiceCopy[locale].avatarsReady : voiceCopy[locale].avatarsNotAnalysed}</span>;
  if (artifact.kind === 'channel' && metadata) return <ChannelStatus row={metadata as ChannelRow} locale={locale} />;
  const adaptationId = typeof artifact.data.adaptationId === 'string' ? artifact.data.adaptationId : artifact.id;
  const adaptation = piece?.adaptations.find((row) => row.id === adaptationId);
  if (artifact.kind === 'plan' && adaptation?.plan) return <span className="cf-caption text-cf-ink-muted">{adaptation.plan.status === 'reserved' ? calendarPlanningCopy[locale].slotReserved : stateWord(readCellState(adaptation.state), piecesCopy[locale])}</span>;
  if (adaptation) return <span className="cf-caption text-cf-ink-muted">{stateWord(readCellState(adaptation.state), piecesCopy[locale])}</span>;
  if (piece?.piece.archivedAt) return <span className="cf-caption text-cf-ink-muted">{piecesCopy[locale].archived}</span>;
  return null;
}
