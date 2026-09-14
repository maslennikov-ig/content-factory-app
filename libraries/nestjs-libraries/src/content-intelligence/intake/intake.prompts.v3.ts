import { z } from 'zod';
import {
  briefFillSchema,
  briefFillPrompt,
  extractionSchema,
  extractionPrompt,
  type BriefFillPromptInput,
} from './intake.prompts';

/** Sixth walk: questions are an interview about the author's own thought. */
export const intakeQuestionsSchemaV3 = z.array(z.object({
  field: z.enum(['thesis', 'position']),
  question: z.string(),
  options: z.array(z.string()),
})).nullable().optional();

export const briefFillSchemaV3 = briefFillSchema.extend({ questions: intakeQuestionsSchemaV3 });
export const extractionSchemaV3 = extractionSchema.extend({
  topic: z.string().nullable(), angle: z.string().nullable(),
});
export type IntakeExtractionV3 = z.infer<typeof extractionSchemaV3>;
export const extractionPromptV3 = extractionPrompt;
export const briefFillPromptV3 = (input: BriefFillPromptInput): string => [
  briefFillPrompt(input),
  'Before any draft, return at most two questions, only when the answer is something only the author can know: the thesis they want to argue or their personal position.',
  'Never ask for a source, number, document or searchable context. Confirm facts yourself; do not ask the author to supply evidence or missing background.',
  'Phrase every answer option in the author\'s first person, ready to become their words in the text (for example, "I am closer to this position because..."). Never address the author as "you" inside an option.',
  'If thesis and position are already clear, questions is empty. Never ask again about Already decided fields.',
  'For somebody else\'s post, ask what this person thinks when their position is unknown; never attribute the source author\'s position to them.',
  'Separate writing instructions from content: “I would like to write about…”, “хочу написать о…”, “я бы хотел в этот раз написать об…”, “давай про…” describe intent, not a sentence for the post. Put the intended subject in goal/thesis; do not copy this service phrasing into facts or position.',
  'Missing text is JSON null, never a string such as ":null," or "none".',
].join('\n');
