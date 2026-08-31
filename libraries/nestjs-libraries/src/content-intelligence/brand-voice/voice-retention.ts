import {
  packFor,
  emptyLocalePack,
  DICTIONARY_BOUND_MEASUREMENTS,
} from './locale-pack';
import { impostorsFor } from './impostor-sets';
import { plural } from './plural';
import { measureSingleText } from './style-scales';
import { measureSimilarity, type VoiceSimilarity } from './voiceprint';
import type { VoiceCalibration } from './voice-calibration';
import { htmlToPlainText } from './html-text';
import { findTextSpots, type TextSpot } from './text-spots';
import {
  STYLE_SCALE_LABELS,
  isScaleValue,
  type StyleScaleKey,
} from './brand-voice.types';
import type {
  BrandVoiceMeasurementResult,
  BrandVoiceSampleInput,
  StyleScaleValue,
} from './brand-voice.types';

/**
 * Keeping a voice for longer than one paragraph.
 *
 * Every shipped brand-voice tool reports the same failure independently:
 * the profile is applied once as a prompt prefix and the model drifts back to
 * its defaults over a long generation. That is a property of the approach
 * rather than a bug in any of them, so it is treated here as something to
 * design against rather than to fix once.
 *
 * Three parts. The voice is re-injected at every chunk boundary instead of
 * only at the start. Generated text is measured by the same analyser that
 * measured the samples, so a drift is a number and not an impression. And a
 * profile version is activated only when text written under it lands inside
 * the statistics of a corpus the profile never saw.
 */

/**
 * Where a generation is cut, and therefore where the voice is restated.
 *
 * The list is the point: a thread item, a section, and a continuation are all
 * places the model starts producing again with the beginning out of its
 * effective attention.
 */
export type ChunkBoundary = 'thread-item' | 'section' | 'continuation';

export type VoiceInjection = {
  boundary: ChunkBoundary | 'start';
  index: number;
  text: string;
};

/**
 * The voice as it goes into a prompt: structured fields, a short prose line and
 * a few annotated examples.
 *
 * A combination rather than one of the three, because the evidence points at
 * the combination — structured fields for deterministic control, prose for
 * what a rule list cannot say, examples because concrete text teaches voice
 * better than adjectives.
 */
export function renderVoiceInjection(voice: {
  pointOfView?: string;
  formality?: string;
  sentenceLength?: { value: number; low: number; high: number };
  neverSay?: readonly string[];
  prose?: string;
  examples?: readonly { text: string }[];
}): string {
  const lines = ['BRAND VOICE'];
  if (voice.pointOfView) lines.push(`point of view: ${voice.pointOfView}`);
  if (voice.formality) lines.push(`register: ${voice.formality}`);
  if (voice.sentenceLength) {
    lines.push(
      `sentence length: about ${voice.sentenceLength.value} words, stay within ${voice.sentenceLength.low}–${voice.sentenceLength.high}`
    );
  }
  if (voice.neverSay?.length) {
    lines.push(`never say: ${voice.neverSay.join('; ')}`);
  }
  if (voice.prose) lines.push(voice.prose);
  for (const example of (voice.examples ?? []).slice(0, 5)) {
    lines.push(`example: ${example.text}`);
  }
  return lines.join('\n');
}

/**
 * One injection per boundary, plus the one at the start.
 *
 * Restating the voice costs tokens on every chunk, which is the objection, and
 * the answer is that the alternative costs the voice — the failure every
 * comparable product reports.
 */
export function planInjections(
  voiceBlock: string,
  boundaries: readonly ChunkBoundary[]
): VoiceInjection[] {
  return [
    { boundary: 'start' as const, index: 0, text: voiceBlock },
    ...boundaries.map((boundary, index) => ({
      boundary,
      index: index + 1,
      text: voiceBlock,
    })),
  ];
}

export type ScaleVerdict = {
  key: StyleScaleKey;
  value: number;
  low: number;
  high: number;
  placement: 'inside' | 'above' | 'below';
};

