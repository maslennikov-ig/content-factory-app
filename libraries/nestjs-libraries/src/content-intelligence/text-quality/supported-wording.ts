/**
 * Слово из отмеченной опоры — не след машины.
 *
 * `content-factory-next-97dq.33`, десятый заход 22.09.2026, адаптация cnt-28.
 * Человек отметил находку ресерча «Сотрудники стали эффективнее делегировать
 * и распределять задачи…», адаптация пересказала её пунктом «сотрудники
 * эффективнее делегировали и распределяли задачи», каталог нашёл
 * «эффективнее» (`evaluation-without-fact`), а «Убрать следы ИИ» слово
 * вырезало — и пункт перестал говорить, что изменилось. Оценка здесь не
 * пришла на место факта: она и есть факт, на который человек опирается.
 *
 * Правило сделано по образцу чисел (`numbers.ts`, `97dq.10`): опора снимает
 * находку, только когда текст повторяет опору, а не когда слово просто
 * где-то в ней встречается. Дословного совпадения мало — адаптация почти
 * всегда пересказывает («стали эффективнее делегировать» → «эффективнее
 * делегировали»), и правило, которое молчит только на цитате, промолчало бы
 * мимо живого случая. Поэтому сравниваются основы слов, а узость держится
 * тремя условиями сразу:
 *
 *  1. находка короткая — не больше `SUPPORTED_MAX_HIT_WORDS` слов. Это слово
 *     или оборот, а не конструкция: «не X, а Y» или шаблонный заход опорой не
 *     оправдываются, даже если опора написана так же;
 *  2. все слова находки подряд стоят в одной опоре (по основам);
 *  3. рядом с находкой в тексте — в том же предложении и не дальше
 *     `SUPPORTED_REACH` слов — стоят хотя бы `SUPPORTED_ANCHORS` содержательных
 *     слова, которые в той же опоре стоят так же рядом с этим местом.
 *
 * Третье условие и отличает пересказ опоры от совпадения: «Продукт стал
 * эффективнее конкурентов» при опоре про сотрудников находкой остаётся, у
 * «эффективнее» в ней нет ни одного общего соседа.
 *
 * Опоры здесь — только отмеченные факты брифа, без сути и слов человека.
 * Суть пишет модель, и с ней в опорах любой штамп, перенесённый из сути в
 * адаптацию, стал бы невидимым. Опор нет — правило молчит, каталог считает
 * как считал.
 */

