'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Range } from '@contentfactory/react/form/range';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import { emojiDivisionWord, emojiStopWord } from './emoji-words';
import {
  EMOJI_STOPS,
  emojiStopAt,
  emojiStopIndex,
  emojiStopOf,
  type EmojiLevel,
  type EmojiStop,
} from './writing-profile.adapter';

const LAST = EMOJI_STOPS.length - 1;

/**
 * Where a stop's centre sits inside the handle's box.
 *
 * The native thumb is 24px, so its centre travels from 12px to `100% - 12px`;
 * the fill and the channel tick are placed through the same formula, which is
 * what keeps all three on the same point.
 */
const at = (index: number) => `calc(12px + (100% - 24px) * ${index / LAST})`;

/**
 * Emoji as an exact ceiling (`content-factory-next-97dq.61`, variant A).
 *
 * One handle over six stops — нет · 1 · 3 · 6 · 10 · без предела — and the
 * value read out as words: «до 6». The generator gets the same number
 * («no more than 6»), so what the person set is what the prompt says.
 *
 * Old values (`few`, `many`, `auto`) are drawn at their nearest stop and not
 * rewritten: nothing changes in storage until the handle moves.
 *
 * `channel` draws the channel's own value as a grey tick on the track. On «Для
 * этого поста» that is the answer to «what would happen if I left it»; on the
 * channel card there is nothing to compare with and no tick.
 *
 * `label` (`97dq.83`): the field's label goes on the same row as the readout
 * — label at the start, «до N» at the end — instead of the readout taking a
 * row of its own under the label.
 *
 * Geometry: the six captions sit in six equal cells and the handle's box is
 * inset by half a cell, so every stop is exactly under its caption and a long
 * caption («без предела») has a whole cell to wrap in rather than running
 * into «10».
 */
export function EmojiCeilingSlider({
  locale,
  value,
  onChange,
  channel = null,
  muted = false,
  changed = false,
  disabled = false,
  id,
  describedBy,
  dataName = 'emoji',
  label,
}: {
  locale: IntakeLocale;
  value: EmojiLevel;
  onChange: (stop: EmojiStop) => void;
  /** The channel's value, drawn as a grey tick. */
  channel?: EmojiLevel | null;
  /** The value is the channel's, not chosen here. */
  muted?: boolean;
  /** Differs from the channel: the readout takes the «changed» colour. */
  changed?: boolean;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
  dataName?: string;
  /** The field's label, drawn on the readout's row. */
  label?: ReactNode;
}) {
  const t = intakeCopy[locale];
  const index = emojiStopIndex(value);
  const stop = emojiStopOf(value);
  const readout = emojiStopWord(locale, stop);
  const channelIndex = channel ? emojiStopIndex(channel) : null;
  const channelWord = channel
    ? emojiStopWord(locale, emojiStopOf(channel))
    : '';
  const inset = `calc(100% / ${EMOJI_STOPS.length * 2} - 12px)`;

  return (
    <div
      data-emoji-slider={dataName}
      data-emoji-stop={stop}
      data-emoji-changed={changed ? 'true' : 'false'}
      className="flex min-w-0 flex-col gap-[4px]"
    >
      <div
        data-emoji-label-row="true"
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-[12px] gap-y-[4px]"
      >
        {label ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-[8px]">
            {label}
          </div>
        ) : null}
        <span className="ms-auto flex min-w-0 flex-wrap items-baseline justify-end gap-x-[8px]">
          {/* Не `<output>`: его неявная роль `status` объявляла бы каждое
            движение ручки, а ручка и так читает «до N» через aria-valuetext. */}
          <span
            data-emoji-readout="true"
            className={clsx(
              'cf-label-md tabular-nums',
              changed
                ? 'text-cf-signature'
                : muted
                ? 'text-cf-ink-muted'
                : 'text-cf-ink'
            )}
          >
            {readout}
          </span>
          {channel && changed ? (
            <span
              data-emoji-channel-note="true"
              className="cf-caption text-cf-ink-muted"
            >
              {t.profileEmojiInChannel(channelWord)}
            </span>
          ) : null}
        </span>
      </div>

      <div className="relative h-[44px] min-w-0 sm:h-[40px]">
        <div
          className="absolute inset-y-0"
          style={{ insetInlineStart: inset, insetInlineEnd: inset }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-x-[12px] top-1/2 h-[4px] -translate-y-1/2 rounded-[4px] bg-cf-surface-subtle"
          />
          <span
            aria-hidden="true"
            className={clsx(
              'absolute top-1/2 h-[4px] -translate-y-1/2 rounded-[4px]',
              muted ? 'bg-cf-border-strong' : 'bg-cf-accent'
            )}
            style={{
              insetInlineStart: '12px',
              width: `calc((100% - 24px) * ${index / LAST})`,
            }}
          />
          {channelIndex !== null ? (
            <span
              aria-hidden="true"
              data-emoji-channel-mark={emojiStopOf(channel as EmojiLevel)}
              className="absolute top-1/2 h-[12px] w-0.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-cf-ink-muted rtl:translate-x-1/2"
              style={{ insetInlineStart: at(channelIndex) }}
            />
          ) : null}
          <Range
            id={id}
            min={0}
            max={LAST}
            step={1}
            value={index}
            disabled={disabled}
            aria-label={t.profileEmojiSlider}
            aria-valuetext={readout}
            aria-describedby={describedBy}
            className="pointer-events-auto cursor-pointer"
            onChange={(event) =>
              onChange(emojiStopAt(Number(event.target.value)))
            }
          />
        </div>
      </div>

      <div
        aria-hidden="true"
        data-emoji-divisions="true"
        className="grid min-w-0 grid-cols-6 cf-caption text-cf-ink-muted"
      >
        {EMOJI_STOPS.map((division) => (
          <span
            key={division}
            className={clsx(
              'min-w-0 text-center [overflow-wrap:normal]',
              division === stop && !muted && 'text-cf-ink'
            )}
          >
            {emojiDivisionWord(locale, division)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default EmojiCeilingSlider;
