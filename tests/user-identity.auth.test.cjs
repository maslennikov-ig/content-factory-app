const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
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

const nest = {
  Injectable: () => (target) => target,
  Controller: () => (target) => target,
  Get: () => () => undefined,
  Post: () => () => undefined,
  Delete: () => () => undefined,
  Body: () => () => undefined,
  Param: () => () => undefined,
  Query: () => () => undefined,
  Req: () => () => undefined,
  Res: () => () => undefined,
  Logger: class {
    log() {}
    error() {}
  },
  HttpException: class HttpException extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
    getStatus() {
      return this.status;
    }
  },
};

const prisma = {
  Provider: {
    LOCAL: 'LOCAL',
    GITHUB: 'GITHUB',
    GOOGLE: 'GOOGLE',
    FARCASTER: 'FARCASTER',
    WALLET: 'WALLET',
    GENERIC: 'GENERIC',
    TELEGRAM: 'TELEGRAM',
  },
  Role: { SUPERADMIN: 'SUPERADMIN' },
};

/**
 * A Redis that can be made to forget. The confirmation store is only as good as
 * its expiry and its one-shot delete, so the fake honours `EX` against a clock
 * the test moves rather than pretending twenty minutes never pass.
 */
const redisClock = { now: 0 };
const redisEntries = new Map();
const fakeRedis = {
  async set(key, value, mode, ttlSeconds) {
    redisEntries.set(key, {
      value,
      expiresAt:
        String(mode).toUpperCase() === 'EX'
          ? redisClock.now + ttlSeconds * 1000
          : Infinity,
    });
    return 'OK';
  },
  async get(key) {
    const entry = redisEntries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= redisClock.now) {
      redisEntries.delete(key);
      return null;
    }
    return entry.value;
  },
  async del(key) {
    return redisEntries.delete(key) ? 1 : 0;
  },
};

const identityConfirmation = loadTypeScriptModule(
  'apps/backend/src/services/auth/identity-confirmation.ts',
  {
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: fakeRedis,
    },
  }
);

const userIdentityHelpers = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/user-identity.ts',
  { '@prisma/client': prisma }
);

const { UsersRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {},
    '@nestjs/common': nest,
    '@prisma/client': prisma,
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { hashPassword: (value) => `hashed:${value}` },
    },
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'temporary',
    },
    '@contentfactory/nestjs-libraries/database/prisma/users/user-identity':
      userIdentityHelpers,
  }
);

const authMocks = {
  '@nestjs/common': nest,
  '@prisma/client': prisma,
  '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
    CreateOrgUserDto: class CreateOrgUserDto {},
  },
  '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto': {
    LoginUserDto: class LoginUserDto {},
  },
  '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {},
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
    {},
  '@contentfactory/helpers/auth/auth.service': {
    AuthService: {
      comparePassword: () => true,
      signJWT: () => 'jwt',
      verifyJWT: () => ({}),
      hashPassword: (value) => `hashed:${value}`,
    },
  },
  '@contentfactory/backend/services/auth/identity-confirmation':
    identityConfirmation,
  '@contentfactory/helpers/auth/registration.approval': {
    registrationRequiresApproval: () => false,
  },
  '@contentfactory/backend/services/auth/providers/providers.manager': {},
  '@contentfactory/backend/services/auth/providers.interface': {},
  '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
    {},
  '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto': {},
  '@contentfactory/nestjs-libraries/services/email.service': {},
  '@contentfactory/nestjs-libraries/newsletter/newsletter.service': {
    NewsletterService: { register: async () => undefined },
  },
  // The real consent rule, not a stub: registration now decides consent before
  // the account exists, and a copy here would drift from the shipped rule.
  '@contentfactory/helpers/auth/newsletter.consent': loadTypeScriptModule(
    'libraries/helpers/src/auth/newsletter.consent.ts'
  ),
  '@contentfactory/nestjs-libraries/dtos/users/link-user-identity.dto': {},
  // The real catalog, not a stand-in: several tests below assert the actual
  // translated subject/body text these emails carry.
  '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
    'libraries/nestjs-libraries/src/locale/backend-strings.ts'
  ),
};

const { AuthService } = loadTypeScriptModule(
  'apps/backend/src/services/auth/auth.service.ts',
  authMocks
);

const { UsersController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/users.controller.ts',
  {
    '@nestjs/common': nest,
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => undefined,
    },
    jsonwebtoken: { sign: () => 'jwt' },
    '@prisma/client': prisma,
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service':
      {},
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/services/stripe.service': {},
    '@contentfactory/backend/services/auth/auth.service': {},
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { verifyJWT: (token) => ({ id: token }) },
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
      {},
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: () => () => undefined,
    },
    '@contentfactory/helpers/subdomain/subdomain.management': {
      getCookieUrlFromDomain: () => 'example.com',
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: { FREE: { channel: 1 } },
    },
    '@nestjs/swagger': { ApiTags: () => (target) => target },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {},
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/link-user-identity.dto': {},
    '@contentfactory/nestjs-libraries/services/exception.filter': {
      HttpForbiddenException: class extends Error {},
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      {
        AuthorizationActions: { Create: 'Create' },
        Sections: { ADMIN: 'ADMIN' },
      },
  }
);