export type TextCheck = {
  inCorridor: number;
  total: number;
  outside: ScaleVerdict[];
  /** The line the screen prints. Words, not a colour. */
  summary: string;
  /**
   * Whether it reads like this author at all — one answer above the eight.
   *
   * A warning and nothing else. No caller may branch an activation, a save or
   * a publication on it: the owner decided on 2026-08-24 that the product does
   * not refuse a person their own text, which is a departure from the
   * research's §3 proposal that the same measure gate activation, and the
   * reason is that the research was answering a different question than a
   * product owner is.
   */
  similarity: VoiceSimilarity;
  /**
   * The sentences the divergence is actually in.
   *
   * A scale outside the corridor is a fact about the whole text and there is
   * nothing a person can do with it. These are the places, with the offsets
   * into `plainText` rather than into whatever markup the caller sent.
   */
  spots: TextSpot[];
  /**
   * The text as it was measured: markup removed, entities decoded.
   *
   * Returned because the spots' offsets are into it. The editor stores a box
   * as HTML, and a check that counted `<p>` as five characters of the author's
   * habit was measuring the editor rather than the writer.
   */
  plainText: string;
  /**
   * Чего этот вердикт стоит: две доли ошибок рабочей точки со знаменателями.
   *
   * `null`, когда границ нет — тогда и вердикта нет, и обещать нечего.
   */
  calibrationErrors: CalibrationReport | null;
  /**
   * Что человеку делать, когда мерка промолчала. `null`, когда она ответила.
   */
  silenceHint: string | null;
};

/**
 * The one answer, in words, above the eight.
 *
 * The line is read over the post form while somebody is writing, so its tone
 * is part of its meaning. It is a remark and not a rejection: «на ваш обычный
 * стиль это похоже мало» is a reading somebody can disagree with, and «текст
 * не прошёл проверку» is a verdict from an authority the product does not have
 * over a person's own writing. The owner named that distinction on 2026-08-24.
 *
 * `UNKNOWN` says so rather than falling back on the eight scales. The share of
 * scales inside the corridor was never an answer to "is this yours" — measured
 * on the owner's real channel it separated his writing from a stranger's in
 * 48% of pairs — and printing it in the verdict's place would be dressing a
 * coin flip as an answer.
 */
export function similarityLine(
  similarity: VoiceSimilarity,
  locale: 'ru' | 'en' = 'ru',
  calibration: VoiceCalibration | null = null
): string {
  const russian = locale === 'ru';
  if (similarity.verdict === 'CLOSE') {
    return russian ? 'Похоже на ваш обычный стиль' : 'This reads like your usual manner';
  }
  if (similarity.verdict === 'FAR') {
    return russian
      ? 'На ваш обычный стиль это похоже мало — вот что расходится'
      : 'This reads little like your usual manner — here is what differs';
  }
  if (similarity.reason === 'TOO_SHORT') {
    return russian
      ? 'Пока коротко, чтобы судить о похожести'
      : 'Still too short to tell the likeness';
  }
  /**
   * Две причины молчать, и человеку от них нужно разное.
   *
   * `CANNOT_TELL` — мерка есть, и текст лёг в её слепую полосу; на трёх
   * корпусах туда попадает от четверти до трети собственных постов автора,
   * так что это обычное положение дел, а не поломка. `UNCALIBRATED` — мерки
   * для этого автора ещё нет, и это чинится не другим текстом, а работой:
   * границы снимаются на том, что продукт напишет и что автор в этом
   * поправит.
   */
  if (similarity.reason === 'CANNOT_TELL') {
    return russian
      ? 'На одном посте сказать нельзя — слишком мало признаков, чтобы отличить'
      : 'One post is not enough to tell — too few markers to separate';
  }
  /**
   * Два «границ нет», и обещание у них разное.
   *
   * Когда калибровку снимали и не смогли — материала не хватило, — она
   * действительно наберётся сама, и человеку делать нечего. Когда её не
   * снимали вовсе, потому что разбор старше самой мерки, ждать бесполезно:
   * ничто в продукте не пересчитывает чужие разборы по расписанию. Одна
   * строка на оба случая обещала бы второму то, чего для него не произойдёт.
   */
  if (similarity.reason === 'UNCALIBRATED') {
    if (!calibration) {
      return russian
        ? 'Границы похожести для этого голоса не снимались: разбор сделан раньше, чем появилась мерка'
        : 'The likeness boundaries were never taken for this voice: it was analysed before the measure existed';
    }
    return russian
      ? 'Границы похожести для этого голоса ещё не сняты — они появятся по мере работы'
      : 'The likeness boundaries for this voice are not set yet — they come with use';
  }
  return russian
    ? 'Сравнить не с чем: разбор голоса сделан до того, как появилась мерка похожести'
    : 'Nothing to compare against: this voice was analysed before the likeness measure existed';
}

