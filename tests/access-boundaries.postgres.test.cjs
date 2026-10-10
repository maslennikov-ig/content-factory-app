'use strict';

const { PrismaClient } = require('@prisma/client');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const prismaStub = { '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {}, PrismaTransaction: class {} } };
const { IntegrationRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts', {
  ...prismaStub, '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
});
const { UsersRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts', prismaStub);
const { OrganizationRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts', prismaStub);
const { OAuthRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/oauth/oauth.repository.ts', prismaStub);
const serviceStubs = {
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': { OrganizationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/users/users.service': { UsersService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service': { SubscriptionService: class {} },
  '@contentfactory/nestjs-libraries/services/stripe.service': { StripeService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/oauth/oauth.service': { OAuthService: class {} },
  '@contentfactory/backend/services/auth/auth.service': { AuthService: class {} },
  '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
};
const { UsersController } = loadWithMocks('apps/backend/src/api/routes/users.controller.ts', serviceStubs);
const { PublicAuthMiddleware } = loadWithMocks('apps/backend/src/services/auth/public.auth.middleware.ts', serviceStubs);
const { AuthMiddleware } = loadWithMocks('apps/backend/src/services/auth/auth.middleware.ts', serviceStubs);
const { AuthService: Tokens } = loadWithMocks('libraries/helpers/src/auth/auth.service.ts');

const dbUrl = process.env.CF_ACCESS_DATABASE_URL;
const databaseTests = dbUrl ? describe : describe.skip;
databaseTests('access boundaries with a disposable real PostgreSQL', () => {
  let db, integrations, users, organizations, oauth;
  const savedSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    const url = new URL(dbUrl);
    if (process.env.CF_ACCESS_DATABASE_DISPOSABLE !== '1' || url.hostname !== '127.0.0.1' || url.pathname !== '/cf_access_dbxe_test') {
      throw new Error('Only the explicitly owned disposable database is allowed');
    }
    process.env.JWT_SECRET = 'synthetic-postgres-access-secret';
    db = new PrismaClient({ datasourceUrl: dbUrl });
    integrations = new IntegrationRepository({ model: db });
    users = new UsersRepository({ model: db }, { model: db });
    organizations = new OrganizationRepository({ model: db }, { model: db }, { model: db }, { model: db });
    oauth = new OAuthRepository({ model: db }, { model: db });
    await db.organization.createMany({ data: [{ id: 'a', name: 'Synthetic A', apiKey: 'synthetic-a-key' }, { id: 'b', name: 'Synthetic B', apiKey: 'synthetic-b-key' }] });
    await db.user.create({ data: { id: 'user', email: 'synthetic@example.invalid', providerName: 'LOCAL', password: 'synthetic-old-hash', timezone: 0 } });
    await db.userOrganization.createMany({ data: [{ userId: 'user', organizationId: 'a', role: 'EDITOR' }, { userId: 'user', organizationId: 'b', role: 'ADMIN' }] });
    await db.oAuthApp.create({ data: { id: 'app', organizationId: 'a', name: 'Synthetic app', redirectUrl: 'https://synthetic.invalid/callback', clientId: 'synthetic-client', clientSecret: 'synthetic-secret' } });
    await db.oAuthAuthorization.create({ data: { id: 'grant', oauthAppId: 'app', userId: 'user', organizationId: 'a', accessToken: 'synthetic-token' } });
  });
  afterAll(async () => {
    await db?.$disconnect();
    if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
  });

  async function seedChannels() {
    await db.integration.deleteMany({});
    for (const [organizationId, providerIdentifier, internalId] of [
      ['a', 'linkedin', 'root'], ['a', 'linkedin-page', 'page'], ['a', 'unrelated', 'other'],
      ['b', 'linkedin', 'root'], ['b', 'linkedin-page', 'page'],
    ]) await db.integration.create({ data: {
      id: `${organizationId}-${internalId}`, organizationId, providerIdentifier, internalId, rootInternalId: 'root',
      name: 'Synthetic channel', type: 'social', token: `old-${organizationId}-${internalId}`,
      refreshToken: `refresh-${organizationId}-${internalId}`, tokenExpiration: new Date('2026-01-01Z'), refreshNeeded: true,
    } });
  }
  const refresh = (organizationId, provider = 'linkedin', internalId = 'root', isRefresh = true) => integrations.createOrUpdateIntegration(
    undefined, true, organizationId, 'Synthetic', undefined, 'social', internalId, provider,
    `new-${organizationId}`, `new-refresh-${organizationId}`, 3600, undefined, false, isRefresh ? 'refresh' : undefined
  );

  test.each([true, false])('refresh=%s changes only the intended tenant and LinkedIn cohort', async isRefresh => {
    await seedChannels();
    const protectedRows = await db.integration.findMany({ where: { OR: [{ organizationId: 'b' }, { providerIdentifier: 'unrelated' }] }, orderBy: { id: 'asc' } });
    await refresh('a', 'linkedin', 'root', isRefresh);
    expect(await db.integration.findMany({ where: { OR: [{ organizationId: 'b' }, { providerIdentifier: 'unrelated' }] }, orderBy: { id: 'asc' } })).toEqual(protectedRows);
    expect(await db.integration.findUnique({ where: { id: 'a-page' } })).toMatchObject({ token: 'new-a', refreshToken: 'new-refresh-a', refreshNeeded: false });
  });

  test('concurrent tenant refreshes retain their own persisted credentials', async () => {
    await seedChannels();
    await Promise.all([refresh('a'), refresh('b', 'linkedin-page', 'page')]);
    for (const row of await db.integration.findMany({ where: { providerIdentifier: { in: ['linkedin', 'linkedin-page'] } } })) {
      expect(row).toMatchObject({ token: `new-${row.organizationId}`, refreshToken: `new-refresh-${row.organizationId}`, refreshNeeded: false });
    }
  });

  test.each([true, false])('refresh=%s cannot replace another provider with the same external ID', async isRefresh => {
    await seedChannels();
    const before = await db.integration.findMany({ orderBy: { id: 'asc' } });
    let refusal;
    try {
      await refresh('a', 'facebook', 'root', isRefresh);
    } catch (error) {
      refusal = error;
    }
    expect(await db.integration.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    expect(refusal?.getStatus?.()).toBe(409);
    expect(refusal?.getResponse?.()).toMatchObject({ code: 'CF_CHANNEL_PROVIDER_COLLISION' });
  });

  test('concurrent new connections keep the identity and credentials of one provider', async () => {
    await seedChannels();
    const connect = provider => integrations.createOrUpdateIntegration(
      undefined, true, 'a', 'Synthetic', undefined, 'social', 'new-same-id', provider,
      `token-${provider}`, `refresh-${provider}`, 3600
    );
    const result = await Promise.allSettled([
      connect('linkedin'),
      connect('facebook'),
    ]);
    expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const denied = result.find(item => item.status === 'rejected');
    expect(denied.reason.getStatus()).toBe(409);
    const row = await db.integration.findUnique({ where: {
      organizationId_internalId: { organizationId: 'a', internalId: 'new-same-id' },
    } });
    const winner = result[0].status === 'fulfilled' ? 'linkedin' : 'facebook';
    expect(row).toMatchObject({ providerIdentifier: winner, token: `token-${winner}`, refreshToken: `refresh-${winner}` });
  });

  test('concurrent new connections of the same provider retain normal upsert behavior', async () => {
    await seedChannels();
    const result = await Promise.all([
      refresh('a', 'linkedin', 'new-same-provider', false),
      refresh('a', 'linkedin', 'new-same-provider', false),
    ]);
    expect(result[0].id).toBe(result[1].id);
  });

  test('the actual password write predicate consumes an old hash once under PostgreSQL concurrency', async () => {
    await db.user.update({ where: { id: 'user' }, data: { password: 'synthetic-old-hash' } });
    const results = await Promise.all([users.updatePassword('user', 'Safe-password-1!', 'synthetic-old-hash'), users.updatePassword('user', 'Safe-password-2!', 'synthetic-old-hash')]);
    expect(results.sort()).toEqual([false, true]);
    expect(await users.updatePassword('user', 'Safe-password-3!', 'synthetic-old-hash')).toBe(false);
    const current = await db.user.findUnique({ where: { id: 'user' } });
    expect([Tokens.comparePassword('Safe-password-1!', current.password), Tokens.comparePassword('Safe-password-2!', current.password)].filter(Boolean)).toHaveLength(1);
  });

  test('real organization list projection excludes keys and disabled memberships', async () => {
    await db.userOrganization.update({ where: { userId_organizationId: { userId: 'user', organizationId: 'a' } }, data: { role: 'USER', disabled: false } });
    await db.userOrganization.update({ where: { userId_organizationId: { userId: 'user', organizationId: 'b' } }, data: { disabled: true } });
    const controller = new UsersController({}, {}, {}, organizations, {});
    const result = await controller.getOrgs({ id: 'user' });
    expect(result.map(row => row.id)).toEqual(['a']);
    expect(JSON.stringify(result)).not.toContain('synthetic-a-key');
    expect(result[0].users[0].role).toBe('USER');
    await db.userOrganization.update({ where: { userId_organizationId: { userId: 'user', organizationId: 'b' } }, data: { disabled: false } });
  });

  test('legacy public grant follows current database role, disablement, tenant and removal', async () => {
    const middleware = new PublicAuthMiddleware({}, { getOrgByOAuthToken: () => oauth.findByAccessToken('synthetic-token') });
    const invoke = async () => {
      const req = { method: 'POST', headers: { authorization: 'pos_synthetic' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn();
      await middleware.use(req, res, next);
      return { req, res, next };
    };
    expect((await invoke()).next).not.toHaveBeenCalled(); // A USER, B ADMIN
    await db.userOrganization.update({ where: { userId_organizationId: { userId: 'user', organizationId: 'a' } }, data: { role: 'EDITOR' } });
    const editor = await invoke();
    expect(editor.next).toHaveBeenCalledTimes(1);
    expect(editor.req.org.users[0].role).toBe('EDITOR');
    await db.userOrganization.update({ where: { userId_organizationId: { userId: 'user', organizationId: 'a' } }, data: { disabled: true } });
    expect((await invoke()).next).not.toHaveBeenCalled();
    await db.userOrganization.delete({ where: { userId_organizationId: { userId: 'user', organizationId: 'a' } } });
    expect((await invoke()).next).not.toHaveBeenCalled();
  });

  test('supported legacy session still resolves the actual user and active tenant after password change', async () => {
    const legacy = Tokens.signJWT({ id: 'user', email: 'synthetic@example.invalid', activated: true, providerName: 'LOCAL' });
    const middleware = new AuthMiddleware(organizations, users);
    const req = { method: 'GET', headers: { auth: legacy }, cookies: {} }, next = jest.fn();
    await middleware.use(req, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.org.id).toBe('b');
  });
});
