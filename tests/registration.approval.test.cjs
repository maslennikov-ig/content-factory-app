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

// The real decision module, shared by every layer under test. Mocking it would
// only prove the layers call something.
const approval = loadTypeScriptModule(
  'libraries/helpers/src/auth/registration.approval.ts'
);
const { registrationRequiresApproval, resolveNewUserAccess } = approval;

const { buildBackendCorsOptions } = loadTypeScriptModule(
  'apps/backend/src/cors.options.ts'
);

const APPROVAL_MODULE = '@contentfactory/helpers/auth/registration.approval';

const Provider = {
  LOCAL: 'LOCAL',
  GENERIC: 'GENERIC',
  TELEGRAM: 'TELEGRAM',
  GOOGLE: 'GOOGLE',
};

class CreateOrgUserDto {}
class LoginUserDto {}

const requireApproval = (on) => {
  if (on) {
    process.env.CONTENT_FACTORY_REQUIRE_APPROVAL = 'true';
  } else {
    delete process.env.CONTENT_FACTORY_REQUIRE_APPROVAL;
  }
};

beforeEach(() => {
  requireApproval(false);
});

afterAll(() => {
  requireApproval(false);
});

describe('the approval switch', () => {
  test('only the exact string turns it on', () => {
    for (const value of ['false', 'FALSE', '1', 'yes', 'True', '']) {
      process.env.CONTENT_FACTORY_REQUIRE_APPROVAL = value;
      expect(registrationRequiresApproval()).toBe(false);
    }

    process.env.CONTENT_FACTORY_REQUIRE_APPROVAL = 'true';
    expect(registrationRequiresApproval()).toBe(true);
  });

  test('an unset variable leaves the instance as upstream behaves', () => {
    delete process.env.CONTENT_FACTORY_REQUIRE_APPROVAL;
    expect(registrationRequiresApproval()).toBe(false);
  });
});

test('the browser may read the approval compatibility header', () => {
  expect(buildBackendCorsOptions({}).exposedHeaders).toContain('approval');
});

describe('what a new account is allowed to do', () => {
  test('the first public account on an empty instance receives no administrator role', () => {
    requireApproval(true);

    expect(
      resolveNewUserAccess({
        provider: Provider.LOCAL,
        hasEmailProvider: true,
        firstOrganization: true,
      })
    ).toEqual({ activated: false, isSuperAdmin: false });
  });

  test.each([Provider.LOCAL, Provider.GOOGLE, Provider.TELEGRAM])(
    'approval mode holds back a later %s account',
    (provider) => {
      requireApproval(true);

      expect(
        resolveNewUserAccess({
          provider,
          hasEmailProvider: false,
          firstOrganization: false,
        })
      ).toEqual({ activated: false, isSuperAdmin: false });
    }
  );

  test('without approval mode the upstream rules stand', () => {
    expect(
      resolveNewUserAccess({
        provider: Provider.LOCAL,
        hasEmailProvider: true,
        firstOrganization: false,
      })
    ).toEqual({ activated: false, isSuperAdmin: false });

    expect(
      resolveNewUserAccess({
        provider: Provider.LOCAL,
        hasEmailProvider: false,
        firstOrganization: false,
      })
    ).toEqual({ activated: true, isSuperAdmin: false });

    expect(
      resolveNewUserAccess({
        provider: Provider.TELEGRAM,
        hasEmailProvider: true,
        firstOrganization: false,
      })
    ).toEqual({ activated: true, isSuperAdmin: false });
  });

  test('self-service registration never hands out administrator rights', () => {
    for (const firstOrganization of [true, false]) {
      for (const on of [true, false]) {
        requireApproval(on);
        const access = resolveNewUserAccess({
          provider: Provider.LOCAL,
          hasEmailProvider: false,
          firstOrganization,
        });
        expect(access.isSuperAdmin).toBe(false);
      }
    }
  });
});

const { OrganizationService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      HttpException: class extends Error {},
    },
    '@prisma/client': { ShortLinkPreference: {} },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto,
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
    '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service':
      { AutopostService: class {} },
    '@contentfactory/helpers/auth/auth.service': { AuthService: {} },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'generated',
    },
    // organization.service.ts now writes the invitation through the string
    // catalog and the shared email shell; the loader resolves only what a
    // test names, so both are loaded for real.
    '@contentfactory/nestjs-libraries/locale/backend-strings': loadSharedModule(
      'libraries/nestjs-libraries/src/locale/backend-strings.ts'
    ),
    '@contentfactory/nestjs-libraries/emails/email.template': loadSharedModule(
      'libraries/nestjs-libraries/src/emails/email.template.ts'
    ),
    [APPROVAL_MODULE]: approval,
  }
);

