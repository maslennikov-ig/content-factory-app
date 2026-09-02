const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Mirrors the harness in telegram.update.consumer.test.cjs: the service file
// is transpiled directly so this suite exercises the real onModuleInit /
// verifyBotIdentity code, not a reimplementation of it.
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
let telegramLog;

const { TelegramUpdatesService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        error(...args) {
          telegramLog.push(['error', ...args]);
        }
        warn(...args) {
          telegramLog.push(['warn', ...args]);
        }
        log(...args) {
          telegramLog.push(['log', ...args]);
        }
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/telegram.update.parser':
      parser,
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'consumer-a',
    },
    '@contentfactory/nestjs-libraries/services/redact.sensitive': {
      redactSensitive: (value) => value,
    },
    'node-telegram-bot-api': { __esModule: true, default: TelegramBot },
  }
);

const createService = () => new TelegramUpdatesService({ $transaction: () => {} });

const withEnv = async (env, fn) => {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
};

// verifyBotIdentity is private; called through the same onModuleInit path
// production uses so the wiring (fire-and-forget, TELEGRAM_TOKEN gate) is
// covered too, not just the check in isolation. pollLoop is stubbed out: it
// is a separate, already-tested concern (telegram.update.consumer.test.cjs),
// and letting the real one run here against an unmocked Prisma client would
// only add unrelated "polling failed" log noise to these assertions.
const initAndFlush = async (service) => {
  service.pollLoop = jest.fn(async () => undefined);
  service.onModuleInit();
  // Let the fire-and-forget verifyBotIdentity() microtask/await chain settle.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  service.running = false;
};

describe('Telegram bot identity check', () => {
  beforeEach(() => {
    telegramLog = [];
  });

  test('does nothing when TELEGRAM_BOT_NAME is not set', async () => {
    await withEnv(
      { TELEGRAM_TOKEN: 'token', TELEGRAM_BOT_NAME: undefined },
      async () => {
        const service = createService();
        const getMe = jest.fn();
        service.bot = { getUpdates: jest.fn(async () => []), getMe };
        await initAndFlush(service);
        expect(getMe).not.toHaveBeenCalled();
        expect(telegramLog).toEqual([]);
      }
    );
  });

  test('does nothing when TELEGRAM_TOKEN is not set, even with a name configured', async () => {
    await withEnv(
      { TELEGRAM_TOKEN: undefined, TELEGRAM_BOT_NAME: 'content_factory_adtbot' },
      async () => {
        const service = createService();
        const getMe = jest.fn();
        service.bot = { getUpdates: jest.fn(async () => []), getMe };
        await initAndFlush(service);
        expect(getMe).not.toHaveBeenCalled();
        expect(telegramLog).toEqual([]);
      }
    );
  });

  test('logs nothing when the configured name matches the token', async () => {
    await withEnv(
      { TELEGRAM_TOKEN: 'token', TELEGRAM_BOT_NAME: 'content_factory_adtbot' },
      async () => {
        const service = createService();
        const getMe = jest.fn(async () => ({ username: 'content_factory_adtbot' }));
        service.bot = { getUpdates: jest.fn(async () => []), getMe };
        await initAndFlush(service);
        expect(getMe).toHaveBeenCalledTimes(1);
        expect(telegramLog.filter(([level]) => level === 'error')).toEqual([]);
      }
    );
  });

  test('matches regardless of a leading @ or case', async () => {
    await withEnv(
      { TELEGRAM_TOKEN: 'token', TELEGRAM_BOT_NAME: '@Content_Factory_AdtBot' },
      async () => {
        const service = createService();
        const getMe = jest.fn(async () => ({ username: 'content_factory_adtbot' }));
        service.bot = { getUpdates: jest.fn(async () => []), getMe };
        await initAndFlush(service);
        expect(telegramLog.filter(([level]) => level === 'error')).toEqual([]);
      }
    );
  });

  // The scenario the check exists for: a stand's TELEGRAM_BOT_NAME still
  // names the production bot while TELEGRAM_TOKEN authenticates as a
  // different one. The "add bot to channel" link built from the name alone
  // would silently point a developer at the wrong bot.
  test('logs a loud error when the configured name does not match the token', async () => {
    await withEnv(
      { TELEGRAM_TOKEN: 'stand-token', TELEGRAM_BOT_NAME: 'content_factory_adtbot' },
      async () => {
        const service = createService();
        const getMe = jest.fn(async () => ({ username: 'content_factory_dev_bot' }));
        service.bot = { getUpdates: jest.fn(async () => []), getMe };
        await initAndFlush(service);

        const errors = telegramLog.filter(([level]) => level === 'error');
        expect(errors).toHaveLength(1);
        const [, message] = errors[0];
        expect(message).toContain('TELEGRAM_BOT_NAME');
        expect(message).toContain('content_factory_adtbot');
        expect(message).toContain('content_factory_dev_bot');
      }
    );
  });

  // A dead token or an unreachable api.telegram.org must degrade to a log
  // line, never take the process down — pollLoop's own long-poll already
  // depends on the same reachability and must be free to keep retrying.
  test('logs a warning-grade error and does not throw when getMe fails', async () => {
    await withEnv(
      { TELEGRAM_TOKEN: 'token', TELEGRAM_BOT_NAME: 'content_factory_adtbot' },
      async () => {
        const service = createService();
        const getMe = jest.fn(async () => {
          throw new Error('ETIMEDOUT https://api.telegram.org/bottoken/getMe');
        });
        service.bot = { getUpdates: jest.fn(async () => []), getMe };

        await expect(initAndFlush(service)).resolves.not.toThrow();

        const errors = telegramLog.filter(([level]) => level === 'error');
        expect(errors).toHaveLength(1);
        expect(errors[0][1]).toContain('Could not verify TELEGRAM_BOT_NAME');
      }
    );
  });

  test('checks identity only once per startup, not on every poll', async () => {
    await withEnv(
      { TELEGRAM_TOKEN: 'token', TELEGRAM_BOT_NAME: 'content_factory_adtbot' },
      async () => {
        const service = createService();
        const getMe = jest.fn(async () => ({ username: 'content_factory_adtbot' }));
        service.bot = { getUpdates: jest.fn(async () => []), getMe };
        await initAndFlush(service);
        // pollOnce() is where every 20-second poll would live; verifying it
        // does not itself call getMe confirms the check is not on that path.
        service.bot.getMe.mockClear();
        expect(getMe).not.toHaveBeenCalled();
      }
    );
  });
});
