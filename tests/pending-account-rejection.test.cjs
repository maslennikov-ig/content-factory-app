const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const fs = require('node:fs');
const path = require('node:path');

const nest = {
  Injectable: () => (target) => target,
  Logger: class Logger {
    log() {}
    error() {}
  },
  HttpException: class HttpException extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  },
};

const repositoryModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts',
  {
    '@nestjs/common': nest,
    '@prisma/client': { Provider: {}, Role: {}, Prisma: { DbNull: 'DbNull' } },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
    '@contentfactory/helpers/auth/auth.service': { AuthService: {} },
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
    '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
      legacyIdentityIdentifier: () => '',
      normalizeIdentityIdentifier: () => '',
    },
  }
);

const { UsersRepository } = repositoryModule;

const serviceModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.service.ts',
  {
    '@nestjs/common': nest,
    '@prisma/client': { Provider: {} },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.repository':
      repositoryModule,
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository':
      { OrganizationRepository: class OrganizationRepository {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class NotificationService {} },
    '@contentfactory/nestjs-libraries/locale/backend-strings': {
      resolveBackendLocale: () => 'en',
      translateBackendString: () => '',
    },
    '@contentfactory/nestjs-libraries/integrations/telegram-admin-bind': {
      ADMIN_BIND_CLAIM_WINDOW_MS: 1,
      generateAdminBindCode: () => 'code',
    },
  }
);

