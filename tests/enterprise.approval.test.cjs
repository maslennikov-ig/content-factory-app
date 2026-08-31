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

// The real normalizer, not a copy of it. A second implementation inside a mock
// agrees with the first exactly until someone changes one of them, and then
// these tests keep passing against a rule the product no longer follows.
const userIdentityHelpers = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/user-identity.ts',
  { '@prisma/client': { Provider: { LOCAL: 'LOCAL' } } }
);

// The real newsletter-consent rule, shared with the registration form. A stub
// would let the two sides of the same decision drift apart unnoticed.
const {
  loadTypeScriptModule: loadSharedModule,
} = require('./helpers/load-tsx.cjs');
const newsletterConsentRules = loadSharedModule(
  'libraries/helpers/src/auth/newsletter.consent.ts'
);

const approval = loadTypeScriptModule(
  'libraries/helpers/src/auth/registration.approval.ts'
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

const { OrganizationService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      HttpException: class extends Error {},
    },
    '@prisma/client': { ShortLinkPreference: {} },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/settings/add.team.member.dto': {
      AddTeamMemberDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto': {
      AdminAddTeamMemberDto: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository':
      { OrganizationRepository: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: {},
    },
    '@contentfactory/helpers/auth/auth.service': { AuthService: {} },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'generated-id',
    },
    dayjs: () => ({ add: () => ({ format: () => 'never' }) }),
    '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service': {
      AutopostService: class {},
    },
    '@contentfactory/helpers/auth/registration.approval': approval,
    '@contentfactory/helpers/auth/newsletter.consent': newsletterConsentRules,
  }
);

const originalRequireApproval = process.env.CONTENT_FACTORY_REQUIRE_APPROVAL;

afterAll(() => {
  if (originalRequireApproval === undefined) {
    delete process.env.CONTENT_FACTORY_REQUIRE_APPROVAL;
  } else {
    process.env.CONTENT_FACTORY_REQUIRE_APPROVAL = originalRequireApproval;
  }
});

test.each([
  [false, true],
  [true, false],
])(
  'enterprise user persists activated=%s when approval mode is %s',
  async (activated, approvalRequired) => {
    if (approvalRequired) {
      process.env.CONTENT_FACTORY_REQUIRE_APPROVAL = 'true';
    } else {
      delete process.env.CONTENT_FACTORY_REQUIRE_APPROVAL;
    }

    const create = jest.fn(async (input) => input);
    const repository = new OrganizationRepository(
      { model: { organization: { create } } },
      {},
      {}
    );
    const service = new OrganizationService(repository, {});

    const result = await service.createMaxUser(
      'reseller-1',
      'Reseller user',
      'reseller',
      'user@example.com'
    );

    const persistedUser = result.data.users.create.user.create;
    expect(persistedUser.activated).toBe(activated);
    expect(result.data.users.create.role).toBe('SUPERADMIN');
    expect(result.data.subscription.create.subscriptionTier).toBe('ULTIMATE');
  }
);
