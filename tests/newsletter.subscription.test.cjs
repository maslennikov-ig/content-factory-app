const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
require('reflect-metadata');
const { loadTypeScriptModule: loadSharedModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');

// The real rule, not a copy of it. A mirror of the eligibility check would pass
// while the server disagreed with the browser, which is the defect these tests
// exist to catch.
const newsletterConsentRules = loadSharedModule(
  'libraries/helpers/src/auth/newsletter.consent.ts'
);

function read(relativePath) {
  const filename = path.join(root, relativePath);
  return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
}

function resolveNewsletterLocation(nginx, pathname) {
  const locations = [];
  const locationPattern =
    /^\s*location\s+(?:(\^~|~)\s+)?(?:"([^"]+)"|(\/[^\s{]+))\s*\{([^}]*)\}/gm;
  for (const match of nginx.matchAll(locationPattern)) {
    locations.push({
      modifier: match[1] || '',
      pattern: match[2] || match[3],
      body: match[4],
    });
  }

  const prefixes = locations
    .filter((location) => location.modifier !== '~' && pathname.startsWith(location.pattern))
    .sort((left, right) => right.pattern.length - left.pattern.length);
  if (prefixes[0]?.modifier === '^~') return prefixes[0];

  const regex = locations.find(
    (location) =>
      location.modifier === '~' && new RegExp(location.pattern).test(pathname)
  );
  return regex || prefixes[0];
}

/**
 * Where a location actually proxies to, with `set` variables substituted.
 *
 * The variable is the fix, so the test has to see through it: asserting on the
 * literal text would pass for a configuration that names the container directly
 * and fails to load without it.
 */
function proxyTarget(nginx, location) {
  const target = location?.body.match(/proxy_pass\s+([^;]+);/)?.[1]?.trim();
  if (!target) return null;

  const variables = new Map(
    [...nginx.matchAll(/^\s*set\s+\$(\w+)\s+([^;]+);/gm)].map((match) => [
      match[1],
      match[2].trim(),
    ])
  );

  return {
    target,
    perRequest: target.includes('$'),
    resolved: target.replace(/\$(\w+)/g, (whole, name) =>
      variables.has(name) ? variables.get(name) : whole
    ),
  };
}

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
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

const Provider = {
  LOCAL: 'LOCAL',
  GENERIC: 'GENERIC',
  GITHUB: 'GITHUB',
  GOOGLE: 'GOOGLE',
  TELEGRAM: 'TELEGRAM',
  FARCASTER: 'FARCASTER',
};

const starterTemplateCatalog = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/starter-template.ts'
);

const { CreateOrgUserDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts',
  {
    '@prisma/client': { Provider },
    './starter-template': starterTemplateCatalog,
  }
);
const { validate } = require('class-validator');

describe('registration consent DTO', () => {
  function validDto(consent) {
    return Object.assign(new CreateOrgUserDto(), {
      email: 'reader@example.com',
      password: 'valid-password-12',
      provider: Provider.LOCAL,
      providerToken: '',
      company: 'Studio',
      ...(consent === undefined ? {} : { subscribeToNewsletter: consent }),
    });
  }

  test.each([undefined, false, true])('accepts optional boolean value %s', async (value) => {
    await expect(validate(validDto(value))).resolves.toHaveLength(0);
  });

  test.each(['true', 1, null, {}])('rejects non-boolean consent value %p', async (value) => {
    const errors = await validate(validDto(value));
    expect(errors.some((error) => error.property === 'subscribeToNewsletter')).toBe(true);
  });
});

const newsletterRegister = jest.fn(async () => undefined);
const temporalStarts = [];
const verifyJWT = jest.fn();
class LoginUserDto {}
const { AuthService } = loadTypeScriptModule(
  'apps/backend/src/services/auth/auth.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      HttpException: class HttpException extends Error {},
    },
    '@prisma/client': { Provider },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto,
    },
    '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto': { LoginUserDto },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
      UsersService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': {
      OrganizationService: class {},
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        comparePassword: () => true,
        signJWT: (user) => `session:${user.id}`,
        verifyJWT: (...args) => verifyJWT(...args),
      },
    },
    '@contentfactory/helpers/auth/registration.approval': {
      registrationRequiresApproval: () => false,
    },
    '@contentfactory/helpers/auth/newsletter.consent': newsletterConsentRules,
    '@contentfactory/backend/services/auth/providers/providers.manager': {
      AuthProviderManager: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service': {
      NotificationService: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto': {
      ForgotReturnPasswordDto: class {},
    },
    '@contentfactory/nestjs-libraries/services/email.service': {
      EmailService: class {},
    },
    '@contentfactory/nestjs-libraries/newsletter/newsletter.service': {
      NewsletterService: { register: newsletterRegister },
    },
    '@contentfactory/backend/services/newsletter/newsletter-delivery-retry.service.v1': {
      NewsletterDeliveryRetryServiceV1: class NewsletterDeliveryRetryServiceV1 {},
    },
    // Linked sign-in identities share this service. Nothing here exercises
    // them, so the confirmation store is a stub that never hands one out.
    '@contentfactory/nestjs-libraries/dtos/users/link-user-identity.dto': {
      LinkUserIdentityDto: class {},
    },
    '@contentfactory/backend/services/auth/identity-confirmation': {
      issueIdentityConfirmation: async () => 'unused-confirmation-token',
      readIdentityConfirmation: async () => null,
      discardIdentityConfirmation: async () => undefined,
      IDENTITY_CONFIRMATION_TTL_SECONDS: 1200,
    },
    '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/locale/backend-strings.ts'
    ),
  }
);

