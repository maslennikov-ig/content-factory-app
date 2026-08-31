import {
  characterNgramDistance,
  type CharacterNgramProfile,
} from './character-ngrams';
import type { BrandVoiceLocale } from './brand-voice.types';

/**
 * The relative decision: closer to this author than to anybody else?
 *
 * The absolute rule — "distance below the threshold" — was measured on
 * 2026-08-25 against the adversary that matters, the product's own generated
 * text on the author's own topics, and it called **all one hundred and twenty**
 * of them the author's, at every crop from 600 to 1200 characters. That is not
 * a threshold wanting a nudge. The 95th percentile of an author's own distances
 * answers "how far do this person's texts wander" and says nothing whatever
 * about how close somebody else comes; both answers of the research say so, and
 * the run put a number on the omission.
 *
 * Asked relatively, the same character n-grams separate the author from
 * generated text with an AUC of 0.86–0.88 and from a stranger's prose at 0.998.
 * Nothing about the feature changed. The question did.
 *
 * The method is the impostors family named in the research (§1.10 of the
 * digest): score the text against this author's print and against several
 * impostor prints, over random halves of the feature set, and count how often
 * the author wins. A vote is bounded, comparable between authors and between
 * languages — which a raw distance never was, because five characters are not
 * the same linguistic unit in two writing systems.
 */

/**
 * One impostor, as rates over every window it wrote.
 *
 * Rates and not a top-400 profile, because the comparison happens on the
 * author's windows and an impostor has to be answerable about windows it would
 * never have put in a profile of its own. A truncated profile answers a
 * different question and makes every impostor look distant from every text.
 *
 * Frequencies and not text, which is also what keeps this shippable: the
 * research is unanimous that a corpus never goes inside a product, and derived
 * statistics are the form that does.
 */
export type ImpostorRates = Record<string, number>;

/**
 * Тот же подставной, но выровненный по окнам конкретного автора.
 *
 * Голосование спрашивает подставного только про окна из отпечатка автора —
 * `weight: grams.map((gram) => rates[gram] ?? 0)` ниже, и ни про какое другое
 * окно ответ не берётся. Значит, словарь на пять тысяч ключей хранить незачем:
 * достаточно тысячи чисел в том же порядке, в каком лежит `print.grams`.
 *
 * Это и есть то, что делает шеренгу свойством разбора, а не файла в сборке.
 * Набор, собранный из настоящих коротких текстов других авторов системы, весит
 * тогда столько же, сколько сам отпечаток, и едет вместе с ним — а вместе с
 * ним и умирает, когда корпус пересчитан.
 */
export type AlignedImpostor = number[];

/**
 * Чем один отпечаток отличается от другого, коротко.
 *
 * Не хеш ради хеша: сравниваются длина списка окон, размер окна и первое с
 * последним окном. Два разбора одного корпуса дают одно значение, два разных
 * корпуса — разные, и стоит это одну строку вместо прохода по тысяче.
 */
export const fingerprintOf = (print: CharacterNgramProfile): string =>
  `${print.size}/${print.grams.length}/${print.grams[0]}/${
    print.grams[print.grams.length - 1]
  }`;

/** Веса подставного по выбранным в этом раунде окнам. */
const weightsOf = (
  impostor: ImpostorRates | AlignedImpostor,
  grams: readonly string[],
  indices: readonly number[]
): number[] =>
  Array.isArray(impostor)
    ? indices.map((index) => impostor[index] ?? 0)
    : grams.map((gram) => impostor[gram] ?? 0);

/** The impostor set for one language. */
export type ImpostorSet = {
  /** Version of the built set, so a saved verdict can be explained later. */
  version: string;
  locale: BrandVoiceLocale;
  /** Where the frequencies came from, in words, for the person auditing this. */
  source: string;
  /** The n-gram size the rates were counted at; a set of another size is unusable. */
  size: number;
  impostors: (ImpostorRates | AlignedImpostor)[];
  /**
   * Отпечаток, по окнам которого выровнены массивы, если они массивы.
   *
   * Без него выровненный набор молча приложился бы к другому отпечатку —
   * числа встали бы на чужие окна, и голосование поехало бы, не сообщив об
   * этом ничем. Проверяется перед первым раундом.
   */
  alignedTo?: string;
};

/** The minimum length the relative decision will judge. */
export const IMPOSTOR_MIN_CHARS = 400;

