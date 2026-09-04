'use strict';

/**
 * `content-factory-next-fn33.18`: registering from an invitation link.
 *
 * What the owner found on 04.09.2026: an invited person registered, was given
 * a workspace of their own that nobody asked for, waited for the instance
 * owner to approve an account an administrator had already invited, and only
 * then could accept the invitation — ending up in two workspaces, one empty.
 *
 * What this suite pins:
 *
 *  - a valid invitation creates the account and its membership and nothing
 *    else: no workspace is founded;
 *  - the account is switched on even with approval mode on, and hears no
 *    «waiting for approval» email, because the invitation was the approval;
 *  - an address that is not the invited one is refused before any account
 *    exists;
 *  - a spent or expired link is an ordinary registration, not a refusal
 *    (`content-factory-next-fn33.29`) — and it does not fall back to the
 *    invited path;
 *  - the one-time marker is spent exactly once.
 *
 * The invitation module is the real one, with Redis standing in as a map:
 * mocking it would test that the auth service calls something, not that the
 * link is single use.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const Provider = { LOCAL: 'LOCAL', GENERIC: 'GENERIC', TELEGRAM: 'TELEGRAM' };

class CreateOrgUserDto {}
class LoginUserDto {}

/** Redis, as far as an invitation is concerned. */
const redis = new Map();
const ioRedis = {
  set: async (key, value) => {
    redis.set(key, value);
    return 'OK';
  },
  get: async (key) => redis.get(key) ?? null,
  getdel: async (key) => {
    const value = redis.get(key) ?? null;
    redis.delete(key);
    return value;
  },
};

// A signature this test can read back. The real one needs the instance secret;
// what the invitation flow cares about is that the claims survive the round
// trip and that nothing unsigned is accepted.
const helperAuthService = {
  signJWT: (payload) => `signed:${JSON.stringify(payload)}`,
  verifyJWT: (token) => {
    if (typeof token !== 'string' || !token.startsWith('signed:')) {
      throw new Error('bad signature');
    }
    return JSON.parse(token.slice('signed:'.length));
  },
  hashPassword: (password) => `hashed:${password}`,
  comparePassword: () => true,
  fixedEncryption: (value) => value,
};

const sharedMocks = {
  '@nestjs/common': {
    Injectable: () => (target) => target,
    HttpException: class HttpException extends Error {},
    Logger: class {
      error() {}
      warn() {}
      log() {}
    },
  },
  '@prisma/client': { Provider },
  '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis },
  '@contentfactory/helpers/auth/auth.service': {
    AuthService: helperAuthService,
  },
  '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
    CreateOrgUserDto,
  },
  '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto': { LoginUserDto },
  '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto': {
    ForgotReturnPasswordDto: class {},
  },
  '@contentfactory/nestjs-libraries/dtos/users/link-user-identity.dto': {
    LinkUserIdentityDto: class {},
  },
  '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
    UsersService: class {},
  },
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
    { OrganizationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
    { NotificationService: class {} },
  '@contentfactory/nestjs-libraries/services/email.service': {
    EmailService: class {},
  },
  '@contentfactory/backend/services/auth/providers/providers.manager': {
    AuthProviderManager: class {},
  },
  '@contentfactory/backend/services/newsletter/newsletter-delivery-retry.service.v1':
    { NewsletterDeliveryRetryServiceV1: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.service':
    { PublicGrowthService: class {} },
  '@contentfactory/nestjs-libraries/integrations/telegram.updates.service': {
    TelegramUpdatesService: class {},
  },
  '@contentfactory/backend/services/auth/identity-confirmation': {
    issueIdentityConfirmation: async () => 'unused',
    readIdentityConfirmation: async () => null,
    discardIdentityConfirmation: async () => undefined,
    IDENTITY_CONFIRMATION_TTL_SECONDS: 1200,
  },
};

const { AuthService } = loadTypeScriptModule(
  'apps/backend/src/services/auth/auth.service.ts',
  sharedMocks
);

const invitations = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/auth/team-invitation.ts',
  sharedMocks
);
const { issueTeamInvitation, TEAM_INVITATION_TTL_SECONDS } = invitations;

const INVITATION = {
  id: 'invite-1',
  orgId: 'org-1',
  role: 'EDITOR',
  workspaceName: 'Studio',
  inviterName: 'Ada',
  inviterEmail: 'ada@example.com',
};

const createdUser = {
  id: 'user-1',
  email: 'invited@example.com',
  activated: true,
  language: 'en',
  createdAt: new Date('2026-09-04T10:00:00.000Z'),
  newsletterDeliveryPendingAt: null,
};

