/**
 * The other four-star feature: character n-grams.
 *
 * The 86 service words in `function-words.ts` are the most-cited authorship
 * marker there is, and on this product's texts they are too sparse to decide
 * anything. The arithmetic says why. A post on the owner's channel is about a
 * hundred and twenty words. His rate for `как` is twelve per thousand, the
 * control corpus's is two — a large difference, and at that length it is the
 * difference between expecting one and a half of them and expecting a quarter
 * of one. Eighty-six such near-coin-flips do not add up to a verdict: measured
 * on his corpus on 2026-08-24, the service-word distance put his held-out post
 * closer than a stranger's text in 55.3% of pairs. That is a coin.
 *
 * Character n-grams are the same research's other four-star feature — the 2023
 * representation-generalisation review rates them beside function words, and
 * PAN 2022 saw a plain character-n-gram cosine baseline beat neural
 * submissions. They are dense where function words are sparse: the same
 * hundred-and-twenty-word post carries some seven hundred five-character
 * windows, so a short text still produces a full profile. On the same corpus
 * and the same pairs they scored 90.0%.
 *
 * What they buy and what they cost. They capture morphology, spacing,
 * punctuation and the shape of the writer's word endings — a Russian-specific
 * advantage, because a morphologically rich language puts a great deal of a
 * writer's habit into suffixes that no word list can see. They also creep
 * towards content: a long enough n-gram is a word. The profile is therefore
 * kept to the most frequent windows, which are dominated by endings,
 * prepositions and the spaces around them rather than by subject matter, and
 * capped at five characters, which is shorter than most Russian content words.
 */

/**
 * Moves when the arithmetic here changes, independently of the analyser.
 *
 * `1.2.0` — окно считается по код-пойнтам, а не по единицам UTF-16. Для текста
 * без эмодзи профиль тот же до последней граммы; для текста с эмодзи он
 * меняется, и прежний в базу вообще не записывался.
 */
export const NGRAM_MEASURE_VERSION = 'character-ngrams/1.2.0';

/**
 * Five characters.
 *
 * Four scored 78.6% on the owner's corpus, six 91.8%, five 90.0%. Six wins by
 * a point and buys it with whole short words inside the window, which is the
 * topic dependence this feature exists to avoid. Five is the longest window
 * that is still shorter than most Russian content words.
 */
export const NGRAM_SIZE = 5;

/**
 * How many of the author's most frequent windows the profile keeps.
 *
 * A thousand, raised from four hundred on 2026-08-27, and the reason the old
 * number looked right is worth keeping: four hundred and a thousand were
 * compared on the **absolute** question — is this text's distance under the
 * threshold — and scored 90.0% against 88.7%, so the smaller was taken. That
 * question was afterwards measured to accept every generated text there was,
 * and the product now decides relatively, by the impostors vote. Under the
 * question the product actually asks, the answer inverts.
 *
 * Measured 2026-08-27 on three Russian corpora, AUC of the author's held-out
 * posts against the run's generations, worst corpus of the three:
 *
 * | окон | owner | avetov | britva | худший |
 * | --- | --- | --- | --- | --- |
 * | 400 | 0.909 | 0.778 | 0.699 | 0.699 |
 * | **1000** | **0.955** | **0.815** | **0.708** | **0.708** |
 * | 2500 | 0.957 | 0.818 | 0.673 | 0.673 |
 *
 * A thousand wins on the corpus that has the least to spare, which is the one
 * the number has to hold for. Two and a half thousand buys the two large
 * corpora another two points and takes three and a half from the small one:
 * past a thousand the tail is windows a short author wrote once, and they
 * dilute the vote rather than sharpen it.
 *
 * The cost is storage, and it is the same objection the old comment raised —
 * measured rather than estimated, a thousand windows is 15 KB of JSON against
 * six, once per analysis and not once per post.
 *
 * ## Отбор остаётся частотным, и это отрицательный результат
 *
 * Sapkota 2015 — «Not All Character N-grams Are Created Equal» — показывает,
 * что почти вся различающая сила символьных n-грамм сидит в окнах, несущих
 * аффикс или знак препинания, а не в самых частых; на английском отбор по типу
 * даёт +4,7…5,9 пункта при переносе между темами. Тот же отбор, поставленный
 * здесь 27.08.2026 (окно с пробелом на краю или со знаком препинания, всё
 * серединное выброшено), проиграл частотному на всех трёх корпусах и на всех
 * бюджетах: худший корпус 0.604 против 0.708 при тысяче окон.
 *
 * Это не опровержение Sapkota, а граница его переносимости, и она известна:
 * повторения сообщают, что преимущество типизированного отбора не нашлось для
 * португальского и под вопросом для турецкого. Русский, судя по этому замеру,
 * в том же ряду — морфология кладёт авторскую привычку в окончания, которые
 * частотный отбор и так поднимает наверх, а выбрасывание серединных окон
 * забирает у морфологически богатого языка больше, чем возвращает.
 */