const oauthStates = new Map();
const oauthRedis = {
  set: jest.fn(async (key, value) => {
    oauthStates.set(key, value);
    return 'OK';
  }),
  getdel: jest.fn(async (key) => {
    const value = oauthStates.get(key) || null;
    oauthStates.delete(key);
    return value;
  }),
};
const providerInterfaceMock = {
  AuthProviderAbstract: class {},
  AuthProvider: () => (target) => target,
};
const providerStateHelpers = loadTypeScriptModule(
  'apps/backend/src/services/auth/providers/oauth.state.ts',
  {
    '@contentfactory/backend/services/auth/providers.interface': {},
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: oauthRedis,
    },
  }
);
const googleTokenCalls = [];
class FakeGoogleOAuth2 {
  constructor(config) {
    this.config = config;
  }
  generateAuthUrl(options) {
    const url = new URL('https://accounts.google.test/auth');
    Object.entries(options).forEach(([key, value]) => {
      if (key !== 'scope') url.searchParams.set(key, String(value));
    });
    return url.toString();
  }
  async getToken(code) {
    googleTokenCalls.push({ code, redirectUri: this.config.redirectUri });
    return { tokens: { access_token: 'google-access-token' } };
  }
  setCredentials() {}
}
const fakeGoogleApis = {
  auth: { OAuth2: FakeGoogleOAuth2 },
  oauth2: () => ({ userinfo: { get: async () => ({ data: {} }) } }),
};
const { GoogleProvider } = loadTypeScriptModule(
  'apps/backend/src/services/auth/providers/google.provider.ts',
  {
    googleapis: { google: fakeGoogleApis },
    // The SDK is loaded lazily now, so the provider asks the shared loader for
    // it rather than importing `googleapis` at module scope.
    '@contentfactory/nestjs-libraries/integrations/social/google.sdk': {
      loadGoogleApis: async () => ({ google: fakeGoogleApis }),
    },
    '@contentfactory/backend/services/auth/providers.interface':
      providerInterfaceMock,
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: oauthRedis,
    },
    '@contentfactory/backend/services/auth/providers/oauth.state':
      providerStateHelpers,
  }
);
const { GithubProvider } = loadTypeScriptModule(
  'apps/backend/src/services/auth/providers/github.provider.ts',
  {
    '@contentfactory/backend/services/auth/providers.interface':
      providerInterfaceMock,
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: oauthRedis,
    },
    '@contentfactory/backend/services/auth/providers/oauth.state':
      providerStateHelpers,
  }
);

function repositoryWith(model, transaction = { $transaction: jest.fn() }) {
  return new UsersRepository({ model }, { model: transaction });
}

test('provider login resolves the identity first and keeps the legacy fallback', async () => {
  const identityUser = { id: 'identity-user', activated: true };
  const legacyUser = { id: 'legacy-user', activated: true };
  const model = {
    userIdentity: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ user: identityUser })
        .mockResolvedValueOnce(null),
    },
    user: { findFirst: jest.fn().mockResolvedValue(legacyUser) },
  };
  const repository = repositoryWith(model);

  await expect(
    repository.getUserByProvider('telegram-42', 'TELEGRAM')
  ).resolves.toEqual(identityUser);
  await expect(
    repository.getUserByProvider('not-backfilled', 'TELEGRAM')
  ).resolves.toEqual(legacyUser);
});

test('linking an external provider uses the authenticated account and verified provider id, never provider email', async () => {
  const linked = [];
  const userService = {
    linkIdentity: async (userId, provider, providerIdentifier) => {
      linked.push({ userId, provider, providerIdentifier });
      return linked[0];
    },
    getUserByEmail: jest.fn(() => {
      throw new Error('provider email must not select an account');
    }),
  };
  const provider = {
    getToken: async () => 'verified-token',
    getUser: async (token) => {
      expect(token).toBe('verified-token');
      return { id: 'google-subject-7', email: 'someone-else@example.com' };
    },
  };
  const authService = new AuthService(
    userService,
    {},
    {},
    {},
    { getProvider: () => provider }
  );

  await expect(
    authService.linkIdentity(
      'session-user',
      {
        provider: 'GOOGLE',
        code: 'one-time-code',
        redirectUri: 'https://app.example/settings',
      },
      { state: 'state', browserState: 'state' }
    )
  ).resolves.toEqual({
    userId: 'session-user',
    provider: 'GOOGLE',
    providerIdentifier: 'google-subject-7',
  });
  expect(linked).toEqual([
    {
      userId: 'session-user',
      provider: 'GOOGLE',
      providerIdentifier: 'google-subject-7',
    },
  ]);
});

