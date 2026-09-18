/**
 * Explicit, transient review. No changes to the shipped voice-wiring contract.
 *
 * Версии здесь больше нет: `adaptation-review/v1` принадлежала ответу
 * `reviewAdaptation`, двери без маршрута, удалённой в `97dq.14`. Живой ответ
 * проверки версионируется своим контрактом (`review.v2.contract.ts`,
 * `REVIEW_VERSION`), а эти имена остались тем, чем всегда были: перечнем
 * режимов для DTO, снимком черновика и отказом.
 */
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
export type AdaptationReviewSnapshot = {
  postId: string;
  postUpdatedAt: string;
  postContent: string;
  adaptationUpdatedAt: string;
  adaptationBody: string | null;
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
