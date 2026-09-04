'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { OrganizationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
    '@prisma/client': {
      Role: { SUPERADMIN: 'SUPERADMIN', ADMIN: 'ADMIN', EDITOR: 'EDITOR', USER: 'USER' },
      ShortLinkPreference: {},
      SubscriptionTier: { STANDARD: 'STANDARD' },
    },
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class Logger {},
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { fixedEncryption: () => '', hashPassword: () => '' },
    },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CONTENT_WORKFLOW_TAGS: [],
      CreateOrgUserDto: class CreateOrgUserDto {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/starter-template': {
      CONTENT_WORKFLOW_TAG_KEYS: [],
    },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
    '@contentfactory/nestjs-libraries/user/organization.roles': {
      organizationRoleLevel: () => 0,
    },
    '@contentfactory/helpers/auth/registration.approval': {},
    '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
      normalizeIdentityIdentifier: (_provider, value) => value,
    },
    '@contentfactory/helpers/auth/newsletter.consent': {
      NEWSLETTER_CONSENT_SOURCE_REGISTRATION: 'registration',
    },
    '@contentfactory/nestjs-libraries/locale/backend-strings': {
      resolveBackendLocale: () => 'en',
      translateBackendString: (key) => key,
    },
  }
);

function repositoryWithTransaction({
  failInviteUpdate = false,
  alreadyMember = false,
} = {}) {
  const committed = [];
  const outsideTransaction = new Proxy(
    {},
    {
      get() {
        throw new Error('membership mutation escaped the Prisma transaction');
      },
    }
  );
  const transaction = {
    $transaction: jest.fn(async (callback) => {
      const pending = [];
      const tx = {
        user: {
          findFirst: async () => null,
          update: async ({ where, data }) => {
            if (failInviteUpdate)
              throw new Error('invite marker update failed');
            pending.push(['user.update', where, data]);
          },
        },
        organization: {
          findFirst: async () => ({
            subscription: { subscriptionTier: 'ULTIMATE' },
          }),
        },
        userOrganization: {
          findFirst: async () => (alreadyMember ? { id: 'membership-0' } : null),
          create: async ({ data }) => {
            if (alreadyMember)
              throw new Error(
                'Unique constraint failed on the fields: (`userId`,`organizationId`)'
              );
            pending.push(['userOrganization.create', data]);
            return { id: 'membership-1', ...data };
          },
        },
      };
      const result = await callback(tx);
      committed.push(...pending);
      return result;
    }),
  };
  const repository = new OrganizationRepository(
    { model: outsideTransaction },
    { model: outsideTransaction },
    { model: outsideTransaction },
    { model: transaction }
  );
  return { repository, transaction, committed };
}

test('invitation membership and invite marker commit in one Prisma transaction', async () => {
  const { repository, transaction, committed } = repositoryWithTransaction();

  await expect(
    repository.addUserToOrg('user-1', 'invite-1', 'org-1', 'ADMIN')
  ).resolves.toMatchObject({
    id: 'membership-1',
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'ADMIN',
  });

  expect(transaction.$transaction).toHaveBeenCalledTimes(1);
  expect(committed).toEqual([
    [
      'userOrganization.create',
      { role: 'ADMIN', userId: 'user-1', organizationId: 'org-1' },
    ],
    ['user.update', { id: 'user-1' }, { inviteId: 'invite-1' }],
  ]);
});

test('a failed invite marker update rolls back the membership creation', async () => {
  const { repository, committed } = repositoryWithTransaction({
    failInviteUpdate: true,
  });

  await expect(
    repository.addUserToOrg('user-1', 'invite-1', 'org-1', 'ADMIN')
  ).rejects.toThrow('invite marker update failed');
  expect(committed).toEqual([]);
});

/**
 * `content-factory-next-fn33.6`. The unique index on
 * `(userId, organizationId)` turned a second membership into a raw Prisma
 * error, which reached the person as a 500. The repository asks first, so the
 * caller gets the same refusal it already understands.
 */
test('adding an account that is already in the organization refuses instead of colliding', async () => {
  const { repository, committed } = repositoryWithTransaction({
    alreadyMember: true,
  });

  await expect(
    repository.addUserToOrg('user-1', 'invite-1', 'org-1', 'ADMIN')
  ).resolves.toBe(false);
  expect(committed).toEqual([]);
});
