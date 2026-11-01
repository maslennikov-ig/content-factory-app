'use client';

import { Disclosure } from '@contentfactory/frontend/components/ui/disclosure';
import { ArtifactLine, SavedReviewNotes } from './agent.cards';
import { artifactChannelId, type AgentArtifact } from './agent.contract';
import type { AgentWords } from './agent.copy';
import { useLoadedPiece } from './agent.piece-data';
import { seriesQualityReview, type SeriesGroup } from './agent.series';

/** One presentation of saved adaptations: each member remains individually openable. */
export function SeriesCard({ members, openArtifact, onOpen, words, defaultOpen = false }: {
  members: SeriesGroup['members'];
  openArtifact: AgentArtifact | null;
  onOpen: (artifact: AgentArtifact) => void;
  words: AgentWords;
  defaultOpen?: boolean;
}) {
  const first = members[0].artifact;
  const series = first.data.series as { id: string; index: number; total: number };
  const channel = first.data.channel as { name?: unknown } | undefined;
  const channelName = typeof channel?.name === 'string' && channel.name.trim() ? channel.name : words.card.kinds.channel;
  const piece = useLoadedPiece(typeof first.data.pieceId === 'string' ? first.data.pieceId : null);
  const openMember = members.find(({ artifact, removed }) => !removed && artifact.kind === openArtifact?.kind && artifact.id === openArtifact.id);
  const openIndex = openMember ? (openMember.artifact.data.series as { index: number }).index : null;
  const qualityReview = seriesQualityReview(members);
  return (
    <Disclosure
      defaultOpen={defaultOpen}
      className="min-w-0 rounded-[12px] border border-cf-border bg-cf-surface"
      triggerClassName="px-[12px] py-[8px]"
      contentClassName="flex flex-col gap-[8px] border-t border-cf-border p-[8px]"
      summary={<span className="flex min-w-0 flex-wrap items-center gap-x-[8px] gap-y-[4px]">
        <span className="cf-body-sm text-cf-ink">{channelName}</span>
        <span className="cf-caption text-cf-ink-muted">{words.card.series(series.total)}</span>
        {openIndex !== null ? <span className="cf-caption text-cf-accent">{words.card.seriesPart(openIndex, series.total)} · {words.card.openedBeside}</span> : null}
      </span>}
    >
      {members.map(({ artifact, removed, key }) => {
        const saved = piece?.adaptations.find((row) => row.id === artifact.id);
        const title = artifact.title?.trim() || saved?.title?.trim() || saved?.body?.split(/\r?\n/).find((line) => line.trim())?.trim() || '';
        // The channel belongs in the summary, and the original artifact is retained for opening.
        const display: AgentArtifact = { ...artifact, title: title || null, data: { ...artifact.data, channel: { id: artifactChannelId(artifact) } } };
        return <ArtifactLine key={key} artifact={display} removed={removed} seriesMember
          open={artifact.kind === openArtifact?.kind && artifact.id === openArtifact.id}
          onOpen={() => onOpen(artifact)} words={words} />;
      })}
      {qualityReview ? <SavedReviewNotes qualityReview={qualityReview} words={words} scope="series" /> : null}
    </Disclosure>
  );
}
