require('reflect-metadata');

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * A missing or renamed module is a failure, never a skip.
 *
 * This file used to answer `{}` for a path that does not exist and every
 * consumer fell back to a hand-written stand-in, so the suite stayed green
 * while the real module was gone. The loader now throws, and nothing below
 * substitutes a stub for a shipped class.
 */
function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  if (!fs.existsSync(filename)) {
    throw new Error(`Module under test is missing: ${relativePath}`);
  }
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
  const evaluate = new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  );
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  evaluate(
    loaded.exports,
    localRequire,
    loaded,
    filename,
    path.dirname(filename)
  );
  return loaded.exports;
}

const dtoModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/product-events/product-event.dto.ts'
);
const { validateProductEventProperties } = dtoModule;

const repositoryModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/product-events/product-events.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
    },
    '@contentfactory/nestjs-libraries/dtos/product-events/product-event.dto':
      dtoModule,
  }
);
const {
  ProductEventsRepository,
  CLIENT_DAILY_ORGANIZATION_QUOTA,
  PRODUCT_EVENT_RETENTION_DAYS,
} = repositoryModule;

const serviceModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/product-events/product-events.service.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.repository':
      repositoryModule,
    '@contentfactory/nestjs-libraries/dtos/product-events/product-event.dto':
      dtoModule,
  }
);
const { ProductEventsService } = serviceModule;

const redisCalls = [];
const fakeRedis = {
  values: new Map(),
  async get(key) {
    return this.values.get(key) ?? null;
  },
  async set(...args) {
    redisCalls.push(args);
    this.values.set(args[0], args[1]);
    return 'OK';
  },
  async del(key) {
    this.values.delete(key);
    return 1;
  },
};

const transientClientTrackerModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/throttler/transient-client-tracker.ts'
);
const throttlerModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/throttler/throttler.provider.ts',
  {
    './transient-client-tracker': transientClientTrackerModule,
  }
);

const controllerModule = loadTypeScriptModule(
  'apps/backend/src/api/routes/product-events.controller.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service':
      {
        ProductEventsService,
      },
    '@contentfactory/nestjs-libraries/throttler/throttler.provider':
      throttlerModule,
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => () => undefined,
    },
  }
);
const { ProductEventsController } = controllerModule;

describe('product event privacy validation', () => {
  test('rejects a personal email key nested inside properties', () => {
    const result = validateProductEventProperties({
      campaign: { email: 'opaque-value' },
    });

    expect(result.valid).toBe(false);
  });

  test('rejects an email-looking value even under an opaque key', () => {
    expect(
      validateProductEventProperties({ source: 'person@example.com' }).valid
    ).toBe(false);
  });

  test.each([
    JSON.parse('{"__proto__":{"polluted":true}}'),
    { nested: { constructor: 'unsafe' } },
    { nested: { prototype: 'unsafe' } },
  ])('rejects dangerous prototype keys', (properties) => {
    expect(validateProductEventProperties(properties).valid).toBe(false);
  });

  test.each([
    { nested: { one: { two: { three: { four: { five: 'too deep' } } } } } },
    { items: Array.from({ length: 101 }, (_, index) => index) },
    Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`key${index}`, index])
    ),
    { text: 'x'.repeat(17 * 1024) },
  ])('rejects properties beyond the bounded JSON budget', (properties) => {
    expect(validateProductEventProperties(properties).valid).toBe(false);
  });

  test('accepts a small non-personal JSON object', () => {
    expect(
      validateProductEventProperties({
        source: 'onboarding',
        attempt: 1,
        flags: ['guided'],
      })
    ).toEqual({ valid: true });
  });

  test.each([
    'иван@почта.рф',
    'test@example.рф',
    'ИВАН@ПОЧТА.РФ',
    { nested: ['контакт: пётр@пример.рус'] },
  ])('rejects a Cyrillic email-looking value', (properties) => {
    const value =
      typeof properties === 'string' ? { source: properties } : properties;
    expect(validateProductEventProperties(value).valid).toBe(false);
  });

  test('still accepts ordinary Cyrillic text that is not an address', () => {
    expect(
      validateProductEventProperties({ source: 'первый канал', attempt: 2 })
    ).toEqual({ valid: true });
  });

  /**
   * The global `ValidationPipe({ whitelist: true })` strips an unknown key
   * before any route-level pipe sees it, so a DTO class here would turn a
   * forged `userId` into a silent trim instead of a 400. The envelope is
   * checked by hand in the service, and no DTO class may reappear claiming
   * otherwise.
   */
  test('ships no product event DTO class, only the checked primitives', () => {
    expect(Object.keys(dtoModule).sort()).toEqual([
      'PRODUCT_EVENT_NAMES',
      'validateProductEventProperties',
    ]);
  });
});

