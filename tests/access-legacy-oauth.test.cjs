'use strict';

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { PublicAuthMiddleware } = loadWithMocks('apps/backend/src/services/auth/public.auth.middleware.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': { OrganizationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/oauth/oauth.service': { OAuthService: class {} },
});

function fixture() {
  const memberships = [{ organizationId: 'a', role: 'EDITOR', disabled: false }, { organizationId: 'b', role: 'ADMIN', disabled: false }];
  const grant = { organization: { id: 'a', subscription: {} }, user: { id: 'user', activated: true, organizations: memberships } };
  const getGrant = jest.fn(async () => grant);
  const middleware = new PublicAuthMiddleware({ getOrgByApiKey: async () => ({ id: 'key-org', subscription: {}, users: [{ user: { activated: true } }] }) }, { getOrgByOAuthToken: getGrant });
  const run = async (method = 'POST', auth = 'pos_synthetic') => {
    const req = { method, headers: { authorization: auth } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const effect = jest.fn();
    await middleware.use(req, res, effect);
    return { req, res, effect };
  };
  return { grant, memberships, getGrant, run };
}

test.each(['removed', 'disabled', 'foreign-only', 'blocked'])('%s current membership refuses an existing legacy grant', async kind => {
  const f = fixture();
  if (kind === 'removed') f.memberships.length = 0;
  if (kind === 'disabled') f.memberships[0].disabled = true;
  if (kind === 'foreign-only') f.memberships.shift();
  if (kind === 'blocked') f.grant.user.activated = false;
  const result = await f.run();
  expect(result.effect).not.toHaveBeenCalled();
  expect(result.res.status).toHaveBeenCalledWith(401);
  expect(result.req.org).toBeUndefined();
});

test('downgrade is honored on the next request; a foreign ADMIN membership never grants tenant A writes', async () => {
  const f = fixture();
  const first = await f.run();
  expect(first.effect).toHaveBeenCalledTimes(1);
  expect(first.req.org.users[0].role).toBe('EDITOR');
  f.memberships[0].role = 'USER';
  const refused = await f.run();
  expect(refused.effect).not.toHaveBeenCalled();
  expect(refused.res.status).toHaveBeenCalledWith(403);
  const read = await f.run('GET');
  expect(read.effect).toHaveBeenCalledTimes(1);
  expect(read.req.org.users[0].role).toBe('USER');
  expect(f.getGrant).toHaveBeenCalledTimes(3);
});

test.each(['EDITOR', 'ADMIN', 'SUPERADMIN'])('%s preserves content mutation access and its actual current role', async role => {
  const f = fixture();
  f.memberships[0].role = role;
  const result = await f.run();
  expect(result.effect).toHaveBeenCalledTimes(1);
  expect(result.req.org.id).toBe('a');
  expect(result.req.org.users[0].role).toBe(role);
});

test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('USER cannot perform %s mutations', async method => {
  const f = fixture(); f.memberships[0].role = 'USER';
  const result = await f.run(method);
  expect(result.effect).not.toHaveBeenCalled();
  expect(result.res.status).toHaveBeenCalledWith(403);
});

test('organization-key client preserves ADMIN and the role shape consumed by policies', async () => {
  const result = await fixture().run('POST', 'synthetic-org-key');
  expect(result.effect).toHaveBeenCalledTimes(1);
  expect(result.req.org.users[0].role).toBe('ADMIN');
});
