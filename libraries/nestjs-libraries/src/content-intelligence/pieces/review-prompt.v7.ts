/**
 * «Убрать следы ИИ» видит запреты аватара и называет правки одной формой.
 *
 * `content-factory-next-l7tm`, живой прогон W2 27.09.2026, D3. На «В
 * современном быстро меняющемся мире … эффективную синергию — и это,
 * безусловно, открывает новые горизонты» проверка предложила одну правку —
 * убрать «безусловно»; остальное ушло в журнал строкой `REVIEW_CHANGE_SCHEMA`.
 * Две причины, и v7 отвечает на обе:
 *
 * - каталог нашёл там четыре штампа, два из них внахлёст («по-настоящему
 *   эффективную» и «эффективную»), а v6 требовал ответить на каждую находку
 *   отдельной правкой. Модель собирала одну правку на весь оборот и писала в
 *   ней два правила списком или `null` в необязательных полях — такая правка
 *   не проходила форму. Теперь сказано прямо: одна правка может закрыть
 *   несколько находок, `ruleId` — одна строка через запятую, необязательное
 *   поле опускается, а не пишется `null`. Проверка формы в `review.v3.ts`
 *   этой волной тоже стала терпимее к таким ответам;
 * - «синергия» стоит в строке NEVER_SAY аватара, но в проверку эта строка не
 *   попадала. Теперь найденные запреты уходят списком `neverSayFindings`
 *   (`text-quality/never-say.ts`), и каждый обязан получить замену.
 *
 * v6 остаётся импортируемым: версия в промпте — единственное, что говорит,
 * какими указаниями получен записанный ответ.
 */
import { neverSayFindings } from '../text-quality/never-say';
import {
  FACTS_LINES,
  NO_MODE_LINES,
  WEB_MODE_LINES,
  reviewPromptOf,
  reviewSupportedOf,
  type ReviewPromptInput,
} from './review-prompt.v5';
import { SLOP_FINDING_LINES_V6, SLOP_ONLY_LINES_V6 } from './review-prompt.v6';

export const REVIEW_PROMPT_VERSION_V7 = 'adaptation-review-prompt/v7' as const;

/** Форма правки — общая для всех режимов: её проверяет `review.v3.ts`. */
const CHANGE_SHAPE_LINES = [
  'Change shape: id, excerpt, replacement and why are non-empty strings (replacement may be empty only for a deletion); ruleId is ONE string; basket is exactly "silent" or "show". Omit an optional field you do not use — never write null for it.',
];

/** Как отвечать на находки, которые лежат рядом или внахлёст, и на запреты аватара. */
const GROUPING_AND_NEVER_SAY_LINES = [
  'Findings that overlap or sit in one phrase are answered by ONE change whose excerpt covers all of them — a whole clause or sentence when the cliché is the sentence. Excerpts of different changes must not overlap. Put every ruleId the change answers in its ruleId, comma-separated.',
  'neverSayFindings lists words and phrases this author never says, found in this exact text. Each one must go: return a change that replaces it with plain wording from the current text, core or facts (ruleId "never-say"), never a note that keeps it.',
];

const SLOP_LINES_V7 = [
  ...SLOP_FINDING_LINES_V6,
  ...GROUPING_AND_NEVER_SAY_LINES,
  ...SLOP_ONLY_LINES_V6,
];

const BOTH_LINES_V7 = [
  'Mode "both" — do the factual half and the style half in one pass, each under its own rule below. Keep them apart in the answer: a factual change explains itself by the core or the facts, a style change carries a catalog ruleId.',
  ...SLOP_FINDING_LINES_V6,
  ...GROUPING_AND_NEVER_SAY_LINES,
  ...FACTS_LINES.slice(0, 1),
];

export const modeLinesV7 = (mode: string | undefined, web: boolean): string[] => {
  if (web) return [...WEB_MODE_LINES, ...CHANGE_SHAPE_LINES];
  if (mode === 'slop') return [...SLOP_LINES_V7, ...CHANGE_SHAPE_LINES];
  if (mode === 'facts') return [...FACTS_LINES, ...CHANGE_SHAPE_LINES];
  if (mode === 'both') return [...BOTH_LINES_V7, ...CHANGE_SHAPE_LINES];
  return [...NO_MODE_LINES, ...CHANGE_SHAPE_LINES];
};

/** Режимы, где правят стиль и потому видят запреты аватара. */
const readsNeverSay = (mode: string | undefined) =>
  mode === 'slop' || mode === 'both';

/** Промпт с найденными запретами аватара; v8 собирает свой так же. */
export function reviewPromptWithNeverSay(
  input: ReviewPromptInput,
  version: string,
  modeLines: (mode: string | undefined, web: boolean) => string[]
) {
  const prompt = reviewPromptOf(input, {
    version,
    modeLines,
    sendsCore: () => true,
    supported: reviewSupportedOf(input),
  });
  if (!readsNeverSay(input.mode)) return prompt;
  const found = neverSayFindings(input.text, input.neverSay).map(
    ({ phrase, excerpt, start, end }) => ({ phrase, excerpt, start, end })
  );
  if (!found.length) return prompt;
  return {
    ...prompt,
    user: JSON.stringify({
      ...(JSON.parse(prompt.user) as Record<string, unknown>),
      neverSayFindings: found,
    }),
  };
}

export function reviewPromptV7(input: ReviewPromptInput) {
  return reviewPromptWithNeverSay(input, REVIEW_PROMPT_VERSION_V7, modeLinesV7);
}