const recordedConsentAt = new Date('2026-08-18T09:00:00.000Z');

function createAuthService({
  existingLocalUser = null,
  existingProviderUser = null,
  providerUser = { id: 'provider-reader', email: 'provider-reader@example.com' },
  temporalStartFailure = null,
} = {}) {
  const persistedUser = {
    id: 'new-user',
    email: 'reader@example.com',
    activated: true,
    newsletterConsentAt: null,
    newsletterConsentSource: null,
    newsletterDeliveryPendingAt: null,
    newsletterDeliveredAt: null,
  };
  const userService = {
    getUserByEmail: jest.fn(async () => existingLocalUser),
    getUserByProvider: jest.fn(async () => existingProviderUser),
    activateUser: jest.fn(async () => undefined),
    markNewsletterDelivered: jest.fn(async (_userId, pendingAt) => {
      if (persistedUser.newsletterDeliveryPendingAt === pendingAt) {
        persistedUser.newsletterDeliveryPendingAt = null;
        persistedUser.newsletterDeliveredAt = new Date();
      }
    }),
  };
  const organizationService = {
    getCount: jest.fn(async () => 2),
    // Stands in for the repository below, which writes the consent in the same
    // statement as the account: the created user carries back what was stored.
    createOrgAndUser: jest.fn(async (body) => {
      persistedUser.newsletterConsentAt = body.newsletterConsent
        ? recordedConsentAt
        : null;
      persistedUser.newsletterConsentSource = body.newsletterConsent
        ? 'registration'
        : null;
      persistedUser.newsletterDeliveryPendingAt = body.newsletterConsent
        ? recordedConsentAt
        : null;
      return {
        id: 'org',
        users: [{ user: persistedUser }],
      };
    }),
  };
  const providerManager = {
    getProvider: jest.fn(() => ({
      getUser: jest.fn(async () => providerUser),
      postRegistration: jest.fn(async () => undefined),
    })),
  };
  const newsletterRetry = {
    schedule: async (userId, pendingAt) => {
      if (temporalStartFailure) throw temporalStartFailure;
      const options = {
        args: [
          {
            userId,
            pendingAt: pendingAt.toISOString(),
            leaseId: `newsletter-delivery-v1:${userId}:${pendingAt.getTime()}`,
          },
        ],
        taskQueue: 'main',
        workflowId: `newsletter-subscription-v1:${userId}:${pendingAt.getTime()}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
      };
      temporalStarts.push(['newsletterSubscriptionRetryWorkflowV1', options]);
      return { workflowId: options.workflowId };
    },
  };
  const service = new AuthService(
    userService,
    organizationService,
    {},
    { sendEmail: jest.fn(async () => undefined) },
    providerManager,
    newsletterRetry
  );
  return { service, organizationService, persistedUser, userService };
}

function localBody(consent) {
  return Object.assign(new CreateOrgUserDto(), {
    email: 'Reader@Example.com',
    password: 'valid-password-12',
    provider: Provider.LOCAL,
    providerToken: '',
    company: 'Studio',
    ...(consent === undefined ? {} : { subscribeToNewsletter: consent }),
  });
}

beforeEach(() => {
  newsletterRegister.mockReset();
  newsletterRegister.mockResolvedValue(undefined);
  temporalStarts.length = 0;
});

describe('newsletter side effect at the new-account boundary', () => {
  test('hands a persisted local consent to the single Temporal delivery seam', async () => {
    const { service, organizationService, persistedUser } = createAuthService();

    await service.routeAuth(Provider.LOCAL, localBody(true), '127.0.0.1', 'agent');

    expect(organizationService.createOrgAndUser).toHaveBeenCalledTimes(1);
    expect(newsletterRegister).not.toHaveBeenCalled();
    expect(temporalStarts).toHaveLength(1);
    expect(persistedUser.newsletterDeliveryPendingAt).toBe(recordedConsentAt);
    expect(persistedUser.newsletterDeliveredAt).toBeNull();
  });

  test('records the consent on the account in the same statement that creates it', async () => {
    const { service, organizationService } = createAuthService();

    await service.routeAuth(Provider.LOCAL, localBody(true), '127.0.0.1', 'agent');

    expect(organizationService.createOrgAndUser).toHaveBeenCalledWith(
      expect.objectContaining({ newsletterConsent: true }),
      '127.0.0.1',
      'agent'
    );
    // The transition handed to Temporal is the transition stored on the
    // account, not a second clock read that could disagree with it.
    expect(temporalStarts[0][1].args[0].pendingAt).toBe(
      recordedConsentAt.toISOString()
    );
  });

  test.each([undefined, false])(
    'records no consent on the account for %s',
    async (consent) => {
      const { service, organizationService } = createAuthService();
      await service.routeAuth(Provider.LOCAL, localBody(consent), '127.0.0.1', 'agent');
      expect(organizationService.createOrgAndUser).toHaveBeenCalledWith(
        expect.objectContaining({ newsletterConsent: false }),
        '127.0.0.1',
        'agent'
      );
    }
  );

  test.each([undefined, false])('does not subscribe a local account for %s consent', async (consent) => {
    const { service } = createAuthService();
    await service.routeAuth(Provider.LOCAL, localBody(consent), '127.0.0.1', 'agent');
    expect(newsletterRegister).not.toHaveBeenCalled();
    expect(temporalStarts).toEqual([]);
  });

  test('schedules a newly persisted provider account after explicit consent', async () => {
    const { service } = createAuthService();
    await service.routeAuth(
      Provider.GOOGLE,
      Object.assign(new CreateOrgUserDto(), {
        company: 'Studio',
        provider: Provider.GOOGLE,
        providerToken: 'token',
        subscribeToNewsletter: true,
      }),
      '127.0.0.1',
      'agent'
    );
    expect(newsletterRegister).not.toHaveBeenCalled();
    expect(temporalStarts).toHaveLength(1);
  });

  /**
   * The exclusion the browser performs, performed where it is enforceable.
   *
   * `POST /auth/register` with `{"provider":"TELEGRAM","subscribeToNewsletter":
   * true}` never runs the form's code. Before this, the value went straight
   * through to a subscription attempt for `telegram_<sub>`.
   */
  test.each([Provider.TELEGRAM, Provider.FARCASTER])(
    'refuses consent from %s, whose identity is not an address',
    async (provider) => {
      const { service, organizationService } = createAuthService({
        providerUser: {
          id: 'synthetic',
          email: `${provider.toLowerCase()}_874512`,
        },
      });

      await service.routeAuth(
        provider,
        Object.assign(new CreateOrgUserDto(), {
          company: 'Studio',
          provider,
          providerToken: 'token',
          subscribeToNewsletter: true,
        }),
        '127.0.0.1',
        'agent'
      );

      expect(newsletterRegister).not.toHaveBeenCalled();
      expect(organizationService.createOrgAndUser).toHaveBeenCalledWith(
        expect.objectContaining({ newsletterConsent: false }),
        '127.0.0.1',
        'agent'
      );
    }
  );

  // Two independent gates, so a synthetic identity that happens to look like an
  // address is still refused: the provider is not on the eligible list.
  test('refuses consent from an ineligible provider whose identity looks like an address', async () => {
    const { service } = createAuthService({
      providerUser: { id: 'synthetic', email: '874512@telegram.local' },
    });

    await service.routeAuth(
      'TELEGRAM',
      Object.assign(new CreateOrgUserDto(), {
        company: 'Studio',
        provider: 'TELEGRAM',
        providerToken: 'token',
        subscribeToNewsletter: true,
      }),
      '127.0.0.1',
      'agent'
    );

    expect(newsletterRegister).not.toHaveBeenCalled();
  });

  test('does not subscribe a newly persisted provider account without consent', async () => {
    const { service } = createAuthService();
    await service.routeAuth(
      Provider.GOOGLE,
      Object.assign(new CreateOrgUserDto(), {
        company: 'Studio',
        provider: Provider.GOOGLE,
        providerToken: 'token',
      }),
      '127.0.0.1',
      'agent'
    );
    expect(newsletterRegister).not.toHaveBeenCalled();
  });

  test('does not subscribe a returning provider account even if the callback body says true', async () => {
    const { service } = createAuthService({
      existingProviderUser: { id: 'existing', activated: true },
    });
    await service.routeAuth(
      Provider.GOOGLE,
      Object.assign(new CreateOrgUserDto(), {
        company: 'Studio',
        provider: Provider.GOOGLE,
        providerToken: 'token',
        subscribeToNewsletter: true,
      }),
      '127.0.0.1',
      'agent'
    );
    expect(newsletterRegister).not.toHaveBeenCalled();
  });

  test('does not turn later product activation into newsletter consent', async () => {
    const { service } = createAuthService({
      existingLocalUser: { id: 'new-user', activated: false },
    });
    verifyJWT.mockReturnValue({
      id: 'new-user',
      activated: false,
      email: 'reader@example.com',
    });
    await service.activate('activation-token');
    expect(newsletterRegister).not.toHaveBeenCalled();
  });

  test('does not call Listmonk directly while registration owns the response', async () => {
    const { service } = createAuthService();
    newsletterRegister.mockRejectedValue(new Error('status 503 for reader@example.com'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      service.routeAuth(Provider.LOCAL, localBody(true), '127.0.0.1', 'agent')
    ).resolves.toMatchObject({ awaitingApproval: false });
    expect(newsletterRegister).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join(' ')).not.toContain('reader@example.com');
    expect(temporalStarts).toEqual([
      [
        'newsletterSubscriptionRetryWorkflowV1',
        {
          args: [
            {
              userId: 'new-user',
              pendingAt: recordedConsentAt.toISOString(),
              leaseId: `newsletter-delivery-v1:new-user:${recordedConsentAt.getTime()}`,
            },
          ],
          taskQueue: 'main',
          workflowId: `newsletter-subscription-v1:new-user:${recordedConsentAt.getTime()}`,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
        },
      ],
    ]);
    expect(JSON.stringify(temporalStarts)).not.toContain('reader@example.com');
    error.mockRestore();
  });

  test('keeps the new account when both Listmonk and retry scheduling are unavailable', async () => {
    const { service, persistedUser } = createAuthService({
      temporalStartFailure: new Error('Temporal unavailable'),
    });
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      service.routeAuth(Provider.LOCAL, localBody(true), '127.0.0.1', 'agent')
    ).resolves.toMatchObject({ awaitingApproval: false });
    expect(error).toHaveBeenCalledWith(
      'Newsletter retry scheduling failed after account creation.',
      'user=new-user'
    );
    expect(newsletterRegister).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join(' ')).not.toContain(
      'reader@example.com'
    );
    expect(persistedUser).toMatchObject({
      newsletterConsentAt: recordedConsentAt,
      newsletterConsentSource: 'registration',
      newsletterDeliveryPendingAt: recordedConsentAt,
      newsletterDeliveredAt: null,
    });
    error.mockRestore();
  });

  test('an eligible provider whose address is not deliverable still creates the account', async () => {
    const { service } = createAuthService({
      providerUser: { id: 'oauth-reader', email: 'not-an-address' },
    });

    await expect(
      service.routeAuth(
        Provider.GENERIC,
        Object.assign(new CreateOrgUserDto(), {
          company: 'Studio',
          provider: Provider.GENERIC,
          providerToken: 'token',
          subscribeToNewsletter: true,
        }),
        '127.0.0.1',
        'agent'
      )
    ).resolves.toBeDefined();
    expect(newsletterRegister).not.toHaveBeenCalled();
  });
});

/**
 * The consent has to survive a failed handover to Listmonk.
 *
 * Before this it lived only in the request body: a permission the person
 * explicitly gave existed nowhere afterwards, the manual recovery the runbook
 * promises had no address to recover, and a durable retry would have had
 * nothing to retry from.
 */
describe('consent record on the account', () => {
  function loadRepository() {
    const create = jest.fn(async () => ({ id: 'org', users: [] }));
    const { OrganizationRepository } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
      {
        '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
          PrismaRepository: class {},
        },
        '@nestjs/common': {
          Injectable: () => (target) => target,
          // The repository logs a failed analytics write instead of failing
          // registration, so it constructs a Logger of its own.
          Logger: class Logger {
            error() {}
          },
        },
        '@prisma/client': {
          Role: { SUPERADMIN: 'SUPERADMIN' },
          ShortLinkPreference: {},
          SubscriptionTier: {},
        },
        // The same create statement also writes the first sign-in identity.
        '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
          normalizeIdentityIdentifier: (provider, identifier) =>
            provider === 'LOCAL' ? identifier.trim().toLowerCase() : identifier,
        },
        '@contentfactory/helpers/auth/auth.service': {
          AuthService: {
            fixedEncryption: (value) => value,
            hashPassword: (value) => `hashed:${value}`,
          },
        },
        '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
          CreateOrgUserDto,
          // The repository now attaches the content-workflow tags to every
          // workspace unconditionally, so it needs the real catalog here too
          // — not just as a module the loader can resolve, but as the array
          // it maps over.
          CONTENT_WORKFLOW_TAGS: starterTemplateCatalog.CONTENT_WORKFLOW_TAGS,
        },
        '@contentfactory/nestjs-libraries/services/make.is': {
          makeId: () => 'api-key',
        },
        '@contentfactory/helpers/auth/newsletter.consent': newsletterConsentRules,
        // The real catalog, not a stand-in: the content-workflow tag names it
        // resolves have their own coverage elsewhere, and this file only needs
        // it to exist so the module loads.
        '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
          'libraries/nestjs-libraries/src/locale/backend-strings.ts'
        ),
      }
    );

    const repository = new OrganizationRepository(
      { model: { organization: { create } } },
      { model: {} },
      { model: {} }
    );
    return { repository, create };
  }

  const userData = (create) =>
    create.mock.calls[0][0].data.users.create.user.create;

  test('writes the moment and the source with the account itself', async () => {
    const { repository, create } = loadRepository();
    const before = Date.now();

    await repository.createOrgAndUser(
      {
        company: 'Studio',
        email: 'reader@example.com',
        password: 'valid-password-12',
        provider: 'LOCAL',
        newsletterConsent: true,
      },
      { activated: true, isSuperAdmin: false },
      '127.0.0.1',
      'agent'
    );

    const user = userData(create);
    expect(user.newsletterConsentSource).toBe('registration');
    expect(user.newsletterConsentAt).toBeInstanceOf(Date);
    expect(user.newsletterDeliveryPendingAt).toBe(user.newsletterConsentAt);
    expect(user.newsletterConsentAt.getTime()).toBeGreaterThanOrEqual(before);
    // One statement: the consent cannot be written without the account, or the
    // account without the consent it was given with.
    expect(create).toHaveBeenCalledTimes(1);
  });

  test.each([false, undefined])(
    'leaves the consent columns unset when none was given (%s)',
    async (newsletterConsent) => {
      const { repository, create } = loadRepository();

      await repository.createOrgAndUser(
        {
          company: 'Studio',
          email: 'reader@example.com',
          password: 'valid-password-12',
          provider: 'LOCAL',
          newsletterConsent,
        },
        { activated: true, isSuperAdmin: false },
        '127.0.0.1',
        'agent'
      );

      const user = userData(create);
      expect(user.newsletterConsentAt).toBeUndefined();
      expect(user.newsletterConsentSource).toBeUndefined();
      expect(user.newsletterDeliveryPendingAt).toBeUndefined();
    }
  );

  test('the schema carries consent and delivery state as optional columns', () => {
    const schema = read(
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    );
    const model = schema.match(/model User \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(model).toMatch(/newsletterConsentAt\s+DateTime\?/);
    expect(model).toMatch(/newsletterConsentSource\s+String\?/);
    expect(model).toMatch(/newsletterDeliveryPendingAt\s+DateTime\?/);
    expect(model).toMatch(/newsletterDeliveredAt\s+DateTime\?/);
    expect(model).toMatch(/newsletterDeliveryLeaseId\s+String\?/);
    expect(model).toMatch(/newsletterDeliveryLeaseExpiresAt\s+DateTime\?/);
    expect(model).toMatch(/@@index\(\[newsletterDeliveryPendingAt\]\)/);
    expect(model).toMatch(
      /@@index\(\[newsletterDeliveryLeaseExpiresAt, newsletterDeliveryPendingAt\]\)/
    );
  });
});

describe('Listmonk double opt-in provider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.LISTMONK_DOMAIN = 'http://cf-listmonk:9000';
    process.env.LISTMONK_USER = 'subscription-writer';
    process.env.LISTMONK_API_KEY = 'test-token';
    process.env.LISTMONK_LIST_ID = '42';
    process.env.LISTMONK_LIST_UUID = '123e4567-e89b-12d3-a456-426614174000';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('creates an enabled but unconfirmed membership without a welcome transaction', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 201 }));
    const { ListmonkProvider } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
      {
        '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {},
      }
    );

    await new ListmonkProvider().register('reader@example.com');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = global.fetch.mock.calls[0];
    expect(url).toBe('http://cf-listmonk:9000/api/subscribers');
    expect(JSON.parse(request.body)).toEqual({
      email: 'reader@example.com',
      name: 'Content Factory subscriber',
      status: 'enabled',
      lists: [42],
      preconfirm_subscriptions: false,
    });
    expect(request.headers.get('Authorization')).toMatch(/^Basic /);
    expect(request.redirect).toBe('error');
  });

  test('stores the consent source and moment on the subscriber record', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 201 }));
    const { ListmonkProvider } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
      { '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {} }
    );

    await new ListmonkProvider().register('reader@example.com', {
      source: 'registration',
      consentedAt: new Date('2026-08-18T09:00:00.000Z'),
    });

    expect(JSON.parse(global.fetch.mock.calls[0][1].body).attribs).toEqual({
      source: 'registration',
      consented_at: '2026-08-18T09:00:00.000Z',
    });
  });

  /**
   * One budget for the whole handover, not one per request.
   *
   * Two independent ten-second timeouts meant the conflict path could hold a
   * registration open for about twenty seconds after the account already
   * existed — long enough for the browser to give up and retry into
   * `Email already exists`.
   */
  test('spends at most a few seconds in total, conflict path included', async () => {
    global.fetch = jest.fn(
      (_url, request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () =>
            reject(request.signal.reason)
          );
        })
    );
    const { ListmonkProvider } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
      { '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {} }
    );

    const startedAt = Date.now();
    await expect(
      new ListmonkProvider().register('reader@example.com')
    ).rejects.toBeDefined();
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(1_000);
    expect(elapsed).toBeLessThan(4_000);
  }, 10_000);

  test('gives the conflict recovery what is left of the same budget, not a new one', async () => {
    const signals = [];
    global.fetch = jest.fn(async (_url, request) => {
      signals.push(request.signal);
      return signals.length === 1
        ? { ok: false, status: 409 }
        : { ok: true, status: 200 };
    });
    const { ListmonkProvider } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
      { '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {} }
    );

    await new ListmonkProvider().register('reader@example.com');

    expect(signals).toHaveLength(2);
    expect(signals[0]).toBe(signals[1]);
  });

  test('restores an existing or unsubscribed address to unconfirmed membership', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const { ListmonkProvider } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
      { '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {} }
    );
    await expect(new ListmonkProvider().register('reader@example.com')).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [url, request] = global.fetch.mock.calls[1];
    expect(url).toBe('http://cf-listmonk:9000/api/public/subscription');
    expect(JSON.parse(request.body)).toEqual({
      email: 'reader@example.com',
      name: 'Content Factory subscriber',
      list_uuids: ['123e4567-e89b-12d3-a456-426614174000'],
    });
    expect(request.redirect).toBe('error');
    expect(request.headers.get('Authorization')).toBeNull();
  });

  /**
   * The address is configuration again.
   *
   * It used to be compared with the literal `http://cf-listmonk:9000`, which put
   * one deployment's Docker service name inside a shared library: no other host,
   * name or port could be used, and the environment variable was decoration.
   * What is checked now is the shape that keeps the API credentials on an
   * internal service.
   */
  test.each([
    'http://cf-listmonk:9000',
    'http://newsletter-internal:9000',
    'http://10.1.2.3:9000',
    'http://cf-listmonk:9000/',
  ])('accepts any internal plain-HTTP base URL (%s)', async (domain) => {
    process.env.LISTMONK_DOMAIN = domain;
    global.fetch = jest.fn(async () => ({ ok: true, status: 201 }));
    const { ListmonkProvider } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
      { '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {} }
    );

    await new ListmonkProvider().register('reader@example.com');

    expect(global.fetch.mock.calls[0][0]).toBe(
      `${domain.replace(/\/$/, '')}/api/subscribers`
    );
  });

  test.each([
    ['https://newsletter.example.com', 'subscription-writer', 'test-token', '42'],
    ['http://writer:secret@cf-listmonk:9000', 'subscription-writer', 'test-token', '42'],
    ['http://cf-listmonk:9000/newsletter', 'subscription-writer', 'test-token', '42'],
    ['http://cf-listmonk:9000/?to=elsewhere', 'subscription-writer', 'test-token', '42'],
    ['cf-listmonk:9000', 'subscription-writer', 'test-token', '42'],
    ['', 'subscription-writer', 'test-token', '42'],
    ['http://cf-listmonk:9000', '', 'test-token', '42'],
    ['http://cf-listmonk:9000', 'subscription-writer', '', '42'],
    ['http://cf-listmonk:9000', 'subscription-writer', 'test-token', '0'],
    ['http://cf-listmonk:9000', 'subscription-writer', 'test-token', '1.5'],
    ['http://cf-listmonk:9000', 'subscription-writer', 'test-token', '9007199254740992'],
  ])(
    'rejects unsafe or partial configuration before fetch (%s, %s, %s, %s)',
    async (domain, user, apiKey, listId) => {
      process.env.LISTMONK_DOMAIN = domain;
      process.env.LISTMONK_USER = user;
      process.env.LISTMONK_API_KEY = apiKey;
      process.env.LISTMONK_LIST_ID = listId;
      global.fetch = jest.fn();
      const { ListmonkProvider } = loadTypeScriptModule(
        'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
        { '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {} }
      );

      await expect(new ListmonkProvider().register('reader@example.com')).rejects.toThrow(
        'Listmonk newsletter configuration is invalid'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );

  test('rejects an invalid public list UUID before fetch', async () => {
    process.env.LISTMONK_LIST_UUID = 'not-a-uuid';
    global.fetch = jest.fn();
    const { ListmonkProvider } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
      { '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {} }
    );

    await expect(new ListmonkProvider().register('reader@example.com')).rejects.toThrow(
      'Listmonk newsletter configuration is invalid'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('surfaces a failed conflict recovery to the safe auth boundary', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    const { ListmonkProvider } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
      { '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {} }
    );

    await expect(new ListmonkProvider().register('reader@example.com')).rejects.toThrow(
      'Listmonk subscription recovery failed with status 503'
    );
  });

  test('surfaces a transient HTTP failure to the safe auth boundary', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 }));
    const { ListmonkProvider } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts',
      { '@contentfactory/nestjs-libraries/newsletter/newsletter.interface': {} }
    );
    await expect(new ListmonkProvider().register('reader@example.com')).rejects.toThrow(
      'Listmonk subscriber request failed with status 503'
    );
  });
});

describe('self-hosted provider selection', () => {
  test('a stale Beehiiv key cannot select an external provider', () => {
    process.env.BEEHIIVE_API_KEY = 'stale-key';
    for (const name of [
      'LISTMONK_DOMAIN',
      'LISTMONK_USER',
      'LISTMONK_API_KEY',
      'LISTMONK_LIST_ID',
      'LISTMONK_LIST_UUID',
    ]) {
      delete process.env[name];
    }
    const empty = { name: 'empty', register: jest.fn() };
    const listmonk = { name: 'listmonk', register: jest.fn() };
    const { NewsletterService } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/newsletter.service.ts',
      {
        '@contentfactory/nestjs-libraries/newsletter/providers': {
          newsletterProviders: [listmonk, empty],
        },
      }
    );
    expect(NewsletterService.getProvider()).toBe(empty);
    expect(read('libraries/nestjs-libraries/src/newsletter/providers.ts')).not.toMatch(
      /beehiiv/i
    );
    delete process.env.BEEHIIVE_API_KEY;
  });

  test('selects Listmonk for partial configuration so the safe auth boundary reports it', () => {
    delete process.env.LISTMONK_API_KEY;
    process.env.LISTMONK_DOMAIN = 'http://cf-listmonk:9000';
    const empty = { name: 'empty', register: jest.fn() };
    const listmonk = { name: 'listmonk', register: jest.fn() };
    const { NewsletterService } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/newsletter/newsletter.service.ts',
      {
        '@contentfactory/nestjs-libraries/newsletter/providers': {
          newsletterProviders: [listmonk, empty],
        },
      }
    );
    expect(NewsletterService.getProvider()).toBe(listmonk);
  });
});