const controllerModule = loadTypeScriptModule(
  'apps/backend/src/api/routes/admin.controller.ts',
  {
    '@nestjs/common': {
      ...nest,
      Body: () => () => undefined,
      Controller: () => (target) => target,
      Get: () => () => undefined,
      Inject: () => () => undefined,
      Param: () => () => undefined,
      Post: () => () => undefined,
      Query: () => () => undefined,
      Req: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => undefined,
    },
    '@prisma/client': {},
    '@nestjs/swagger': { ApiTags: () => (target) => target },
    '@contentfactory/nestjs-libraries/database/prisma/errors/errors.service': {
      ErrorsService: class ErrorsService {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/admin-stats/admin-stats.service':
      {
        AdminStatsService: class AdminStatsService {},
      },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.service':
      serviceModule,
    '@contentfactory/helpers/auth/registration.approval': {
      registrationRequiresApproval: () => false,
    },
    '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service':
      {
        ProductEventsService: class ProductEventsService {},
      },
    '@contentfactory/backend/api/routes/public-growth.token': {
      PUBLIC_GROWTH_SERVICE: 'public-growth-service',
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        verifyJWT: (token) =>
          token === 'root-session' ? { id: 'root' } : { id: 'other-user' },
      },
    },
  }
);

const { UsersService } = serviceModule;
const { AdminController } = controllerModule;

function rejectionRepository(
  user,
  memberships,
  organization = { id: 'owned-org' }
) {
  const mutations = [];
  const tx = {
    user: {
      findUnique: async () => user,
      deleteMany: async ({ where }) => {
        mutations.push(['user.deleteMany', where]);
        return { count: 1 };
      },
    },
    userOrganization: {
      findMany: async () => memberships,
      deleteMany: async ({ where }) =>
        mutations.push(['userOrganization.deleteMany', where]),
    },
    tags: {
      deleteMany: async ({ where }) =>
        mutations.push(['tags.deleteMany', where]),
    },
    organization: {
      findFirst: async () => organization,
      delete: async ({ where }) =>
        mutations.push(['organization.delete', where]),
    },
  };
  const transactionOptions = [];
  const transaction = {
    $transaction: async (callback, options) => {
      transactionOptions.push(options);
      return callback(tx);
    },
  };
  const repository = new UsersRepository({ model: {} }, { model: transaction });
  return { repository, mutations, transaction, transactionOptions, tx };
}

test('rejectPendingAccount atomically removes only an inactive non-admin account and its sole workspace', async () => {
  const { repository, mutations, transactionOptions } = rejectionRepository(
    {
      id: 'pending-user',
      activated: false,
      isSuperAdmin: false,
      organizations: [{ organizationId: 'owned-org' }],
    },
    [{ userId: 'pending-user', organizationId: 'owned-org' }]
  );

  await expect(
    repository.rejectPendingAccount('pending-user')
  ).resolves.toEqual({
    id: 'pending-user',
    organizationId: 'owned-org',
  });
  expect(mutations).toEqual([
    [
      'userOrganization.deleteMany',
      { userId: 'pending-user', organizationId: 'owned-org' },
    ],
    [
      'user.deleteMany',
      { id: 'pending-user', activated: false, isSuperAdmin: false },
    ],
    ['tags.deleteMany', { orgId: 'owned-org' }],
    ['organization.delete', { id: 'owned-org' }],
  ]);
  expect(transactionOptions).toEqual([{ isolationLevel: 'Serializable' }]);
});

test('rejectPendingAccount rolls back when the pending-account predicate changes before deletion', async () => {
  const { repository, mutations, tx } = rejectionRepository(
    {
      id: 'pending-user',
      activated: false,
      isSuperAdmin: false,
      organizations: [{ organizationId: 'owned-org' }],
    },
    [{ userId: 'pending-user', organizationId: 'owned-org' }]
  );
  tx.user.deleteMany = async ({ where }) => {
    mutations.push(['user.deleteMany', where]);
    return { count: 0 };
  };

  await expect(
    repository.rejectPendingAccount('pending-user')
  ).rejects.toMatchObject({ status: 409 });
  expect(mutations).toEqual([
    [
      'userOrganization.deleteMany',
      { userId: 'pending-user', organizationId: 'owned-org' },
    ],
    [
      'user.deleteMany',
      { id: 'pending-user', activated: false, isSuperAdmin: false },
    ],
  ]);
});

test('rejectPendingAccount retries a serializable P2034 conflict within a bounded budget', async () => {
  const attempt = rejectionRepository(
    {
      id: 'pending-user',
      activated: false,
      isSuperAdmin: false,
      organizations: [{ organizationId: 'owned-org' }],
    },
    [{ userId: 'pending-user', organizationId: 'owned-org' }]
  );
  let calls = 0;
  const options = [];
  attempt.transaction.$transaction = async (callback, transactionOptions) => {
    calls += 1;
    options.push(transactionOptions);
    if (calls === 1)
      throw Object.assign(new Error('write conflict'), { code: 'P2034' });
    return callback(attempt.tx);
  };

  await expect(
    attempt.repository.rejectPendingAccount('pending-user')
  ).resolves.toMatchObject({ id: 'pending-user' });
  expect(calls).toBe(2);
  expect(options).toEqual([
    { isolationLevel: 'Serializable' },
    { isolationLevel: 'Serializable' },
  ]);
});

test('rejectPendingAccount stops after three P2034 conflicts', async () => {
  const transaction = {
    $transaction: jest.fn(async (_callback, options) => {
      expect(options).toEqual({ isolationLevel: 'Serializable' });
      throw Object.assign(new Error('write conflict'), { code: 'P2034' });
    }),
  };
  const repository = new UsersRepository({ model: {} }, { model: transaction });

  await expect(
    repository.rejectPendingAccount('pending-user')
  ).rejects.toMatchObject({ status: 503 });
  expect(transaction.$transaction).toHaveBeenCalledTimes(3);
});

test.each([
  [
    'active account',
    { id: 'active', activated: true, isSuperAdmin: false, organizations: [] },
    [],
  ],
  [
    'superadmin account',
    { id: 'admin', activated: false, isSuperAdmin: true, organizations: [] },
    [],
  ],
  [
    'shared workspace',
    {
      id: 'pending-user',
      activated: false,
      isSuperAdmin: false,
      organizations: [{ organizationId: 'shared-org' }],
    },
    [
      { userId: 'pending-user', organizationId: 'shared-org' },
      { userId: 'another-user', organizationId: 'shared-org' },
    ],
  ],
])(
  'rejectPendingAccount fails closed for %s',
  async (_label, user, memberships) => {
    const { repository, mutations } = rejectionRepository(user, memberships);

    await expect(
      repository.rejectPendingAccount('pending-user')
    ).rejects.toMatchObject({ status: 400 });
    expect(mutations).toEqual([]);
  }
);

test('rejectPendingAccount reports a missing account as not found', async () => {
  const { repository } = rejectionRepository(null, []);
  await expect(
    repository.rejectPendingAccount('missing-user')
  ).rejects.toMatchObject({ status: 404 });
});

test('rejectPendingAccount refuses a workspace with cascade-backed content before any mutation', async () => {
  const { repository, mutations } = rejectionRepository(
    {
      id: 'pending-user',
      activated: false,
      isSuperAdmin: false,
      organizations: [{ organizationId: 'owned-org' }],
    },
    [{ userId: 'pending-user', organizationId: 'owned-org' }],
    null
  );

  await expect(
    repository.rejectPendingAccount('pending-user')
  ).rejects.toMatchObject({ status: 400 });
  expect(mutations).toEqual([]);
});

/**
 * `content-factory-next-fn33.22`. The proof of an unused workspace used to
 * include its tags: the four starter labels, translated into the account's
 * language at the moment of rejection, compared name by name. Both shapes below
 * are real and both were unrejectable — a workspace whose tags are gone, and one
 * seeded in a language the account no longer reads in. A tag says nothing about
 * use: a pending account has never been able to sign in and change one.
 */
test.each([
  ['no tags at all', []],
  [
    'tags in another language than the account reads in',
    [
      { name: 'План', color: '#7FB03A', deletedAt: null },
      { name: 'Черновик', color: '#4D7CFE', deletedAt: null },
      { name: 'Проверка', color: '#F59E0B', deletedAt: null },
      { name: 'Расписание', color: '#8B5CF6', deletedAt: null },
    ],
  ],
  [
    'a renamed and a soft-deleted tag',
    [
      { name: 'Changed', color: '#7FB03A', deletedAt: null },
      {
        name: 'Draft',
        color: '#4D7CFE',
        deletedAt: new Date('2026-09-03T00:00:00.000Z'),
      },
    ],
  ],
])('rejectPendingAccount removes a workspace with %s', async (_label, tags) => {
  const { repository, mutations } = rejectionRepository(
    {
      id: 'pending-user',
      language: 'en',
      activated: false,
      isSuperAdmin: false,
      organizations: [{ organizationId: 'owned-org' }],
    },
    [{ userId: 'pending-user', organizationId: 'owned-org' }],
    { id: 'owned-org', tags }
  );

  await expect(
    repository.rejectPendingAccount('pending-user')
  ).resolves.toEqual({ id: 'pending-user', organizationId: 'owned-org' });
  expect(mutations).toContainEqual(['tags.deleteMany', { orgId: 'owned-org' }]);
  expect(mutations).toContainEqual([
    'organization.delete',
    { id: 'owned-org' },
  ]);
});

test('the superadmin-only controller door rejects a pending account', async () => {
  const previousFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://factory.example/app';
  const calls = [];
  const controller = new AdminController(
    {},
    {},
    { rejectPendingAccount: async (id, adminId) => calls.push([id, adminId]) },
    {},
    {}
  );

  try {
    await expect(
      controller.rejectPendingUser(
        { id: 'root', isSuperAdmin: true },
        'pending-user',
        {
          headers: {
            'content-type': 'application/json',
            origin: 'https://factory.example',
          },
          cookies: { auth: 'root-session' },
        }
      )
    ).resolves.toEqual({ success: true });
    expect(calls).toEqual([['pending-user', 'root']]);
  } finally {
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
  }
});

test.each([
  ['missing Origin', { 'content-type': 'application/json' }, 'root-session'],
  [
    'foreign Origin',
    { 'content-type': 'application/json', origin: 'https://attacker.example' },
    'root-session',
  ],
  [
    'non-JSON body',
    { 'content-type': 'text/plain', origin: 'https://factory.example' },
    'root-session',
  ],
  [
    'different session identity',
    { 'content-type': 'application/json', origin: 'https://factory.example' },
    'other-session',
  ],
])(
  'the HTTP rejection door fails closed for %s',
  async (_label, headers, session) => {
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://factory.example/app';
    let calls = 0;
    const controller = new AdminController(
      {},
      {},
      { rejectPendingAccount: async () => calls++ },
      {},
      {}
    );

    try {
      await expect(
        controller.rejectPendingUser(
          { id: 'root', isSuperAdmin: true },
          'pending-user',
          { headers, cookies: { auth: session } }
        )
      ).rejects.toMatchObject({ status: 403 });
      expect(calls).toBe(0);
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  }
);

test('the rejection controller door does not call the service for non-superadmins', async () => {
  let calls = 0;
  const controller = new AdminController(
    {},
    {},
    { rejectPendingAccount: async () => calls++ },
    {},
    {}
  );

  await expect(
    controller.rejectPendingUser(
      { id: 'member', isSuperAdmin: false },
      'pending-user'
    )
  ).rejects.toMatchObject({ status: 400 });
  expect(calls).toBe(0);
});

test('pending rows use the shared confirmation primitive before posting rejection', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../apps/frontend/src/components/admin/admin-users.component.tsx'
    ),
    'utf8'
  );

  expect(source).toContain(
    "import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';"
  );
  expect(source).toContain("onAction(row, 'reject')");
  expect(source).toContain('deleteDialog(');
  expect(source).toContain('/admin/users/${row.id}/${action}');
});

test('the empty-workspace gate covers every non-seed Organization relation in the current Prisma schema', () => {
  const schema = fs.readFileSync(
    path.join(
      __dirname,
      '../libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    ),
    'utf8'
  );
  const repository = fs.readFileSync(
    path.join(
      __dirname,
      '../libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts'
    ),
    'utf8'
  );
  const organization =
    schema.match(/model Organization \{([\s\S]*?)\n\}/)?.[1] || '';
  const relations = [
    ...organization.matchAll(
      /^\s*(\w+)\s+(\w+)(?:\[\]|\?)(?:\s+@relation[^\n]*)?$/gm
    ),
  ]
    .filter(([, , type]) => !['String', 'DateTime', 'Boolean'].includes(type))
    .map((match) => match[1]);
  const seedOrSeparatelyChecked = new Set([
    'tags',
    'aiProvider',
    'users',
    'productEvents',
    'subscription',
  ]);

  for (const relation of relations) {
    if (seedOrSeparatelyChecked.has(relation)) continue;
    expect(repository).toContain(`${relation}: { none: {} }`);
  }
  expect(repository).toContain('productEvents: {');
  expect(repository).toContain('aiProvider: {');
  expect(repository).toContain('subscription: { is: null }');
});
