require('reflect-metadata');
const { createHash, randomBytes } = require('node:crypto');
const Redis = require('ioredis');
const { Reflector } = require('@nestjs/core');
const { Logger, ValidationPipe } = require('@nestjs/common');
const { ThrottlerException } = require('@nestjs/throttler');
const {
  ThrottlerStorageRedisService,
} = require('@nest-lab/throttler-storage-redis');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const {
  createRegistrationScriptRedis,
} = require('./helpers/registration-script-redis.cjs');

const SYNTHETIC_SECRET = 'registration-distributed-unit-secret-never-live';
const limiterPath =
  'libraries/nestjs-libraries/src/throttler/registration-limiter.ts';
const trackerPath =
  'libraries/nestjs-libraries/src/throttler/transient-client-tracker.ts';
const guardPath =
  'libraries/nestjs-libraries/src/throttler/throttler.provider.ts';
const opaque = (label) =>
  createHash('sha256').update(label).digest('hex').slice(0, 32);
const requestFor = (address = '198.51.100.42', path = '/auth/register') => ({
  method: 'POST',
  url: path,
  ip: '172.18.0.2',
  headers: {
    'x-forwarded-for': `${address}, 172.18.0.9`,
    'x-real-ip': '172.18.0.9',
    cookie: 'synthetic-private-cookie',
    'user-agent': 'synthetic-private-agent',
  },
  body: {
    email: 'synthetic-private@example.com',
    invitation: 'synthetic-private-invite',
  },
});

function loadLimiter(source) {
  return loadTypeScriptModule(limiterPath, {
    '../redis/redis.service': { ioRedis: source },
  });
}

function loadController(limiter) {
  return loadTypeScriptModule(
    'apps/backend/src/api/routes/auth.controller.ts',
    {
      '@contentfactory/backend/services/auth/auth.service': {
        AuthService: class {},
      },
      '@contentfactory/nestjs-libraries/services/email.service': {
        EmailService: class {},
      },
      '@contentfactory/nestjs-libraries/throttler/registration-limiter':
        limiter,
      '@contentfactory/nestjs-libraries/auth/team-invitation': {
        inspectTeamInvitation: async () => null,
        TeamInvitationError: class extends Error {},
      },
    }
  );
}

const guardContext = (request) => {
  class AuthController {}
  function register() {}
  return {
    getClass: () => AuthController,
    getHandler: () => register,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ header: jest.fn() }),
    }),
  };
};

async function createGuard(source, storage) {
  const { ThrottlerBehindProxyGuard } = loadTypeScriptModule(guardPath, {
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: source },
  });
  const guard = new ThrottlerBehindProxyGuard(
    { throttlers: [{ ttl: 3_600_000, limit: 90 }] },
    storage,
    new Reflector()
  );
  await guard.onModuleInit();
  return guard;
}

