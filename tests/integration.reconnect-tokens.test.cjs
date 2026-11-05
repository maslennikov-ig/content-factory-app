'use strict';

require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const uploadPicture = jest.fn(async picture => picture);

const { IntegrationRepository } = loadWithMocks(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: { createStorage: () => ({ uploadSimple: uploadPicture }) },
    },
  }
);

const channel = (id, overrides = {}) => ({
  id, organizationId: 'tenant-a', providerIdentifier: 'linkedin-page',
  internalId: id, rootInternalId: 'old-login', token: 'old-access',
  refreshToken: `old-refresh-${id}`, tokenExpiration: new Date('2000-01-01Z'),
  refreshNeeded: true, deletedAt: null, disabled: false,
  postingTimes: '[{"time":600}]', additionalSettings: '[{"value":"keep"}]',
  customInstanceDetails: 'keep-instance', ...overrides,
});

// Disposable Prisma-shaped adapter: the real repository owns every predicate
// and write; no database, network, provider or Temporal workflow is started.
function repositoryFixture(initial, initialPosts = []) {
  const rows = structuredClone(initial);
  const posts = structuredClone(initialPosts);
  const writes = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === 'organizationId_internalId') return matches(row, value);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('not' in value) return row[key] !== value.not;
      if ('in' in value) return value.in.includes(row[key]);
    }
    return row[key] === value;
  });
  const apply = (row, data) => {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) row[key] = structuredClone(value);
    }
  };
  const find = ({ where }) => structuredClone(rows.find(row => matches(row, where)) ?? null);
  const integration = {
    findUnique: jest.fn(find), findFirst: jest.fn(find),
    upsert: jest.fn(async ({ where, create, update }) => {
      const row = rows.find(row => matches(row, where));
      if (!row) {
        if (rows.some(row => matches(row, where.organizationId_internalId))) {
          throw Object.assign(new Error('Unique collision'), { code: 'P2002' });
        }
        const created = { id: 'created', ...structuredClone(create) };
        rows.push(created);
        writes.push({ where, data: create });
        return structuredClone(created);
      }
      writes.push({ where, data: update });
      apply(row, update);
      return structuredClone(row);
    }),
    update: jest.fn(async ({ where, data }) => {
      const row = rows.find(row => matches(row, where));
      if (!row) throw Object.assign(new Error('Missing row'), { code: 'P2025' });
      writes.push({ where, data });
      apply(row, data);
      return structuredClone(row);
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      const affected = rows.filter(row => matches(row, where));
      for (const row of affected) apply(row, data);
      writes.push({ where, data });
      return { count: affected.length };
    }),
  };
  const post = { updateMany: jest.fn(async ({ where, data }) => {
    const affected = posts.filter(row => matches(row, where));
    for (const row of affected) apply(row, data);
    return { count: affected.length };
  }) };
  return {
    repository: new IntegrationRepository({ model: { integration } }, { model: { post } }),
    rows, posts, writes, integration, post,
  };
}

function reconnect(repository, refreshToken, oneTimeToken = false) {
  const args = [undefined, oneTimeToken, 'tenant-a', 'Fresh channel', undefined,
    'social', 'selected', 'linkedin-page', 'fresh-access'];
  if (arguments.length > 1) args.push(refreshToken, 3600);
  return repository.createOrUpdateIntegration(...args);
}

test.each(['omitted', undefined, null, ''])('reconnect preserves stored refresh token for %s', async value => {
  const f = repositoryFixture([channel('selected')]);
  if (value === 'omitted') await reconnect(f.repository);
  else await reconnect(f.repository, value);
  expect(f.rows[0]).toMatchObject({ token: 'fresh-access', refreshToken: 'old-refresh-selected', refreshNeeded: false });
});

test.each([undefined, null, '', 'fresh-refresh'])('shared credential refresh %j stays inside tenant and provider family', async value => {
  const f = repositoryFixture([
    channel('selected'), channel('sibling', { providerIdentifier: 'linkedin' }),
    channel('other-tenant', { organizationId: 'tenant-b' }),
    channel('other-provider', { providerIdentifier: 'facebook' }),
    channel('other-root', { rootInternalId: 'other-login' }),
  ]);
  const before = structuredClone(f.rows);
  await reconnect(f.repository, value, true);
  for (const index of [0, 1]) {
    expect(f.rows[index].token).toBe('fresh-access');
    expect(f.rows[index].refreshToken).toBe(value || before[index].refreshToken);
    expect(f.rows[index].postingTimes).toBe(before[index].postingTimes);
    expect(f.rows[index].customInstanceDetails).toBe(before[index].customInstanceDetails);
  }
  expect(f.rows.slice(2)).toEqual(before.slice(2));
});

test('creation accepts absent refresh token without persisting null', async () => {
  const f = repositoryFixture([]);
  await reconnect(f.repository, null);
  expect(f.rows[0].refreshToken).toBe('');
});

