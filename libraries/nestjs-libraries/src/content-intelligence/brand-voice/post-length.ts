import type { BrandVoiceLocale } from './brand-voice.types';

/**
 * Post length, checked outside the model and repaired at most once.
 *
 * Both answers of the research agree on the shape and on the reason. Models
 * follow exact length instructions badly: the tokenizer works in sub-words, so
 * there is nothing to count characters with, and training rewards verbosity.
 * The scheme they both arrive at is
 *
 *     draft → deterministic check → at most one surgical edit
 *
 * with a hard token ceiling as insurance rather than as the regulator, because
 * a token is not a character and the ratio between them depends on the
 * language — for a product in sixteen locales that is not a detail.
 *
 * The other warning both give, and the reason the prompt below is written the
 * way it is: a general "shorten to N" rewrites the voice from scratch. The edit
 * has to name what to keep and remove what is redundant, never retell.
 */

export type PostLengthRange = {
  median: number;
  low: number;
  high: number;
};

export type PostLengthCheck = {
  characters: number;
  range: PostLengthRange;
  placement: 'inside' | 'above' | 'below';
  /**
   * The hard ceiling, above which one edit is worth its call.
   *
   * Not `high` itself: the research says plainly that the last few percent of
   * length accuracy cost more than the naturalness of the rhythm, and a product
   * that fires a model call over eleven characters is buying nothing.
   */
  ceiling: number;
  /** Characters above the ceiling, and zero when there are none. */
  overBy: number;
  /**
   * The same corridor, minus whatever sits beside the content and cannot be
   * edited — the hook, plus the separator it is joined with.
   *
   * `range` is the author's *whole-post* corridor: the statistic it was
   * measured against pools whole posts, and `text` above is the whole post
   * too. But the edit and its judge below only ever see `content` — the hook
   * was fixed by an earlier node — so judging a shortened `content` against
   * `range.low` rejects a post that is already exactly as short as it needs
   * to be, once the hook beside it is counted. Equal to `range` when nothing
   * is fixed beside the content (`fixedLength` left at its default of 0), so
   * every content-only caller reads exactly what it did before this existed.
   */
  contentBudget: PostLengthRange;
};

/** A quarter above the author's own upper bound. See `ceiling`. */
export const LENGTH_CEILING_MARGIN = 1.25;

export function checkPostLength(
  text: string,
  range: PostLengthRange | null | undefined,
  /** Characters of `text` that are fixed and not part of what gets edited. */
  fixedLength = 0
): PostLengthCheck | null {
  if (!range || !Number.isFinite(range.median) || range.median <= 0) return null;
  const characters = text.trim().length;
  const ceiling = Math.round(range.high * LENGTH_CEILING_MARGIN);
  const placement =
    characters > range.high
      ? 'above'
      : characters < range.low
        ? 'below'
        : 'inside';
  const budget = (value: number) => Math.max(0, value - fixedLength);
  return {
    characters,
    range,
    placement,
    ceiling,
    overBy: Math.max(0, characters - ceiling),
    contentBudget: {
      median: budget(range.median),
      low: budget(range.low),
      high: budget(range.high),
    },
  };
}

/**
 * Everything the edit must not touch, taken from the draft rather than trusted
 * to the model's memory of it.
 *
 * Numbers with their units, quoted fragments, links and anything capitalised
 * mid-sentence — the four kinds of thing a shortening quietly drops first.
 */
export function protectedFragments(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /https?:\/\/\S+/gu,
    /\d+[\d\s.,]*\s?(?:%|₽|\$|€|[a-zA-Zа-яА-Я]{1,12})?/gu,
    /«[^»]{1,80}»/gu,
    /"[^"]{1,80}"/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      if (value.length >= 2) found.add(value);
    }
  }
  return [...found].slice(0, 24);
}

/**
 * The one edit, and it is a removal rather than a rewrite.
 *
 * The prompt says what to keep before it says what to do, because both answers
 * of the research report the same failure: a model asked to shorten produces a
 * summary in its own register, and the voice the whole epic is about is gone
 * from it.
 */
