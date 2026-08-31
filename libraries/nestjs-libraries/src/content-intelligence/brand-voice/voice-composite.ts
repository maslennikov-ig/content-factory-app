/**
 * Вторая мерка: настолько ли текст ближе к автору, чем к обычному
 * сгенерированному посту.
 *
 * ## Зачем вторая, когда есть голосование подставных
 *
 * Отгруженная мерка — голосование по символьным окнам — на трёх корпусах даёт
 * 94,1 / 80,4 / **58,0 %**. Последнее число почти монета, и дыра эта известна с
 * 27.08.2026: у `britva` корпус мал, а окна у неё с чужими пересекаются
 * сильнее. Состав измерений, посчитанный правилом ниже, на тех же выборках даёт
 * 82,3 / 82,6 / **87,6 %** — первая мерка эпика, берущая 80 % на всех трёх.
 * Она хуже голосов там, где голоса сильны, и много лучше там, где они слепы,
 * поэтому обе остаются, а вердикт берёт осторожный из двух.
 *
 * ## Почему не одноклассовое правило
 *
 * Соблазн был, и продукт однажды в него попал: посчитать, насколько текст
 * удивителен для автора, по одному лишь разбросу самого автора. Такая величина
 * максимальна В МОДЕ распределения — а генератор, которому привычки автора
 * описаны в промпте, стоит в моде РОВНЕЕ живого человека. Замер 30.08.2026:
 * ссылка есть в 15,6 % отложенных постов владельца и в 0 % генераций, и мода
 * «ссылки нет» достаётся генерации в 100 % случаев против 84,4 % у него; то же
 * на всех шести привычках и на всех трёх корпусах.
 *
 * Отсюда следствие, не зависящее от выбора измерений: **пока правило
 * одноклассовое, любой описанный модели состав будет проигран**, потому что
 * модель выполняет описание ровнее, чем автор себя воспроизводит. Числа: тот же
 * состав под одноклассовым правилом даёт 45,4 / 46,5 / 50,5 %.
 *
 * Поэтому здесь сравниваются ДВЕ стороны: автор и фон. Фон — норма §3.5,
 * то есть собственная генерация продукта без голоса. Ровно та же величина,
 * которой профиль описывает автора словами; ни одного нового источника данных
 * мерка не заводит.
 *
 * ## Почему нет ни одного подобранного веса
 *
 * Шестнадцать генераций на корпус — выборка, на которой любой вес был бы
 * подогнан под неё же и показал бы успех, которого нет. Эпик уже платил за это
 * дважды. Поэтому вклад измерения — простая разность двух устойчивых `z`, а
 * общий счёт — их среднее. Единственная константа — граница обрезки, и она
 * стоит не ради качества, а ради устойчивости: без неё одно измерение с нулевым
 * разбросом у автора уводит сумму в бесконечность и решает за все остальные.
 */

import type { LocalePack } from './locale-pack';
import { observeLayout } from './post-layout';
import { measureSingleText } from './style-scales';

/** Двигается, когда меняется арифметика ниже. */
export const VOICE_COMPOSITE_VERSION = 'voice-composite/1.0.0';

/**
 * Насколько далеко один вклад может увести сумму.
 *
 * Четыре устойчивых отклонения — это уже «дальше всего виденного» с любой
 * стороны. Без границы измерение, у которого разброс автора близок к нулю,
 * даёт вклад в сотни и делает остальные семь незначащими: замер 30.08.2026
 * без обрезки давал вклад −49995 на одном тексте.
 */
export const COMPOSITE_CLAMP = 4;

/**
 * Меньше трёх измерений с обеих сторон — счёта нет.
 *
 * Среднее по одному-двум измерениям это не мерка, а одно наблюдение с именем.
 * Молчание честнее: вердикт умеет его принять и сказать «сравнить не с чем».
 */
export const MIN_COMPOSITE_METRICS = 3;

export type CompositeStat = {
  /** Середина населения в собственной единице измерения. */
  median: number;
  /** Устойчивый разброс, уже умноженный на 1,4826. */
  scale: number;
};

export type CompositeSides = {
  /** Что этот автор делает обычно — по его собственным постам. */
  author: Readonly<Record<string, CompositeStat>>;
  /** Что делает обычный сгенерированный пост — норма. */
  background: Readonly<Record<string, CompositeStat>>;
};

export type CompositeContribution = {
  metric: string;
  value: number;
  /** Устойчивое отклонение от автора и от фона, в их собственных разбросах. */
  fromAuthor: number;
  fromBackground: number;
  /** Вклад в счёт: больше нуля — измерение говорит за автора. */
  contribution: number;
};

