/**
 * The order the team list comes back in.
 *
 * `content-factory-next-fn33.51`. The query asked for the memberships and said
 * nothing about their order, so Postgres returned them however the last write
 * had left them: changing somebody's role moved that person's row the instant
 * the screen re-read the list. On the live walkthrough of 04.09.2026 the row
 * being worked on slid down, another person took its place, and the next role
 * change landed on them — a screen where the second click is a different
 * person than the first is a trap, not a list.
 *
 * Joining time is the one thing about a membership that a role change does not
 * touch, and `id` settles rows written in the same instant.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { OrganizationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class Logger {
        log() {}
        error() {}
      },
    },
    '@prisma/client': {
      Role: { USER: 'USER', EDITOR: 'EDITOR', ADMIN: 'ADMIN', SUPERADMIN: 'SUPERADMIN' },
      ShortLinkPreference: {},
      SubscriptionTier: {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { fixedEncryption: () => 'key' },
    },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CONTENT_WORKFLOW_TAGS: [],
      CreateOrgUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/starter-template': {
      CONTENT_WORKFLOW_TAG_KEYS: [],
    },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
    '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
      normalizeIdentityIdentifier: () => '',
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

test('the team list is ordered by when people joined, not by how they were last written', async () => {
  const queries = [];
  const organization = {
    model: {
      organization: {
        findUnique: async (query) => {
          queries.push(query);
          return { users: [] };
        },
      },
    },
  };

  const repository = new OrganizationRepository(organization, {}, {}, {});
  await repository.getTeam('org-1');

  expect(queries).toHaveLength(1);
  expect(queries[0].select.users.orderBy).toEqual([
    { createdAt: 'asc' },
    { id: 'asc' },
  ]);
});