export function buildLengthTrimPrompt(input: {
  text: string;
  check: PostLengthCheck;
  locale: BrandVoiceLocale;
  keep?: readonly string[];
}): string {
  const russian = input.locale !== 'en';
  const keep = input.keep ?? protectedFragments(input.text);
  const lines: string[] = [];

  lines.push(
    russian
      ? 'Сократи пост, УБИРАЯ лишнее, а не пересказывая его.'
      : 'Shorten the post by REMOVING what is redundant, not by retelling it.'
  );
  lines.push(
    russian
      ? 'Голос, порядок мыслей, обращение к читателю и ритм фраз остаются как есть. Ни одного нового слова от себя.'
      : 'The voice, the order of the thoughts, the way the reader is addressed and the rhythm stay exactly as they are. Add nothing of your own.'
  );
  /**
   * The target and the "now" are both about `input.text` — the only thing
   * shown below and the only thing this call can change. `contentBudget` is
   * `range` with the hook already subtracted (see `PostLengthCheck`), and the
   * current count is read from `input.text` directly rather than from
   * `check.characters`, which counts the whole post the check was fired on.
   */
  const budget = input.check.contentBudget;
  lines.push(
    russian
      ? `ЦЕЛЬ ПО ДЛИНЕ: около ${budget.median} знаков, допустимо ${budget.low}–${budget.high}. Сейчас ${input.text.trim().length}.`
      : `TARGET LENGTH: about ${budget.median} characters, ${budget.low}–${budget.high} is fine. It is ${input.text.trim().length} now.`
  );
  if (keep.length) {
    lines.push(
      russian
        ? `СОХРАНИТЬ ДОСЛОВНО: ${keep.join(' · ')}`
        : `KEEP VERBATIM: ${keep.join(' · ')}`
    );
  }
  lines.push(
    russian
      ? 'Убирай в первую очередь: повторы одной мысли, вводные обороты, перечисления примеров сверх двух, объяснения того, что уже сказано.'
      : 'Remove first: repetitions of one thought, throat-clearing, lists of examples beyond two, explanations of what was already said.'
  );
  lines.push('');
  lines.push(russian ? 'ПОСТ:' : 'POST:');
  lines.push(input.text);
  return lines.join('\n');
}

export type LengthTrimFailure =
  | 'FRAGMENT_LOST'
  | 'NOT_SHORTER'
  | 'TOO_SHORT'
  | 'REWRITTEN';

/**
 * Whether the shortened draft may replace the original.
 *
 * A shortening that lost a number, or that came back below the author's own
 * lower bound, or that shares almost no wording with what it claims to have
 * trimmed, is a rewrite — and the product does not silently swap a person's
 * post for a model's summary of it.
 */
export function judgeLengthTrim(
  original: string,
  proposal: string,
  check: PostLengthCheck,
  keep?: readonly string[]
): { ok: boolean; reason?: LengthTrimFailure } {
  const fragments = keep ?? protectedFragments(original);
  const flat = (value: string) => value.replace(/\s+/gu, ' ').trim();
  const trimmed = flat(proposal);
  const lost = fragments.filter((one) => !trimmed.includes(flat(one)));
  if (lost.length) return { ok: false, reason: 'FRAGMENT_LOST' };
  if (trimmed.length >= flat(original).length) {
    return { ok: false, reason: 'NOT_SHORTER' };
  }
  // `contentBudget`, not `range`: `trimmed` is content alone, and `range.low`
  // is the whole post's floor. See `PostLengthCheck.contentBudget`.
  if (trimmed.length < check.contentBudget.low) {
    return { ok: false, reason: 'TOO_SHORT' };
  }

  /**
   * Overlap by words, not by characters: a summary of the same post shares its
   * facts and few of its sentences, and the words are what carries the manner.
   */
  const words = (value: string) =>
    new Set(
      flat(value)
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((one) => one.length > 3)
    );
  const before = words(original);
  const after = words(proposal);
  let shared = 0;
  for (const word of after) if (before.has(word)) shared += 1;
  if (after.size && shared / after.size < 0.8) {
    return { ok: false, reason: 'REWRITTEN' };
  }
  return { ok: true };
}
