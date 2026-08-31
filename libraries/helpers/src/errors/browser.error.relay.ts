import {
  ErrorSanitizationContext,
  sanitizeErrorEvent,
} from '@contentfactory/helpers/errors/sanitize.error.event';

export const BROWSER_ERROR_RELAY_PATH = '/api/browser-errors';
export const BROWSER_ERROR_RELAY_BODY_LIMIT = 16 * 1024;
export const BROWSER_ERROR_RELAY_FORWARD_TIMEOUT_MS = 250;

type RelayFrame = {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
};

type BrowserErrorRelayPayload = {
  event_id: string;
  timestamp: number;
  level: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
  exception: {
    type: string;
    frames: RelayFrame[];
  };
};

type BrowserErrorRelayEvent = NonNullable<
  ReturnType<typeof sanitizeErrorEvent>
>;

const EVENT_ID = /^[a-f0-9]{32}$/;
const SAFE_EXCEPTION_TYPES = new Set([
  'AggregateError',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
]);
const LEVELS = new Set<BrowserErrorRelayPayload['level']>([
  'fatal',
  'error',
  'warning',
  'log',
  'info',
  'debug',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, allowed: string[]) => {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
};

const parseFrame = (value: unknown): RelayFrame | null => {
  if (!isRecord(value)) return null;
  const allowed = ['filename', 'function', 'lineno', 'colno', 'in_app'];
  if (!hasOnlyKeys(value, allowed)) return null;

  if (
    (value.filename !== undefined && typeof value.filename !== 'string') ||
    (value.function !== undefined && typeof value.function !== 'string') ||
    (value.lineno !== undefined && typeof value.lineno !== 'number') ||
    (value.colno !== undefined && typeof value.colno !== 'number') ||
    (value.in_app !== undefined && typeof value.in_app !== 'boolean')
  ) {
    return null;
  }

  const frame: RelayFrame = {};
  if (typeof value.filename === 'string') frame.filename = value.filename;
  if (typeof value.function === 'string') frame.function = value.function;
  if (typeof value.lineno === 'number') frame.lineno = value.lineno;
  if (typeof value.colno === 'number') frame.colno = value.colno;
  if (typeof value.in_app === 'boolean') frame.in_app = value.in_app;

  // The endpoint accepts only the already-canonical representation produced
  // by the browser transport. A raw URL, query string, sentence or invalid
  // coordinate is rejected instead of being accepted and silently discarded.
  const checked = sanitizeErrorEvent(
    {
      event_id: '00000000000000000000000000000000',
      timestamp: 1,
      exception: {
        values: [
          {
            type: 'Error',
            stacktrace: { frames: [frame] },
          },
        ],
      },
    },
    { service: 'frontend', environment: 'unknown' }
  )?.exception.values[0].stacktrace?.frames[0];
  return JSON.stringify(checked) === JSON.stringify(frame) ? frame : null;
};

/**
 * The public endpoint accepts one closed JSON shape. Unknown fields are an
 * error rather than data to discard, so a future browser SDK cannot silently
 * widen what crosses this boundary.
 */
export const parseBrowserErrorRelayPayload = (
  value: unknown
): BrowserErrorRelayPayload | null => {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, ['event_id', 'timestamp', 'level', 'exception'])) {
    return null;
  }
  if (
    typeof value.event_id !== 'string' ||
    !EVENT_ID.test(value.event_id) ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp) ||
    value.timestamp <= 0 ||
    !LEVELS.has(value.level as BrowserErrorRelayPayload['level']) ||
    !isRecord(value.exception) ||
    !hasOnlyKeys(value.exception, ['type', 'frames']) ||
    typeof value.exception.type !== 'string' ||
    !SAFE_EXCEPTION_TYPES.has(value.exception.type) ||
    !Array.isArray(value.exception.frames) ||
    value.exception.frames.length > 50
  ) {
    return null;
  }

  const frames = value.exception.frames.map(parseFrame);
  if (frames.some((frame) => frame === null)) return null;

  return {
    event_id: value.event_id,
    timestamp: value.timestamp,
    level: value.level as BrowserErrorRelayPayload['level'],
    exception: {
      type: value.exception.type,
      frames: frames as RelayFrame[],
    },
  };
};

/**
 * A browser SDK transport receives a tuple envelope. It copies only event
 * identity, severity, built-in error type and stack coordinates into the
 * first-party JSON contract. Envelope headers and every other event member are
 * deliberately unread.
 */
