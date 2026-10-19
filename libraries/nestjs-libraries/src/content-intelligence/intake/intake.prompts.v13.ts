import { briefFillPromptV12, briefFillSchemaV12, type BriefFillPromptInputV12 } from './intake.prompts.v12';

export const BRIEF_FILL_PROMPT_VERSION_V13 = 'intake-brief-fill/v13' as const;
export const briefFillSchemaV13 = briefFillSchemaV12;

/** Date roles are interpreted by this existing model call, never by a phrase router. */
export const briefFillPromptV13 = (input: BriefFillPromptInputV12): string => [
  briefFillPromptV12(input).replace('intake-brief-fill/v12', BRIEF_FILL_PROMPT_VERSION_V13),
  '',
  'DATE ROLES. Distinguish a requested reporting interval from a date that identifies a source, release, document, example or comparison subject. A named item may have a date without the person requesting a day-by-day event report. In that case keep constraints.temporal null and preserve the identifying date/version in the goal, materials or evidenceNeeds. Do not manufacture a one-day interval from an identifying date.',
  'Supply constraints.temporal only when the requested result actually selects events by time, such as changes since earlier coverage or events during a requested interval. A historical subject alone does not impose a reporting interval. Decide from the whole request and the roles of its dates, not from the presence of a date.',
  'For a version comparison or description of documented changes, an official statement that a capability was added or changed in the named version can support that bounded result. Assess the actual evidence needed; do not demand a separate announcement date for every documented item or exhaustive proof of absence in every earlier source. Preserve any comparison limitation that matters to the requested result.',
].join('\n');
