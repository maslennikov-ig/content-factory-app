import type { BrandVoiceLocale, StyleScaleKey } from './brand-voice.types';
import type { PostHabitMetricKey } from './post-habits';
import type { CompositeJudgingMetric } from './voice-composite';
import type { LocalePack } from './locale-pack';
import { measureSingleText } from './style-scales';

/**
 * What "more than usual" is measured against.
 *
 * «Доля вопросительных фраз 6,2 %» tells nobody anything: a reader cannot say
 * whether that is a lot. «Задаёт читателю вопросы заметно чаще обычного» can be
 * acted on. The method is not new — it is Burrows's Delta, a z-score against a
 * reference corpus, and both research answers arrive at it independently (свод
 * §1.9). Both also attach one condition: the reference has to match the author
 * in language and in register. An author of a Telegram channel compared against
 * scientific papers discovers the register, not the person.
 *
 * Both answers are equally honest that they found no direct evidence that the
 * relative phrasing is easier for a person to read than the raw number. That is
 * a reasoned conclusion, not an established fact, and it is recorded as one.
 *
 * ## What the norm is here, and what it is not
 *
 * It is the product's own generation with no voice at all — the owner's
 * decision of 2026-08-25. Two reasons, and the second is the load-bearing one.
 * Every ready-made corpus of short social writing is either licence-closed or
 * unverified (Leipzig is unverified and does not enter the code until a person
 * reads its terms). And the reference must match the author in language and
 * register: a no-voice generation on the author's own topics, in the author's
 * language, at the length a model writes, is the closest match the product can
 * obtain without acquiring somebody's personal writing.
 *
 * **The weakness, said out loud rather than buried: the norm is a model, not
 * people.** So the product says «заметнее, чем у обычного сгенерированного
 * поста» and never «заметнее, чем у большинства людей». Every sentence built on
 * this norm has to survive that reading.
 *
 * ## Why median and MAD rather than mean and standard deviation
 *
 * Style shares are skewed — most posts contain no questions at all, a few
 * contain many — and a mean sits away from the bulk while a standard deviation
 * is inflated by the tail. The research names the preferred form directly: a
 * robust z through median and MAD, or an empirical percentile. This uses the
 * first, with the 1.4826 factor that makes MAD comparable to a standard
 * deviation on normal data, so a threshold expressed in σ keeps its usual
 * meaning.
 */

/**
 * The version stamped on every profile computed against this norm.
 *
 * Versioned for the same reason `LOCALE_PACK_VERSION` is, and it matters more:
 * the norm changes every number a person has already read. A profile stores the
 * version it was computed against, so a description written in August can still
 * be explained in December.
 */
export const VOICE_NORM_VERSION = 'voice-norm/ru-2026-08-30' as const;

/**
 * Всё, для чего норма может быть заявлена: восемь шкал, привычки поста и
 * судящие измерения второго голоса.
 *
 * Судящие добавлены 30.08.2026. До этого норма знала девять измерений, а второй
 * мерке нужны восемь, из которых пять она описать не могла вовсе — раскладки
 * поста и доли цифр в норме не было. Измерение, известное автору и неизвестное
 * норме, сравнивать не с чем, и `scoreComposite` его молча пропускает; пять
 * пропущенных из восьми оставили бы вердикт на трёх.
 */
export type NormMetricKey =
  | StyleScaleKey
  | PostHabitMetricKey
  | CompositeJudgingMetric;

export type NormStat = {
  /** The middle of the reference population, in the metric's own unit. */
  median: number;
  /**
   * Median absolute deviation, already scaled by 1.4826.
   *
   * Zero where the reference population never varies: no no-voice generation
   * writes a list paragraph or uses a single emoji, across every post the norm
   * was built from. That is a property of the reference and not a failure to
   * measure it — `deviationOf` reads it as "anything else is beyond everything
   * seen" rather than dividing by zero.
   */
  scale: number;
  /**
   * How many reference posts this metric was actually observed in.
   *
   * Not the same as the file's `posts`, and the difference is the reason the
   * field exists. `measureSingleText` returns a scale only where the text gave
   * it something to divide by: 45 of the first 48 no-voice posts contain
   * neither a first-person pronoun nor an institutional noun, so `firstPerson`
   * rested on three observations while every neighbour rested on forty-eight.
   * A band drawn from three posts is noise wearing a number, and the build
   * refuses to ship one.
   */
  observed: number;
};

export type VoiceNorm = {
  version: string;
  locale: BrandVoiceLocale;
  /** How the reference population was obtained, in one line a person reads. */
  source: string;
  /** How many texts it was computed over. Small numbers stay visible. */
  posts: number;
  stats: Partial<Record<NormMetricKey, NormStat>>;
};

