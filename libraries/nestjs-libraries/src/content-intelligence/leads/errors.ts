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
