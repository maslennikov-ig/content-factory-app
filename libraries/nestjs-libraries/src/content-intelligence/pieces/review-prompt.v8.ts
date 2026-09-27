/**
 * Замена не повторяет того, что текст уже говорит.
 *
 * `content-factory-next-kcxz.35`, финальная проверка W2 27.09.2026, F2.
 * «Убрать следы ИИ» заменило штампованное предложение предложением, которое
 * дословно стоит во втором абзаце, и пост сказал одно и то же дважды. v6 и
 * v7 велят брать замену «из текущего текста, сути или фактов» — модель взяла
 * из текста целиком. v8 добавляет к v7 одну строку во всех режимах: замена
 * не пересказывает другое место текста, а если нужная мысль там уже есть,
 * штамп убирается без замены.
 *
 * Правило держит и код: `review.v3.ts` превращает такую замену в удаление
 * (или в пометку, если отрывок — часть предложения) без оглядки на модель.
 *
 * v7 остаётся импортируемым: версия в промпте — единственное, что говорит,
 * какими указаниями получен записанный ответ.
 */
import type { ReviewPromptInput } from './review-prompt.v5';
import { modeLinesV7, reviewPromptWithNeverSay } from './review-prompt.v7';

export const REVIEW_PROMPT_VERSION_V8 = 'adaptation-review-prompt/v8' as const;

/** Что v8 добавляет к каждому режиму v7. */
export const NO_REPEAT_LINES_V8 = [
  'A replacement must never repeat what the current text already says elsewhere. Before you take wording from the current text, check that it is not already stated in another sentence: if the plain meaning of a cliché is already there, delete the cliché (empty replacement for a whole sentence) instead of copying that sentence in.',
];

const modeLinesV8 = (mode: string | undefined, web: boolean): string[] => [
  ...modeLinesV7(mode, web),
  ...NO_REPEAT_LINES_V8,
];

export function reviewPromptV8(input: ReviewPromptInput) {
  return reviewPromptWithNeverSay(input, REVIEW_PROMPT_VERSION_V8, modeLinesV8);
}
