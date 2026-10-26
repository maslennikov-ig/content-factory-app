import { briefFillPromptV12, briefFillSchemaV12, type BriefFillPromptInputV12 } from './intake.prompts.v12';
import { z } from 'zod';

export const BRIEF_FILL_PROMPT_VERSION_V13 = 'intake-brief-fill/v13' as const;
export const briefFillSchemaV13 = briefFillSchemaV12.extend({
  facts: z.array(briefFillSchemaV12.shape.facts.element.extend({
    quote: z.string().nullish().describe('Contiguous verbatim passage from the cited evidence supporting this statement, or null. An evidence id alone is not support.'),
  })),
});

/** Date roles are interpreted by this existing model call, never by a phrase router. */
export const briefFillPromptV13 = (input: BriefFillPromptInputV12): string => [
  briefFillPromptV12(input).replace('intake-brief-fill/v12', BRIEF_FILL_PROMPT_VERSION_V13),
  '',
  'SOURCE SUPPORT. For each external fact copy a contiguous supporting quote from its cited evidence. A source id alone does not confirm a statement. Preserve every selectedResearch row with its actual statement, source URL, evidence identity and quote; never replace its statement with an unrelated claim citing the same id. Selected research is collected evidence, distinct from the original request and reference examples.',
  'QUESTION CONSISTENCY. inputSufficient true means the writer can proceed without an author answer; return questions: [] in that case. Optional extra materials, improvements or reversible presentation choices are not blockers. Set inputSufficient false and ask a specific question only when an author-owned answer is actually necessary. Missing public evidence is a research gap, not a question to the author.',
  'DATE ROLES. Distinguish a requested reporting interval from a date that identifies a source, release, document, example or comparison subject. A named item may have a date without the person requesting a day-by-day event report. In that case keep constraints.temporal null and preserve the identifying date/version in the goal, materials or evidenceNeeds. Do not manufacture a one-day interval from an identifying date.',
  'Supply constraints.temporal only when the requested result actually selects events by time, such as changes since earlier coverage or events during a requested interval. A historical subject alone does not impose a reporting interval. Decide from the whole request and the roles of its dates, not from the presence of a date.',
  'For a version comparison or description of documented changes, an official statement that a capability was added or changed in the named version can support that bounded result. Assess the actual evidence needed; do not demand a separate announcement date for every documented item or exhaustive proof of absence in every earlier source. Preserve any comparison limitation that matters to the requested result.',
].join('\n');