/**
 * Четыре молчания, и человеку от них нужно разное.
 *
 * Одна строка «не могу сказать» на все четыре случая заставляет читателя
 * гадать, что он сделал не так, и чаще всего он не сделал ничего: слепая
 * полоса — обычное положение дел, туда ложится от четверти до трети
 * собственных постов автора. Поэтому каждое молчание называет свой выход, и
 * выходы разные: дописать текст, попробовать другой, подождать работы
 * продукта, пересобрать голос.
 *
 * @returns `null`, когда вердикт есть — предлагать тогда нечего.
 */
export function silenceHint(
  similarity: VoiceSimilarity,
  locale: 'ru' | 'en' = 'ru',
  calibration: VoiceCalibration | null = null
): string | null {
  if (similarity.verdict !== 'UNKNOWN') return null;
  const russian = locale === 'ru';
  if (similarity.reason === 'TOO_SHORT') {
    return russian
      ? 'Допишите ещё несколько предложений — на коротком куске признаков автора почти нет.'
      : 'Write a few sentences more — a short piece carries almost no markers.';
  }
  if (similarity.reason === 'CANNOT_TELL') {
    return russian
      ? 'С текстом всё в порядке: он лёг между границами. Другой ваш текст мерка, скорее всего, узнает.'
      : 'Nothing is wrong with the text: it landed between the boundaries. Another piece of yours will most likely be recognised.';
  }
  if (similarity.reason === 'UNCALIBRATED') {
    /**
     * Выход у этих двух случаев разный, и обещать им одно нельзя.
     *
     * Голосу, чей разбор старше самой мерки, «снимутся сами» было бы ложью:
     * ничто не пересчитывает старые разборы по расписанию. Такой голос
     * чинится сборкой заново — обычным путём продукта, который на экране
     * есть. Само положение уходящее: разбор, сделанный сегодня, снимает
     * границы сразу, и на боевой таких голосов не осталось с 28.08.2026.
     */
    if (!calibration) {
      return russian
        ? 'Соберите аватар заново — новый разбор снимет границы сразу.'
        : 'Build the avatar again — a fresh analysis takes the boundaries at once.';
    }
    return russian
      ? 'Ждать нечего и делать ничего не нужно: границы снимутся сами, когда наберётся ваших текстов и правок.'
      : 'Nothing to do here: the boundaries are taken as your texts and edits accumulate.';
  }
  return russian
    ? 'Соберите голос заново — тогда у него появится мерка похожести.'
    : 'Rebuild the voice, and it will get a likeness measure.';
}

/** Одна доля ошибок: сколько текстов проверено, на скольких ответ был неверен. */
export type CalibrationErrorLine = {
  of: number;
  wrong: number;
  /** Та же пара чисел словами — строка, которую печатает экран. */
  text: string;
};

export type CalibrationReport = {
  /** Чужие тексты, названные авторскими. Цена ошибки — ложная похвала. */
  falseAccept: CalibrationErrorLine | null;
  /** Настоящие тексты автора, названные чужими. Цена ошибки — обвинение. */
  falseReject: CalibrationErrorLine | null;
};

/**
 * Две доли ошибок словами и числами, а не один процент похожести.
 *
 * Один процент прячет размен: порог, поднятый так, чтобы не пропускать чужих,
 * начинает отвергать настоящие тексты автора, и наоборот. Оба ресерча
 * 27.08.2026 отвечают на это одинаково, и это самая единодушная их часть —
 * показывать надо обе ошибки на настоящих счётчиках. «Точность 84%» не
 * говорит, чем заплачено.
 *
 * Знаменатели тут не украшение. «Ошибка 5%» на двадцати текстах — это одно
 * наблюдение, и человек, который видит «из 21 чужого текста приняли 1»,
 * прочитает надёжность правильно, а «5%» — нет.
 *
 * @returns `null`, когда границ нет: обещать долю ошибок, которой никто не
 *   мерил, хуже, чем молчать.
 */
export function calibrationErrorReport(
  calibration: VoiceCalibration | null | undefined,
  locale: 'ru' | 'en' = 'ru'
): CalibrationReport | null {
  if (!calibration) return null;
  const { falseAccept, falseReject } = calibration;
  if (!falseAccept && !falseReject) return null;
  const russian = locale === 'ru';

  const accept = falseAccept
    ? {
        ...falseAccept,
        /**
         * Согласование идёт по всей группе, а не по одному слову.
         *
         * «Из 21 текстов» и «из 22 вашего поста» — обе поломки получаются,
         * если склонять только существительное, поэтому в формы кладётся
         * целая группа вместе с определением.
         */
        text: russian
          ? `Из ${falseAccept.of} ${plural(falseAccept.of, [
              'текста, который вы не писали,',
              'текстов, которых вы не писали,',
              'текстов, которых вы не писали,',
            ])} проверка ошибочно приняла за ваши ${falseAccept.wrong}`
          : `Of ${falseAccept.of} texts you did not write, the check wrongly took ${falseAccept.wrong} for yours`,
      }
    : null;

  const reject = falseReject
    ? {
        ...falseReject,
        text: russian
          ? `Из ${falseReject.of} ${plural(falseReject.of, [
              'вашего настоящего поста',
              'ваших настоящих постов',
              'ваших настоящих постов',
            ])} проверка ошибочно отклонила ${falseReject.wrong}`
          : `Of ${falseReject.of} of your own posts, the check wrongly rejected ${falseReject.wrong}`,
      }
    : null;

  return { falseAccept: accept, falseReject: reject };
}

