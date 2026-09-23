import type { Dayjs } from 'dayjs';

/**
 * Free channel slots of one calendar cell (`97dq.50`).
 *
 * A channel's schedule (`Integration.time`) holds minutes after UTC midnight.
 * The day view has always turned them into rows; the week and month now use the
 * same times to draw a dashed «+ 09:20» chip, so an empty cell says which time
 * the channel is waiting for instead of offering a bare plus.
 *
 * Pure: the caller converts a schedule minute to a local minute of the day
 * (`toLocalMinute`), so the time zone rule stays in one place — the calendar —
 * and this file can be read and tested without a clock.
 */
export type SlotChannel = {
  id?: string;
  name: string;
  disabled?: boolean;
  time?: { time: number }[];
};

export type FreeSlot = {
  /** The slot moment on the cell's day. */
  at: Dayjs;
  /** `HH:mm`, the key the posts of the cell are compared by. */
  key: string;
  /** Names of the channels whose schedule holds this time, in order. */
  channels: string[];
  /** Ids of the same channels, where known — the picker preselects one. */
  channelIds: string[];
};

const two = (value: number) => String(value).padStart(2, '0');

export function freeSlotsOn({
  channels,
  day,
  now,
  toLocalMinute,
  taken = [],
  hour,
}: {
  channels: SlotChannel[];
  /** Any moment of the cell's day; only its date is used. */
  day: Dayjs;
  now: Dayjs;
  toLocalMinute: (scheduleMinute: number) => number;
  /** `HH:mm` of posts already in the cell: an occupied time is not free. */
  taken?: readonly string[];
  /** Week cells ask for one hour of the day only. */
  hour?: number;
}): FreeSlot[] {
  const byKey = new Map<string, FreeSlot>();
  for (const channel of channels) {
    if (channel.disabled) continue;
    for (const entry of channel.time ?? []) {
      if (typeof entry?.time !== 'number') continue;
      const local = ((toLocalMinute(entry.time) % 1440) + 1440) % 1440;
      const h = Math.floor(local / 60);
      const m = local % 60;
      if (hour !== undefined && h !== hour) continue;
      const key = `${two(h)}:${two(m)}`;
      if (taken.includes(key)) continue;
      const at = day.startOf('day').hour(h).minute(m).second(0).millisecond(0);
      if (!at.isAfter(now)) continue;
      const slot = byKey.get(key);
      if (slot) {
        if (!slot.channels.includes(channel.name)) slot.channels.push(channel.name);
        if (channel.id && !slot.channelIds.includes(channel.id))
          slot.channelIds.push(channel.id);
      } else {
        byKey.set(key, {
          at,
          key,
          channels: [channel.name],
          channelIds: channel.id ? [channel.id] : [],
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.at.valueOf() - b.at.valueOf());
}
