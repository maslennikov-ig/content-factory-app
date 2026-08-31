const { Reflector } = require('@nestjs/core');
const { Logger } = require('@nestjs/common');
const {
  ThrottlerException,
  ThrottlerStorageService,
} = require('@nestjs/throttler');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const throttlerModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/throttler/throttler.provider.ts',
  {},
  {
    sources: {
      './transient-client-tracker':
        'libraries/nestjs-libraries/src/throttler/transient-client-tracker.ts',
    },
  }
);

const { createTransientClientTracker, ThrottlerBehindProxyGuard } =
  throttlerModule;

// One handler identity per route, because `generateKey` mixes the handler name
// into the storage key: two routes must not share a budget by accident, and the
// same route must reuse its own across calls.
const handlers = new Map();
function handlerFor(path) {
  if (!handlers.has(path)) {
    const name = path.replace(/[^a-z]+/gi, '_');
    handlers.set(path, { [name]: function () {} }[name]);
  }
  return handlers.get(path);
}

function requestContext(url, address = '198.51.100.24', headers = {}) {
  const request = {
    method: 'POST',
    url,
    headers: {
      'x-forwarded-for': address,
      'user-agent': 'not-part-of-the-tracker',
      cookie: 'not-part-of-the-tracker',
      ...headers,
    },
    ip: '172.18.0.2',
    socket: { remoteAddress: '172.18.0.2' },
  };
  const response = { header: jest.fn() };
  const handler = handlerFor(url.replace(/\/+$/, '') || url);
  const controller = class AuthController {};

  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
}

function trackerFor(headers, at = Date.UTC(2026, 7, 19, 12, 0, 10)) {
  return createTransientClientTracker({ headers }, at);
}

function createGuard() {
  const storage = new ThrottlerStorageService();
  const guard = new ThrottlerBehindProxyGuard(
    { throttlers: [{ ttl: 3_600_000, limit: 90 }] },
    storage,
    new Reflector()
  );
  return { guard, storage };
}