export type CompositeScore = {
  version: string;
  /** Среднее вкладов. Больше — ближе к автору, чем к обычной генерации. */
  score: number | null;
  /** По скольким измерениям посчитано. */
  counted: number;
  /** Почему счёта нет, когда его нет. */
  reason?: 'TOO_FEW_METRICS';
  /** Разбор по измерениям — чтобы экран мог показать, чем именно решено. */
  contributions: CompositeContribution[];
};

/**
 * Расстояние в устойчивых отклонениях, когда разброс населения может быть нулём.
 *
 * Нулевой разброс — свойство эталона, а не изъян: ни один сгенерированный без
 * голоса пост не ставит эмодзи, все сорок восемь. Делить на такой ноль нельзя,
 * а считать совпадение и несовпадение одинаковыми — тем более. Поэтому
 * совпадение с вырожденной серединой читается как ноль отклонений, а любое
 * отличие — как «дальше всего виденного», то есть граница обрезки.
 */
function deviation(value: number, stat: CompositeStat): number {
  if (stat.scale > 0) return Math.abs((value - stat.median) / stat.scale);
  return value === stat.median ? 0 : COMPOSITE_CLAMP;
}

/**
 * Счёт одного текста против одного автора.
 *
 * Измерение участвует, только если ОБЕ стороны его знают. Измерение, известное
 * автору и неизвестное норме, сравнивало бы его не с чем; молча подставить
 * вместо недостающей стороны ноль значило бы объявить, что обычный пост этого
 * не делает никогда, — утверждение о норме, которого никто не измерял.
 */
export function scoreComposite(
  measured: Readonly<Record<string, number | null | undefined>>,
  sides: CompositeSides
): CompositeScore {
  const contributions: CompositeContribution[] = [];

  for (const metric of Object.keys(sides.author)) {
    const value = measured[metric];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    const author = sides.author[metric];
    const background = sides.background[metric];
    if (!background) continue;

    const fromAuthor = deviation(value, author);
    const fromBackground = deviation(value, background);
    const raw = fromBackground - fromAuthor;
    contributions.push({
      metric,
      value,
      fromAuthor,
      fromBackground,
      contribution: Math.max(-COMPOSITE_CLAMP, Math.min(COMPOSITE_CLAMP, raw)),
    });
  }

  if (contributions.length < MIN_COMPOSITE_METRICS) {
    return {
      version: VOICE_COMPOSITE_VERSION,
      score: null,
      counted: contributions.length,
      reason: 'TOO_FEW_METRICS',
      contributions,
    };
  }

  const total = contributions.reduce((sum, one) => sum + one.contribution, 0);
  return {
    version: VOICE_COMPOSITE_VERSION,
    score: total / contributions.length,
    counted: contributions.length,
    contributions,
  };
}

/**
 * Тот же счёт, приведённый к нулю-единице.
 *
 * ## Зачем, если счёт уже число
 *
 * Рабочую точку обеим меркам снимает один и тот же `calibrate`, и это правильно:
 * два разных правила выбора порога разошлись бы молча. Но `calibrate` писался
 * для голосования, у которого счёт по построению лежит в нуле-единице, и в двух
 * местах на это опирается — там, где обещание не держит ни одна точка, он
 * возвращает `1` для верхнего порога и `0` для нижнего, то есть «выше всего
 * возможного» и «ниже всего возможного».
 *
 * Счёт второго голоса лежит примерно в −4…+4, и единица там — обычное значение,
 * через которое проходит половина текстов. Порог, молча превращающийся в
 * «пускать половину», — ровно та бесшумная ошибка, которую весь этот модуль
 * старается не совершить.
 *
 * Чинить это внутри `calibrate` было бы дороже, чем кажется: нижнее запасное
 * значение там не мёртвая константа, а решение владельца 28.08.2026 —
 * «не похоже» обязано срабатывать на нулевой границе, §4.8 спецификации.
 * Сдвинуть ноль вниз значило бы отменить его молча. Поэтому приводится счёт, а
 * не правило.
 *
 * Приведение линейное и обратимое, поэтому порядок текстов не меняется, а с ним
 * не меняется ни одна доля пар, которой измерена приёмка.
 */
export function compositeConfidence(score: number | null): number | null {
  if (score === null || !Number.isFinite(score)) return null;
  const bounded = Math.max(-COMPOSITE_CLAMP, Math.min(COMPOSITE_CLAMP, score));
  return (bounded + COMPOSITE_CLAMP) / (2 * COMPOSITE_CLAMP);
}