const createOrganizationService = ({ organizations, hasEmailProvider }) => {
  const repository = {
    getCount: jest.fn(async () => organizations),
    createOrgAndUser: jest.fn(async () => ({ id: 'org', users: [] })),
  };
  const notifications = {
    hasEmailProvider: jest.fn(() => hasEmailProvider),
  };
  return {
    service: new OrganizationService(repository, notifications),
    repository,
  };
};

describe('creating the organization and its first user', () => {
  test('an empty instance does not turn the first public registrant into an administrator', async () => {
    requireApproval(true);
    const { service, repository } = createOrganizationService({
      organizations: 0,
      hasEmailProvider: true,
    });

    await service.createOrgAndUser(
      { company: 'Studio', email: 'founder@example.com', provider: 'LOCAL' },
      '127.0.0.1',
      'agent'
    );

    expect(repository.createOrgAndUser).toHaveBeenCalledWith(
      expect.any(Object),
      { activated: false, isSuperAdmin: false },
      '127.0.0.1',
      'agent'
    );
  });

  test('everyone after them waits, whichever way they signed up', async () => {
    requireApproval(true);

    for (const provider of ['LOCAL', 'TELEGRAM']) {
      const { service, repository } = createOrganizationService({
        organizations: 3,
        hasEmailProvider: false,
      });

      await service.createOrgAndUser(
        { company: 'Studio', email: 'guest@example.com', provider },
        '127.0.0.1',
        'agent'
      );

      expect(repository.createOrgAndUser).toHaveBeenCalledWith(
        expect.any(Object),
        { activated: false, isSuperAdmin: false },
        '127.0.0.1',
        'agent'
      );
    }
  });

  test('with the switch off a federated sign-up is usable at once', async () => {
    const { service, repository } = createOrganizationService({
      organizations: 3,
      hasEmailProvider: true,
    });

    await service.createOrgAndUser(
      { company: 'Studio', email: 'guest@example.com', provider: 'TELEGRAM' },
      '127.0.0.1',
      'agent'
    );

    expect(repository.createOrgAndUser).toHaveBeenCalledWith(
      expect.any(Object),
      { activated: true, isSuperAdmin: false },
      '127.0.0.1',
      'agent'
    );
  });
});

const newsletterRegister = jest.fn(async () => undefined);
const verifyJWT = jest.fn();
const { AuthService } = loadTypeScriptModule(
  'apps/backend/src/services/auth/auth.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        error() {}
        warn() {}
        log() {}
      },
    },
    '@prisma/client': { Provider },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto,
    },
    '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto': {
      LoginUserDto,
    },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
      UsersService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
      { OrganizationService: class {} },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        comparePassword: () => true,
        signJWT: (user) => `session:${user.id}`,
        verifyJWT: (...args) => verifyJWT(...args),
      },
    },
    '@contentfactory/backend/services/auth/providers/providers.manager': {
      AuthProviderManager: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class {} },
    '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto': {
      ForgotReturnPasswordDto: class {},
    },
    '@contentfactory/nestjs-libraries/services/email.service': {
      EmailService: class {},
    },
    '@contentfactory/nestjs-libraries/newsletter/newsletter.service': {
      NewsletterService: { register: newsletterRegister },
    },
    '@contentfactory/nestjs-libraries/integrations/telegram.updates.service': {
      TelegramUpdatesService: class {},
    },
    '@contentfactory/backend/services/auth/identity-confirmation': {
      issueIdentityConfirmation: async () => 'unused-confirmation-token',
      readIdentityConfirmation: async () => null,
      discardIdentityConfirmation: async () => undefined,
      IDENTITY_CONFIRMATION_TTL_SECONDS: 1200,
    },
    '@contentfactory/helpers/auth/newsletter.consent': newsletterConsentRules,
    [APPROVAL_MODULE]: approval,
    '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/locale/backend-strings.ts'
    ),
    // auth.service.ts builds the button in these emails through the shared
    // shell; the loader resolves only what a test names.
    '@contentfactory/nestjs-libraries/emails/email.template': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/emails/email.template.ts'
    ),
  }
);

