/**
 * Проверка текста на ИИ-штампы. Без модели, детерминированно.
 *
 * `content-factory-next-tu3k.3`, решение владельца 06.09.2026: проверка идёт
 * по желанию человека (кнопка на экране, флаг в запросе) и только показывает
 * находки. Ничего не переписывает, ничего не блокирует. Это важно и как
 * продуктовое решение, и как обещание: один и тот же текст даёт один и тот же
 * отчёт всегда, платного вызова здесь нет ни одного.
 *
 * Что откуда берётся:
 *  - правила и словари — `slop-rules.ru.ts` и `slop-rules.en.ts` (источники
 *    названы в шапке русского файла, среди них MIT `smixs/humanizer-ru`);
 *  - «не проза» — `slop-skip-zones.ts`, поверх `brand-voice/ai-artefacts.ts`;
 *  - предложения, слова и абзацы — `brand-voice/segment.ts`, тот же счёт, что
 *    у измерения голоса: две проверки одного текста не должны расходиться в
 *    том, сколько в нём предложений;
 *  - текст из редактора — `brand-voice/html-text.ts`;
 *  - эмодзи — тот же `\p{Extended_Pictographic}`, что в `post-habits.ts`.
 *
 * Смещения находок всегда указывают в ту строку, которую передали. Правила
 * гоняются по её погашенной копии той же длины, а не по очищенной: очистка
 * сдвинула бы каждую позицию после первого тега.
 */
import {
  countWords,
  splitParagraphs,
  splitSentences,
  LIST_MARKER,
  type Paragraph,
  type Sentence,
} from '../brand-voice/segment';
import { htmlToPlainText, looksLikeHtml } from '../brand-voice/html-text';
import { emptyLocalePack, packFor } from '../brand-voice/locale-pack';
import type {
  SlopFindingV1,
  SlopReportV1,
  SlopVerdictV1,
} from '../brand-voice/voice-wiring.contract';
import { maskCode, maskSkipZones } from './slop-skip-zones';
import {
  maskSlopMetricStructures,
  slopPlatformKey,
  slopThresholds,
} from './slop-platforms';
import { RU_RULES } from './slop-rules.ru';
import { EN_RULES } from './slop-rules.en';
import type { SlopRule } from './slop-rules.types';

export const SLOP_CHECK_VERSION = 'slop-check/1.0.0' as const;

/** Больше пятнадцати находок — это уже не список правок, а другой текст. */
export const SLOP_MAX_FINDINGS = 15;

/** Порог плотности тире. Норма автора — 4,6 на тысячу знаков, её не трогаем. */
export const SLOP_DASH_PER_1K = 8;

/**
 * Меньше трёх тире — это не частота, а одно тире в коротком посте.
 *
 * Без этой границы правило срабатывало на посте из ста знаков с единственным
 * тире: одно деление на сто даёт десять на тысячу. Ровно тот случай, ради
 * которого правило и не должно шуметь.
 */
export const SLOP_DASH_MIN_COUNT = 3;

