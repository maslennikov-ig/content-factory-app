import { z } from 'zod';
import type { ContentLanguage } from '@contentfactory/nestjs-libraries/dtos/content.language';
import { contentLanguageNames } from '@contentfactory/nestjs-libraries/dtos/content.language';
import {
  briefFillPromptV3,
  briefFillSchemaV3,
  extractionSchemaV3,
} from './intake.prompts.v3';
import {
  untrustedBlock,
  type BriefFillPromptInput,
} from './intake.prompts';

/** Eighth-walk extract contract: the model, not prose heuristics, owns material kind. */
export const extractionSchemaV4 = extractionSchemaV3.extend({
  materialKind: z.enum(['thought', 'foreign_post']),
});

export type IntakeExtractionV4 = z.infer<typeof extractionSchemaV4>;

export const extractionPromptV4 = (
  text: string,
  language: ContentLanguage
): string =>
  [
    'PROMPT VERSION: intake-extract/v4',
    'First decide what kind of material the person pasted.',
    'Return materialKind "foreign_post" when the text reads as a finished publication about an event or opinion written by somebody else. First-person wording inside such a publication belongs to its source author, not to the person who pasted it.',
    'Return materialKind "thought" when the text is the person\'s own note, instruction, question or rough idea for a future publication.',
    'For a foreign_post, extract its topic, angle, structure and factual claims in your own words. For a thought, return a short topic and angle when present, with empty structure and claims.',
    'Never copy more than four consecutive words from the pasted text. Never add or repair a claim.',
    'A claim carries a number when it states a figure, share, sum or count. Give such a claim a short searchQuery; otherwise use null.',
    'At most 8 structure steps and 12 claims.',
    `Write every field in ${contentLanguageNames[language]}.`,
    '',
    untrustedBlock(text),
  ].join('\n');

export const briefFillSchemaV4 = briefFillSchemaV3;

export const briefFillPromptV4 = (input: BriefFillPromptInput): string => [
  'PROMPT VERSION: intake-brief-fill/v4',
  briefFillPromptV3(input),
  input.materialKind === 'borrowed'
    ? 'The pasted publication does not reveal the person\'s own position. Never mark its source author\'s position with origin `input`. Leave the person\'s position unknown or offer a model proposal with origin `model`; position options must be in the person\'s first person.'
    : '',
].filter(Boolean).join('\n');