/** Слово: буквы и цифры, дефис и апостроф внутри. */
const WORD = /[\p{L}\p{N}]+(?:[-‑'’][\p{L}\p{N}]+)*/gu;

/** Между словами кончилось предложение или строка. */
const SENTENCE_BREAK = /[.!?…\n;]/u;

const DIGIT = /\p{N}/u;

/** Длина основы. Пять букв держат «эффективнее» и «эффективно» вместе. */
const STEM_LENGTH = 5;

/** Находка длиннее — это конструкция, а не слово. */
export const SUPPORTED_MAX_HIT_WORDS = 3;

/** Сколько общих соседей отличает пересказ опоры от совпадения. */
export const SUPPORTED_ANCHORS = 2;

/** Как далеко от находки ищутся соседи — в словах, в тексте и в опоре. */
export const SUPPORTED_REACH = 3;

/**
 * Частые служебные слова длиной от четырёх букв. Соседом они не считаются:
 * «было» и «этот» стоят рядом с чем угодно и пересказа не доказывают.
 */
const FUNCTION_WORDS = new Set([
  'было',
  'были',
  'была',
  'будет',
  'быть',
  'этот',
  'этого',
  'этом',
  'который',
  'которые',
  'которая',
  'более',
  'менее',
  'также',
  'тоже',
  'чтобы',
  'очень',
  'того',
  'после',
  'через',
  'между',
  'when',
  'that',
  'this',
  'with',
  'from',
  'have',
  'were',
  'been',
  'more',
  'less',
  'than',
  'their',
  'they',
]);

type Token = { stem: string; content: boolean; start: number; end: number };

const normalise = (word: string): string =>
  word.toLowerCase().replace(/ё/g, 'е');

const stemOf = (word: string): string => {
  const plain = normalise(word);
  return plain.length > STEM_LENGTH ? plain.slice(0, STEM_LENGTH) : plain;
};

/** Слово, которое может быть соседом: число или от четырёх букв и не служебное. */
const isContent = (word: string): boolean => {
  if (DIGIT.test(word)) return true;
  const plain = normalise(word);
  return plain.length >= 4 && !FUNCTION_WORDS.has(plain);
};

const tokensOf = (text: string): Token[] =>
  [...text.matchAll(WORD)].map((match) => {
    const start = match.index ?? 0;
    return {
      stem: stemOf(match[0]),
      content: isContent(match[0]),
      start,
      end: start + match[0].length,
    };
  });

/** Опоры, разобранные один раз на проверку. */
export type SupportedWordingV1 = ReadonlyArray<readonly Token[]>;

export const supportedWordingOf = (
  statements: readonly string[] | null | undefined
): SupportedWordingV1 =>
  (statements ?? [])
    .filter((statement): statement is string => typeof statement === 'string')
    .map((statement) => tokensOf(statement))
    .filter((tokens) => tokens.length > 0);

/**
 * Соседи находки в том же предложении: не дальше `SUPPORTED_REACH` слов
 * в каждую сторону, только содержательные.
 */
const neighboursOf = (
  text: string,
  tokens: readonly Token[],
  first: number,
  last: number
): Token[] => {
  const found: Token[] = [];
  for (let step = 1; step <= SUPPORTED_REACH; step += 1) {
    const index = first - step;
    if (index < 0) break;
    if (SENTENCE_BREAK.test(text.slice(tokens[index].end, tokens[index + 1].start)))
      break;
    if (tokens[index].content) found.push(tokens[index]);
  }
  for (let step = 1; step <= SUPPORTED_REACH; step += 1) {
    const index = last + step;
    if (index >= tokens.length) break;
    if (SENTENCE_BREAK.test(text.slice(tokens[index - 1].end, tokens[index].start)))
      break;
    if (tokens[index].content) found.push(tokens[index]);
  }
  return found;
};

/**
 * Находка `[start, end)` в `text` пересказывает отмеченную опору.
 *
 * `text` — та строка, по которой гонялось правило; смещения в неё.
 */
export const restatesSupported = (
  text: string,
  start: number,
  end: number,
  supported: SupportedWordingV1
): boolean => {
  if (!supported.length) return false;
  const tokens = tokensOf(text);
  const hit: number[] = [];
  tokens.forEach((token, index) => {
    if (token.end > start && token.start < end) hit.push(index);
  });
  if (!hit.length || hit.length > SUPPORTED_MAX_HIT_WORDS) return false;
  const first = hit[0];
  const last = hit[hit.length - 1];
  const neighbours = neighboursOf(text, tokens, first, last);
  if (neighbours.length < SUPPORTED_ANCHORS) return false;

  for (const statement of supported) {
    for (let at = 0; at + hit.length <= statement.length; at += 1) {
      const same = hit.every(
        (index, offset) => statement[at + offset].stem === tokens[index].stem
      );
      if (!same) continue;
      const from = Math.max(0, at - SUPPORTED_REACH);
      const to = Math.min(statement.length, at + hit.length + SUPPORTED_REACH);
      const near = new Set<string>();
      for (let index = from; index < to; index += 1) {
        if (index >= at && index < at + hit.length) continue;
        if (statement[index].content) near.add(statement[index].stem);
      }
      const shared = new Set(
        neighbours
          .map((neighbour) => neighbour.stem)
          .filter((stem) => near.has(stem))
      );
      if (shared.size >= SUPPORTED_ANCHORS) return true;
    }
  }
  return false;
};
