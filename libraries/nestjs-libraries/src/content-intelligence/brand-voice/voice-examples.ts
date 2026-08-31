import {
  buildCharacterNgramProfile,
  characterNgramDistance,
  countNgrams,
  normaliseForNgrams,
  MIN_TEXT_CHARS,
  NGRAM_SIZE,
} from './character-ngrams';
import type { BrandVoiceSampleInput, CorpusSplit } from './brand-voice.types';

/**
 * Which of the author's own posts go into the profile as examples.
 *
 * Both answers of the research put demonstrations first and by a distance:
 * demonstrations beat descriptions, descriptions beat numbers. DITTO reports
 * +19 percentage points over few-shot prompting with fewer than ten
 * demonstrations. The product had the field — `content.examples` — showing it
 * on screen and, since 2026-08-25, sending it to the model as an instruction,
 * and nothing ever filled it. A workspace with 153 of the author's posts sent
 * none of them.
 *
 * Two rules the selection obeys, and both are measured rather than felt.
 *
 * **Never by closeness to the topic.** The one answer that brought numbers
 * measured it: picking the five posts nearest the topic makes authorship
 * similarity worse — Enron 95.44 → 81.28, Reddit 68.07 → 53.10, Blog
 * 19.40 → 10.33. There is no topic parameter in this file, and there is a test
 * that says so, because a parameter that exists is a parameter somebody wires
 * up later.
 *
 * **Never from the holdout half.** The holdout is what the profile is checked
 * against. An example drawn from it would be a post the voice has seen, judged
 * as a post the voice has never seen.
 *
 * ## Why the selection was rebuilt on 2026-08-26
 *
 * The prompt quotes three (`MAX_ON_BRAND_EXAMPLES` in `voice-directives.ts`),
 * the profile stores six, and until this change the three that reached the
 * model were the most central post plus the two most unlike it. On the owner's
 * corpus that trio sat at +2.1 robust z on emoji density and +1.5 on questions
 * against the corpus's own median — the author's extremes, taught as his
 * manner. Under the avatar, where quotes are the whole style signal, that is
 * three lines out of four rather than three out of nineteen.
 *
 * Three measurements decided the shape below, all on 108 training posts.
 *
 * 1. **Ranking by an uncropped distance is a length contest.** Spearman
 *    between length and distance to the centroid is −0.53: the most "typical"
 *    quartile has a median length of 1001 characters and the least typical of
 *    470. A longer text has more windows, a flatter histogram and therefore
 *    smaller distances — the same confound `measure` removes by cropping both
 *    sides before it compares. Cropping here takes it to −0.35.
 * 2. **Maximising variety maximises noise.** Pairwise unlikeness between real
 *    posts by one author runs 0.716…1.000 with a median of 0.980. The metric is
 *    saturated: it cannot tell a similar post from a different one, and a
 *    farthest-point walk over it therefore selects on whatever else correlates
 *    with it — length again, at −0.48. Raising the variety floor to 0.75 does
 *    not change the selection at all, which is the same fact from the other
 *    side.
 * 3. **Near-duplicates are still worth refusing, and they look nothing like
 *    the above.** One text reposted with a digit changed scores 0.035…0.050.
 *    The floor below sits seven times above that band and half the distance
 *    under the closest genuine pair observed, so it fires on copies and never
 *    on writing.
 *
 * ## The recency window, decided on 2026-08-26
 *
 * The measurement that raised the question: on the owner's corpus the centroid
 * leans on one period. Spearman between distance to it and position in the
 * channel is +0.67, and nine of the ten most central posts fall in the first
 * 30 % of it, where the author wrote in a heavier promo register — the corpus
 * median for emoji is 8.7 per thousand across its older half against 4.1 across
 * its newer. Quoting from there teaches the model a manner the author has
 * moved on from.
 *
 * The owner's decision: quotes come from the author's most recent posts, while
 * every number in the profile — length, scales, corridors, lexicon — goes on
 * being counted over the whole corpus. The split is deliberate and it is the
 * whole of the decision: statistics want every post there is, because thirty of
 * them make a noisy corridor, and quotes want the manner the author writes in
 * now, because under the avatar they are the only thing teaching manner at all.
 *
 * The window applies only where the corpus can actually be ordered in time,
 * which means a Telegram import: `externalRef` carries a message id that sorts.
 * A pasted or uploaded corpus carries nothing comparable, and a corpus mixing
 * the two cannot be ordered either — one post without a message id is one post
 * of unknown age, and there is no honest place to put it. Both keep the
 * previous behaviour, which is the whole training half.
 */

