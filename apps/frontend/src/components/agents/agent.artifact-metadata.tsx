'use client';

import useSWR, { unstable_serialize, useSWRConfig } from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { ChannelStatus } from '@contentfactory/frontend/components/channels/channel-parts';
import type { ChannelRow } from '@contentfactory/frontend/components/channels/channel-model';
import { voiceCopy } from '@contentfactory/frontend/components/brand-voice/voice-copy';
import { piecesCopy } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.copy';
import { stateWord } from '@contentfactory/frontend/components/content-intelligence/pieces/adaptation.cell';
import { readCellState } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.adapter';
import { calendarPlanningCopy } from '@contentfactory/frontend/components/launches/calendar-planning.copy';
import { AGENT_DOORS, artifactKey, type AgentArtifact, type AgentClipPreproductionView } from './agent.contract';
import { clipPreproductionKey, clipPreproductionTitle, readOwnedClipPreproduction } from './agent.preproduction-read';
import { pieceIdOf, useLoadedPiece } from './agent.piece-data';
import { useVideoWords } from '../videos/video.copy';
import type { VideoDraftMetadataUiV1 } from '../videos/video-ui.v1';
import { useUser } from '../layout/user.context';

export type ArtifactMetadata = { id: string; name: string | null; analysed?: boolean; disabled?: boolean; refreshNeeded?: boolean; inBetweenSteps?: boolean; videoMode?: string; locale?: string; version?: number; clipPilot?: boolean };
type MetadataPage = { items: ArtifactMetadata[] };

/** Bounded metadata-only reads; saved video scripts stay in their existing draft store. */
export function useArtifactMetadata(artifacts: readonly AgentArtifact[], enabled = true, threadId?: string | null) {
  const request = useFetch();
  const user = useUser();
  const {cache, mutate} = useSWRConfig();
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
  const videoIds = [...new Set(artifacts.flatMap(artifact => artifact.kind === 'media' && typeof artifact.data.videoDraftId === 'string' ? [artifact.data.videoDraftId] : []))].sort().slice(0, 24);
  const videoUrl = enabled && videoIds.length ? `/media/video-prompts?${new URLSearchParams({metadata: '1', ids: videoIds.join(',')})}` : null;
  const videos = useSWR<VideoDraftMetadataUiV1[]>(videoUrl ? [videoUrl, user?.orgId, user?.id] : null, async () => {
    const response = await request(videoUrl!);
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error('video metadata unavailable');
    return body;
  }, {revalidateOnFocus: true});
  const clipRefs = artifacts.filter(artifact => artifact.kind === 'piece' && typeof artifact.data.clipPilotId === 'string').slice(0, 24);
  const clips = useSWR<Array<{key: string; metadata: ArtifactMetadata} | null>>(enabled && user?.orgId && user?.id && threadId && clipRefs.length
    ? ['clip-artifact-metadata', user?.orgId, user?.id, threadId, clipRefs.map(artifact => `${artifact.id}:${artifact.data.clipPilotId}`).sort().join(',')] : null, async () => Promise.all(clipRefs.map(async artifact => {
      if (artifact.data.clipThreadId && artifact.data.clipThreadId !== threadId) return null;
      const ref = {id: String(artifact.data.clipPilotId), pieceId: artifact.id, threadId: threadId!};
      const key = clipPreproductionKey(user.orgId, user.id, ref);
      const cached = cache.get(unstable_serialize(key));
      let view: AgentClipPreproductionView | undefined;
      try {
        const cachedRef = cached?.data?.reference;
        view = cachedRef?.id === ref.id && cachedRef.pieceId === ref.pieceId && cachedRef.threadId === ref.threadId && !cached?.error
          ? cached.data : await mutate(key, readOwnedClipPreproduction(key, ref, request), {populateCache: true, revalidate: false});
      } catch (error) {
        if ([403, 404].includes((error as {status?: number}).status ?? 0)) return null;
        throw error;
      }
      if (!view) throw new Error('Clip metadata unavailable');
      return {key: artifactKey(artifact), metadata: {id: ref.id, clipPilot: true, locale: view.outputLocale,
        name: clipPreproductionTitle(view)}};
    })), {revalidateOnFocus: true, errorRetryCount: 0});
  const data = new Map<string, ArtifactMetadata>();
  for (const row of avatars.data?.items ?? []) data.set(`avatar:${row.id}`, row);
  for (const row of channels.data?.items ?? []) data.set(`channel:${row.id}`, row);
  for (const row of videos.data ?? []) for (const artifact of artifacts) {
    if (artifact.kind === 'media' && artifact.data.videoDraftId === row.id) data.set(artifactKey(artifact), {id: row.id, name: row.title, videoMode: row.settings?.mode, locale: row.settings?.locale, version: row.version});
  }
  for (const clip of clips.data ?? []) if (clip) data.set(clip.key, clip.metadata);
  return {
    data,
    error: avatars.error || channels.error || videos.error || clips.error,
    loading: avatars.isLoading || channels.isLoading || videos.isLoading || clips.isLoading,
    known: (artifact: AgentArtifact) => artifact.kind === 'avatar' ? !!avatars.data : artifact.kind === 'channel' ? !!channels.data : artifact.kind === 'media' && typeof artifact.data.videoDraftId === 'string' ? !!videos.data : artifact.kind === 'piece' && artifact.data.clipPilotId ? !!clips.data : false,
    retry: () => { void avatars.mutate(); void channels.mutate(); void videos.mutate(); void clips.mutate(); },
    get: (artifact: AgentArtifact) => data.get(artifactKey(artifact)),
  };
}

/** Existing object status vocabulary; no status is inferred from an old chat card. */
export function AgentArtifactLiveStatus({ artifact, metadata }: { artifact: AgentArtifact; metadata?: ArtifactMetadata }) {
  const language = useInterfaceLanguage();
  const videoWords = useVideoWords();
  const locale = language.startsWith('ru') ? 'ru' : 'en';
  const piece = useLoadedPiece(pieceIdOf(artifact));
  if (metadata?.clipPilot) return <span className="cf-caption text-cf-ink-muted">Higgsfield · {metadata.locale?.toUpperCase()}</span>;
  if (artifact.kind === 'media' && artifact.data.videoDraftId && metadata) return <span className="cf-caption text-cf-ink-muted">{metadata.videoMode === 'presenter' ? videoWords.script : videoWords.prompt} · {metadata.locale?.toUpperCase()} · v{metadata.version}</span>;
  if (artifact.kind === 'avatar' && metadata) return <span className="cf-caption text-cf-ink-muted">{metadata.analysed ? voiceCopy[locale].avatarsReady : voiceCopy[locale].avatarsNotAnalysed}</span>;
  if (artifact.kind === 'channel' && metadata) return <ChannelStatus row={metadata as ChannelRow} locale={locale} />;
  const adaptationId = typeof artifact.data.adaptationId === 'string' ? artifact.data.adaptationId : artifact.id;
  const adaptation = piece?.adaptations.find((row) => row.id === adaptationId);
  if (artifact.kind === 'plan' && adaptation?.plan) return <span className="cf-caption text-cf-ink-muted">{adaptation.plan.status === 'reserved' ? calendarPlanningCopy[locale].slotReserved : stateWord(readCellState(adaptation.state), piecesCopy[locale])}</span>;
  if (adaptation) return <span className="cf-caption text-cf-ink-muted">{stateWord(readCellState(adaptation.state), piecesCopy[locale])}</span>;
  if (piece?.piece.archivedAt) return <span className="cf-caption text-cf-ink-muted">{piecesCopy[locale].archived}</span>;
  return null;
}