describe('authenticated product event receiver', () => {
  function createReceiver() {
    const writes = [];
    const service = new ProductEventsService({
      record: async (event) => {
        writes.push(event);
        return { recorded: true };
      },
    });
    return { controller: new ProductEventsController(service), writes };
  }

  test('uses only authenticated user and organization IDs', async () => {
    const { controller, writes } = createReceiver();

    const response = await controller.record(
      {
        body: {
          name: 'purchase',
          deduplicationKey: 'checkout-session-9',
          properties: { source: 'billing' },
        },
      },
      { id: 'trusted-user' },
      { id: 'trusted-org' }
    );

    expect(response).toEqual({ recorded: true });
    expect(writes).toEqual([
      {
        name: 'purchase',
        deduplicationKey: 'checkout-session-9',
        properties: { source: 'billing' },
        userId: 'trusted-user',
        organizationId: 'trusted-org',
      },
    ]);
  });

  test.each(['register', 'channel_added'])(
    'rejects server-owned %s before persistence',
    async (name) => {
      const { controller, writes } = createReceiver();

      await expect(
        controller.record(
          {
            body: { name, deduplicationKey: `forged:${name}` },
          },
          { id: 'trusted-user' },
          { id: 'trusted-org' }
        )
      ).rejects.toMatchObject({ status: 400 });
      expect(writes).toEqual([]);
    }
  );

  test.each(['purchase', 'lifetime_claimed'])(
    'accepts client-owned %s',
    async (name) => {
      const { controller, writes } = createReceiver();

      await expect(
        controller.record(
          {
            body: { name, deduplicationKey: `operation:${name}` },
          },
          { id: 'trusted-user' },
          { id: 'trusted-org' }
        )
      ).resolves.toEqual({ recorded: true });
      expect(writes).toHaveLength(1);
      expect(writes[0].name).toBe(name);
    }
  );

  test.each([
    ['null body', null],
    ['array body', []],
    [
      'unknown field',
      {
        name: 'purchase',
        deduplicationKey: 'operation:unknown',
        unexpected: true,
      },
    ],
    [
      'userId spoof',
      {
        name: 'purchase',
        deduplicationKey: 'operation:user',
        userId: 'spoofed-user',
      },
    ],
    [
      'organizationId spoof',
      {
        name: 'purchase',
        deduplicationKey: 'operation:organization',
        organizationId: 'spoofed-org',
      },
    ],
    [
      'createdAt spoof',
      {
        name: 'purchase',
        deduplicationKey: 'operation:time',
        createdAt: '2000-01-01T00:00:00.000Z',
      },
    ],
    [
      '__proto__ key',
      JSON.parse(
        '{"name":"purchase","deduplicationKey":"operation:proto","__proto__":{}}'
      ),
    ],
    [
      'prototype key',
      {
        name: 'purchase',
        deduplicationKey: 'operation:prototype',
        prototype: {},
      },
    ],
    [
      'constructor key',
      JSON.parse(
        '{"name":"purchase","deduplicationKey":"operation:constructor","constructor":{}}'
      ),
    ],
  ])('rejects malformed envelope: %s', async (_label, body) => {
    const { controller, writes } = createReceiver();

    await expect(
      controller.record({ body }, { id: 'trusted-user' }, { id: 'trusted-org' })
    ).rejects.toMatchObject({ status: 400 });
    expect(writes).toEqual([]);
  });

  test('rejects a dangerous raw JSON key before persistence', async () => {
    const { controller, writes } = createReceiver();

    await expect(
      controller.record(
        {
          body: {
            name: 'purchase',
            deduplicationKey: 'operation-2',
            properties: JSON.parse('{"nested":{"constructor":"unsafe"}}'),
          },
        },
        { id: 'trusted-user' },
        { id: 'trusted-org' }
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      controller.record(
        {
          body: {
            name: 'purchase',
            deduplicationKey: 42,
            properties: {},
          },
        },
        { id: 'trusted-user' },
        { id: 'trusted-org' }
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(writes).toEqual([]);
  });

  test('POST owns a route-specific Nest throttler guard and hourly limit', () => {
    const handler = ProductEventsController.prototype.record;
    const guards = Reflect.getMetadata('__guards__', handler) || [];

    expect(guards.map((guard) => guard.name)).toContain(
      'ThrottlerByOrganizationGuard'
    );
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(60);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(3600000);
  });

  /**
   * The deployment sits behind a shared Caddy and Express is not told to trust
   * it, so the default `req.ip` tracker is the proxy for every caller: one
   * client would spend the whole bucket for everybody.
   */
  test('the guard counts a request against its organization, not the proxy address', async () => {
    const guard = Object.create(
      throttlerModule.ThrottlerByOrganizationGuard.prototype
    );

    const first = await guard.getTracker({
      org: { id: 'org-a' },
      ip: '10.0.0.1',
      url: '/product-events',
    });
    const second = await guard.getTracker({
      org: { id: 'org-b' },
      ip: '10.0.0.1',
      url: '/product-events',
    });

    expect(first).not.toBe(second);
    expect(first).toContain('org-a');
    expect(first).not.toContain('10.0.0.1');
  });

  test('the shared proxy guard still separates public posts from the rest', async () => {
    const guard = Object.create(
      throttlerModule.ThrottlerBehindProxyGuard.prototype
    );

    expect(
      await guard.getTracker({ org: { id: 'org-a' }, url: '/public/v1/posts' })
    ).not.toBe(
      await guard.getTracker({ org: { id: 'org-a' }, url: '/product-events' })
    );
  });
});

describe('product event persistence and aggregation', () => {
  test('a tenant-scoped duplicate is a successful no-op', async () => {
    const repository = new ProductEventsRepository({
      model: {
        productEvent: {
          create: async () => Promise.reject({ code: 'P2002' }),
        },
      },
    });

    await expect(
      repository.record({
        name: 'purchase',
        deduplicationKey: 'same-operation',
        properties: {},
        organizationId: 'org-1',
        userId: 'user-1',
      })
    ).resolves.toEqual({ recorded: false });
  });

  /**
   * The client picks its own deduplication key, so tenant uniqueness stops a
   * repeat of one key and nothing else. Without a daily ceiling one signed-in
   * organization can keep inventing keys for as long as the throttler allows.
   */
  test('a client event over the daily organization quota is refused, a server event is not', async () => {
    const creates = [];
    const counts = [];
    const repository = new ProductEventsRepository({
      model: {
        productEvent: {
          count: async (query) => {
            counts.push(query);
            return CLIENT_DAILY_ORGANIZATION_QUOTA;
          },
          create: async (query) => creates.push(query),
        },
      },
    });
    const event = {
      name: 'purchase',
      deduplicationKey: 'operation-1',
      properties: {},
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const logged = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await expect(
      repository.record(event, { dailyQuota: CLIENT_DAILY_ORGANIZATION_QUOTA })
    ).resolves.toEqual({ recorded: false });
    expect(creates).toHaveLength(0);
    expect(counts[0].where.organizationId).toBe('org-1');
    expect(counts[0].where.createdAt.gte).toBeInstanceOf(Date);

    await expect(repository.record(event)).resolves.toEqual({ recorded: true });
    expect(creates).toHaveLength(1);
    expect(counts).toHaveLength(1);
    logged.mockRestore();
  });

  test('the authenticated receiver applies the quota, trusted server writes do not', async () => {
    const calls = [];
    const service = new ProductEventsService({
      record: async (event, options) => {
        calls.push(options);
        return { recorded: true };
      },
    });

    await service.recordAuthenticated(
      {
        name: 'purchase',
        properties: {},
        deduplicationKey: 'operation-1',
      },
      { userId: 'user-1', organizationId: 'org-1' }
    );
    await service.recordTrusted({
      name: 'channel_added',
      properties: {},
      deduplicationKey: 'channel_added:integration-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(calls).toEqual([
      { dailyQuota: CLIENT_DAILY_ORGANIZATION_QUOTA },
      undefined,
    ]);
  });

  test('retention deletes only rows older than the window', async () => {
    const deletes = [];
    const repository = new ProductEventsRepository({
      model: {
        productEvent: {
          deleteMany: async (query) => {
            deletes.push(query);
            return { count: 7 };
          },
        },
      },
    });

    const result = await repository.pruneOlderThan(
      PRODUCT_EVENT_RETENTION_DAYS
    );

    expect(result.deleted).toBe(7);
    expect(Object.keys(deletes[0].where)).toEqual(['createdAt']);
    expect(Object.keys(deletes[0].where.createdAt)).toEqual(['lt']);
    expect(
      Date.now() - deletes[0].where.createdAt.lt.getTime()
    ).toBeGreaterThan((PRODUCT_EVENT_RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000);
  });

  test('admin report is bounded and returns all five event names without personal fields', async () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-31T23:59:59.999Z');
    const queries = [];
    const productEventModel = {
      async findMany(query) {
        queries.push(query);
        return [
          {
            id: 'event-3',
            name: 'purchase',
            organizationId: 'org-a',
            userId: 'user-a',
            createdAt: new Date('2026-08-20T10:00:00.000Z'),
          },
        ];
      },
      async groupBy(query) {
        queries.push(query);
        return [
          {
            name: 'register',
            _count: { _all: 2 },
            _max: { createdAt: new Date('2026-08-10T10:00:00.000Z') },
          },
          {
            name: 'channel_added',
            _count: { _all: 1 },
            _max: { createdAt: new Date('2026-08-12T10:00:00.000Z') },
          },
        ];
      },
    };
    const organizationModel = {
      async count(query) {
        queries.push({ kind: 'organizationCount', ...query });
        return query.where.AND ? 1 : 2;
      },
    };
    const repository = new ProductEventsRepository({
      model: {
        productEvent: productEventModel,
        organization: organizationModel,
      },
    });

    const report = await repository.getAdminReport({ from, to });

    expect(report).toEqual({
      range: {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.999Z',
      },
      activation: {
        registeredOrganizations: 2,
        activatedOrganizations: 1,
        ratePercentage: 50,
      },
      events: [
        {
          name: 'register',
          count: 2,
          latestAt: '2026-08-10T10:00:00.000Z',
        },
        { name: 'purchase', count: 0, latestAt: null },
        {
          name: 'channel_added',
          count: 1,
          latestAt: '2026-08-12T10:00:00.000Z',
        },
        { name: 'lifetime_claimed', count: 0, latestAt: null },
        { name: 'cancel_subscription', count: 0, latestAt: null },
      ],
      recent: [
        {
          id: 'event-3',
          name: 'purchase',
          organizationId: 'org-a',
          userId: 'user-a',
          createdAt: '2026-08-20T10:00:00.000Z',
        },
      ],
    });

    const cohortQueries = queries.filter(
      (query) => query.kind === 'organizationCount'
    );
    expect(cohortQueries).toHaveLength(2);
    expect(cohortQueries[0].where).toEqual({
      productEvents: {
        some: {
          name: 'register',
          createdAt: { gte: from, lte: to },
        },
      },
    });
    expect(cohortQueries[1].where).toEqual({
      AND: [
        {
          productEvents: {
            some: {
              name: 'register',
              createdAt: { gte: from, lte: to },
            },
          },
        },
        {
          productEvents: {
            some: {
              name: 'channel_added',
              // Both halves of the cohort share one window, so the screen's
              // "registered in this period, connected their first channel"
              // cannot quietly count a channel connected outside it.
              createdAt: { gte: from, lte: to },
            },
          },
        },
      ],
    });
    expect(JSON.stringify(cohortQueries)).not.toContain('"in"');

    const recentQuery = queries.find((query) => query.take === 50);
    expect(recentQuery).toMatchObject({
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        organizationId: true,
        userId: true,
        createdAt: true,
      },
    });
    expect(recentQuery.include).toBeUndefined();
  });
});

describe('server-emitted events', () => {
  const createRegistrationRepository = (productEvent) => {
    const organizationCreates = [];
    const organizationModel = {
      organization: {
        create: async (query) => {
          organizationCreates.push(query);
          return {
            id: query.data.id,
            users: [{ user: { id: query.data.users.create.user.create.id } }],
          };
        },
      },
      productEvent,
    };
    const organizationModule = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
      {
        '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
          PrismaRepository: class PrismaRepository {},
        },
        '@contentfactory/helpers/auth/auth.service': {
          AuthService: {
            fixedEncryption: (value) => value,
            hashPassword: (value) => `hashed:${value}`,
          },
        },
        '@contentfactory/nestjs-libraries/services/make.is': {
          makeId: () => 'generated-key',
        },
        // The same create statement also writes the first sign-in identity and
        // the newsletter consent. Neither is what this file asserts, so both
        // arrive as the smallest stand-in that lets the statement run.
        '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
          normalizeIdentityIdentifier: (provider, identifier) =>
            provider === 'LOCAL' ? identifier.trim().toLowerCase() : identifier,
        },
        '@contentfactory/helpers/auth/newsletter.consent': {
          NEWSLETTER_CONSENT_SOURCE_REGISTRATION: 'registration',
        },
        '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
          CONTENT_WORKFLOW_TAGS: [
            { name: 'Plan', color: '#7FB03A' },
            { name: 'Draft', color: '#4D7CFE' },
            { name: 'Review', color: '#F59E0B' },
            { name: 'Schedule', color: '#8B5CF6' },
          ],
        },
      }
    );
    return {
      organizationCreates,
      repository: new organizationModule.OrganizationRepository(
        { model: organizationModel },
        { model: {} },
        { model: {} }
      ),
    };
  };

  const register = (repository) =>
    repository.createOrgAndUser(
      {
        company: 'Factory',
        email: 'account@example.test',
        password: 'secret',
        provider: 'LOCAL',
      },
      { activated: false, isSuperAdmin: false },
      '127.0.0.1',
      'test-agent'
    );

  test('unauthenticated registration records register after the account exists', async () => {
    const productEventCreates = [];
    const { repository, organizationCreates } = createRegistrationRepository({
      create: async (query) => {
        expect(organizationCreates).toHaveLength(1);
        productEventCreates.push(query);
        return query.data;
      },
    });

    const created = await register(repository);

    expect(productEventCreates).toHaveLength(1);
    expect(productEventCreates[0].data).toEqual({
      name: 'register',
      properties: {},
      deduplicationKey: `register:${created.users[0].user.id}`,
      organizationId: created.id,
      userId: created.users[0].user.id,
    });
  });

  /**
   * The schema is applied as a separate step after the containers come up
   * (docs/operations/production-deploy.md), so there is a window where
   * `ProductEvent` does not exist yet and Prisma answers `P2021`. While the
   * write lived inside the account transaction, that window turned every
   * registration into a 500.
   */
  test('registration survives a product event write that fails', async () => {
    const failure = Object.assign(
      new Error('The table `public.ProductEvent` does not exist'),
      { code: 'P2021' }
    );
    const { repository } = createRegistrationRepository({
      create: async () => {
        throw failure;
      },
    });
    const logged = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const created = await register(repository);

    expect(created.id).toEqual(expect.any(String));
    expect(created.users[0].user.id).toEqual(expect.any(String));
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  test('registration never opens a transaction for analytics', async () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts'
      ),
      'utf8'
    );

    expect(source).toContain('productEvent.create');
    expect(source).not.toContain('$transaction');
  });

  test('authenticated OAuth start stores the initiating user with the shared state', async () => {
    redisCalls.length = 0;
    fakeRedis.values.clear();
    const integrationsModule = loadTypeScriptModule(
      'apps/backend/src/api/routes/integrations.controller.ts',
      controllerDependencyMocks()
    );
    const controller = new integrationsModule.IntegrationsController(
      {
        getAllowedSocialsIntegrations: () => ['provider'],
        getSocialIntegration: () => ({
          generateAuthUrl: async () => ({
            codeVerifier: 'verifier',
            state: 'oauth-state',
            url: 'https://provider.test/auth',
          }),
        }),
      },
      {},
      {},
      {},
      {}
    );

    await controller.getIntegrationUrl(
      'provider',
      '',
      '',
      '',
      '',
      { id: 'org-7' },
      { id: 'user-7' }
    );

    expect(redisCalls).toContainEqual([
      'product-event-user:oauth-state',
      'user-7',
      'EX',
      3600,
    ]);
  });

  test('confirmed integration callback emits channel_added using trusted state', async () => {
    const { controller, eventWrites } =
      createNoAuthIntegrationController('trusted-user');

    await controller.connectSocialMedia('provider', {
      state: 'oauth-state',
      code: 'provider-code',
      timezone: 0,
    });

    expect(eventWrites).toEqual([
      {
        name: 'channel_added',
        properties: {},
        deduplicationKey: 'channel_added:integration-1',
        organizationId: 'org-7',
        userId: 'trusted-user',
      },
    ]);
  });

  test('legacy OAuth state skips analytics without breaking integration success', async () => {
    const { controller, eventWrites } = createNoAuthIntegrationController(null);

    await expect(
      controller.connectSocialMedia('provider', {
        state: 'oauth-state',
        code: 'provider-code',
        timezone: 0,
      })
    ).resolves.toMatchObject({ id: 'integration-1' });
    expect(eventWrites).toEqual([]);
  });

  /**
   * In `saveProviderPage` this lookup runs after the channel is already
   * stored, so a Redis outage outside the guard failed a request whose product
   * work had succeeded.
   */
  test('an unreachable Redis does not fail a connected channel', async () => {
    const { controller, eventWrites } =
      createNoAuthIntegrationController('trusted-user');
    const get = fakeRedis.get;
    fakeRedis.get = async (key) => {
      if (key.startsWith('product-event-user:')) {
        throw new Error('Redis is unreachable');
      }
      return get.call(fakeRedis, key);
    };
    const logged = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      await expect(
        controller.connectSocialMedia('provider', {
          state: 'oauth-state',
          code: 'provider-code',
          timezone: 0,
        })
      ).resolves.toMatchObject({ id: 'integration-1' });
      expect(eventWrites).toEqual([]);
      expect(logged).toHaveBeenCalled();
    } finally {
      fakeRedis.get = get;
      logged.mockRestore();
    }
  });

  test('refreshing an existing integration does not emit channel_added', async () => {
    const { controller, eventWrites } = createNoAuthIntegrationController(
      'trusted-user',
      { refresh: true }
    );

    await expect(
      controller.connectSocialMedia('provider', {
        state: 'oauth-state',
        code: 'provider-code',
        refresh: 'provider-account',
        timezone: 0,
      })
    ).resolves.toMatchObject({ id: 'integration-1' });
    expect(eventWrites).toEqual([]);
  });
});