/**
 * Measuring generated text against the author's own corridors.
 *
 * The remark fires only outside the writer's own corridor, never for departing
 * from some general norm — that distinction is the whole idea borrowed from
 * the donor, and without it the check becomes a style guide nobody asked for.
 */
export function checkText(
  text: string,
  measurement: BrandVoiceMeasurementResult,
  locale: 'ru' | 'en' = 'ru'
): TextCheck {
  // Markup is not habit. The post form holds a box as HTML, and every number
  // below used to be computed over the tags as well as the words.
  const plainText = htmlToPlainText(text);
  /**
   * The pack of the language the corpus was measured in, not the Russian one.
   *
   * `content-factory-next-pl1.11` took the substitution out of the analyser and
   * left it here, in the place a person sees most often — the remark above the
   * post form. An English draft against an English profile came back with
   * `nominalisation` at 0, below a corridor built with English lists, and the
   * product told the author a habit of theirs had gone missing. The corpus
   * language and the language the product answers in are different things, and
   * `locale` below is still only the second one.
   */
  const pack = packFor(measurement.language);
  const measuringPack = pack ?? emptyLocalePack(measurement.language);
  // The same formulas, deliberately, but without the sufficiency floors. Those
  // floors answer "is this a settled habit of this writer", which a corpus can
  // say and a single output cannot; asking them here would report nothing for
  // every text shorter than a corpus, which is every text.
  const measured = measureSingleText(plainText, measuringPack);
  /**
   * A scale that divides by a word list has nothing to divide by in a language
   * with no lists, and an empty pack answers it with a zero. A zero against a
   * corridor is a finding — "this habit is gone" — so the scale is left out
   * instead, the same absence the analyser reports as `NO_DICTIONARY`.
   */
  const dictionaryBound: ReadonlySet<string> = new Set(
    DICTIONARY_BOUND_MEASUREMENTS
  );

  const verdicts: ScaleVerdict[] = [];
  for (const [key, expected] of Object.entries(measurement.scales)) {
    if (!isScaleValue(expected)) continue;
    if (!pack && dictionaryBound.has(key)) continue;
    const actual = measured[key as StyleScaleKey];
    if (actual === undefined) continue;
    const corridor = expected as StyleScaleValue;
    const placement =
      actual > corridor.high
        ? 'above'
        : actual < corridor.low
        ? 'below'
        : 'inside';
    verdicts.push({
      key: key as StyleScaleKey,
      value: actual,
      low: corridor.low,
      high: corridor.high,
      placement,
    });
  }

  const outside = verdicts.filter((one) => one.placement !== 'inside');
  const inCorridor = verdicts.length - outside.length;
  /**
   * The scale a person recognises, not the identifier the code counts by.
   *
   * This sentence is read above the post form while somebody is writing, and
   * `dashCopula 0% — ниже коридора` asks them to know a name only this file
   * uses. The same eight scales already had Russian names on the profile
   * screen; `STYLE_SCALE_LABELS` is now the one place both sides read them
   * from (`content-factory-next-vme.21.12`).
   */
  const name = (key: StyleScaleKey) => STYLE_SCALE_LABELS[locale][key].label;
  const detail =
    locale === 'ru'
      ? outside
          .map(
            (one) =>
              `«${name(one.key)}» ${one.value}% — ${
                one.placement === 'above' ? 'выше' : 'ниже'
              } коридора`
          )
          .join(' · ')
      : outside
          .map(
            (one) =>
              `"${name(one.key)}" ${one.value}% — ${one.placement} the corridor`
          )
          .join(' · ');

  const similarity = measureSimilarity(
    plainText,
    measurement.voicePrint,
    measuringPack,
    /**
     * Шеренга этого разбора, а не набор из сборки.
     *
     * Порог снят против неё, и подставить сюда другую значило бы читать голос
     * одной мерки по границам другой — обе величины лежат в нуле-единице и обе
     * выглядят как доля голосов, так что ошибка была бы бесшумной.
     */
    measurement.lineup ?? impostorsFor(measurement.language),
    /**
     * Рабочая точка едет вместе с измерением, а не берётся из константы.
     *
     * Измерение, снятое до 27.08.2026, её не несёт, и текст против него
     * получает «не могу сказать» вместо вердикта по чужой мерке. Это тот же
     * выбор, что и у отсутствующего отпечатка строкой выше: молчание, а не
     * ответ, полученный не про этого человека.
     */
    measurement.calibration ?? null
  );

  const summary = [
    similarityLine(similarity, locale, measurement.calibration ?? null),
    detail ||
      (locale === 'ru'
        ? `${inCorridor} ${plural(inCorridor, ['шкала', 'шкалы', 'шкал'])} в коридоре`
        : `${inCorridor} ${inCorridor === 1 ? 'scale' : 'scales'} inside the corridor`),
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    inCorridor,
    total: verdicts.length,
    outside,
    summary,
    similarity,
    spots: findTextSpots(plainText, outside, measuringPack, locale),
    plainText,
    /**
     * Доли ошибок читаются с той же калибровки, которой вынесен вердикт.
     *
     * Не с последней снятой и не с калибровки другого голоса: обещание «из
     * тридцати чужих принят один» относится ровно к тем границам, против
     * которых посчитан этот голос, и разъехаться этим двум величинам нельзя.
     */
    calibrationErrors: calibrationErrorReport(
      measurement.calibration ?? null,
      locale
    ),
    silenceHint: silenceHint(
      similarity,
      locale,
      measurement.calibration ?? null
    ),
  };
}

