const fs = require('node:fs');
const path = require('node:path');
const { createHash, createHmac } = require('node:crypto');
const { Logger } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const {
  ThrottlerException,
  ThrottlerStorageService,
} = require('@nestjs/throttler');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const loadIfPresent = (relativePath, mocks = {}) =>
  fs.existsSync(path.join(root, relativePath))
    ? loadTypeScriptModule(relativePath, mocks)
    : {};

const dtoModule = loadIfPresent(
  'libraries/nestjs-libraries/src/dtos/growth/public-growth-event.ts'
);
const repositoryModule = loadIfPresent(
  'libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
  }
);
const serviceModule = loadIfPresent(
  'libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.service.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.repository':
      repositoryModule,
    '@contentfactory/nestjs-libraries/dtos/growth/public-growth-event':
      dtoModule,
  }
);
const transientTrackerModule = loadIfPresent(
  'libraries/nestjs-libraries/src/throttler/transient-client-tracker.ts'
);
const controllerModule = loadIfPresent(
  'apps/backend/src/api/routes/public-growth-events.controller.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.service':
      serviceModule,
    '@contentfactory/nestjs-libraries/throttler/throttler.provider':
      transientTrackerModule,
  }
);

const PUBLIC_NAMES = [
  'landing_view',
  'demo_started',
  'demo_completed',
  'signup_started',
];

describe('public growth event contract', () => {
  test('leaves the required dedupe key empty in the shared environment example', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

    expect(example).toMatch(/^PUBLIC_GROWTH_DEDUPE_KEY=""$/m);
  });

  test('publishes the closed public and trusted name sets', () => {
    expect(dtoModule.PUBLIC_GROWTH_EVENT_NAMES).toEqual(PUBLIC_NAMES);
    expect(dtoModule.TRUSTED_GROWTH_EVENT_NAMES).toEqual([
      'registration_completed',
      'workspace_activated',
    ]);
  });

  test.each(PUBLIC_NAMES)('accepts the coarse %s event', (name) => {
    expect(dtoModule.parsePublicGrowthEvent?.({ name })).toEqual({ name });
  });

  test('accepts only bounded coarse dimensions', () => {
    expect(
      dtoModule.parsePublicGrowthEvent?.({
        name: 'demo_started',
        locale: 'ru',
        widthRange: 'small',
        uiVersion: 'public-demo-v1',
        demoStep: 'plan',
      })
    ).toEqual({
      name: 'demo_started',
      locale: 'ru',
      widthRange: 'small',
      uiVersion: 'public-demo-v1',
      demoStep: 'plan',
    });
  });

  test.each([
    null,
    [],
    {},
    { name: 'registration_completed' },
    { name: 'workspace_activated' },
    { name: 'landing_view', email: 'person@example.com' },
    { name: 'landing_view', properties: {} },
    { name: 'landing_view', visitorId: 'persistent-id' },
    { name: 'landing_view', referrer: 'https://example.com/private' },
    { name: 'landing_view', userAgent: 'browser' },
    { name: 'landing_view', ip: '127.0.0.1' },
    { name: 'landing_view', locale: 'fr' },
    { name: 'landing_view', widthRange: '391' },
    { name: 'landing_view', widthRange: 'compact' },
    { name: 'landing_view', uiVersion: 'arbitrary-cardinality' },
    { name: 'landing_view', uiVersion: 'saas-v1' },
    { name: 'landing_view', demoStep: 'private free text' },
  ])('rejects non-allowlisted public payload %p', (payload) => {
    expect(dtoModule.parsePublicGrowthEvent?.(payload)).toBeNull();
  });
});