describe('admin product events endpoint', () => {
  test('refuses a non-superadmin before running the report', async () => {
    let reportCalls = 0;
    const adminModule = loadTypeScriptModule(
      'apps/backend/src/api/routes/admin.controller.ts',
      {
        ...publicGrowthTokenMock,
        '@contentfactory/nestjs-libraries/user/user.from.request': {
          GetUserFromRequest: () => () => undefined,
        },
        '@contentfactory/nestjs-libraries/database/prisma/errors/errors.service':
          {
            ErrorsService: class ErrorsService {},
          },
        '@contentfactory/nestjs-libraries/database/prisma/admin-stats/admin-stats.service':
          {
            AdminStatsService: class AdminStatsService {},
          },
        '@contentfactory/nestjs-libraries/database/prisma/users/users.service':
          {
            UsersService: class UsersService {},
          },
        '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service':
          {
            ProductEventsService,
          },
        '@contentfactory/helpers/auth/registration.approval': {
          registrationRequiresApproval: () => false,
        },
      }
    );
    const controller = new adminModule.AdminController(
      {},
      {},
      {},
      {
        getAdminReport: async () => {
          reportCalls += 1;
        },
      }
    );

    const request = controller.getProductEvents
      ? controller.getProductEvents(
          { id: 'user', isSuperAdmin: false },
          '2026-08-01',
          '2026-08-31'
        )
      : Promise.resolve({ unauthorized: false });

    await expect(request).rejects.toMatchObject({ status: 400 });
    expect(reportCalls).toBe(0);
  });
});

