'use strict';

/**
 * `content-factory-next-saas.2.1`, steps 1 and 2: connecting a channel is an
 * administrator's act, and the guard's unauthenticated exemption covers only
 * doors that really arrive without a session.
 *
 * Two halves, because the defect had two halves. The controller half reads the
 * policies on the door out of the source: a channel publishes in the
 * organization's name, so `Sections.ADMIN` sits beside the plan limit. The
 * guard half is behavioural — it drives `canActivate` for the paths that
 * matter, because the whole failure being fixed here was a check that was
 * written, was visible in the source, and never ran.
 */

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

const CONTROLLER = 'apps/backend/src/api/routes/integrations.controller.ts';

const source = fs.readFileSync(path.join(repositoryRoot, CONTROLLER), 'utf8');

/** The decorators attached to the handler that answers `route`. */
const policiesOn = (route) => {
  const at = source.indexOf(`@Get('${route}')`);
  const alternative = at === -1 ? source.indexOf(`@Post('${route}')`) : at;
  if (alternative === -1) throw new Error(`No handler for ${route}`);
  const handler = source.indexOf('\n  async ', alternative);
  const decorators = source.slice(alternative, handler);
  return [...decorators.matchAll(/Sections\.(\w+)/g)].map((m) => m[1]);
};

describe('starting a channel connection', () => {
  test('the door that hands out the OAuth address asks for an administrator', () => {
    expect(policiesOn('/social/:integration')).toEqual(['CHANNEL', 'ADMIN']);
  });

  /**
   * Order is not decoration. `permissions.guard.ts` refuses on the first
   * policy that does not pass, and the refusal carries that section: a
   * workspace out of channel slots must hear about the plan, not about a role
   * it cannot buy its way out of.
   */
  test('the plan limit is still the first thing asked', () => {
    expect(policiesOn('/social/:integration')[0]).toBe('CHANNEL');
  });
});

const Sections = { CHANNEL: 'channel', ADMIN: 'admin' };
const AuthorizationActions = { Create: 'create' };

class SubscriptionException extends Error {
  constructor(details) {
    super('refused');
    this.details = details;
  }
}

const { PoliciesGuard } = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permissions.guard.ts',
  {
    '@nestjs/common': { Injectable: () => (target) => target },
    '@nestjs/core': { Reflector: class {} },
    '@contentfactory/backend/services/auth/permissions/permissions.service': {
      PermissionsService: class {},
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CHECK_POLICIES_KEY: 'check_policy',
    },
    '@prisma/client': {},
    express: {},
    './permission.exception.class': { SubscriptionException },
  }
);

/**
 * A guard wired to one request path and one set of policies. `check` records
 * that it was consulted at all, which is the fact the defect turned on.
 */
const guardFor = ({ path: requestPath, policies, allow }) => {
  const consulted = [];
  const reflector = { get: () => policies };
  const permissions = {
    check: async (orgId, createdAt, role, requested) => {
      consulted.push({ orgId, role, requested });
      return {
        can: (action, section) => allow.includes(section),
      };
    },
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        path: requestPath,
        query: {},
        org: {
          id: 'organization-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          users: [{ role: 'USER' }],
        },
      }),
    }),
    getHandler: () => () => undefined,
  };

  return {
    consulted,
    activate: () => new PoliciesGuard(reflector, permissions).canActivate(context),
  };
};

const channelPolicies = [
  [AuthorizationActions.Create, Sections.CHANNEL],
  [AuthorizationActions.Create, Sections.ADMIN],
];

describe('the guard exemption for unauthenticated doors', () => {
  test('does not cover the second step of adding a channel', async () => {
    const guard = guardFor({
      path: '/integrations/provider/abc123/connect',
      policies: [[AuthorizationActions.Create, Sections.CHANNEL]],
      allow: [],
    });

    await expect(guard.activate()).rejects.toBeInstanceOf(
      SubscriptionException
    );
    expect(guard.consulted).toHaveLength(1);
  });

  test('still covers the provider callback, which has no organization', async () => {
    const guard = guardFor({
      path: '/integrations/social-connect/mastodon',
      policies: [[AuthorizationActions.Create, Sections.CHANNEL]],
      allow: [],
    });

    await expect(guard.activate()).resolves.toBe(true);
    expect(guard.consulted).toHaveLength(0);
  });

  test('still covers the sign-in routes', async () => {
    const guard = guardFor({
      path: '/auth/login',
      policies: [[AuthorizationActions.Create, Sections.CHANNEL]],
      allow: [],
    });

    await expect(guard.activate()).resolves.toBe(true);
  });

  /**
   * The old check searched the whole path, so any route with an exempt name
   * anywhere in it was exempt too. Anchoring it is what keeps the list from
   * growing on its own.
   */
  test('does not cover a route that merely contains an exempt name', async () => {
    const guard = guardFor({
      path: '/organizations/auth-settings',
      policies: [[AuthorizationActions.Create, Sections.ADMIN]],
      allow: [],
    });

    await expect(guard.activate()).rejects.toBeInstanceOf(
      SubscriptionException
    );
  });
});

describe('refusing the channel door', () => {
  test('a member is refused on the role, not on the plan', async () => {
    const guard = guardFor({
      path: '/integrations/social/mastodon',
      policies: channelPolicies,
      allow: [Sections.CHANNEL],
    });

    await expect(guard.activate()).rejects.toMatchObject({
      details: { section: Sections.ADMIN },
    });
  });

  test('an administrator passes', async () => {
    const guard = guardFor({
      path: '/integrations/social/mastodon',
      policies: channelPolicies,
      allow: [Sections.CHANNEL, Sections.ADMIN],
    });

    await expect(guard.activate()).resolves.toBe(true);
  });
});
