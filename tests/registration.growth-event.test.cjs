const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const Provider = {
  LOCAL: 'LOCAL',
  GENERIC: 'GENERIC',
  GOOGLE: 'GOOGLE',
};

const dtoModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts',
  { '@prisma/client': { Provider } },
  {
    sources: {
      './starter-template':
        'libraries/nestjs-libraries/src/dtos/auth/starter-template.ts',
    },
  }
);
const { CreateOrgUserDto } = dtoModule;

const { AuthService } = loadTypeScriptModule(
  'apps/backend/src/services/auth/auth.service.ts',
  {
    '@prisma/client': { Provider },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': dtoModule,
    '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto': {
      LoginUserDto: class LoginUserDto {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
      UsersService: class UsersService {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': {
      OrganizationService: class OrganizationService {},
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        comparePassword: () => true,
        signJWT: (user) => `session:${user.id}`,
        verifyJWT: () => false,
      },
    },
    '@contentfactory/helpers/auth/registration.approval': {
      registrationRequiresApproval: () => false,
    },
    '@contentfactory/helpers/auth/newsletter.consent': {
      resolveNewsletterConsent: () => false,
    },
    '@contentfactory/backend/services/auth/providers/providers.manager': {
      AuthProviderManager: class AuthProviderManager {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service': {
      NotificationService: class NotificationService {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto': {
      ForgotReturnPasswordDto: class ForgotReturnPasswordDto {},
    },
    '@contentfactory/nestjs-libraries/services/email.service': {
      EmailService: class EmailService {},
    },
    '@contentfactory/backend/services/auth/identity-confirmation': {
      discardIdentityConfirmation: async () => undefined,
      issueIdentityConfirmation: async () => 'token',
      readIdentityConfirmation: async () => null,
      IDENTITY_CONFIRMATION_TTL_SECONDS: 1200,
    },
    '@contentfactory/backend/services/newsletter/newsletter-delivery-retry.service.v1': {
      NewsletterDeliveryRetryServiceV1: class NewsletterDeliveryRetryServiceV1 {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.service': {
      PublicGrowthService: class PublicGrowthService {},
    },
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

function createService({
  metricFailure = false,
  existingProviderUser = null,
  addToOrgFailure = false,
} = {}) {
  const creates = [];
  const metrics = [];
  const userService = {
    getUserByEmail: async () => null,
    getUserByProvider: async () => existingProviderUser,
  };
  const organizationService = {
    getCount: async () => 2,
    createOrgAndUser: async (body) => {
      creates.push(body);
      return {
        id: 'org-private',
        users: [
          {
            user: {
              id: 'user-private',
              email: body.email,
              activated: true,
              newsletterDeliveryPendingAt: null,
            },
          },
        ],
      };
    },
    addUserToOrg: async () => {
      if (addToOrgFailure) throw new Error('target organization unavailable');
      return { organizationId: 'target-org' };
    },
  };
  const providerManager = {
    getProvider: () => ({
      getUser: async () => ({ id: 'provider-id', email: 'provider@example.com' }),
      postRegistration: async () => undefined,
    }),
  };
  const growth = {
    recordTrusted: async (...args) => {
      metrics.push(args);
      if (metricFailure) throw new Error('metrics unavailable');
      return { recorded: true };
    },
  };
  const service = new AuthService(
    userService,
    organizationService,
    {},
    { sendEmail: async () => undefined },
    providerManager,
    {},
    growth
  );
  return { creates, metrics, service };
}

function localBody(overrides = {}) {
  return Object.assign(new CreateOrgUserDto(), {
    email: 'owner@example.com',
    password: 'secret12',
    provider: Provider.LOCAL,
    providerToken: '',
    workspaceName: 'Launch Workspace',
    ...overrides,
  });
}

describe('trusted registration growth event', () => {
  test('records one server-side event for a newly committed local account', async () => {
    const { service, metrics } = createService();

    await service.routeAuth(Provider.LOCAL, localBody(), 'private-ip', 'private-ua');

    expect(metrics).toEqual([
      ['registration_completed', 'registration_completed:org-private'],
    ]);
  });

  test('a metrics outage does not roll back an already committed account', async () => {
    const { service, creates } = createService({ metricFailure: true });

    await expect(
      service.routeAuth(Provider.LOCAL, localBody(), 'private-ip', 'private-ua')
    ).resolves.toMatchObject({ awaitingApproval: false });
    expect(creates).toHaveLength(1);
  });

  test('records the committed registration even if joining another organization fails', async () => {
    const { service, metrics } = createService({ addToOrgFailure: true });

    await expect(
      service.routeAuth(
        Provider.LOCAL,
        localBody(),
        'private-ip',
        'private-ua',
        { orgId: 'target-org', id: 'membership', role: 'USER' }
      )
    ).rejects.toThrow('target organization unavailable');
    expect(metrics).toEqual([
      ['registration_completed', 'registration_completed:org-private'],
    ]);
  });

  test('provider registration forwards the progressive workspace intent', async () => {
    const { service, creates, metrics } = createService();

    await service.routeAuth(
      Provider.GOOGLE,
      {
        provider: Provider.GOOGLE,
        providerToken: 'token',
        workspaceName: 'Provider Workspace',
        company: 'Legacy Company',
      },
      'private-ip',
      'private-ua'
    );

    expect(creates[0]).toMatchObject({
      workspaceName: 'Provider Workspace',
      company: 'Legacy Company',
    });
    expect(metrics).toEqual([
      ['registration_completed', 'registration_completed:org-private'],
    ]);
  });

  test('a returning provider account is not counted as a registration', async () => {
    const { service, metrics } = createService({
      existingProviderUser: { id: 'existing', activated: true },
    });

    await service.routeAuth(
      Provider.GOOGLE,
      { provider: Provider.GOOGLE, providerToken: 'token' },
      'private-ip',
      'private-ua'
    );

    expect(metrics).toEqual([]);
  });
});
