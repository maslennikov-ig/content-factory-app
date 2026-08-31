export type ContentContextErrorCodeV1 =
  | 'CONTENT_CONTEXT_NOT_FOUND'
  | 'CONTENT_CONTEXT_INVALIDATED'
  | 'CONTENT_CONTEXT_CITATIONS_INVALID'
  | 'CONTENT_CONTEXT_PROFILE_MISMATCH'
  | 'CONTENT_CONTEXT_DRAFT_ONLY'
  | 'CONTENT_CONTEXT_INPUT_INVALID'
  | 'CONTENT_EVIDENCE_REQUIRED';

export class ContentContextError extends Error {
  readonly name = 'ContentContextError';

  constructor(
    readonly code: ContentContextErrorCodeV1,
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
