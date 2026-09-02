const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

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

const Provider = {
  LOCAL: 'LOCAL',
  GENERIC: 'GENERIC',
  TELEGRAM: 'TELEGRAM',
};
const newsletterRegister = jest.fn(async () => undefined);
const { AuthService } = loadTypeScriptModule(
  'apps/backend/src/services/auth/auth.service.ts',
  {
    '@nestjs/common': { Injectable: () => (target) => target },
    '@prisma/client': { Provider },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto': {
      LoginUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
      UsersService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': {
      OrganizationService: class {},
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        comparePassword: () => false,
        signJWT: (user) => `session:${user.id}`,
        verifyJWT: () => false,
      },
    },
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
    '@contentfactory/backend/services/auth/identity-confirmation': {
      issueIdentityConfirmation: async () => 'unused-confirmation-token',
      readIdentityConfirmation: async () => null,
      discardIdentityConfirmation: async () => undefined,
      IDENTITY_CONFIRMATION_TTL_SECONDS: 1200,
    },
    // The real switch, left in its default off position by this suite.
    '@contentfactory/helpers/auth/registration.approval': loadTypeScriptModule(
      'libraries/helpers/src/auth/registration.approval.ts'
    ),
    '@contentfactory/helpers/auth/newsletter.consent': newsletterConsentRules,
    '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/locale/backend-strings.ts'
    ),
  }
);

const createAuthService = ({ existingUser = null } = {}) => {
  const provider = {
    generateLink: jest.fn(),
    getToken: jest.fn(async () => 'verified-id-token'),
    getUser: jest.fn(async () => ({
      id: 'telegram-user-42',
      email: 'telegram_telegram-user-42',
    })),
    postRegistration: jest.fn(async () => undefined),
  };
  const userService = {
    getUserByProvider: jest.fn(async () => existingUser),
  };
  const organizationService = {
    getCount: jest.fn(async () => 0),
    createOrgAndUser: jest.fn(async () => ({
      id: 'membership-1',
      users: [
        {
          user: {
            id: 'created-user',
            email: 'telegram_telegram-user-42',
            activated: true,
          },
        },
      ],
    })),
  };
  const providerManager = { getProvider: jest.fn(() => provider) };
  const service = new AuthService(
    userService,
    organizationService,
    {},
    {},
    providerManager
  );

  return { service, provider, userService, organizationService };
};

describe('Telegram authentication flow', () => {
  test('forwards both the callback state and the browser cookie to the exchange', async () => {
    const { service, provider } = createAuthService();

    await service.checkExists(
      Provider.TELEGRAM,
      'authorization-code',
      'https://app.example/auth?provider=TELEGRAM',
      { state: 'callback-state', browserState: 'callback-state' }
    );

    expect(provider.getToken).toHaveBeenCalledWith(
      'authorization-code',
      'https://app.example/auth?provider=TELEGRAM',
      { state: 'callback-state', browserState: 'callback-state' }
    );
  });

  test('a repeat login returns a session for the existing Telegram user', async () => {
    const existingUser = {
      id: 'existing-user',
      email: 'telegram_telegram-user-42',
      activated: true,
    };
    const { service, organizationService } = createAuthService({ existingUser });

    await expect(
      service.checkExists(
        Provider.TELEGRAM,
        'authorization-code',
        'https://app.example/auth?provider=TELEGRAM',
        { state: 'callback-state', browserState: 'callback-state' }
      )
    ).resolves.toEqual({ jwt: 'session:existing-user' });
    expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
  });

  test('a first Telegram login creates one activated provider organization', async () => {
    const { service, organizationService } = createAuthService();

    await expect(
      service.routeAuth(
        Provider.TELEGRAM,
        {
          company: 'Telegram workspace',
          providerToken: 'verified-id-token',
          provider: Provider.TELEGRAM,
        },
        '127.0.0.1',
        'test-agent'
      )
    ).resolves.toEqual({
      addedOrg: false,
      jwt: 'session:created-user',
      awaitingApproval: false,
    });

    expect(organizationService.createOrgAndUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'telegram_telegram-user-42',
        password: '',
        provider: Provider.TELEGRAM,
        providerId: 'telegram-user-42',
      }),
      '127.0.0.1',
      'test-agent'
    );
  });

  test('wires the provider without exposing a button when config is absent', () => {
    expect(read('libraries/nestjs-libraries/src/database/prisma/schema.prisma')).toMatch(
      /enum Provider \{[^}]*\bTELEGRAM\b/s
    );
    expect(read('apps/backend/src/api/api.module.ts')).toContain(
      'TelegramProvider'
    );
    expect(read('libraries/react-shared-libraries/src/helpers/variable.context.tsx')).toContain(
      'telegramLoginEnabled: false'
    );

    for (const file of [
      'apps/frontend/src/components/auth/login.tsx',
      'apps/frontend/src/components/auth/register.tsx',
    ]) {
      const source = read(file);
      expect(source).toContain('telegramLoginEnabled');
      expect(source).toContain('<TelegramProvider key="telegram" />');
    }
  });

  test('ships the Telegram label in every locale', () => {
    const localesRoot = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/translation/locales'
    );
    const localeFiles = fs
      .readdirSync(localesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(localesRoot, entry.name, 'translation.json'))
      .filter((file) => fs.existsSync(file));

    expect(localeFiles).toHaveLength(16);
    for (const file of localeFiles) {
      const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(messages.sign_in_with_telegram).toEqual(expect.any(String));
      expect(messages.sign_in_with_telegram.trim()).not.toBe('');
    }
  });
});