export type ActivationCheck = {
  /** Every scale of the generated text sits inside the holdout's own spread. */
  stylometricFit: boolean;
  /** Closer to this author's holdout than to unrelated authors. */
  relativeFit: boolean;
  /** Reference mode only; own-voice leaves it undefined. */
  leakageGates?: boolean;
  passed: boolean;
  reasons: string[];
};

/**
 * The activation gate: a conjunction, and honest about where it came from.
 *
 * No published constant gates a voice profile — the research says so plainly —
 * so these are reasoned composite conditions whose numeric cut-offs are meant
 * to be calibrated on this product's own held-out data. Presenting them as
 * science would be inventing a citation.
 *
 * There is no LLM judge among them. Judge reliability drops on languages other
 * than English, this product ships sixteen locales, and calibrating a judge
 * needs a
 * few hundred human-labelled Russian pairs that do not exist yet. A gate that
 * cannot be trusted is worse than one fewer gate.
 */
export function evaluateActivation({
  generatedChecks,
  holdoutSimilarity,
  otherAuthorSimilarity,
  leakageGates,
}: {
  generatedChecks: readonly TextCheck[];
  holdoutSimilarity: number;
  otherAuthorSimilarity: number;
  leakageGates?: boolean;
}): ActivationCheck {
  const reasons: string[] = [];

  const stylometricFit = generatedChecks.every(
    (check) => check.outside.length === 0
  );
  if (!stylometricFit) {
    const names = [
      ...new Set(
        generatedChecks.flatMap((check) =>
          check.outside.map((one) => one.key as string)
        )
      ),
    ];
    reasons.push(`outside the corridor: ${names.join(', ')}`);
  }

  const relativeFit = holdoutSimilarity > otherAuthorSimilarity;
  if (!relativeFit) {
    // Relative, not absolute: there is no published threshold, and inventing
    // one would be presenting a guess as a measurement.
    reasons.push('no closer to this author than to unrelated ones');
  }

  if (leakageGates === false) reasons.push('leakage gates did not pass');

  return {
    stylometricFit,
    relativeFit,
    leakageGates,
    passed:
      stylometricFit && relativeFit && (leakageGates ?? true) === true,
    reasons,
  };
}

/**
 * One profile per language.
 *
 * Function-word inventories are language-specific and cross-linguistic
 * interference is real, so a merged corpus measures neither writer. A corpus
 * carrying two languages produces two profiles or none, never an average.
 */
export function splitByLanguage(
  samples: readonly BrandVoiceSampleInput[]
): Record<string, BrandVoiceSampleInput[]> {
  const byLanguage: Record<string, BrandVoiceSampleInput[]> = {};
  for (const sample of samples) {
    (byLanguage[sample.language] ??= []).push(sample);
  }
  return byLanguage;
}
