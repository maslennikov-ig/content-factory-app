'use client';

import { useEffect, useState } from 'react';
import { Select } from '@contentfactory/react/form/select';
import { Button } from '@contentfactory/react/form/button';
import { Dialog } from '@contentfactory/frontend/components/ui/layers';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import type { AgentArtifact, AgentWorkContextV1, AgentWritingSelection } from './agent.contract';
import { useArtifactMetadata } from './agent.artifact-metadata';
import { pieceIdOf, useLoadedPiece } from './agent.piece-data';
import { defaultWritingAvatarId, effectiveWritingSelection, type useAgentWritingChoices } from './agent.writing-selection';
import { AgentGlyph } from './agent.icons';

export function AgentContextChip({ context, artifact, onRemove, writingSelection, choices, onWritingSelection }: {
  context: AgentWorkContextV1 | null; artifact?: AgentArtifact | null; onRemove: () => void;
  writingSelection?: AgentWritingSelection; choices: ReturnType<typeof useAgentWritingChoices>;
  onWritingSelection: (selection: AgentWritingSelection) => void;
}) {
  const t = useT();
  const language = useInterfaceLanguage();
  const [open, setOpen] = useState(false);
  const entityId = context?.id ?? context?.adaptationId;
  useEffect(() => setOpen(false), [context?.kind, entityId, context?.from, context?.to]);
  const selected: AgentArtifact | null = context && entityId && context.kind !== 'calendar' ? {
    kind: context.kind, id: entityId, title: artifact?.id === entityId && artifact.kind === context.kind ? artifact.title : null, code: null, data: { pieceId: context.pieceId, channelId: context.channelId, adaptationId: context.adaptationId },
  } : null;
  const metadata = useArtifactMetadata(selected ? [selected] : []);
  const piece = useLoadedPiece(selected ? pieceIdOf(selected) : null);
  const effective = effectiveWritingSelection(writingSelection, context, choices.channels);
  const channel = choices.channels.find(item => item.id === effective?.channelId);
  const defaultAvatarId = defaultWritingAvatarId(channel, choices);
  const avatarId = writingSelection?.avatarId || defaultAvatarId;
  const avatar = choices.avatars.find(item => item.id === avatarId);
  const automatic = t('assistant_writing_auto', 'Automatic');
  const channelLabel = t('assistant_writing_channel', 'Channel for posts');
  const avatarLabel = t('assistant_writing_avatar', 'Writing avatar');
  const labels = {
    workspace: t('assistant_workspace', 'Workspace'), piece: t('assistant_pieces', 'Pieces'),
    avatar: t('assistant_avatars', 'Avatars'), channel: t('channels', 'Channels'),
    adaptation: t('assistant_material', 'Material'), plan: t('calendar', 'Calendar'), calendar: t('calendar', 'Calendar'),
    ideas: t('assistant_ideas', 'Ideas'), facts: t('assistant_facts', 'Facts'), media: t('media', 'Media'),
  };
  const unavailable = selected && metadata.known(selected) && !metadata.get(selected);
  const name = unavailable ? t('assistant_context_unavailable', 'This object is no longer available') : piece?.piece.title || (selected ? metadata.get(selected)?.name || selected.title : null) || (context ? labels[context.kind] : '');
  const explanation = t('assistant_context_help', 'This object is included with your next message to the assistant. Detaching it removes that link; the chat history and object are kept.');
  const formatDate = (iso: string) => {
    try { return new Intl.DateTimeFormat(language.replace('_', '-'), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); } catch { return iso.slice(0, 10); }
  };
  const period = [context?.from, context?.to].filter((value): value is string => !!value).map(formatDate).join(' – ');
  const label = t('assistant_context', 'Context');
  return <div data-assistant-context={context?.kind ?? 'writing'} className="shrink-0">
    <Button type="button" density="dense" variant="quiet" className="min-w-[44px] px-[8px] md:min-w-0" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <AgentGlyph name="clip" /><span className="hidden md:inline">{label}</span>
    </Button>
    <Dialog open={open} onClose={() => setOpen(false)} title={label}>
      <div className="flex min-w-0 flex-col gap-[16px]">
        <p className="cf-body-sm text-cf-ink-muted">{t('assistant_writing_help', 'These choices apply to this chat. You can ask for another channel or voice in your message. Existing drafts stay unchanged.')}</p>
        {choices.loading ? <p role="status" className="cf-body-sm text-cf-ink-muted">{t('loading', 'Loading')}</p> : choices.error ? <div role="status" className="flex flex-col gap-[8px]">
          <p className="cf-body-sm text-cf-ink-muted">{t('assistant_writing_load_failed', 'Could not load channels and avatars. Your saved choices are kept.')}</p>
          <Button type="button" variant="secondary" onClick={choices.retry}>{t('retry', 'Retry')}</Button>
        </div> : <>
          <div className="flex min-w-0 flex-col gap-[4px]">
            <Select disableForm name="writing-channel" label={channelLabel} value={writingSelection?.channelId ?? ''} onChange={event => { const { channelId: _, ...rest } = writingSelection ?? {}; onWritingSelection(event.target.value ? { ...rest, channelId: event.target.value } : rest); }}>
              <option value="">{automatic}</option>
              {writingSelection?.channelId && !choices.channels.some(item => item.id === writingSelection.channelId) ? <option value={writingSelection.channelId}>{t('assistant_context_unavailable', 'This object is no longer available')}</option> : null}
              {choices.channels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <p data-writing-channel-name="" className="cf-body-sm text-cf-ink-muted [overflow-wrap:anywhere]">{channel?.name || (effective?.channelId ? t('assistant_context_unavailable', 'This object is no longer available') : t('assistant_writing_ask_channel', 'No channel selected. The assistant will clarify it when a post needs one.'))}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-[4px]">
            <Select disableForm name="writing-avatar" label={avatarLabel} value={writingSelection?.avatarId ?? ''} onChange={event => { const { avatarId: _, ...rest } = writingSelection ?? {}; onWritingSelection(event.target.value ? { ...rest, avatarId: event.target.value } : rest); }}>
              <option value="">{automatic}</option>
              {writingSelection?.avatarId && !choices.avatars.some(item => item.id === writingSelection.avatarId) ? <option value={writingSelection.avatarId}>{t('assistant_context_unavailable', 'This object is no longer available')}</option> : null}
              {choices.avatars.map(item => <option key={item.id} value={item.id} disabled={!item.analysed}>{item.name || item.id}{item.analysed ? '' : ` · ${t('assistant_writing_avatar_unready', 'Not ready')}`}</option>)}
            </Select>
            <p data-writing-avatar-name="" className="cf-body-sm text-cf-ink-muted [overflow-wrap:anywhere]">{avatar?.name || (writingSelection?.avatarId ? t('assistant_context_unavailable', 'This object is no longer available') : t('assistant_writing_no_avatar', 'No default avatar. The assistant will follow your instructions.'))}</p>
          </div>
        </>}
        {context ? <div className="flex min-w-0 flex-col gap-[12px] border-t border-cf-border pt-[16px]">
        <p className="cf-label-md text-cf-ink [overflow-wrap:anywhere]">{name}</p>
        {period ? <p className="cf-caption text-cf-ink-muted">{t('assistant_period', 'Period')}: {period}</p> : null}
        <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{explanation}</p>
        <div className="flex flex-wrap gap-[8px]">
          <Button type="button" density="dense" variant="secondary" onClick={() => { setOpen(false); onRemove(); }}>{t('assistant_remove_context', 'Detach object')}</Button>

        </div>
        </div> : null}
      </div>
    </Dialog>
  </div>;
}