test('the authenticated identities route ignores a caller-supplied user id', async () => {
  const calls = [];
  const authService = {
    linkIdentity: async (userId, body) => {
      calls.push({ userId, body });
      return { success: true };
    },
  };
  const controller = new UsersController(null, null, authService, null, {});
  const body = {
    userId: 'attacker-selected-user',
    provider: 'GOOGLE',
    code: 'one-time-code',
  };
  process.env.FRONTEND_URL = 'https://app.example';

  try {
    await expect(
      controller.linkIdentity({ id: 'session-user' }, body, {
        cookies: { oauth_state: 'browser-state' },
        headers: {
          auth: 'session-user',
          origin: 'https://app.example',
          'content-type': 'application/json; charset=utf-8',
        },
      })
    ).resolves.toEqual({ success: true });
  } finally {
    delete process.env.FRONTEND_URL;
  }
  expect(calls).toEqual([
    {
      userId: 'session-user',
      body,
    },
  ]);
});

test.each([
  {
    endpoint: 'linkIdentity',
    headers: {
      auth: 'session-user',
      origin: 'https://app.example',
      'content-type': 'application/x-www-form-urlencoded',
    },
    label: 'cross-site form content type',
  },
  {
    endpoint: 'unlinkIdentity',
    headers: {
      auth: 'session-user',
      origin: 'https://evil.example',
      'content-type': 'application/json',
    },
    label: 'wrong origin',
  },
  {
    endpoint: 'linkIdentity',
    headers: {
      auth: 'admin-actor',
      origin: 'https://app.example',
      'content-type': 'application/json',
    },
    label: 'impersonated session actor',
  },
  {
    endpoint: 'unlinkIdentity',
    headers: {
      auth: 'admin-actor',
      origin: 'https://app.example',
      'content-type': 'application/json',
    },
    label: 'impersonated unlink actor',
  },
])('$endpoint rejects $label', async ({ endpoint, headers }) => {
  const authCalls = [];
  const userCalls = [];
  const controller = new UsersController(
    null,
    null,
    { linkIdentity: async (...args) => authCalls.push(args) },
    null,
    { unlinkIdentity: async (...args) => userCalls.push(args) }
  );
  const user = { id: 'session-user' };
  const body = {
    provider: 'GOOGLE',
    providerIdentifier: 'google-7',
    code: 'one-time-code',
  };
  const request = { headers, cookies: {} };
  process.env.FRONTEND_URL = 'https://app.example';

  try {
    const action = Promise.resolve().then(() =>
      endpoint === 'linkIdentity'
        ? controller.linkIdentity(user, body, request)
        : controller.unlinkIdentity(user, body, request)
    );
    await expect(action).rejects.toMatchObject({ status: 403 });
  } finally {
    delete process.env.FRONTEND_URL;
  }
  expect(authCalls).toEqual([]);
  expect(userCalls).toEqual([]);
});

test('the confirmation route is held to the same request checks as linking', async () => {
  const calls = [];
  const controller = new UsersController(
    null,
    null,
    {
      confirmIdentityLink: async (...args) => {
        calls.push(args);
        return { provider: 'LOCAL' };
      },
    },
    null,
    {}
  );
  process.env.FRONTEND_URL = 'https://app.example';

  try {
    await expect(
      controller.confirmIdentity({ id: 'session-user' }, { token: 'abc' }, {
        cookies: {},
        headers: {
          auth: 'session-user',
          origin: 'https://app.example',
          'content-type': 'application/json',
        },
      })
    ).resolves.toEqual({ provider: 'LOCAL' });

    await expect(
      Promise.resolve().then(() =>
        controller.confirmIdentity({ id: 'session-user' }, { token: 'abc' }, {
          cookies: {},
          headers: {
            auth: 'admin-actor',
            origin: 'https://app.example',
            'content-type': 'application/json',
          },
        })
      )
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    delete process.env.FRONTEND_URL;
  }
  expect(calls).toEqual([['session-user', 'abc']]);
});

test('an unconfigured FRONTEND_URL is reported as a deployment fault, not a refused caller', async () => {
  const controller = new UsersController(null, null, {}, null, {});
  delete process.env.FRONTEND_URL;

  await expect(
    Promise.resolve().then(() =>
      controller.linkIdentity({ id: 'session-user' }, { provider: 'LOCAL' }, {
        cookies: {},
        headers: {
          auth: 'session-user',
          origin: 'https://app.example',
          'content-type': 'application/json',
        },
      })
    )
  ).rejects.toMatchObject({ status: 500 });
});

test.each([
  ['GOOGLE', GoogleProvider],
  ['GITHUB', GithubProvider],
])(
  '%s uses random browser-bound one-time state and refuses foreign or replayed callbacks',
  async (_providerName, ProviderClass) => {
    process.env.FRONTEND_URL = 'https://app.example';
    process.env.YOUTUBE_CLIENT_ID = 'google-client';
    process.env.YOUTUBE_CLIENT_SECRET = 'google-secret';
    process.env.GITHUB_CLIENT_ID = 'github-client';
    process.env.GITHUB_CLIENT_SECRET = 'github-secret';
    oauthStates.clear();
    oauthRedis.set.mockClear();
    oauthRedis.getdel.mockClear();
    googleTokenCalls.length = 0;
    global.fetch = jest.fn(async () => ({
      json: async () => ({ access_token: 'github-access-token' }),
    }));

    try {
      const provider = new ProviderClass();
      const first = new URL(
        await provider.generateLink({
          redirect_uri: 'https://app.example/settings',
        })
      );
      const second = new URL(
        await provider.generateLink({
          redirect_uri: 'https://app.example/settings',
        })
      );
      const state = first.searchParams.get('state');

      expect(state).toMatch(/^[\w-]{43}$/);
      expect(second.searchParams.get('state')).not.toBe(state);
      expect(first.searchParams.get('redirect_uri')).toBe(
        'https://app.example/settings'
      );

      await expect(
        provider.getToken('foreign-code', 'https://app.example/settings', {
          state,
          browserState: 'foreign-browser-state',
        })
      ).rejects.toThrow(/state|browser/i);
      expect(oauthRedis.getdel).not.toHaveBeenCalled();
      expect(googleTokenCalls).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();

      await expect(
        provider.getToken('valid-code', 'https://app.example/settings', {
          state,
          browserState: state,
        })
      ).resolves.toMatch(/access-token/);

      const callsAfterSuccess =
        googleTokenCalls.length + global.fetch.mock.calls.length;
      await expect(
        provider.getToken('replayed-code', 'https://app.example/settings', {
          state,
          browserState: state,
        })
      ).rejects.toThrow(/state|expired/i);
      expect(googleTokenCalls.length + global.fetch.mock.calls.length).toBe(
        callsAfterSuccess
      );
    } finally {
      delete process.env.FRONTEND_URL;
      delete process.env.YOUTUBE_CLIENT_ID;
      delete process.env.YOUTUBE_CLIENT_SECRET;
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
      delete global.fetch;
    }
  }
);

test('an identity owned by another account is refused without moving it', async () => {
  const model = {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'identity-1',
        userId: 'owner-user',
      }),
      create: jest.fn(),
    },
  };
  const repository = repositoryWith(model, {
    $transaction: (callback) => callback(model),
  });

  await expect(
    repository.linkIdentity('attacker-user', 'GOOGLE', 'google-subject-7')
  ).rejects.toMatchObject({ status: 409 });
  expect(model.userIdentity.create).not.toHaveBeenCalled();
});

