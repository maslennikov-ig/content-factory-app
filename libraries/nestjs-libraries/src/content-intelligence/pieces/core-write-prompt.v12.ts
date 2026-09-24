/**
 * Core prompt with a rebuild that keeps what the previous core carried
 * (`content-factory-next-97dq.85`, fourteenth walk, B3, `cnt-35`). Older
 * prompt modules stay importable and untouched: a released receipt must still
 * name the exact contract its core was written by. Everything of v11 holds;
 * v12 adds one mode and two blocks.
 *
 * Что чинится. `cnt-35`: три вопроса отданы модели («Решите за меня»), первая
 * суть построила из этих решений второй абзац и держала слова автора
 * «Я заметил». Человек дописал материал и нажал «Пересобрать суть»; перепись
 * шла как первая запись без прежнего текста, и новый текст потерял и абзац из
 * решений, и первое лицо автора.
 *
 * Что здесь решено и держится.
 *
 * - **Пересборка видит прежнюю суть.** Блок «предыдущая суть» едет всегда,
 *   а не только после правки руками; правка человека подписана как его слова.
 * - **Дописанное — своим блоком.** Оно отделено от первых слов человека,
 *   чтобы его можно было вплести, а не приклеить в конец, и чтобы при
 *   расхождении побеждало оно.
 * - **Ничего из того, что прежняя суть несла из входа, не теряется**: мысли,
 *   абзацы из решений, примеры, числа, первое лицо самого человека.
 * - **Решения можно, факты нельзя** — как в v11: решение строит текст, но
 *   чисел, имён, случаев и цитат сверх входа не приносит, и из прежней сути
 *   такое не переносится, если это не слова человека.
 * - **Оговорки автора держатся** (`content-factory-next-97dq.53`, живой стенд
 *   23.09, S3): суть выбросила «в команде новичков или в кризисном проекте
 *   стендапы нужны», и утверждение автора стало шире, чем он сказал. Правило
 *   встало в v12 до его выпуска, поэтому своей версии у него нет; оно едет в
 *   каждом режиме, а не только в пересборке.
 */

import {
  CORE_WRITE_BLOCK_TITLES_V11,
  CORE_WRITE_ENRICH_LEAD_V11,
  CORE_WRITE_REPAIR_V11,
  coreWriteSystemV11,
  type CoreWriteSystemOptionsV11,
} from './core-write-prompt.v11';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v12' as const;

/** Подписи блоков v11 плюс дописанный материал и предыдущая суть. */
export const CORE_WRITE_BLOCK_TITLES_V12 = {
  ru: {
    ...CORE_WRITE_BLOCK_TITLES_V11.ru,
    added:
      'ДОПИСАННЫЙ МАТЕРИАЛ (человек добавил его после первой сути; это тоже его слова)',
    previous:
      'ПРЕДЫДУЩАЯ СУТЬ (текст, который сейчас на странице; сохрани всё, что он несёт из материала, ответов и решений)',
    previousByPerson:
      'ПРЕДЫДУЩАЯ СУТЬ, ПРАВКА ЧЕЛОВЕКА (текст, который человек написал руками; это его слова)',
  },
  en: {
    ...CORE_WRITE_BLOCK_TITLES_V11.en,
    added:
      'ADDED MATERIAL (the person added it after the first core; these are their words too)',
    previous:
      'THE PREVIOUS CORE (the text on the page now; keep everything it carries from the material, the answers and the decisions)',
    previousByPerson:
      'THE PREVIOUS CORE, EDITED BY THE PERSON (text the person wrote by hand; these are their words)',
  },
} as const;

/** Пересборка: новый материал вплетается, прежнее из входа не теряется. */
export const CORE_WRITE_REBUILD_V12 = {
  ru: 'Отдельное правило о пересборке: человек нажал «Пересобрать суть». Пиши суть заново из всех блоков — слова человека, дописанный материал, ответы, решения модели, бриф — и держи рядом блок «предыдущая суть»: он написан из того же входа. Всё, что предыдущая суть несла из слов человека, ответов и решений модели, остаётся в новой: каждая мысль, каждый абзац, построенный на решении, примеры, числа, имена и фразы человека от первого лица («я заметил», «мы сделали» — когда это его слова) сохраняются по смыслу; ничего из этого не выбрасывай и не сокращай. Дописанный материал вплетай туда, где он работает на тезис, а не приклеивай последним абзацем; если он уточняет или поправляет прежнее — верно дописанное. Предыдущая суть с пометкой «правка человека» — его слова: всё, что он в ней написал, сохраняется, включая его числа и примеры. Решения модели по-прежнему строят текст — угол, адресат, вывод, объяснение, — но не становятся фактами: чисел, имён, случаев и цитат, которых нет в словах человека, дописанном материале, ответах и опорах, не добавляй, и если такое стояло в предыдущей сути, не написанной человеком, не переноси его.',
  en: 'A separate rule about the rebuild: the person pressed «Rebuild the core». Write the core again from every block — the person’s words, the added material, the answers, the model’s decisions, the brief — and keep the «previous core» block beside you: it was written from the same input. Everything the previous core carried from the person’s words, the answers and the model’s decisions stays in the new one: every thought, every paragraph built on a decision, the person’s examples, numbers, names and first-person sentences («I noticed», «we did» — when those are their words) are kept by meaning; drop none of it and never shorten it. Weave the added material in where it serves the claim instead of appending it as a last paragraph; where it refines or corrects what was there, the added material is right. A previous core marked «edited by the person» is their words: everything they wrote in it stays, including their numbers and examples. The model’s decisions still build the text — the angle, the reader, the conclusion, the explanation — but never become facts: add no numbers, names, cases or quotes that are not in the person’s words, the added material, the answers or the supports, and if the previous core had such a thing and the person did not write it, do not carry it over.',
} as const;

/**
 * The author's caveats are part of their position (`97dq.53`): the core keeps
 * every limit the person put on their own claim.
 */
export const CORE_WRITE_CAVEATS_V12 = {
  ru: 'Оговорки человека — часть его позиции: если он сам ограничивает своё утверждение («не всем», «кроме…», «в команде новичков это не так», «я не считаю, что это вредно всем»), суть сохраняет это ограничение по смыслу и рядом с утверждением, которое оно ограничивает. Не делай утверждение шире, чем сказал человек, и не выбрасывай оговорку ради краткости или силы текста.',
  en: 'The person’s caveats are part of their position: where they limit their own claim («not for everyone», «except…», «with a team of newcomers it is different», «I do not think this is harmful for all»), the core keeps that limit by meaning and next to the claim it limits. Never make a claim broader than the person made it, and never drop a caveat for brevity or punch.',
} as const;

export type CoreWriteSystemOptionsV12 = CoreWriteSystemOptionsV11 & {
  /** «Пересобрать суть»: есть блок «предыдущая суть». */
  rebuild?: boolean;
};

export const coreWriteSystemV12 = (
  language: 'ru' | 'en',
  forbiddenPhrases: string,
  options: CoreWriteSystemOptionsV12 = {}
): string =>
  [
    coreWriteSystemV11(language, forbiddenPhrases, options),
    CORE_WRITE_CAVEATS_V12[language],
    options.rebuild ? CORE_WRITE_REBUILD_V12[language] : '',
  ]
    .filter(Boolean)
    .join('\n');

export const CORE_WRITE_ENRICH_LEAD_V12 = CORE_WRITE_ENRICH_LEAD_V11;
export const CORE_WRITE_REPAIR_V12 = CORE_WRITE_REPAIR_V11;
