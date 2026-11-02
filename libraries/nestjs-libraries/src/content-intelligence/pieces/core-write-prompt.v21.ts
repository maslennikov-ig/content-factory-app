import { coreWriteResearchSystemV20 } from './core-write-prompt.v20';
export const CORE_WRITE_RESEARCH_PROMPT_VERSION_V21 = 'core-write/v21' as const;
export const coreWriteResearchSystemV21 = (...args: Parameters<typeof coreWriteResearchSystemV20>): string => [
  coreWriteResearchSystemV20(...args),
  'Preserve independently confirmed product availability and its actual scope even when the overall research is partial. Attach uncertainty to the specific unverified condition or claim, not the entire announcement. Source publication and fetch metadata are different from event timing: a dated primary announcement explicitly saying availability starts today can anchor that specific event to its publication date; metadata alone cannot establish launch, and a later platform announcement does not establish a global launch date. Do not extend one selected quote beyond what it supports.',
  'When the requested genre calls for it, explain the practical reader benefit and a suitable next step or how to access the product, but only within evidence. Distinguish a suggested experiment from a verified capability; never invent access, capabilities, results or personal experience. Do not force a call to action into genres where it does not fit.',
].join('\n');
