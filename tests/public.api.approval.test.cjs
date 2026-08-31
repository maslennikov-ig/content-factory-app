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

// The real newsletter-consent rule, shared with the registration form. A stub
// would let the two sides of the same decision drift apart unnoticed.
const {
  loadTypeScriptModule: loadSharedModule,
} = require('./helpers/load-tsx.cjs');
const newsletterConsentRules = loadSharedModule(
  'libraries/helpers/src/auth/newsletter.consent.ts'
);

class HttpForbiddenException extends Error {}

const { PublicAuthMiddleware } = loadTypeScriptModule(
  'apps/backend/src/services/auth/public.auth.middleware.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      HttpStatus: { UNAUTHORIZED: 401 },
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
      { OrganizationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/oauth/oauth.service': {
      OAuthService: class {},
    },
    '@contentfactory/nestjs-libraries/services/exception.filter': {
      HttpForbiddenException,
    },
  }
);

// The real normalizer, not a copy of it. A second implementation inside a mock
// agrees with the first exactly until someone changes one of them, and then
// these tests keep passing against a rule the product no longer follows.
const userIdentityHelpers = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/user-identity.ts',
  { '@prisma/client': { Provider: { LOCAL: 'LOCAL' } } }
);

const { OrganizationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
  {
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
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
    },
    '@contentfactory/helpers/auth/newsletter.consent': newsletterConsentRules,
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        fixedEncryption: (value) => `encrypted:${value}`,
        hashPassword: () => 'generated-password-hash',
      },
    },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'generated-id',
    },
    '@contentfactory/nestjs-libraries/database/prisma/users/user-identity':
      userIdentityHelpers,
  }
);

const ULTIMATE_LIFETIME = {
  subscriptionTier: 'ULTIMATE',
  totalChannels: 1000000,
  isLifetime: true,
};

function organization(activatedFlags) {
  return {
    id: 'org-1',
    apiKey: 'encrypted-key',
    // `createMaxUser` always mints an ULTIMATE lifetime subscription, so the
    // subscription check in the middleware never fires for this path.
    subscription: ULTIMATE_LIFETIME,
    users: activatedFlags.map((activated) => ({ user: { activated } })),
  };
}

function requestPair() {
  const sent = [];
  const res = {
    status(code) {
      return {
        json(payload) {
          sent.push({ code, payload });
        },
      };
    },
  };
  return { req: { headers: {} }, res, sent };
}

function middlewareFor(org, authorization) {
  return new PublicAuthMiddleware(
    { getOrgByApiKey: async () => org },
    { getOrgByOAuthToken: async () => authorization }
  );
}

describe('public API approval gate', () => {
  const originalStripeKey = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    if (originalStripeKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeKey;
    }
  });

  test('an organization API key whose only user awaits approval is refused', async () => {
    const middleware = middlewareFor(organization([false]));
    const { req, res, sent } = requestPair();
    req.headers.authorization = 'enterprise-api-key';
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { code: 401, payload: { msg: 'User is not activated' } },
    ]);
    expect(req.org).toBeUndefined();
  });

  test('the refusal holds on an instance with no billing configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const middleware = middlewareFor(organization([false]));
    const { req, res, sent } = requestPair();
    req.headers.authorization = 'enterprise-api-key';
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  test('an approved user keeps the key working', async () => {
    const middleware = middlewareFor(organization([true]));
    const { req, res, sent } = requestPair();
    req.headers.authorization = 'enterprise-api-key';
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(sent).toEqual([]);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.org.id).toBe('org-1');
  });

  test('one approved member is enough for a mixed organization', async () => {
    const middleware = middlewareFor(organization([false, true]));
    const { req, res, sent } = requestPair();
    req.headers.authorization = 'enterprise-api-key';
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(sent).toEqual([]);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('an OAuth token belonging to a blocked account is refused', async () => {
    const middleware = middlewareFor(null, {
      organization: organization([false]),
      user: { id: 'user-1', activated: false },
    });
    const { req, res, sent } = requestPair();
    req.headers.authorization = 'pos_token';
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { code: 401, payload: { msg: 'User is not activated' } },
    ]);
  });

  test('an OAuth token belonging to an approved account still works', async () => {
    const middleware = middlewareFor(null, {
      organization: organization([true]),
      user: { id: 'user-1', activated: true },
    });
    const { req, res, sent } = requestPair();
    req.headers.authorization = 'pos_token';
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(sent).toEqual([]);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

test('getOrgByApiKey loads the activation flag the middleware reads', async () => {
  let query;
  const repository = new OrganizationRepository(
    {
      model: {
        organization: {
          findFirst: (args) => {
            query = args;
            return null;
          },
        },
      },
    },
    {},
    {}
  );

  repository.getOrgByApiKey('encrypted-key');

  expect(query.where).toEqual({ apiKey: 'encrypted-key' });
  expect(query.include.users).toEqual({
    select: { user: { select: { activated: true } } },
  });
});
