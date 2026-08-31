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

const nest = {
  Injectable: () => (target) => target,
  // The repository logs a failed analytics write instead of failing
  // registration, so it constructs a Logger of its own.
  Logger: class Logger {
    error() {}
  },
};
const prisma = {
  Role: { SUPERADMIN: 'SUPERADMIN' },
  ShortLinkPreference: {},
  SubscriptionTier: { STANDARD: 'STANDARD' },
};
const userIdentityHelpers = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/user-identity.ts',
  { '@prisma/client': { Provider: { LOCAL: 'LOCAL' } } }
);
const { OrganizationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {},
    '@prisma/client': prisma,
    '@nestjs/common': nest,
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        fixedEncryption: () => 'api-key',
        hashPassword: (value) => `hashed:${value}`,
      },
    },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {},
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'generated',
    },
    '@contentfactory/helpers/auth/registration.approval': {},
    '@contentfactory/nestjs-libraries/database/prisma/users/user-identity':
      userIdentityHelpers,
    // The same create statement now also writes newsletter consent. Only the
    // source constant is needed here; the consent rule has its own tests.
    '@contentfactory/helpers/auth/newsletter.consent': {
      NEWSLETTER_CONSENT_SOURCE_REGISTRATION: 'registration',
    },
  }
);

test.each([
  {
    provider: 'LOCAL',
    email: ' User@Example.COM ',
    providerId: '',
    want: 'user@example.com',
  },
  {
    provider: 'TELEGRAM',
    email: 'telegram@example.com',
    providerId: 'telegram-42',
    want: 'telegram-42',
  },
])('new $provider accounts receive their initial identity', async (input) => {
  let createInput;
  const organization = {
    model: {
      organization: {
        create: jest.fn(async (value) => {
          createInput = value;
          return { id: 'org-1' };
        }),
      },
    },
  };
  const repository = new OrganizationRepository(organization, {}, {});

  await repository.createOrgAndUser(
    {
      company: 'Company',
      email: input.email,
      password: input.provider === 'LOCAL' ? 'secret' : '',
      provider: input.provider,
      providerId: input.providerId,
    },
    { activated: true, isSuperAdmin: false },
    '127.0.0.1',
    'test-agent'
  );

  expect(createInput.data.users.create.user.create.identities.create).toEqual({
    provider: input.provider,
    providerIdentifier: input.want,
  });
});

test('enterprise-created accounts also receive a normalized LOCAL identity', async () => {
  let createInput;
  const repository = new OrganizationRepository(
    {
      model: {
        organization: {
          create: jest.fn(async (value) => {
            createInput = value;
            return { id: 'org-enterprise' };
          }),
        },
      },
    },
    {},
    {}
  );

  await repository.createMaxUser(
    'external-1',
    'Owner',
    'team',
    'OWNER@EXAMPLE.COM',
    true
  );

  expect(createInput.data.users.create.user.create.identities.create).toEqual({
    provider: 'LOCAL',
    providerIdentifier: 'owner+team@example.com',
  });
});