/**
 * Two thirds of the votes.
 *
 * Measured on the owner's corpus: the point chosen against the real adversary
 * landed at 74% of the votes, and two thirds is the round number just below it
 * — a floor that can be said out loud to a person. At two thirds his own
 * holdout posts pass four times in five and generated text is let through two
 * to twelve times in a hundred, against a hundred in a hundred under the old
 * rule.
 *
 * **Not falsified on one corpus.** The number is one measurement on one author
 * in one language, and `content-factory-next-pl1.4` is where it is either
 * confirmed or moved.
 */
export const IMPOSTOR_VOTE_FLOOR = 2 / 3;

/** Random halves of the profile, and how many of them. */
export const IMPOSTOR_ROUNDS = 60;
export const IMPOSTOR_FEATURE_SHARE = 0.5;

/**
 * Deterministic by construction.
 *
 * A verdict a person sees over their own post must not change when they reload
 * the page, and a measurement nobody can reproduce is not evidence. The seed is
 * fixed and the draw is a plain function of it.
 */
const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
};

export const IMPOSTOR_SEED = 20260825;

export type ImpostorVote = {
  /** Share of draws in which the author's print was closest. */
  votes: number | null;
  floor: number;
  rounds: number;
  impostors: number;
  reason?: 'NO_PROFILE' | 'NO_IMPOSTORS' | 'TOO_SHORT';
};

/**
 * @param print the author's own n-gram profile
 * @param set the impostors for this language, or nothing
 */
export function impostorVote(
  text: string,
  print: CharacterNgramProfile | null | undefined,
  set: ImpostorSet | null | undefined,
  options: { rounds?: number; share?: number; seed?: number } = {}
): ImpostorVote {
  const rounds = options.rounds ?? IMPOSTOR_ROUNDS;
  const base: ImpostorVote = {
    votes: null,
    floor: IMPOSTOR_VOTE_FLOOR,
    rounds,
    impostors: set?.impostors.length ?? 0,
  };
  if (!print?.grams?.length) return { ...base, reason: 'NO_PROFILE' };
  if (!set?.impostors.length) return { ...base, reason: 'NO_IMPOSTORS' };
  if (set.size !== print.size) return { ...base, reason: 'NO_IMPOSTORS' };
  /**
   * Выровненный набор годится только тому отпечатку, по которому выровнен.
   *
   * Числа лежат позиционно, поэтому чужой отпечаток не вызвал бы ни ошибки, ни
   * исключения — веса просто встали бы на другие окна, и голосование поехало
   * бы молча. Отказ дороже такого ответа.
   */
  if (
    set.impostors.some((one) => Array.isArray(one)) &&
    set.alignedTo !== fingerprintOf(print)
  ) {
    return { ...base, reason: 'NO_IMPOSTORS' };
  }
  if (text.trim().length < IMPOSTOR_MIN_CHARS) {
    return { ...base, reason: 'TOO_SHORT' };
  }

  const random = mulberry32(options.seed ?? IMPOSTOR_SEED);
  const keep = Math.max(
    20,
    Math.round(print.grams.length * (options.share ?? IMPOSTOR_FEATURE_SHARE))
  );

  let wins = 0;
  for (let round = 0; round < rounds; round += 1) {
    const picked = new Set<number>();
    while (picked.size < keep) {
      picked.add(Math.floor(random() * print.grams.length));
    }
    const indices = [...picked];
    /**
     * One feature space for every side of the comparison: the author's windows.
     * An impostor is weighted on those same windows, with a rate of zero where
     * it never wrote one.
     */
    const grams = indices.map((index) => print.grams[index]);
    const mine = characterNgramDistance(text, {
      ...print,
      grams,
      weight: indices.map((index) => print.weight[index]),
    }).distance;
    if (mine === null) return { ...base, reason: 'TOO_SHORT' };
    let best = Infinity;
    for (const rates of set.impostors) {
      const theirs = characterNgramDistance(text, {
        ...print,
        grams,
        weight: weightsOf(rates, grams, indices),
      }).distance;
      if (theirs !== null && theirs < best) best = theirs;
    }
    if (best === Infinity) return { ...base, reason: 'NO_IMPOSTORS' };
    if (mine < best) wins += 1;
  }
  return { ...base, votes: wins / rounds };
}