function createStore({
  aggregateFailures = [],
  duplicateTarget = ['name', 'deduplicationKey'],
} = {}) {
  const daily = new Map();
  const receipts = new Map();
  const upserts = [];
  let transactions = 0;
  const aggregate = {
    upsert: async (query) => {
      upserts.push(query);
      const failure = aggregateFailures.shift();
      if (failure) throw failure;
      const key = `${query.create.day.toISOString()}:${query.create.name}`;
      daily.set(key, (daily.get(key) || 0) + 1);
      return { ...query.create, count: daily.get(key) };
    },
  };
  const transaction = {
    model: {
      $transaction: async (operation) => {
        transactions += 1;
        const receiptsBefore = new Map(receipts);
        const dailyBefore = new Map(daily);
        try {
          return await operation({
            publicGrowthTrustedEvent: {
              create: async ({ data }) => {
                const key = `${data.name}:${data.deduplicationKey}`;
                if (receipts.has(key)) {
                  throw Object.assign(new Error('duplicate'), {
                    code: 'P2002',
                    meta: { target: duplicateTarget },
                  });
                }
                receipts.set(key, data);
                return data;
              },
            },
            publicGrowthDaily: aggregate,
          });
        } catch (error) {
          receipts.clear();
          receiptsBefore.forEach((value, key) => receipts.set(key, value));
          daily.clear();
          dailyBefore.forEach((value, key) => daily.set(key, value));
          throw error;
        }
      },
    },
  };

  const Repository = repositoryModule.PublicGrowthRepository;
  const Service = serviceModule.PublicGrowthService;
  const repository = Repository
    ? new Repository({ model: { publicGrowthDaily: aggregate } }, transaction)
    : undefined;
  return {
    daily,
    receipts,
    upserts,
    get transactions() {
      return transactions;
    },
    service: Service && repository ? new Service(repository) : undefined,
  };
}