/** Four to six. Three independent works: two to ten changes almost nothing. */
export const MIN_VOICE_EXAMPLES = 4;
export const MAX_VOICE_EXAMPLES = 6;

/**
 * Both sides are cropped to the corpus's own median before they are compared.
 *
 * The ceiling stops a corpus of long-form essays from making the crop useless,
 * and the floor is the shortest text the ruler will score at all.
 */
export const MAX_RANKING_CROP = 1_500;

/**
 * Below this two candidates are the same post, not two posts.
 *
 * 0.035…0.050 is where one text reposted with a digit changed lands; 0.716 is
 * the closest pair of genuinely different posts measured on a real corpus.
 * Anything in between separates the two cases, and this sits with margin on
 * both sides rather than against either.
 */
export const MIN_EXAMPLE_UNLIKENESS = 0.35;

/**
 * How many of the author's most recent posts the quotes are chosen from.
 *
 * The owner's number, given as «последние 30-40 постов», taken at its upper
 * end. Both ends of the range were checked against what the window has to
 * survive: the selection needs enough candidates left after the training split,
 * the duplicate floor and the length band to still return six, and on the
 * owner's corpus — 108 training posts — a window of 30 leaves the length band
 * with too little to work inside and the second pass gives it up. Forty does
 * not, and it is still recent: those forty span the newest 26 % of the channel,
 * the half where emoji sit at 4.1 per thousand rather than 8.7.
 *
 * A corpus shorter than the window is its own window, which is the same rule
 * and not an exception: every post there is, is the most recent there is.
 */
export const RECENT_WINDOW = 40;

/**
 * Examples are preferred from the middle half of the corpus by length.
 *
 * The avatar block carries no sentence about how long a post should be — by
 * the owner's decision of 2026-08-25, the block is a person and their texts
 * rather than a list of rules — so the quotes are the only thing left teaching
 * length. Quoting the author's longest posts teaches the model to write longer
 * than the author does.
 */
const LENGTH_BAND = { low: 0.25, high: 0.75 } as const;

/**
 * The same ceiling the prompt builder clips to (`voice-directives.ts`).
 *
 * Kept equal on purpose: an example stored longer than the prompt will carry
 * is an example a person edits and the model never reads in full.
 */
export const MAX_EXAMPLE_CHARS = 700;

export type VoiceExample = {
  kind: 'on_brand';
  text: string;
  /** The sample this came from, so a person can see which post it is. */
  sourceCode?: string;
};

/**
 * The same example as the profile stores it — `kind` and `text`, nothing else.
 *
 * `sourceCode` is this module's own handle on a post and is not part of profile
 * content: `brand-profile.validation.ts` allows exactly two keys on an example
 * and refuses the whole activation over a third. Both paths that write examples
 * into a profile go through here, because they had already drifted apart —
 * `contentFrom` stripped the field and `setExamples` did not, so pressing
 * "подобрать примеры заново" refused with `VOICE_FIELDS_INCOMPLETE` naming six
 * `sourceCode:unknown_field` and a message about missing brand-profile fields.
 */
export const toProfileExamples = (
  examples: readonly VoiceExample[]
): { kind: 'on_brand'; text: string }[] =>
  examples.map((one) => ({ kind: one.kind, text: one.text }));

/** Cut on a sentence boundary when there is one within reach of the ceiling. */
const clip = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_EXAMPLE_CHARS) return trimmed;
  const window = trimmed.slice(0, MAX_EXAMPLE_CHARS);
  const lastStop = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
    window.lastIndexOf('\n')
  );
  if (lastStop > MAX_EXAMPLE_CHARS * 0.6) {
    return window.slice(0, lastStop + 1).trim();
  }
  return `${window.trimEnd()}…`;
};

