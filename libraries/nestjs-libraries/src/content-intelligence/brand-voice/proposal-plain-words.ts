/**
 * A proposal's statistics said the way a person says them (W3 recheck
 * 28.09.2026, R-7).
 *
 * The analysis model explains each line by the numbers it was given and
 * writes them into what the person reads: «показатель первого лица по
 * корпусу — 96,4%», «разброс длины — 54,6», «конструкции с тире-копулой;
 * значение по корпусу — 59». The identifiers are gone (`metric-words.ts`,
 * P3-I); the statistician's voice was not. This is display-side, over the
 * stored text, with no model call and no rerun:
 *
 * 1. the common measures become plain words — the first person «почти
 *    всегда / чаще всего / иногда / редко», the share of short sentences
 *    «больше половины / около половины / …», the mean sentence length «в
 *    среднем по N слов»;
 * 2. any other clause that carries a corpus figure (a number beside «по
 *    корпусу», «показатель», «значение», «коридор», «разброс», «доля», «%»)
 *    is left out, and a sentence left with nothing goes;
 * 3. «тире-копула», «тире-связка» are «тире вместо связки».
 *
 * A text that would be left empty is returned as it was. Russian only: the
 * English analysis has not written such lines, and guessing its phrasing
 * would be a second vocabulary to keep.
 */

import { sentencesOf } from '../text-quality/audience-remark';

const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const DASH = '\\s*(?:—|–|-|составля(?:ет|ют)|равн[аоы]?)\\s*';
const WHERE = '(?:\\s+(?:по\\s+корпусу|в\\s+корпусе))?';

const valueOf = (raw: string) => Number(raw.replace(',', '.'));

const frequency = (share: number) =>
  share >= 90 ? 'почти всегда' : share >= 60 ? 'чаще всего' : share >= 30 ? 'иногда' : 'редко';

const portion = (share: number) =>
  share >= 90
    ? 'почти все'
    : share >= 60
      ? 'большинство'
      : share > 50
        ? 'больше половины'
        : share >= 40
          ? 'около половины'
          : share >= 20
            ? 'заметная часть'
            : 'немногие';

/** «по 1 слову», «по 3 слова», «по 8 слов». */
const wordsOf = (count: number) => {
  const n = Math.max(1, Math.round(count));
  const last = n % 10;
  const tens = n % 100;
  const word =
    last === 1 && tens !== 11
      ? 'слову'
      : last >= 2 && last <= 4 && (tens < 12 || tens > 14)
        ? 'слова'
        : 'слов';
  return `${n} ${word}`;
};

/**
 * What a plain rewrite says is marked while the rest is read, so its own
 * number («по 8 слов») is not taken for a corpus figure; the marks go after.
 */
const OPEN = '\uE000';
const CLOSE = '\uE001';
const marked = (words: string) => `${OPEN}${words}${CLOSE}`;
const MARKED = /\uE000[^\uE001]*\uE001/gu;

/** The measures a person has words for, rewritten in place. */
const PLAIN: ReadonlyArray<[RegExp, (...groups: string[]) => string]> = [
  [
    new RegExp(`показател\\p{L}*\\s+первого\\s+лица${WHERE}${DASH}${NUMBER}\\s*%?`, 'giu'),
    (_all, value) => marked(`от первого лица — ${frequency(valueOf(value))}`),
  ],
  [
    new RegExp(`коротки\\p{L}*\\s+предложени\\p{L}*\\s+составляют\\s+${NUMBER}\\s*%`, 'giu'),
    (_all, value) => marked(`коротких предложений — ${portion(valueOf(value))}`),
  ],
  [
    new RegExp(`средн\\p{L}*\\s+длин\\p{L}*\\s+предложени\\p{L}*${WHERE}${DASH}${NUMBER}(?:\\s+слов\\p{L}*)?`, 'giu'),
    (_all, value) => marked(`в предложении в среднем по ${wordsOf(valueOf(value))}`),
  ],
  [/тире-(?:копул|связк)\p{L}*/giu, () => 'тире вместо связки'],
];

/** A clause that still reports a corpus figure. */
const FIGURE = /\d/u;
const STATISTIC =
  /(?:корпус|показател|значени|коридор|разброс|доля|доли|шкал|метрик|%|^\s*\d)/iu;

const isStatistic = (clause: string) => {
  const own = clause.replace(MARKED, '');
  return FIGURE.test(own) && STATISTIC.test(own);
};

/**
 * Clauses of one sentence, with their separators: «;», «:» and «, а», never
 * inside «…» («говорит «мы», а не «компания»» is one name).
 */
const clausesOf = (sentence: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < sentence.length; index += 1) {
    const char = sentence[index];
    if (char === '«') depth += 1;
    else if (char === '»') depth = Math.max(0, depth - 1);
    if (depth) continue;
    const separator = /^(?:;\s*|:\s+|,\s+а\s+)/u.exec(sentence.slice(index))?.[0];
    if (!separator) continue;
    parts.push(sentence.slice(start, index), separator);
    start = index + separator.length;
    index = start - 1;
  }
  parts.push(sentence.slice(start));
  return parts;
};

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A sentence that is a figure and nothing else, said without the figure:
 * «Показатель разброса длины предложений в корпусе — 54,6.» → «Показатель
 * разброса длины предложений.» Still a figure after that — it goes.
 */
const softened = (sentence: string): string => {
  const text = sentence
    .replace(/\s+(?:по|в)\s+корпус\p{L}*/giu, '')
    .replace(/\s*(?:[—–-]|равн\p{L}*|составля\p{L}*)\s*\d+(?:[.,]\d+)?\s*%?(?:\s*[—–-]\s*\d+(?:[.,]\d+)?\s*%?)?/gu, '')
    .replace(/\s+([.!?…])/gu, '$1');
  return isStatistic(text) || !/\p{L}/u.test(text) ? '' : text;
};

const withoutFigures = (sentence: string): string => {
  const parts = clausesOf(sentence);
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const clause = parts[index];
    if (isStatistic(clause)) continue;
    if (kept.length) kept.push(parts[index - 1]);
    kept.push(clause);
  }
  const text = kept.join('').trim();
  if (!text) return softened(sentence);
  // The stop and the space the sentence ended with, if its last clause went.
  const tail = /[.!?…]+[»"”)]*\s*$/u.exec(sentence)?.[0] ?? '';
  const ended = /[.!?…][»"”)]*$/u.test(text);
  const whole = ended ? `${text}${tail.replace(/^[.!?…]+[»"”)]*/u, '')}` : `${text}${tail}`;
  return isStatistic(parts[0]) ? capitalised(whole) : whole;
};

/**
 * The text with its corpus statistics said in words or left out; a text left
 * with nothing to say is returned as it was.
 */
export const statisticsInWords = (text: string): string => {
  if (!/\p{Script=Cyrillic}/u.test(text)) return text;
  let plain = text;
  for (const [pattern, words] of PLAIN) {
    pattern.lastIndex = 0;
    plain = plain.replace(pattern, words as (...args: string[]) => string);
  }
  const result = plain
    .split('\n')
    .map((line) =>
      sentencesOf(line)
        .map((sentence) => (isStatistic(sentence) ? withoutFigures(sentence) : sentence))
        .join('')
        .replace(/[^\S\n]+$/u, '')
    )
    .join('\n')
    .trim();
  const unmarked = (value: string) => value.replace(/[\uE000\uE001]/gu, '');
  const clean = unmarked(result);
  // Nothing but figures: the plain rewrites only, never an empty line.
  if (!clean) return unmarked(plain);
  return /^\p{Lu}/u.test(text) ? capitalised(clean) : clean;
};
