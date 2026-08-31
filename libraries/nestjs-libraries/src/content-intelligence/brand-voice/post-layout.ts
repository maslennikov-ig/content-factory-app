import type { LocalePack } from './locale-pack';
import { splitParagraphs, splitSentences } from './segment';
import type { VoiceReportLocale } from './brand-voice.types';

/**
 * How a post is laid out on the page, as opposed to how its sentences read.
 *
 * Measured against three real corpora on 2026-08-30, this is the single most
 * separating group found so far: a live channel author breaks a paragraph
 * with a soft line return mid-thought, and a model asked to sound like them
 * writes even blocks, each one separated from the next by a blank line. The
 * eight style scales cannot see this — every one of them divides by a
 * sentence or a paragraph, and a soft break inside a paragraph is neither.
 *
 * `post-habits.ts` is the nearest neighbour and this file copies its shape,
 * but not its one central caveat. Three of that file's six habits return
 * `null` for a language with no word list — an admission needs a marker word,
 * a call to action needs a phrase list. None of the four measures here need
 * one on any of the sixteen product locales: a line break is a line break in
 * every script, and a blank line is a blank line. The only word-shaped thing
 * this file touches is a sentence boundary, and that is not reimplemented —
 * see the note on `splitSentences` below. So `PostLayout`'s four numbers are
 * never `null` for missing vocabulary; the only way a value is absent here is
 * the corpus being smaller than `MIN_POSTS`, exactly as for post habits.
 *
 * Windows line endings are the one normalisation this file owns outright.
 * `\r\n` is one line break, not two, and every count below runs after `\r` is
 * stripped so a Windows export and a Unix one measure the same author the
 * same way. Checked against the two corpora this was built from — the owner's
 * 153 posts and Britva's 125 — on 2026-08-30: neither carries a `\r`, so the
 * normalisation changes nothing measured so far and exists for the export
 * that will.
 */

export const POST_LAYOUT_VERSION = 'post-layout/1.0.0';

/** The four layout measures an observation or a rendered line may name. */
export const POST_LAYOUT_METRIC_KEYS = [
  'softBreakRate',
  'blockBreakRate',
  'meanBlockChars',
  'oneSentenceBlockShare',
] as const;

export type PostLayoutMetricKey = (typeof POST_LAYOUT_METRIC_KEYS)[number];

/** Under this a share is one post's accident rather than a habit. Same bar as post habits. */
export const MIN_POSTS = 5;

const round0 = (value: number) => Math.round(value);
const share = (hit: number, total: number) =>
  total === 0 ? 0 : round0((100 * hit) / total);
const perThousand = (hit: number, total: number) =>
  total === 0 ? 0 : round0((1000 * hit) / total);

/**
 * `\r\n` folded to `\n`, so a single Windows line ending is one break and a
 * blank Windows line is one blank line — not two of either.
 *
 * A lone `\r` (old Mac line endings) is left alone: nothing seen in either
 * evaluation corpus carries one, and folding a character never observed here
 * would be a guess dressed as a fix.
 */
const normalizeNewlines = (text: string): string => text.replace(/\r\n/g, '\n');

/**
 * One run of newlines, classified by how many `\n` characters it holds.
 *
 * A run of exactly one `\n` — nothing that is itself a newline sits on either
 * side of it — is a soft break: the author kept writing the same thought and
 * only wrapped the line. A run of two or more is a blank line: whatever comes
 * next is a new block. Three or four newlines in a row are still one blank
 * line for this count, the same way `splitParagraphs`'s `\n\s*\n` treats a
 * stray extra newline as part of the same separator rather than as a second
 * one — an author who leaves two blank lines instead of one has not opened a
 * second gap, they have widened the first.
 */
const NEWLINE_RUN = /\n[ \t]*\n(?:[ \t]*\n)*|\n/g;

type NewlineCounts = { soft: number; block: number };