test('the schema gives every identity one user and globally reserves provider plus identifier', () => {
  const schema = fs.readFileSync(
    path.join(
      repositoryRoot,
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    ),
    'utf8'
  );
  const identityModel = schema.match(
    /model UserIdentity\s*\{([\s\S]*?)\n\}/
  )?.[1];

  expect(identityModel).toBeTruthy();
  expect(identityModel).toMatch(
    /user\s+User\s+@relation\(fields:\s*\[userId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/
  );
  expect(identityModel).toMatch(
    /@@unique\(\[provider,\s*providerIdentifier\]\)/
  );
  expect(identityModel).toMatch(/@@index\(\[userId\]\)/);
});

test('backfill is report-only by default and normalizes LOCAL identities', async () => {
  const writes = [];
  const client = {
    user: {
      findMany: async () => [
        {
          id: 'local-user',
          email: ' User@Example.COM ',
          providerName: 'LOCAL',
          providerId: '',
        },
        {
          id: 'telegram-user',
          email: 'telegram@example.com',
          providerName: 'TELEGRAM',
          providerId: 'telegram-42',
        },
      ],
    },
    userIdentity: {
      findMany: async () => [],
      createMany: async (input) => writes.push(input),
    },
    $transaction: async (callback) => callback(client),
  };
  const {
    backfillUserIdentities,
  } = require('../scripts/operations/backfill-user-identities.cjs');

  const report = await backfillUserIdentities(client);

  expect(report).toMatchObject({ scanned: 2, planned: 2, conflicts: [] });
  expect(report.identities).toEqual([
    {
      userId: 'local-user',
      provider: 'LOCAL',
      providerIdentifier: 'user@example.com',
    },
    {
      userId: 'telegram-user',
      provider: 'TELEGRAM',
      providerIdentifier: 'telegram-42',
    },
  ]);
  expect(writes).toEqual([]);
});

test('backfill apply requires auth writes to be disabled and verifies post-state', async () => {
  const identities = [];
  const users = [
    {
      id: 'local-user',
      email: 'User@Example.COM',
      providerName: 'LOCAL',
      providerId: '',
    },
  ];
  const client = {
    user: { findMany: jest.fn(async () => users) },
    userIdentity: {
      findMany: jest.fn(async () =>
        identities.map((identity) => ({ ...identity }))
      ),
      createMany: jest.fn(async ({ data }) => {
        identities.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: async (callback) => callback(client),
  };
  const {
    backfillUserIdentities,
  } = require('../scripts/operations/backfill-user-identities.cjs');

  await expect(backfillUserIdentities(client, { apply: true })).rejects.toThrow(
    /auth writes.*disabled/i
  );
  expect(client.userIdentity.createMany).not.toHaveBeenCalled();

  const result = await backfillUserIdentities(client, {
    apply: true,
    authWritesDisabled: true,
  });

  expect(result).toMatchObject({
    applied: 1,
    verification: { mode: 'dry-run', planned: 0, conflicts: [] },
  });
  expect(client.user.findMany).toHaveBeenCalledTimes(2);
  expect(client.userIdentity.findMany).toHaveBeenCalledTimes(2);
});

test('the default backfill report counts addresses instead of listing them', () => {
  const {
    printableReport,
  } = require('../scripts/operations/backfill-user-identities.cjs');
  const report = {
    mode: 'apply',
    scanned: 2,
    planned: 2,
    conflicts: [{ type: 'duplicate-legacy-identity', userId: 'a' }],
    identities: [
      { userId: 'a', provider: 'LOCAL', providerIdentifier: 'a@example.com' },
      { userId: 'b', provider: 'LOCAL', providerIdentifier: 'b@example.com' },
    ],
    applied: 2,
    verification: {
      mode: 'dry-run',
      planned: 0,
      conflicts: [],
      identities: [],
    },
  };

  const quiet = JSON.stringify(
    printableReport(report, { includeIdentities: false })
  );
  expect(quiet).not.toMatch(/a@example.com/);
  expect(quiet).toMatch(/"identitiesWithheld":2/);
  // A conflict is unusable without the account it names.
  expect(quiet).toMatch(/duplicate-legacy-identity/);
  expect(JSON.parse(quiet).verification.identitiesWithheld).toBe(0);

  expect(
    JSON.stringify(printableReport(report, { includeIdentities: true }))
  ).toMatch(/a@example.com/);
});

test('the backfill runbook names every statement the operator has to select', () => {
  const runbook = fs.readFileSync(
    path.join(repositoryRoot, 'docs/operations/user-identity-backfill.md'),
    'utf8'
  );

  // The operator must not have to reconstruct this list from a diff printed
  // against a production database where the wrong choice drops 29 tables.
  for (const statement of [
    'CREATE TABLE "UserIdentity"',
    'CREATE UNIQUE INDEX "UserIdentity_provider_providerIdentifier_key"',
    'CREATE INDEX "UserIdentity_userId_idx"',
    'ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey"',
    '--allow-table UserIdentity',
  ]) {
    expect(runbook).toContain(statement);
  }
  expect(runbook).toContain('production-deploy.md');
});

test('credential switch exchanges identity ownership in the same transaction', async () => {
  const events = [];
  const users = new Map([
    [
      'current',
      {
        id: 'current',
        email: 'current@example.com',
        password: 'a',
        providerName: 'LOCAL',
        providerId: '',
        account: null,
        connectedAccount: false,
        activated: true,
      },
    ],
    [
      'target',
      {
        id: 'target',
        email: 'target@example.com',
        password: '',
        providerName: 'TELEGRAM',
        providerId: 'tg-2',
        account: null,
        connectedAccount: false,
        activated: true,
      },
    ],
  ]);
  const tx = {
    user: {
      findUnique: async ({ where }) => users.get(where.id),
      update: async (input) => events.push(['user.update', input]),
    },
    userIdentity: {
      findMany: async () => [
        {
          id: 'local-id',
          userId: 'current',
          provider: 'LOCAL',
          providerIdentifier: 'current@example.com',
          linkedAt: new Date(0),
        },
        {
          id: 'telegram-id',
          userId: 'target',
          provider: 'TELEGRAM',
          providerIdentifier: 'tg-2',
          linkedAt: new Date(0),
        },
      ],
      deleteMany: async (input) => events.push(['identity.deleteMany', input]),
      createMany: async (input) => events.push(['identity.createMany', input]),
    },
  };
  const transaction = {
    $transaction: async (callback) => {
      events.push(['transaction.begin']);
      const result = await callback(tx);
      events.push(['transaction.commit']);
      return result;
    },
  };
  const { UsersRepository } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {},
      '@nestjs/common': {
        ...nest,
        HttpException: class HttpException extends Error {},
      },
      '@prisma/client': { Provider: { LOCAL: 'LOCAL' }, Role: {} },
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: { hashPassword: (x) => x },
      },
      '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
      '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
      '@contentfactory/nestjs-libraries/services/make.is': {
        makeId: () => 'temp',
      },
      '@contentfactory/nestjs-libraries/database/prisma/users/user-identity':
        userIdentityHelpers,
    }
  );
  const repository = new UsersRepository({ model: {} }, { model: transaction });

  await repository.switchUserCredentials('current', 'target');

  const recreated = events.find(([name]) => name === 'identity.createMany')[1]
    .data;
  expect(recreated).toEqual([
    expect.objectContaining({ id: 'local-id', userId: 'target' }),
    expect.objectContaining({ id: 'telegram-id', userId: 'current' }),
  ]);
  expect(events[0]).toEqual(['transaction.begin']);
  expect(events.at(-1)).toEqual(['transaction.commit']);
});
