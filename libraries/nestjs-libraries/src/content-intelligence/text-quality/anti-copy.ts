/**
 * Антикопия: восьми слов подряд из чужого текста в нашем не бывает.
 *
 * Решение владельца 06.09.2026 (`content-factory-next-tu3k`): из чужого поста
 * берутся тема, угол и строение, но не формулировки. Порог — восемь слов
 * подряд; семь совпавших слов встречаются в живой речи сами по себе, восемь
 * уже означают, что фраза перенесена.
 *
 * Это находка и один повторный заход, а не отказ: генератор пробует ещё раз,
 * и если совпадение осталось, человек видит его в квитанции. Модель здесь не
 * участвует — чистое сравнение слов, одинаковое от прогона к прогону.
 *
 * Смещения считаются по ИСХОДНОЙ строке. Поэтому разметка не срезается, а
 * гасится пробелами: `htmlToPlainText` из `brand-voice/html-text.ts` даёт
 * читаемый текст, но сдвигает каждую позицию после первого тега, и подсветить
 * найденное в редакторе по таким числам уже нельзя.
 */
import { looksLikeHtml } from '../brand-voice/html-text';
import type {
  AntiCopyReportV1,
  AntiCopyRunV1,
} from '../brand-voice/voice-wiring.contract';

/** Восемь слов подряд. Меньше — совпадение речи, больше — уже перенос. */
export const ANTI_COPY_MIN_WORDS = 8;

const WORD = /[\p{L}\p{N}]+/gu;
const HTML_TAG = /<[^>]*>/g;
const ENTITY = /&(?:[a-zA-Z]+|#\d+);/g;

/** Гасит найденное пробелами, сохраняя длину и переводы строк. */
const blank = (value: string): string => value.replace(/[^\n]/g, ' ');

/**
 * Текст из редактора приходит разметкой. Теги и сущности гасятся, чтобы
 * `<strong>` не стал словом «strong», а `&nbsp;` — словом «nbsp».
 */
const maskMarkup = (text: string): string =>
  looksLikeHtml(text)
    ? text.replace(HTML_TAG, blank).replace(ENTITY, blank)
    : text;

export type AntiCopyToken = {
  /** Слово в нормальном виде: строчные буквы, «ё» сведена к «е». */
  word: string;
  start: number;
  end: number;
};

/**
 * Одинаковые слова должны совпасть, даже когда их по-разному набрали.
 * Регистр, «ё» и знаки препинания различий не создают.
 */
const normaliseWord = (raw: string): string =>
  raw.toLowerCase().replace(/ё/g, 'е');

/** Слова с их местом в исходной строке. */
export function wordTokens(text: string): AntiCopyToken[] {
  const masked = maskMarkup(text);
  const tokens: AntiCopyToken[] = [];
  for (const match of masked.matchAll(WORD)) {
    const start = match.index ?? 0;
    tokens.push({
      word: normaliseWord(match[0]),
      start,
      end: start + match[0].length,
    });
  }
  return tokens;
}

export const normalisedWords = (text: string): string[] =>
  wordTokens(text).map((token) => token.word);

/**
 * Все окна по `n` слов, склеенные пробелом и без повторов.
 *
 * Так чужой текст превращается в множество, по которому потом дёшево искать:
 * генератору незачем держать сам чужой пост, ему хватает отпечатков.
 */
export function wordShingles(
  text: string,
  n: number = ANTI_COPY_MIN_WORDS
): string[] {
  const list = normalisedWords(text);
  if (n < 1 || list.length < n) return [];
  const seen = new Set<string>();
  const shingles: string[] = [];
  for (let index = 0; index + n <= list.length; index += 1) {
    const key = list.slice(index, index + n).join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    shingles.push(key);
  }
  return shingles;
}

const asSet = (
  foreign: ReadonlySet<string> | readonly string[]
): ReadonlySet<string> =>
  Array.isArray(foreign) ? new Set(foreign) : (foreign as ReadonlySet<string>);

/**
 * Отрезки нашего текста, целиком совпавшие с чужими.
 *
 * Соседние совпадения сливаются: шестнадцать перенесённых слов — это одна
 * находка на шестнадцать слов, а не девять находок по восемь. Границы
 * возвращаются в координатах исходной строки, поэтому `text` — это ровно
 * `candidate.slice(start, end)`.
 */
export function sharedRuns(
  candidate: string,
  foreignShingles: ReadonlySet<string> | readonly string[],
  n: number = ANTI_COPY_MIN_WORDS
): AntiCopyRunV1[] {
  const foreign = asSet(foreignShingles);
  if (foreign.size === 0 || n < 1) return [];

  const tokens = wordTokens(candidate);
  if (tokens.length < n) return [];

  const runs: Array<{ first: number; last: number }> = [];
  for (let index = 0; index + n <= tokens.length; index += 1) {
    const key = tokens
      .slice(index, index + n)
      .map((token) => token.word)
      .join(' ');
    if (!foreign.has(key)) continue;

    const last = index + n - 1;
    const previous = runs[runs.length - 1];
    // Окна на `index` и `index + 1` делят n−1 слов: это один отрезок.
    if (previous && index <= previous.last) {
      previous.last = Math.max(previous.last, last);
      continue;
    }
    runs.push({ first: index, last });
  }

  return runs.map(({ first, last }) => {
    const start = tokens[first].start;
    const end = tokens[last].end;
    return { text: candidate.slice(start, end), start, end };
  });
}

/**
 * Отчёт для квитанции: сколько слов считается переносом, что нашлось и был ли
 * второй заход.
 */
export function antiCopyReport(
  candidate: string,
  foreignShingles: ReadonlySet<string> | readonly string[],
  options: { retried?: boolean; minWords?: number } = {}
): AntiCopyReportV1 {
  const minWords = options.minWords ?? ANTI_COPY_MIN_WORDS;
  const runs = sharedRuns(candidate, foreignShingles, minWords);
  return {
    minWords,
    runs,
    retried: options.retried ?? false,
    clean: runs.length === 0,
  };
}
