import { z } from 'zod';
import { briefFillSchema, briefFillPrompt, extractionSchema, extractionPrompt, type BriefFillPromptInput } from './intake.prompts';

/** Third walk: extract asks about missing material; draft runs after the answers. */
export const intakeQuestionsSchemaV2 = z.array(z.object({
  field: z.enum(['thesis', 'position', 'facts']),
  question: z.string(),
  options: z.array(z.string()),
})).nullable().optional();

export const briefFillSchemaV2 = briefFillSchema.extend({ questions: intakeQuestionsSchemaV2 });
export const extractionSchemaV2 = extractionSchema.extend({
  topic: z.string().nullable(), angle: z.string().nullable(),
});
export type IntakeExtractionV2 = z.infer<typeof extractionSchemaV2>;
export const extractionPromptV2 = extractionPrompt;
export const briefFillPromptV2 = (input: BriefFillPromptInput): string => [
  briefFillPrompt(input),
  'Before any draft, return questions (at most three) ONLY for a missing thesis, the person’s position or a missing fact that requires the person. Phrase each question specifically about this material, with two or three plausible options. Never invent evidence in the options: ask what the person can supply. If nothing essential is missing, questions is empty. Never ask again about Already decided fields.',
  'For somebody else’s post, ask what this person thinks when their position is unknown; never attribute the source author’s position to them.',
  'Separate writing instructions from content: “I would like to write about…”, “хочу написать о…”, “я бы хотел в этот раз написать об…”, “давай про…” describe intent, not a sentence for the post. Put the intended subject in goal/thesis; do not copy this service phrasing into facts or position.',
  'Missing text is JSON null, never a string such as ":null," or "none".',
].join('\n');
