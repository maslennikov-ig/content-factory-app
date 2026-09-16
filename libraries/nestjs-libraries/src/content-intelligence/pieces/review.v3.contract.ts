import type {
  ReviewProposal as ReviewProposalV2,
  ReviewSnapshotV2,
  ReviewChange,
} from './review.v2.contract';
export {
  applyReviewChanges,
  syncEmbeddedTitle,
  type ReviewChange,
  type ReviewSnapshotV2,
} from './review.v2.contract';

export const REVIEW_VERSION = 'adaptation-review/v3' as const;
export const REVIEW_VERSIONS = [
  'adaptation-review/v2',
  REVIEW_VERSION,
] as const;

export type ReviewV3 = {
  version: typeof REVIEW_VERSION;
  originalText: string;
  text: string;
  title: string;
  changes: ReviewChange[];
  verdict: 'clean' | 'review' | 'rewrite';
  summary: string;
  token: string;
  slopBefore: number;
  slopAfter: number;
  sources?: ReviewProposalV2['sources'];
};

export type ReviewProposalV3 = Omit<ReviewV3, 'token'> & {
  organizationId: string;
  pieceId: string;
  adaptationId?: string;
  expires: number;
  language: 'ru' | 'en';
  snapshot?: ReviewSnapshotV2;
  pieceSnapshot: { body: string; brief: unknown; title: string };
};

/** Old tabs may still submit a v2 token after the server starts issuing v3. */
export type ReadableReviewProposal = ReviewProposalV2 | ReviewProposalV3;
