'use client';

import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import type { AgentWorkContextV1, AgentWritingSelection } from './agent.contract';

export type WritingChannel = { id: string; name: string; identifier?: string; writingProfile?: { brandProfileId?: string | null } };
export type WritingAvatar = { id: string; name: string | null; analysed: boolean };
export type WritingChoices = { channels: WritingChannel[]; avatars: WritingAvatar[]; defaultAvatarId: string | null };
const EMPTY_CHOICES: WritingChoices = { channels: [], avatars: [], defaultAvatarId: null };

/** Defaults are computed for the next turn; merely opening a chat never stores them. */
export function effectiveWritingSelection(selection: AgentWritingSelection | undefined, context: AgentWorkContextV1 | null, channels: readonly WritingChannel[]): AgentWritingSelection | undefined {
  const channelId = selection?.channelId || (context?.kind === 'channel' ? context.id : context?.channelId) || (channels.length === 1 ? channels[0].id : undefined);
  return channelId ? { ...selection, channelId } : selection;
}

export function defaultWritingAvatarId(channel: WritingChannel | undefined, choices: WritingChoices): string | null {
  const bound = choices.avatars.find(avatar => avatar.id === channel?.writingProfile?.brandProfileId && avatar.analysed);
  return bound?.id ?? choices.defaultAvatarId;
}

export function useAgentWritingChoices() {
  const request = useFetch();
  const user = useUser();
  const result = useSWR<WritingChoices>(['agent-writing-choices', user?.orgId], async () => {
    const responses = await Promise.all([request('/integrations/list'), request('/content-intelligence/voice/avatars')]);
    if (responses.some(response => !response.ok)) throw new Error('Writing choices unavailable');
    const [channels, avatars] = await Promise.all(responses.map(response => response.json()));
    if (!Array.isArray(channels.integrations) || !Array.isArray(avatars.avatars)) throw new Error('Writing choices unavailable');
    return {
      channels: channels.integrations.filter((channel: WritingChannel & { disabled?: boolean; inBetweenSteps?: boolean }) => !channel.disabled && !channel.inBetweenSteps),
      avatars: avatars.avatars,
      defaultAvatarId: avatars.defaultAvatarId ?? null,
    };
  }, { revalidateOnFocus: false });
  return { ...(result.data ?? EMPTY_CHOICES), loading: result.isLoading, error: !!result.error, retry: () => { void result.mutate(); } };
}
