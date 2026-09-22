import { z } from 'zod';
import {
  briefFillPromptV7,
  briefFillSchemaV7,
  type BriefFillPromptInputV7,
} from './intake.prompts.v7';

/**
 * Brief fill with one default question for the person's own material
 * (`content-factory-next-97dq.31`, tenth walk of 22.09.2026).
 *
 * The owner: «интервью это классная штука, поэтому я бы чаще задавал бы
 * вопросы, чем нет, даже если это мой собственный пост». Until this version an
 * own thought or a task was asked something only when the brief had a gap (at
 * most two questions about `thesis`/`position`); a clear thought went straight
 * to the core with no question at all.
 *
 * The successor asks the model for ONE more thing, `defaultQuestion`: what the
 * person wants to stress (`thesis`) or who the post is for (`audience`),
 * derived from their material, with two or three options in their first
 * person. The service asks it only when the gap questions are empty, only for
 * `thought` and `instruction`, and never when the person skipped the interview —
 * a question is one click to skip («Решите за меня»), never a questionnaire.
 *
 * Somebody else's post is untouched: `briefFillPromptV8` hands it to
 * `briefFillPromptV7` as is, and the service keeps `briefFillSchemaV7` for it,
 * so its stance question stays exactly what it was.
 *
 * `intake.prompts.v7.ts` stays importable and untouched.
 */

export const BRIEF_FILL_PROMPT_VERSION_V8 = 'intake-brief-fill/v8' as const;

export const DEFAULT_QUESTION_FIELDS = ['thesis', 'audience'] as const;

export const defaultQuestionSchemaV8 = z
  .object({
    field: z.enum(DEFAULT_QUESTION_FIELDS),
    question: z.string(),
    options: z.array(z.string()),
  })
  .nullable()
  .optional();

export const briefFillSchemaV8 = briefFillSchemaV7.extend({
  defaultQuestion: defaultQuestionSchemaV8,
});

export type BriefFillPromptInputV8 = BriefFillPromptInputV7;

/** Material kinds that get the default question: the person's own words. */
export const asksDefaultQuestion = (
  materialKind: BriefFillPromptInputV8['materialKind']
): boolean => materialKind === 'thought' || materialKind === 'instruction';

export const briefFillPromptV8 = (input: BriefFillPromptInputV8): string => {
  const base = briefFillPromptV7(input);
  if (!asksDefaultQuestion(input.materialKind)) return base;
  return [
    `PROMPT VERSION: ${BRIEF_FILL_PROMPT_VERSION_V8}`,
    base,
    'Also return `defaultQuestion`: ONE question we ask the person before the core is written, even when nothing in the brief is missing.',
    '- It asks what they want to stress in this post (field `thesis`) or who the post is for (field `audience`) — pick the one their material leaves more open.',
    '- Derive it from their material: name their subject in the question. Never ask a generic «What do you want to say?».',
    '- Offer two or three options under `options`, each one short sentence in the person’s first person, ready to become their words. The options differ in substance, never reword one another, and none is a recommendation.',
    '- Never ask for a source, a number, a document or a fact.',
    '- When both `thesis` and `audience` are listed under «Already decided by the person», return null.',
  ].join('\n');
};