export const NGRAM_PROFILE_SIZE = 1_000;

/** Under this a text has too few windows for the cosine to mean anything. */
export const MIN_TEXT_CHARS = 200;

export const SELF_DISTANCE_PERCENTILE = 0.95;

/**
 * The smallest distance this treats as a difference at all.
 *
 * A corpus of near-identical texts — the same post with a number changed, a
 * template filled in twice, a feed that reposts itself — has almost no spread
 * of its own, and the 95th percentile of its leave-one-out distances lands at
 * zero. Without a floor the threshold is then zero, and the author's own next
 * post reads as a stranger's because it differs in the fourth decimal place.
 *
 * Well below anything measured on real writing: on the owner's channel his own
 * held-out posts sat at 0.58 and the line fell at 0.76. It only ever raises a
 * threshold that was an artefact of duplicated material.
 */
export const MIN_THRESHOLD = 0.05;

export type CharacterNgramProfile = {
  measureVersion: string;
  size: number;
  /** The author's most frequent windows, most frequent first. */
  grams: string[];
  /** Share of all the author's windows, per kept window. */
  weight: number[];
  sampleCount: number;
  /** The spread of this author's own texts around their own profile. */
  selfMedian: number;
  threshold: number;
};

/**
 * One shape with nullable halves rather than a discriminated union.
 *
 * This workspace compiles with `strictNullChecks: false`, and under it a union
 * discriminated by `true | false` does not narrow — the same reason
 * `isScaleValue` exists a few files over. One shape and a `measured` flag is
 * the honest version of what the compiler can actually check here.
 */
export type NgramDistance = {
  measured: boolean;
  /** Present when `measured`; null otherwise. */
  distance: number | null;
  /** Present when not `measured`; null otherwise. */
  reason: 'TOO_SHORT' | 'NO_PROFILE' | null;
  charCount: number;
};

/**
 * One reading of the text for the counter: lower case, `ё` folded to `е`, runs
 * of whitespace collapsed to one space, and a space at each end so that the
 * first and last words carry their boundary the way every other word does.
 *
 * Punctuation and emoji stay. They are habits, not noise — the design already
 * counts a dash standing in for a copula as one of the eight scales, and a
 * writer who ends a line with an emoji does it on purpose.
 */
export const normaliseForNgrams = (text: string): string =>
  ` ${text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()} `;

/**
 * Окно шириной `size` символов, где символ — код-пойнт, а не единица UTF-16.
 *
 * Разница видна ровно на эмодзи, и она не косметическая. Эмодзи в JavaScript
 * это пара единиц, и `slice` по индексам резал её пополам: в профиль попадала
 * половина эмодзи — одинокий суррогат, — а профиль уходит в JSON. Postgres
 * такой JSON не принимает вовсе: `lone leading surrogate in hex escape`, и
 * разбор корпуса с эмодзи падал с `500`. Найдено на боевой 28.08.2026, на всех
 * трёх голосах сразу; до 1000 окон обрубки просто не доживали до верхних 400.
 *
 * Чинить отбрасыванием таких грамм было бы неверно: файл держит эмодзи
 * намеренно — «a writer who ends a line with an emoji does it on purpose», — и
 * половина эмодзи не привычка автора, а артефакт кодировки. Считая по
 * код-пойнтам, эмодзи становится одним символом, каким его и видит человек.
 */