describe('daily aggregate persistence', () => {
  test('increments only the coarse UTC-day aggregate', async () => {
    const store = createStore();
    const now = new Date('2026-08-19T22:13:14.000Z');

    await expect(
      store.service?.recordPublic({ name: 'demo_started' }, now)
    ).resolves.toEqual({ recorded: true });
    expect(store.upserts).toEqual([
      {
        where: {
          day_name_locale_widthRange_uiVersion_demoStep: {
            day: new Date('2026-08-19T00:00:00.000Z'),
            name: 'demo_started',
            locale: '',
            widthRange: '',
            uiVersion: '',
            demoStep: '',
          },
        },
        create: {
          day: new Date('2026-08-19T00:00:00.000Z'),
          name: 'demo_started',
          locale: '',
          widthRange: '',
          uiVersion: '',
          demoStep: '',
          count: 1,
        },
        update: { count: { increment: 1 } },
      },
    ]);
    expect(JSON.stringify(store.upserts)).not.toMatch(
      /email|visitor|user.?agent|referrer|127\.0\.0\.1/i
    );
  });

  test('aggregates a bounded dimension tuple without raw request data', async () => {
    const store = createStore();
    const now = new Date('2026-08-19T22:13:14.000Z');

    await store.service.recordPublic(
      {
        name: 'demo_started',
        locale: 'en',
        widthRange: 'wide',
        uiVersion: 'public-demo-v1',
        demoStep: 'review',
      },
      now
    );

    expect(store.upserts[0]).toMatchObject({
      where: {
        day_name_locale_widthRange_uiVersion_demoStep: {
          day: new Date('2026-08-19T00:00:00.000Z'),
          name: 'demo_started',
          locale: 'en',
          widthRange: 'wide',
          uiVersion: 'public-demo-v1',
          demoStep: 'review',
        },
      },
      create: {
        locale: 'en',
        widthRange: 'wide',
        uiVersion: 'public-demo-v1',
        demoStep: 'review',
      },
    });
  });

  test('trusted registration is deduplicated without storing its raw key', async () => {
    const store = createStore();
    const now = new Date('2026-08-19T10:00:00.000Z');
    const oldKey = process.env.PUBLIC_GROWTH_DEDUPE_KEY;
    process.env.PUBLIC_GROWTH_DEDUPE_KEY =
      'test-growth-dedupe-secret-at-least-32';

    try {
      await expect(
        store.service?.recordTrusted(
          'registration_completed',
          'registration_completed:org-private',
          now
        )
      ).resolves.toEqual({ recorded: true });
      await expect(
        store.service?.recordTrusted(
          'registration_completed',
          'registration_completed:org-private',
          now
        )
      ).resolves.toEqual({ recorded: false });
    } finally {
      if (oldKey === undefined) delete process.env.PUBLIC_GROWTH_DEDUPE_KEY;
      else process.env.PUBLIC_GROWTH_DEDUPE_KEY = oldKey;
    }

    expect([...store.daily.values()]).toEqual([1]);
    expect(store.receipts.size).toBe(1);
    const receipt = [...store.receipts.values()][0];
    const rawKey = 'registration_completed:org-private';
    const expected = createHmac(
      'sha256',
      'test-growth-dedupe-secret-at-least-32'
    )
      .update('content-factory/public-growth/trusted-dedupe/v1\0')
      .update(rawKey)
      .digest('hex');
    expect(receipt.deduplicationKey).toBe(expected);
    expect(receipt.deduplicationKey).not.toBe(
      createHash('sha256').update(rawKey).digest('hex')
    );
    expect(JSON.stringify(receipt)).not.toContain('org-private');
  });

  test('rolls back a trusted receipt when the aggregate write fails', async () => {
    const store = createStore({
      aggregateFailures: [new Error('aggregate unavailable')],
    });

    await expect(
      store.service?.recordTrusted(
        'workspace_activated',
        'workspace_activated:org-private',
        new Date('2026-08-19T10:00:00.000Z')
      )
    ).rejects.toThrow('aggregate unavailable');
    expect(store.receipts.size).toBe(0);
    expect(store.daily.size).toBe(0);
  });

  test('retries a daily aggregate P2002 without treating the trusted event as a duplicate', async () => {
    const store = createStore({
      aggregateFailures: [
        Object.assign(new Error('daily aggregate race'), {
          code: 'P2002',
          meta: {
            target: [
              'day',
              'name',
              'locale',
              'widthRange',
              'uiVersion',
              'demoStep',
            ],
          },
        }),
      ],
    });

    await expect(
      store.service.recordTrusted(
        'registration_completed',
        'registration_completed:org-race',
        new Date('2026-08-19T10:00:00.000Z')
      )
    ).resolves.toEqual({ recorded: true });

    expect(store.transactions).toBe(2);
    expect(store.receipts.size).toBe(1);
    expect([...store.daily.values()]).toEqual([1]);
  });

  test('retries P2034 transaction conflicts only up to the bounded limit', async () => {
    const conflict = () =>
      Object.assign(new Error('write conflict'), { code: 'P2034' });
    const recovered = createStore({ aggregateFailures: [conflict()] });

    await expect(
      recovered.service.recordTrusted(
        'workspace_activated',
        'workspace_activated:org-conflict',
        new Date('2026-08-19T10:00:00.000Z')
      )
    ).resolves.toEqual({ recorded: true });
    expect(recovered.transactions).toBe(2);

    const exhausted = createStore({
      aggregateFailures: [conflict(), conflict(), conflict()],
    });
    await expect(
      exhausted.service.recordTrusted(
        'workspace_activated',
        'workspace_activated:org-busy',
        new Date('2026-08-19T10:00:00.000Z')
      )
    ).rejects.toMatchObject({ code: 'P2034' });
    expect(exhausted.transactions).toBe(3);
    expect(exhausted.receipts.size).toBe(0);
  });

  test('never treats an ambiguous P2002 without receipt target metadata as a duplicate', async () => {
    const ambiguous = () =>
      Object.assign(new Error('unknown unique conflict'), { code: 'P2002' });
    const store = createStore({
      aggregateFailures: [ambiguous(), ambiguous(), ambiguous()],
    });

    await expect(
      store.service.recordTrusted(
        'registration_completed',
        'registration_completed:org-ambiguous',
        new Date('2026-08-19T10:00:00.000Z')
      )
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(store.transactions).toBe(3);
    expect(store.receipts.size).toBe(0);
    expect(store.daily.size).toBe(0);
  });

  // Prisma reports `P2002` `meta.target` from an untagged enum: an array of
  // column names when the driver could read the constraint detail, and the
  // bare constraint name when it could only read the constraint. A pooler or a
  // restricted role is enough to move a real duplicate onto the second shape.
  test('deduplicates a trusted receipt reported as a constraint name', async () => {
    const store = createStore({
      duplicateTarget: 'PublicGrowthTrustedEvent_name_deduplicationKey_key',
    });
    const now = new Date('2026-08-19T10:00:00.000Z');

    await expect(
      store.service.recordTrusted(
        'registration_completed',
        'registration_completed:org-pooled',
        now
      )
    ).resolves.toEqual({ recorded: true });
    await expect(
      store.service.recordTrusted(
        'registration_completed',
        'registration_completed:org-pooled',
        now
      )
    ).resolves.toEqual({ recorded: false });

    expect(store.transactions).toBe(2);
    expect(store.receipts.size).toBe(1);
    expect([...store.daily.values()]).toEqual([1]);
  });

  test('never accepts another constraint name as this receipt', async () => {
    const store = createStore({
      duplicateTarget:
        'PublicGrowthDaily_day_name_locale_widthRange_uiVersion_demoStep_key',
    });
    const now = new Date('2026-08-19T10:00:00.000Z');

    await store.service.recordTrusted(
      'workspace_activated',
      'workspace_activated:org-other',
      now
    );
    await expect(
      store.service.recordTrusted(
        'workspace_activated',
        'workspace_activated:org-other',
        now
      )
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(store.transactions).toBe(4);
    expect(store.receipts.size).toBe(1);
  });

  test('matches the constraint name this schema actually generates', () => {
    const schema = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
      ),
      'utf8'
    );
    const model = schema.match(
      /model PublicGrowthTrustedEvent\s*{([\s\S]*?)\n}/
    )?.[1];
    const fields = model
      ?.match(/@@unique\(\[([^\]]+)\]\)/)?.[1]
      .split(',')
      .map((field) => field.trim());

    expect(fields).toEqual(['name', 'deduplicationKey']);
    // A `map:` would rename the constraint and silently invalidate the
    // constant the repository compares against.
    expect(model).not.toContain('map:');
    expect(repositoryModule.TRUSTED_RECEIPT_CONSTRAINT).toBe(
      `PublicGrowthTrustedEvent_${fields.join('_')}_key`
    );
  });

  test.each([undefined, '', 'short-growth-key'])(
    'fails closed outside tests when the trusted dedupe key is missing or weak: %p',
    (configuredKey) => {
      const store = createStore();
      const oldNodeEnv = process.env.NODE_ENV;
      const oldKey = process.env.PUBLIC_GROWTH_DEDUPE_KEY;
      process.env.NODE_ENV = 'production';
      if (configuredKey === undefined)
        delete process.env.PUBLIC_GROWTH_DEDUPE_KEY;
      else process.env.PUBLIC_GROWTH_DEDUPE_KEY = configuredKey;

      try {
        expect(() =>
          store.service.recordTrusted(
            'registration_completed',
            'registration_completed:org-private'
          )
        ).toThrow('PUBLIC_GROWTH_DEDUPE_KEY');
        expect(store.receipts.size).toBe(0);
      } finally {
        if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = oldNodeEnv;
        if (oldKey === undefined) delete process.env.PUBLIC_GROWTH_DEDUPE_KEY;
        else process.env.PUBLIC_GROWTH_DEDUPE_KEY = oldKey;
      }
    }
  );
});

