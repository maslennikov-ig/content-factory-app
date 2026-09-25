/**
 * How many emoji a post carries — one scale for the channel card, «Для этого
 * поста», the prompt and the text checks.
 *
 * `content-factory-next-97dq.96`, owner decision 25.09.2026: «нельзя указывать
 * количество, ведь может быть очень большой лонгрид, а может быть очень
 * маленький пост… без эмодзи, меньше, средне, много и как можно больше,
 * словами, чтобы был ползунок». The exact «до N» of `97dq.61` is gone: a stop
 * is a density — characters of text per emoji — and the count is worked out
 * from the length of the post (`emojiRangeFor`).
 *
 * Storage stays the one string field it always was (`emojiLevel` in the
 * `Integration.writingProfile` JSON column and in the adapt overrides and post
 * settings), so no migration: old values map on read (`readEmojiLevel`).
 *
 * The ids `few` and `many` are reused on purpose. They were the words of the
 * scale before `97dq.61` («1–3» and «3–6 freely»), and the densities «Мало»
 * and «Много» are what those words meant; a stored `few` — the untouched
 * Russian Telegram channel — now reads as «Мало» and gets its line.
 *
 * - `none` · `few` · `medium` · `many` · `max` — the five stops.
 * - `auto` — nothing chosen: the channel and the voice decide, no line.
 * - `max1` → few, `max3` → medium, `max6` → many, `max10` → max, `unlimited`
 *   → many: the `97dq.61` stops, read at the density nearest to them.
 * - `free` — the oldest spelling of `many`.
 */

export const EMOJI_STOPS = ['none', 'few', 'medium', 'many', 'max'] as const;

/** The `97dq.61` stops: accepted at the doors, read as a density. */
export const EMOJI_LEGACY_LEVELS = [
  'max1',
  'max3',
  'max6',
  'max10',
  'unlimited',
] as const;

export type EmojiStop = (typeof EMOJI_STOPS)[number];
export type EmojiDensity = Exclude<EmojiStop, 'none'>;
export type EmojiLegacyLevel = (typeof EMOJI_LEGACY_LEVELS)[number];
/** What a profile holds after reading: a stop, or nothing chosen. */
export type EmojiLevel = EmojiStop | 'auto';
/** What a column or a request may hold: today's values and the old stops. */
export type StoredEmojiLevel = EmojiLevel | EmojiLegacyLevel;

/** Every value the doors accept, new first. `free` is added where it was. */
export const EMOJI_LEVEL_VALUES: readonly StoredEmojiLevel[] = [
  ...EMOJI_STOPS,
  'auto',
  ...EMOJI_LEGACY_LEVELS,
];

const LEGACY_LEVEL: Record<EmojiLegacyLevel | 'free', EmojiDensity> = {
  max1: 'few',
  max3: 'medium',
  max6: 'many',
  max10: 'max',
  unlimited: 'many',
  free: 'many',
};

/**
 * Characters of text per emoji, the table the owner approved on 25.09.2026:
 * «Мало» one per 400–700, «Средне» one per 200–350, «Много» one per 100–180,
 * «Как можно больше» one per 50–90.
 */
export const EMOJI_DENSITY: Record<
  EmojiDensity,
  { sparsest: number; densest: number }
> = {
  few: { sparsest: 700, densest: 400 },
  medium: { sparsest: 350, densest: 200 },
  many: { sparsest: 180, densest: 100 },
  max: { sparsest: 90, densest: 50 },
};

/** The length a density is counted against when the post has none given. */
export const EMOJI_DEFAULT_POST_CHARS = 800;

export const isEmojiLevel = (value: unknown): value is EmojiLevel =>
  value === 'auto' || isEmojiStop(value);

/** Anything the doors accept, old stops included; `free` is not among them. */
export const isStoredEmojiLevel = (value: unknown): value is StoredEmojiLevel =>
  typeof value === 'string' &&
  (EMOJI_LEVEL_VALUES as readonly string[]).includes(value);

export const isEmojiStop = (value: unknown): value is EmojiStop =>
  typeof value === 'string' &&
  (EMOJI_STOPS as readonly string[]).includes(value);

export const isEmojiDensity = (value: unknown): value is EmojiDensity =>
  isEmojiStop(value) && value !== 'none';