/**
 * How unlike each other two posts are, cheaply.
 *
 * The Jaccard distance over their character windows. It is not the ruler the
 * profile is measured with and does not need to be: the only question asked of
 * it is "is this the same post again", and a shared-window count answers that
 * without building a profile per candidate. It is deliberately not asked
 * anything finer — between two different posts it returns 0.98 either way.
 */
const unlikeness = (left: Map<string, number>, right: Map<string, number>) => {
  let shared = 0;
  for (const gram of left.keys()) if (right.has(gram)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 1 : 1 - shared / union;
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const percentile = (sorted: readonly number[], share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * share))];

/**
 * A message id, or nothing at all.
 *
 * Deliberately strict: a Telegram import writes `String(message.id)` and
 * nothing else does, so anything that is not a plain non-negative integer is
 * some other kind of reference — a file name, a URL — and carries no time in
 * it. Reading one of those as an order would sort a corpus by whatever its file
 * names happened to be.
 */
const messageId = (externalRef?: string | null): number | null => {
  if (typeof externalRef !== 'string') return null;
  const trimmed = externalRef.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

/**
 * The window, or the whole corpus when it cannot be ordered.
 *
 * The condition is every candidate and not most of them, and that is the honest
 * reading rather than a strict one: a corpus where nine posts out of ten carry
 * a message id has one post of unknown age, and "recent" has no meaning that
 * both includes it and excludes it. Such a corpus keeps the previous behaviour
 * in full, so the change can never quietly narrow a selection on grounds it
 * cannot state.
 *
 * @returns the candidates the ranking then works over, with `age` dropped —
 *   nothing downstream may sort by recency again, because the ranking inside
 *   the window is by typicality and a second time ordering would silently make
 *   it "newest six".
 */
/**
 * Самые свежие тексты корпуса — общим правилом, для всех, кому нужна свежесть.
 *
 * Решение владельца 30.08.2026 расширило прежнее: свежесть перестала быть
 * свойством одних цитат и стала свойством ОПИСАНИЯ. «У человека меняется стиль,
 * поэтому всегда нужно брать более новые, какой бы объём он ни скидывал».
 *
 * Правило порядка здесь то же самое и переписано быть не может: время в корпусе
 * есть только у выгрузки Telegram, где `externalRef` несёт id сообщения. Один
 * пост без id — это один пост неизвестного возраста, и честного места ему нет
 * ни среди свежих, ни среди старых; такой корпус остаётся целиком, как и был.
 *
 * Второй копии этого правила заводить нельзя: анализатор и отбор цитат,
 * разошедшиеся в том, что считать свежим, разошлись бы бесшумно — оба вернули
 * бы правдоподобный список постов.
 */
export function mostRecentSamples<
  T extends { externalRef?: string | null },
>(samples: readonly T[], window: number): T[] {
  if (samples.length <= window) return [...samples];
  const dated = samples.map((one) => ({
    one,
    age: messageId(one.externalRef),
  }));
  if (dated.some((entry) => entry.age === null)) return [...samples];
  return dated
    .sort((left, right) => (left.age as number) - (right.age as number))
    .slice(-window)
    .map((entry) => entry.one);
}

const mostRecent = (
  eligible: readonly { code: string; text: string; age: number | null }[]
): { code: string; text: string }[] => {
  const strip = (one: { code: string; text: string }) => ({
    code: one.code,
    text: one.text,
  });
  if (!eligible.length || eligible.some((one) => one.age === null)) {
    return eligible.map(strip);
  }
  if (eligible.length <= RECENT_WINDOW) return eligible.map(strip);
  return [...eligible]
    .sort((left, right) => (left.age as number) - (right.age as number))
    .slice(-RECENT_WINDOW)
    .map(strip);
};

/**
 * The candidates, most typical of the corpus first.
 *
 * Exported because it is the unit the length discipline lives in, and the only
 * honest way to guard that discipline is to ask the ranking directly: repeating
 * a post's own text must not move it up. Without the crop it moves up a long
 * way, because a longer text has a flatter histogram and every distance to it
 * shrinks.
 */
export function rankByTypicality(
  candidates: readonly { code: string; text: string }[]
): { code: string; distance: number }[] {
  if (candidates.length < 2) return [];
  const crop = Math.min(
    MAX_RANKING_CROP,
    Math.max(
      MIN_TEXT_CHARS,
      Math.round(median(candidates.map((one) => one.text.length)))
    )
  );
  const cropped = candidates.map((one) => ({
    code: one.code,
    text: one.text.slice(0, crop),
  }));
  const profile = buildCharacterNgramProfile(cropped);
  if (!profile) return [];

  return cropped
    .map((one) => ({
      code: one.code,
      distance: characterNgramDistance(one.text, profile).distance,
    }))
    .filter((one): one is { code: string; distance: number } => one.distance !== null)
    /**
     * The sample code breaks every tie, so the choice is a property of the
     * corpus and not of the order a database happened to return it in. Two
     * activations of the same analysis show a person the same examples.
     */
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)
    );
}

