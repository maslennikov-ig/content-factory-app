import type { ContentLanguage } from '@contentfactory/nestjs-libraries/dtos/content.language';
import { contentLanguageNames } from '@contentfactory/nestjs-libraries/dtos/content.language';
import { extractionSchemaV4, type IntakeExtractionV4 } from './intake.prompts.v4';
import { briefFillPromptV3, briefFillSchemaV3 } from './intake.prompts.v3';
import { untrustedBlock, type BriefFillPromptInput } from './intake.prompts';

/**
 * Ninth-walk extract contract: one number per claim
 * (`content-factory-next-97dq.1`, walk of 18.09.2026).
 *
 * The eighth walk showed what a claim with three numbers costs. The Iceland
 * piece (`B1 8cc5a492`) produced ONE claim — «охватил 25 тысяч человек, длился
 * десять лет, производительность выросла на 40%» — the digest corrected the
 * single span it could check («длился десять лет»), and the corrected twin then
 * stood as `confirmed` while two unchecked numbers rode inside it. A claim that
 * carries one number can only be confirmed, corrected or left unverified as a
 * whole, so the honest verdict falls out of the shape of the claim instead of
 * depending on a later guard.
 *
 * The successor is the prompt, not the schema: `extractionSchemaV5` is
 * `extractionSchemaV4` itself, because nothing about the answer's shape
 * changed. `intake.prompts.v4.ts` stays importable and untouched — a recorded
 * v4 answer must keep parsing, and the version line in the prompt is what says
 * which instructions produced it.
 */

export const extractionSchemaV5 = extractionSchemaV4;

export type IntakeExtractionV5 = IntakeExtractionV4;

export const EXTRACT_PROMPT_VERSION_V5 = 'intake-extract/v5' as const;

export const extractionPromptV5 = (
  text: string,
  language: ContentLanguage
): string =>
  [
    `PROMPT VERSION: ${EXTRACT_PROMPT_VERSION_V5}`,
    'First decide what kind of material the person pasted.',
    'Return materialKind "foreign_post" when the text reads as a finished publication about an event or opinion written by somebody else. First-person wording inside such a publication belongs to its source author, not to the person who pasted it.',
    'Return materialKind "thought" when the text is the person\'s own note, instruction, question or rough idea for a future publication.',
    'For a foreign_post, extract its topic, angle, structure and factual claims in your own words. For a thought, return a short topic and angle when present, with empty structure and claims.',
    'Never copy more than four consecutive words from the pasted text. Never add or repair a claim.',
    'ONE claim carries ONE number. A sentence that states three numbers becomes three claims, one number each, and every claim must read on its own without the other two.',
    'Never join two numbers, two dates, two shares or two sums in one claim, even when the text states them in the same sentence.',
    'A claim carries a number when it states a figure, share, sum, count or date. Give every such claim its own short searchQuery that would confirm exactly that one number; otherwise use null.',
    'At most 8 structure steps and 12 claims.',
    `Write every field in ${contentLanguageNames[language]}.`,
    '',
    untrustedBlock(text),
  ].join('\n');

/**
 * Ninth-walk brief fill: the author's own numbers are rows, one number each.
 *
 * The extract rule above only reaches a long pasted text — the classification
 * seam is behind `FOREIGN_POST_MIN_CHARS`. A short own thought never passes it,
 * so its numbers come from the brief fill, and three live runs of the same
 * 170-character Iceland thought (18.09.2026) gave three different shapes: three
 * atomic rows, ONE glued row prefixed «Автор утверждает, что…», and no rows at
 * all. With no rows the digest had nothing to check, invented four verdicts
 * against keys that did not exist, and the piece kept «25 тысяч», «десять лет»
 * and «40%» unchallenged with an empty `ungrounded`.
 *
 * Hence three instructions, and a deterministic net behind them in
 * `own-facts.ts` for the run where the model does it anyway.
 *
 * `intake.prompts.v4.ts` stays importable and untouched; `briefFillSchemaV5` is
 * `briefFillSchemaV3` itself, because the answer's shape did not change.
 */

export const briefFillSchemaV5 = briefFillSchemaV3;

export const BRIEF_FILL_PROMPT_VERSION_V5 = 'intake-brief-fill/v5' as const;

export const briefFillPromptV5 = (input: BriefFillPromptInput): string =>
  [
    `PROMPT VERSION: ${BRIEF_FILL_PROMPT_VERSION_V5}`,
    briefFillPromptV3(input),
    'Every number, date, duration, share, sum or count the person stated becomes its OWN row in `facts`: one number per row, in the person’s own wording, and nothing of theirs is merged into a single row.',
    'Never prefix such a row with «Автор утверждает, что», «По словам автора», "The author claims" or any other attribution: the row already belongs to the person, and the prefix ends up quoted in their own text.',
    'When the person’s text states numbers, `facts` is never empty: a number nobody wrote down is a number nobody can check.',
    input.materialKind === 'borrowed'
      ? 'The pasted publication does not reveal the person\'s own position. Never mark its source author\'s position with origin `input`. Leave the person\'s position unknown or offer a model proposal with origin `model`; position options must be in the person\'s first person.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