/**
 * Where an author sits against the norm.
 *
 * `flat` is not `typical`. `typical` says the author was compared and came out
 * ordinary; `flat` says the norm does not vary on this metric, so there is
 * nothing to be ordinary against — and `absent` says there is no norm for this
 * metric at all. Collapsing the three would let the product say «как у всех»
 * about a comparison it never made, which is the class of lie this epic keeps
 * finding.
 */
export type DeviationBand =
  | 'far-above'
  | 'above'
  | 'typical'
  | 'below'
  | 'far-below'
  | 'flat'
  | 'absent';

export type Deviation = {
  band: DeviationBand;
  /** Robust z. `null` where the band carries no comparison. */
  z: number | null;
  /** The author's own number, always kept for whoever wants to check. */
  raw: number;
  /** The norm's middle, so the two can be printed side by side. */
  normMedian: number | null;
};

/**
 * The two thresholds, set once for every metric.
 *
 * The task states the requirement plainly: one set of bands for all
 * measurements, not a threshold picked by taste per scale. Picking per scale is
 * how a product ends up calling 6% «заметно чаще» on one axis and «как у всех»
 * on another, with nothing but the author's preference between them.
 *
 * One and two robust sigmas. On normal data that is the outer third and the
 * outer twentieth, which matches what «заметно» and «намного» mean in ordinary
 * speech closely enough to be defensible, and no closer — there is no measured
 * ground for a finer split, and inventing one would be the taste this rule
 * exists to remove.
 */
export const DEVIATION_SIGMA = { noticeable: 1, strong: 2 } as const;

const bandFor = (z: number): DeviationBand => {
  if (z >= DEVIATION_SIGMA.strong) return 'far-above';
  if (z >= DEVIATION_SIGMA.noticeable) return 'above';
  if (z <= -DEVIATION_SIGMA.strong) return 'far-below';
  if (z <= -DEVIATION_SIGMA.noticeable) return 'below';
  return 'typical';
};

/**
 * Where this author's number sits, given a norm.
 *
 * Returns `absent` rather than throwing when the norm does not cover the
 * metric: a language whose norm has not been built is a language the product
 * describes in raw numbers, and it says so instead of comparing against
 * somebody else's.
 */
export function deviationOf(
  key: NormMetricKey,
  raw: number,
  norm: VoiceNorm | null
): Deviation {
  const stat = norm?.stats?.[key];
  if (!stat || !Number.isFinite(raw)) {
    return { band: 'absent', z: null, raw, normMedian: null };
  }
  /**
   * A reference that never varies, and what a departure from it means.
   *
   * `flat` used to be returned here, and it was the wrong answer: a norm where
   * every one of forty-eight posts scored exactly zero is not a norm that
   * cannot be compared against — it is one where any other value lies beyond
   * everything ever seen. Saying «сравнить не с чем» about the most
   * discriminating fact the reference holds would throw it away. `flat`
   * survives for the case it is actually about: a metric that varies too
   * little to band but is not constant, which no reference has produced yet.
   */
  if (!stat.scale || !Number.isFinite(stat.scale) || stat.scale <= 0) {
    if (raw > stat.median) {
      return { band: 'far-above', z: null, raw, normMedian: stat.median };
    }
    if (raw < stat.median) {
      return { band: 'far-below', z: null, raw, normMedian: stat.median };
    }
    return { band: 'typical', z: null, raw, normMedian: stat.median };
  }
  const z = (raw - stat.median) / stat.scale;
  return {
    band: bandFor(z),
    z: Math.round(z * 100) / 100,
    raw,
    normMedian: stat.median,
  };
}

/* -------------------------------------------------------------------------
 * Building a norm
 * ---------------------------------------------------------------------- */

const median = (values: readonly number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** The 1.4826 that makes MAD comparable to a standard deviation. */
export const MAD_TO_SIGMA = 1.4826;

/**
 * One metric's norm from its values in the reference population.
 *
 * Exported because the build script and the tests both need it, and a second
 * implementation of a statistic is a second thing to get wrong.
 */
export function normStatOf(values: readonly number[]): NormStat | null {
  const finite = values.filter((one) => Number.isFinite(one));
  // Too thin to band. `null` rather than a stat nobody may use: a caller
  // handed a number cannot tell it apart from one drawn on forty-eight posts.
  if (finite.length < MIN_NORM_POSTS) return null;
  const middle = median(finite);
  const deviations = finite.map((one) => Math.abs(one - middle));
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    median: round(middle),
    scale: round(median(deviations) * MAD_TO_SIGMA),
    observed: finite.length,
  };
}