const wire = () => {
  const organizationService = {
    getCount: jest.fn(async () => 3),
    createOrgAndUser: jest.fn(async () => ({
      id: 'own-org',
      users: [{ user: { ...createdUser, activated: false } }],
    })),
    /**
     * The real `OrganizationService.createInvitedUser` decides activation from
     * `vouchedFor` and, failing that, from the instance rule. The stand-in
     * mirrors only that one decision, so the assertions below are about what
     * the auth service asks for and what it does with the answer; the rule
     * itself is pinned against the real service in
     * `tests/registration.approval.test.cjs`.
     */
    createInvitedUser: jest.fn(async (_body, invitation, _ip, _agent, options) => ({
      id: 'membership-1',
      organizationId: invitation.orgId,
      role: invitation.role,
      user: {
        ...createdUser,
        activated:
          options?.vouchedFor ||
          process.env.CONTENT_FACTORY_REQUIRE_APPROVAL !== 'true',
      },
    })),
  };
  const userService = {
    getUserByEmail: jest.fn(async () => null),
    getUserByProvider: jest.fn(async () => null),
  };
  const emailService = { sendEmail: jest.fn(async () => undefined) };
  const telegramUpdatesService = {
    notifyAdminsOfPendingApproval: jest.fn(async () => undefined),
  };
  const publicGrowthService = { recordTrusted: jest.fn(async () => undefined) };
  const newsletterRetry = { schedule: jest.fn(async () => undefined) };

  const service = new AuthService(
    userService,
    organizationService,
    { sendEmail: jest.fn(async () => undefined) },
    emailService,
    { getProvider: jest.fn() },
    newsletterRetry,
    publicGrowthService,
    telegramUpdatesService
  );

  return {
    service,
    organizationService,
    emailService,
    telegramUpdatesService,
    publicGrowthService,
  };
};

const registration = (extra = {}) =>
  Object.assign(new CreateOrgUserDto(), {
    email: 'invited@example.com',
    password: 'Passw0rd!',
    provider: Provider.LOCAL,
    language: 'en',
    ...extra,
  });

const requireApproval = (on) => {
  if (on) process.env.CONTENT_FACTORY_REQUIRE_APPROVAL = 'true';
  else delete process.env.CONTENT_FACTORY_REQUIRE_APPROVAL;
};

const expiredToken = (claims) =>
  helperAuthService.signJWT({
    ...claims,
    timeLimit: new Date(Date.now() - 1000).toISOString(),
  });

beforeEach(() => {
  redis.clear();
  requireApproval(false);
});

afterAll(() => requireApproval(false));

