'use strict';

require('reflect-metadata');
const http = require('node:http');
const { Test } = require('@nestjs/testing');
const { MODULE_METADATA } = require('@nestjs/common/constants');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const CONTROLLER = 'apps/backend/src/api/routes/monitor.controller.ts';
const SERVICE = 'apps/backend/src/services/monitor/runtime-monitor.service.ts';
const SERVICE_ALIAS =
  '@contentfactory/backend/services/monitor/runtime-monitor.service';
const REDIS_ALIAS = '@contentfactory/nestjs-libraries/redis/redis.service';
const PRISMA_ALIAS =
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
const INTEGRATIONS_ALIAS =
  '@contentfactory/nestjs-libraries/integrations/integration.manager';
const BASE_TIME = Date.parse('2026-10-02T00:00:00.000Z');

// The actual stand-in is distinguished from a connected Redis. Its import is
// kept offline even when a developer's test process inherited REDIS_URL.
const savedRedisUrl = process.env.REDIS_URL;
delete process.env.REDIS_URL;
let MockRedis;
try {
  ({ MockRedis } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/redis/redis.service.ts',
    {
      ioredis: {
        Redis: class ForbiddenConnection {
          constructor() {
            throw new Error('test attempted a real Redis connection');
          }
        },
      },
    }
  ));
} finally {
  if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = savedRedisUrl;
}

class PrismaService {}
class TemporalService {}

const timestamp = (ageMs = 0) => {
  const milliseconds = Date.now() - ageMs;
  return {
    seconds: String(Math.floor(milliseconds / 1000)),
    nanos: (milliseconds % 1000) * 1000000,
  };
};

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function harness(options = {}) {
  const forbidden = jest.fn(() => {
    throw new Error('unexpected write or resource lifecycle');
  });
  const prisma = {
    organization: {
      findFirst: jest.fn(async () => null),
      create: forbidden,
      update: forbidden,
      delete: forbidden,
      deleteMany: forbidden,
    },
    $connect: forbidden,
    $disconnect: forbidden,
    $queryRaw: forbidden,
    $executeRaw: forbidden,
  };
  const redis = Object.hasOwn(options, 'redis')
    ? options.redis
    : {
        status: 'ready',
        ping: jest.fn(async () => 'PONG'),
        set: forbidden,
        incr: forbidden,
        del: forbidden,
        quit: forbidden,
        disconnect: forbidden,
        duplicate: forbidden,
      };
  const namespace = 'owned-monitor-namespace';
  const connection = {
    withDeadline: jest.fn((_deadline, read) => read()),
    healthService: { check: jest.fn(async () => ({ status: 1 })) },
    workflowService: {
      describeNamespace: jest.fn(async () => ({
        namespaceInfo: { name: namespace },
      })),
      describeTaskQueue: jest.fn(async () => ({
        pollers: [{ lastAccessTime: timestamp() }],
      })),
      startWorkflowExecution: forbidden,
      signalWorkflowExecution: forbidden,
    },
    close: forbidden,
  };
  const raw = { options: { namespace }, connection };
  const temporal = {
    client: {
      getRawClient: jest.fn(() => raw),
      getHealth: jest.fn(() => ({ status: 'healthy' })),
    },
    getOverallHealth: jest.fn(async () => ({ status: 'healthy' })),
  };
  const mocks = {
    [REDIS_ALIAS]: { ioRedis: redis, MockRedis },
    [PRISMA_ALIAS]: { PrismaService },
    [INTEGRATIONS_ALIAS]: {
      socialIntegrationList: [
        { identifier: 'telegram' },
        { identifier: 'reddit' },
        { identifier: 'linkedin' },
        { identifier: 'linkedin-page' },
      ],
    },
    'nestjs-temporal-core': { TemporalService },
  };
  const { MonitorController } = loadTypeScriptModule(CONTROLLER, mocks, {
    sources: { [SERVICE_ALIAS]: SERVICE },
  });
  const RuntimeMonitorService = Reflect.getMetadata(
    'design:paramtypes',
    MonitorController
  )[0];
  const service = new RuntimeMonitorService(prisma, temporal);
  return {
    prisma,
    redis,
    raw,
    namespace,
    temporal,
    connection,
    forbidden,
    mocks,
    service,
    RuntimeMonitorService,
    MonitorController,
    controller: new MonitorController(service),
  };
}

