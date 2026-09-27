/**
 * Одно правило «вырезать или переписать» и каждое найденное место — с правкой.
 *
 * `content-factory-next-kcxz.38`. Две причины:
 *
 * - P3-9 (разбор правок 27.09.2026): v8 велел «удалить штамп (пустая замена
 *   для целого предложения)», когда его мысль уже есть в тексте, а v6 рядом —
 *   «никогда не вырезать просто так… удалять след, только если предложение
 *   сохраняет весь смысл». Намерения совместимы, но модель получала два
 *   правила удаления с разными поводами. v9 заменяет обе строки v6 и строку
 *   v8 одним правилом: вырезать можно только пустой штамп, который не несёт
 *   смысла; всё остальное переписывается конкретными словами из текста, сути
 *   и фактов, а без них остаётся видимой пометкой;
 * - R4 (перепроверка стенда 27.09.2026): после узких правок `kcxz.35`
 *   проверка сняла вводный оборот и «безусловно», но оставила «синергию» из
 *   NEVER_SAY и «открывает новые горизонты» из каталога. v6 и v7 уже требуют
 *   ответить на каждую находку; v9 говорит прямо, что узкая правка рядом не
 *   считается ответом на соседнюю находку в том же предложении. Промах по
 *   NEVER_SAY код больше не пропускает молча: `review.v3.ts` добавляет на него
 *   видимую пометку.
 *
 * v8 остаётся импортируемым: версия в промпте — единственное, что говорит,
 * какими указаниями получен записанный ответ.
 */
import type { ReviewPromptInput } from './review-prompt.v5';
import { SLOP_FINDING_LINES_V6 } from './review-prompt.v6';
import { modeLinesV7, reviewPromptWithNeverSay } from './review-prompt.v7';
import { NO_REPEAT_LINES_V8 } from './review-prompt.v8';

export const REVIEW_PROMPT_VERSION_V9 = 'adaptation-review-prompt/v9' as const;

/** Одно правило удаления вместо двух строк v6 (замена и удаление). */
export const CUT_OR_REWRITE_LINES_V9 = [
  'Cut or rewrite — one rule. Cut a trace (empty replacement) ONLY when it is an empty cliché phrase that carries no meaning: an opener such as "in today\'s fast-changing world", a filler, an empty frame, a stacked intensifier — the sentence says exactly the same without it. Everything that carries meaning is REWRITTEN, never simply cut: an evaluation or a vague word often is what its sentence reports ("employees delegated tasks more effectively"), so replace it with the concrete thing it stands for, taken only from the current text, core or facts — what exactly changed, by how much, for whom. The replacement may invent nothing: no number, actor, example, cause or result that the current text, core and facts do not state. If the word carries meaning and they give no concrete replacement, keep it: replacement equal to excerpt, basket "show", and a why that says what is missing. Keep it the same way when the wording restates one of the facts, when the author quoted it, or when the term has no honest replacement. Every deletion uses basket "show".',
];

/** Строка v8 о повторах — под то же правило удаления. */
export const NO_REPEAT_LINES_V9 = [
  'A replacement must never repeat what the current text already says elsewhere. Before you take wording from the current text, check that it is not already stated in another sentence. If the plain meaning of a cliché is already there, cut the cliché only when it is an empty phrase under the rule above; otherwise rewrite it with concrete words that only this sentence carries, or keep it as a note.',
];

/** Каждое найденное место — своей правкой (или правкой, чей отрывок его покрывает). */
export const COVERAGE_LINES_V9 = [
  'Every entry of catalogFindings and every entry of neverSayFindings must be addressed by a change whose excerpt covers it. A narrow change next to it does not address it: if you cut an opener or an intensifier and the same sentence still holds a never-say word or another catalog finding, that one needs its own change too (or one change whose excerpt covers all of them). Before you answer, walk both lists and check that each start..end lies inside the excerpt of some change.',
];

const REPLACED = new Map<string, readonly string[]>([
  [SLOP_FINDING_LINES_V6[1], CUT_OR_REWRITE_LINES_V9],
  [SLOP_FINDING_LINES_V6[2], []],
  [NO_REPEAT_LINES_V8[0], NO_REPEAT_LINES_V9],
]);

/** Строка v7, после которой в «штампах» и «обоих» стоит проверка охвата. */
const isNeverSayLine = (line: string) => line.startsWith('neverSayFindings lists');

export const modeLinesV9 = (mode: string | undefined, web: boolean): string[] =>
  [...modeLinesV7(mode, web), ...NO_REPEAT_LINES_V8].flatMap((line) => [
    ...(REPLACED.get(line) ?? [line]),
    ...(isNeverSayLine(line) ? COVERAGE_LINES_V9 : []),
  ]);

export function reviewPromptV9(input: ReviewPromptInput) {
  return reviewPromptWithNeverSay(input, REVIEW_PROMPT_VERSION_V9, modeLinesV9);
}