test.each([
  {
    provider: 'LOCAL',
    providerIdentifier: ' Legacy.Owner@Example.COM ',
    legacyUser: {
      id: 'legacy-local-owner',
      email: 'legacy.owner@example.com',
      providerName: 'LOCAL',
      providerId: '',
    },
  },
  {
    provider: 'TELEGRAM',
    providerIdentifier: 'telegram-legacy-42',
    legacyUser: {
      id: 'legacy-telegram-owner',
      email: 'legacy@example.com',
      providerName: 'TELEGRAM',
      providerId: 'telegram-legacy-42',
    },
  },
])(
  'a legacy $provider credential cannot be shadowed before backfill',
  async ({ provider, providerIdentifier, legacyUser }) => {
    const tx = {
      userIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'attacker-user', providerName: 'GOOGLE' }),
        findFirst: jest.fn(async ({ where }) =>
          provider !== 'LOCAL' || where.email?.mode === 'insensitive'
            ? legacyUser
            : null
        ),
        update: jest.fn(),
      },
    };
    const repository = repositoryWith(
      {},
      { $transaction: (callback) => callback(tx) }
    );

    await expect(
      repository.linkIdentity(
        'attacker-user',
        provider,
        providerIdentifier,
        provider === 'LOCAL' ? 'hashed:attacker-secret' : undefined
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.userIdentity.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  }
);

test('legacy LOCAL login fallback matches mixed-case email before backfill', async () => {
  const legacyUser = {
    id: 'legacy-local-user',
    email: 'Mixed.Case@Example.COM',
    providerName: 'LOCAL',
    password: 'hash',
  };
  const model = {
    userIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    user: {
      findFirst: jest.fn(async ({ where }) =>
        where.email?.mode === 'insensitive' ? legacyUser : null
      ),
    },
  };
  const repository = repositoryWith(model);

  await expect(
    repository.getUserByEmail(' mixed.case@example.com ')
  ).resolves.toEqual(legacyUser);
});

test('the last identity cannot be unlinked', async () => {
  const tx = {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'identity-1',
        userId: 'session-user',
        provider: 'TELEGRAM',
      }),
      count: jest.fn().mockResolvedValue(1),
      delete: jest.fn(),
    },
    user: { update: jest.fn() },
  };
  const repository = repositoryWith(
    {},
    { $transaction: (callback) => callback(tx) }
  );

  await expect(
    repository.unlinkIdentity('session-user', 'TELEGRAM', 'telegram-42')
  ).rejects.toMatchObject({ status: 409 });
  expect(tx.userIdentity.delete).not.toHaveBeenCalled();
});