export function countNgrams(text: string, size: number): Map<string, number> {
  const source = Array.from(normaliseForNgrams(text));
  const counts = new Map<string, number>();
  for (let index = 0; index + size <= source.length; index += 1) {
    const gram = source.slice(index, index + size).join('');
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

const percentileOf = (sorted: number[], fraction: number): number => {
  if (sorted.length === 0) return 0;
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1)
  );
  return sorted[rank];
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Cosine distance between a text and a profile, over the profile's windows.
 *
 * Cosine rather than Delta because a short text and a corpus differ in scale
 * by two orders of magnitude and cosine does not care: it compares direction,
 * which is the shape of the habit, and ignores length, which is not.
 */
const cosineDistance = (
  text: Map<string, number>,
  grams: readonly string[],
  weight: readonly number[]
): number => {
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < grams.length; index += 1) {
    const mine = text.get(grams[index]) ?? 0;
    const theirs = weight[index];
    dot += mine * theirs;
    left += mine * mine;
    right += theirs * theirs;
  }
  if (left === 0 || right === 0) return 1;
  return 1 - dot / (Math.sqrt(left) * Math.sqrt(right));
};

export function buildCharacterNgramProfile(
  samples: readonly { text: string }[],
  size: number = NGRAM_SIZE,
  keep: number = NGRAM_PROFILE_SIZE
): CharacterNgramProfile | null {
  const usable = samples.filter(
    (sample) => sample.text.trim().length >= MIN_TEXT_CHARS
  );
  if (usable.length < 2) return null;

  const perSample = usable.map((sample) => countNgrams(sample.text, size));
  const pooled = new Map<string, number>();
  for (const counts of perSample) {
    for (const [gram, count] of counts) {
      pooled.set(gram, (pooled.get(gram) ?? 0) + count);
    }
  }
  if (pooled.size === 0) return null;

  const grams = [...pooled.entries()]
    .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))
    .slice(0, keep)
    .map(([gram]) => gram);
  const total = [...pooled.values()].reduce((sum, one) => sum + one, 0);
  const weight = grams.map((gram) => (pooled.get(gram) ?? 0) / total);

  /**
   * The author's own spread, measured leave-one-out.
   *
   * A sample scored against a profile it helped build scores too well, and a
   * threshold taken from flattered distances calls the author's next post a
   * stranger's. Only the rates are recomputed without the sample; the kept
   * window list stays the one the whole corpus chose, because a fold that
   * changes which windows are compared is not comparing the same thing.
   */
  const selfDistances: number[] = [];
  for (const counts of perSample) {
    const own = [...counts.values()].reduce((sum, one) => sum + one, 0);
    const rest = total - own;
    if (rest <= 0) continue;
    const withoutMe = grams.map(
      (gram, index) =>
        ((pooled.get(gram) ?? 0) - (counts.get(gram) ?? 0)) / rest
    );
    selfDistances.push(cosineDistance(counts, grams, withoutMe));
  }
  const sorted = [...selfDistances].sort((left, right) => left - right);

  return {
    measureVersion: NGRAM_MEASURE_VERSION,
    size,
    grams,
    weight: weight.map(round4),
    sampleCount: usable.length,
    // `Math.max(0, …)` and not for tidiness: a cosine of a vector against
    // itself comes back as a very small negative number, and `-0` printed on a
    // screen is a number nobody can explain.
    selfMedian: round4(Math.max(0, percentileOf(sorted, 0.5))),
    threshold: round4(
      Math.max(MIN_THRESHOLD, percentileOf(sorted, SELF_DISTANCE_PERCENTILE))
    ),
  };
}

export function characterNgramDistance(
  text: string,
  profile: CharacterNgramProfile | null | undefined,
  ): NgramDistance {
  const charCount = text.trim().length;
  if (!profile || profile.grams.length === 0) {
    return { measured: false, distance: null, reason: 'NO_PROFILE', charCount };
  }
  if (charCount < MIN_TEXT_CHARS) {
    return { measured: false, distance: null, reason: 'TOO_SHORT', charCount };
  }
  const counts = countNgrams(text, profile.size);
  return {
    measured: true,
    distance: round4(cosineDistance(counts, profile.grams, profile.weight)),
    reason: null,
    charCount,
  };
}
