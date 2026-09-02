const logCalls = [];

let timerCallCount = 0;
let stopAfterCalls = 0;
let activeService;

/**
 * `pollLoop` is a tight `while (this.running)` around `await`s that resolve
 * immediately in this harness, so it never yields to a macrotask on its own —
 * a real `setTimeout`-backed `timer` would let a test stop it from outside
 * between turns, but the retry delay is mocked away everywhere else in this
 * suite precisely so tests do not wait on it. Here the mock itself is what
 * ends the loop: once it has been awaited `stopAfterCalls` times, it flips
 * `running` off before resolving, so the loop's own next `while` check stops
 * it — no timer, no `setImmediate` race, no chance of it spinning forever.
 */
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { TelegramUpdatesService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        error(...args) {
          logCalls.push(['error', ...args]);
        }
        warn(...args) {
          logCalls.push(['warn', ...args]);
        }
        log(...args) {
          logCalls.push(['log', ...args]);
        }
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/helpers/utils/timer': {
      timer: async () => {
        timerCallCount += 1;
        if (activeService && timerCallCount >= stopAfterCalls) {
          activeService.running = false;
        }
      },
    },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'consumer-a',
    },
    '@contentfactory/nestjs-libraries/services/redact.sensitive': {
      redactSensitive: (value) => value,
    },
    'node-telegram-bot-api': { __esModule: true, default: class {} },
  },
  {
    sources: {
      '@contentfactory/nestjs-libraries/integrations/telegram.update.parser':
        'libraries/nestjs-libraries/src/integrations/telegram.update.parser.ts',
      '@contentfactory/nestjs-libraries/integrations/telegram-admin-bind':
        'libraries/nestjs-libraries/src/integrations/telegram-admin-bind.ts',
      '@contentfactory/nestjs-libraries/locale/backend-strings':
        'libraries/nestjs-libraries/src/locale/backend-strings.ts',
    },
  }
);

/**
 * Shaped exactly like the error `node-telegram-bot-api` throws for Telegram's
 * "terminated by other getUpdates request" reply — see
 * `tests/telegram.log.redaction.test.cjs`, which owns the redaction half of
 * this same shape.
 */
const telegramConflictError = () => {
  const error = new Error(
    'ETELEGRAM: 409 Conflict at https://api.telegram.org/botTOKEN/getUpdates'
  );
  error.code = 'ETELEGRAM';
  error.response = { statusCode: 409 };
  return error;
};

const genericTelegramError = () => {
  const error = new Error('ETELEGRAM: 500 Internal Server Error');
  error.code = 'ETELEGRAM';
  error.response = { statusCode: 500 };
  return error;
};

/**
 * A prisma stub whose lease acquisition throws whatever the turn is meant to
 * surface, so it is `pollLoop`'s own catch under test here — not
 * `pollOnce`'s internal retry handling, which has its own coverage in
 * `telegram.update.consumer.test.cjs`.
 */
const createFailingPrisma = (error) => ({
  telegramUpdateConsumerLease: {
    upsert: async () => {
      throw error;
    },
  },
});

const createService = (error) => new TelegramUpdatesService(createFailingPrisma(error));

describe('A Telegram getUpdates conflict is loud, not swallowed', () => {
  beforeEach(() => {
    logCalls.length = 0;
    timerCallCount = 0;
  });

  test('a run of conflicting turns logs one explanatory, loud error — not one per turn', async () => {
    stopAfterCalls = 3;
    const service = createService(telegramConflictError());
    activeService = service;
    service.running = true;

    await service.pollLoop();

    const errorCalls = logCalls.filter(([level]) => level === 'error');
    const conflictCalls = errorCalls.filter(
      ([, message]) =>
        typeof message === 'string' && message.includes('409 Conflict')
    );

    // Logged, and logged in a way that says what is broken and why — not a
    // bare error object nobody reading the log can act on.
    expect(conflictCalls.length).toBeGreaterThan(0);
    expect(conflictCalls[0][1]).toMatch(/another consumer/i);
    expect(conflictCalls[0][1]).toMatch(/approval-queue notification/i);

    // Three failed turns happened (three calls to the mocked timer), and
    // still only one loud line — a paragraph on every retry for a stuck
    // outage is exactly the kind of noise a real conflict gets lost inside.
    expect(timerCallCount).toBe(3);
    expect(conflictCalls.length).toBe(1);
  });

  test('a non-conflict Telegram failure still logs the generic message, unchanged', async () => {
    stopAfterCalls = 2;
    const service = createService(genericTelegramError());
    activeService = service;
    service.running = true;

    await service.pollLoop();

    const errorCalls = logCalls.filter(([level]) => level === 'error');
    expect(
      errorCalls.some(
        ([, message]) => message === 'Telegram update polling failed'
      )
    ).toBe(true);
    expect(
      errorCalls.some(
        ([, message]) =>
          typeof message === 'string' && message.includes('409 Conflict')
      )
    ).toBe(false);
  });
});
