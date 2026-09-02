const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * Loads the real service together with the real parser and the real message
 * copy, so this test is exercising the actual binding logic — not a stand-in
 * that only proves the two sides call each other.
 */
const { TelegramUpdatesService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        error() {}
        warn() {}
        log() {}
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'consumer-a',
    },
    // Redaction has its own suite in `telegram.log.redaction.test.cjs`.
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

const minutesFromNow = (minutes) =>
  new Date(Date.now() + minutes * 60_000);

/**
 * Applies a Prisma-shaped `where` against one row generically — including
 * `gt`/`lt` on a field — rather than re-deriving "is this code fresh" with
 * its own hardcoded rule. A mock that enforces freshness on its own would
 * stay green even if the production `where` clause stopped asking for it;
 * this one only matches what the code under test actually requested. Same
 * discipline as the `matchesWhere` helper in
 * `telegram.connect.security.test.cjs`.
 */
const matchesWhere = (row, where) =>
  Object.entries(where || {}).every(([field, condition]) => {
    if (condition === undefined) return true;
    if (condition === null) return row[field] == null;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      return Object.entries(condition).every(([operator, value]) => {
        const current = row[field];
        if (operator === 'gt') return current != null && current > value;
        if (operator === 'gte') return current != null && current >= value;
        if (operator === 'lt') return current != null && current < value;
        if (operator === 'lte') return current != null && current <= value;
        throw new Error(`Unsupported operator ${operator}`);
      });
    }
    return row[field] === condition;
  });

/**
 * A minimal `transaction.user` in-memory table. `updateMany`'s `where`
 * re-checks the code so a claim only lands if it is still the code on the
 * row at that moment — the same guard against a race the real Prisma call
 * relies on.
 */
const createUserTransaction = (users) => {
  const store = users.map((user) => ({ ...user }));
  return {
    store,
    user: {
      findFirst: jest.fn(async ({ where }) => {
        const match = store.find((row) => matchesWhere(row, where));
        return match ? { ...match } : null;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const targets = store.filter((row) => matchesWhere(row, where));
        for (const target of targets) {
          Object.assign(target, data);
        }
        return { count: targets.length };
      }),
    },
  };
};

const createService = () => new TelegramUpdatesService({});

describe('Admin Telegram binding is one-time and short-lived', () => {
  test('an unknown code is declined and nothing is bound', async () => {
    const transaction = createUserTransaction([
      {
        id: 'admin-1',
        language: 'en',
        telegramBindingCode: 'realcode',
        telegramBindingCodeExpiresAt: minutesFromNow(10),
      },
    ]);
    const service = createService();

    const effect = await service.applyAction(transaction, 1, {
      kind: 'admin-bind',
      code: 'guessed-code',
      chatId: '999',
      messageId: '1',
    });

    expect(effect).toEqual({
      kind: 'send-message',
      chatId: '999',
      message: 'Command not recognized.',
    });
    expect(transaction.store[0].telegramChatId).toBeUndefined();
    // No hint that a code system exists at all for the wrong guess.
    expect(effect.message.toLowerCase()).not.toMatch(/code|expired/);
  });

  test('an expired code is declined even though it is otherwise correct', async () => {
    const transaction = createUserTransaction([
      {
        id: 'admin-1',
        language: 'en',
        telegramBindingCode: 'stale-code',
        telegramBindingCodeExpiresAt: new Date(Date.now() - 60_000),
      },
    ]);
    const service = createService();

    const effect = await service.applyAction(transaction, 2, {
      kind: 'admin-bind',
      code: 'stale-code',
      chatId: '999',
      messageId: '1',
    });

    expect(effect.message).toBe('Command not recognized.');
    expect(transaction.store[0].telegramChatId).toBeUndefined();
    expect(transaction.store[0].telegramBindingCode).toBe('stale-code');
  });

  test('a fresh valid code binds the chat exactly once, in the account language', async () => {
    const transaction = createUserTransaction([
      {
        id: 'admin-1',
        language: 'ru',
        telegramBindingCode: 'fresh-code',
        telegramBindingCodeExpiresAt: minutesFromNow(10),
      },
    ]);
    const service = createService();

    const firstAttempt = await service.applyAction(transaction, 3, {
      kind: 'admin-bind',
      code: 'fresh-code',
      chatId: '555',
      messageId: '1',
    });

    expect(firstAttempt).toEqual({
      kind: 'send-message',
      chatId: '555',
      message:
        'Готово. Уведомления об очереди на одобрение будут приходить в этот чат.',
    });
    expect(transaction.store[0].telegramChatId).toBe('555');
    expect(transaction.store[0].telegramBindingCode).toBeNull();
    expect(transaction.store[0].telegramBindingCodeExpiresAt).toBeNull();

    // The code is already cleared — a second /start with the same code (a
    // replay, or the person tapping the link twice) must not be honoured
    // again and must not overwrite the binding with a different chat.
    const secondAttempt = await service.applyAction(transaction, 4, {
      kind: 'admin-bind',
      code: 'fresh-code',
      chatId: '666',
      messageId: '2',
    });

    // The code no longer matches any row, so this is now an "unknown code"
    // decline — in the fallback locale, since no account can be identified
    // from a code that does not match.
    expect(secondAttempt.message).toBe('Command not recognized.');
    expect(transaction.store[0].telegramChatId).toBe('555');
  });

  test('a decline never says the word "code" — nothing hints the system exists', async () => {
    const transaction = createUserTransaction([]);
    const service = createService();

    const effect = await service.applyAction(transaction, 5, {
      kind: 'admin-bind',
      code: 'anything-at-all',
      chatId: '1',
      messageId: '1',
    });

    expect(effect.message).not.toMatch(/code/i);
    expect(effect.message).not.toMatch(/expired/i);
  });
});