describe('Prisma ProductEvent schema', () => {
  test('declares tenant deduplication and all report indexes', () => {
    const schema = fs.readFileSync(
      path.resolve(
        __dirname,
        '../libraries/nestjs-libraries/src/database/prisma/schema.prisma'
      ),
      'utf8'
    );
    const model =
      schema.match(/model ProductEvent \{([\s\S]*?)\n\}/)?.[1] || '';

    expect(model).toContain('properties');
    expect(model).toMatch(/properties\s+Json/);
    expect(model).toContain('@@unique([organizationId, deduplicationKey])');
    // The latest-events feed orders by createdAt alone; none of the composite
    // indexes below start with it, so without this one the feed is a scan.
    expect(model).toContain('@@index([createdAt])');
    expect(model).toContain('@@index([name, createdAt])');
    expect(model).toContain('@@index([organizationId, createdAt])');
    expect(model).toContain('@@index([userId, createdAt])');
  });
});

// Compiled from the repository rather than stubbed with a literal: both
// controllers and the module that binds the provider have to resolve the same
// token, and a stub would let a rename pass here and fail only at Nest boot.
const publicGrowthTokenMock = {
  '@contentfactory/backend/api/routes/public-growth.token':
    loadTypeScriptModule('apps/backend/src/api/routes/public-growth.token.ts'),
};

