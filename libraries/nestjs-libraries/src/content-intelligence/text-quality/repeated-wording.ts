/**
 * Замена, которая повторяет то, что пост уже говорит.
 *
 * `content-factory-next-kcxz.35`, финальная проверка W2 27.09.2026, F2.
 * «Убрать следы ИИ» заменило штампованное предложение «В современном быстро
 * меняющемся мире … открывает новые горизонты» на «Письменное обновление
 * доступно всей команде, и не нужно ждать общего созвона, чтобы
 * сориентироваться.» — а эта мысль дословно стоит во втором абзаце. После
 * «Да» пост сказал одно и то же дважды.
 *
 * Здесь сравниваются слова, а не строки: регистр, знаки, «ё/е» и пробелы не
 * различаются. Замена повторяет текст, если с текстом ВНЕ заменяемого отрывка
 * у неё общий непрерывный ряд слов:
 *
 *  - не короче `REPEATED_RUN_WORDS` слов — это уже фраза, а не совпадение; или
 *  - не короче `REPEATED_SHARE` слов замены и не короче
 *    `REPEATED_MIN_SHARE_WORDS` слов — короткая замена почти целиком взята
 *    из другого места.
 *
 * Короткие замены в одно-три слова не ловятся нарочно: промпт велит брать
 * конкретное слово из текста, сути и фактов, и «быстрее» вместо
 * «эффективнее» законно встречается в посте ещё раз.
 *
 * Повтор, который был в тексте до правки, правке не вменяется: если сам
 * отрывок уже делит с остальным текстом не меньший ряд, замена ничего нового
 * не удвоила.
 */

/** Слово: буквы и цифры, дефис и апостроф внутри. */
const WORD = /[\p{L}\p{N}]+(?:[-‑'’][\p{L}\p{N}]+)*/gu;

/** Ряд такой длины — уже повтор фразы. */
export const REPEATED_RUN_WORDS = 6;
/** Доля слов замены, которая, стоя рядом в другом месте, делает её повтором. */
export const REPEATED_SHARE = 0.8;
/** Короче этого долю не считают: одно-три слова совпадают законно. */
export const REPEATED_MIN_SHARE_WORDS = 4;

/** Слова строки в сравнимой форме: нижний регистр, «ё» как «е», дефисы как есть. */
export const comparableWords = (text: string): string[] =>
  (text.toLocaleLowerCase('ru').replace(/ё/gu, 'е').match(WORD) ?? []).map(
    (word) => word.replace(/[‑’]/gu, (mark) => (mark === '‑' ? '-' : "'"))
  );

/** Длина самого длинного общего непрерывного ряда слов. */
const longestRun = (left: string[], right: string[]): number => {
  if (!left.length || !right.length) return 0;
  let previous = new Array<number>(right.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= left.length; i += 1) {
    const current = new Array<number>(right.length + 1).fill(0);
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] !== right[j - 1]) continue;
      current[j] = previous[j - 1] + 1;
      if (current[j] > best) best = current[j];
    }
    previous = current;
  }
  return best;
};

/** Ряд без перехода через вырезанный отрывок: части сравниваются порознь. */
const runAround = (words: string[], before: string[], after: string[]) =>
  Math.max(longestRun(words, before), longestRun(words, after));

const isRepeat = (run: number, size: number): boolean =>
  run >= REPEATED_RUN_WORDS ||
  (run >= REPEATED_MIN_SHARE_WORDS && run >= Math.ceil(size * REPEATED_SHARE));

/**
 * Повторяет ли `replacement`, поставленная на место `text[start, end)`, то,
 * что текст уже говорит вне этого места. Возвращает повторённый ряд длиной
 * в словах или `0`.
 */
export const repeatedElsewhere = (
  text: string,
  start: number,
  end: number,
  replacement: string
): number => {
  const words = comparableWords(replacement);
  if (words.length < REPEATED_MIN_SHARE_WORDS) return 0;
  const before = comparableWords(text.slice(0, start));
  const after = comparableWords(text.slice(end));
  const run = runAround(words, before, after);
  if (!isRepeat(run, words.length)) return 0;
  // Повтор был и до правки — не её вина.
  const excerptRun = runAround(comparableWords(text.slice(start, end)), before, after);
  return excerptRun >= run ? 0 : run;
};

/**
 * Замена почти целиком — повтор (`kcxz.38`, P2-1): общий ряд покрывает не
 * меньше `REPEATED_SHARE` её слов. Только такую замену можно снять вместе с
 * отрывком: всё, что она несла, в тексте уже есть. Замена, в которой повтор —
 * лишь часть, несёт и своё, и удалять её отрывок нельзя.
 */
export const isMostlyRepeat = (run: number, replacement: string): boolean => {
  const size = comparableWords(replacement).length;
  return size > 0 && run >= Math.ceil(size * REPEATED_SHARE);
};

/** Эмодзи с продолжением: селектор, тон кожи, склейка. */
const EMOJI = '(?:\\p{Extended_Pictographic}[\\uFE0F\\u200D\\u{1F3FB}-\\u{1F3FF}]*)+';
/** Знак конца предложения с закрывающими кавычками/скобками и эмодзи после. */
const TERMINATOR = `[.!?…][»”")\\]]*(?:\\s*${EMOJI})*`;
/** Отрывок кончается концом предложения. */
const SENTENCE_END = new RegExp(`${TERMINATOR}\\s*$`, 'u');
/** Перед отрывком: начало текста, строки или конец прошлого предложения. */
const SENTENCE_START = new RegExp(`(?:^|\\n|${TERMINATOR}[ \\t\\u00A0]+)[ \\t\\u00A0]*$`, 'u');

/**
 * Перед местом начинается предложение: начало текста, строки или конец
 * прошлого предложения и пробел (`kcxz.38`, R3 — тем же правилом
 * `review.v2.contract.ts` возвращает заглавную букву остатку предложения).
 */
export const startsSentence = (before: string): boolean => SENTENCE_START.test(before);

/** Конец предложения внутри отрывка: знак и пробел или перенос строки. */
const INNER_BREAK = new RegExp(`${TERMINATOR}(?:[ \\t\\u00A0]|\\n)|\\n`, 'u');

/**
 * Отрывок — ровно одно целое предложение (`kcxz.38`, P2-1): целые
 * предложения, и внутри нет ни конца другого предложения, ни переноса строки.
 * Сокращение с точкой («т. е.») тоже делит отрывок — это осторожно: такой
 * отрывок станет пометкой, а не удалением.
 */
export const isSingleSentence = (text: string, start: number, end: number): boolean => {
  if (!isWholeSentences(text, start, end)) return false;
  const body = text.slice(start, end).trim().replace(SENTENCE_END, '');
  return !INNER_BREAK.test(body);
};

/**
 * Отрывок — целые предложения: он начинается там, где начинается
 * предложение, и кончается концом предложения или строки. Такой отрывок
 * можно вырезать, не оставив в тексте обрубка.
 */
export const isWholeSentences = (text: string, start: number, end: number): boolean => {
  const excerpt = text.slice(start, end);
  if (!excerpt.trim()) return false;
  if (!SENTENCE_START.test(text.slice(0, start))) return false;
  return SENTENCE_END.test(excerpt) || /^[ \t\u00A0]*(?:\n|$)/u.test(text.slice(end));
};