const createAuthService = ({
  existingLocalUser = null,
  existingProviderUser = null,
  createdUser = { id: 'created-user', email: 'guest@example.com', activated: false },
  providerOverrides = {},
  telegramNotifyImpl = jest.fn(async () => undefined),
} = {}) => {
  const userService = {
    getUserByEmail: jest.fn(async () => existingLocalUser),
    getUserByProvider: jest.fn(async () => existingProviderUser),
    activateUser: jest.fn(async () => undefined),
  };
  const organizationService = {
    getCount: jest.fn(async () => 3),
    createOrgAndUser: jest.fn(async () => ({
      id: 'org',
      users: [{ user: createdUser }],
    })),
  };
  const emailService = { sendEmail: jest.fn(async () => undefined) };
  const providerManager = {
    getProvider: jest.fn(() => ({
      getUser: jest.fn(async () => ({
        id: 'provider-user',
        email: 'guest@example.com',
      })),
      getToken: jest.fn(async () => 'id-token'),
      postRegistration: jest.fn(async () => undefined),
      ...providerOverrides,
    })),
  };
  const telegramUpdatesService = {
    notifyAdminsOfPendingApproval: telegramNotifyImpl,
  };

  const service = new AuthService(
    userService,
    organizationService,
    {},
    emailService,
    providerManager,
    undefined,
    undefined,
    telegramUpdatesService
  );

  return {
    service,
    userService,
    organizationService,
    emailService,
    telegramUpdatesService,
  };
};

describe('the account-activation email speaks the registration language', () => {
  test('a Russian registration gets a Russian subject and body, not English', async () => {
    requireApproval(false);
    const { service, emailService } = createAuthService({
      createdUser: {
        id: 'created-user',
        email: 'гость@example.com',
        activated: false,
        language: 'ru',
      },
    });

    const body = Object.assign(new CreateOrgUserDto(), {
      email: 'гость@example.com',
      password: 'secret',
      company: 'Studio',
      provider: Provider.LOCAL,
      language: 'ru',
    });

    await service.routeAuth(Provider.LOCAL, body, '127.0.0.1', 'agent');

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = emailService.sendEmail.mock.calls[0];
    expect(to).toBe('гость@example.com');
    expect(subject).toBe('Активируйте аккаунт');
    // The sentence used to carry the link inside it; the body is now the
    // intro plus a button, so the Russian is checked in both halves.
    expect(html).toContain('Осталось подтвердить адрес');
    expect(html).toContain('Активировать аккаунт');
    expect(html).not.toContain('to activate your account');
    expect(subject).not.toBe('Activate your account');
  });

  test('an unrecognised language falls back to English rather than failing', async () => {
    requireApproval(false);
    const { service, emailService } = createAuthService({
      createdUser: {
        id: 'created-user',
        email: 'guest@example.com',
        activated: false,
        language: 'not-a-real-locale',
      },
    });

    const body = Object.assign(new CreateOrgUserDto(), {
      email: 'guest@example.com',
      password: 'secret',
      company: 'Studio',
      provider: Provider.LOCAL,
    });

    await service.routeAuth(Provider.LOCAL, body, '127.0.0.1', 'agent');

    const [, subject] = emailService.sendEmail.mock.calls[0];
    expect(subject).toBe('Activate your account');
  });
});