function countNewlineRuns(text: string): NewlineCounts {
  let soft = 0;
  let block = 0;
  for (const match of text.matchAll(NEWLINE_RUN)) {
    const newlines = (match[0].match(/\n/g) ?? []).length;
    if (newlines >= 2) block += 1;
    else soft += 1;
  }
  return { soft, block };
}

/**
 * Раскладка одного текста — сырые счётчики, а не доли.
 *
 * ## Зачем это отдельно от `computePostLayout`
 *
 * Ставка (rate) на тысячу знаков — свойство корпуса: у одного поста в 40
 * знаков «переносов на тысячу знаков» такое же слово, что и у корпуса из
 * полутора тысяч, но с несопоставимо худшей статистикой. То, что у одного
 * текста есть по-настоящему, — это сколько раз он перенёс строку мягко,
 * сколько раз оставил пустую, из скольких блоков состоит и сколько блоков
 * держат ровно одно предложение. `computePostLayout` складывает эти сырые
 * числа по всему корпусу и только тогда делит.
 *
 * ## Почему предложения режет `splitSentences`, а не свой предикат
 *
 * У `post-habits.ts` в заголовке ровно этот довод: вторая реализация одного и
 * того же решения расходится с первой и расходится молча — обе выглядят
 * правдоподобно, а числа дают разные. `oneSentenceBlockShare` спрашивает
 * «сколько предложений в этом блоке», и на этот вопрос в продукте отвечает
 * ровно один код, `splitSentences` из `./segment`. Второй счётчик предложений
 * здесь означал бы, что раскладка и восемь шкал стиля считают предложение
 * по-разному — и разошлись бы они как раз там, где блок короткий и граница
 * спорная.
 */
export type PostLayoutObservation = {
  /** Знаков в тексте после обрезки краевых пробелов и переносов. */
  charCount: number;
  /** Одиночных переносов строки — без пустой строки ни слева, ни справа. */
  softBreaks: number;
  /** Пустых строк (двойных и более переносов подряд, см. `NEWLINE_RUN`). */
  blockBreaks: number;
  /** Блоков — кусков текста между пустыми строками. */
  blockCount: number;
  /** Сумма длин этих блоков в знаках (совпадает с `charCount` за вычетом самих переносов). */
  blockCharsTotal: number;
  /** Блоков, состоящих ровно из одного предложения по `splitSentences`. */
  oneSentenceBlocks: number;
};

export function observeLayout(
  text: string,
  pack: LocalePack
): PostLayoutObservation {
  const body = normalizeNewlines(text).trim();
  const { soft, block } = countNewlineRuns(body);
  // Текст без единого блока — например, только пустые строки, что после
  // `.trim()` уже стало пустой строкой, — даёт ноль блоков честно: делить
  // здесь не на что, и ошибкой это быть не должно.
  const paragraphs = splitParagraphs(body);
  let oneSentenceBlocks = 0;
  let blockCharsTotal = 0;
  for (const paragraph of paragraphs) {
    blockCharsTotal += paragraph.text.length;
    if (splitSentences(paragraph.text, pack).length === 1) {
      oneSentenceBlocks += 1;
    }
  }
  return {
    charCount: body.length,
    softBreaks: soft,
    blockBreaks: block,
    blockCount: paragraphs.length,
    blockCharsTotal,
    oneSentenceBlocks,
  };
}

export type PostLayout = {
  version: string;
  sampleCount: number;
  /** Одиночных переносов строки на тысячу знаков. */
  softBreakRate: number;
  /** Пустых строк на тысячу знаков. */
  blockBreakRate: number;
  /** Средняя длина блока в знаках. Ноль, если во всём корпусе не набралось ни одного блока. */
  meanBlockChars: number;
  /** Доля блоков ровно из одного предложения, в процентах. */
  oneSentenceBlockShare: number;
  /**
   * То же самое как сырые счётчики по всему корпусу — чтобы объяснение можно
   * было проверить, а не просто принять на веру. Тот же довод, что у
   * `PostHabits.counts`: «34%» читатель обязан поверить на слово, «в 4 из 12
   * блоков» он может пересчитать сам.
   */
  counts: {
    softBreaks: number;
    blockBreaks: number;
    blocks: number;
    oneSentenceBlocks: number;
  };
};

