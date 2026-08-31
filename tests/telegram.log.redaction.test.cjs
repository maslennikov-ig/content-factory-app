const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const modulePath =
  'libraries/nestjs-libraries/src/services/redact.sensitive.ts';

const telegramLoggingFiles = [
  'libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts',
  'libraries/nestjs-libraries/src/integrations/social/telegram.provider.ts',
];

/**
 * Shaped like a real bot token — `<bot id>:<35 opaque characters>` — but not
 * one that was ever issued.
 */
const sampleToken = '8886813440:AAExampleTokenValueForTestsOnly0000000';

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

/**
 * `node-telegram-bot-api` attaches the request it made to the error it throws,
 * so the token appears in the message, in `response.request.href`, and in the
 * options object underneath it.
 */
const telegramApiError = () => {
  const error = new Error(
    `ETELEGRAM: 409 Conflict at https://api.telegram.org/bot${sampleToken}/getUpdates`
  );
  error.name = 'TelegramError';
  error.code = 'ETELEGRAM';
  error.response = {
    statusCode: 409,
    request: {
      href: `https://api.telegram.org/bot${sampleToken}/getUpdates`,
      options: {
        url: `https://api.telegram.org/bot${sampleToken}/getUpdates`,
        headers: { authorization: `Bearer ${sampleToken}` },
      },
    },
    body: { ok: false, description: 'Conflict: terminated by other getUpdates' },
  };
  return error;
};

const containsToken = (value) => {
  const seen = new WeakSet();
  const search = (candidate) => {
    if (typeof candidate === 'string') {
      return candidate.includes(sampleToken);
    }
    if (candidate === null || typeof candidate !== 'object') {
      return false;
    }
    if (seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    if (candidate instanceof Error) {
      if (search(candidate.message) || search(candidate.stack)) {
        return true;
      }
    }
    return Object.keys(candidate).some((key) => search(candidate[key]));
  };
  return search(value);
};

describe('Telegram credentials never reach a log', () => {
  let redactSensitive;
  let redactSensitiveText;
  let redactionPlaceholder;

  beforeAll(() => {
    ({ redactSensitive, redactSensitiveText, redactionPlaceholder } =
      loadTypeScriptModule(modulePath));
  });

  it('removes the token from every field of a real Telegram error', () => {
    const redacted = redactSensitive(telegramApiError());

    expect(containsToken(redacted)).toBe(false);
    // The part of the URL worth reading in a log survives.
    expect(redacted.message).toContain('api.telegram.org/bot');
    expect(redacted.message).toContain(redactionPlaceholder);
    expect(redacted.response.request.href).toBe(
      `https://api.telegram.org/bot${redactionPlaceholder}/getUpdates`
    );
    expect(redacted.response.request.options.headers.authorization).toBe(
      `Bearer ${redactionPlaceholder}`
    );
    // Diagnosis still works: status, code and body are untouched.
    expect(redacted.code).toBe('ETELEGRAM');
    expect(redacted.response.statusCode).toBe(409);
    expect(redacted.response.body.description).toContain('Conflict');
  });

  it('keeps the error an Error and leaves the original untouched', () => {
    const original = telegramApiError();
    const redacted = redactSensitive(original);

    expect(redacted).toBeInstanceOf(Error);
    expect(redacted.name).toBe('TelegramError');
    expect(typeof redacted.stack).toBe('string');
    // The caller that also handles the error still has the real one.
    expect(original.response.request.href).toContain(sampleToken);
  });

  it('redacts a configured value that matches no pattern', () => {
    const previous = process.env.TELEGRAM_CLIENT_SECRET;
    process.env.TELEGRAM_CLIENT_SECRET = 'opaque-client-value-54-characters';
    try {
      const redacted = redactSensitiveText(
        'login failed for opaque-client-value-54-characters'
      );
      expect(redacted).not.toContain('opaque-client-value-54-characters');
      expect(redacted).toContain(redactionPlaceholder);
    } finally {
      if (previous === undefined) {
        delete process.env.TELEGRAM_CLIENT_SECRET;
      } else {
        process.env.TELEGRAM_CLIENT_SECRET = previous;
      }
    }
  });

  it('survives what a failure path can actually be handed', () => {
    expect(redactSensitive(undefined)).toBeUndefined();
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive('plain text')).toBe('plain text');

    // A cycle must not hang the poll loop.
    const cyclic = { href: `https://api.telegram.org/bot${sampleToken}/x` };
    cyclic.self = cyclic;
    const redactedCycle = redactSensitive(cyclic);
    expect(containsToken(redactedCycle.href)).toBe(false);
    expect(redactedCycle.self).toBe(redactedCycle);

    // Depth is bounded rather than unbounded recursion.
    let deep = { token: sampleToken };
    for (let level = 0; level < 40; level += 1) {
      deep = { nested: deep };
    }
    expect(containsToken(redactSensitive(deep))).toBe(false);
  });

  it('leaves ordinary text alone', () => {
    // A short numeric pair is a timestamp or a ratio, not a credential.
    expect(redactSensitiveText('processed 12:30 in 5:1 ratio')).toBe(
      'processed 12:30 in 5:1 ratio'
    );
    expect(redactSensitiveText('chat 123456 message 78')).toBe(
      'chat 123456 message 78'
    );
  });

  /**
   * The guard that keeps this fixed. A new `logger.error(..., error)` in a
   * Telegram file is exactly how the leak came back once already.
   */
  it('passes every logged Telegram error through the redactor', () => {
    const offenders = [];

    for (const relativePath of telegramLoggingFiles) {
      const source = readRepositoryFile(relativePath);
      source.split('\n').forEach((line, index) => {
        const match = line.match(
          /(?:logger\.(?:error|warn|log|debug|verbose)|console\.(?:error|warn|log))\(/
        );
        if (!match) {
          return;
        }
        // The call may span several lines; read to its closing parenthesis.
        const lines = source.split('\n');
        const call = lines.slice(index, index + 8).join('\n');
        const passesBareError = /,\s*(?:\w*[Ee]rror|err)\s*[,)]/.test(call);
        if (passesBareError) {
          offenders.push(`${relativePath}:${index + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('has no Telegram log call left unredacted in either file', () => {
    // Counterpart to the guard above: prove the redactor is actually present,
    // so the guard cannot pass because the calls disappeared.
    const uses = telegramLoggingFiles.map(
      (relativePath) =>
        (readRepositoryFile(relativePath).match(/redactSensitive\(/g) || [])
          .length
    );
    expect(uses.every((count) => count > 0)).toBe(true);
    expect(uses.reduce((total, count) => total + count, 0)).toBeGreaterThan(5);
  });
});