/**
 * How few observations make a norm not worth stating.
 *
 * A MAD over a handful of posts is mostly noise, and a band drawn from noise
 * says «заметно чаще» about nothing. Twenty is a judgement, and it is written
 * down once so that it is one judgement rather than one per rebuild.
 *
 * It applies twice: to the reference as a whole, and to each metric inside it.
 * The second is not redundant — a metric can be observable in three posts of a
 * forty-eight-post reference, and `firstPerson` was exactly that.
 */
export const MIN_NORM_POSTS = 20;

/* -------------------------------------------------------------------------
 * Placing an author against the norm
 * ---------------------------------------------------------------------- */

/**
 * Anything a font would draw as a picture rather than a letter.
 *
 * The same class `post-habits.ts` counts emoji by and the norm was built with;
 * `tests/brand-voice.norm.test.cjs` holds the copies equal. Three chances for
 * the author's side and the reference's side to count different things and
 * call the difference a habit.
 */
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

export type CorpusDeviations = {
  normVersion: string;
  byMetric: Record<
    string,
    {
      band: DeviationBand;
      z: number | null;
      raw: number;
      /**
       * Середина эталона, сохранённая вместе с положением автора.
       *
       * Без неё предложение, собранное из хранимого измерения, теряет
       * единственную часть, которая различает двух авторов внутри одной
       * полосы: замер 28.08.2026 дал 36,4 % и 56,5 % фраз короче восьми слов
       * и одно и то же слово «сильно» на обоих. Она же нужна, чтобы описание,
       * показанное человеку в августе, объяснялось в декабре — норма
       * версионируется именно за этим, а версия без числа объясняет только
       * себя.
       */
      normMedian?: number | null;
    }
  >;
};

/**
 * Where this author's corpus sits against the norm, metric by metric.
 *
 * ## Почему медиана по постам, а не одно измерение всего корпуса
 *
 * Норма построена на распределении **по постам**: сорок восемь сгенерированных
 * текстов, у каждого своя доля вопросов. Мерить автора одним числом по всему
 * корпусу — по склеенному тексту — значило бы сравнивать две разные величины и
 * называть разницу позицией. Поэтому каждый пост меряется отдельно, и против
 * нормы ставится медиана.
 *
 * ## Почему это живёт здесь, а не в сервисе
 *
 * До 28.08.2026 функция была приватным методом `VoiceService`, и повторить её
 * снаружи можно было только второй копией. Приёмка `pl1.6` — «два разных автора
 * получают разные описания» — проверяется на стенде, а стенд обязан судить тем
 * же, чем судит продукт; вторая копия разошлась бы с первой молча, потому что
 * обе возвращают правдоподобные полосы.
 *
 * @returns `null`, когда нормы нет или ни одно измерение к ней не привязано.
 *   Это читается как «позиция не названа» и никогда как «как обычно».
 */
export function deviationsForCorpus(
  samples: readonly { text: string }[],
  pack: LocalePack,
  norm: VoiceNorm | null
): CorpusDeviations | null {
  if (!norm) return null;

  const perMetric = new Map<NormMetricKey, number[]>();
  const add = (key: NormMetricKey, value: number) => {
    if (!Number.isFinite(value)) return;
    const found = perMetric.get(key) ?? [];
    found.push(value);
    perMetric.set(key, found);
  };
  for (const sample of samples) {
    const text = sample.text.trim();
    if (!text) continue;
    const measured = measureSingleText(text, pack);
    for (const [key, value] of Object.entries(measured)) {
      add(key as NormMetricKey, value as number);
    }
    add('postLength', text.length);
    /**
     * Emoji, counted here because nothing else counts them per post.
     *
     * Left out of the first cut and it showed: the profile's own `emojiPolicy`
     * said «rarely» about an author measured at 5.6 per thousand characters
     * whose quoted posts are full of them, and the block carried the policy
     * and no measurement to argue with it.
     */
    add(
      'emojiRate',
      (1000 * (text.match(EMOJI_PATTERN) ?? []).length) / text.length
    );
  }

  const middle = (values: number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    const at = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[at]! : (sorted[at - 1]! + sorted[at]!) / 2;
  };

  const byMetric: CorpusDeviations['byMetric'] = {};
  for (const [key, values] of perMetric) {
    if (!values.length) continue;
    const deviation = deviationOf(key, middle(values), norm);
    // A metric the norm says nothing about is left out rather than stored as
    // `absent`: a stored `absent` and a missing key mean the same thing, and
    // one of them costs a row of JSON on every measurement.
    if (deviation.band === 'absent') continue;
    byMetric[key] = {
      band: deviation.band,
      z: deviation.z,
      raw: deviation.raw,
      normMedian: deviation.normMedian,
    };
  }
  if (!Object.keys(byMetric).length) return null;
  return { normVersion: norm.version, byMetric };
}
