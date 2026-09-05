const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const fs = require('node:fs');
const path = require('node:path');

/**
 * `content-factory-next-fn33.23`. Until now an instance administrator could
 * decline an account that had never signed in, or switch one off forever, and
 * that was all: a blocked account stayed in the database with nothing that
 * could remove it.
 *
 * Deletion has to be exact about the workspaces. The person leaves all of them;
 * a workspace where they were the only member goes with them; a workspace with
 * other members stays standing. And it has to refuse where Postgres would
 * refuse for it — `UserOrganization` has no cascade, and almost no Organization
 * relation has one either — so a workspace that still holds content, or a
 * person who still owns rows, is answered with a sentence and a code instead of
 * a foreign-key error.
 */
const nest = {
  Injectable: () => (target) => target,
  Logger: class Logger {
    log() {}
    error() {}
  },
  HttpException: class HttpException extends Error {
    constructor(message, status) {
      super(typeof message === 'string' ? message : message.message);
      this.status = status;
      this.code = typeof message === 'string' ? undefined : message.code;
      // The last-administrator refusal names the workspace, and the screen
      // reads that name out of the body.
      this.body = message;
    }
  },
};

const repositoryModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts',
  {
    '@nestjs/common': nest,
    '@prisma/client': {
      Provider: {},
      Role: {
        USER: 'USER',
        EDITOR: 'EDITOR',
        ADMIN: 'ADMIN',
        SUPERADMIN: 'SUPERADMIN',
      },
    },
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
      { AdminStatsService: class AdminStatsService {} },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.service':
      serviceModule,
    '@contentfactory/helpers/auth/registration.approval': {
      registrationRequiresApproval: () => false,
    },
    '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service':
      { ProductEventsService: class ProductEventsService {} },
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

const { UsersRepository } = repositoryModule;
const { UsersService } = serviceModule;
const { AdminController } = controllerModule;

/**
 * `members` is the whole membership table, so a workspace is shared or sole
 * because of what is in it, not because a stub was told which. `emptyOrgs` is
 * the set the emptiness query would return a row for; anything outside it is a
 * workspace that still holds content.
 */
function deletionRepository({
  user,
  members,
  emptyOrgs = [],
  userHasOwnRows = false,
  marketplaceOrgs = [],
  counts = {},
}) {
  const mutations = [];
  const countFor = (model, organizationId) =>
    counts[organizationId]?.[model] ??
    (model === 'userOrganization'
      ? members.filter((row) => row.organizationId === organizationId).length
      : 0);
  const counter = (model) => ({
    count: async ({ where }) => countFor(model, where.organizationId),
  });
  const tx = {
    post: counter('post'),
    integration: counter('integration'),
    contentPiece: counter('contentPiece'),
    user: {
      findUnique: async () => user,
      findFirst: async ({ where }) =>
        userHasOwnRows ? null : { id: where.id },
      deleteMany: async ({ where }) => {
        mutations.push(['user.deleteMany', where]);
        return { count: 1 };
      },
    },
    userOrganization: {
      findMany: async ({ where }) =>
        members.filter((row) => row.organizationId === where.organizationId),
      findFirst: async ({ where }) =>
        members.find(
          (row) =>
            row.organizationId === where.organizationId &&
            where.role.in.includes(row.role) &&
            row.userId !== where.userId.not
        ) || null,
      deleteMany: async ({ where }) =>
        mutations.push(['userOrganization.deleteMany', where]),
      count: async ({ where }) =>
        countFor('userOrganization', where.organizationId),
    },
    tags: {
      deleteMany: async ({ where }) =>
        mutations.push(['tags.deleteMany', where]),
    },
    organization: {
      // Two different questions reach the same door. The marketplace query is
      // the one built out of `OR`; the emptiness query lists the relations.
      findFirst: async ({ where }) => {
        if (where.OR) {
          return marketplaceOrgs.includes(where.id) ? { id: where.id } : null;
        }
        return emptyOrgs.includes(where.id) ? { id: where.id } : null;
      },
      delete: async ({ where }) =>
        mutations.push(['organization.delete', where]),
    },
  };
  const transactionOptions = [];
  const repository = new UsersRepository(
    { model: {} },
    {
      model: {
        $transaction: async (callback, options) => {
          transactionOptions.push(options);
          return callback(tx);
        },
      },
    }
  );
  return { repository, mutations, transactionOptions };
}

/** One membership row as `deleteAccount` selects it. */
const membership = (organizationId, role = 'ADMIN') => ({
  organizationId,
  role,
  organization: { name: `Workspace ${organizationId}` },
});

const member = {
  id: 'member-1',
  isSuperAdmin: false,
  organizations: [membership('own-org')],
};

test('deleting an account removes its sole empty workspace with it', async () => {
  const { repository, mutations, transactionOptions } = deletionRepository({
    user: member,
    members: [{ userId: 'member-1', organizationId: 'own-org' }],
    emptyOrgs: ['own-org'],
  });

  await expect(repository.deleteAccount('member-1')).resolves.toEqual({
    id: 'member-1',
    organizationIds: ['own-org'],
  });
  // No `tags.deleteMany` any more: since `content-factory-next-fn33.32` the
  // schema carries the delete rule, so the workspace takes its rows with it
  // and no hand-written list can fall behind.
  expect(mutations).toEqual([
    ['userOrganization.deleteMany', { userId: 'member-1' }],
    ['user.deleteMany', { id: 'member-1', isSuperAdmin: false }],
    ['organization.delete', { id: 'own-org' }],
  ]);
  expect(transactionOptions).toEqual([{ isolationLevel: 'Serializable' }]);
});

test('a workspace with other members stays, the person only leaves it', async () => {
  const { repository, mutations } = deletionRepository({
    user: {
      ...member,
      organizations: [membership('own-org'), membership('shared-org')],
    },
    members: [
      { userId: 'member-1', organizationId: 'own-org', role: 'ADMIN' },
      { userId: 'member-1', organizationId: 'shared-org', role: 'ADMIN' },
      { userId: 'someone-else', organizationId: 'shared-org', role: 'ADMIN' },
    ],
    emptyOrgs: ['own-org'],
  });

  await expect(repository.deleteAccount('member-1')).resolves.toEqual({
    id: 'member-1',
    organizationIds: ['own-org'],
  });
  expect(mutations).toContainEqual(['organization.delete', { id: 'own-org' }]);
  expect(mutations).not.toContainEqual([
    'organization.delete',
    { id: 'shared-org' },
  ]);
});

/**
 * `content-factory-next-fn33.108`. `deleteTeamMember` has counted
 * administrators since `content-factory-next-fn33.19`; this door reached the
 * same memberships from the other side and dropped them all without counting,
 * so an instance administrator could leave a shared workspace with nobody able
 * to invite into it, connect a channel to it or hand it over. Before the wave
 * of 04.09.2026 the `SUPERADMIN` role hid this: it was unique per workspace,
 * and an account holding it was refused for a different reason.
 */
test('the last administrator of a shared workspace is refused, and it is named', async () => {
  const { repository, mutations } = deletionRepository({
    user: {
      ...member,
      organizations: [membership('own-org'), membership('shared-org')],
    },
    members: [
      { userId: 'member-1', organizationId: 'own-org', role: 'ADMIN' },
      { userId: 'member-1', organizationId: 'shared-org', role: 'ADMIN' },
      { userId: 'someone-else', organizationId: 'shared-org', role: 'USER' },
    ],
    emptyOrgs: ['own-org'],
  });

  const refusal = await repository.deleteAccount('member-1').catch((e) => e);

  expect(refusal.status).toBe(409);
  expect(refusal.code).toBe('account_delete_last_admin');
  // Without the name a person is sent to look through several workspaces for
  // the one the server meant.
  expect(refusal.body.workspace).toBe('Workspace shared-org');
  expect(mutations).toEqual([]);
});

test('a workspace keeping another administrator is no obstacle', async () => {
  const { repository, mutations } = deletionRepository({
    user: {
      ...member,
      organizations: [membership('own-org'), membership('shared-org')],
    },
    members: [
      { userId: 'member-1', organizationId: 'own-org', role: 'ADMIN' },
      { userId: 'member-1', organizationId: 'shared-org', role: 'ADMIN' },
      // The older role still counts as an administrator.
      { userId: 'someone-else', organizationId: 'shared-org', role: 'SUPERADMIN' },
    ],
    emptyOrgs: ['own-org'],
  });

  await expect(repository.deleteAccount('member-1')).resolves.toEqual({
    id: 'member-1',
    organizationIds: ['own-org'],
  });
  expect(mutations).toContainEqual([
    'userOrganization.deleteMany',
    { userId: 'member-1' },
  ]);
});

test('a workspace this person does not administer is not their obstacle', async () => {
  const { repository } = deletionRepository({
    user: {
      ...member,
      organizations: [
        membership('own-org'),
        membership('shared-org', 'EDITOR'),
      ],
    },
    members: [
      { userId: 'member-1', organizationId: 'own-org', role: 'ADMIN' },
      { userId: 'member-1', organizationId: 'shared-org', role: 'EDITOR' },
      { userId: 'someone-else', organizationId: 'shared-org', role: 'USER' },
    ],
    emptyOrgs: ['own-org'],
  });

  await expect(repository.deleteAccount('member-1')).resolves.toEqual({
    id: 'member-1',
    organizationIds: ['own-org'],
  });
});

/**
 * A workspace the account is the only member of is deleted along with it, so
 * it needs no administrator afterwards — counting there would refuse every
 * ordinary deletion.
 */
test('a sole workspace is not asked to keep an administrator', async () => {
  const { repository } = deletionRepository({
    user: member,
    members: [{ userId: 'member-1', organizationId: 'own-org', role: 'ADMIN' }],
    emptyOrgs: ['own-org'],
  });

  await expect(repository.deleteAccount('member-1')).resolves.toEqual({
    id: 'member-1',
    organizationIds: ['own-org'],
  });
});

/**
 * `content-factory-next-fn33.32`. A sole workspace that still holds content
 * used to be a dead end: the answer was «remove that content first» and there
 * was no way to say «take it too». Now the first press is answered with what
 * would go, and nothing is touched until the second one.
 */
test('a sole workspace that still holds content asks a second time, with counts', async () => {
  const { repository, mutations } = deletionRepository({
    user: member,
    members: [{ userId: 'member-1', organizationId: 'own-org' }],
    emptyOrgs: [],
    counts: {
      'own-org': { post: 12, integration: 3, contentPiece: 5 },
    },
  });

  const refusal = await repository.deleteAccount('member-1').catch((e) => e);

  expect(refusal.status).toBe(409);
  expect(refusal.code).toBe('account_delete_workspace_confirm');
  expect(refusal.body.workspaces).toEqual([
    {
      name: 'Workspace own-org',
      posts: 12,
      channels: 3,
      materials: 5,
      members: 1,
    },
  ]);
  expect(mutations).toEqual([]);
});

test('the second press deletes the workspace with everything in it', async () => {
  const { repository, mutations } = deletionRepository({
    user: member,
    members: [{ userId: 'member-1', organizationId: 'own-org' }],
    emptyOrgs: [],
    counts: { 'own-org': { post: 12, integration: 3, contentPiece: 5 } },
  });

  await expect(repository.deleteAccount('member-1', true)).resolves.toEqual({
    id: 'member-1',
    organizationIds: ['own-org'],
  });
  // The workspace goes; its rows go with it because the schema says so, which
  // is why nothing here deletes them one table at a time.
  expect(mutations).toEqual([
    ['userOrganization.deleteMany', { userId: 'member-1' }],
    ['user.deleteMany', { id: 'member-1', isSuperAdmin: false }],
    ['organization.delete', { id: 'own-org' }],
  ]);
});

test('a workspace with other members is left standing even on the second press', async () => {
  const { repository, mutations } = deletionRepository({
    user: {
      ...member,
      organizations: [membership('own-org'), membership('shared-org')],
    },
    members: [
      { userId: 'member-1', organizationId: 'own-org', role: 'ADMIN' },
      { userId: 'member-1', organizationId: 'shared-org', role: 'ADMIN' },
      { userId: 'someone-else', organizationId: 'shared-org', role: 'ADMIN' },
    ],
    emptyOrgs: [],
    counts: { 'own-org': { post: 1 } },
  });

  await expect(repository.deleteAccount('member-1', true)).resolves.toEqual({
    id: 'member-1',
    organizationIds: ['own-org'],
  });
  expect(mutations).toContainEqual(['organization.delete', { id: 'own-org' }]);
  expect(mutations).not.toContainEqual([
    'organization.delete',
    { id: 'shared-org' },
  ]);
});

/**
 * The one thing the cascade deliberately does not carry away. A marketplace
 * conversation or order names a second party and a payment, so those two
 * foreign keys were left without `ON DELETE CASCADE` and this door refuses in
 * front of them — with the old code, because the answer is still «no».
 */
test('a workspace holding marketplace rows is refused, second press or not', async () => {
  for (const deleteWorkspaces of [false, true]) {
    const { repository, mutations } = deletionRepository({
      user: member,
      members: [{ userId: 'member-1', organizationId: 'own-org' }],
      emptyOrgs: [],
      marketplaceOrgs: ['own-org'],
    });

    await expect(
      repository.deleteAccount('member-1', deleteWorkspaces)
    ).rejects.toMatchObject({
      status: 409,
      code: 'account_delete_workspace_has_content',
    });
    expect(mutations).toEqual([]);
  }
});

test('a person who still owns rows of their own is refused before any mutation', async () => {
  const { repository, mutations } = deletionRepository({
    user: member,
    members: [{ userId: 'member-1', organizationId: 'own-org' }],
    emptyOrgs: ['own-org'],
    userHasOwnRows: true,
  });

  await expect(repository.deleteAccount('member-1')).rejects.toMatchObject({
    status: 409,
    code: 'account_delete_user_has_content',
  });
  expect(mutations).toEqual([]);
});

test('the repository refuses an instance administrator outright', async () => {
  const { repository, mutations } = deletionRepository({
    user: { ...member, isSuperAdmin: true },
    members: [{ userId: 'member-1', organizationId: 'own-org' }],
    emptyOrgs: ['own-org'],
  });

  await expect(repository.deleteAccount('member-1')).rejects.toMatchObject({
    status: 400,
  });
  expect(mutations).toEqual([]);
});

test('a missing account is a 404', async () => {
  const { repository } = deletionRepository({ user: null, members: [] });
  await expect(repository.deleteAccount('nobody')).rejects.toMatchObject({
    status: 404,
  });
});

const service = (repository, logged = []) => {
  const users = new UsersService(
    repository,
    {},
    {
      sendEmail: async () => {
        throw new Error('deletion sends no email');
      },
    }
  );
  users._logger = { log: (line) => logged.push(line), error: () => undefined };
  return users;
};

test('the service names the administrator in the log and sends no email', async () => {
  const logged = [];
  const calls = [];
  const users = service(
    {
      getUserById: async () => ({ id: 'member-1', isSuperAdmin: false }),
      deleteAccount: async (id, deleteWorkspaces) => {
        calls.push([id, deleteWorkspaces]);
        return { id, organizationIds: [] };
      },
    },
    logged
  );

  await expect(users.deleteAccount('member-1', 'root')).resolves.toEqual({
    id: 'member-1',
    organizationIds: [],
  });
  expect(calls).toEqual([['member-1', false]]);
  expect(logged).toContain('Account member-1 deleted by root');
});

/**
 * Two presses are two different amounts of data gone, and afterwards nothing
 * else records which one happened — the account and its rows are not there to
 * be asked (`content-factory-next-fn33.32`).
 */
test('the service carries the second confirmation through and says so in the log', async () => {
  const logged = [];
  const calls = [];
  const users = service(
    {
      getUserById: async () => ({ id: 'member-1', isSuperAdmin: false }),
      deleteAccount: async (id, deleteWorkspaces) => {
        calls.push([id, deleteWorkspaces]);
        return { id, organizationIds: ['own-org'] };
      },
    },
    logged
  );

  await expect(
    users.deleteAccount('member-1', 'root', true)
  ).resolves.toEqual({ id: 'member-1', organizationIds: ['own-org'] });
  expect(calls).toEqual([['member-1', true]]);
  expect(logged).toContain(
    'Account member-1 deleted with its workspaces by root'
  );
});

test.each([
  [
    'their own account',
    'root',
    { id: 'root', isSuperAdmin: false },
    'root',
  ],
  [
    'the other instance administrator',
    'member-1',
    { id: 'member-1', isSuperAdmin: true },
    'root',
  ],
])(
  'the service refuses to delete %s without reaching the repository',
  async (_label, id, user, adminId) => {
    let calls = 0;
    const users = service({
      getUserById: async () => user,
      deleteAccount: async () => calls++,
    });

    await expect(users.deleteAccount(id, adminId)).rejects.toMatchObject({
      status: 400,
    });
    expect(calls).toBe(0);
  }
);

test('the delete door is superadmin-only and proves its own origin', async () => {
  const previousFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://factory.example/app';
  const calls = [];
  const controller = new AdminController(
    {},
    {},
    {
      deleteAccount: async (id, adminId, deleteWorkspaces) =>
        calls.push([id, adminId, deleteWorkspaces]),
    },
    {},
    {}
  );
  const request = {
    headers: {
      'content-type': 'application/json',
      origin: 'https://factory.example',
    },
    cookies: { auth: 'root-session' },
  };

  try {
    await expect(
      controller.deleteUser({ id: 'root', isSuperAdmin: true }, 'member-1', request)
    ).resolves.toEqual({ success: true });
    expect(calls).toEqual([['member-1', 'root', false]]);

    await expect(
      controller.deleteUser({ id: 'member', isSuperAdmin: false }, 'member-1', request)
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      controller.deleteUser({ id: 'root', isSuperAdmin: true }, 'member-1', {
        headers: {
          'content-type': 'application/json',
          origin: 'https://attacker.example',
        },
        cookies: { auth: 'root-session' },
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(calls).toEqual([['member-1', 'root', false]]);

    // The second press. The flag is a body field, so a URL alone can never
    // carry it (`content-factory-next-fn33.32`).
    await expect(
      controller.deleteUser(
        { id: 'root', isSuperAdmin: true },
        'member-1',
        request,
        { deleteWorkspaces: true }
      )
    ).resolves.toEqual({ success: true });
    expect(calls).toContainEqual(['member-1', 'root', true]);

    // Anything but `true` is the ordinary deletion, not a confirmation.
    await expect(
      controller.deleteUser(
        { id: 'root', isSuperAdmin: true },
        'member-1',
        request,
        { deleteWorkspaces: 'yes' }
      )
    ).resolves.toEqual({ success: true });
    expect(calls.at(-1)).toEqual(['member-1', 'root', false]);
  } finally {
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
  }
});

test('the accounts screen offers deletion to every non-administrator, behind a confirmation', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../apps/frontend/src/components/admin/admin-users.component.tsx'
    ),
    'utf8'
  );

  expect(source).toContain("onAction(row, 'delete')");
  expect(source).toContain("'delete_account_confirmation',");
  expect(source).toContain('variant="destructive"');
  // Offered for a blocked account too, which is the case that had no way out.
  expect(source).toMatch(/\{!row\.isSuperAdmin && \(/);
  // The two refusals the server can answer with are said in words, not JSON.
  expect(source).toContain('account_delete_workspace_has_content');
  expect(source).toContain('account_delete_user_has_content');
});

/**
 * `content-factory-next-fn33.32`. The second confirmation is a whole second
 * screen state: the counts the server sent, said in words, and a button that
 * names what it does. Reading it out of the source keeps the two halves — the
 * code the server sends and the code the screen answers — in one test.
 */
test('the accounts screen asks a second time before a workspace goes with its content', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../apps/frontend/src/components/admin/admin-users.component.tsx'
    ),
    'utf8'
  );

  expect(source).toContain('account_delete_workspace_confirm');
  expect(source).toContain("'delete_account_with_workspace_confirmation',");
  expect(source).toContain("'delete_account_with_workspace_confirm'");
  // The four counts are read out, not summed into one meaningless number.
  expect(source).toContain("'delete_account_workspace_summary',");
  for (const count of ['posts', 'channels', 'materials', 'members']) {
    expect(source).toContain(`${count}: workspace.${count}`);
  }
  // The flag travels in the body. A query string ends up in history and logs.
  expect(source).toContain('body: JSON.stringify(');
  expect(source).not.toMatch(/deleteWorkspaces=true/);
});

/**
 * The schema is what makes the second press possible, so it is checked here
 * rather than trusted. Two foreign keys are deliberately left without a
 * cascade; if either gains one, this fails and somebody has to say why the
 * marketplace may be deleted with a workspace.
 */
test('the Organization relations carry the delete rule the second press needs', () => {
  const schema = fs.readFileSync(
    path.join(
      __dirname,
      '../libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    ),
    'utf8'
  );

  const relations = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .flatMap(([, model, body]) =>
      body
        .split('\n')
        .filter((line) => /@relation\(fields:|@relation\("[^"]*", fields:/.test(line))
        .map((line) => ({ model, line }))
    )
    .filter(({ line }) => /\bOrganization\b/.test(line));

  const withoutCascade = relations
    .filter(({ line }) => !/onDelete:\s*Cascade/.test(line))
    .map(({ model, line }) => `${model}.${line.trim().split(/\s+/)[0]}`);

  expect(withoutCascade.sort()).toEqual([
    // Money and a second party: refused by `deleteAccount`, never cascaded.
    'MessagesGroup.buyerOrganization',
    // A post belongs to its own workspace and is only offered to this one.
    'Post.submittedForOrganization',
  ]);
});
