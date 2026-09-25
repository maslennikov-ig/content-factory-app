'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Range } from '@contentfactory/react/form/range';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import { emojiLevelWord, emojiStopWord } from './emoji-words';
import {
  EMOJI_STOPS,
  emojiStopAt,
  emojiStopIndex,
  emojiStopOf,
  type EmojiStop,
  type StoredEmojiLevel,
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
 * Emoji as a density in words (`content-factory-next-97dq.96`, owner
 * decision 25.09.2026; replaces the «до N» stops of `97dq.61`).
 *
 * One handle over five stops — Без эмодзи · Мало · Средне · Много · Как можно
 * больше — and the value read out as the same word. There is no number: a
 * long read and a short post at «Средне» carry different counts, and the
 * prompt works the count out from the post's length (`emojiRangeFor`).
 *
 * Old values (`max1` … `unlimited`, `free`) are drawn at the density they now
 * mean, `auto` in the middle; nothing changes in storage until the handle
 * moves.
 *
 * `channel` draws the channel's own value as a grey tick on the track. On «Для
 * этого поста» that is the answer to «what would happen if I left it»; on the
 * channel card there is nothing to compare with and no tick.
 *
 * `label` (`97dq.83`, `97dq.92`): label, handle and readout share one row —
 * «Эмодзи (?)» at the start, the handle between, the word at the end. Only a
 * field narrower than 520px puts the handle on a row of its own under them:
 * below that the middle column leaves the captions too little room
 * (review of the fifteenth walk, F5). Without a label there is no label
 * cell, and nothing makes the row taller than the readout.
 *
 * Geometry: the five captions sit in five equal cells and the handle's box is
 * inset by half a cell, so every stop is exactly under its caption. A long
 * caption («Как можно больше», «As many as fit») wraps inside its own cell — between
 * words first, inside a word only when a word is wider than the cell — so it
 * never runs into «Много».
 *
 * Each caption is a button that sets its stop (`2q28.22`): the words looked
 * clickable and did nothing, so a click on «Средне» left the value at «Мало».
 * The handle stays the one control that arrows move; the captions are
 * reachable by Tab and pressed with Enter or Space, and the current one says
 * so through `aria-pressed`.
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
  value: StoredEmojiLevel;
  onChange: (stop: EmojiStop) => void;
  /** The channel's value, drawn as a grey tick. */
  channel?: StoredEmojiLevel | null;
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
  // `auto` stands at «Средне» but reads as what it is: «выберем сами».
  const readout = emojiLevelWord(locale, value);
  const channelIndex = channel ? emojiStopIndex(channel) : null;
  const channelWord = channel ? emojiLevelWord(locale, channel) : '';
  const inset = `calc(100% / ${EMOJI_STOPS.length * 2} - 12px)`;

  /*
    Одна строка: «Эмодзи (?)» — ползунок — значение словом (`97dq.92`, пятнадцатый
    заход, C2: «она должна находиться между надписью и цифрой»). Решает
    ширина самого поля, а не окна: панель поста узкая и на широком экране.
    Уже 520 px — подпись и значение строкой, ползунок под ними во всю ширину
    (ревью волны, F5: на 400–520 px средней колонке оставалось 25–33 px на
    деление). Подпись и значение стоят по высоте дорожки, подписи делений —
    под ней. Классы с вариантом `[@container(min-width:520px)]:` написаны
    целиком: Tailwind находит класс только буквально, склеенный он не
    существует. Что правила действительно попадают в CSS, держит
    `tests/emoji-ceiling.container-css.test.cjs`, собирая стили конфигом
    фронтенда.
  */
  const labelled = label !== undefined && label !== null && label !== false;
  return (
    <div
      data-emoji-slider={dataName}
      data-emoji-stop={stop}
      data-emoji-changed={changed ? 'true' : 'false'}
      className="min-w-0 [container-type:inline-size]"
    >
      <div
        data-emoji-label-row="true"
        className={clsx(
          'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-[12px] gap-y-[4px]',
          labelled
            ? '[@container(min-width:520px)]:grid-cols-[fit-content(40%)_minmax(0,1fr)_fit-content(30%)]'
            : '[@container(min-width:520px)]:grid-cols-[minmax(0,1fr)_fit-content(30%)]'
        )}
      >
        {labelled ? (
          <div
            data-emoji-label-cell="true"
            className="col-start-1 row-start-1 flex min-h-[44px] min-w-0 flex-wrap items-center gap-x-[8px] sm:min-h-[40px]"
          >
            {label}
          </div>
        ) : null}
        <span
          data-emoji-readout-cell="true"
          className={clsx(
            'col-start-2 row-start-1 flex min-w-0 flex-wrap items-center justify-end gap-x-[8px]',
            labelled
              ? 'min-h-[44px] sm:min-h-[40px] [@container(min-width:520px)]:col-start-3'
              : // Без подписи высоту строке задаёт только сама дорожка рядом.
                '[@container(min-width:520px)]:min-h-[44px] sm:[@container(min-width:520px)]:min-h-[40px]'
          )}
        >
          {/* Не `<output>`: его неявная роль `status` объявляла бы каждое
            движение ручки, а ручка и так читает значение через aria-valuetext. */}
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

        <div
          data-emoji-track-cell="true"
          className={clsx(
            'col-span-2 row-start-2 flex min-w-0 flex-col gap-[4px]',
            labelled
              ? '[@container(min-width:520px)]:col-span-1 [@container(min-width:520px)]:col-start-2 [@container(min-width:520px)]:row-start-1'
              : '[@container(min-width:520px)]:col-span-1 [@container(min-width:520px)]:col-start-1 [@container(min-width:520px)]:row-start-1'
          )}
        >
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
                  data-emoji-channel-mark={emojiStopOf(channel)}
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
            data-emoji-divisions="true"
            className="grid min-w-0 grid-cols-5 cf-caption text-cf-ink-muted"
          >
            {EMOJI_STOPS.map((division) => {
              const word = emojiStopWord(locale, division);
              const current = division === stop;
              return (
                <ControlButton
                  key={division}
                  layout="content"
                  data-emoji-division={division}
                  aria-label={`${t.profileEmojiSlider}: ${word}`}
                  aria-pressed={current}
                  disabled={disabled}
                  onClick={() => {
                    if (!current || muted) onChange(division);
                  }}
                  className={clsx(
                    'min-w-0 cursor-pointer rounded-[4px] text-center cf-caption [overflow-wrap:anywhere] transition-colors duration-state hover:text-cf-ink motion-reduce:transition-none',
                    current && !muted ? 'text-cf-ink' : 'text-cf-ink-muted'
                  )}
                >
                  {word}
                </ControlButton>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmojiCeilingSlider;
