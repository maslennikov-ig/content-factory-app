/** Only these product codes and statuses may cross the native processor boundary. */
export type NativeTerminalProviderCode =
  | 'AI_PROVIDER_PAYMENT_REQUIRED'
  | 'AI_PROVIDER_REJECTED'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_BUSY'
  | 'AGENT_FAILED'
  | 'AGENT_TASK_OPERATION_FAILED';
export type NativeTerminalProviderError = {
  code: NativeTerminalProviderCode;
  status?: number;
};

const field = (value: unknown, key: string): unknown =>
  value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;

/** OpenRouter's key cap is a structured provider response, never user prose. */
export const isOpenRouterKeyLimitError = (value: unknown): boolean => {
  if (field(value, 'statusCode') !== 403 && field(value, 'status') !== 403) return false;
  const url = field(value, 'url');
  if (typeof url !== 'string') return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host !== 'openrouter.ai' && !host.endsWith('.openrouter.ai')) return false;
    const raw = field(value, 'responseBody');
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const metadata = field(field(body, 'error'), 'metadata');
    return field(metadata, 'limit_source') === 'openrouter_key_limit' &&
      field(metadata, 'scope') === 'key_limit';
  } catch {
    return false;
  }
};

const safeCodes = new Set<NativeTerminalProviderCode>([
  'AI_PROVIDER_PAYMENT_REQUIRED', 'AI_PROVIDER_REJECTED', 'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_BUSY', 'AGENT_FAILED', 'AGENT_TASK_OPERATION_FAILED',
]);
const safeStatuses = new Set([400, 401, 402, 403, 404, 408, 413, 415, 422, 429, 502, 503, 504, 529]);

/** Validate even deserialized state: do not propagate arbitrary provider fields. */
export const readNativeTerminalProviderError = (value: unknown): NativeTerminalProviderError | undefined => {
  const code = field(value, 'code');
  if (typeof code !== 'string' || !safeCodes.has(code as NativeTerminalProviderCode)) return undefined;
  const status = field(value, 'status');
  return { code: code as NativeTerminalProviderCode,
    ...(typeof status === 'number' && safeStatuses.has(status) ? { status } : {}) };
};

export const nativeTerminalProviderError = (error: unknown): NativeTerminalProviderError => {
  const seen = new Set<object>();
  for (let value = error; value && typeof value === 'object' && !seen.has(value); value = field(value, 'cause')) {
    seen.add(value);
    const name = String(field(value, 'name') ?? '');
    const statusValue = field(value, 'statusCode') ?? field(value, 'status');
    const status = typeof statusValue === 'number' && safeStatuses.has(statusValue) ? statusValue : undefined;
    const provider = /^AI_(APICall|LoadAPIKey)Error$/.test(name) || typeof field(value, 'url') === 'string';
    let code: NativeTerminalProviderCode | undefined;
    if (provider && (status === 402 || isOpenRouterKeyLimitError(value))) code = 'AI_PROVIDER_PAYMENT_REQUIRED';
    else if (name === 'TimeoutError' || name === 'AbortError' || field(value, 'code') === 'ETIMEDOUT' || status === 408 || status === 504) code = 'AI_PROVIDER_TIMEOUT';
    else if (status === 429 || status === 502 || status === 503 || status === 529) code = 'AI_PROVIDER_BUSY';
    else if (provider && status !== undefined && [400, 401, 403, 404, 413, 415, 422].includes(status)) code = 'AI_PROVIDER_REJECTED';
    if (code) return { code, ...(status === undefined ? {} : { status }) };
  }
  return { code: 'AGENT_FAILED' };
};