export function computePostLayout(
  samples: readonly { text: string }[],
  pack: LocalePack
): PostLayout | null {
  const usable = samples.filter((sample) => sample.text.trim().length > 0);
  if (usable.length < MIN_POSTS) return null;

  let charTotal = 0;
  let softTotal = 0;
  let blockBreakTotal = 0;
  let blockCountTotal = 0;
  let blockCharsTotal = 0;
  let oneSentenceTotal = 0;

  for (const sample of usable) {
    const observed = observeLayout(sample.text, pack);
    charTotal += observed.charCount;
    softTotal += observed.softBreaks;
    blockBreakTotal += observed.blockBreaks;
    blockCountTotal += observed.blockCount;
    blockCharsTotal += observed.blockCharsTotal;
    oneSentenceTotal += observed.oneSentenceBlocks;
  }

  return {
    version: POST_LAYOUT_VERSION,
    sampleCount: usable.length,
    softBreakRate: perThousand(softTotal, charTotal),
    blockBreakRate: perThousand(blockBreakTotal, charTotal),
    meanBlockChars:
      blockCountTotal === 0 ? 0 : round0(blockCharsTotal / blockCountTotal),
    oneSentenceBlockShare: share(oneSentenceTotal, blockCountTotal),
    counts: {
      softBreaks: softTotal,
      blockBreaks: blockBreakTotal,
      blocks: blockCountTotal,
      oneSentenceBlocks: oneSentenceTotal,
    },
  };
}

/**
 * Раскладка как строки для промпта.
 *
 * В отличие от `renderPostHabits`, здесь нет ветки на `null`-значение самой
 * метрики — во вступительном комментарии файла сказано почему: словарь этим
 * четырём числам не нужен ни на одном языке, так что печатать «не измеряется»
 * тут неоткуда. Единственное, что может быть пусто, — сам `layout` целиком
 * (корпус меньше `MIN_POSTS`), и тогда функция возвращает пустую строку, как
 * и её сосед.
 */
export function renderPostLayout(
  layout: PostLayout | null,
  locale: VoiceReportLocale = 'ru'
): string {
  if (!layout) return '';
  const russian = locale !== 'en';
  const lines = russian
    ? [
        `постов разобрано: ${layout.sampleCount}`,
        `softBreakRate · мягкий перенос строки внутри абзаца: ${layout.softBreakRate} на тысячу знаков (${layout.counts.softBreaks} переносов)`,
        `blockBreakRate · пустая строка между абзацами: ${layout.blockBreakRate} на тысячу знаков (${layout.counts.blockBreaks} пустых строк)`,
        `meanBlockChars · средняя длина блока: ${layout.meanBlockChars} знаков (${layout.counts.blocks} блоков)`,
        `oneSentenceBlockShare · доля блоков из одного предложения: ${layout.oneSentenceBlockShare}% (${layout.counts.oneSentenceBlocks} из ${layout.counts.blocks})`,
      ]
    : [
        `posts analysed: ${layout.sampleCount}`,
        `softBreakRate · a soft line break inside a paragraph: ${layout.softBreakRate} per thousand characters (${layout.counts.softBreaks} breaks)`,
        `blockBreakRate · a blank line between paragraphs: ${layout.blockBreakRate} per thousand characters (${layout.counts.blockBreaks} blank lines)`,
        `meanBlockChars · average block length: ${layout.meanBlockChars} characters (${layout.counts.blocks} blocks)`,
        `oneSentenceBlockShare · share of blocks made of one sentence: ${layout.oneSentenceBlockShare}% (${layout.counts.oneSentenceBlocks} of ${layout.counts.blocks})`,
      ];
  return lines.join('\n');
}
