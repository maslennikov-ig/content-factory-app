'use strict';

/**
 * `content-factory-next-fn33.8`. Three handwritten copies of the same
 * same-origin door — identity mutations, invitation acceptance, pending-account
 * rejection — had drifted only in their message strings. One helper owns the
 * rule now; this holds both halves: the rule itself, and the fact that the two
 * controllers ask the helper instead of keeping a private copy.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const HELPER = 'libraries/nestjs-libraries/src/auth/same-origin-mutation.ts';
const USERS = 'apps/backend/src/api/routes/users.controller.ts';
const ADMIN = 'apps/backend/src/api/routes/admin.controller.ts';

class HttpException extends Error {
  constructor(body, status) {
    super(typeof body === 'string' ? body : body?.message);
    this.body = body;
    this.status = status;
  }
  getStatus() {
    return this.status;
  }
  getResponse() {
    return this.body;
  }
}

const authChecker = {
  verifyJWT: (token) => {
    if (token === 'session-owner') return { id: 'owner' };
    if (token === 'session-other') return { id: 'other' };
    throw new Error('bad token');
  },
};

const loadHelper = () =>
  loadTypeScriptModule(HELPER, {
    '@nestjs/common': {
      HttpException,
      Logger: class Logger {
        error() {}
      },
    },
    '@contentfactory/helpers/auth/auth.service': { AuthService: authChecker },
    express: {},
  });

const boundary = {
  action: 'every invitation mutation',
  unavailableMessage: 'Invitation acceptance is unavailable',
  unavailableCode: 'invitation_mutations_unavailable',
  forbiddenMessage: 'Forbidden invitation mutation request',
  forbiddenCode: 'invitation_mutation_forbidden',
};

const request = (overrides = {}) => ({
  headers: {
    'content-type': 'application/json',
    origin: 'https://factory.example',
    ...(overrides.headers || {}),
  },
  cookies: { auth: 'session-owner', ...(overrides.cookies || {}) },
});

beforeEach(() => {
  process.env.FRONTEND_URL = 'https://factory.example/app';
});

describe('the shared same-origin mutation door', () => {
  test('a same-origin JSON request from the signed-in session passes', () => {
    const { assertSameOriginJsonMutation } = loadHelper();

    expect(() =>
      assertSameOriginJsonMutation('owner', request(), boundary)
    ).not.toThrow();
  });

  test.each([
    ['missing Origin', { headers: { origin: undefined } }],
    ['foreign Origin', { headers: { origin: 'https://attacker.example' } }],
    ['non-JSON body', { headers: { 'content-type': 'text/plain' } }],
    ['another session', { cookies: { auth: 'session-other' } }],
    ['no session at all', { cookies: { auth: undefined } }],
  ])('%s is refused with the boundary code', (_label, overrides) => {
    const { assertSameOriginJsonMutation } = loadHelper();

    expect(() =>
      assertSameOriginJsonMutation('owner', request(overrides), boundary)
    ).toThrow(
      expect.objectContaining({
        status: 403,
        body: {
          message: boundary.forbiddenMessage,
          code: boundary.forbiddenCode,
        },
      })
    );
  });

  test('an unconfigured FRONTEND_URL is reported as a deployment fault, not an attack', () => {
    const { assertSameOriginJsonMutation } = loadHelper();
    delete process.env.FRONTEND_URL;
    const logged = [];

    expect(() =>
      assertSameOriginJsonMutation('owner', request(), boundary, {
        error: (message) => logged.push(message),
      })
    ).toThrow(
      expect.objectContaining({
        status: 500,
        body: {
          message: boundary.unavailableMessage,
          code: boundary.unavailableCode,
        },
      })
    );
    expect(logged).toEqual([
      'FRONTEND_URL is missing or unparseable; refusing every invitation mutation until it is set',
    ]);
  });

  test('an impersonated session cannot mutate: the token names the admin, not the account', () => {
    const { assertSameOriginJsonMutation } = loadHelper();

    // `user` is the impersonated account; the cookie still carries the admin.
    expect(() =>
      assertSameOriginJsonMutation('impersonated-account', request(), boundary)
    ).toThrow(expect.objectContaining({ status: 403 }));
  });

  test('the request identity comes from the JWT and survives a broken token', () => {
    const { requestUserIdFromJwt } = loadHelper();

    expect(requestUserIdFromJwt(request())).toBe('owner');
    expect(
      requestUserIdFromJwt({ headers: { auth: 'session-other' }, cookies: {} })
    ).toBe('other');
    expect(requestUserIdFromJwt({ headers: {}, cookies: {} })).toBe(null);
    expect(
      requestUserIdFromJwt({ headers: {}, cookies: { auth: 'nonsense' } })
    ).toBe(null);
  });
});

describe('no controller keeps a private copy of the rule', () => {
  test.each([
    ['users.controller.ts', USERS],
    ['admin.controller.ts', ADMIN],
  ])('%s imports the helper', (_label, relative) => {
    expect(read(relative)).toContain(
      "from '@contentfactory/nestjs-libraries/auth/same-origin-mutation'"
    );
  });

  test.each([
    ['users.controller.ts', USERS],
    ['admin.controller.ts', ADMIN],
  ])('%s no longer re-derives the expected origin', (_label, relative) => {
    const source = read(relative);
    expect(source).not.toContain('new URL(process.env.FRONTEND_URL)');
    expect(source).not.toMatch(/private getRequestUserId\(/);
  });
});
