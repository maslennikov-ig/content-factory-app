/**
 * «Убрать следы ИИ» заменяет, а не вырезает.
 *
 * `content-factory-next-97dq.33`, десятый заход 22.09.2026, адаптация cnt-28.
 * Каталог нашёл «эффективнее» в пункте «сотрудники эффективнее делегировали и
 * распределяли задачи», v5 требовал на каждую находку «убрать или объяснить»,
 * и модель выбрала короткое — убрала. Пункт остался без смысла: то, что
 * делегировать стали лучше, и было находкой, ради которой человек отметил эту
 * опору. Владелец: «возможно, его стоило не убрать, а заменить на что-то…
 * слишком топорно сработало».
 *
 * Что изменилось против v5 — только режим «штампов» и то, что он видит:
 *
 * - след правится ЗАМЕНОЙ на то конкретное, что он подменяет, и берётся оно
 *   только из текста, сути и отмеченных фактов. Вырезать можно лишь то, без
 *   чего фраза не теряет смысла: вводное, пустую рамку, усилитель;
 * - если конкретного в материале нет, а слово несёт смысл, находка остаётся
 *   видимой пометкой (`show`), и `why` называет, чего не хватает;
 * - суть и факты теперь уходят и в этот режим — как запас слов для замены.
 *   В v5 их не клали («нечем соблазнить»), но без них заменить нечем, и
 *   правило свелось бы к тому же «вырезать». Сверять текст с ними этот режим
 *   по-прежнему не вправе;
 * - каталог считается с утверждениями отмеченных фактов
 *   (`reviewSupportedOf`): пересказ опоры находкой не приходит вовсе
 *   (`text-quality/supported-wording.ts`).
 *
 * v5 остаётся импортируемым: версия в промпте — единственное, что говорит,
 * какими указаниями получен записанный ответ.
 */
import {
  FACTS_LINES,
  NO_MODE_LINES,
  WEB_MODE_LINES,
  reviewPromptOf,
  reviewSupportedOf,
  type ReviewPromptInput,
} from './review-prompt.v5';

export const REVIEW_PROMPT_VERSION_V6 = 'adaptation-review-prompt/v6' as const;

/** Как отвечать на находку каталога — общее для «штампов» и «обоих». */
const SLOP_FINDING_LINES = [
  'Mode "slop" — remove the traces of machine-written text. catalogFindings is a deterministic, complete list of what the catalog found in this exact text. Address EVERY entry: either return a change that fixes it, or return a change with replacement equal to excerpt, basket "show" and a why that names the reason it stays. A finding you neither change nor explain is an unfinished review.',
  'Fix a trace by REPLACING it with the concrete thing it stands for, never by simply cutting it out. An evaluation or a vague word often carries the meaning of its sentence: in "employees delegated tasks more effectively" the word "effectively" is the finding itself, and deleting it deletes what the sentence reports. Take the concrete replacement only from the current text, core or facts — what exactly changed, by how much, for whom. The replacement may invent nothing: no number, actor, example, cause or result that the current text, core and facts do not state.',
  'Delete a trace only when the sentence keeps its whole meaning without it: a filler, an empty frame, a stacked intensifier. If the word carries meaning and neither the current text, nor the core, nor the facts give a concrete replacement, keep it: replacement equal to excerpt, basket "show", and a why that says what is missing (for example, that the facts do not say what exactly improved). Keep it the same way when the wording restates one of the facts, when the author quoted it, or when the term has no honest replacement.',
  'Always carry the catalog ruleId on the change that answers a finding, so the reader sees which trace you addressed.',
];

const SLOP_LINES = [
  ...SLOP_FINDING_LINES,
  'In this mode the core and the facts are only the source of concrete wording for replacements. Do not check the text against them. Change no fact, number, date, name, quotation or the author position. A claim that looks wrong stays exactly as it is and gets no note: checking it is a different review the person did not ask for.',
];

const BOTH_LINES = [
  'Mode "both" — do the factual half and the style half in one pass, each under its own rule below. Keep them apart in the answer: a factual change explains itself by the core or the facts, a style change carries a catalog ruleId.',
  ...SLOP_FINDING_LINES,
  ...FACTS_LINES.slice(0, 1),
];

const modeLinesV6 = (mode: string | undefined, web: boolean): string[] => {
  if (web) return WEB_MODE_LINES;
  if (mode === 'slop') return SLOP_LINES;
  if (mode === 'facts') return FACTS_LINES;
  if (mode === 'both') return BOTH_LINES;
  return NO_MODE_LINES;
};

export function reviewPromptV6(input: ReviewPromptInput) {
  return reviewPromptOf(input, {
    version: REVIEW_PROMPT_VERSION_V6,
    modeLines: modeLinesV6,
    // Суть и факты — во всех режимах: в «штампах» из них берут замену.
    sendsCore: () => true,
    supported: reviewSupportedOf(input),
  });
}
