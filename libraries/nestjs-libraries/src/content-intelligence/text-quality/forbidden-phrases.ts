/**
 * Обороты, которые промпт запрещает, — из каталога проверки на штампы.
 *
 * Один каталог на две половины одного решения: то, что проверка ловит после,
 * промпт запрещает до. Второй список рядом разошёлся бы с первым на первой же
 * правке, и появилось бы правило, которое проверка ловит, а модель по-прежнему
 * пишет.
 *
 * Живёт здесь, а не у сути (`pieces/core-write.ts`), с 07.09.2026
 * (`content-factory-next-k879.1`): тот же список теперь идёт и в промпт
 * адаптации под канал (`agent/agent.graph.service.ts`). Две половины одного
 * решения — это уже три места, и каталог обязан быть один на всех.
 */

import { RU_FORBIDDEN_PHRASE_GROUPS } from './slop-rules.ru';
import { EN_FORBIDDEN_PHRASE_GROUPS } from './slop-rules.en';

/** Сколько оборотов из каталога штампов доходит до промпта. */
export const FORBIDDEN_PHRASES_MAX = 40;

/**
 * Берётся по кругу — по одной фразе из каждой группы, — а не подряд. Сорок
 * строк подряд съели бы одни вводные слова, и про канцелярит или рамку
 * чат-бота модель не услышала бы вовсе; по кругу каждое правило оказывается
 * названо хотя бы раз.
 */
export const forbiddenPhrasesFor = (locale: 'ru' | 'en'): string[] => {
  const groups = (
    locale === 'ru' ? RU_FORBIDDEN_PHRASE_GROUPS : EN_FORBIDDEN_PHRASE_GROUPS
  ).map((group) => [...group]);
  const taken: string[] = [];
  for (let round = 0; taken.length < FORBIDDEN_PHRASES_MAX; round += 1) {
    const before = taken.length;
    for (const group of groups) {
      if (taken.length >= FORBIDDEN_PHRASES_MAX) break;
      const phrase = group[round];
      if (phrase && !taken.includes(phrase)) taken.push(phrase);
    }
    if (taken.length === before) break;
  }
  return taken;
};

/**
 * Правило промпта одной строкой, дословно тем же оборотом, что и у сути.
 *
 * Строку собирает каталог, а не каждый вызывающий: промпт сути и промпт
 * адаптации обязаны запрещать одно и то же одними словами, иначе одна из
 * половин однажды окажется мягче другой и никто этого не заметит.
 */
export const forbiddenPhrasesRule = (locale: 'ru' | 'en'): string =>
  locale === 'ru'
    ? `не используй обороты из списка: ${forbiddenPhrasesFor('ru').join('; ')}.`
    : `do not use any turn of phrase from this list: ${forbiddenPhrasesFor(
        'en'
      ).join('; ')}.`;
