import type { ContentLanguage } from '@contentfactory/nestjs-libraries/dtos/content.language';
import { contentLanguageNames } from '@contentfactory/nestjs-libraries/dtos/content.language';
import { extractionSchemaV5, type IntakeExtractionV5 } from './intake.prompts.v5';
import { untrustedBlock } from './intake.prompts';

/**
 * Ninth-walk extract contract: a kind the person already named is not put to a
 * vote (`content-factory-next-97dq.21`, walk of 22.09.2026).
 *
 * What happened on production. The owner pasted a foreign post about
 * marketplace fees and ticked «Это чужой текст», so `inputKindExplicit` was
 * true and `settleKind` held `foreign_post` as it must. The prompt, however,
 * still opened with «First decide what kind of material the person pasted»,
 * and the live model called that opinion post a `thought` — the same vote it
 * cast on 18.09. Under v5 a `thought` answer means empty `structure` and empty
 * `claims`, and the core prompt never receives the foreign text itself by
 * design, so the piece came out as the person's own answers verbatim
 * (`cnt-20`: 19 words; `cnt-21`: thesis plus position).
 *
 * Hence the successor: where the kind is already known — the checkbox, or a
 * link whose fetched page is foreign material by construction — the model is
 * not asked what it is reading. It is told. The classifying prompt of v5 stays
 * in service for the one seam that still needs it: a long pasted text nobody
 * named, where the model's vote can only raise the guess.
 *
 * The successor is the prompt, not the schema: `extractionSchemaV6` is
 * `extractionSchemaV5` itself. `materialKind` survives in the answer for
 * compatibility with recorded runs, and nothing reads it on this path.
 * `intake.prompts.v5.ts` stays importable and untouched — released receipts
 * name it, and the version line in the prompt is what says which instructions
 * produced an answer.
 */

export const extractionSchemaV6 = extractionSchemaV5;

export type IntakeExtractionV6 = IntakeExtractionV5;

export const EXTRACT_PROMPT_VERSION_V6 = 'intake-extract/v6' as const;

export const extractionPromptV6 = (
  text: string,
  language: ContentLanguage
): string =>
  [
    `PROMPT VERSION: ${EXTRACT_PROMPT_VERSION_V6}`,
    'This is a publication somebody else wrote. The person who pasted it is not its author: they want to write their own post about the same subject.',
    'The kind of this material is already settled. Do not decide it, and do not weigh whether this could be somebody\'s own note: read the text as a finished publication and take it apart.',
    'Extract its topic, its angle, how it is built and the factual claims it makes, in your own words.',
    'Give 2 to 8 structure steps in the reading order. Every publication has a build — what it opens with, what it develops, what it closes on — and a post that argues an opinion has one no less than a report.',
    'Give the factual claims it makes, strongest first. An opinion post states facts too: what happened, who did what, how much something costs, what changed. An empty claims list means the text asserts nothing, which is almost never true of a published post.',
    'First-person wording inside the text belongs to its source author, not to the person who pasted it.',
    'Never copy more than four consecutive words from the pasted text. Never add or repair a claim.',
    'ONE claim carries ONE number. A sentence that states three numbers becomes three claims, one number each, and every claim must read on its own without the other two.',
    'Never join two numbers, two dates, two shares or two sums in one claim, even when the text states them in the same sentence.',
    'A claim carries a number when it states a figure, share, sum, count or date. Give every such claim its own short searchQuery that would confirm exactly that one number; otherwise use null.',
    'At most 8 structure steps and 12 claims.',
    'Answer materialKind "foreign_post": the field is kept for compatibility and the kind is not decided here.',
    `Write every field in ${contentLanguageNames[language]}.`,
    '',
    untrustedBlock(text),
  ].join('\n');