describe('public queue monitor contract', () => {
  function controller(known, ready) {
    const { MonitorController } = loadTypeScriptModule(CONTROLLER, {
      '@contentfactory/backend/services/monitor/runtime-monitor.service': {
        RuntimeMonitorService: class RuntimeMonitorService {},
      },
    });
    const service = {
      isKnownQueue: jest.fn(() => known),
      isQueueReady: jest.fn(async () => ready),
    };
    return { controller: new MonitorController(service), service };
  }

  test('an invented queue is 404 before dependency work', async () => {
    const h = controller(false, true);
    await expect(
      h.controller.getMessagesGroup('invented')
    ).rejects.toMatchObject({
      status: 404,
      response: { status: 'error', message: 'Unknown queue.' },
    });
    expect(h.service.isQueueReady).not.toHaveBeenCalled();
  });

  test('a known unavailable queue is a sanitized 503', async () => {
    const h = controller(true, false);
    await expect(
      h.controller.getMessagesGroup('telegram')
    ).rejects.toMatchObject({
      status: 503,
      response: { status: 'error', message: 'Queue is unavailable.' },
    });
  });

  test('known queue success retains the public two-field response', async () => {
    const h = controller(true, true);
    await expect(h.controller.getMessagesGroup('telegram')).resolves.toEqual({
      status: 'success',
      message: 'Queue telegram is healthy.',
    });
  });
});

