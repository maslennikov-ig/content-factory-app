import type { Integrations } from '../launches/calendar.context';
import { intakeCopy } from '../content-intelligence/intake/intake.copy';
import { channelsCopy, type ChannelsLocale } from './channels.copy';

export type ChannelRow = Integrations;
export type ChannelState = 'active' | 'refresh' | 'disabled' | 'incomplete';
export type ChannelFilter = 'all' | 'working' | 'attention' | 'disabled';
export type ChannelView = 'cards' | 'table';
export const CHANNELS_VIEW_COOKIE = 'channels-view';
export const channelView = (value: string): ChannelView =>
  value === 'table' ? 'table' : 'cards';
export const channelHref = (id: string) =>
  `/channels/${encodeURIComponent(id)}`;
export function channelState(row: ChannelRow): ChannelState {
  if (row.inBetweenSteps) return 'incomplete';
  if (row.disabled) return 'disabled';
  return row.refreshNeeded ? 'refresh' : 'active';
}
export function matchesChannelFilter(row: ChannelRow, filter: ChannelFilter) {
  const state = channelState(row);
  return (
    filter === 'all' ||
    (filter === 'working' && state === 'active') ||
    (filter === 'attention' &&
      (state === 'refresh' || state === 'incomplete')) ||
    (filter === 'disabled' && state === 'disabled')
  );
}
export function filterChannels(
  rows: ChannelRow[],
  filter: ChannelFilter,
  search: string
) {
  const query = search.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      matchesChannelFilter(row, filter) &&
      row.name.toLocaleLowerCase().includes(query)
  );
}
export function groupChannels(rows: ChannelRow[]) {
  const groups = new Map<
    string,
    { id: string; name?: string; rows: ChannelRow[] }
  >();
  for (const row of rows) {
    const id = row.customer?.id ?? '';
    if (!groups.has(id))
      groups.set(id, { id, name: row.customer?.name, rows: [] });
    groups.get(id)!.rows.push(row);
  }
  return [...groups.values()];
}
/** Only a real public URL from the provider is a link; names never become URLs. */
export function publicChannelUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function channelProfileSummary(row: ChannelRow, locale: ChannelsLocale) {
  const profile = row.writingProfile;
  if (!profile) return null;
  const t = intakeCopy[locale];
  const c = channelsCopy[locale];
  const length =
    typeof profile.lengthPolicy === 'string'
      ? profile.lengthPolicy === 'auto' ? t.profileAuto : c.providerLimit
      : `${profile.lengthPolicy.idealMin}–${profile.lengthPolicy.idealMax} ${c.chars}`;
  const emoji = {
    none: t.profileEmojiNone,
    few: t.profileEmojiFew,
    many: t.profileEmojiFree,
    auto: t.profileAuto,
  }[profile.emojiLevel];
  const link = {
    none: t.profileLinkNone,
    end: t.profileLinkEnd,
    inline: t.profileLinkInline,
    auto: t.profileAuto,
  }[profile.linkPolicy];
  const cta = {
    none: t.profileCtaNone,
    question: t.profileCtaQuestion,
    comment: t.profileCtaComment,
    link: t.profileCtaLink,
    subscribe: t.profileCtaSubscribe,
    reply: t.profileCtaReply,
    auto: t.profileAuto,
  }[profile.ctaKind];
  return [
    length,
    `${t.profileEmoji.toLocaleLowerCase()}: ${emoji}`,
    link,
    cta,
  ].join(' · ');
}
