/**
 * The refusals this surface is allowed to make.
 *
 * Two of the three are the contract's own (`BRIEF_FACT_UNGROUNDED`,
 * `RADAR_UNAVAILABLE`). The third is not in `voice-wiring.contract.ts` and is
 * declared here rather than added there: a draft has to be written into a
 * channel, and a brief that names one the workspace does not have is a
 * question for a person, not a server fault.
 */
export type ContentBriefErrorCodeV1 =
  | 'BRIEF_FACT_UNGROUNDED'
  | 'RADAR_UNAVAILABLE'
  | 'BRIEF_CHANNEL_UNKNOWN'
  | 'BRIEF_DRAFT_FAILED';

export class ContentBriefError extends Error {
  constructor(
    readonly code: ContentBriefErrorCodeV1,
    readonly status: number,
    message: string,
    /** The thing the refusal is about: a statement, a channel name. */
    readonly subject?: string
  ) {
    super(message);
    this.name = 'ContentBriefError';
  }
}
