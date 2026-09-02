const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const parser = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/telegram.update.parser.ts'
);

class TelegramBot {}

const { TelegramUpdatesService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        error() {}
        warn() {}
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/telegram.update.parser': parser,
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
    // Covered by `telegram.log.redaction.test.cjs`; identity here keeps these
    // assertions about the connect flow.
    '@contentfactory/nestjs-libraries/services/redact.sensitive': {
      redactSensitive: (value) => value,
    },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'consumer-a',
    },
    '@contentfactory/nestjs-libraries/integrations/telegram-admin-bind': {
      adminBindDeclineMessage: () => 'Command not recognized.',
      adminBindSuccessMessage: () => 'Done.',
      pendingApprovalNotification: () => 'A new account is waiting.',
    },
    '@contentfactory/nestjs-libraries/locale/backend-strings': {
      resolveBackendLocale: () => 'en',
    },
    'node-telegram-bot-api': { __esModule: true, default: TelegramBot },
  }
);

const { TelegramUpdatesDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/integrations/telegram.updates.dto.ts'
);
const { validateSync } = require('class-validator');
const { plainToInstance } = require('class-transformer');

/**
 * Prisma treats `undefined` in a `where` clause as "this condition was not
 * given" and drops the filter, which is the whole point of the first scenario:
 * a fake that answered `undefined` with "no row" would hide the defect.
 */
const matchesWhere = (row, where) =>
  Object.entries(where || {}).every(([field, condition]) => {
    if (condition === undefined) return true;
    if (condition === null) return row[field] === null;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      return Object.entries(condition).every(([operator, value]) => {
        const current = row[field];
        if (operator === 'gte') return current >= value;
        if (operator === 'lt') return current < value;
        if (operator === 'lte') return current <= value;
        if (operator === 'gt') return current > value;
        throw new Error(`Unsupported operator ${operator}`);
      });
    }
    return row[field] === condition;
  });

const createPrisma = (rows) => {
  const store = rows.map((row) => ({
    connectConsumedAt: null,
    ...row,
  }));
  const transaction = {
    telegramUpdateReceipt: {
      findFirst: jest.fn(async ({ where }) => {
        const [first] = store
          .filter((row) => matchesWhere(row, where))
          .sort((left, right) => left.updateId - right.updateId);
        return first ? { ...first } : null;
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

  return {
    store,
    transaction,
    prisma: { $transaction: (callback) => callback(transaction) },
  };
};

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000);

describe('Telegram connect claim isolation', () => {
  test('a request without a word claims nothing', async () => {
    const { prisma, store } = createPrisma([
      {
        updateId: 1,
        connectWord: 'victimword',
        connectChatId: '-1001',
        connectMessageId: '10',
        createdAt: minutesAgo(1),
      },
    ]);
    const service = new TelegramUpdatesService(prisma);

    await expect(service.getConnection(undefined)).resolves.toEqual({});
    expect(store[0].connectConsumedAt).toBeNull();
  });

  test('an abandoned receipt outside the freshness window is not handed out', async () => {
    const { prisma, store } = createPrisma([
      {
        updateId: 1,
        connectWord: 'staleword',
        connectChatId: '-1001',
        connectMessageId: '10',
        createdAt: minutesAgo(60),
      },
    ]);
    const service = new TelegramUpdatesService(prisma);

    await expect(service.getConnection('staleword')).resolves.toEqual({});
    expect(store[0].connectConsumedAt).toBeNull();
  });

  test('a fresh receipt is handed out exactly once', async () => {
    const { prisma, store } = createPrisma([
      {
        updateId: 7,
        connectWord: 'freshword',
        connectChatId: '-1001234',
        connectMessageId: '10',
        createdAt: minutesAgo(1),
      },
    ]);
    const service = new TelegramUpdatesService(prisma);

    await expect(service.getConnection('freshword')).resolves.toEqual({
      chatId: -1001234,
    });
    expect(store[0].connectConsumedAt).toBeInstanceOf(Date);

    await expect(service.getConnection('freshword')).resolves.toEqual({});
  });

  test('the query contract rejects a missing or malformed word', () => {
    const missing = validateSync(plainToInstance(TelegramUpdatesDto, {}));
    expect(missing).toHaveLength(1);

    const malformed = validateSync(
      plainToInstance(TelegramUpdatesDto, { word: 'no spaces allowed' })
    );
    expect(malformed).toHaveLength(1);

    expect(
      validateSync(plainToInstance(TelegramUpdatesDto, { word: 'abcd' }))
    ).toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(TelegramUpdatesDto, { word: 'a'.repeat(64) })
      )
    ).toHaveLength(0);
  });
});