test('unlink retries a serializable conflict and then preserves the observed last identity', async () => {
  const makeTx = (count) => ({
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'identity-telegram',
        userId: 'session-user',
        provider: 'TELEGRAM',
      }),
      count: jest.fn().mockResolvedValue(count),
      delete: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue({
        id: 'identity-google',
        provider: 'GOOGLE',
        providerIdentifier: 'google-7',
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'session-user',
        email: 'user@example.com',
        providerName: 'GOOGLE',
        providerId: 'google-7',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  });
  const firstAttempt = makeTx(2);
  const retryAttempt = makeTx(1);
  const options = [];
  let attempt = 0;
  const transaction = {
    $transaction: jest.fn(async (callback, transactionOptions) => {
      options.push(transactionOptions);
      attempt += 1;
      if (attempt === 1) {
        await callback(firstAttempt);
        throw { code: 'P2034' };
      }
      return callback(retryAttempt);
    }),
  };
  const repository = repositoryWith({}, transaction);

  await expect(
    repository.unlinkIdentity('session-user', 'TELEGRAM', 'telegram-42')
  ).rejects.toMatchObject({ status: 409 });
  expect(transaction.$transaction).toHaveBeenCalledTimes(2);
  expect(options).toEqual([
    { isolationLevel: 'Serializable' },
    { isolationLevel: 'Serializable' },
  ]);
  expect(firstAttempt.userIdentity.delete).toHaveBeenCalledTimes(1);
  expect(retryAttempt.userIdentity.delete).not.toHaveBeenCalled();
});

test('unlink stops retrying P2034 after three attempts and says so as 503', async () => {
  const transaction = {
    $transaction: jest.fn(async (_callback, options) => {
      expect(options).toEqual({ isolationLevel: 'Serializable' });
      throw { code: 'P2034', marker: 'last-conflict' };
    }),
  };
  const repository = repositoryWith({}, transaction);

  // The caller learns it is contention and can retry, instead of receiving a
  // raw Prisma code as an unexplained 500.
  await expect(
    repository.unlinkIdentity('session-user', 'TELEGRAM', 'telegram-42')
  ).rejects.toMatchObject({ status: 503 });
  expect(transaction.$transaction).toHaveBeenCalledTimes(3);
});

test('one account cannot hold two password sign-in methods', async () => {
  const tx = {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue({
        id: 'identity-local',
        provider: 'LOCAL',
        providerIdentifier: 'first@example.com',
      }),
      create: jest.fn(),
    },
    user: { findFirst: jest.fn(), update: jest.fn() },
  };
  const repository = repositoryWith(
    {},
    { $transaction: (callback) => callback(tx) }
  );

  await expect(
    repository.linkIdentity(
      'session-user',
      'LOCAL',
      'second@example.com',
      'hashed:secret'
    )
  ).rejects.toMatchObject({ status: 409 });
  expect(tx.userIdentity.create).not.toHaveBeenCalled();
  expect(tx.user.update).not.toHaveBeenCalled();
});

test('the claim check refuses a second password method before anything is written', async () => {
  const model = {
    userIdentity: {
      findFirst: jest.fn().mockResolvedValue({ id: 'identity-local' }),
      findUnique: jest.fn(),
    },
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
  };
  const repository = repositoryWith(model);

  await expect(
    repository.assertLocalIdentityClaimable('session-user', 'second@example.com')
  ).rejects.toMatchObject({ status: 409 });
  expect(model.userIdentity.findUnique).not.toHaveBeenCalled();
});

test('a legacy password account is refused a second address before the backfill runs', async () => {
  // No identity rows exist yet, so `providerName` is the only thing that knows
  // this account already signs in with a password.
  const model = {
    userIdentity: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'legacy-user', providerName: 'LOCAL' }),
      findFirst: jest.fn(),
    },
  };
  const repository = repositoryWith(model);

  await expect(
    repository.assertLocalIdentityClaimable('legacy-user', 'another@example.com')
  ).rejects.toMatchObject({ status: 409 });
  expect(model.userIdentity.findUnique).not.toHaveBeenCalled();
});

test('a repeated link returns the same three fields as the first one', async () => {
  const tx = {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue({
        userId: 'session-user',
        provider: 'GOOGLE',
        providerIdentifier: 'google-7',
        linkedAt: 'earlier',
      }),
      create: jest.fn(),
    },
  };
  const repository = repositoryWith(
    {},
    { $transaction: (callback) => callback(tx) }
  );

  // No `id`, no `userId`: the idempotent answer is the same shape as the one
  // the creating branch projects.
  await expect(
    repository.linkIdentity('session-user', 'GOOGLE', 'google-7')
  ).resolves.toEqual({
    provider: 'GOOGLE',
    providerIdentifier: 'google-7',
    linkedAt: 'earlier',
  });
  expect(tx.userIdentity.create).not.toHaveBeenCalled();
});

test('removing one password method while another remains keeps the password', async () => {
  const tx = {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'identity-local-one',
        userId: 'session-user',
        provider: 'LOCAL',
      }),
      count: jest
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1),
      delete: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue({
        id: 'identity-telegram',
        provider: 'TELEGRAM',
        providerIdentifier: 'telegram-42',
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'session-user',
        email: 'telegram@example.com',
        providerName: 'TELEGRAM',
        providerId: 'telegram-42',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const repository = repositoryWith(
    {},
    { $transaction: (callback) => callback(tx) }
  );

  await expect(
    repository.unlinkIdentity('session-user', 'LOCAL', 'one@example.com')
  ).resolves.toEqual({ success: true });
  expect(tx.user.update).not.toHaveBeenCalled();
});