/**
 * Normalize whatever a column or a request holds.
 *
 * Old values become today's densities; anything unknown falls back to the
 * caller's default. Reading is all this does — nothing is written back.
 */
export function readEmojiLevel<Fallback>(
  value: unknown,
  fallback: Fallback
): EmojiLevel | Fallback {
  if (isEmojiLevel(value)) return value;
  if (typeof value === 'string' && value in LEGACY_LEVEL)
    return LEGACY_LEVEL[value as keyof typeof LEGACY_LEVEL];
  return fallback;
}

/**
 * The stop a value is drawn at. `auto` has no stop of its own and stands in
 * the middle, «Средне»; nothing changes in storage until the handle moves.
 */
export function emojiStopOf(level: unknown): EmojiStop {
  const read = readEmojiLevel(level, 'auto' as const);
  return read === 'auto' ? 'medium' : read;
}

/** Slider position of a stored value: 0 … 4. */
export const emojiStopIndex = (level: unknown): number =>
  EMOJI_STOPS.indexOf(emojiStopOf(level));

/** The value a slider position stores. Out of range clamps to the ends. */
export const emojiStopAt = (index: number): EmojiStop =>
  EMOJI_STOPS[
    Math.max(0, Math.min(EMOJI_STOPS.length - 1, Math.round(index)))
  ];

/**
 * How many emoji a text of this length gets at this level.
 *
 * The fewest is the length at the sparse end of the density, rounded up; the
 * most is the length at the dense end, rounded down. Every stop but «Без
 * эмодзи» asks for at least one, and the most is never below the fewest, so a
 * short post at «Мало» gets exactly one. `charsMax` is the long end when the
 * length is a range (the prompt's «500 to 1000 characters»): the fewest counts
 * against the short end, the most against the long one.
 *
 * `null` for `auto` and for anything unknown — no count was chosen.
 */
export function emojiRangeFor(
  level: unknown,
  chars: number,
  charsMax: number = chars
): { min: number; max: number } | null {
  const read = readEmojiLevel(level, 'auto' as const);
  if (read === 'auto') return null;
  if (read === 'none') return { min: 0, max: 0 };
  const density = EMOJI_DENSITY[read];
  const short = Math.max(0, Number.isFinite(chars) ? chars : 0);
  const long = Math.max(short, Number.isFinite(charsMax) ? charsMax : short);
  const min = Math.max(1, Math.ceil(short / density.sparsest));
  const max = Math.max(min, Math.floor(long / density.densest));
  return { min, max };
}

/**
 * The ceiling the text checks honour (`97dq.83`, `97dq.96`).
 *
 * A density is kept as its id, because the count depends on the length of
 * the text being checked, and only the check knows it (`emojiCeilingAt`).
 * «Без эмодзи» is `0`: any emoji is over it. `auto` and anything unknown are
 * `undefined` — nothing chosen, the platform's own threshold stands. `null`
 * (the old «без предела», now read as «Много») is still understood by the
 * checks as «no cap», but nothing produces it any more.
 */
export type EmojiCeiling = number | EmojiDensity;

export function emojiCeilingOf(level: unknown): EmojiCeiling | undefined {
  const read = readEmojiLevel(level, 'auto' as const);
  if (read === 'auto') return undefined;
  if (read === 'none') return 0;
  return read;
}

/**
 * The ceiling as a count for a text of `chars` characters.
 *
 * A started stretch of the densest spacing allows one more emoji (rounded up,
 * where the prompt's range rounds down). The prompt counts against the length
 * it asked for; a post that came out shorter was flagged one over for staying
 * inside what the prompt allowed (live stand 25.09.2026: 3 at 539 chars on
 * «Средне», 4 at 368 on «Много»). The check is for clear excess, not for ±1.
 */
export function emojiCeilingAt(
  ceiling: EmojiCeiling | null | undefined,
  chars: number
): number | null | undefined {
  if (ceiling === null) return null;
  if (ceiling === undefined) return undefined;
  if (typeof ceiling === 'number') return ceiling;
  const range = emojiRangeFor(ceiling, chars);
  if (!range) return undefined;
  const densest = EMOJI_DENSITY[ceiling].densest;
  return Math.max(range.max, Math.ceil(Math.max(0, chars) / densest));
}