/**
 * Измерения, которые СУДЯТ, — и это не тот же набор, который ОПИСЫВАЕТ.
 *
 * Измерение, отданное модели инструкцией, перестаёт различать: модель его
 * выполняет, и выполняет ровнее автора. Это свойство петли, а не измерения, и
 * §5.1 спецификации меряет его на всех трёх корпусах. Поэтому у продукта два
 * набора, пересекающихся, но разных, и этот — судящий.
 *
 * Порядок и состав закреплены здесь, а не собираются из всех известных ключей:
 * набор, который тихо растёт вместе с числом измерений, менял бы вердикт при
 * каждом добавлении описательного измерения, и менял бы бесшумно.
 *
 * Числа поодиночке, три корпуса, замер 30.08.2026 — в §5.2 спецификации.
 * `capsWordShare`, `exclamPer1k` и `questionShare` сюда не входят: каждое дало
 * ровно 50,0 % на каждом из трёх корпусов, а состав без них не изменил ни
 * одного знака. `sentenceSpread` не входит по другой причине — он избыточен с
 * длиной фразы и долей коротких, и с ним состав хуже на всех трёх.
 */
export const COMPOSITE_JUDGING_METRICS = [
  'softBreakRate',
  'blockBreakRate',
  'meanBlockChars',
  'oneSentenceBlockShare',
  'emojiRate',
  'digitShare',
  'sentenceLength',
  'shortSentences',
] as const;

export type CompositeJudgingMetric = (typeof COMPOSITE_JUDGING_METRICS)[number];

/** Всё, что рисуется как картинка, а не как буква. */
const EMOJI = /\p{Extended_Pictographic}/gu;
const DIGIT = /\d/g;

const per1k = (count: number, chars: number) =>
  chars === 0 ? 0 : (1000 * count) / chars;

/**
 * Восемь судящих измерений одного текста — ЕДИНСТВЕННАЯ реализация.
 *
 * Стенд, которым получены приёмочные числа эпика, зовёт именно её. Вторая
 * реализация «сколько в тексте цифр» разошлась бы с первой на округлении или
 * на разбиении предложений — и разошлась бы бесшумно, потому что обе
 * возвращают правдоподобное число. Эпик уже платил за это: приёмка `e3y.1`
 * мерялась одним кодом, а продукт решал другим, и знак вывода менялся.
 *
 * Отсюда же и то, что четыре измерения берутся у `measureSingleText` и
 * `observeLayout`, а не пересчитываются здесь: разбиение на предложения и на
 * блоки живёт в одном месте на весь продукт.
 */
export function measureJudgingMetrics(
  text: string,
  pack: LocalePack
): Record<string, number> {
  const layout = observeLayout(text, pack);
  const scales = measureSingleText(text, pack);
  const body = text.trim();
  const chars = body.length;

  const measured: Record<string, number> = {
    softBreakRate: per1k(layout.softBreaks, layout.charCount),
    blockBreakRate: per1k(layout.blockBreaks, layout.charCount),
    meanBlockChars:
      layout.blockCount === 0 ? 0 : layout.blockCharsTotal / layout.blockCount,
    oneSentenceBlockShare:
      layout.blockCount === 0
        ? 0
        : (100 * layout.oneSentenceBlocks) / layout.blockCount,
    emojiRate: per1k((body.match(EMOJI) ?? []).length, chars),
    digitShare: chars === 0 ? 0 : (100 * (body.match(DIGIT) ?? []).length) / chars,
  };

  /**
   * Две шкалы приходят от `measureSingleText`, и их может не быть.
   *
   * Текст без единого предложения возвращает пустой разбор, и подставить сюда
   * ноль значило бы сказать «фразы нулевой длины» вместо «мерить нечего».
   * Отсутствующее измерение просто не участвует в счёте — `scoreComposite`
   * умеет считать по тем, что есть, и молчит, когда их меньше трёх.
   */
  if (typeof scales.sentenceLength === 'number') {
    measured.sentenceLength = scales.sentenceLength;
  }
  if (typeof scales.shortSentences === 'number') {
    measured.shortSentences = scales.shortSentences;
  }
  return measured;
}

/** Только судящие измерения, в объявленном порядке и без посторонних. */
export function judgingSidesOf(sides: CompositeSides): CompositeSides {
  const pick = (from: Readonly<Record<string, CompositeStat>>) => {
    const out: Record<string, CompositeStat> = {};
    for (const metric of COMPOSITE_JUDGING_METRICS) {
      if (from[metric]) out[metric] = from[metric];
    }
    return out;
  };
  return { author: pick(sides.author), background: pick(sides.background) };
}