describe('registration and recovery throttling', () => {
  test('a repeated registration from one caller is refused while another caller remains independent', async () => {
    const { guard, storage } = createGuard();
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await guard.onModuleInit();

    await expect(
      guard.canActivate(requestContext('/auth/register'))
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(requestContext('/auth/register'))
    ).rejects.toBeInstanceOf(ThrottlerException);
    await expect(
      guard.canActivate(requestContext('/auth/register', '198.51.100.25'))
    ).resolves.toBe(true);
    expect(warning).toHaveBeenCalledWith(
      'Auth throttle exhausted for POST /auth/register'
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain('198.51.100.24');

    warning.mockRestore();
    storage.onApplicationShutdown();
  });

  test('registration with a trailing slash shares the canonical caller budget', async () => {
    const { guard, storage } = createGuard();
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await guard.onModuleInit();

    await expect(
      guard.canActivate(requestContext('/auth/register'))
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(requestContext('/auth/register/'))
    ).rejects.toBeInstanceOf(ThrottlerException);

    warning.mockRestore();
    storage.onApplicationShutdown();
  });

  test('forgot-password has a bounded per-caller budget', async () => {
    const { guard, storage } = createGuard();
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await guard.onModuleInit();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        guard.canActivate(requestContext('/auth/forgot'))
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(requestContext('/auth/forgot'))
    ).rejects.toBeInstanceOf(ThrottlerException);
    await expect(
      guard.canActivate(requestContext('/auth/forgot', '198.51.100.25'))
    ).resolves.toBe(true);

    warning.mockRestore();
    storage.onApplicationShutdown();
  });

  test('forgot-password with a trailing slash spends the canonical caller budget', async () => {
    const { guard, storage } = createGuard();
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await guard.onModuleInit();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        guard.canActivate(requestContext('/auth/forgot'))
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(requestContext('/auth/forgot/'))
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(requestContext('/auth/forgot'))
    ).rejects.toBeInstanceOf(ThrottlerException);

    warning.mockRestore();
    storage.onApplicationShutdown();
  });

  test('the transient tracker stores neither request metadata nor a raw address', () => {
    expect(typeof createTransientClientTracker).toBe('function');
    const at = Date.UTC(2026, 7, 19, 12, 0, 10);
    const first = createTransientClientTracker(
      requestContext('/auth/register', '::ffff:192.0.2.8')
        .switchToHttp()
        .getRequest(),
      at
    );
    const equivalent = createTransientClientTracker(
      requestContext('/auth/register', '192.0.2.8')
        .switchToHttp()
        .getRequest(),
      at
    );
    const nextBucket = createTransientClientTracker(
      requestContext('/auth/register', '192.0.2.8')
        .switchToHttp()
        .getRequest(),
      at + 60_000
    );

    const withHopHeader = createTransientClientTracker(
      requestContext('/auth/register', '192.0.2.8', {
        'x-real-ip': '172.18.0.9',
      })
        .switchToHttp()
        .getRequest(),
      at
    );

    expect(first).toBe(equivalent);
    expect(withHopHeader).toBe(equivalent);
    expect(nextBucket).not.toBe(first);
    expect(first).not.toContain('192.0.2.8');
    expect(first).not.toContain('not-part-of-the-tracker');
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  test('a constant hop address does not merge distinct callers into one budget', () => {
    // What the deployed topology actually delivers: Caddy writes the real
    // client into both headers, then the in-container nginx overwrites
    // `X-Real-IP` with its own peer — Caddy — and appends that peer to the
    // forwarded chain. Every caller therefore shares one `X-Real-IP`, and only
    // the first element of `X-Forwarded-For` still tells them apart.
    const caddy = '172.18.0.9';
    const first = trackerFor({
      'x-real-ip': caddy,
      'x-forwarded-for': '198.51.100.24, 172.18.0.9',
    });
    const second = trackerFor({
      'x-real-ip': caddy,
      'x-forwarded-for': '198.51.100.25, 172.18.0.9',
    });

    expect(first).not.toBe(second);
  });

  test('an ingress that only sets x-real-ip still identifies the caller', () => {
    const withRealIpOnly = trackerFor({ 'x-real-ip': '198.51.100.24' });
    const withForwardedFor = trackerFor({
      'x-forwarded-for': '198.51.100.24',
    });

    expect(withRealIpOnly).toBe(withForwardedFor);
  });

  test('login has a bounded per-caller budget', async () => {
    const { guard, storage } = createGuard();
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await guard.onModuleInit();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        guard.canActivate(requestContext('/auth/login'))
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(requestContext('/auth/login'))
    ).rejects.toBeInstanceOf(ThrottlerException);
    await expect(
      guard.canActivate(requestContext('/auth/login', '198.51.100.25'))
    ).resolves.toBe(true);
    expect(warning).toHaveBeenCalledWith(
      'Auth throttle exhausted for POST /auth/login'
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain('198.51.100.24');

    warning.mockRestore();
    storage.onApplicationShutdown();
  });

  test('resend-activation has a bounded per-caller budget', async () => {
    const { guard, storage } = createGuard();
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await guard.onModuleInit();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        guard.canActivate(requestContext('/auth/resend-activation'))
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(requestContext('/auth/resend-activation'))
    ).rejects.toBeInstanceOf(ThrottlerException);
    await expect(
      guard.canActivate(
        requestContext('/auth/resend-activation', '198.51.100.25')
      )
    ).resolves.toBe(true);

    warning.mockRestore();
    storage.onApplicationShutdown();
  });

  test('resend-activation with a trailing slash spends the canonical caller budget', async () => {
    const { guard, storage } = createGuard();
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await guard.onModuleInit();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        guard.canActivate(requestContext('/auth/resend-activation'))
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(requestContext('/auth/resend-activation/'))
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(requestContext('/auth/resend-activation'))
    ).rejects.toBeInstanceOf(ThrottlerException);

    warning.mockRestore();
    storage.onApplicationShutdown();
  });

  test('a throttled route spends nothing on another throttled route', async () => {
    const { guard, storage } = createGuard();
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await guard.onModuleInit();

    await expect(
      guard.canActivate(requestContext('/auth/register'))
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(requestContext('/auth/login'))
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(requestContext('/auth/resend-activation'))
    ).resolves.toBe(true);

    warning.mockRestore();
    storage.onApplicationShutdown();
  });

  test('a GET on a throttled path is left alone', async () => {
    const { guard, storage } = createGuard();
    await guard.onModuleInit();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const context = requestContext('/auth/login');
      context.switchToHttp().getRequest().method = 'GET';
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    storage.onApplicationShutdown();
  });

  test('public post throttling keeps its existing organization tracker and default budget', async () => {
    const { guard, storage } = createGuard();
    await guard.onModuleInit();
    const context = requestContext('/public/v1/posts');
    context.switchToHttp().getRequest().org = { id: 'organization-1' };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);

    storage.onApplicationShutdown();
  });
});
