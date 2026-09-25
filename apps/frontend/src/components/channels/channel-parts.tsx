'use client';
import { useState } from 'react';
import dayjs from 'dayjs';
import { ChannelMark } from '../ui/brand/channel-mark';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { channelsCopy, type ChannelsLocale } from './channels.copy';
import { channelState, type ChannelRow } from './channel-model';

/** `integrations.controller` answers `/no-picture.jpg` for a channel without one. */
export const isPlaceholderPicture = (picture?: string | null) =>
  !picture || picture.endsWith('/no-picture.jpg');

/**
 * The channel picture with its platform badge; a picture that is missing or
 * fails to load becomes the two-letter `ChannelMark`, never the white
 * `no-picture` circle. `compact` is the 28px list-row size (the calendar's
 * «Что публикуем»). The mark sets its letters clear of the badge corner.
 */
export function ChannelAvatar({
  row,
  compact = false,
}: {
  row: Pick<ChannelRow, 'picture' | 'name' | 'identifier'>;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const size = compact ? 28 : 48;
  // The integrations list fills a missing picture with the placeholder path;
  // that placeholder is a blank white disc, not a picture of the channel.
  const picture = isPlaceholderPicture(row.picture) ? null : row.picture;
  return (
    <div
      className={
        compact
          ? 'relative h-[28px] w-[28px] shrink-0'
          : 'relative h-12 w-12 shrink-0'
      }
    >
      {picture && !failed ? (
        <img
          src={picture}
          alt=""
          width={size}
          height={size}
          className={
            compact
              ? 'h-[28px] w-[28px] rounded-[4px] object-cover'
              : 'h-12 w-12 rounded-[8px] object-cover'
          }
          onError={() => setFailed(true)}
        />
      ) : (
        <ChannelMark name={row.name} size={size} badged />
      )}
      <PlatformBadge
        identifier={row.identifier}
        size={compact ? 16 : 24}
        className={
          compact ? 'absolute -bottom-[4px] -end-[4px]' : 'absolute -bottom-1 -end-1'
        }
      />
    </div>
  );
}
export function ChannelStatus({
  row,
  locale,
}: {
  row: ChannelRow;
  locale: ChannelsLocale;
}) {
  const state = channelState(row);
  const t = channelsCopy[locale];
  const labels = {
    active: t.activeState,
    refresh: t.refreshState,
    disabled: t.disabledState,
    incomplete: t.incompleteState,
  };
  const dots = {
    active: 'bg-cf-accent',
    refresh: 'bg-cf-warning',
    disabled: 'bg-cf-border-strong',
    incomplete: 'bg-cf-danger',
  };
  return (
    <span className="inline-flex items-center gap-2 cf-caption text-cf-ink-muted">
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${dots[state]}`}
      />
      {labels[state]}
    </span>
  );
}
export function ChannelSlots({
  row,
  locale,
}: {
  row: ChannelRow;
  locale: ChannelsLocale;
}) {
  return row.time?.length ? (
    <div className="flex flex-wrap gap-2">
      {row.time.map(({ time }) => (
        <span
          key={time}
          className="inline-flex h-7 items-center rounded-[4px] border border-cf-border bg-cf-surface-subtle px-2 cf-caption text-cf-ink"
        >
          {dayjs
            .utc()
            .startOf('day')
            .add(time, 'minutes')
            .local()
            .format('HH:mm')}
        </span>
      ))}
    </div>
  ) : (
    <span className="cf-caption text-cf-ink-muted">
      {channelsCopy[locale].noSlots}
    </span>
  );
}
export const channelDate = (date?: string | null, withTime = false) =>
  date && dayjs(date).isValid()
    ? dayjs(date).format(withTime ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY')
    : '—';
