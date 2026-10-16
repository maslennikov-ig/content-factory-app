'use client';

import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import type { AgentArtifact, AgentWorkContextV1 } from './agent.contract';
import { useArtifactMetadata } from './agent.artifact-metadata';
import { pieceIdOf, useLoadedPiece } from './agent.piece-data';

export function AgentContextChip({ context, artifact, onRemove }: { context: AgentWorkContextV1 | null; artifact?: AgentArtifact | null; onRemove: () => void }) {
  const t = useT();
  const language = useInterfaceLanguage();
  const entityId = context?.id ?? context?.adaptationId;
  const selected: AgentArtifact | null = context && entityId && context.kind !== 'calendar' ? {
    kind: context.kind, id: entityId, title: artifact?.id === entityId && artifact.kind === context.kind ? artifact.title : null, code: null, data: { pieceId: context.pieceId, channelId: context.channelId, adaptationId: context.adaptationId },
  } : null;
  const metadata = useArtifactMetadata(selected ? [selected] : []);
  const piece = useLoadedPiece(selected ? pieceIdOf(selected) : null);
  if (!context) return null;
  const labels = {
    workspace: t('assistant_workspace', 'Workspace'), piece: t('assistant_pieces', 'Pieces'),
    avatar: t('assistant_avatars', 'Avatars'), channel: t('channels', 'Channels'),
    adaptation: t('assistant_material', 'Material'), plan: t('calendar', 'Calendar'), calendar: t('calendar', 'Calendar'),
    ideas: t('assistant_ideas', 'Ideas'), facts: t('assistant_facts', 'Facts'), media: t('media', 'Media'),
  };
  const unavailable = selected && metadata.known(selected) && !metadata.get(selected);
  const name = unavailable ? t('assistant_context_unavailable', 'This object is no longer available') : piece?.piece.title || (selected ? metadata.get(selected)?.name || selected.title : null) || labels[context.kind];
  const formatDate = (iso: string) => {
    try { return new Intl.DateTimeFormat(language.replace('_', '-'), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); } catch { return iso.slice(0, 10); }
  };
  return <div data-assistant-context={context.kind} className="mb-[8px] flex min-w-0 flex-wrap items-center gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface-subtle px-[12px] py-[8px]">
    <span className="min-w-0 flex-1 truncate cf-body-sm text-cf-ink" title={name}>{t('assistant_in_context', 'In context: {{object}}', { object: name })}</span>
    {context.from || context.to ? <span className="cf-caption text-cf-ink-muted">{t('assistant_period', 'Period')}: {[context.from, context.to].filter((value): value is string => !!value).map(formatDate).join(' – ')}</span> : null}
    <Button type="button" density="dense" variant="quiet" onClick={onRemove}>{t('assistant_remove_context', 'Remove context')}</Button>
  </div>;
}
