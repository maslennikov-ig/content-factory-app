import { hasAiArtefacts } from './ai-artefacts';
import { buildLexicon, punctuationHabits } from './lexicon';
import { emptyLocalePack, packFor } from './locale-pack';
import { countWords, splitSentences } from './segment';
import { computeStyleScales } from './style-scales';
import { computePostHabits } from './post-habits';
import { computePostLayout } from './post-layout';
import {
  ANALYZER_VERSION,
  LOW_CONFIDENCE_CHARS,
  LOW_CONFIDENCE_SAMPLES,
  MAX_REQUIRED_SAMPLES,
  MIN_CORPUS_CHARS,
  MIN_CORPUS_SAMPLES,
  confidenceReasonsFor,
  requiredSamples,
} from './voice-wiring.contract';
import { buildVoicePrint } from './voiceprint';
import { RECENT_WINDOW, mostRecentSamples } from './voice-examples';
import type {
  BrandVoiceLocale,
  BrandVoiceMeasurementResult,
  BrandVoiceSampleInput,
  CorpusSplit,
} from './brand-voice.types';

/**
 * The deterministic half of building a voice profile.
 *
 * No model call, no network, no key, no quota, no Python. That is not an
 * optimisation: it is what lets a workspace with an exhausted AI budget still
 * see its own manner in numbers, and it is what makes the model's later
 * proposal checkable — the model explains what was counted here instead of
 * inventing a characterisation.
 *
 * The version pair travels with every result. `analyzerVersion` moves when a
 * formula changes, `localePackVersion` when a dictionary does; a measurement
 * without both is unreproducible, and a corridor nobody can reproduce is a
 * number the generator obeys for no stated reason.
 */

/**
 * Версия анализатора живёт в контракте, и здесь только переэкспорт.
 *
 * До 30.08.2026 та же строка была объявлена ДВАЖДЫ — здесь и в
 * `voice-wiring.contract.ts`, — и ничто не держало копии равными. Хуже того,
 * в базу писалась не эта: `voice-sample.repository.ts` берёт константу из
 * контракта. То есть правка версии в анализаторе не долетала до хранимой
 * строки вовсе, и разошлись бы они бесшумно — обе выглядят как версия
 * анализатора и обе правдоподобны.
 *
 * Комментарий в контракте всё это время описывал архитектуру, которой не
 * было: «re-exported here rather than imported from two places by two teams».
 * Теперь описание верно.
 *
 * `1.0.0` -> `1.1.0` 30.08.2026: в результат вошла `postLayout`. Измерение,
 * сохранённое под `1.0.0`, не несёт ключа `postLayout` вовсе — репозиторий
 * читает это как `null`, а не как ноль, и ни одна старая строка не
 * пересчитывается. Подъём версии — происхождение, а не переключатель
 * совместимости: ни одна ветка кода не сравнивает эту строку.
 */
export { ANALYZER_VERSION };

/** Anything shorter is not a sample; after cleaning it is usually a fragment. */
export const MIN_SAMPLE_CHARS = 200;

/**
 * The corpus floor and the rule that derives the item count from it live in
 * `voice-wiring.contract.ts`, because the screens read the same rule and a
 * second copy of it is how a button and the sentence beside it disagree.
 */
export {
  LOW_CONFIDENCE_CHARS,
  LOW_CONFIDENCE_SAMPLES,
  MAX_REQUIRED_SAMPLES,
  MIN_CORPUS_CHARS,
  MIN_CORPUS_SAMPLES,
  confidenceReasonsFor,
  requiredSamples,
};


/**
 * Deterministic 70/30 split, keyed by content hash rather than by chance.
 *
 * Re-running the analysis on the same corpus has to produce the same split, or
 * the holdout check that gates activation is unrepeatable and therefore not a
 * check at all.
 */
export function splitCorpus(
  samples: readonly BrandVoiceSampleInput[],
  holdoutShare = 0.3
): Record<string, CorpusSplit> {
  const ordered = [...samples].sort((left, right) =>
    left.contentHash.localeCompare(right.contentHash)
  );
  const holdoutCount = Math.max(
    ordered.length >= 4 ? 1 : 0,
    Math.floor(ordered.length * holdoutShare)
  );
  const split: Record<string, CorpusSplit> = {};
  ordered.forEach((sample, index) => {
    split[sample.code] = index < holdoutCount ? 'HOLDOUT' : 'TRAIN';
  });
  return split;
}

export type CorpusReadiness = {
  ready: boolean;
  charCount: number;
  sampleCount: number;
  /** How many characters are still missing. The screen states this number. */
  missingChars: number;
  missingSamples: number;
  /** How many texts this corpus needs, given how long its texts are. */
  requiredSamples: number;
  confidence: 'LOW' | 'NORMAL';
  /**
   * Why the confidence is low, so the screen can say which half is short.
   *
   * The label alone was the only hint a person got, and "низкая уверенность"
   * does not say whether to write more or to write longer.
   */
  confidenceReasons: Array<'FEW_CHARS' | 'FEW_SAMPLES'>;
};

export function corpusReadiness(
  samples: readonly BrandVoiceSampleInput[]
): CorpusReadiness {
  const usable = samples.filter(
    (sample) => sample.text.trim().length >= MIN_SAMPLE_CHARS
  );
  const charCount = usable.reduce(
    (sum, sample) => sum + sample.text.trim().length,
    0
  );
  const needed = requiredSamples(charCount, usable.length);
  const confidenceReasons = confidenceReasonsFor(charCount, usable.length);
  return {
    ready: charCount >= MIN_CORPUS_CHARS && usable.length >= needed,
    charCount,
    sampleCount: usable.length,
    missingChars: Math.max(0, MIN_CORPUS_CHARS - charCount),
    missingSamples: Math.max(0, needed - usable.length),
    requiredSamples: needed,
    confidence: confidenceReasons.length === 0 ? 'NORMAL' : 'LOW',
    confidenceReasons,
  };
}

