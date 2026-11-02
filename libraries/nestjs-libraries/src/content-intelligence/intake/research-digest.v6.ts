import { researchDigestPromptV5, researchDigestSchemaV5, digestSourcesForV5, settleResearchDigestV5 } from './research-digest.v5';
import type { ResearchDigestInputV4 } from './research-digest.v4';
import type { ResearchDigestSource } from './research-digest';
export const RESEARCH_DIGEST_PROMPT_VERSION_V6 = 'research-digest/v6' as const;
export const researchDigestSchemaV6 = researchDigestSchemaV5;
export const digestSourcesForV6 = digestSourcesForV5;
export const settleResearchDigestV6 = settleResearchDigestV5;
export const researchDigestPromptV6 = (input: ResearchDigestInputV4, sources: ReadonlyArray<ResearchDigestSource & { material: string }>) => [
  researchDigestPromptV5(input, sources).replace('research-digest/v5', RESEARCH_DIGEST_PROMPT_VERSION_V6),
  'RELATIVE EVENT DATES AND SCOPE. Publication and retrieval metadata alone do not date a release. When an authentic dated primary announcement explicitly says an availability event starts today, its publication date anchors that relative statement for the specific named audience and products. An announcement for an additional platform dates only that platform, not global launch. Preserve actual supported availability and localize research gaps to the claims or access conditions they concern; partial coverage does not make every confirmed claim unknown. The quote must be a real source span and preserve the scope.',
].join('\n');
