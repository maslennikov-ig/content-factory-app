import { Logger } from '@nestjs/common';
import type { AgentErrorCode } from '../capabilities/agent-parts.contract';
import { redactSecretShapes } from './secret-shapes';

/**
 * Stream errors in product codes (`content-factory-next-kcxz.8`, premortem S6,
 * ADR-0012 «Последствия»).
 *
 * `handleChatStream` turns anything thrown during a turn into an `error` part
 * with `errorText` from `onError`; its default sent the server's stack and
 * file paths to the browser (spike Q1). Here the text is a code from
 * `AGENT_ERROR_CODES` and nothing else — the screen words it, the log keeps
 * the detail.
 */

const field = (error: unknown, key: string): unknown =>
  error && typeof error === 'object'
    ? (error as Record<string, unknown>)[key]
    : undefined;

const statusOf = (error: unknown): number | undefined => {
  for (const key of ['statusCode', 'status']) {
    const value = field(error, key);
    if (typeof value === 'number') return value;
  }
  const response = field(error, 'response');
  const status = field(response, 'status');
  return typeof status === 'number' ? status : undefined;
};

const codeOf = (error: unknown): string | undefined => {
  const direct = field(error, 'code');
  if (typeof direct === 'string') return direct;
  const response = field(error, 'response');
  const nested = field(response, 'code');
  return typeof nested === 'string' ? nested : undefined;
};

const PROVIDER_REJECTIONS = new Set([400, 401, 403, 404, 422]);

/** An error of a call to the model provider, not one of ours. */
const fromProvider = (error: unknown) =>
  /^AI_(APICall|LoadAPIKey)Error$/.test(String(field(error, 'name') ?? '')) ||
  typeof field(error, 'url') === 'string';

/**
 * What a turn knows about its own request when it words an error: whether
 * the model step that failed carried the message's pictures.
 */
export type ConductorErrorScope = { picturesInStep?: () => boolean };

/** A provider's refusal of the request's content, not of the key or the model. */
const CONTENT_REJECTIONS = new Set([400, 413, 415, 422]);

export const conductorErrorCode = (
  error: unknown,
  scope: ConductorErrorScope = {}
): AgentErrorCode => {
  const code = ownErrorCode(error);
  // The step that carried the pictures was refused for its content: the
  // model does not take pictures, or not this one (review W4-25 vision F5).
  if (code === 'AI_PROVIDER_REJECTED' && scope.picturesInStep?.()) {
    const status = statusOf(error) ?? statusOf(field(error, 'cause'));
    if (status !== undefined && CONTENT_REJECTIONS.has(status)) return 'AGENT_PICTURE_NOT_SEEN';
  }
  return code;
};

const ownErrorCode = (error: unknown): AgentErrorCode => {
  const cause = field(error, 'cause');
  const name = String(field(error, 'name') ?? '');
  const id = String(field(error, 'id') ?? '');
  const code = codeOf(error) ?? codeOf(cause);
  const status = statusOf(error) ?? statusOf(cause);

  if (
    name === 'AiProviderNotConfigured' ||
    code === 'AI_SELECTED_CREDENTIAL_UNAVAILABLE'
  ) {
    return 'AI_PROVIDER_UNAVAILABLE';
  }
  if (
    name === 'AiIncludedQuotaExceeded' ||
    code === 'AI_INCLUDED_QUOTA_EXHAUSTED'
  ) {
    return 'AI_ALLOWANCE_EXHAUSTED';
  }
  if (
    id === 'AGENT_RESUME_NO_SNAPSHOT_FOUND' ||
    id === 'AGENT_RESUME_TOOL_CALL_NOT_SUSPENDED'
  ) {
    return 'AGENT_RUN_NOT_PENDING';
  }
  if (name === 'TripWire' || field(error, 'processorId') !== undefined) {
    return 'AGENT_BLOCKED';
  }
  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    code === 'ETIMEDOUT' ||
    status === 408 ||
    status === 504
  ) {
    return 'AI_PROVIDER_TIMEOUT';
  }
  if (status === 429 || status === 502 || status === 503 || status === 529) {
    return 'AI_PROVIDER_BUSY';
  }
  // The provider's own refusal of the request (the AI SDK's `APICallError`
  // carries the provider `url` and `statusCode`): an unknown model, a key it
  // does not accept, a setting it does not take. «Try again» would be wrong
  // advice; the administrator's settings are what to look at (kcxz.29, D9).
  if (
    status !== undefined &&
    PROVIDER_REJECTIONS.has(status) &&
    (fromProvider(error) || fromProvider(cause))
  ) {
    return 'AI_PROVIDER_REJECTED';
  }
  return 'AGENT_FAILED';
};

const logger = new Logger('AgentConductor');

/**
 * The detail the browser never sees, for the server log only (review W1 F14):
 * the code, the error's name, message and stack, with key shapes redacted —
 * a provider error may quote the request it refused.
 */
export const logConductorError = (error: unknown, scope: ConductorErrorScope = {}) => {
  const code = conductorErrorCode(error, scope);
  const name = String(field(error, 'name') ?? typeof error);
  const message = redactSecretShapes(
    String(field(error, 'message') ?? (typeof error === 'string' ? error : ''))
  );
  const stack = field(error, 'stack');
  logger.error(
    `Agent turn error ${code}: ${name}: ${message}`,
    typeof stack === 'string' ? redactSecretShapes(stack) : undefined
  );
};

/** `onError` of `handleChatStream`: the code, never a message; the log keeps the rest. */
export const conductorOnError = (error: unknown, scope: ConductorErrorScope = {}): string => {
  logConductorError(error, scope);
  return conductorErrorCode(error, scope);
};