test('a nonempty replacement wins and its expiry uses the fresh authentication lifetime', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(new Date('2040-01-01Z').getTime());
  try {
    const f = repositoryFixture([channel('selected')]);
    await reconnect(f.repository, 'fresh-refresh');
    expect(f.rows[0].refreshToken).toBe('fresh-refresh');
    expect(f.rows[0].tokenExpiration.getTime()).toBe(new Date('2040-01-01T01:00:00Z').getTime());
  } finally {
    now.mockRestore();
  }
});

test('reconnect cannot overwrite a different provider with the same external identity', async () => {
  const f = repositoryFixture([channel('selected', { providerIdentifier: 'facebook' })]);
  const before = structuredClone(f.rows);
  await expect(reconnect(f.repository, 'fresh-refresh')).rejects.toMatchObject({
    response: { code: 'CF_CHANNEL_PROVIDER_COLLISION' },
  });
  expect(f.rows).toEqual(before);
  expect(f.writes).toEqual([]);
});

const pageParams = { organizationId: 'tenant-a', internalId: 'selected', token: 'fresh-page-access',
  name: 'Selected page', inBetweenSteps: false };

test.each(['fresh-refresh', null, undefined, ''])('selected page takes fresh login identity/expiry and preserves target settings (%j)', async refreshToken => {
  const fresh = channel('fresh-login', { rootInternalId: 'new-login', refreshToken,
    tokenExpiration: new Date('2040-02-03Z'), inBetweenSteps: true });
  const f = repositoryFixture([
    fresh, channel('selected'), channel('tenant-b-page', { organizationId: 'tenant-b', internalId: 'selected' }),
    channel('unrelated'),
  ], [{ id: 'fresh-post', integrationId: 'fresh-login', deletedAt: null },
    { id: 'saved-post', integrationId: 'selected', deletedAt: null }]);
  const before = structuredClone(f.rows);
  const result = await f.repository.updateIntegration('fresh-login', pageParams);
  expect(result.id).toBe('selected');
  expect(result).toMatchObject({ rootInternalId: 'new-login', token: 'fresh-page-access',
    refreshToken: refreshToken || 'old-refresh-selected', tokenExpiration: fresh.tokenExpiration,
    refreshNeeded: false, disabled: false, deletedAt: null,
    postingTimes: before[1].postingTimes, additionalSettings: before[1].additionalSettings,
    customInstanceDetails: before[1].customInstanceDetails });
  expect(f.rows.slice(2)).toEqual(before.slice(2));
  expect(f.posts[1]).toEqual({ id: 'saved-post', integrationId: 'selected', deletedAt: null });
});

test('selection without an existing page clears reconnect state and keeps its fresh credentials', async () => {
  const f = repositoryFixture([channel('fresh-login', { rootInternalId: 'new-login', refreshToken: 'new-refresh' })]);
  const result = await f.repository.updateIntegration('fresh-login', pageParams);
  expect(result).toMatchObject({ id: 'fresh-login', internalId: 'selected', rootInternalId: 'new-login',
    token: 'fresh-page-access', refreshToken: 'new-refresh', refreshNeeded: false });
  expect(f.post.updateMany).not.toHaveBeenCalled();
});

test('selecting the current page does not tombstone its existing posts', async () => {
  const f = repositoryFixture([channel('selected')], [{ integrationId: 'selected', deletedAt: null }]);
  await f.repository.updateIntegration('selected', pageParams);
  expect(f.posts).toEqual([{ integrationId: 'selected', deletedAt: null }]);
  expect(f.post.updateMany).not.toHaveBeenCalled();
  expect(f.rows[0].deletedAt).toBeNull();
});

test('a page collision with a different provider fails before changing channels or posts', async () => {
  const f = repositoryFixture([channel('fresh-login'), channel('selected', { providerIdentifier: 'facebook' })],
    [{ integrationId: 'fresh-login', deletedAt: null }]);
  const before = structuredClone({ rows: f.rows, posts: f.posts });
  await expect(f.repository.updateIntegration('fresh-login', { ...pageParams, picture: 'https://fixture.invalid/avatar.png' })).rejects.toMatchObject({
    response: { code: 'CF_CHANNEL_PROVIDER_COLLISION' },
  });
  expect({ rows: f.rows, posts: f.posts }).toEqual(before);
  expect(f.writes).toEqual([]);
  expect(uploadPicture).not.toHaveBeenCalled();
});

