type ErrorCollectionService = 'backend' | 'orchestrator' | 'frontend';

export interface ErrorSanitizationContext {
  service: ErrorCollectionService;
  environment?: string;
  release?: string;
}

type SanitizedFrame = {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
};

type SanitizedErrorEvent = {
  type: undefined;
  event_id: string;
  timestamp: number;
  level: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
  environment: string;
  release?: string;
  tags: { service: ErrorCollectionService };
  exception: {
    values: Array<{
      type: string;
      stacktrace?: { frames: SanitizedFrame[] };
    }>;
  };
};

const SAFE_EVENT_ID = /^[a-f0-9]{32}$/;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
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
const LEVELS = new Set<SanitizedErrorEvent['level']>([
  'fatal',
  'error',
  'warning',
  'log',
  'info',
  'debug',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safeToken = (value: unknown) =>
  typeof value === 'string' && SAFE_TOKEN.test(value) ? value : undefined;

const safeCoordinate = (value: unknown) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 10_000_000
    ? value
    : undefined;

/**
 * Directories that mark where our tree starts inside a runtime path. Anything
 * left of the first one is host layout — `/home/<name>/` carries a person, and
 * a deployment path carries the shape of the server — so it is cut off. A path
 * with none of them is dropped whole rather than guessed at.
 */
const REPOSITORY_ROOT_SEGMENTS = new Set([
  '.next',
  'apps',
  'dist',
  'libraries',
  'node_modules',
  '_next',
]);
const MAX_PATH_DEPTH = 16;
// One leading dot for `.next` and `.pnpm`, a leading `@` for a scoped package
// directory. `.` and `..` match neither, so a traversal marker cannot survive.
const SAFE_PATH_SEGMENT = /^\.?[@_A-Za-z0-9][A-Za-z0-9._+@-]{0,79}$/;
const SAFE_FUNCTION_SEGMENT = /^([A-Za-z_$][A-Za-z0-9_$]{0,63}|<anonymous>)$/;
const FUNCTION_QUALIFIER = /^(?:new|async|get|set) /;

/**
 * Keeps a repository-relative path and drops everything else. Without a file
 * name the collector groups every error in the product into one problem, so
 * this is the smallest thing that makes grouping work. What passes is a path
 * under our own source directories; a user name, a home directory, an upload
 * path or a query string never reaches that shape.
 */
const safeFilename = (value: unknown) => {
  if (typeof value !== 'string' || !value || value.length > 300) {
    return undefined;
  }

  const segments = value.replace(/^file:\/\//, '').split('/');
  const start = segments.findIndex((segment) =>
    REPOSITORY_ROOT_SEGMENTS.has(segment)
  );
  if (start === -1) return undefined;

  const relative = segments.slice(start);
  if (relative.length > MAX_PATH_DEPTH) return undefined;
  if (!relative.every((segment) => SAFE_PATH_SEGMENT.test(segment))) {
    return undefined;
  }

  return relative.join('/');
};

/**
 * Keeps a function name that has the shape of code: dotted identifiers, with
 * the qualifier V8 puts in front of a constructor or an accessor. A sentence, an
 * address, a prompt or a URL has none of that shape and is dropped.
 */
const safeFunctionName = (value: unknown) => {
  if (typeof value !== 'string' || !value || value.length > 100) {
    return undefined;
  }

  const withoutQualifier = value.replace(FUNCTION_QUALIFIER, '');
  const segments = withoutQualifier.split('.');
  if (segments.length > 6) return undefined;
  if (!segments.every((segment) => SAFE_FUNCTION_SEGMENT.test(segment))) {
    return undefined;
  }

  return value;
};

const sanitizeFrame = (value: unknown): SanitizedFrame | undefined => {
  if (!isRecord(value)) return undefined;

  const frame: SanitizedFrame = {};
  const filename = safeFilename(value.filename);
  const functionName = safeFunctionName(value.function);
  const lineno = safeCoordinate(value.lineno);
  const colno = safeCoordinate(value.colno);

  if (filename) frame.filename = filename;
  if (functionName) frame.function = functionName;
  if (lineno) frame.lineno = lineno;
  if (colno) frame.colno = colno;
  if (typeof value.in_app === 'boolean') frame.in_app = value.in_app;

  return Object.keys(frame).length ? frame : undefined;
};

/**
 * Rebuilds an error event from a small positive allowlist. The original object
 * is never returned, including when a getter or malformed SDK value throws.
 */
export const sanitizeErrorEvent = (
  value: unknown,
  context: ErrorSanitizationContext
): SanitizedErrorEvent | null => {
  try {
    if (!isRecord(value)) return null;

    const eventId =
      typeof value.event_id === 'string' && SAFE_EVENT_ID.test(value.event_id)
        ? value.event_id
        : undefined;
    const timestamp =
      typeof value.timestamp === 'number' &&
      Number.isFinite(value.timestamp) &&
      value.timestamp > 0
        ? value.timestamp
        : undefined;
    const service = safeToken(context.service) as
      | ErrorCollectionService
      | undefined;
    const environment = safeToken(context.environment || 'unknown');
    const release = safeToken(context.release);

    const exception = isRecord(value.exception) ? value.exception : undefined;
    const rawValues = exception?.values;
    const firstException =
      Array.isArray(rawValues) && isRecord(rawValues[0])
        ? rawValues[0]
        : undefined;
    const exceptionType = SAFE_EXCEPTION_TYPES.has(
      firstException?.type as string
    )
      ? (firstException?.type as string)
      : 'Error';

    if (!eventId || !timestamp || !service || !environment || !firstException) {
      return null;
    }

    const rawStacktrace = isRecord(firstException?.stacktrace)
      ? firstException.stacktrace
      : undefined;
    const rawFrames = Array.isArray(rawStacktrace?.frames)
      ? rawStacktrace.frames
      : [];
    const frames = rawFrames
      .slice(-50)
      .map(sanitizeFrame)
      .filter((frame): frame is SanitizedFrame => Boolean(frame));
    const level = LEVELS.has(value.level as SanitizedErrorEvent['level'])
      ? (value.level as SanitizedErrorEvent['level'])
      : 'error';

    return {
      type: undefined,
      event_id: eventId,
      timestamp,
      level,
      environment,
      ...(release ? { release } : {}),
      tags: { service },
      exception: {
        values: [
          {
            type: exceptionType,
            ...(frames.length ? { stacktrace: { frames } } : {}),
          },
        ],
      },
    };
  } catch {
    return null;
  }
};