// The anonymous path writes the same daily row as every other visitor in the
// same UTC day and dimension tuple, so its upsert races constantly. It shares
// the bounded retry with the trusted path and needs the same coverage.
describe('public aggregate retries', () => {
  const now = new Date('2026-08-19T10:00:00.000Z');
  const conflict = () =>
    Object.assign(new Error('write conflict'), { code: 'P2034' });
  const aggregateRace = () =>
    Object.assign(new Error('daily aggregate race'), {
      code: 'P2002',
      meta: {
        target: [
          'day',
          'name',
          'locale',
          'widthRange',
          'uiVersion',
          'demoStep',
        ],
      },
    });

  test.each([
    ['a transaction write conflict', conflict],
    ['a concurrent insert of the same daily row', aggregateRace],
  ])('recovers a public event from %s', async (_case, failure) => {
    const store = createStore({ aggregateFailures: [failure(), failure()] });

    await expect(
      store.service.recordPublic({ name: 'landing_view' }, now)
    ).resolves.toEqual({ recorded: true });
    expect(store.upserts).toHaveLength(3);
    expect([...store.daily.values()]).toEqual([1]);
  });

  test('gives up after the bounded number of public attempts', async () => {
    const store = createStore({
      aggregateFailures: [conflict(), conflict(), conflict()],
    });

    await expect(
      store.service.recordPublic({ name: 'landing_view' }, now)
    ).rejects.toMatchObject({ code: 'P2034' });
    expect(store.upserts).toHaveLength(3);
    expect(store.daily.size).toBe(0);
  });

  test('does not retry a public failure that is not a write conflict', async () => {
    const store = createStore({
      aggregateFailures: [new Error('aggregate unavailable')],
    });

    await expect(
      store.service.recordPublic({ name: 'demo_completed' }, now)
    ).rejects.toThrow('aggregate unavailable');
    expect(store.upserts).toHaveLength(1);
  });

  test('never mistakes the trusted receipt constraint for a public duplicate', async () => {
    const receiptConflict = () =>
      Object.assign(new Error('receipt conflict'), {
        code: 'P2002',
        meta: { target: 'PublicGrowthTrustedEvent_name_deduplicationKey_key' },
      });
    const store = createStore({ aggregateFailures: [receiptConflict()] });

    await expect(
      store.service.recordPublic({ name: 'signup_started' }, now)
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(store.upserts).toHaveLength(1);
  });
});

describe('public growth receiver', () => {
  test('uses separate transient rate-limit buckets without exposing request metadata', async () => {
    const Guard = controllerModule.PublicGrowthEventsGuard;
    expect(typeof Guard).toBe('function');
    if (!Guard) return;
    const guard = Object.create(Guard.prototype);

    const first = await guard.getTracker({ ip: '10.0.0.1', headers: {} });
    const second = await guard.getTracker({
      ip: '10.0.0.2',
      headers: { 'user-agent': 'different' },
    });
    expect(first).not.toBe(second);
    expect(first).not.toMatch(/10\.0\.0|different/);
    expect(second).not.toMatch(/10\.0\.0|different/);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  test('returns the standard 429 and logs only the route when the 120/minute budget is exhausted', async () => {
    const Guard = controllerModule.PublicGrowthEventsGuard;
    const Controller = controllerModule.PublicGrowthEventsController;
    const storage = new ThrottlerStorageService();
    const guard = new Guard(
      { throttlers: [{ ttl: 60_000, limit: 120 }] },
      storage,
      new Reflector()
    );
    const request = {
      method: 'POST',
      path: '/public-growth-events/',
      url: '/public-growth-events/',
      headers: {
        'x-forwarded-for': '198.51.100.24',
        'user-agent': 'private-browser',
      },
      ip: '172.18.0.2',
      socket: { remoteAddress: '172.18.0.2' },
    };
    const context = {
      getClass: () => Controller,
      getHandler: () => Controller.prototype.record,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header: jest.fn() }),
      }),
    };
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await guard.onModuleInit();

    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await expect(guard.canActivate(context)).resolves.toBe(true);
      }
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 429,
      });
      expect(warning).toHaveBeenCalledWith(
        'Public growth throttle exhausted for POST /public-growth-events/'
      );
      expect(JSON.stringify(warning.mock.calls)).not.toMatch(
        /198\.51\.100\.24|private-browser|[a-f0-9]{64}/
      );
    } finally {
      warning.mockRestore();
      storage.onApplicationShutdown();
    }
  });

  test('accepts a public event and rejects a trusted event', async () => {
    const store = createStore();
    const Controller = controllerModule.PublicGrowthEventsController;
    expect(typeof Controller).toBe('function');
    if (!Controller) return;
    const controller = new Controller(store.service);

    await expect(
      controller.record({
        body: { name: 'landing_view' },
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'private-browser',
          referer: 'https://example.com/private',
        },
      })
    ).resolves.toEqual({ accepted: true });
    await expect(
      controller.record({ body: { name: 'workspace_activated' } })
    ).rejects.toMatchObject({ status: 400 });
    expect(JSON.stringify(store.upserts)).not.toMatch(
      /private-browser|example\.com|127\.0\.0\.1/
    );
  });
});