test.each([
  ['omitted', {}], ['undefined', { organizationId: undefined }],
  ['null', { organizationId: null }], ['empty', { organizationId: '' }],
])('missing organization (%s) fails before all reads, writes and picture uploads', async (_label, overrides) => {
  const f = repositoryFixture([channel('fresh-login'), channel('selected')]);
  const before = structuredClone(f.rows);
  await expect(f.repository.updateIntegration('fresh-login', {
    internalId: 'selected', picture: 'https://fixture.invalid/avatar.png', ...overrides,
  })).rejects.toThrow('Integration not found');
  expect(f.integration.findUnique).not.toHaveBeenCalled();
  expect(f.integration.findFirst).not.toHaveBeenCalled();
  expect(f.integration.upsert).not.toHaveBeenCalled();
  expect(f.integration.update).not.toHaveBeenCalled();
  expect(f.integration.updateMany).not.toHaveBeenCalled();
  expect(f.post.updateMany).not.toHaveBeenCalled();
  expect(uploadPicture).not.toHaveBeenCalled();
  expect(f.rows).toEqual(before);
});

test('a fresh login from another tenant cannot be merged into this tenant', async () => {
  const f = repositoryFixture([channel('fresh-login', { organizationId: 'tenant-b' }), channel('selected')]);
  const before = structuredClone(f.rows);
  await expect(f.repository.updateIntegration('fresh-login', pageParams)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  expect(f.writes).toEqual([]);
});

test('explicit guarded credential clearing and disconnect still work', async () => {
  const row = channel('selected', { refreshNeeded: false });
  const f = repositoryFixture([row, channel('foreign', { organizationId: 'tenant-b' })]);
  expect(await f.repository.updateExtensionIntegration(row, { refreshToken: '' })).toBe(true);
  expect(f.rows[0].refreshToken).toBe('');
  await f.repository.disconnectChannel('tenant-a', 'selected');
  expect(f.rows[0].refreshNeeded).toBe(true);
  expect(f.rows[1]).toEqual(channel('foreign', { organizationId: 'tenant-b' }));
});

function controllerFixture(authenticate, reConnect) {
  const save = jest.fn(async (...args) => ({ id: 'selected', token: args[8], refreshToken: args[9] }));
  const refreshWorkflow = jest.fn(async () => {});
  const { NoAuthIntegrationsController } = loadWithMocks(
    'apps/backend/src/api/routes/no.auth.integrations.controller.ts', {
      '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {
        get: async key => ({ 'login:state': 'verifier', 'organization:state': 'tenant-a', 'refresh:state': 'selected' }[key] ?? null),
        del: async () => {},
      } },
      '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': { IntegrationService: class {} },
      '@contentfactory/helpers/auth/auth.service': { AuthService: {} },
      '@contentfactory/backend/services/auth/permissions/permissions.ability': { CheckPolicies: () => () => {} },
      '@contentfactory/nestjs-libraries/integrations/integration.missing.scopes': { NotEnoughScopesFilter: class { catch() {} } },
      '@contentfactory/nestjs-libraries/integrations/social.abstract': { NotEnoughScopes: class extends Error {} },
      '@contentfactory/nestjs-libraries/integrations/refresh.integration.service': { RefreshIntegrationService: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': { OrganizationService: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service': { ProductEventsService: class {} },
    }
  );
  const provider = { authenticate, reConnect };
  return { save, refreshWorkflow, connect: () => new NoAuthIntegrationsController(
    { getAllowedSocialsIntegrations: () => ['linkedin-page'], getSocialIntegration: () => provider },
    { createOrUpdateIntegration: save }, { startRefreshWorkflow: refreshWorkflow },
    { getOrgById: async () => ({ id: 'tenant-a', isTrailing: false }) }, {}, {}
  ).connectSocialMedia('linkedin-page', { code: 'code', state: 'state', refresh: 'stale-body-refresh', timezone: 180 }) };
}

test('controller reconnect passes fresh authentication refresh token/expiry and page access token', async () => {
  const auth = { id: 'new-login', accessToken: 'fresh-login-access', refreshToken: 'fresh-refresh', expiresIn: 3600 };
  const reConnect = jest.fn(async () => ({ id: 'selected', name: 'Selected', accessToken: 'fresh-page-access' }));
  const f = controllerFixture(async () => auth, reConnect);
  const result = await f.connect();
  expect(reConnect).toHaveBeenCalledWith('new-login', 'selected', 'fresh-login-access');
  expect(f.save.mock.calls[0].slice(8, 11)).toEqual(['fresh-page-access', 'fresh-refresh', 3600]);
  expect(result).not.toHaveProperty('token');
  expect(result).not.toHaveProperty('refreshToken');
});

test.each(['authentication', 'page-lookup', 'wrong-page'])('%s failure never saves credentials or starts refresh workflow', async failure => {
  const f = controllerFixture(async () => {
    if (failure === 'authentication') throw new Error('Synthetic failure');
    return { id: 'login', accessToken: 'fresh-access', refreshToken: 'fresh-refresh', expiresIn: 3600 };
  }, async () => {
    if (failure === 'page-lookup') throw new Error('Synthetic page failure');
    return { id: 'another-page', name: 'Other', accessToken: 'fresh-page-access' };
  });
  await expect(f.connect()).rejects.toThrow();
  expect(f.save).not.toHaveBeenCalled();
  expect(f.refreshWorkflow).not.toHaveBeenCalled();
});