test('unlinking the only LOCAL identity clears the password', async () => {
  const tx = {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'identity-local',
        userId: 'session-user',
        provider: 'LOCAL',
      }),
      // Two identities before the delete, no LOCAL identity after it.
      count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0),
      delete: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue({
        id: 'identity-telegram',
        provider: 'TELEGRAM',
        providerIdentifier: 'telegram-42',
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'session-user',
        email: 'telegram@example.com',
        providerName: 'TELEGRAM',
        providerId: 'telegram-42',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const repository = repositoryWith(
    {},
    { $transaction: (callback) => callback(tx) }
  );

  await expect(
    repository.unlinkIdentity('session-user', 'LOCAL', ' User@Example.COM ')
  ).resolves.toEqual({ success: true });
  expect(tx.user.update).toHaveBeenCalledWith({
    where: { id: 'session-user' },
    data: { password: null },
  });
});

test('choosing LOCAL after unlinking the primary external identity updates every legacy primary field', async () => {
  const tx = {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'identity-telegram',
        userId: 'session-user',
        provider: 'TELEGRAM',
      }),
      count: jest.fn().mockResolvedValue(2),
      delete: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue({
        id: 'identity-local',
        provider: 'LOCAL',
        providerIdentifier: 'local.login@example.com',
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'session-user',
        email: 'telegram-contact@example.com',
        providerName: 'TELEGRAM',
        providerId: 'telegram-42',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const repository = repositoryWith(
    {},
    { $transaction: (callback) => callback(tx) }
  );

  await expect(
    repository.unlinkIdentity('session-user', 'TELEGRAM', 'telegram-42')
  ).resolves.toEqual({ success: true });
  expect(tx.user.update).toHaveBeenCalledWith({
    where: { id: 'session-user' },
    data: {
      email: 'local.login@example.com',
      providerName: 'LOCAL',
      providerId: '',
    },
  });
});

test('password reset works for a linked LOCAL identity even when another provider is primary', async () => {
  const sent = [];
  const authService = new AuthService(
    {
      getUserByEmail: async () => ({
        id: 'telegram-origin-user',
        email: 'telegram-contact@example.com',
        providerName: 'TELEGRAM',
      }),
      hasLocalSignIn: async () => true,
    },
    {},
    {
      sendEmail: async (email) => sent.push(email),
    },
    {},
    {}
  );

  await authService.forgot(' Local.Login@Example.COM ');

  // The account's own address, not the one typed into the form.
  expect(sent).toEqual(['telegram-contact@example.com']);
});

test('the reset email is translated to the account language, not sent in English', async () => {
  const sent = [];
  const authService = new AuthService(
    {
      getUserByEmail: async () => ({
        id: 'ru-user',
        email: 'ru-owner@example.com',
        language: 'ru',
      }),
      hasLocalSignIn: async () => true,
    },
    {},
    {
      sendEmail: async (to, subject, html, replyTo, language) =>
        sent.push({ to, subject, html, replyTo, language }),
    },
    {},
    {}
  );

  await authService.forgot('ru-owner@example.com');

  expect(sent).toHaveLength(1);
  expect(sent[0].subject).toBe('Сброс пароля');
  expect(sent[0].subject).not.toBe('Reset your password');
  expect(sent[0].language).toBe('ru');
});

test('a reset email for an account with no stored language falls back to English', async () => {
  const sent = [];
  const authService = new AuthService(
    {
      getUserByEmail: async () => ({
        id: 'legacy-user',
        email: 'legacy@example.com',
      }),
      hasLocalSignIn: async () => true,
    },
    {},
    {
      sendEmail: async (to, subject) => sent.push(subject),
    },
    {},
    {}
  );

  await authService.forgot('legacy@example.com');

  expect(sent).toEqual(['Reset your password']);
});

test('a reset request never mails a link to the address that was typed in', async () => {
  // The exact shape of the reported attack: an address the attacker attached to
  // their own account. Whatever put it there, the reset link must not follow
  // the typed address into the victim's mailbox — it would hand them a working
  // way into the attacker's account, and they would never know.
  const sent = [];
  const attackerAccount = {
    id: 'attacker-user',
    email: 'attacker@example.test',
    providerName: 'GOOGLE',
  };
  const authService = new AuthService(
    {
      getUserByEmail: async () => attackerAccount,
      hasLocalSignIn: async () => true,
    },
    {},
    { sendEmail: async (email) => sent.push(email) },
    {},
    {}
  );

  await authService.forgot('victim@example.test');

  expect(sent).toEqual(['attacker@example.test']);
  expect(sent).not.toContain('victim@example.test');
});

test('a reset request for an account with no password method sends nothing', async () => {
  const sent = [];
  const authService = new AuthService(
    {
      getUserByEmail: async () => ({
        id: 'external-only-user',
        email: 'external@example.test',
        providerName: 'TELEGRAM',
      }),
      hasLocalSignIn: async () => false,
    },
    {},
    { sendEmail: async (email) => sent.push(email) },
    {},
    {}
  );

  await expect(authService.forgot('external@example.test')).resolves.toBe(
    false
  );
  expect(sent).toEqual([]);
});

test('password reset updates an account that has linked LOCAL but another primary provider', async () => {
  const tx = {
    userIdentity: {
      findFirst: jest.fn().mockResolvedValue({ id: 'identity-local' }),
    },
    user: {
      update: jest.fn().mockResolvedValue({ id: 'telegram-origin-user' }),
    },
  };
  const repository = repositoryWith(
    {},
    { $transaction: (callback) => callback(tx) }
  );

  await expect(
    repository.updatePassword('telegram-origin-user', 'new-secret')
  ).resolves.toEqual({ id: 'telegram-origin-user' });
  expect(tx.user.update).toHaveBeenCalledWith({
    where: { id: 'telegram-origin-user' },
    data: { password: 'hashed:new-secret' },
  });
});

test('password reset remains compatible with a legacy primary LOCAL account before backfill', async () => {
  const tx = {
    userIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'legacy-local-user',
        providerName: 'LOCAL',
      }),
      update: jest.fn().mockResolvedValue({ id: 'legacy-local-user' }),
    },
  };
  const repository = repositoryWith(
    {},
    { $transaction: (callback) => callback(tx) }
  );

  await expect(
    repository.updatePassword('legacy-local-user', 'new-secret')
  ).resolves.toEqual({ id: 'legacy-local-user' });
  expect(tx.user.update).toHaveBeenCalledWith({
    where: { id: 'legacy-local-user' },
    data: { password: 'hashed:new-secret' },
  });
});

