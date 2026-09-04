'use strict';

/**
 * `content-factory-next-fn33.36`: a second workspace, made from inside the
 * product, and `content-factory-next-fn33.34`: which workspace a person lands
 * in when the browser carries no `showorg` cookie.
 *
 * Both live in the repository, so the repository is the thing loaded here with
 * Prisma reduced to a recorder. What the door has to get right is not that it
 * calls something — it is the shape of the row it writes: the creator's rank,
 * the workflow tags, and the fact that the account itself is left alone.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const Role = { ADMIN: 'ADMIN', USER: 'USER', SUPERADMIN: 'SUPERADMIN' };

const { OrganizationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        error() {}
        warn() {}
        log() {}
      },
    },
    '@prisma/client': {
      Role,
      ShortLinkPreference: {},
      SubscriptionTier: {},
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        fixedEncryption: (value) => `encrypted:${value}`,
        hashPassword: (value) => `hashed:${value}`,
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
      PrismaTransaction: class {},
    },
  }
);

/** Prisma, as far as creating a workspace is concerned. */
const recorder = () => {
  const created = [];
  const events = [];
  const organization = {
    model: {
      organization: {
        create: async ({ data, select }) => {
          created.push(data);
          return select?.name ? { id: data.id, name: data.name } : { id: data.id };
        },
      },
      productEvent: {
        create: async ({ data }) => {
          events.push(data);
          return data;
        },
      },
    },
  };
  const repository = new OrganizationRepository(
    organization,
    { model: {} },
    { model: {} },
    {}
  );
  return { repository, created, events };
};

describe('POST /user/organizations, in the repository', () => {
  test('the creator of a new workspace is its ADMIN and the account is untouched', async () => {
    const { repository, created } = recorder();

    const result = await repository.createOrgForUser(
      'person',
      'Second workspace',
      'ru'
    );

    expect(created).toHaveLength(1);
    const [data] = created;
    expect(data.name).toBe('Second workspace');
    expect(data.users.create.role).toBe(Role.ADMIN);
    // Connected, never created: `activated`, `isSuperAdmin` and the identity
    // of the account stay as the approval flow left them. A new workspace is
    // not a second way to become an approved account.
    expect(data.users.create.user).toEqual({ connect: { id: 'person' } });
    expect(data.users.create.user.create).toBeUndefined();
    expect(result).toEqual({ id: data.id, name: 'Second workspace' });
  });

  test('a new workspace is seeded with the content-workflow tags', async () => {
    const { repository, created } = recorder();

    await repository.createOrgForUser('person', 'Second workspace', 'en');

    const names = created[0].tags.create.map((tag) => tag.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    for (const tag of created[0].tags.create) {
      expect(typeof tag.color).toBe('string');
      expect(tag.name.trim()).not.toBe('');
    }
    expect(created[0].apiKey).toEqual(expect.stringContaining('encrypted:'));
  });

  test('the second call makes a second workspace, not the same one again', async () => {
    const { repository, created } = recorder();

    const first = await repository.createOrgForUser('person', 'First', 'en');
    const second = await repository.createOrgForUser('person', 'Second', 'en');

    expect(created).toHaveLength(2);
    expect(first.id).not.toBe(second.id);
    expect(created.map((data) => data.name)).toEqual(['First', 'Second']);
  });

  test('an empty name falls back the way registration does', async () => {
    const { repository, created } = recorder();

    await repository.createOrgForUser('person', '   ', 'en');

    expect(created[0].name).toBe('Workspace');
  });
});

describe('which workspace opens without a showorg cookie', () => {
  test('getOrgsByUserId asks the database for a deterministic order', async () => {
    let query;
    const repository = new OrganizationRepository(
      {
        model: {
          organization: {
            findMany: async (argument) => {
              query = argument;
              return [];
            },
          },
        },
      },
      { model: {} },
      { model: {} },
      {}
    );

    await repository.getOrgsByUserId('person');

    // Oldest first, id to break the tie: `auth.middleware` opens the first of
    // these for anybody arriving without a cookie, and an unordered query left
    // that to the query plan.
    expect(query.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });
});