describe('registering from an invitation', () => {
  test('creates the account inside the invited workspace and founds nothing', async () => {
    const token = await issueTeamInvitation({
      ...INVITATION,
      boundEmail: 'invited@example.com',
    });
    const { service, organizationService } = wire();

    const result = await service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token }),
      '127.0.0.1',
      'agent'
    );

    expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    expect(organizationService.createInvitedUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'invited@example.com' }),
      { id: 'invite-1', orgId: 'org-1', role: 'EDITOR' },
      '127.0.0.1',
      'agent',
      // The link was addressed to this person, so an administrator vouched.
      { vouchedFor: true }
    );
    expect(result.awaitingApproval).toBe(false);
    expect(result.jwt).toBeTruthy();
    expect(result.invitation).toEqual({
      organizationId: 'org-1',
      workspaceName: 'Studio',
      role: 'EDITOR',
    });
  });

  test('spends the one-time marker exactly once', async () => {
    const token = await issueTeamInvitation(INVITATION);
    expect(redis.size).toBe(1);

    const first = wire();
    await first.service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token }),
      '127.0.0.1',
      'agent'
    );
    expect(redis.size).toBe(0);

    // The same link again is not an invited registration any more: it is an
    // ordinary one, which is what the second browser window gets.
    const second = wire();
    await second.service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token, email: 'other@example.com' }),
      '127.0.0.1',
      'agent'
    );
    expect(second.organizationService.createInvitedUser).not.toHaveBeenCalled();
    expect(second.organizationService.createOrgAndUser).toHaveBeenCalled();
  });

  test('approval mode does not hold an invited account back', async () => {
    requireApproval(true);
    const token = await issueTeamInvitation({
      ...INVITATION,
      boundEmail: 'invited@example.com',
    });
    const { service, emailService, telegramUpdatesService, organizationService } =
      wire();

    const result = await service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token }),
      '127.0.0.1',
      'agent'
    );

    // The workspace administrator vouched for this person; the instance gate
    // is for strangers at the front door.
    expect(result.awaitingApproval).toBe(false);
    expect(result.jwt).toBeTruthy();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(
      telegramUpdatesService.notifyAdminsOfPendingApproval
    ).not.toHaveBeenCalled();
    // The vouching is what carries it past the gate, and it is passed
    // explicitly rather than assumed by the path.
    expect(organizationService.createInvitedUser).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      '127.0.0.1',
      'agent',
      { vouchedFor: true }
    );
  });

  /**
   * `content-factory-next-fn33.108`: the same approval mode, and a link with
   * no address on it.
   *
   * An open link is copied out of the product and passed on; whoever answers
   * it is a stranger no administrator has named. While it created an
   * `activated` account, anybody holding one could walk straight past
   * `CONTENT_FACTORY_REQUIRE_APPROVAL` — the gate was off for everyone who had
   * a link. Now the instance's own rule decides, and the person hears the
   * front door's letter.
   */
  test('an open link under approval mode waits, and is told so', async () => {
    requireApproval(true);
    const token = await issueTeamInvitation(INVITATION);
    const { service, emailService, telegramUpdatesService, organizationService } =
      wire();

    const result = await service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token, email: 'stranger@example.com' }),
      '127.0.0.1',
      'agent'
    );

    expect(organizationService.createInvitedUser).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      '127.0.0.1',
      'agent',
      { vouchedFor: false }
    );
    // No session token: that is the thing an administrator grants.
    expect(result.awaitingApproval).toBe(true);
    expect(result.jwt).toBe('');
    // And nothing sends them back to a spent link afterwards.
    expect(result.invitation).toBeUndefined();
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail.mock.calls[0][0]).toBe(
      'stranger@example.com'
    );
    expect(
      telegramUpdatesService.notifyAdminsOfPendingApproval
    ).toHaveBeenCalledWith('stranger@example.com', createdUser.createdAt);
  });

  /**
   * The membership is written either way. Asking somebody to answer an
   * invitation again after approval would mean answering a link that has
   * already been spent — the two-workspace tangle this whole path exists to
   * end.
   */
  test('an open link still puts the account in the workspace it named', async () => {
    requireApproval(true);
    const token = await issueTeamInvitation(INVITATION);
    const { service, organizationService } = wire();

    await service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token, email: 'stranger@example.com' }),
      '127.0.0.1',
      'agent'
    );

    expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    expect(organizationService.createInvitedUser).toHaveBeenCalled();
  });

  test('with approval off an open link is switched on as before', async () => {
    const token = await issueTeamInvitation(INVITATION);
    const { service, emailService } = wire();

    const result = await service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token, email: 'anyone@example.com' }),
      '127.0.0.1',
      'agent'
    );

    expect(result.awaitingApproval).toBe(false);
    expect(result.jwt).toBeTruthy();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  test('refuses another address without creating an account', async () => {
    const token = await issueTeamInvitation({
      ...INVITATION,
      boundEmail: 'invited@example.com',
    });
    const { service, organizationService } = wire();

    await expect(
      service.routeAuth(
        Provider.LOCAL,
        registration({ invitationToken: token, email: 'someone@example.com' }),
        '127.0.0.1',
        'agent'
      )
    ).rejects.toMatchObject({ code: 'invite_email_mismatch' });

    expect(organizationService.createInvitedUser).not.toHaveBeenCalled();
    expect(organizationService.createOrgAndUser).not.toHaveBeenCalled();
    // And the link survives for the person it was meant for.
    expect(redis.size).toBe(1);
  });

  test('a copied link accepts whatever address registers with it', async () => {
    const token = await issueTeamInvitation(INVITATION);
    const { service, organizationService } = wire();

    await service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token, email: 'anyone@example.com' }),
      '127.0.0.1',
      'agent'
    );

    expect(organizationService.createInvitedUser).toHaveBeenCalled();
  });

  test('an expired link is an ordinary registration, not a refusal', async () => {
    const token = expiredToken(INVITATION);
    const { service, organizationService } = wire();

    const result = await service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token }),
      '127.0.0.1',
      'agent'
    );

    expect(organizationService.createInvitedUser).not.toHaveBeenCalled();
    expect(organizationService.createOrgAndUser).toHaveBeenCalled();
    expect(result.invitation).toBeUndefined();
  });

  test('a garbled token is an ordinary registration too', async () => {
    const { service, organizationService } = wire();

    await service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: 'not.a.token' }),
      '127.0.0.1',
      'agent'
    );

    expect(organizationService.createInvitedUser).not.toHaveBeenCalled();
    expect(organizationService.createOrgAndUser).toHaveBeenCalled();
  });

  test('a registration without a token is untouched by any of this', async () => {
    const { service, organizationService } = wire();

    await service.routeAuth(
      Provider.LOCAL,
      registration(),
      '127.0.0.1',
      'agent'
    );

    expect(organizationService.createInvitedUser).not.toHaveBeenCalled();
    expect(organizationService.createOrgAndUser).toHaveBeenCalled();
  });

  test('counts one new person per invited account, not one per workspace', async () => {
    const token = await issueTeamInvitation(INVITATION);
    const { service, publicGrowthService } = wire();

    await service.routeAuth(
      Provider.LOCAL,
      registration({ invitationToken: token }),
      '127.0.0.1',
      'agent'
    );

    expect(publicGrowthService.recordTrusted).toHaveBeenCalledWith(
      'registration_completed',
      'registration_completed:user-1'
    );
  });

  test('the marker lives exactly as long as the invitation says', () => {
    expect(TEAM_INVITATION_TTL_SECONDS).toBe(2 * 24 * 60 * 60);
  });
});
