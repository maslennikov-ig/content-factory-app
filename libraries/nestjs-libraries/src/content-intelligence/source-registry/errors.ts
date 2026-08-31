export type SourceRegistryErrorCode =
  | 'POLICY_DISABLED'
  | 'RIGHTS_REQUIRED'
  | 'ROBOTS_DISALLOWED'
  | 'TERMS_DENIED'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'UNSUPPORTED_PORT'
  | 'URL_CREDENTIALS'
  | 'DNS_UNSAFE'
  | 'DNS_REBIND_BLOCKED'
  | 'REDIRECT_UNSAFE'
  | 'TIMEOUT'
  | 'RESPONSE_TOO_LARGE'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'DECOMPRESSION_LIMIT'
  | 'XML_POLICY'
  | 'PARSE_FAILED'
  | 'REMOTE_4XX'
  | 'REMOTE_5XX'
  | 'RATE_LIMITED'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_CONFLICT'
  | 'SOURCE_INACTIVE';

export class SourceRegistryError extends Error {
  constructor(
    readonly code: SourceRegistryErrorCode,
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'SourceRegistryError';
  }
}

export function asSafeSourceError(error: unknown): SourceRegistryError {
  if (error instanceof SourceRegistryError) return error;
  return new SourceRegistryError(
    'PARSE_FAILED',
    'Source processing failed',
    502
  );
}