function controllerDependencyMocks() {
  const decorator = () => () => undefined;
  return {
    ...publicGrowthTokenMock,
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: fakeRedis,
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class IntegrationManager {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      {
        IntegrationService: class IntegrationService {},
      },
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: decorator,
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: decorator,
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: decorator,
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: { FREE: { channel: 1 } },
    },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class PostsService {},
    },
    '@contentfactory/nestjs-libraries/dtos/integrations/integration.time.dto': {
      IntegrationTimeDto: class IntegrationTimeDto {},
    },
    '@contentfactory/nestjs-libraries/dtos/integrations/integration.function.dto':
      {
        IntegrationFunctionDto: class IntegrationFunctionDto {},
      },
    '@contentfactory/nestjs-libraries/dtos/integrations/integration.content.language.dto':
      {
        IntegrationContentLanguageDto: class IntegrationContentLanguageDto {},
      },
    '@contentfactory/nestjs-libraries/dtos/plugs/plug.dto': {
      PlugDto: class PlugDto {},
    },
    '@contentfactory/nestjs-libraries/integrations/social.abstract': {
      RefreshToken: class RefreshToken extends Error {},
    },
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
    '@contentfactory/nestjs-libraries/integrations/social/moltbook.provider': {
      MoltbookProvider: class MoltbookProvider {},
    },
    '@contentfactory/nestjs-libraries/integrations/telegram.updates.service': {
      TelegramUpdatesService: class TelegramUpdatesService {},
    },
    '@contentfactory/nestjs-libraries/dtos/integrations/telegram.updates.dto': {
      TelegramUpdatesDto: class TelegramUpdatesDto {},
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      {
        AuthorizationActions: { Create: 'create' },
        Sections: { CHANNEL: 'channel' },
      },
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service':
      {
        RefreshIntegrationService: class RefreshIntegrationService {},
      },
  };
}