describe('actual runtime monitor dependencies and admission', () => {
  beforeEach(() => jest.useFakeTimers({ now: BASE_TIME }));
  afterEach(() => {
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  test('readiness uses an ORM read, real PONG and namespace/main RPCs with a shared deadline', async () => {
    const h = harness();
    await expect(h.controller.getReadiness()).resolves.toEqual({
      status: 'success',
      message: 'Runtime dependencies are ready.',
    });
    expect(h.prisma.organization.findFirst).toHaveBeenCalledWith({
      select: { id: true },
    });
    expect(h.redis.ping).toHaveBeenCalledTimes(1);
    expect(h.temporal.client.getRawClient).toHaveBeenCalledTimes(1);
    expect(h.connection.withDeadline).toHaveBeenCalledWith(
      BASE_TIME + 2000,
      expect.any(Function)
    );
    expect(h.connection.healthService.check).toHaveBeenCalledWith({
      service: '',
    });
    expect(h.connection.workflowService.describeNamespace).toHaveBeenCalledWith(
      { namespace: h.namespace }
    );
    expect(
      h.connection.workflowService.describeTaskQueue.mock.calls.map(
        ([request]) => request
      )
    ).toEqual([
      { namespace: h.namespace, taskQueue: { name: 'main' }, taskQueueType: 1 },
      { namespace: h.namespace, taskQueue: { name: 'main' }, taskQueueType: 2 },
    ]);
    expect(h.temporal.client.getHealth).not.toHaveBeenCalled();
    expect(h.temporal.getOverallHealth).not.toHaveBeenCalled();
    expect(h.forbidden).not.toHaveBeenCalled();
  });

  test('a provider queue needs activity pollers but no DB, PING or workflow read', async () => {
    const h = harness();
    await expect(h.controller.getMessagesGroup('telegram')).resolves.toEqual({
      status: 'success',
      message: 'Queue telegram is healthy.',
    });
    expect(
      h.connection.workflowService.describeTaskQueue
    ).toHaveBeenCalledTimes(1);
    expect(h.connection.workflowService.describeTaskQueue).toHaveBeenCalledWith(
      {
        namespace: h.namespace,
        taskQueue: { name: 'telegram' },
        taskQueueType: 2,
      }
    );
    expect(h.prisma.organization.findFirst).not.toHaveBeenCalled();
    expect(h.redis.ping).not.toHaveBeenCalled();
    expect(h.forbidden).not.toHaveBeenCalled();
  });

  test.each([1, 2])(
    'main requires task type %s as well as the other type',
    async (missingType) => {
      const h = harness();
      h.connection.workflowService.describeTaskQueue.mockImplementation(
        async (request) => ({
          pollers:
            request.taskQueueType === missingType
              ? []
              : [{ lastAccessTime: timestamp() }],
        })
      );
      await expect(h.service.isReady()).resolves.toBe(false);
    }
  );

  test('unknown, hyphenated and adversarial names allocate no probes or I/O', async () => {
    const h = harness();
    for (const name of [
      'invented',
      'linkedin-page',
      'MAIN',
      '../main',
      'main?password=private-sentinel',
      ...Array.from({ length: 100 }, (_, n) => 'unknown-' + n),
    ]) {
      await expect(h.controller.getMessagesGroup(name)).rejects.toMatchObject({
        status: 404,
        response: { status: 'error', message: 'Unknown queue.' },
      });
      await expect(h.service.isQueueReady(name)).resolves.toBe(false);
    }
    expect(h.service.probes.size).toBe(0);
    expect(h.temporal.client.getRawClient).not.toHaveBeenCalled();
    expect(h.prisma.organization.findFirst).not.toHaveBeenCalled();
    expect(h.redis.ping).not.toHaveBeenCalled();
  });

  test('all accepted names share a fixed bounded key set', async () => {
    const h = harness();
    for (const name of ['main', 'telegram', 'reddit', 'linkedin']) {
      await expect(h.service.isQueueReady(name)).resolves.toBe(true);
    }
    await expect(h.service.isReady()).resolves.toBe(true);
    expect(h.service.probes.size).toBe(6);
  });

  test.each([
    [
      'DB read refusal',
      (h) =>
        h.prisma.organization.findFirst.mockRejectedValue(
          new Error('private-sentinel DATABASE_URL')
        ),
    ],
    [
      'unexpected Redis reply',
      (h) => h.redis.ping.mockResolvedValue('NOT_PONG'),
    ],
    [
      'Redis command rejection',
      (h) =>
        h.redis.ping.mockRejectedValue(
          new Error('private-sentinel redis://credential')
        ),
    ],
    [
      'Temporal not SERVING',
      (h) => h.connection.healthService.check.mockResolvedValue({ status: 2 }),
    ],
    [
      'Temporal health rejection',
      (h) =>
        h.connection.healthService.check.mockRejectedValue(
          new Error('private-sentinel API_KEY')
        ),
    ],
    [
      'namespace refusal',
      (h) =>
        h.connection.workflowService.describeNamespace.mockRejectedValue(
          new Error('private-sentinel namespace')
        ),
    ],
    [
      'wrong namespace result',
      (h) =>
        h.connection.workflowService.describeNamespace.mockResolvedValue({
          namespaceInfo: { name: 'another-namespace' },
        }),
    ],
    [
      'missing namespace metadata',
      (h) =>
        h.connection.workflowService.describeNamespace.mockResolvedValue({}),
    ],
    [
      'task metadata refusal',
      (h) =>
        h.connection.workflowService.describeTaskQueue.mockRejectedValue(
          new Error('private-sentinel task')
        ),
    ],
    [
      'missing client',
      (h) => h.temporal.client.getRawClient.mockReturnValue(null),
    ],
    [
      'missing configured namespace',
      (h) => {
        delete h.raw.options.namespace;
      },
    ],
  ])('%s fails closed without leaking the cause', async (_case, cut) => {
    const h = harness();
    cut(h);
    let error;
    try {
      await h.controller.getReadiness();
    } catch (caught) {
      error = caught;
    }
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toEqual({
      status: 'error',
      message: 'Runtime dependencies are unavailable.',
    });
    expect(JSON.stringify(error.getResponse())).not.toContain(
      'private-sentinel'
    );
    expect(h.forbidden).not.toHaveBeenCalled();
  });

  test('the actual MockRedis cannot satisfy runtime readiness', async () => {
    const h = harness({ redis: new MockRedis() });
    await expect(h.service.isReady()).resolves.toBe(false);
    expect(h.forbidden).not.toHaveBeenCalled();
  });

  test.each(['reconnecting', 'wait', 'end', undefined])(
    'Redis status %s cannot enqueue a PING',
    async (status) => {
      const h = harness();
      h.redis.status = status;
      await expect(h.service.isReady()).resolves.toBe(false);
      expect(h.redis.ping).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['no pollers', { pollers: [] }],
    [
      'array seconds',
      { pollers: [{ lastAccessTime: { seconds: [BASE_TIME / 1000] } }] },
    ],
    [
      'whitespace seconds',
      {
        pollers: [
          { lastAccessTime: { seconds: ' ' + BASE_TIME / 1000 + ' ' } },
        ],
      },
    ],
    [
      'scientific seconds',
      { pollers: [{ lastAccessTime: { seconds: BASE_TIME / 1000 + 'e0' } }] },
    ],
    [
      'string nanos',
      {
        pollers: [
          { lastAccessTime: { seconds: String(BASE_TIME / 1000), nanos: '0' } },
        ],
      },
    ],
    [
      'array timestamp',
      {
        pollers: [
          {
            lastAccessTime: Object.assign([], {
              seconds: String(BASE_TIME / 1000),
            }),
          },
        ],
      },
    ],
    ['no poller field', {}],
    ['malformed poller list', { pollers: {} }],
    ['null poller', { pollers: [null] }],
    ['missing access timestamp', { pollers: [{}] }],
    ['missing seconds', { pollers: [{ lastAccessTime: {} }] }],
    ['fractional seconds', { pollers: [{ lastAccessTime: { seconds: 1.2 } }] }],
    [
      'invalid seconds',
      { pollers: [{ lastAccessTime: { seconds: 'invalid' } }] },
    ],
    [
      'unsafe seconds',
      { pollers: [{ lastAccessTime: { seconds: '99999999999999999' } }] },
    ],
    [
      'negative nanos',
      { pollers: [{ lastAccessTime: { seconds: '1790899200', nanos: -1 } }] },
    ],
    [
      'overflow nanos',
      {
        pollers: [
          { lastAccessTime: { seconds: '1790899200', nanos: 1000000000 } },
        ],
      },
    ],
  ])('%s is unavailable', async (_case, response) => {
    const h = harness();
    h.connection.workflowService.describeTaskQueue.mockResolvedValue(response);
    await expect(h.service.isQueueReady('telegram')).resolves.toBe(false);
  });

  test.each([
    [120000, true],
    [120001, false],
    [-1, false],
  ])('poller age %s ms has readiness %s', async (ageMs, expected) => {
    const h = harness();
    h.connection.workflowService.describeTaskQueue.mockResolvedValue({
      pollers: [{ lastAccessTime: timestamp(ageMs) }],
    });
    await expect(h.service.isQueueReady('telegram')).resolves.toBe(expected);
  });

  test('one fresh poller suffices among old entries and Long-like seconds decode safely', async () => {
    const h = harness();
    const fresh = timestamp();
    const seconds = fresh.seconds;
    fresh.seconds = { toString: () => seconds };
    h.connection.workflowService.describeTaskQueue.mockResolvedValue({
      pollers: [
        { lastAccessTime: timestamp(130000) },
        { lastAccessTime: fresh },
      ],
    });
    await expect(h.service.isQueueReady('telegram')).resolves.toBe(true);
  });

  test('locally excluded known provider can be healthy on a remote worker', async () => {
    const previous = process.env.EXCLUDE_QUEUE;
    process.env.EXCLUDE_QUEUE = 'telegram,main';
    try {
      const h = harness();
      await expect(h.service.isQueueReady('telegram')).resolves.toBe(true);
    } finally {
      if (previous === undefined) delete process.env.EXCLUDE_QUEUE;
      else process.env.EXCLUDE_QUEUE = previous;
    }
  });

  test('50 concurrent readiness requests coalesce and clear their timers', async () => {
    const h = harness();
    const intervals = jest.spyOn(global, 'setInterval');
    await expect(
      Promise.all(Array.from({ length: 50 }, () => h.service.isReady()))
    ).resolves.toEqual(Array(50).fill(true));
    expect(h.prisma.organization.findFirst).toHaveBeenCalledTimes(1);
    expect(h.redis.ping).toHaveBeenCalledTimes(1);
    expect(h.temporal.client.getRawClient).toHaveBeenCalledTimes(1);
    expect(intervals).not.toHaveBeenCalled();
    intervals.mockRestore();
    expect(h.forbidden).not.toHaveBeenCalled();
  });

  test.each([true, false])(
    'cached %s outcome expires exactly at five seconds',
    async (initial) => {
      const h = harness();
      h.connection.healthService.check.mockResolvedValue({
        status: initial ? 1 : 2,
      });
      await expect(h.service.isQueueReady('telegram')).resolves.toBe(initial);
      h.connection.healthService.check.mockResolvedValue({
        status: initial ? 2 : 1,
      });
      await jest.advanceTimersByTimeAsync(4999);
      await expect(h.service.isQueueReady('telegram')).resolves.toBe(initial);
      expect(h.connection.healthService.check).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(h.service.isQueueReady('telegram')).resolves.toBe(!initial);
      expect(h.connection.healthService.check).toHaveBeenCalledTimes(2);
    }
  );

  test.each(['database', 'redis'])(
    'stalled %s returns within 2s and cannot enqueue replacements',
    async (dependency) => {
      const h = harness();
      const work = deferred();
      const call =
        dependency === 'database'
          ? h.prisma.organization.findFirst
          : h.redis.ping;
      call.mockReturnValue(work.promise);
      const result = h.service.isReady();
      await jest.advanceTimersByTimeAsync(1999);
      let settled = false;
      void result.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBe(false);
      for (let n = 0; n < 3; n++) {
        await jest.advanceTimersByTimeAsync(5000);
        await expect(
          Promise.all(Array.from({ length: 20 }, () => h.service.isReady()))
        ).resolves.toEqual(Array(20).fill(false));
      }
      expect(call).toHaveBeenCalledTimes(1);
      expect(h.forbidden).not.toHaveBeenCalled();
    }
  );

  test.each(['resolve', 'reject'])(
    'late DB %s is observed and cannot overwrite the failed cache',
    async (completion) => {
      const h = harness();
      const work = deferred();
      h.prisma.organization.findFirst.mockReturnValueOnce(work.promise);
      const result = h.service.isReady();
      await jest.advanceTimersByTimeAsync(2000);
      await expect(result).resolves.toBe(false);
      if (completion === 'resolve')
        work.resolve({ id: 'synthetic-row-not-returned' });
      else work.reject(new Error('private-sentinel late database failure'));
      await jest.advanceTimersByTimeAsync(0);
      await expect(h.service.isReady()).resolves.toBe(false);
      expect(h.prisma.organization.findFirst).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(5000);
      await expect(h.service.isReady()).resolves.toBe(true);
      expect(h.prisma.organization.findFirst).toHaveBeenCalledTimes(2);
    }
  );

  test('a delayed event-loop completion cannot turn a budget overrun into success', async () => {
    const h = harness();
    const work = deferred();
    h.prisma.organization.findFirst.mockReturnValueOnce(work.promise);
    const result = h.service.isReady();
    await jest.advanceTimersByTimeAsync(0);
    jest.setSystemTime(BASE_TIME + 2001);
    work.resolve(null);
    await expect(result).resolves.toBe(false);
  });

  test('early RPC refusal keeps admission while another RPC remains unfinished', async () => {
    const h = harness();
    const work = deferred();
    h.connection.healthService.check.mockRejectedValue(
      new Error('private-sentinel cluster unavailable')
    );
    h.connection.workflowService.describeTaskQueue.mockImplementation(
      async (request) =>
        request.taskQueueType === 1
          ? work.promise
          : { pollers: [{ lastAccessTime: timestamp() }] }
    );
    const result = h.service.isQueueReady('main');
    await jest.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBe(false);
    await jest.advanceTimersByTimeAsync(10000);
    await expect(h.service.isQueueReady('main')).resolves.toBe(false);
    expect(h.temporal.client.getRawClient).toHaveBeenCalledTimes(1);
    expect(
      h.connection.workflowService.describeTaskQueue
    ).toHaveBeenCalledTimes(2);
    work.reject(new Error('private-sentinel late RPC failure'));
    await jest.advanceTimersByTimeAsync(0);
    expect(h.forbidden).not.toHaveBeenCalled();
  });
});

function request(origin, route) {
  return new Promise((resolve, reject) => {
    const outgoing = http.get(
      new URL(route, origin),
      { agent: false },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve({ status: response.statusCode, body })
        );
        response.on('error', reject);
      }
    );
    outgoing.on('error', reject);
    outgoing.setTimeout(3000, () =>
      outgoing.destroy(new Error('owned HTTP fixture timed out'))
    );
  });
}

