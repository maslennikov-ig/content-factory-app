'use strict';

/**
 * `content-factory-next-5w6u`: the doors that spend a workspace's model budget
 * have a ceiling.
 *
 * They had accounting and no limit. `AiUsageService` writes a ledger row for
 * every call, which says afterwards what was spent — and the bill has already
 * happened by then. `content-factory-next-ni7x` put an allowance on the
 * subscription tiers, which answers «how much in a month» and nothing at all
 * about how fast: a loop against `/copilot/agent` empties a month in an hour
 * and the first thing to notice is the invoice.
 *
 * Three properties are worth holding, and they pull against each other:
 *
 *  - a runaway caller is stopped;
 *  - one workspace's runaway caller does not stop another workspace;
 *  - a person writing with the assistant never meets the ceiling, which is why
 *    it is set loose and why the reads the screen polls are outside it. A limit
 *    that interrupts ordinary work is removed within a week, and then there is
 *    no limit again.
 */

const { Reflector } = require('@nestjs/core');
const { Logger, HttpException } = require('@nestjs/common');
const { ThrottlerStorageService } = require('@nestjs/throttler');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { ThrottlerBehindProxyGuard } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/throttler/throttler.provider.ts',
  {},
  {
    sources: {
      './transient-client-tracker':
        'libraries/nestjs-libraries/src/throttler/transient-client-tracker.ts',
      '@contentfactory/nestjs-libraries/locale/backend-strings':
        'libraries/nestjs-libraries/src/locale/backend-strings.ts',
    },
  }
);

const { translateBackendText } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/locale/backend-strings.ts'
);

// One handler identity per route: `generateKey` mixes the handler name into
// the storage key, so two routes must not share a budget by accident and one
// route must reuse its own across calls.
const handlers = new Map();
const handlerFor = (path) => {
  if (!handlers.has(path)) {
    const name = path.replace(/[^a-z]+/gi, '_');
    handlers.set(path, { [name]: function () {} }[name]);
  }
  return handlers.get(path);
};

const requestContext = (
  url,
  { org = 'workspace-1', method = 'POST', language } = {}
) => {
  const request = {
    method,
    url,
    path: url.split('?', 1)[0],
    headers: { 'x-forwarded-for': '198.51.100.24' },
    ip: '172.18.0.2',
    socket: { remoteAddress: '172.18.0.2' },
    ...(org ? { org: { id: org } } : {}),
    ...(language ? { user: { language } } : {}),
  };
  const controller = class AiController {};

  return {
    getClass: () => controller,
    getHandler: () => handlerFor(`${method} ${url}`),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ header: jest.fn() }),
    }),
  };
};

const storages = [];

const createGuard = async () => {
  const storage = new ThrottlerStorageService();
  storages.push(storage);
  const guard = new ThrottlerBehindProxyGuard(
    { throttlers: [{ ttl: 3_600_000, limit: 90 }] },
    storage,
    new Reflector()
  );
  await guard.onModuleInit();
  return guard;
};

const SEARCH = '/content-intelligence/sources/search';
const LIMIT = 60;

describe('the doors that spend a model budget have a ceiling', () => {
  let warning;

  beforeEach(() => {
    warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warning.mockRestore();
    // The in-memory storage keeps an interval alive; without this Jest hangs
    // for a second at the end of the run and says so.
    while (storages.length) storages.pop().onApplicationShutdown();
  });

  test.each([
    ['content source search', SEARCH],
    ['the assistant chat', '/copilot/chat'],
    ['an assistant agent run', '/copilot/agent'],
    ['assistant web research', '/copilot/research'],
    ['reading a source into a material', '/content-intelligence/sources/src-1/sync'],
    ['drafting from a source', '/content-intelligence/sources/src-1/draft-material'],
  ])('%s is refused past the ceiling', async (_label, url) => {
    const guard = await createGuard();

    for (let i = 0; i < LIMIT; i += 1) {
      await expect(guard.canActivate(requestContext(url))).resolves.toBe(true);
    }

    await expect(guard.canActivate(requestContext(url))).rejects.toBeInstanceOf(
      HttpException
    );
  });

  test('the refusal carries a code and a sentence in the caller’s language', async () => {
    const guard = await createGuard();

    for (let i = 0; i < LIMIT; i += 1) {
      await guard.canActivate(requestContext(SEARCH, { language: 'ru' }));
    }

    const refused = await guard
      .canActivate(requestContext(SEARCH, { language: 'ru' }))
      .then(
        () => null,
        (error) => error
      );

    expect(refused).toBeInstanceOf(HttpException);
    expect(refused.getStatus()).toBe(429);
    expect(refused.getResponse()).toEqual({
      code: 'ai_rate_limited',
      message: translateBackendText('ai_rate_limited', 'ru'),
    });
    // Not the English one: the sentence is for the person waiting.
    expect(refused.getResponse().message).not.toBe(
      translateBackendText('ai_rate_limited', 'en')
    );
  });

  test('a language the deployment does not ship falls back rather than throwing', async () => {
    const guard = await createGuard();

    for (let i = 0; i < LIMIT; i += 1) {
      await guard.canActivate(requestContext(SEARCH, { language: 'xx-nope' }));
    }

    const refused = await guard
      .canActivate(requestContext(SEARCH, { language: 'xx-nope' }))
      .then(
        () => null,
        (error) => error
      );

    expect(refused.getResponse().message).toBe(
      translateBackendText('ai_rate_limited', 'en')
    );
  });

  test('one workspace burning its ceiling leaves the next workspace alone', async () => {
    const guard = await createGuard();

    for (let i = 0; i < LIMIT; i += 1) {
      await guard.canActivate(requestContext(SEARCH, { org: 'workspace-1' }));
    }
    await expect(
      guard.canActivate(requestContext(SEARCH, { org: 'workspace-1' }))
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      guard.canActivate(requestContext(SEARCH, { org: 'workspace-2' }))
    ).resolves.toBe(true);
  });

  test('one exhausted door does not close the others', async () => {
    const guard = await createGuard();

    for (let i = 0; i < LIMIT; i += 1) {
      await guard.canActivate(requestContext('/copilot/chat'));
    }
    await expect(
      guard.canActivate(requestContext('/copilot/chat'))
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      guard.canActivate(requestContext(SEARCH))
    ).resolves.toBe(true);
  });

  test('the reads the screen polls are outside the ceiling', async () => {
    const guard = await createGuard();

    // Far past the limit, and none of it counts: `credits` and `list` read
    // what is already there, and a page that polls them is not spending
    // anything. Throttling a poll breaks a screen and protects nothing.
    for (let i = 0; i < LIMIT + 5; i += 1) {
      await expect(
        guard.canActivate(requestContext('/copilot/credits', { method: 'GET' }))
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(requestContext('/copilot/list', { method: 'GET' }))
      ).resolves.toBe(true);
    }
  });

  test('everything else still passes untouched', async () => {
    const guard = await createGuard();

    for (let i = 0; i < LIMIT + 5; i += 1) {
      await expect(
        guard.canActivate(requestContext('/posts', { method: 'POST' }))
      ).resolves.toBe(true);
    }
  });
});
