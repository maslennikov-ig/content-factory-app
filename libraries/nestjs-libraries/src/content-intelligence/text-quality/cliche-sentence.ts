/**
 * Предложение, собранное из штампов (`content-factory-next-kcxz.38`, P2-a).
 *
 * Живая проверка перед выпуском 27.09.2026 (`release-check-2026-09-27`):
 * первое «Убрать следы ИИ» вернуло на засеянную фразу «В современном быстро
 * меняющемся мире, такие короткие записи создают эффективную синергию — и
 * это, безусловно, открывает новые горизонты.» пометку «нет безопасной
 * замены», хотя сама причина («факты уже приведены выше») просила удаления.
 * Повторный запуск удалил её — разброс модели, за который человек заплатил
 * две операции.
 *
 * Здесь без модели решается, что предложение почти всё — штампы: находки
 * каталога (`slop-check.ts`) и запреты аватара (`never-say.ts`), стоящие
 * внутри предложения, покрывают большую часть его слов. Такое предложение
 * можно предложить убрать целиком — своего в нём нет. Предложение с числом,
 * именем или ссылкой не трогается: это может быть настоящее содержание.
 */

/** Слово: буквы и цифры, дефис и апостроф внутри (как в `repeated-wording.ts`). */
const WORD = /[\p{L}\p{N}]+(?:[-‑'’][\p{L}\p{N}]+)*/gu;

/** Доля слов предложения под находками, с которой оно «почти всё штамп». */
export const CLICHE_SENTENCE_SHARE = 0.5;
/** Меньше находок — одно клише в живой фразе, а не фраза из клише. */
export const CLICHE_SENTENCE_MIN_HITS = 2;
/** При стольких находках хватает и меньшей доли. */
export const CLICHE_SENTENCE_MANY_HITS = 3;
export const CLICHE_SENTENCE_MANY_SHARE = 0.35;

export type SentenceHit = { start: number; end: number };

/**
 * Сколько находок стоит внутри `[start, end)` и какую долю слов этого
 * отрывка они покрывают. Слово считается покрытым, если хоть одна находка
 * его задевает.
 */
export const clicheCoverage = (
  text: string,
  start: number,
  end: number,
  hits: readonly SentenceHit[]
): { hits: number; words: number; covered: number; share: number } => {
  const inside = hits.filter((hit) => hit.start >= start && hit.end <= end && hit.end > hit.start);
  const sentence = text.slice(start, end);
  let words = 0;
  let covered = 0;
  for (const match of sentence.matchAll(WORD)) {
    words += 1;
    const from = start + (match.index ?? 0);
    const to = from + match[0].length;
    if (inside.some((hit) => hit.start < to && from < hit.end)) covered += 1;
  }
  return { hits: inside.length, words, covered, share: words ? covered / words : 0 };
};

/** Правило «почти всё штамп» — одно на код и тесты. */
export const isMostlyCliche = (coverage: { hits: number; share: number }): boolean =>
  (coverage.hits >= CLICHE_SENTENCE_MIN_HITS && coverage.share >= CLICHE_SENTENCE_SHARE) ||
  (coverage.hits >= CLICHE_SENTENCE_MANY_HITS && coverage.share >= CLICHE_SENTENCE_MANY_SHARE);

const URL = /(?:https?:\/\/|www\.)\S+|\b[\p{L}\p{N}-]+\.(?:[a-z]{2,}|рф)(?:\/\S*)?(?=$|[\s,;:!?»)\]]|\.(?:\s|$))/iu;
const HANDLE = /(?:^|\s)[@#][\p{L}\p{N}_]/u;
const LATIN = /[A-Za-z]/u;
const isCapital = (word: string) => {
  const first = word[0];
  return first !== first.toLowerCase() && first === first.toUpperCase();
};

/**
 * Может ли в предложении быть настоящее содержание: число, ссылка, упоминание
 * или имя. Имя — слово с заглавной не в начале предложения; в русском тексте
 * ещё и слово латиницей (названия сервисов и брендов). Осторожно нарочно:
 * лишний отказ оставит пометку, лишнее удаление сотрёт факт.
 */
export const carriesRealContent = (sentence: string, language: 'ru' | 'en'): boolean => {
  if (/\p{N}/u.test(sentence)) return true;
  if (URL.test(sentence) || HANDLE.test(sentence)) return true;
  const words = [...sentence.matchAll(WORD)].map((match) => match[0]);
  return words.some((word, index) => {
    if (language === 'ru' && LATIN.test(word)) return true;
    if (index === 0) return false;
    if (language === 'en' && word === 'I') return false;
    return isCapital(word);
  });
};