/**
 * @param samples the corpus as the analyser received it
 * @param split the analyser's own TRAIN/HOLDOUT decision, by sample code
 */
export function selectVoiceExamples(
  samples: readonly BrandVoiceSampleInput[],
  split: Record<string, CorpusSplit>
): VoiceExample[] {
  /**
   * Deduplicated by the lowest sample code, not by whichever arrived first.
   *
   * Two rows can carry the same text under different hashes — normalisation
   * folds away what the hash kept apart — and "first wins" then makes the
   * selection a property of the order the database returned rows in. The same
   * analysis would show a person different examples on a different day.
   */
  const seenHashes = new Set<string>();
  const seenText = new Set<string>();
  const eligible: { code: string; text: string; age: number | null }[] = [];
  const inCodeOrder = [...samples].sort((left, right) =>
    left.code < right.code ? -1 : left.code > right.code ? 1 : 0
  );
  for (const sample of inCodeOrder) {
    if (split[sample.code] !== 'TRAIN') continue;
    const text = sample.text.trim();
    if (text.length < MIN_TEXT_CHARS) continue;
    const normalised = normaliseForNgrams(text);
    if (seenHashes.has(sample.contentHash) || seenText.has(normalised)) continue;
    seenHashes.add(sample.contentHash);
    seenText.add(normalised);
    eligible.push({ code: sample.code, text, age: messageId(sample.externalRef) });
  }
  const candidates = mostRecent(eligible);
  if (candidates.length < 2) return [];

  const full = new Map(candidates.map((one) => [one.code, one.text]));
  const scored = rankByTypicality(candidates).map((one) => ({
    code: one.code,
    text: full.get(one.code) as string,
    /**
     * Windows over the full text, not the cropped one: the crop exists to keep
     * the ranking off length, while the duplicate check wants everything a post
     * actually contains.
     */
    windows: countNgrams(full.get(one.code) as string, NGRAM_SIZE),
  }));
  if (!scored.length) return [];

  const lengths = [...candidates.map((one) => one.text.length)].sort(
    (left, right) => left - right
  );
  const band = {
    low: percentile(lengths, LENGTH_BAND.low),
    high: percentile(lengths, LENGTH_BAND.high),
  };

  const chosen: typeof scored = [];
  /**
   * Down the ranking, most typical first, in two passes.
   *
   * The length band is a preference and the second pass gives it up rather than
   * hand back fewer examples than the research supports. The duplicate floor is
   * a rule and there is no pass that gives it up: a corpus holding three
   * distinct texts returns three examples, because a fourth that repeats one of
   * them teaches the model to repeat itself and a person reading the profile
   * would see the corpus as richer than it is.
   */
  const walk = (
    accept: (one: (typeof scored)[number]) => boolean,
    limit: number
  ) => {
    for (const candidate of scored) {
      if (chosen.length >= limit) return;
      if (chosen.includes(candidate)) continue;
      if (!accept(candidate)) continue;
      chosen.push(candidate);
    }
  };

  const notADuplicate = (candidate: (typeof scored)[number]) =>
    chosen.every(
      (one) => unlikeness(one.windows, candidate.windows) >= MIN_EXAMPLE_UNLIKENESS
    );

  walk(
    (one) =>
      one.text.length >= band.low &&
      one.text.length <= band.high &&
      notADuplicate(one),
    MAX_VOICE_EXAMPLES
  );
  walk(notADuplicate, MIN_VOICE_EXAMPLES);

  return chosen.map((one) => ({
    kind: 'on_brand' as const,
    text: clip(one.text),
    sourceCode: one.code,
  }));
}