const EMOJI = /\p{Extended_Pictographic}/gu;
const OPENS_WITH_EMOJI = /^\p{Extended_Pictographic}/u;
const BOLD_SPAN = /<(?:b|strong)\b[^>]*>|\*\*[^*\n]+\*\*/gi;
const DASH = /[—–]/g;
const ENDS_WITH_QUESTION = /\?["»')\]]*$/;

export type SlopCheckOptions = {
  platform?: string | null;
  locale?: 'ru' | 'en';
  /** `true`, когда текст пришёл из редактора как HTML. */
  html?: boolean;
};

/**
 * Правила, общие для языков: они считают, а не читают слова.
 *
 * Живут здесь, а не в языковых списках, ровно потому, что от языка не зависят:
 * ритм, жирное, списки, вопросы и эмодзи считаются одинаково.
 */
export const METRIC_RULES: SlopRule[] = [
  {
    id: 'rhetorical-questions',
    severity: 'warn',
    kind: 'metric',
    metric: 'questions',
    hint: {
      ru: 'Вопросов больше, чем держит площадка. Один работает, парад — признак машины.',
      en: 'More questions than the platform carries. One works; a parade is a machine tell.',
    },
  },
  {
    id: 'emoji-decoration',
    severity: 'warn',
    kind: 'metric',
    metric: 'emoji',
    hint: {
      ru: 'Эмодзи стали украшением. Держите один-два вида и не начинайте ими строки.',
      en: 'Emoji have become decoration. Keep one or two kinds and do not open lines with them.',
    },
  },
  {
    id: 'bold-overuse',
    severity: 'warn',
    kind: 'metric',
    metric: 'bold',
    hint: {
      ru: 'Жирного больше нормы. Когда выделено всё, не выделено ничего.',
      en: 'Too much bold. When everything is highlighted, nothing is.',
    },
  },
  {
    id: 'list-overuse',
    severity: 'warn',
    kind: 'metric',
    metric: 'lists',
    hint: {
      ru: 'Списков или пунктов больше, чем держит площадка. Верните часть в прозу.',
      en: 'More lists or items than the platform carries. Put some back into prose.',
    },
  },
  {
    id: 'monotone-rhythm',
    severity: 'warn',
    kind: 'metric',
    metric: 'monotone',
    threshold: 4,
    hint: {
      ru: 'Ровный ритм: соседние предложения одной длины. Живой текст даёт разницу от шести слов.',
      en: 'A flat rhythm: neighbouring sentences run the same length. Live text differs by six words or more.',
    },
  },
  {
    id: 'no-short-sentences',
    severity: 'warn',
    kind: 'metric',
    metric: 'no-short',
    threshold: 8,
    hint: {
      ru: 'Ни одного короткого предложения — нет ни пауз, ни акцентов.',
      en: 'Not one short sentence — no pauses and no accents.',
    },
  },
  {
    id: 'em-dash-density',
    severity: 'warn',
    kind: 'metric',
    metric: 'dash-density',
    threshold: SLOP_DASH_PER_1K,
    hint: {
      ru: 'Тире слишком часто. Само по себе тире норма — частота выше восьми на тысячу знаков нет.',
      en: 'Dashes come too often. A dash itself is normal; more than eight per thousand characters is not.',
    },
  },
];

/** Правила языка плюс общие счётчики. */
export const rulesFor = (locale: 'ru' | 'en'): SlopRule[] => [
  ...(locale === 'en' ? EN_RULES : RU_RULES),
  ...METRIC_RULES,
];

/**
 * Список из редактора приходит тегами, и `htmlToPlainText` разносит каждый
 * пункт в отдельный абзац: список перестаёт быть списком ровно там, где его
 * надо посчитать. Поэтому пункты сначала помечаются как в обычном тексте.
 */
const listsAsMarkers = (html: string): string =>
  html
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li\s*>/gi, '')
    .replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '\n\n');

/** Текст, каким его видит читатель. Для обычного поста — он сам. */
const readableText = (text: string, html?: boolean): string =>
  html || looksLikeHtml(text) ? htmlToPlainText(listsAsMarkers(text)) : text;

const round1 = (value: number): number => Math.round(value * 10) / 10;

const locate = (
  haystack: string,
  needle: string
): { start: number; end: number } | null => {
  if (!needle) return null;
  const start = haystack.indexOf(needle);
  return start === -1 ? null : { start, end: start + needle.length };
};

const isQuestion = (sentence: Sentence): boolean =>
  ENDS_WITH_QUESTION.test(sentence.text.trim());

/**
 * Пункты списка — это помеченные строки, а не все строки абзаца.
 *
 * Строка «Что изменилось за месяц:» перед тремя пунктами живёт в том же
 * абзаце и без этого счёта делала бы из списка на три пункта список на
 * четыре — то есть придиралась бы к посту, который порогу как раз отвечает.
 */
const listItems = (paragraph: Paragraph): number =>
  paragraph.lines.filter((line) => LIST_MARKER.test(line)).length;

/**
 * Проверка одного текста.
 *
 * `platform` в отчёте — это разрешённая площадка (`telegram` или `default`), а
 * не то, что прислал клиент: экран должен видеть, по каким порогам его
 * посчитали, а не эхо своего же запроса.
 */
