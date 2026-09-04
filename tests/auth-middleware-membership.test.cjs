'use strict';

/**
 * `content-factory-next-fn33.104`: the request of a person who belongs to no
 * enabled workspace.
 *
 * The middleware read an array as though it were an object — `if
 * (!organization)` is never true for `[]` — and went on to ask an undefined
 * workspace for its API key. The person was answered by whatever that crash
 * turned into: a blank refusal that says nothing about what happened and
 * cannot be told apart from an expired session.
 *
 * A member switched off in the only workspace they had is not a broken
 * request. It is an answer, and it is the one thing this file holds in place:
 * the status, the code and a sentence a person can act on.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

class HttpException extends Error {
  constructor(response, status) {
    super(typeof response === 'string' ? response : response.message);
    this.response = response;
    this.status = status;
  }
  getStatus() {
    return this.status;
  }
  getResponse() {
    return this.response;
  }
}

class HttpForbiddenException extends HttpException {
  constructor() {
    super('Forbidden', 403);
  }
}

const load = (organizations) => {
  const { AuthMiddleware } = loadTypeScriptModule(
    'apps/backend/src/services/auth/auth.middleware.ts',
    {
      '@nestjs/common': { Injectable: () => (target) => target, HttpException },
      express: {},
      '@prisma/client': {},
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: { verifyJWT: () => ({ id: 'user-1' }) },
      },
      '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
        { OrganizationService: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
        UsersService: class {},
      },
      '@contentfactory/helpers/subdomain/subdomain.management': {
        getCookieUrlFromDomain: () => 'localhost',
      },
      '@contentfactory/nestjs-libraries/services/exception.filter': {
        HttpForbiddenException,
      },
      '@contentfactory/nestjs-libraries/chat/mastra.service': {
        MastraService: class {},
      },
      '@contentfactory/nestjs-libraries/user/acting.user': {
        runAsActingUser: (id, next) => next(),
      },
    }
  );

  const organizationService = {
    getUserOrg: async () => null,
    getOrgsByUserId: async () => organizations,
    updateApiKey: async () => {},
  };
  const userService = {
    getUserById: async () => ({
      id: 'user-1',
      activated: true,
      password: 'x',
    }),
  };
  return new AuthMiddleware(organizationService, userService);
};

const request = () => ({
  headers: { auth: 'token' },
  cookies: {},
});

const response = () => ({ cookie() {}, header() {} });

const refuse = async (organizations) => {
  const middleware = load(organizations);
  let next = 0;
  try {
    await middleware.use(request(), response(), () => {
      next += 1;
    });
  } catch (error) {
    return { error, next };
  }
  return { error: null, next };
};

test('a member with no enabled workspace is refused in words, not by a crash', async () => {
  const { error, next } = await refuse([]);

  expect(next).toBe(0);
  expect(error).toBeInstanceOf(HttpException);
  expect(error.getStatus()).toBe(403);
  const body = error.getResponse();
  expect(body.code).toBe('workspace_membership_none');
  expect(typeof body.message).toBe('string');
  expect(body.message.length).toBeGreaterThan(20);
  // Not the blank refusal that logs the browser out: the session is fine, the
  // membership is not.
  expect(error).not.toBeInstanceOf(HttpForbiddenException);
});

test('a member switched off in their only workspace is refused the same way', async () => {
  const { error } = await refuse([
    { id: 'org-1', apiKey: 'k', users: [{ disabled: true }] },
  ]);

  expect(error.getStatus()).toBe(403);
  expect(error.getResponse().code).toBe('workspace_membership_none');
});

test('a member who still has a workspace goes through', async () => {
  const { error, next } = await refuse([
    { id: 'org-1', apiKey: 'k', users: [{ disabled: false }] },
  ]);

  expect(error).toBeNull();
  expect(next).toBe(1);
});
