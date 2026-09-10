/** Explicit, transient review. No changes to the shipped voice-wiring contract. */
export const ADAPTATION_REVIEW_VERSION = 'adaptation-review/v1' as const;
export const ADAPTATION_REVIEW_MODES = ['slop', 'facts', 'both'] as const;
export const ADAPTATION_REVIEW_ACTIONS = [
  ...ADAPTATION_REVIEW_MODES,
  'web',
  'research',
] as const;
export type AdaptationReviewAction = (typeof ADAPTATION_REVIEW_ACTIONS)[number];
export type AdaptationReviewSource = {
  url: string;
  title: string;
  excerpt: string;
};
export type AdaptationReviewMode = (typeof ADAPTATION_REVIEW_MODES)[number];
export type AdaptationReviewSnapshot = {
  postId: string;
  postUpdatedAt: string;
  postContent: string;
  adaptationUpdatedAt: string;
  adaptationBody: string | null;
};
export type AdaptationReviewResult = {
  version: typeof ADAPTATION_REVIEW_VERSION;
  mode: AdaptationReviewAction;
  originalText: string;
  text: string;
  notes: Array<{ kind: 'slop' | 'facts'; text: string; sourceUrls?: string[] }>;
  /** Present only for the explicit, confirmed web action. Never persisted. */
  sources?: AdaptationReviewSource[];
  searchedChars?: number;
  snapshot: AdaptationReviewSnapshot;
};
export class AdaptationReviewError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}
export const reviewConflict = () =>
  new AdaptationReviewError(
    'ADAPTATION_REVIEW_STALE',
    409,
    'Черновик изменился после проверки или уже не является черновиком. Откройте актуальный текст и повторите проверку.'
  );
