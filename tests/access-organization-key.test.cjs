'use strict';

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const { UsersController } = loadWithMocks('apps/backend/src/api/routes/users.controller.ts', {
  '@contentfactory/backend/services/auth/auth.service': { AuthService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': { OrganizationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/users/users.service': { UsersService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service': { SubscriptionService: class {} },
  '@contentfactory/nestjs-libraries/services/stripe.service': { StripeService: class {} },
  '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
});
const { PublicAuthMiddleware } = loadWithMocks('apps/backend/src/services/auth/public.auth.middleware.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': { OrganizationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/oauth/oauth.service': { OAuthService: class {} },
});

const org = (id, role, disabled = false) => ({
  id, name: `Workspace ${id}`, apiKey: `synthetic-private-key-${id}`,
  paymentId: 'private-payment-reference', createdAt: new Date('2026-01-01Z'),
  users: [{ role, disabled }], subscription: { subscriptionTier: 'PRO' },
});

test.each(['USER', 'EDITOR', 'ADMIN'])('organization list never exposes a credential to %s', async role => {
  const rows = [org('a', role), org('b', 'USER'), org('disabled', role, true)];
  const service = { getOrgsByUserId: jest.fn(async () => rows) };
  const controller = new UsersController({}, {}, {}, service, {});
  const result = await controller.getOrgs({ id: 'synthetic-user' });
  expect(result.map(row => row.id)).toEqual(['a', 'b']);
  expect(result[0]).toMatchObject({ name: 'Workspace a', users: [{ role, disabled: false }] });
  expect(JSON.stringify(result)).not.toContain('synthetic-private-key');
  expect(JSON.stringify(result)).not.toContain('private-payment-reference');
  expect(rows[0].apiKey).toBe('synthetic-private-key-a');
});

test('missing membership is refused without returning a row', async () => {
  const controller = new UsersController({}, {}, {}, {
    getOrgsByUserId: async () => [{ ...org('a', 'USER'), users: [] }],
  }, {});
  expect(await controller.getOrgs({ id: 'user' })).toEqual([]);
});

test.each([['ADMIN', 'synthetic-private-key-a'], ['EDITOR', ''], ['USER', '']])(
  'explicit self API-key surface preserves %s policy', async (role, publicApi) => {
    const controller = new UsersController({}, {}, {}, {}, {});
    const result = await controller.getSelf({ id: 'user' }, org('a', role), { headers: {}, cookies: {} });
    expect(result.publicApi).toBe(publicApi);
  }
);

test('a participant cannot reach a public mutation with a key obtained from the list', async () => {
  const controller = new UsersController({}, {}, {}, { getOrgsByUserId: async () => [org('a', 'USER')] }, {});
  const [listed] = await controller.getOrgs({ id: 'user' });
  const lookup = jest.fn(async key => key === 'synthetic-private-key-a'
    ? { ...org('a', 'ADMIN'), users: [{ user: { activated: true } }] } : null);
  const middleware = new PublicAuthMiddleware({ getOrgByApiKey: lookup }, {});
  const req = { headers: { authorization: listed.apiKey } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const mutation = jest.fn();
  await middleware.use(req, res, mutation);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(mutation).not.toHaveBeenCalled();
  expect(lookup).not.toHaveBeenCalled();
});