/**
 * The confirmation flow, driven through the real Redis-backed store.
 *
 * `linkIdentity` is the only thing faked here: what these tests are about is
 * what happens before a row is allowed to exist, and who is allowed to make it
 * exist.
 */
function confirmationWorld({
  claimable = async () => undefined,
  requesterLanguage = 'en',
} = {}) {
  const emails = [];
  const linked = [];
  const userService = {
    assertLocalIdentityClaimable: async (userId, rawEmail) => {
      const normalized = rawEmail.trim().toLowerCase();
      await claimable(userId, normalized);
      return normalized;
    },
    linkIdentity: async (userId, provider, providerIdentifier, passwordHash) => {
      linked.push({ userId, provider, providerIdentifier, passwordHash });
      return { provider, providerIdentifier, linkedAt: 'now' };
    },
    // The confirmation email is sent to the new, not-yet-owned address; its
    // language comes from the signed-in account making the request.
    getUserById: async () => ({ language: requesterLanguage }),
  };
  const authService = new AuthService(
    userService,
    {},
    {},
    {
      sendEmail: async (to, subject, html, addTo, replyTo, language) =>
        emails.push({ to, subject, html, language }),
    },
    {}
  );
  return { authService, emails, linked };
}

const tokenFrom = (html) => html.match(/identity_confirmation=([\w-]+)/)[1];