describe('production Listmonk boundary', () => {
  test('pins a private Listmonk service to the shared PostgreSQL server', () => {
    const compose = read('deploy/production/docker-compose.yaml');
    expect(compose).toContain('image: listmonk/listmonk:v6.2.0');
    expect(compose).toContain('LISTMONK_db__host=cf-postgres');
    expect(compose).toContain('LISTMONK_db__database=${LISTMONK_DB_NAME}');
    const service = compose.match(/  cf-listmonk:[\s\S]*?(?=\n  [a-z][^\n]*:|\nvolumes:)/)?.[0] || '';
    expect(service).not.toMatch(/^\s+ports:/m);
    expect(service).toContain('- internal');
  });

  test('does not expose database or owner credentials to the application container', () => {
    const compose = read('deploy/production/docker-compose.yaml');
    const app = compose.match(/  cf-app:[\s\S]*?(?=\n  cf-postgres:)/)?.[0] || '';
    const appEnv = read('deploy/production/app.env.example');
    const ownerEnv = read('deploy/production/env.example');
    expect(app).toContain('- app.env');
    expect(app).toContain('./app.env:/app/.env:ro');
    expect(app).not.toContain('- .env');
    for (const secret of [
      'LISTMONK_DB_PASSWORD',
      'LISTMONK_ADMIN_PASSWORD',
      'POSTGRES_PASSWORD',
    ]) {
      expect(app).not.toContain(secret);
      expect(appEnv).not.toMatch(new RegExp(`^${secret}=`, 'm'));
    }
    expect(appEnv).toContain('LISTMONK_USER=');
    expect(appEnv).toContain('LISTMONK_API_KEY=');
    expect(appEnv).toContain('LISTMONK_LIST_ID=');
    expect(appEnv).toContain('LISTMONK_LIST_UUID=');
    for (const runtimeName of [
      'DATABASE_URL',
      'JWT_SECRET',
      'LISTMONK_DOMAIN',
      'LISTMONK_USER',
      'LISTMONK_API_KEY',
      'LISTMONK_LIST_ID',
      'LISTMONK_LIST_UUID',
    ]) {
      expect(ownerEnv).not.toMatch(new RegExp(`^${runtimeName}=`, 'm'));
    }
  });

  test('keeps the application database identity aligned across split env files', () => {
    const ownerEnv = read('deploy/production/env.example');
    const appEnv = read('deploy/production/app.env.example');
    const value = (source, name) =>
      source.match(new RegExp(`^${name}="([^"]+)"$`, 'm'))?.[1];
    const databaseUrl = new URL(value(appEnv, 'DATABASE_URL'));

    expect(databaseUrl.username).toBe(value(ownerEnv, 'PRODUCT_RUNTIME_USER'));
    expect(databaseUrl.password).toBe(
      value(ownerEnv, 'PRODUCT_RUNTIME_PASSWORD')
    );
    expect(databaseUrl.pathname.slice(1)).toBe(value(ownerEnv, 'POSTGRES_DB'));
    expect(databaseUrl.hostname).toBe('cf-postgres');
  });

  test('publishes only UUID subscription pages and static assets through nginx', () => {
    const nginx = read('var/docker/nginx.conf');
    expect(nginx).toContain('location ~ "^/newsletter/subscription/');
    expect(nginx).toContain('location ^~ /newsletter/public/static/');
    expect(nginx).toContain('location /newsletter/ { return 404; }');
    expect(nginx).not.toMatch(/location[^\n]*newsletter\/(?:admin|api)/);
  });

  test('routes only valid UUID subscription paths past the newsletter fallback', () => {
    const nginx = read('var/docker/nginx.conf');
    const subscriber = '123e4567-e89b-12d3-a456-426614174000';
    const campaign = '223e4567-e89b-12d3-a456-426614174001';

    for (const pathname of [
      `/newsletter/subscription/optin/${subscriber}`,
      `/newsletter/subscription/${campaign}/${subscriber}`,
    ]) {
      const target = proxyTarget(nginx, resolveNewsletterLocation(nginx, pathname));
      expect(target?.resolved).toBe('http://cf-listmonk:9000');
    }

    for (const pathname of [
      '/newsletter/subscription/not-a-uuid',
      '/newsletter/admin/',
      '/newsletter/api/subscribers',
    ]) {
      expect(resolveNewsletterLocation(nginx, pathname)?.body).toContain(
        'return 404'
      );
    }
  });

  /**
   * Why the opt-in route alone throws the query string away.
   *
   * Listmonk `v6.2.0` decides confirmation with
   * `strconv.ParseBool(c.FormValue("confirm"))` in `OptinPage`, and `FormValue`
   * on a GET reads the query string. The route takes GET as well as POST, so
   * `…/optin/<uuid>?confirm=true` confirms a subscription in one
   * unauthenticated GET — a link prefetch or a mail scanner can do it instead
   * of the person, and the second half of double opt-in is gone. Listmonk's own
   * message formats that link with an empty query, so dropping the query costs
   * nothing legitimate.
   *
   * The unsubscribe/manage page is the opposite case: Listmonk's own template
   * links it as `{{ .UnsubURL }}?manage=true`, so its query has to survive.
   */
  test('drops the query on opt-in and keeps it on the manage page', () => {
    const nginx = read('var/docker/nginx.conf');
    const subscriber = '123e4567-e89b-12d3-a456-426614174000';
    const campaign = '223e4567-e89b-12d3-a456-426614174001';

    const optin = resolveNewsletterLocation(
      nginx,
      `/newsletter/subscription/optin/${subscriber}`
    );
    const rewrite = optin?.body.match(/rewrite\s+\S+\s+(\S+)\s+break;/)?.[1];
    expect(rewrite).toBe('$1?');

    const manage = resolveNewsletterLocation(
      nginx,
      `/newsletter/subscription/${campaign}/${subscriber}`
    );
    const manageRewrite = manage?.body.match(
      /rewrite\s+\S+\s+(\S+)\s+break;/
    )?.[1];
    expect(manageRewrite).toBe('$1');
  });

  /**
   * The regression that reading `nginx.conf` cannot see.
   *
   * nginx resolves the upstream of a literal `proxy_pass` once, while it loads
   * the configuration, and refuses to start when the name is missing. The
   * entrypoint runs nginx under `set -e` before anything else, so that refusal
   * ends the container — and `restart: unless-stopped` then does it again, with
   * the backend, the frontend and the orchestrator inside. The newsletter
   * container is owner-run and absent until its database is bootstrapped, so
   * the state this guards against is the documented normal one.
   */
  test('resolves optional containers per request, never while loading', () => {
    const nginx = read('var/docker/nginx.conf');
    const entrypoint = read('var/docker/entrypoint.sh');

    // The premise: nginx failing to load is fatal to the whole container.
    expect(entrypoint).toMatch(/^set -e$/m);
    expect(entrypoint).toMatch(/^nginx$/m);

    // Directives only. A comment explaining the hazard is not the hazard.
    const directives = nginx.replace(/#[^\n]*/g, '');

    const loadTime = [...directives.matchAll(/proxy_pass\s+([^;]+);/g)]
      .map((match) => match[1].trim())
      .filter((target) => !target.includes('$'))
      // `localhost` is the container itself; it resolves without DNS and
      // without a neighbour being up.
      .filter((target) => !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(target));

    expect(loadTime).toEqual([]);

    // A `proxy_pass` through a variable resolves per request, which needs a
    // resolver to resolve with. Without one the newsletter routes would answer
    // 502 forever instead of the moment Listmonk is missing.
    expect(nginx).toMatch(/^\s*resolver\s+127\.0\.0\.11\b/m);
  });

  test('ships a release check that asks the built image to load the configuration', () => {
    const script = path.join(root, 'scripts/release/verify-nginx-config.sh');
    expect(fs.existsSync(script)).toBe(true);
    expect(fs.statSync(script).mode & 0o111).toBeTruthy();

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-nginx-verify-'));
    const bin = path.join(temp, 'bin');
    fs.mkdirSync(bin);
    const argsFile = path.join(temp, 'args');
    fs.writeFileSync(
      path.join(bin, 'docker'),
      `#!/usr/bin/env bash\nset -eu\nprintf '%s\\n' "$*" >"$CF_STUB_ARGS"\nexit "\${CF_STUB_EXIT:-0}"\n`,
      { mode: 0o700 }
    );

    execFileSync(script, ['content-factory-next:test'], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CF_STUB_ARGS: argsFile },
      stdio: 'pipe',
    });

    const args = fs.readFileSync(argsFile, 'utf8');
    // No network is the whole point: nothing for a literal host name to resolve
    // to, which is the state of a host that has not started the newsletter.
    expect(args).toContain('--network none');
    expect(args).toContain('--entrypoint nginx content-factory-next:test -t');

    // A failing check has to fail the release, not be reported as passed.
    expect(() =>
      execFileSync(script, ['content-factory-next:test'], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          CF_STUB_ARGS: argsFile,
          CF_STUB_EXIT: '1',
        },
        stdio: 'pipe',
      })
    ).toThrow();

    fs.rmSync(temp, { recursive: true, force: true });
  });

  test('ships an owner-run idempotent database bootstrap without embedding a secret', () => {
    const script = path.join(root, 'deploy/production/bootstrap-listmonk-db.sh');
    expect(fs.existsSync(script)).toBe(true);
    if (!fs.existsSync(script)) return;

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-listmonk-bootstrap-'));
    const bin = path.join(temp, 'bin');
    fs.mkdirSync(bin);
    const stdinFile = path.join(temp, 'stdin.sql');
    const docker = path.join(bin, 'docker');
    fs.writeFileSync(
      docker,
      `#!/usr/bin/env bash\nset -eu\nprintf '%s\\n' "$*" >"$CF_STUB_ARGS"\ncat >"$CF_STUB_STDIN"\n`,
      { mode: 0o700 }
    );

    execFileSync(script, [], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        LISTMONK_DB_USER: 'listmonk',
        LISTMONK_DB_PASSWORD: 'not-a-real-secret',
        LISTMONK_DB_NAME: 'listmonk',
        PRODUCT_RUNTIME_USER: 'contentfactory_runtime',
        MASTRA_RUNTIME_USER: 'contentfactory_mastra_runtime',
        CF_STUB_ARGS: path.join(temp, 'args'),
        CF_STUB_STDIN: stdinFile,
      },
      stdio: 'pipe',
    });

    const args = fs.readFileSync(path.join(temp, 'args'), 'utf8');
    const sql = fs.readFileSync(stdinFile, 'utf8');
    expect(args).toContain('exec -i cf-next-postgres');
    expect(args).not.toContain('not-a-real-secret');
    expect(sql).toContain('CREATE ROLE');
    expect(sql).toMatch(/NOSUPERUSER/i);
    expect(sql).toMatch(/NOCREATEDB/i);
    expect(sql).toMatch(/NOCREATEROLE/i);
    expect(sql).toMatch(/NOREPLICATION/i);
    expect(sql).toMatch(/NOBYPASSRLS/i);
    expect(sql).toMatch(/NOT (?:role\.)?rolsuper/);
    expect(sql).toMatch(/NOT (?:role\.)?rolcreatedb/);
    expect(sql).toMatch(/NOT (?:role\.)?rolcreaterole/);
    expect(sql).toMatch(/NOT (?:role\.)?rolreplication/);
    expect(sql).toMatch(/NOT (?:role\.)?rolbypassrls/);
    expect(sql).toMatch(
      /NOT EXISTS \(\s*SELECT FROM pg_auth_members membership\s*WHERE membership\.member = role\.oid\s*\)/
    );
    expect(sql).toContain('CREATE DATABASE');
    expect(sql).not.toContain('not-a-real-secret');
    fs.rmSync(temp, { recursive: true, force: true });
  });

  test('includes the optional Listmonk database in backup and restore artifacts', () => {
    const backup = read('scripts/operations/postgres-backup.sh');
    const restore = read('scripts/operations/postgres-backup-restore.sh');
    expect(backup).toContain('LISTMONK_DB_NAME');
    expect(backup).toContain('listmonk.dump');
    expect(restore).toContain('newsletter_database');
    expect(restore).toContain('listmonk.dump');
  });
});