export const browserErrorPayloadFromEnvelope = (
  envelope: unknown
): BrowserErrorRelayPayload | null => {
  if (!Array.isArray(envelope) || !Array.isArray(envelope[1])) return null;

  const item = envelope[1].find(
    (candidate) =>
      Array.isArray(candidate) &&
      isRecord(candidate[0]) &&
      candidate[0].type === 'event' &&
      isRecord(candidate[1])
  );
  if (!Array.isArray(item) || !isRecord(item[1])) return null;

  const rawEvent = item[1];
  const event = sanitizeErrorEvent(rawEvent, {
    service: 'frontend',
    environment: 'unknown',
  });
  if (!event) return null;
  const exception = isRecord(event.exception) ? event.exception : undefined;
  const values = Array.isArray(exception?.values) ? exception.values : [];
  const first = isRecord(values[0]) ? values[0] : undefined;
  const stacktrace = isRecord(first?.stacktrace) ? first.stacktrace : undefined;

  return parseBrowserErrorRelayPayload({
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    exception: {
      type: first?.type,
      frames: Array.isArray(stacktrace?.frames) ? stacktrace.frames : [],
    },
  });
};

export class BrowserErrorRelayLimiter {
  readonly #counts = new Map<string, number>();
  #windowId: number | undefined;
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxClients: number;

  constructor(options: {
    limit: number;
    windowMs: number;
    maxClients?: number;
  }) {
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#maxClients = options.maxClients ?? 1_024;
  }

  allow(clientKey: string, now = Date.now()) {
    const windowId = Math.floor(now / this.#windowMs);
    if (this.#windowId !== windowId) {
      this.#windowId = windowId;
      this.#counts.clear();
    }

    const count = this.#counts.get(clientKey) ?? 0;
    if (count >= this.#limit) return false;
    if (!this.#counts.has(clientKey) && this.#counts.size >= this.#maxClients) {
      const oldest = this.#counts.keys().next().value;
      if (oldest !== undefined) this.#counts.delete(oldest);
    }
    this.#counts.set(clientKey, count + 1);
    return true;
  }
}

type BodyReadResult =
  | { status: 'ok'; text: string }
  | { status: 'too-large' }
  | { status: 'unreadable' };

const readBoundedBody = async (request: Request): Promise<BodyReadResult> => {
  const declaredLength = Number(request.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > BROWSER_ERROR_RELAY_BODY_LIMIT
  ) {
    return { status: 'too-large' };
  }
  if (!request.body) return { status: 'unreadable' };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > BROWSER_ERROR_RELAY_BODY_LIMIT) {
        await reader.cancel();
        return { status: 'too-large' };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { status: 'ok', text };
  } catch {
    return { status: 'unreadable' };
  }
};

const emptyResponse = (status: number) =>
  new Response(null, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-length': '0',
      'x-content-type-options': 'nosniff',
    },
  });

const normalizeOrigin = (value: string) => {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
};

const waitForForward = async (
  operation: Promise<unknown>,
  timeoutMs: number
) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation.catch(() => undefined),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export interface BrowserErrorRelayDependencies {
  expectedOrigin: string;
  context: ErrorSanitizationContext;
  limiter: BrowserErrorRelayLimiter;
  clientKey: (request: Request, now: number) => string | null;
  forward: (event: BrowserErrorRelayEvent) => Promise<unknown>;
  forwardTimeoutMs?: number;
}

export const handleBrowserErrorRelayRequest = async (
  request: Request,
  dependencies: BrowserErrorRelayDependencies
) => {
  const expectedOrigin = normalizeOrigin(dependencies.expectedOrigin);
  if (!expectedOrigin) return emptyResponse(503);
  if (request.headers.get('origin') !== expectedOrigin) {
    return emptyResponse(403);
  }
  if (
    request.headers.get('content-type')?.split(';', 1)[0] !== 'application/json'
  ) {
    return emptyResponse(415);
  }
  const now = Date.now();
  const clientKey = dependencies.clientKey(request, now);
  if (!clientKey) return emptyResponse(400);
  if (!dependencies.limiter.allow(clientKey, now)) return emptyResponse(429);

  const body = await readBoundedBody(request);
  if (body.status === 'too-large') return emptyResponse(413);
  if (body.status !== 'ok') return emptyResponse(400);

  let decoded: unknown;
  try {
    decoded = JSON.parse(body.text);
  } catch {
    return emptyResponse(400);
  }
  const payload = parseBrowserErrorRelayPayload(decoded);
  if (!payload) return emptyResponse(400);

  const event = sanitizeErrorEvent(
    {
      event_id: payload.event_id,
      timestamp: payload.timestamp,
      level: payload.level,
      exception: {
        values: [
          {
            type: payload.exception.type,
            stacktrace: { frames: payload.exception.frames },
          },
        ],
      },
    },
    dependencies.context
  );
  if (!event) return emptyResponse(400);

  await waitForForward(
    Promise.resolve().then(() => dependencies.forward(event)),
    dependencies.forwardTimeoutMs ?? BROWSER_ERROR_RELAY_FORWARD_TIMEOUT_MS
  );
  return emptyResponse(202);
};