export function slopCheck(
  text: string,
  options: SlopCheckOptions = {}
): SlopReportV1 {
  const locale: 'ru' | 'en' = options.locale === 'en' ? 'en' : 'ru';
  const platform = slopPlatformKey(options.platform);

  const plain = readableText(text, options.html);
  const metricPlain = maskSlopMetricStructures(plain, options.platform);
  const metricRaw = maskSlopMetricStructures(text, options.platform);
  const prose = maskSkipZones(text);
  const raw = maskCode(text);

  const pack = packFor(locale) ?? emptyLocalePack(locale);
  const sentences = splitSentences(plain, pack);
  const metricSentences = splitSentences(metricPlain, pack);
  const paragraphs = splitParagraphs(plain);
  const lengths = sentences.map((sentence) => sentence.words);

  const listParagraphs = paragraphs.filter((paragraph) => paragraph.isList);
  const dashes = (plain.match(DASH) ?? []).length;
  const metricEmojiFound = metricPlain.match(EMOJI) ?? [];
  const lineOpeners = plain
    .split('\n')
    .filter((line) => OPENS_WITH_EMOJI.test(line.trim())).length;
  const metricLineOpeners = metricPlain
    .split('\n')
    .filter((line) => OPENS_WITH_EMOJI.test(line.trim())).length;
  const questionSentences = sentences.filter(isQuestion);

  const neighbourDiffs = lengths
    .slice(1)
    .map((value, index) => Math.abs(value - lengths[index]));

  const words = countWords(plain);
  const metrics: SlopReportV1['metrics'] = {
    sentences: sentences.length,
    words,
    meanNeighbourDiff: neighbourDiffs.length
      ? round1(
          neighbourDiffs.reduce((sum, value) => sum + value, 0) /
            neighbourDiffs.length
        )
      : null,
    shortSentences: lengths.filter((length) => length <= 8).length,
    questions: questionSentences.length,
    boldSpans: (metricRaw.match(BOLD_SPAN) ?? []).length,
    emojiKinds: new Set(metricEmojiFound).size,
    dashPer1k: plain.length ? round1((1000 * dashes) / plain.length) : 0,
    lists: splitParagraphs(metricPlain).filter((paragraph) => paragraph.isList)
      .length,
    listItemsMax: splitParagraphs(metricPlain)
      .filter((paragraph) => paragraph.isList)
      .reduce((most, paragraph) => Math.max(most, listItems(paragraph)), 0),
  };

  const thresholds = slopThresholds(platform, words);
  const findings: SlopFindingV1[] = [];

  const add = (
    rule: SlopRule,
    span: { start: number; end: number } | null,
    excerpt: string,
    count?: number
  ) => {
    findings.push({
      ruleId: rule.id,
      severity: rule.severity,
      start: span?.start ?? 0,
      end: span?.end ?? 0,
      excerpt,
      hint: rule.hint,
      ...(count === undefined ? {} : { count }),
    });
  };

  for (const rule of rulesFor(locale)) {
    if (rule.platforms && !rule.platforms.includes(platform)) continue;

    if (rule.kind === 'regex' && rule.pattern) {
      const haystack = rule.scope === 'raw' ? raw : prose;
      for (const match of haystack.matchAll(rule.pattern)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        // Отрывок берётся из исходной строки: `excerpt` — это ровно
        // `text.slice(start, end)`, чтобы подсветка совпала с текстом.
        add(rule, { start, end }, text.slice(start, end));
      }
      continue;
    }

    switch (rule.metric) {
      case 'count-over': {
        if (!rule.pattern) break;
        const hits = [...prose.matchAll(rule.pattern)];
        const limit = rule.threshold ?? 1;
        if (hits.length <= limit) break;
        const over = hits[limit];
        const start = over.index ?? 0;
        add(
          rule,
          { start, end: start + over[0].length },
          text.slice(start, start + over[0].length),
          hits.length
        );
        break;
      }
      case 'per-sentence': {
        if (!rule.pattern) break;
        const limit = rule.threshold ?? 3;
        for (const sentence of sentences) {
          const hits = [...sentence.text.matchAll(rule.pattern)].length;
          if (hits < limit) continue;
          add(rule, locate(text, sentence.text), sentence.text, hits);
        }
        break;
      }
      case 'questions': {
        if (metrics.questions <= thresholds.questions) break;
        const over = questionSentences[thresholds.questions];
        add(rule, locate(text, over.text), over.text, metrics.questions);
        break;
      }
      case 'emoji': {
        const tooManyKinds = metrics.emojiKinds > thresholds.emojiKinds;
        // Три строки, открытые эмодзи, — это маркеры списка, а не интонация.
        const asBullets =
          platform === 'pikabu' ? lineOpeners > 6 : metricLineOpeners >= 3;
        if (!tooManyKinds && !asBullets) break;
        const seen = new Set<string>();
        let anchor = '';
        for (const emoji of metricEmojiFound) {
          seen.add(emoji);
          if (seen.size > thresholds.emojiKinds) {
            anchor = emoji;
            break;
          }
        }
        add(
          rule,
          locate(text, anchor || metricEmojiFound[0] || ''),
          anchor || metricEmojiFound[0] || '',
          metrics.emojiKinds
        );
        break;
      }
      case 'chopped-meditation': {
        const limit = rule.threshold ?? 3;
        let run = 0;
        for (const sentence of metricSentences) {
          const line = metricPlain
            .slice(0, metricPlain.indexOf(sentence.text))
            .split('\n')
            .pop();
          const inList = /^\s*(?:[-+*]|\d+[.)])\s+/u.test(line ?? '');
          run =
            sentence.words >= 1 && sentence.words <= 3 && !inList ? run + 1 : 0;
          if (run < limit) continue;
          add(rule, locate(text, sentence.text), sentence.text, run);
          break;
        }
        break;
      }
      case 'question-answer-rhythm': {
        const limit = rule.threshold ?? 3;
        let pairs = 0;
        for (let index = 0; index < metricSentences.length - 1; index += 1) {
          const question = metricSentences[index];
          const answer = metricSentences[index + 1];
          if (!isQuestion(question) || answer.words < 2 || answer.words > 3)
            continue;
          pairs += 1;
          if (pairs < limit) continue;
          add(rule, locate(text, answer.text), answer.text, pairs);
          break;
        }
        break;
      }
      case 'bold': {
        if (metrics.boldSpans <= thresholds.boldSpans) break;
        const spans = [...text.matchAll(BOLD_SPAN)];
        const over = spans[thresholds.boldSpans];
        const start = over?.index ?? 0;
        add(
          rule,
          over ? { start, end: start + over[0].length } : null,
          over ? over[0] : '',
          metrics.boldSpans
        );
        break;
      }
      case 'lists': {
        const tooMany = metrics.lists > thresholds.lists;
        const tooLong = metrics.listItemsMax > thresholds.listItems;
        if (!tooMany && !tooLong) break;
        const offending =
          listParagraphs.find(
            (paragraph) => listItems(paragraph) > thresholds.listItems
          ) ?? listParagraphs[0];
        const first =
          offending?.lines.find((line) => LIST_MARKER.test(line)) ?? '';
        add(
          rule,
          locate(text, first),
          first,
          tooLong ? metrics.listItemsMax : metrics.lists
        );
        break;
      }
      case 'monotone': {
        if (sentences.length < 8) break;
        if (metrics.meanNeighbourDiff === null) break;
        if (metrics.meanNeighbourDiff >= (rule.threshold ?? 4)) break;
        add(rule, null, '', metrics.meanNeighbourDiff);
        break;
      }
      case 'no-short': {
        if (sentences.length < 10) break;
        if (metrics.shortSentences > 0) break;
        add(rule, null, '', metrics.sentences);
        break;
      }
      case 'dash-density': {
        if (dashes < SLOP_DASH_MIN_COUNT) break;
        if (metrics.dashPer1k <= (rule.threshold ?? SLOP_DASH_PER_1K)) break;
        add(rule, null, '', metrics.dashPer1k);
        break;
      }
      default:
        break;
    }
  }

  // Сначала ошибки, затем по месту в тексте: человек читает сверху вниз, и
  // первое, что он видит, должно быть тем, что чинят первым.
  findings.sort((left, right) => {
    if (left.severity !== right.severity)
      return left.severity === 'error' ? -1 : 1;
    if (left.start !== right.start) return left.start - right.start;
    return left.ruleId.localeCompare(right.ruleId);
  });

  const errors = findings.filter(
    (finding) => finding.severity === 'error'
  ).length;
  const warnings = findings.length - errors;
  // Счёт берётся по всем находкам, а не по показанным пятнадцати: вердикт
  // должен говорить правду о тексте, даже когда список обрезан.
  const score = errors * 3 + warnings;

  return {
    version: SLOP_CHECK_VERSION,
    platform,
    locale,
    findings: findings.slice(0, SLOP_MAX_FINDINGS),
    truncated: findings.length > SLOP_MAX_FINDINGS,
    metrics,
    score,
    verdict: verdictFor(score),
  };
}

export const verdictFor = (score: number): SlopVerdictV1 => {
  if (score <= 3) return 'clean';
  if (score <= 10) return 'review';
  return 'rewrite';
};