describe('registration while approval is required', () => {
  test('an email sign-up gets no session and no activation link, but does get a mail', async () => {
    requireApproval(true);
    const { service, emailService } = createAuthService();

    const body = Object.assign(new CreateOrgUserDto(), {
      email: 'Guest@Example.com',
      password: 'secret',
      company: 'Studio',
      provider: Provider.LOCAL,
    });

    await expect(
      service.routeAuth(Provider.LOCAL, body, '127.0.0.1', 'agent')
    ).resolves.toEqual({
      addedOrg: false,
      jwt: '',
      awaitingApproval: true,
    });

    // Silence is the bug this guards against: the applicant must hear
    // something, even though what they hear must never be a session token
    // or an activation link (see the guard below).
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    const [to, , html] = emailService.sendEmail.mock.calls[0];
    expect(to).toBe('guest@example.com');

    // The one thing that email must never contain: a way in. Handing out
    // a JWT or an activation link here would hand out the very approval
    // the mode exists to withhold.
    expect(html).not.toMatch(/jwt/i);
    expect(html).not.toContain('/auth/activate');
    expect(html).not.toMatch(/https?:\/\//i);
  });

  test('a mail failure does not undo a registration that already succeeded', async () => {
    requireApproval(true);
    const { service, emailService } = createAuthService();
    emailService.sendEmail.mockRejectedValueOnce(
      new Error('Temporal client unavailable')
    );
    const reported = jest.spyOn(console, 'error').mockImplementation(() => {});

    const body = Object.assign(new CreateOrgUserDto(), {
      email: 'unlucky@example.com',
      password: 'secret',
      company: 'Studio',
      provider: Provider.LOCAL,
    });

    // The row is written before the mail is queued. If a dead mail path threw
    // out of here, the person would read "registration failed", try again,
    // and be told the address is already taken — with an account they cannot
    // reach sitting in the database. So the send may fail; the registration
    // may not.
    await expect(
      service.routeAuth(Provider.LOCAL, body, '127.0.0.1', 'agent')
    ).resolves.toEqual({
      addedOrg: false,
      jwt: '',
      awaitingApproval: true,
    });

    // Failing quietly is not the same as failing invisibly. Until
    // `content-factory-next-7jxo` gives the mail path a way to report, this
    // line is the only trace a failed send leaves anywhere.
    expect(reported).toHaveBeenCalled();
    reported.mockRestore();
  });

  test('a federated sign-up gets no session either', async () => {
    requireApproval(true);
    const { service } = createAuthService({
      createdUser: { id: 'created-user', activated: false },
    });

    await expect(
      service.routeAuth(
        Provider.TELEGRAM,
        { company: 'Studio', providerToken: 'token', provider: Provider.TELEGRAM },
        '127.0.0.1',
        'agent'
      )
    ).resolves.toEqual({ addedOrg: false, jwt: '', awaitingApproval: true });
  });

  /**
   * The whole point of `content-factory-next-rmfv`: an administrator with a
   * bound Telegram chat must be paged the moment a new account is written
   * switched off, so the queue at `/admin/users` is never a place someone has
   * to remember to go and check.
   */
  test('an email sign-up in approval mode pages the administrators over Telegram', async () => {
    requireApproval(true);
    const { service, telegramUpdatesService } = createAuthService({
      createdUser: {
        id: 'created-user',
        email: 'guest@example.com',
        activated: false,
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
      },
    });

    const body = Object.assign(new CreateOrgUserDto(), {
      email: 'Guest@Example.com',
      password: 'secret',
      company: 'Studio',
      provider: Provider.LOCAL,
    });

    await service.routeAuth(Provider.LOCAL, body, '127.0.0.1', 'agent');

    expect(
      telegramUpdatesService.notifyAdminsOfPendingApproval
    ).toHaveBeenCalledWith(
      'guest@example.com',
      new Date('2026-09-02T10:00:00.000Z')
    );
  });

  test('a federated sign-up in approval mode also pages the administrators', async () => {
    requireApproval(true);
    const { service, telegramUpdatesService } = createAuthService({
      createdUser: {
        id: 'created-user',
        email: 'federated-guest@example.com',
        activated: false,
        createdAt: new Date('2026-09-02T11:00:00.000Z'),
      },
    });

    await service.routeAuth(
      Provider.TELEGRAM,
      { company: 'Studio', providerToken: 'token', provider: Provider.TELEGRAM },
      '127.0.0.1',
      'agent'
    );

    expect(
      telegramUpdatesService.notifyAdminsOfPendingApproval
    ).toHaveBeenCalledWith(
      'federated-guest@example.com',
      new Date('2026-09-02T11:00:00.000Z')
    );
  });

  test('a Telegram paging failure does not undo a registration that already succeeded', async () => {
    requireApproval(true);
    const reported = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { service, telegramUpdatesService } = createAuthService({
      telegramNotifyImpl: jest
        .fn()
        .mockRejectedValueOnce(new Error('bot token dead')),
    });

    const body = Object.assign(new CreateOrgUserDto(), {
      email: 'unlucky-telegram@example.com',
      password: 'secret',
      company: 'Studio',
      provider: Provider.LOCAL,
    });

    await expect(
      service.routeAuth(Provider.LOCAL, body, '127.0.0.1', 'agent')
    ).resolves.toEqual({
      addedOrg: false,
      jwt: '',
      awaitingApproval: true,
    });

    expect(telegramUpdatesService.notifyAdminsOfPendingApproval).toHaveBeenCalled();
    reported.mockRestore();
  });

  test('an approved account signing up normally is not paged as pending', async () => {
    requireApproval(false);
    const { service, telegramUpdatesService } = createAuthService();

    const body = Object.assign(new CreateOrgUserDto(), {
      email: 'not-gated@example.com',
      password: 'secret',
      company: 'Studio',
      provider: Provider.LOCAL,
    });

    await service.routeAuth(Provider.LOCAL, body, '127.0.0.1', 'agent');

    expect(
      telegramUpdatesService.notifyAdminsOfPendingApproval
    ).not.toHaveBeenCalled();
  });

  test('an approved account signs in normally', async () => {
    requireApproval(true);
    const { service } = createAuthService({
      existingLocalUser: {
        id: 'approved-user',
        password: 'hash',
        activated: true,
      },
    });

    await expect(
      service.routeAuth(
        Provider.LOCAL,
        { email: 'guest@example.com', password: 'secret' },
        '127.0.0.1',
        'agent'
      )
    ).resolves.toEqual({
      addedOrg: false,
      jwt: 'session:approved-user',
      awaitingApproval: false,
    });
  });
});

describe('signing in before someone approves', () => {
  test('the message says a person is the next step', async () => {
    requireApproval(true);
    const { service } = createAuthService({
      existingLocalUser: { id: 'waiting', password: 'hash', activated: false },
    });

    await expect(
      service.routeAuth(
        Provider.LOCAL,
        { email: 'guest@example.com', password: 'secret' },
        '127.0.0.1',
        'agent'
      )
    ).rejects.toThrow('User is awaiting approval');
  });

  test('without the mode the message still points at the email', async () => {
    const { service } = createAuthService({
      existingLocalUser: { id: 'waiting', password: 'hash', activated: false },
    });

    await expect(
      service.routeAuth(
        Provider.LOCAL,
        { email: 'guest@example.com', password: 'secret' },
        '127.0.0.1',
        'agent'
      )
    ).rejects.toThrow('User is not activated');
  });

  test('a returning federated account is held back too', async () => {
    requireApproval(true);
    const { service } = createAuthService({
      existingProviderUser: { id: 'waiting', activated: false },
    });

    await expect(
      service.routeAuth(
        Provider.TELEGRAM,
        { company: 'Studio', providerToken: 'token', provider: Provider.TELEGRAM },
        '127.0.0.1',
        'agent'
      )
    ).rejects.toThrow('User is awaiting approval');
  });
});

describe('the provider callback exchange', () => {
  test('hands no session to an account that is switched off', async () => {
    requireApproval(true);
    const { service } = createAuthService({
      existingProviderUser: { id: 'waiting', activated: false },
    });

    await expect(
      service.checkExists(Provider.TELEGRAM, 'code', 'https://app/auth', {})
    ).resolves.toEqual({ awaitingApproval: true });
  });

  test('an approved account still gets its session', async () => {
    requireApproval(true);
    const { service } = createAuthService({
      existingProviderUser: { id: 'approved', activated: true },
    });

    await expect(
      service.checkExists(Provider.TELEGRAM, 'code', 'https://app/auth', {})
    ).resolves.toEqual({ jwt: 'session:approved' });
  });
});

describe('self-service activation', () => {
  test('is refused while approval is required', async () => {
    requireApproval(true);
    const { service, userService } = createAuthService();
    verifyJWT.mockReturnValue({
      id: 'waiting',
      activated: false,
      email: 'guest@example.com',
    });

    await expect(service.activate('token')).resolves.toBe(false);
    expect(userService.activateUser).not.toHaveBeenCalled();
  });

  test('still works on an instance that activates by email', async () => {
    const { service, userService } = createAuthService({
      existingLocalUser: { id: 'waiting', activated: false },
    });
    verifyJWT.mockReturnValue({
      id: 'waiting',
      activated: false,
      email: 'guest@example.com',
    });

    await expect(service.activate('token')).resolves.toBe(
      'session:waiting'
    );
    expect(userService.activateUser).toHaveBeenCalledWith('waiting');
  });

  test('resending the activation email is refused as well', async () => {
    requireApproval(true);
    const { service, emailService } = createAuthService();

    await expect(service.resendActivationEmail('guest@example.com')).rejects.toThrow(
      'Activation is handled by an administrator'
    );
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  test('a resent activation email is translated to the account language', async () => {
    requireApproval(false);
    const { service, emailService } = createAuthService({
      existingLocalUser: {
        id: 'waiting',
        email: 'ru-guest@example.com',
        activated: false,
        language: 'ru',
      },
    });

    await service.resendActivationEmail('ru-guest@example.com');

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    const [, subject, html] = emailService.sendEmail.mock.calls[0];
    expect(subject).toBe('Активируйте аккаунт');
    expect(html).toContain('Осталось подтвердить адрес');
    expect(html).toContain('Активировать аккаунт');
  });
});
