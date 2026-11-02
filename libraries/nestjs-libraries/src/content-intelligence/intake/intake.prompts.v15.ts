import { briefFillPromptV14, briefFillSchemaV14 } from './intake.prompts.v14';
import type { BriefFillPromptInputV12 } from './intake.prompts.v12';
import type { briefEvidenceEnvelope } from './evidence-envelope';

export const BRIEF_FILL_PROMPT_VERSION_V15 = 'intake-brief-fill/v15' as const;
export const briefFillSchemaV15 = briefFillSchemaV14;
type Input = Omit<BriefFillPromptInputV12, 'evidence'> & { evidence: Array<ReturnType<typeof briefEvidenceEnvelope>> };

export const briefFillPromptV15 = (input: Input): string => [
  briefFillPromptV14(input as unknown as BriefFillPromptInputV12)
    .replace('intake-brief-fill/v14', BRIEF_FILL_PROMPT_VERSION_V15)
    .replace('Never infer event dates from crawl/publication metadata.', 'Distinguish publication and fetch dates from dates of events and availability.'),
  'SOURCE DATE AND AVAILABILITY. Source publishedAt dates the publication, fetchedAt only the retrieval. Neither by itself dates a launch or availability. Interpret an explicit relative event statement in its actual dated source: an authentic primary announcement saying availability starts today may support that availability on its publication date, within its stated product, audience and platform scope. Do not use a secondary platform announcement date as a global release date. Preserve the exact source statement and qualifiers; do not invent an event or date when the anchor or relationship is missing.',
  'A partial research assessment describes gaps in coverage, not uncertainty in every independently confirmed fact. Preserve supported availability and locate caveats at the specific unverified scope, conditions or claims; never replace a confirmed statement with a blanket unknown or restrict it to one platform without support.',
].join('\n');
