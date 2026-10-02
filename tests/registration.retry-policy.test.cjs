require('reflect-metadata');
const { createHash } = require('node:crypto');
const { Reflector } = require('@nestjs/core');
const { HttpException, ValidationPipe, Logger } = require('@nestjs/common');
const {
  ThrottlerException,
  ThrottlerStorageService,
} = require('@nestjs/throttler');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const {
  createRegistrationScriptRedis,
} = require('./helpers/registration-script-redis.cjs');
const registrationRedis = createRegistrationScriptRedis();
const opaque = (label) =>
  createHash('sha256').update(label).digest('hex').slice(0, 32);

const limiter = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/throttler/registration-limiter.ts',
  { '../redis/redis.service': { ioRedis: registrationRedis } }
);
const { RegistrationEffectLimiter, RegistrationFormRefusal } = limiter;
const { CreateOrgUserDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts'
);
const { ThrottlerBehindProxyGuard } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/throttler/throttler.provider.ts',
  {
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: registrationRedis,
    },
  }
);
const { AuthController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/auth.controller.ts',
  {
    '@contentfactory/backend/services/auth/auth.service': {
      AuthService: class {},
    },
    '@contentfactory/nestjs-libraries/services/email.service': {
      EmailService: class {},
    },
    '@contentfactory/nestjs-libraries/throttler/registration-limiter': limiter,
    '@contentfactory/nestjs-libraries/auth/team-invitation': {
      inspectTeamInvitation: async () => null,
      TeamInvitationError: class extends Error {},
    },
  }
);

