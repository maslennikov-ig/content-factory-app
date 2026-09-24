/**
 * How many emoji a post may carry — one scale for the channel card, «Для
 * этого поста» and the prompt (`content-factory-next-97dq.61`, variant A).
 *
 * The owner picked a slider with an exact «до N» over the stops
 * нет · 1 · 3 · 6 · 10 · без предела. «Мало» and «много» were words the
 * generator had to translate into a number on its own, and it translated
 * them differently from post to post.
 *
 * Storage stays the one string field it always was (`emojiLevel` in the
 * `Integration.writingProfile` JSON column and in the adapt overrides), so
 * no migration: the scale adds values beside the old ones instead of
 * replacing them.
 *
 * - `none` is shared: the old «без эмодзи» and the new «нет» are the same
 *   instruction.
 * - `max1`, `max3`, `max6`, `max10` are exact ceilings.
 * - `unlimited` is «без предела». Not `free`: a stored `free` is the oldest
 *   spelling of «много» and still reads as `many` everywhere.
 * - `few`, `many` and `auto` are legacy. They keep reading and keep their
 *   wording in the prompt until a person moves the slider; the screen shows
 *   them at the nearest stop.
 */

export const EMOJI_LEGACY_LEVELS = ['none', 'few', 'many', 'auto'] as const;

export const EMOJI_STOPS = [
  'none',
  'max1',
  'max3',
  'max6',
  'max10',
  'unlimited',
] as const;

export type EmojiLegacyLevel = (typeof EMOJI_LEGACY_LEVELS)[number];
export type EmojiStop = (typeof EMOJI_STOPS)[number];
export type EmojiLevel = EmojiLegacyLevel | EmojiStop;

/** Every value a stored profile or an override may hold, old and new. */
export const EMOJI_LEVEL_VALUES: readonly EmojiLevel[] = [
  ...EMOJI_LEGACY_LEVELS,
  ...EMOJI_STOPS.filter(
    (stop) => !(EMOJI_LEGACY_LEVELS as readonly string[]).includes(stop)
  ),
];

/** The exact ceiling of a stop; `null` for «без предела». */
export const EMOJI_STOP_CEILING: Record<EmojiStop, number | null> = {
  none: 0,
  max1: 1,
  max3: 3,
  max6: 6,
  max10: 10,
  unlimited: null,
};

/**
 * Where an old value stands on the slider.
 *
 * `few` was «one to three», so it is «до 3»; `many` was «3–6 freely», so it
 * is «до 6»; `auto` never told the generator anything, which is what «без
 * предела» means. Reading is all this does: the stored value stays as it is
 * until the person moves the handle.
 */
const LEGACY_STOP: Record<EmojiLegacyLevel, EmojiStop> = {
  none: 'none',
  few: 'max3',
  many: 'max6',
  auto: 'unlimited',
};

export const isEmojiLevel = (value: unknown): value is EmojiLevel =>
  typeof value === 'string' &&
  (EMOJI_LEVEL_VALUES as readonly string[]).includes(value);

export const isEmojiStop = (value: unknown): value is EmojiStop =>
  typeof value === 'string' &&
  (EMOJI_STOPS as readonly string[]).includes(value);

/** The stop a stored value is drawn at. */
export function emojiStopOf(level: EmojiLevel): EmojiStop {
  if (isEmojiStop(level)) return level;
  return LEGACY_STOP[level as EmojiLegacyLevel] ?? 'unlimited';
}

/** Slider position of a stored value: 0 … 5. */
export const emojiStopIndex = (level: EmojiLevel): number =>
  EMOJI_STOPS.indexOf(emojiStopOf(level));

/** The value a slider position stores. Out of range clamps to the ends. */
export const emojiStopAt = (index: number): EmojiStop =>
  EMOJI_STOPS[
    Math.max(0, Math.min(EMOJI_STOPS.length - 1, Math.round(index)))
  ];

/**
 * Normalize whatever a column or a request holds.
 *
 * `free` is the oldest spelling of `many` and keeps meaning it; anything
 * unknown falls back to the caller's default.
 */
export function readEmojiLevel(
  value: unknown,
  fallback: EmojiLevel
): EmojiLevel {
  const candidate = value === 'free' ? 'many' : value;
  return isEmojiLevel(candidate) ? candidate : fallback;
}

/**
 * The ceiling the text checks honour (`content-factory-next-97dq.83`).
 *
 * «До 3» is a count the person chose, so a post with three kinds of emoji is
 * within it and the stock-phrase catalogue must not call it decoration. A stop
 * or an old word gives its number (`few` was «one to three», `many` «3–6»);
 * «без предела» is `null` — no cap; `auto` and anything unknown are
 * `undefined` — nothing chosen, the platform's own threshold stands.
 *
 * «Нет» is `0` (review of 97dq.81-85, P3-7): the person chose zero, so any
 * emoji in the post is over the ceiling. The kinds threshold treats `0` as
 * «nothing to widen», so only the count check reads it.
 */
export function emojiCeilingOf(level: unknown): number | null | undefined {
  const read = readEmojiLevel(level, 'auto');
  if (read === 'auto') return undefined;
  if (read === 'none') return 0;
  if (read === 'few') return 3;
  if (read === 'many') return 6;
  return EMOJI_STOP_CEILING[read as EmojiStop];
}