function createNoAuthIntegrationController(
  initiatingUserId,
  { refresh = false } = {}
) {
  fakeRedis.values.clear();
  fakeRedis.values.set('organization:oauth-state', 'org-7');
  if (refresh) {
    fakeRedis.values.set('refresh:oauth-state', 'provider-account');
  }
  if (initiatingUserId) {
    fakeRedis.values.set('product-event-user:oauth-state', initiatingUserId);
  }
  const eventWrites = [];
  const noAuthModule = loadTypeScriptModule(
    'apps/backend/src/api/routes/no.auth.integrations.controller.ts',
    {
      ...controllerDependencyMocks(),
      '@contentfactory/nestjs-libraries/dtos/integrations/connect.integration.dto':
        {
          ConnectIntegrationDto: class ConnectIntegrationDto {},
        },
      '@contentfactory/nestjs-libraries/integrations/integration.missing.scopes':
        {
          NotEnoughScopesFilter: class NotEnoughScopesFilter {
            catch() {}
          },
        },
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: {
          fixedEncryption: (value) => value,
          signJWT: (value) => JSON.stringify(value),
        },
      },
      '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface':
        {},
      '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
        {
          OrganizationService: class OrganizationService {},
        },
      '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service':
        {
          ProductEventsService,
        },
    }
  );
  const controller = new noAuthModule.NoAuthIntegrationsController(
    {
      getAllowedSocialsIntegrations: () => ['provider'],
      getSocialIntegration: () => ({
        customFields: true,
        oneTimeToken: false,
        isBetweenSteps: false,
        authenticate: async () => ({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
          id: 'provider-account',
          name: 'Channel',
          picture: '',
          username: 'channel',
          additionalSettings: [],
        }),
      }),
    },
    {
      checkPreviousConnections: async () => false,
      createOrUpdateIntegration: async () => ({
        id: 'integration-1',
        organizationId: 'org-7',
        internalId: 'provider-account',
        providerIdentifier: 'provider',
        name: 'Channel',
        token: 'stored-secret',
        refreshToken: 'stored-refresh',
        customInstanceDetails: null,
      }),
    },
    { startRefreshWorkflow: async () => undefined },
    {
      getOrgById: async () => ({
        id: 'org-7',
        isTrailing: false,
        apiKey: 'api-key',
      }),
    },
    {
      recordTrusted: async (event) => {
        eventWrites.push(event);
        return { recorded: true };
      },
    }
  );
  return { controller, eventWrites };
}