describe('adding a password sign-in method proves the address first', () => {
  beforeEach(() => {
    redisEntries.clear();
    redisClock.now = 0;
    process.env.FRONTEND_URL = 'https://app.example';
  });
  afterEach(() => {
    delete process.env.FRONTEND_URL;
    delete process.env.DISALLOW_PLUS;
  });

  test('the request writes no identity and mails a link carrying no secret', async () => {
    const { authService, emails, linked } = confirmationWorld();

    const result = await authService.linkIdentity('session-user', {
      provider: 'LOCAL',
      email: ' Owner@Example.COM ',
      password: 'chosen-secret',
    });

    expect(result).toMatchObject({
      status: 'confirmation_sent',
      email: 'owner@example.com',
      expiresInMinutes: 20,
    });
    expect(linked).toEqual([]);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('owner@example.com');

    // Neither the password nor its hash may travel in the mail or the link.
    expect(emails[0].html).not.toMatch(/chosen-secret/);
    expect(emails[0].html).not.toMatch(/hashed:/);
    expect(tokenFrom(emails[0].html)).toMatch(/^[\w-]{43}$/);
  });

  test('the confirmation email speaks the requesting account language, not English by default', async () => {
    const { authService, emails } = confirmationWorld({ requesterLanguage: 'ru' });

    await authService.linkIdentity('session-user', {
      provider: 'LOCAL',
      email: 'owner@example.com',
      password: 'chosen-secret',
    });

    expect(emails[0].subject).toBe('Подтвердите адрес электронной почты');
    expect(emails[0].subject).not.toBe('Confirm your email address');
    expect(emails[0].language).toBe('ru');
    // The link inside the translated body is unchanged by translation.
    expect(tokenFrom(emails[0].html)).toMatch(/^[\w-]{43}$/);
  });

  test('a requester with no stored language gets the English confirmation, not a thrown error', async () => {
    const { authService, emails } = confirmationWorld({ requesterLanguage: undefined });

    await authService.linkIdentity('session-user', {
      provider: 'LOCAL',
      email: 'owner@example.com',
      password: 'chosen-secret',
    });

    expect(emails[0].subject).toBe('Confirm your email address');
  });

  test('opening the link as the same user creates the identity with the stored hash', async () => {
    const { authService, emails, linked } = confirmationWorld();
    await authService.linkIdentity('session-user', {
      provider: 'LOCAL',
      email: 'owner@example.com',
      password: 'chosen-secret',
    });

    await expect(
      authService.confirmIdentityLink('session-user', tokenFrom(emails[0].html))
    ).resolves.toMatchObject({
      provider: 'LOCAL',
      providerIdentifier: 'owner@example.com',
    });
    expect(linked).toEqual([
      {
        userId: 'session-user',
        provider: 'LOCAL',
        providerIdentifier: 'owner@example.com',
        passwordHash: 'hashed:chosen-secret',
      },
    ]);
  });

  test('an expired link creates nothing', async () => {
    const { authService, emails, linked } = confirmationWorld();
    await authService.linkIdentity('session-user', {
      provider: 'LOCAL',
      email: 'owner@example.com',
      password: 'chosen-secret',
    });
    const token = tokenFrom(emails[0].html);

    redisClock.now += 20 * 60 * 1000 + 1;

    await expect(
      authService.confirmIdentityLink('session-user', token)
    ).rejects.toMatchObject({ status: 400 });
    expect(linked).toEqual([]);
  });

  test('a link opened by another account is refused and stays usable by the right one', async () => {
    const { authService, emails, linked } = confirmationWorld();
    await authService.linkIdentity('session-user', {
      provider: 'LOCAL',
      email: 'owner@example.com',
      password: 'chosen-secret',
    });
    const token = tokenFrom(emails[0].html);

    await expect(
      authService.confirmIdentityLink('someone-else', token)
    ).rejects.toMatchObject({ status: 403 });
    expect(linked).toEqual([]);

    await expect(
      authService.confirmIdentityLink('session-user', token)
    ).resolves.toMatchObject({ providerIdentifier: 'owner@example.com' });
  });

  test('a link spent once cannot be spent again', async () => {
    const { authService, emails, linked } = confirmationWorld();
    await authService.linkIdentity('session-user', {
      provider: 'LOCAL',
      email: 'owner@example.com',
      password: 'chosen-secret',
    });
    const token = tokenFrom(emails[0].html);

    await authService.confirmIdentityLink('session-user', token);
    await expect(
      authService.confirmIdentityLink('session-user', token)
    ).rejects.toMatchObject({ status: 400 });
    expect(linked).toHaveLength(1);
  });

  test('an address taken while the link waited is refused at confirmation time', async () => {
    let taken = false;
    const { authService, emails } = confirmationWorld();
    // The pending record is not a reservation: the address is still free for
    // anyone else to claim while the link sits in a mailbox, and the writing
    // transaction is what decides.
    authService._userService.linkIdentity = async () => {
      if (taken) {
        throw new nest.HttpException('Identity is already linked', 409);
      }
      return {};
    };

    await authService.linkIdentity('session-user', {
      provider: 'LOCAL',
      email: 'owner@example.com',
      password: 'chosen-secret',
    });
    taken = true;

    await expect(
      authService.confirmIdentityLink('session-user', tokenFrom(emails[0].html))
    ).rejects.toMatchObject({ status: 409 });
  });

  test('a second password method is refused before any mail is sent', async () => {
    const { authService, emails } = confirmationWorld({
      claimable: async () => {
        throw new nest.HttpException(
          'This account already has a password sign-in method',
          409
        );
      },
    });

    await expect(
      authService.linkIdentity('session-user', {
        provider: 'LOCAL',
        email: 'second@example.com',
        password: 'chosen-secret',
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(emails).toEqual([]);
  });

  test('plus addressing is refused when the deployment disallows it', async () => {
    process.env.DISALLOW_PLUS = 'true';
    const { authService, emails } = confirmationWorld();

    await expect(
      authService.linkIdentity('session-user', {
        provider: 'LOCAL',
        email: 'owner+alias@example.com',
        password: 'chosen-secret',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(emails).toEqual([]);
  });

  test.each(['FARCASTER', 'WALLET'])(
    'linking %s is refused: its callback is not bound to the browser',
    async (provider) => {
      const authService = new AuthService(
        {},
        {},
        {},
        {},
        {
          getProvider: () => {
            throw new Error('the provider must never be reached');
          },
        }
      );

      await expect(
        authService.linkIdentity('session-user', {
          provider,
          code: 'one-time-code',
        })
      ).rejects.toMatchObject({ status: 400 });
    }
  );
});

test('password reset still refuses an external-only account without LOCAL identity', async () => {
  const tx = {
    userIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'external-only-user',
        providerName: 'TELEGRAM',
      }),
      update: jest.fn(),
    },
  };
  const repository = repositoryWith(
    {},
    { $transaction: (callback) => callback(tx) }
  );

  await expect(
    repository.updatePassword('external-only-user', 'new-secret')
  ).rejects.toMatchObject({ status: 404 });
  expect(tx.user.update).not.toHaveBeenCalled();
});