describe('actual Nest wiring and public routes', () => {
  test('API module registers the same service token and leaves monitor outside auth middleware', () => {
    const h = harness();
    const substitutes = new Map();
    const sources = {
      [SERVICE_ALIAS]: SERVICE,
      '@contentfactory/backend/api/routes/monitor.controller': CONTROLLER,
    };
    const { ApiModule } = loadTypeScriptModule(
      'apps/backend/src/api/api.module.ts',
      h.mocks,
      {
        sources,
        resolve: (name) => {
          if (
            !name.startsWith('@contentfactory/') ||
            name in sources ||
            name in h.mocks
          )
            return undefined;
          if (!substitutes.has(name)) {
            const members = new Map();
            substitutes.set(
              name,
              new Proxy(
                {},
                {
                  get: (_target, member) => {
                    if (member === '__esModule') return true;
                    if (!members.has(member))
                      members.set(member, class ImportedPort {});
                    return members.get(member);
                  },
                }
              )
            );
          }
          return substitutes.get(name);
        },
      }
    );
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      ApiModule
    );
    const monitor = controllers.find(
      (controller) => controller.name === 'MonitorController'
    );
    const service = Reflect.getMetadata('design:paramtypes', monitor)[0];
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ApiModule)).toContain(
      service
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, ApiModule)).toContain(
      service
    );
    expect(Reflect.getMetadata('design:paramtypes', service)).toEqual([
      PrismaService,
      TemporalService,
    ]);
    const protectedRoutes = [];
    new ApiModule().configure({
      apply: () => ({
        forRoutes: (...routes) => protectedRoutes.push(...routes),
      }),
    });
    expect(protectedRoutes).not.toContain(monitor);
    expect(h.forbidden).not.toHaveBeenCalled();
  });

  test('real HTTP handlers retain liveness/success and send readiness503/unknown404 envelopes', async () => {
    const h = harness();
    h.redis.ping.mockResolvedValue('NOT_PONG');
    const { RootController } = loadTypeScriptModule(
      'apps/backend/src/api/routes/root.controller.ts'
    );
    const module = await Test.createTestingModule({
      controllers: [h.MonitorController, RootController],
      providers: [
        h.RuntimeMonitorService,
        { provide: PrismaService, useValue: h.prisma },
        { provide: TemporalService, useValue: h.temporal },
      ],
    }).compile();
    const app = module.createNestApplication({ logger: false });
    try {
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl();
      const alive = await request(origin, '/');
      expect(alive).toEqual({ status: 200, body: 'App is running!' });
      const unknown = await request(origin, '/monitor/queue/invented');
      expect(unknown.status).toBe(404);
      expect(JSON.parse(unknown.body)).toEqual({
        status: 'error',
        message: 'Unknown queue.',
      });
      expect(h.temporal.client.getRawClient).not.toHaveBeenCalled();
      const queue = await request(origin, '/monitor/queue/telegram');
      expect(queue.status).toBe(200);
      expect(JSON.parse(queue.body)).toEqual({
        status: 'success',
        message: 'Queue telegram is healthy.',
      });
      h.connection.workflowService.describeTaskQueue.mockRejectedValueOnce(
        new Error('private-sentinel transport failure')
      );
      const unavailable = await request(origin, '/monitor/queue/reddit');
      expect(unavailable.status).toBe(503);
      expect(JSON.parse(unavailable.body)).toEqual({
        status: 'error',
        message: 'Queue is unavailable.',
      });
      const readiness = await request(origin, '/monitor/ready');
      expect(readiness.status).toBe(503);
      expect(JSON.parse(readiness.body)).toEqual({
        status: 'error',
        message: 'Runtime dependencies are unavailable.',
      });
      expect(h.forbidden).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
