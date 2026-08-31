/**
 * `node-telegram-bot-api` builds every request as
 * `https://api.telegram.org/bot<token>/<method>` and hangs the request it made
 * on the error it throws. Logging that error whole puts the bot token into the
 * container log, journald, and any log shipper downstream of them — and the
 * bot token is read access to every incoming message plus write access to
 * every connected channel.
 *
 * Nothing here looks at field names. A credential is recognised by its shape,
 * so it is removed wherever it happens to sit: a message, a stack frame, a
 * nested `cause`, a URL inside an object three levels down.
 */

export const redactionPlaceholder = '[REDACTED]';

/**
 * A Telegram bot token is `<numeric bot id>:<35 opaque characters>`. The
 * lookbehind matters: inside `.../bot8886813440:AA…` there is no word boundary
 * between `bot` and the digits, so `\b` would miss exactly the case this
 * exists for.
 */
const botTokenPattern = /(?<!\d)\d{6,}:[A-Za-z0-9_-]{30,}/g;

/** `Authorization: Bearer …` reaches a log the same way a URL does. */
const bearerPattern = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi;

/**
 * Query credentials are how most other providers would leak. Matching the
 * parameter name and replacing only its value keeps the rest of the URL —
 * which is the part worth reading in a log.
 */
const queryCredentialPattern =
  /([?&](?:access_token|refresh_token|api_key|apikey|token|key|password|client_secret)=)[^&\s"'<>#]+/gi;

/**
 * Depth and breadth are bounded because this runs on the failure path. A
 * pathological error object must not be able to turn one failed poll into a
 * stalled consumer.
 */
const maximumDepth = 8;
const maximumArrayLength = 200;

/**
 * Values configured on this process are redacted literally as well as by
 * shape. A credential that matches no pattern above — a client secret is just
 * opaque characters — still must not reach a log. Read per call rather than at
 * import time so configuration loaded after this module still counts.
 */
const sensitiveEnvironmentVariables = [
  'TELEGRAM_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CLIENT_SECRET',
  'JWT_SECRET',
];

const configuredValues = () =>
  sensitiveEnvironmentVariables
    .map((name) => process.env[name])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    // Anything shorter is not a credential and would redact ordinary words.
    .filter((value) => value.length >= 8);

export const redactSensitiveText = (text: string) => {
  let redacted = text;
  for (const value of configuredValues()) {
    redacted = redacted.split(value).join(redactionPlaceholder);
  }

  return redacted
    .replace(botTokenPattern, redactionPlaceholder)
    .replace(bearerPattern, `$1${redactionPlaceholder}`)
    .replace(queryCredentialPattern, `$1${redactionPlaceholder}`);
};

const isOpaqueValue = (value: unknown) =>
  value instanceof Date ||
  value instanceof RegExp ||
  ArrayBuffer.isView(value) ||
  value instanceof ArrayBuffer;

const walk = (
  value: unknown,
  seen: WeakMap<object, unknown>,
  depth: number
): unknown => {
  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing;
  }

  if (depth >= maximumDepth) {
    return '[TRUNCATED]';
  }

  if (isOpaqueValue(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const entry of value.slice(0, maximumArrayLength)) {
      clone.push(walk(entry, seen, depth + 1));
    }
    if (value.length > maximumArrayLength) {
      clone.push('[TRUNCATED]');
    }
    return clone;
  }

  if (value instanceof Error) {
    // A real `Error` is kept so the logger still formats it as one; only its
    // text is rewritten.
    const clone = new Error(redactSensitiveText(value.message));
    seen.set(value, clone);
    clone.name = value.name;
    clone.stack =
      typeof value.stack === 'string'
        ? redactSensitiveText(value.stack)
        : value.stack;

    for (const key of Object.keys(value)) {
      (clone as unknown as Record<string, unknown>)[key] = walk(
        (value as unknown as Record<string, unknown>)[key],
        seen,
        depth + 1
      );
    }

    const cause = (value as { cause?: unknown }).cause;
    if (cause !== undefined) {
      (clone as { cause?: unknown }).cause = walk(cause, seen, depth + 1);
    }

    return clone;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const key of Object.keys(value)) {
    clone[key] = walk((value as Record<string, unknown>)[key], seen, depth + 1);
  }
  return clone;
};

/**
 * Returns a copy of `value` with every credential-shaped substring replaced.
 * Safe to call on anything: an `Error`, a response body, a string,
 * `undefined`. The original is never modified, so a caller that also handles
 * the error keeps the real one.
 */
export const redactSensitive = (value: unknown) =>
  walk(value, new WeakMap<object, unknown>(), 0);
