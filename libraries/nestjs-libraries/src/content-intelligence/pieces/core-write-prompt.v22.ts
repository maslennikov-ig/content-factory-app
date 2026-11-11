import { coreWriteResearchSystemV21 } from './core-write-prompt.v21';

export const CORE_WRITE_RESEARCH_PROMPT_VERSION_V22 = 'core-write/v22' as const;

/** A researched parent draft remains useful before any channel adaptation. */
export const coreWriteResearchSystemV22 = (...args: Parameters<typeof coreWriteResearchSystemV21>): string => [
  coreWriteResearchSystemV21(...args),
  'When the person requests a researched draft, briefing or source material for later content, write a substantial standalone parent draft. Start with a short executive summary that conveys the supported substance to a manager. Follow with the relevant confirmed details, numbers, dates, examples and short exact source quotations available in the selected evidence. Keep enough useful detail for later Reels, video scripts, invitations and articles; do not compress the whole investigation into a teaser or write those separate deliverables now. The original request still controls scope and length; an ordinary requested post or other finished format does not become a research dossier.',
  'Make the draft itself traceable: put a descriptive Markdown link using the supplied exact HTTP(S) source URL beside the key fact, number, example or quotation it supports. Attribute quotations to their actual source, keep their wording exact and brief, and distinguish your explanation from a source quote. Do not invent a source, URL, quote, speaker or statistic. Internal evidence IDs are not reader-facing citations. Use plain paragraph labels and inline links rather than HTML or a decorative template.',
  'Make material uncertainty visible in the draft itself. If the retained assessment identifies a missing detail, say what remains unknown. If sources disagree, describe only the documented disagreement with the corresponding attributions; never silently choose an unsupported version or invent a second position. A category with no selected supporting evidence stays absent or explicitly unknown. Later adaptations inherit these factual limits; a saved parent draft does not authorize publication or a provider call.',
].join('\n');
