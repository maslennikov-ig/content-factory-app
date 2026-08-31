const UNKNOWN_ERROR_PATTERN = /(?:an\s+)?unknown error/i;
const SAFE_CODE_PATTERN = /^[a-z0-9_.:-]{1,64}$/i;

/**
 * Rows classified as unknown: the minimized `{"message":"Unknown Error"}` and
 * the legacy provider texts it replaced.
 *
 * One insensitive `contains` covers both. The legacy phrasings this used to
 * list separately — `An unknown error occurred, please try again later` from
 * the Instagram and Facebook providers — all contain `unknown error`, so a
 * second branch for them matched a strict subset of the first while costing
 * the table a second sequential `ILIKE` scan.
 */
export function unknownErrorMessageWhere() {
  return {
    message: { contains: 'Unknown Error', mode: 'insensitive' as const },
  };
}

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
  cause?: unknown;
  failure?: unknown;
};

function errorLike(value: unknown): ErrorLike {
  if (value && typeof value === 'object') {
    return value as ErrorLike;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? (parsed as ErrorLike)
        : { message: value };
    } catch {
      return { message: value };
    }
  }

  return {};
}

function firstTrimmedString(candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

/**
 * `changeState` is reached through a Temporal activity proxy, so a thrown
 * `ActivityFailure` arrives here as plain JSON. `Error.prototype.message` is a
 * non-enumerable own property and does not survive `JSON.stringify`, so neither
 * `error.message` nor `error.cause.message` exists on the wire. The only
 * surviving copy of the text is the protobuf failure the SDK attaches as
 * `failure` to every error it decodes from the server. Verified by round-trip
 * against @temporalio/common 1.15.0.
 *
 * The inner (application) message is preferred over the outer one, which is
 * only the generic `Activity task failed` wrapper.
 */
function classifierText(source: ErrorLike, cause: ErrorLike): string {
  const sourceFailure = errorLike(source.failure);
  return firstTrimmedString([
    cause.message,
    errorLike(cause.failure).message,
    errorLike(sourceFailure.cause).message,
    source.message,
    sourceFailure.message,
  ]);
}

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_CODE_PATTERN.test(value)
    ? value
    : undefined;
}

/**
 * The legacy Errors table is a publishing history, not an exception collector.
 * Keep only the fields needed to group and diagnose a provider failure. Raw
 * messages and request bodies may contain unpublished content, credentials or
 * personal data and therefore never cross this boundary: the recovered text
 * below only decides which of the two fixed classifications is stored.
 */
export function safeErrorLedgerPayload(error: unknown) {
  const source = errorLike(error);
  const cause = errorLike(source.cause);
  const message = UNKNOWN_ERROR_PATTERN.test(classifierText(source, cause))
    ? 'Unknown Error'
    : 'Publishing failed';
  const code = safeCode(source.code) ?? safeCode(cause.type);
  const rawStatus =
    cause.status ?? cause.statusCode ?? source.status ?? source.statusCode;
  const status =
    Number.isInteger(Number(rawStatus)) &&
    Number(rawStatus) >= 100 &&
    Number(rawStatus) <= 599
      ? Number(rawStatus)
      : undefined;

  return {
    message: JSON.stringify({
      message,
      ...(code ? { code } : {}),
      ...(status ? { status } : {}),
    }),
    body: '{}',
  };
}
