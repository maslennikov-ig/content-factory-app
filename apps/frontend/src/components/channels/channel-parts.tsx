'use client';
import { useState } from 'react';
import dayjs from 'dayjs';
import { ChannelMark } from '../ui/brand/channel-mark';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { channelsCopy, type ChannelsLocale } from './channels.copy';
import { channelState, type ChannelRow } from './channel-model';

export function ChannelAvatar({ row }: { row: ChannelRow }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative h-12 w-12 shrink-0">
      {row.picture && !failed ? (
        <img
          src={row.picture}
          alt=""
          className="h-12 w-12 rounded-[8px] object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ChannelMark name={row.name} size={48} />
      )}
      <PlatformBadge
        identifier={row.identifier}
        size={24}
        className="absolute -bottom-1 -end-1"
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