export function analyzeBrandVoice(
  samples: readonly BrandVoiceSampleInput[],
  options: { language?: BrandVoiceLocale } = {}
): BrandVoiceMeasurementResult {
  const language =
    options.language ?? samples[0]?.language ?? ('ru' as BrandVoiceLocale);
  /**
   * The pack for this language, or an empty one.
   *
   * English used to be given the Russian pack. Every scale that divides by a
   * word list then measured English text with Russian words and returned zero,
   * which this product reads as a finding — "this author never writes
   * clerically" — rather than as an absence. An empty pack makes every such
   * measurement answer `NO_DICTIONARY` instead, and leaves everything that
   * needs no dictionary working: sentence shape, post length, emoji, and the
   * character n-grams, which need no word list in any language.
   */
  const pack = packFor(language) ?? emptyLocalePack(language);

  const rejected: BrandVoiceMeasurementResult['rejected'] = [];
  const accepted: BrandVoiceSampleInput[] = [];

  for (const sample of samples) {
    const text = sample.text.trim();
    if (sample.language !== language) {
      // One profile per language. Function-word inventories are
      // language-specific and a merged corpus measures neither writer.
      rejected.push({ code: sample.code, reason: 'LANGUAGE' });
      continue;
    }
    if (hasAiArtefacts(text)) {
      rejected.push({ code: sample.code, reason: 'AI_ARTEFACT' });
      continue;
    }
    if (text.length < MIN_SAMPLE_CHARS) {
      rejected.push({ code: sample.code, reason: 'TOO_SHORT' });
      continue;
    }
    accepted.push({ ...sample, text });
  }

  const split = splitCorpus(accepted);
  // Scales and corridors are measured on the training part only. The holdout
  // exists to check a later generation against writing the profile never saw.
  const train = accepted.filter((sample) => split[sample.code] === 'TRAIN');

  /**
   * Описание манеры считается по СВЕЖИМ постам, а не по всему корпусу.
   *
   * Решение владельца 30.08.2026, и оно расширяет прежнее. До него свежесть
   * была свойством одних цитат: числа профиля шли по всему корпусу, потому что
   * тридцать постов дают шумный коридор. Замер волны шесть показал цену такого
   * раздела на настоящем канале — Спирмен(расстояние до центроида, позиция в
   * канале) = +0,67, девять из десяти самых «центральных» постов лежат в первых
   * 30 % канала, а медиана эмодзи там 8,7 на тысячу против 4,1 в свежей
   * половине. То есть «обычный пост этого автора» означало «пост, похожий на
   * то, как он писал вначале», и человек это в описании узнал.
   *
   * Владелец: «у человека меняется стиль, поэтому всегда нужно брать более
   * новые, какой бы объём он ни скидывал». На его настоящем корпусе — 153
   * поста, окно 40, новейшие 26 % канала — окно двигает описание туда, куда он
   * и сказал: эмодзи 6 → 3 на тысячу знаков, ссылки 33 % → 53 % постов,
   * канцелярские существительные 10 % → 5,6 %.
   *
   * Раздел проходит теперь по другой линии, и она та же, что в §5.4
   * спецификации: ОПИСЫВАЮЩЕЕ идёт по свежему окну, СУДЯЩЕЕ — по всему корпусу.
   * Отпечаток отвечает на вопрос «тот же ли это человек», и там нужен весь
   * материал, какой есть; шкалы, привычки и раскладка отвечают на вопрос «как
   * он пишет сейчас», и там весь материал вредит.
   *
   * Окно то же самое, что у цитат: два числа «свежего» разошлись бы бесшумно.
   * Корпус короче окна — сам себе окно, корпус без порядка во времени остаётся
   * целым, и правило порядка одно на обоих потребителей.
   */
  const recent = mostRecentSamples(train, RECENT_WINDOW);

  const sentences = recent.flatMap((sample) =>
    splitSentences(sample.text, pack)
  );

  return {
    analyzerVersion: ANALYZER_VERSION,
    localePackVersion: pack.version,
    language,
    sampleCount: train.length,
    charCount: train.reduce((sum, sample) => sum + sample.text.length, 0),
    wordCount: train.reduce((sum, sample) => sum + countWords(sample.text), 0),
    sentenceCount: sentences.length,
    scales: computeStyleScales(recent, pack),
    lexicon: buildLexicon(recent, pack),
    punctuation: punctuationHabits(recent, pack),
    rejected,
    split,
    // On the training part only, like the corridors. A print calibrated on the
    // whole corpus could not be checked against anything: the held-out part
    // exists precisely so the measure faces writing it has never seen.
    voicePrint: buildVoicePrint(train, pack),
    // Over the whole accepted corpus rather than the training part: this is a
    // description handed to the model, not a ruler the held-out part checks,
    // and describing a writer from 70% of their posts when all of them are
    // here would be throwing away evidence for no gain.
    postHabits: computePostHabits(mostRecentSamples(accepted, RECENT_WINDOW), pack),
    // Over the whole accepted corpus, for the same reason `postHabits` is:
    // this describes the author for the model to explain, it is not a ruler
    // the holdout is checked against.
    postLayout: computePostLayout(mostRecentSamples(accepted, RECENT_WINDOW), pack),
  };
}
