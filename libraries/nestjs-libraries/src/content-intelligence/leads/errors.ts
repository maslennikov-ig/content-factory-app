/**
 * The refusals this module can hand a controller, mirrored from
 * `source-registry/errors.ts` — same shape (`code`, `message`, `status`), so
 * `safeHttpError` in a controller does not need a second reading of what a
 * refusal looks like.
 */
export type ContentLeadErrorCode =
  | 'POLICY_DISABLED'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'SUBSCRIPTION_CONFLICT'
  // `content-factory-next-ni7x`. Two ceilings, not two failures: the
  // workspace already holds as many feeds as it may, and the feed was
  // opened a moment ago. Both are refusals a person can act on by waiting
  // or by unsubscribing, which is why they carry their own codes rather
  // than joining `CHECK_FAILED`.
  | 'SUBSCRIPTION_LIMIT'
  | 'CHECK_TOO_SOON'
  | 'LEAD_NOT_FOUND'
  | 'LEAD_NOT_NEW'
  | 'INVALID_URL'
  | 'TERMS_DENIED'
  | 'ROBOTS_DISALLOWED'
  | 'CHECK_FAILED'
  | 'AUTOPOST_NOT_FOUND';

export class ContentLeadError extends Error {
  constructor(
    readonly code: ContentLeadErrorCode,
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'ContentLeadError';
  }
}