let originalSecret;
beforeAll(() => {
  originalSecret = process.env.JWT_SECRET;
});
beforeEach(() => {
  process.env.JWT_SECRET = SYNTHETIC_SECRET;
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

describe('registration distributed budget: deterministic failure and ownership cases', () => {
  let source;
  let module;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.UTC(2026, 9, 2, 12, 0, 59));
    source = createRegistrationScriptRedis();
    module = loadLimiter(source);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('two limiter instances share a held reservation and a new instance cannot reset it', async () => {
    const first = new module.RegistrationEffectLimiter(source);
    const second = new module.RegistrationEffectLimiter(source);
    expect(
      (await first.acquire(opaque('shared'), opaque('shared-previous'))).allowed
    ).toBe(true);
    expect(
      await second.acquire(opaque('shared'), opaque('shared-previous'))
    ).toEqual({ allowed: false, retryAfterSeconds: 60 });
    const restarted = new module.RegistrationEffectLimiter(source);
    expect(
      (await restarted.acquire(opaque('shared'), opaque('shared-previous')))
        .allowed
    ).toBe(false);
  });

  test('same deployment secret survives a fresh module, with separate attempt and effect domains', () => {
    const first = loadTypeScriptModule(trackerPath);
    const restarted = loadTypeScriptModule(trackerPath);
    const request = requestFor();
    const at = Date.now();
    const effect = first.createRegistrationClientTracker(request, at, 'effect');
    expect(effect).toMatch(/^[a-f0-9]{32}$/);
    expect(
      restarted.createRegistrationClientTracker(request, at, 'effect')
    ).toBe(effect);
    expect(
      first.createRegistrationClientTracker(request, at, 'attempt')
    ).not.toBe(effect);
    expect(
      first.createRegistrationClientTracker(request, at + 60_000, 'effect')
    ).not.toBe(effect);
    expect(first.createTransientClientTracker(request, at)).not.toBe(
      restarted.createTransientClientTracker(request, at)
    );
    process.env.JWT_SECRET = 'another-synthetic-secret';
    expect(
      first.createRegistrationClientTracker(request, at, 'effect')
    ).not.toBe(effect);
  });

  test.each([undefined, '', '   '])(
    'missing secret %p fails closed before any Redis call',
    async (secret) => {
      if (secret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = secret;
      await expect(
        module.acquireRegistrationEffect(requestFor())
      ).rejects.toMatchObject({ status: 503 });
      expect(source.connections).toHaveLength(0);
      expect(source.calls).toHaveLength(0);
    }
  );

  test('a MockRedis stand-in and a disconnected real client both fail closed', async () => {
    const { MockRedis } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/redis/redis.service.ts'
    );
    await expect(
      new module.RegistrationEffectLimiter(new MockRedis()).acquire(
        opaque('mock'),
        opaque('mock-prev')
      )
    ).rejects.toMatchObject({ status: 503 });
    source.status = 'reconnecting';
    await expect(
      new module.RegistrationEffectLimiter(source).acquire(
        opaque('disconnected'),
        opaque('disconnected-prev')
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(source.connections).toHaveLength(0);
  });

  test('each operation disconnects its no-replay duplicate without changing shared Redis options', async () => {
    const instance = new module.RegistrationEffectLimiter(source);
    const first = await instance.acquire(
      opaque('cleanup'),
      opaque('cleanup-prev')
    );
    expect(typeof first.reservation.owner).toBe('string');
    expect(first.reservation.owner).toMatch(/^[a-f0-9]{32}$/);
    expect(await instance.release(first.reservation)).toBe(true);
    expect(source.connections).toHaveLength(2);
    for (const connection of source.connections) {
      expect(connection.closed).toBe(true);
      expect(connection.options).toMatchObject({
        lazyConnect: true,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        maxRetriesPerRequest: 0,
        retryStrategy: null,
        reconnectOnError: null,
      });
    }
    expect(source.status).toBe('ready');
  });

  test('slow connect is cancelled and cannot send a late EVAL', async () => {
    let connect;
    const duplicate = source.duplicate.bind(source);
    source.duplicate = (options) => {
      const connection = duplicate(options);
      connection.connect = () =>
        new Promise((resolve) => {
          connect = resolve;
        });
      return connection;
    };
    const result = new module.RegistrationEffectLimiter(source)
      .acquire(opaque('slow-connect'), opaque('slow-connect-prev'))
      .catch((error) => error);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await result).toMatchObject({ status: 503 });
    expect(source.connections[0].closed).toBe(true);
    connect();
    await Promise.resolve();
    await Promise.resolve();
    expect(source.calls).toHaveLength(0);
  });

  test('slow EVAL times out without exposing request metadata or retrying', async () => {
    const duplicate = source.duplicate.bind(source);
    let evaluations = 0;
    source.duplicate = (options) => {
      const connection = duplicate(options);
      connection.eval = async () => {
        evaluations += 1;
        return new Promise(() => {});
      };
      return connection;
    };
    const result = module
      .acquireRegistrationEffect(requestFor())
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(1_000);
    const error = await result;
    expect(error).toMatchObject({ status: 503 });
    expect(JSON.stringify(error)).not.toMatch(/198\.51\.100|synthetic-private/);
    expect(evaluations).toBe(1);
    expect(source.connections[0].closed).toBe(true);
  });

  test('the process connection cap covers multiple instances and is returned after cancellation', async () => {
    const duplicate = source.duplicate.bind(source);
    source.duplicate = (options) => {
      const connection = duplicate(options);
      connection.connect = async () => new Promise(() => {});
      return connection;
    };
    const instances = [
      new module.RegistrationEffectLimiter(source),
      new module.RegistrationEffectLimiter(source),
    ];
    const results = Array.from({ length: 32 }, (_, index) =>
      instances[index % 2]
        .acquire(opaque(`cap-${index}`), opaque(`cap-prev-${index}`))
        .catch((error) => error)
    );
    expect(source.connections).toHaveLength(16);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(
      (await Promise.all(results)).every((error) => error.status === 503)
    ).toBe(true);
    expect(source.connections.every((connection) => connection.closed)).toBe(
      true
    );
    source.duplicate = duplicate;
    expect(
      (
        await instances[0].acquire(
          opaque('after-cap'),
          opaque('after-cap-prev')
        )
      ).allowed
    ).toBe(true);
  });

  test.each([[1], [1, 60_001], [0, -2], [-1, 0], null])(
    'unknown Redis reply %p fails closed and does not manufacture an admission',
    async (reply) => {
      const duplicate = source.duplicate.bind(source);
      source.duplicate = (options) => {
        const connection = duplicate(options);
        connection.eval = async () => reply;
        return connection;
      };
      await expect(
        module.acquireRegistrationEffect(requestFor())
      ).rejects.toMatchObject({ status: 503 });
      expect(source.connections[0].closed).toBe(true);
    }
  );

  test('release failure keeps the slot and cannot turn a refused write into a refund', async () => {
    const instance = new module.RegistrationEffectLimiter(source);
    const first = await instance.acquire(
      opaque('release-failure'),
      opaque('release-failure-prev')
    );
    source.status = 'reconnecting';
    await expect(instance.release(first.reservation)).resolves.toBe(false);
    source.status = 'ready';
    expect(
      (
        await instance.acquire(
          opaque('release-failure'),
          opaque('release-failure-prev')
        )
      ).allowed
    ).toBe(false);
  });

  test.each(['mock', 'disconnected', 'missing-secret', 'store-error'])(
    'registration guard fails closed for %s without invoking account work',
    async (failure) => {
      const store = {
        increment: jest.fn(async () => {
          throw new Error('synthetic-private-store-error');
        }),
      };
      let sourceClient = source;
      if (failure === 'mock') sourceClient = {};
      if (failure === 'disconnected') source.status = 'reconnecting';
      if (failure === 'missing-secret') delete process.env.JWT_SECRET;
      const guard = await createGuard(sourceClient, store);
      const controller = jest.fn();
      const result = guard
        .canActivate(guardContext(requestFor()))
        .then(() => controller())
        .catch((error) => error);
      const error = await result;
      expect(error).toMatchObject({ status: 503 });
      expect(JSON.stringify(error)).not.toMatch(
        /198\.51\.100|synthetic-private/
      );
      expect(controller).not.toHaveBeenCalled();
      expect(store.increment).toHaveBeenCalledTimes(
        failure === 'store-error' ? 1 : 0
      );
    }
  );

  test('a timed-out guard can count a late attempt but can never invoke the controller or retry', async () => {
    let finish;
    let enter;
    const entered = new Promise((resolve) => {
      enter = resolve;
    });
    const store = {
      increment: jest.fn(() => {
        enter();
        return new Promise((resolve) => {
          finish = resolve;
        });
      }),
    };
    const guard = await createGuard(source, store);
    const controller = jest.fn();
    const result = guard
      .canActivate(guardContext(requestFor()))
      .then(() => controller())
      .catch((error) => error);
    await entered;
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await result).toMatchObject({ status: 503 });
    finish({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(controller).not.toHaveBeenCalled();
    expect(store.increment).toHaveBeenCalledTimes(1);
  });

  test('a controller cannot reach account work when effect Redis fails', async () => {
    source.status = 'reconnecting';
    const { AuthController } = loadController(module);
    const routeAuth = jest.fn();
    const controller = new AuthController(
      { routeAuth },
      { hasProvider: () => false }
    );
    await expect(
      controller.register(
        {},
        {},
        'synthetic-address',
        'synthetic-agent',
        requestFor()
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(routeAuth).not.toHaveBeenCalled();
  });

  test.each(['success', 'rejection'])(
    'guard saturation stays bounded after timeouts until late %s settles the actual operations',
    async (outcome) => {
      const completions = [];
      let entered;
      const allEntered = new Promise((resolve) => {
        entered = resolve;
      });
      const store = {
        increment: jest.fn(
          () =>
            new Promise((resolve, reject) => {
              completions.push({ resolve, reject });
              if (completions.length === 16) entered();
            })
        ),
      };
      const guard = await createGuard(source, store);
      const controller = jest.fn();
      const run = () =>
        guard
          .canActivate(guardContext(requestFor()))
          .then(() => controller())
          .catch((error) => error);
      const attempts = Array.from({ length: 16 }, run);
      await allEntered;
      expect(await run()).toMatchObject({ status: 503 });
      expect(store.increment).toHaveBeenCalledTimes(16);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(
        (await Promise.all(attempts)).every((error) => error.status === 503)
      ).toBe(true);
      expect(await run()).toMatchObject({ status: 503 });
      expect(store.increment).toHaveBeenCalledTimes(16);
      const admitted = {
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
      for (const completion of completions) {
        if (outcome === 'success') completion.resolve(admitted);
        else
          completion.reject(new Error('synthetic-private-late-redis-failure'));
      }
      await jest.advanceTimersByTimeAsync(0);
      expect(controller).not.toHaveBeenCalled();
      store.increment.mockResolvedValue(admitted);
      expect(await guard.canActivate(guardContext(requestFor()))).toBe(true);
      expect(store.increment).toHaveBeenCalledTimes(17);
      expect(controller).not.toHaveBeenCalled();
    }
  );
});

const redisUrl = process.env.CF_REGISTRATION_TEST_REDIS_URL;
const describeRealRedis = redisUrl ? describe : describe.skip;
describeRealRedis(
  'registration distributed budget: actual disposable Redis',
  () => {
    let clientA;
    let clientB;
    let limiterModuleA;
    let limiterModuleB;
    let caseNumber = 0;
    const heldKeys = new Set();
    beforeAll(async () => {
      const parsed = new URL(redisUrl);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
        throw new Error(
          'Registration integration tests require an owned loopback Redis'
        );
      }
      const options = {
        lazyConnect: true,
        connectTimeout: 1_000,
        commandTimeout: 2_000,
        maxRetriesPerRequest: 0,
        retryStrategy: null,
        autoResendUnfulfilledCommands: false,
      };
      clientA = new Redis(redisUrl, options).on('error', () => {});
      clientB = new Redis(redisUrl, options).on('error', () => {});
      await Promise.all([clientA.connect(), clientB.connect()]);
      limiterModuleA = loadLimiter(clientA);
      limiterModuleB = loadLimiter(clientB);
    });
    beforeEach(() => {
      caseNumber += 1;
      // Isolate this owned Redis namespace from repeated test invocations while
      // preserving one shared deployment secret across this case's replicas.
      process.env.JWT_SECRET = `${SYNTHETIC_SECRET}-${randomBytes(16).toString(
        'hex'
      )}`;
    });
    afterEach(async () => {
      for (const key of heldKeys) await clientA.del(key);
      heldKeys.clear();
    });
    afterAll(() => {
      clientA?.disconnect();
      clientB?.disconnect();
    });

    function remember(admission) {
      if (admission.allowed) {
        heldKeys.add(admission.reservation.key);
        if (admission.reservation.previousKey)
          heldKeys.add(admission.reservation.previousKey);
      }
      return admission;
    }

    async function acquire(instance, label = 'caller') {
      const admission = await instance.acquire(
        opaque(`real-${caseNumber}-${label}`),
        opaque(`real-${caseNumber}-${label}-prev`)
      );
      return remember(admission);
    }

    test('two replicas and a fresh module share one atomic concurrent effect slot', async () => {
      const instances = [
        new limiterModuleA.RegistrationEffectLimiter(clientA),
        new limiterModuleB.RegistrationEffectLimiter(clientB),
      ];
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, index) => acquire(instances[index % 2]))
      );
      expect(results.filter((admission) => admission.allowed)).toHaveLength(1);
      expect(results.filter((admission) => !admission.allowed)).toHaveLength(
        11
      );
      const restarted = loadLimiter(clientB);
      expect(
        (await acquire(new restarted.RegistrationEffectLimiter(clientB)))
          .allowed
      ).toBe(false);
      expect((await acquire(instances[1], 'another-caller')).allowed).toBe(
        true
      );
    });

    test('actual Redis owns expiry and a stale owner cannot release its replacement', async () => {
      const firstInstance = new limiterModuleA.RegistrationEffectLimiter(
        clientA
      );
      const secondInstance = new limiterModuleB.RegistrationEffectLimiter(
        clientB
      );
      const first = await acquire(firstInstance);
      expect(await clientA.get(first.reservation.key)).toBe(
        first.reservation.owner
      );
      expect(await clientA.get(first.reservation.previousKey)).toBe(
        first.reservation.owner
      );
      expect(await clientA.pttl(first.reservation.key)).toBeGreaterThan(59_000);
      expect(await clientA.pttl(first.reservation.key)).toBeLessThanOrEqual(
        60_000
      );
      // Deliberately expire this test's key to exercise stale ownership promptly.
      // The separate 60-second test below proves the unmodified production TTL.
      await clientA.pexpire(first.reservation.key, 1);
      await clientA.pexpire(first.reservation.previousKey, 1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const replacement = await acquire(secondInstance);
      expect(replacement.allowed).toBe(true);
      expect(replacement.reservation.owner).not.toBe(first.reservation.owner);
      expect(await firstInstance.release(first.reservation)).toBe(false);
      expect((await acquire(firstInstance)).allowed).toBe(false);
      expect(await secondInstance.release(replacement.reservation)).toBe(true);
      expect((await acquire(firstInstance)).allowed).toBe(true);
    });

    test('current/previous HMAC rotation keeps the actual unmodified 60-second expiry', async () => {
      const tracker = loadTypeScriptModule(trackerPath);
      const request = requestFor('198.51.100.43');
      const at = Date.UTC(2026, 9, 2, 13, 0, 59);
      const keysAt = (time) => [
        tracker.createRegistrationClientTracker(request, time, 'effect'),
        tracker.createRegistrationClientTracker(
          request,
          time - 60_000,
          'effect'
        ),
      ];
      const firstInstance = new limiterModuleA.RegistrationEffectLimiter(
        clientA
      );
      const secondInstance = new limiterModuleB.RegistrationEffectLimiter(
        clientB
      );
      const first = remember(await firstInstance.acquire(...keysAt(at)));
      const remaining = await clientA.pttl(first.reservation.key);
      expect(remaining).toBeGreaterThan(59_000);
      expect(remaining).toBeLessThanOrEqual(60_000);
      expect(await clientA.pttl(first.reservation.previousKey)).toBeGreaterThan(
        59_000
      );
      expect(
        await clientA.pttl(first.reservation.previousKey)
      ).toBeLessThanOrEqual(60_000);
      expect(
        (await secondInstance.acquire(...keysAt(at + 2_000))).allowed
      ).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, remaining + 50));
      expect(await clientA.get(first.reservation.key)).toBeNull();
      expect(await clientA.get(first.reservation.previousKey)).toBeNull();
      const next = remember(
        await secondInstance.acquire(...keysAt(at + 60_000))
      );
      expect(next.allowed).toBe(true);
    }, 65_000);

    test('safe releases permit correction across replicas while no request metadata enters Redis', async () => {
      const first = remember(
        await limiterModuleA.acquireRegistrationEffect(
          requestFor('198.51.100.44')
        )
      );
      expect(
        await limiterModuleB.releaseRegistrationEffect(first.reservation)
      ).toBe(true);
      const corrected = remember(
        await limiterModuleB.acquireRegistrationEffect(
          requestFor('198.51.100.44')
        )
      );
      expect(corrected.allowed).toBe(true);
      const keys = [...heldKeys];
      const values = await Promise.all(keys.map((key) => clientA.get(key)));
      expect(JSON.stringify({ keys, values })).not.toMatch(
        /198\.51\.100|synthetic-private|@example|172\.18/
      );
    });

    test('all short effect connections close while both shared clients remain usable', async () => {
      const instance = new limiterModuleA.RegistrationEffectLimiter(clientA);
      const first = await acquire(instance);
      expect(await instance.release(first.reservation)).toBe(true);
      await Promise.all([clientA.ping(), clientB.ping()]);
      const clients = await clientA.info('clients');
      expect(clients).toMatch(/connected_clients:2\r?\n/);
      expect(clientA.status).toBe('ready');
      expect(clientB.status).toBe('ready');
    });

    const loadGuard = async (client) => {
      return createGuard(client, new ThrottlerStorageRedisService(client));
    };

    test('ten independent abuse attempts remain charged across replicas and a restarted guard', async () => {
      const guardA = await loadGuard(clientA);
      const guardB = await loadGuard(clientB);
      const context = guardContext(requestFor('198.51.100.45'));
      const clock = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.UTC(2026, 9, 2, 14, 0, 10));
      const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      try {
        for (let attempt = 0; attempt < 10; attempt += 1)
          expect(await guardA.canActivate(context)).toBe(true);
        await expect(guardB.canActivate(context)).rejects.toBeInstanceOf(
          ThrottlerException
        );
        const restarted = await loadGuard(clientB);
        await expect(restarted.canActivate(context)).rejects.toBeInstanceOf(
          ThrottlerException
        );
        expect(JSON.stringify(warning.mock.calls)).not.toMatch(
          /198\.51\.100|synthetic-private/
        );
      } finally {
        warning.mockRestore();
        clock.mockRestore();
      }
    });

    test.each([
      ['old then new', false],
      ['new then delayed old', true],
    ])(
      '%s arrival across a minute boundary cannot acquire two reservations',
      async (_label, reversed) => {
        const tracker = loadTypeScriptModule(trackerPath);
        const request = requestFor('198.51.100.46');
        const at = Date.UTC(2026, 9, 2, 15, 0, 59);
        const keysAt = (time) => [
          tracker.createRegistrationClientTracker(request, time, 'effect'),
          tracker.createRegistrationClientTracker(
            request,
            time - 60_000,
            'effect'
          ),
        ];
        const first = new limiterModuleA.RegistrationEffectLimiter(clientA);
        const second = new limiterModuleB.RegistrationEffectLimiter(clientB);
        expect(
          remember(await first.acquire(...keysAt(reversed ? at + 2_000 : at)))
            .allowed
        ).toBe(true);
        expect(
          remember(await second.acquire(...keysAt(reversed ? at : at + 2_000)))
            .allowed
        ).toBe(false);
      }
    );

    test('actual Redis counts DTO and all typed form refusals independently while corrected retries release effects across replicas', async () => {
      const { CreateOrgUserDto } = loadTypeScriptModule(
        'libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts'
      );
      const pipe = new ValidationPipe({ transform: true, whitelist: true });
      const guardA = await loadGuard(clientA);
      const guardB = await loadGuard(clientB);
      const request = requestFor('198.51.100.47');
      const context = guardContext(request);
      const clock = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.UTC(2026, 9, 2, 16, 0, 10));
      const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const trackedModule = (limiter) => ({
        ...limiter,
        acquireRegistrationEffect: async (req) =>
          remember(await limiter.acquireRegistrationEffect(req)),
      });
      const ControllerA = loadController(
        trackedModule(limiterModuleA)
      ).AuthController;
      const ControllerB = loadController(
        trackedModule(limiterModuleB)
      ).AuthController;
      const serviceA = { routeAuth: jest.fn() };
      const serviceB = { routeAuth: jest.fn() };
      const controllers = [
        new ControllerA(serviceA, {}),
        new ControllerB(serviceB, {}),
      ];
      const codes = [
        'email_plus_not_allowed',
        'email_already_exists',
        'invite_email_mismatch',
      ];
      const body = {
        provider: 'LOCAL',
        email: 'registrant@example.com',
        password: 'Secret!7',
      };
      try {
        expect(await guardA.canActivate(context)).toBe(true);
        await expect(
          pipe.transform(
            { ...body, email: 'invalid' },
            { type: 'body', metatype: CreateOrgUserDto }
          )
        ).rejects.toMatchObject({ status: 400 });
        for (let attempt = 0; attempt < 9; attempt += 1) {
          const module = attempt % 2 === 0 ? limiterModuleA : limiterModuleB;
          const service = attempt % 2 === 0 ? serviceA : serviceB;
          service.routeAuth.mockRejectedValueOnce(
            new module.RegistrationFormRefusal(codes[attempt % 3])
          );
          expect(
            await (attempt % 2 === 0 ? guardA : guardB).canActivate(context)
          ).toBe(true);
          const dto = await pipe.transform(body, {
            type: 'body',
            metatype: CreateOrgUserDto,
          });
          const response = {
            header: jest.fn(),
            status: jest.fn(function () {
              return this;
            }),
            send: jest.fn(),
          };
          await controllers[attempt % 2].register(
            dto,
            response,
            'synthetic-address',
            'synthetic-agent',
            request
          );
          expect(response.status).toHaveBeenCalledWith(400);
        }
        await expect(guardB.canActivate(context)).rejects.toBeInstanceOf(
          ThrottlerException
        );
        expect(
          serviceA.routeAuth.mock.calls.length +
            serviceB.routeAuth.mock.calls.length
        ).toBe(9);
        for (const key of heldKeys) expect(await clientA.exists(key)).toBe(0);
      } finally {
        warning.mockRestore();
        clock.mockRestore();
      }
    });
  }
);