let originalSecret;
beforeEach(() => {
  originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'registration-retry-unit-secret-never-live';
  registrationRedis.reset();
  jest.useFakeTimers();
  jest.setSystemTime(Date.UTC(2026, 9, 1, 0, 0, 10));
});
afterEach(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('registration effect reservation ownership', () => {
  test('only one concurrent caller owns a given effect slot', async () => {
    const slots = new RegistrationEffectLimiter(registrationRedis);
    const [first, second] = await Promise.all([
      slots.acquire(opaque('current'), opaque('previous')),
      slots.acquire(opaque('current'), opaque('previous')),
    ]);
    expect(first.allowed).toBe(true);
    expect(second).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  test('a pre-write release opens only that caller’s slot', async () => {
    const slots = new RegistrationEffectLimiter(registrationRedis);
    const first = await slots.acquire(
      opaque('caller-a'),
      opaque('caller-a-previous')
    );
    const other = await slots.acquire(
      opaque('caller-b'),
      opaque('caller-b-previous')
    );
    expect(await slots.release(first.reservation)).toBe(true);
    expect(
      (await slots.acquire(opaque('caller-a'), opaque('caller-a-previous')))
        .allowed
    ).toBe(true);
    expect(
      (await slots.acquire(opaque('caller-b'), opaque('caller-b-previous')))
        .allowed
    ).toBe(false);
    expect(await slots.release(other.reservation)).toBe(true);
  });

  test('an expired owner cannot release the newer owner of the same key', async () => {
    const slots = new RegistrationEffectLimiter(registrationRedis);
    const first = await slots.acquire(
      opaque('same-key'),
      opaque('previous-key')
    );
    // Move the clock without delivering its timer yet: acquisition must also
    // enforce expiry, and the old request may still fail afterwards.
    jest.setSystemTime(Date.now() + 60_000);
    const second = await slots.acquire(
      opaque('same-key'),
      opaque('previous-key')
    );
    expect(second.allowed).toBe(true);
    expect(second.reservation.owner).not.toBe(first.reservation.owner);
    expect(await slots.release(first.reservation)).toBe(false);
    expect(
      (await slots.acquire(opaque('same-key'), opaque('previous-key'))).allowed
    ).toBe(false);
  });

  test('minute rotation keeps the previous owner held for all sixty seconds', async () => {
    const slots = new RegistrationEffectLimiter(registrationRedis);
    await slots.acquire(opaque('minute-one'), opaque('minute-zero'));
    jest.advanceTimersByTime(50_000);
    expect(
      await slots.acquire(opaque('minute-two'), opaque('minute-one'))
    ).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
    jest.advanceTimersByTime(10_000);
    expect(
      (await slots.acquire(opaque('minute-two'), opaque('minute-one'))).allowed
    ).toBe(true);
  });
});

describe('registration corrections and independent budgets', () => {
  let guard;
  let storage;
  let routeAuth;
  let controller;
  let responses;
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  beforeEach(async () => {
    storage = new ThrottlerStorageService();
    guard = new ThrottlerBehindProxyGuard(
      { throttlers: [{ ttl: 3_600_000, limit: 90 }] },
      storage,
      new Reflector()
    );
    await guard.onModuleInit();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    routeAuth = jest.fn(async () => ({
      jwt: 'synthetic-session',
      awaitingApproval: false,
    }));
    controller = new AuthController(
      { routeAuth },
      { hasProvider: () => false }
    );
    responses = [];
  });
  afterEach(() => {
    storage.onApplicationShutdown();
  });

  const submit = async ({
    address = '198.51.100.24',
    path = '/auth/register',
    fields = {},
  } = {}) => {
    const request = {
      method: 'POST',
      url: path,
      ip: '172.18.0.2',
      headers: {
        'x-forwarded-for': `${address}, 172.18.0.9`,
        'x-real-ip': '172.18.0.9',
      },
      socket: { remoteAddress: '172.18.0.2' },
    };
    const response = {
      statusCode: 200,
      header: jest.fn(),
      cookie: jest.fn(),
      status: jest.fn((code) => {
        response.statusCode = code;
        return response;
      }),
      json: jest.fn(() => response),
      send: jest.fn(() => response),
    };
    responses.push(response);
    const context = {
      getClass: () => AuthController,
      getHandler: () => AuthController.prototype.register,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    };
    await guard.canActivate(context);
    const body = await pipe.transform(
      {
        provider: 'LOCAL',
        email: 'registrant@example.com',
        password: 'Secret!7',
        ...fields,
      },
      { type: 'body', metatype: CreateOrgUserDto }
    );
    await controller.register(
      body,
      response,
      address,
      'synthetic-agent',
      request
    );
    return response;
  };

  test('DTO error then corrected form succeeds without claiming an effect slot for validation', async () => {
    await expect(
      submit({ fields: { email: 'invalid' } })
    ).rejects.toMatchObject({ status: 400 });
    expect((await submit()).statusCode).toBe(200);
    expect(routeAuth).toHaveBeenCalledTimes(1);
  });

  test.each([
    'email_plus_not_allowed',
    'email_already_exists',
    'invite_email_mismatch',
  ])(
    'an ordinary %s refusal permits the corrected attempt immediately',
    async (code) => {
      routeAuth.mockRejectedValueOnce(new RegistrationFormRefusal(code));
      expect((await submit()).statusCode).toBe(400);
      expect(
        (await submit({ fields: { email: 'corrected@example.com' } }))
          .statusCode
      ).toBe(200);
      expect(routeAuth).toHaveBeenCalledTimes(2);
    }
  );

  test('ten ordinary refusals exhaust the independent attempt budget', async () => {
    routeAuth.mockRejectedValue(
      new RegistrationFormRefusal('email_already_exists')
    );
    for (let attempt = 0; attempt < 10; attempt += 1)
      expect((await submit()).statusCode).toBe(400);
    await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
    expect(routeAuth).toHaveBeenCalledTimes(10);
  });

  test('malformed DTO attempts also exhaust the attempt budget without reaching the service', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        submit({ fields: { email: 'invalid' } })
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
    expect(routeAuth).not.toHaveBeenCalled();
  });

  test.each(['/auth/REGISTER', '/AUTH/REGISTER'])(
    'safe form refusals exhaust the shared canonical and mixed-case %s budget',
    async (path) => {
      routeAuth.mockRejectedValue(
        new RegistrationFormRefusal('email_already_exists')
      );
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect(
          (
            await submit({
              path: attempt % 2 === 0 ? '/auth/register' : path,
            })
          ).statusCode
        ).toBe(400);
      }
      await expect(submit({ path })).rejects.toBeInstanceOf(ThrottlerException);
      await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
      expect(routeAuth).toHaveBeenCalledTimes(10);
    }
  );

  test.each(['/auth/REGISTER', '/AUTH/REGISTER'])(
    'malformed DTO attempts exhaust the shared canonical and mixed-case %s budget',
    async (path) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(
          submit({
            path: attempt % 2 === 0 ? path : '/auth/register',
            fields: { email: 'invalid' },
          })
        ).rejects.toMatchObject({ status: 400 });
      }
      await expect(
        submit({ path, fields: { email: 'invalid' } })
      ).rejects.toBeInstanceOf(ThrottlerException);
      await expect(
        submit({ fields: { email: 'invalid' } })
      ).rejects.toBeInstanceOf(ThrottlerException);
      expect(routeAuth).not.toHaveBeenCalled();
    }
  );

  test('success holds the one-per-minute effect ceiling and returns 429 on a second request', async () => {
    expect((await submit()).statusCode).toBe(200);
    await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
    expect(routeAuth).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      'approval',
      { awaitingApproval: true, jwt: '' },
      false,
      { approval: true },
    ],
    [
      'activation',
      { awaitingApproval: false, jwt: 'pending' },
      true,
      { activate: true },
    ],
    [
      'invitation',
      {
        awaitingApproval: false,
        jwt: 'invited-session',
        invitation: {
          organizationId: 'invited-org',
          workspaceName: 'Studio',
          role: 'EDITOR',
        },
      },
      false,
      {
        register: true,
        invitation: {
          organizationId: 'invited-org',
          workspaceName: 'Studio',
          role: 'EDITOR',
        },
      },
    ],
  ])(
    'the %s success branch keeps its response and holds the effect ceiling',
    async (_case, result, hasProvider, reply) => {
      routeAuth.mockResolvedValueOnce(result);
      controller = new AuthController(
        { routeAuth },
        { hasProvider: () => hasProvider }
      );
      const response = await submit();
      expect(response.statusCode).toBe(200);
      expect(response.json).toHaveBeenCalledWith(reply);
      await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
      expect(routeAuth).toHaveBeenCalledTimes(1);
    }
  );

  test('the effect hold survives the real HMAC minute rotation until its sixty-second expiry', async () => {
    await submit();
    jest.advanceTimersByTime(50_000);
    await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
    expect(responses.at(-1).header).toHaveBeenCalledWith('Retry-After', '10');
    jest.advanceTimersByTime(10_000);
    expect((await submit()).statusCode).toBe(200);
    expect(routeAuth).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['matching message', () => new Error('Email already exists')],
    ['unknown 400', () => new HttpException('Email already exists', 400)],
    ['database failure', () => new Error('Database write failed')],
    ['provider failure', () => new Error('Provider verification failed')],
    [
      'mail failure after account creation',
      () => new Error('Activation mail failed'),
    ],
  ])(
    '%s retains the slot even when the request was refused',
    async (_case, error) => {
      routeAuth.mockRejectedValueOnce(error());
      expect((await submit()).statusCode).toBe(400);
      await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
      expect(routeAuth).toHaveBeenCalledTimes(1);
    }
  );

  test('service HTTP 429 is preserved and does not refund a possibly effectful attempt', async () => {
    routeAuth.mockRejectedValueOnce(
      new HttpException('Provider rate limited', 429)
    );
    await expect(submit()).rejects.toMatchObject({ status: 429 });
    await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
    expect(routeAuth).toHaveBeenCalledTimes(1);
  });

  test('effect slots isolate callers behind the same proxy', async () => {
    expect((await submit()).statusCode).toBe(200);
    expect((await submit({ address: '198.51.100.25' })).statusCode).toBe(200);
    await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
    expect(routeAuth).toHaveBeenCalledTimes(2);
  });

  test('the trailing slash shares the same effect slot', async () => {
    await submit();
    await expect(submit({ path: '/auth/register/' })).rejects.toBeInstanceOf(
      ThrottlerException
    );
    expect(routeAuth).toHaveBeenCalledTimes(1);
  });

  test('an in-flight attempt owns the slot; its pre-write refusal then permits correction', async () => {
    let rejectFirst;
    let enter;
    const entered = new Promise((resolve) => {
      enter = resolve;
    });
    routeAuth.mockImplementationOnce(() => {
      enter();
      return new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
    });
    const pending = submit();
    await entered;
    await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
    rejectFirst(new RegistrationFormRefusal('email_already_exists'));
    expect((await pending).statusCode).toBe(400);
    expect((await submit()).statusCode).toBe(200);
    expect(routeAuth).toHaveBeenCalledTimes(2);
  });

  test('the form refusal response waits for its Redis release before an immediate correction', async () => {
    let completeRelease;
    let enter;
    const entered = new Promise((resolve) => {
      enter = resolve;
    });
    const duplicate = registrationRedis.duplicate;
    registrationRedis.duplicate = (options) => {
      const connection = duplicate(options);
      const evaluate = connection.eval;
      connection.eval = async (script, ...args) => {
        if (script.includes("redis.call('DEL'")) {
          enter();
          await new Promise((resolve) => {
            completeRelease = resolve;
          });
        }
        return evaluate(script, ...args);
      };
      return connection;
    };
    try {
      routeAuth.mockRejectedValueOnce(
        new RegistrationFormRefusal('email_already_exists')
      );
      let responded = false;
      const pending = submit().then((response) => {
        responded = true;
        return response;
      });
      await entered;
      await Promise.resolve();
      expect(responded).toBe(false);
      completeRelease();
      expect((await pending).statusCode).toBe(400);
      expect((await submit()).statusCode).toBe(200);
    } finally {
      registrationRedis.duplicate = duplicate;
    }
  });

  test('a slow old refusal after expiry cannot unlock a later successful attempt', async () => {
    let rejectFirst;
    let enter;
    const entered = new Promise((resolve) => {
      enter = resolve;
    });
    routeAuth.mockImplementationOnce(() => {
      enter();
      return new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
    });
    const pending = submit();
    await entered;
    jest.advanceTimersByTime(60_000);
    expect((await submit()).statusCode).toBe(200);
    rejectFirst(new RegistrationFormRefusal('email_already_exists'));
    expect((await pending).statusCode).toBe(400);
    await expect(submit()).rejects.toBeInstanceOf(ThrottlerException);
    expect(routeAuth).toHaveBeenCalledTimes(2);
  });
});
