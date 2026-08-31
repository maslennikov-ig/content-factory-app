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

const Sections = {
  CHANNEL: 'channel',
  POSTS_PER_MONTH: 'posts_per_month',
  VIDEOS_PER_MONTH: 'videos_per_month',
  TEAM_MEMBERS: 'team_members',
  COMMUNITY_FEATURES: 'community_features',
  FEATURED_PLAN: 'featured_plan',
  AI: 'ai',
  IMPORT_FROM_CHANNELS: 'import_from_channels',
  ADMIN: 'admin',
  WEBHOOKS: 'webhooks',
};
const AuthorizationActions = {
  Create: 'create',
  Read: 'read',
  Update: 'update',
  Delete: 'delete',
};

const { PermissionsService } = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permissions.service.ts',
  {
    '@nestjs/common': { Injectable: () => (target) => target },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service':
      { SubscriptionService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      { IntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service':
      { WebhooksService: class {} },
    './permission.exception.class': { AuthorizationActions, Sections },
  }
);

const unexpectedDependency = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(`Unexpected billing dependency access: ${String(property)}`);
    },
  }
);

const createService = () =>
  new PermissionsService(
    unexpectedDependency,
    unexpectedDependency,
    unexpectedDependency,
    unexpectedDependency
  );

describe('organization permissions without Stripe billing', () => {
  const originalStripeKey = process.env.STRIPE_PUBLISHABLE_KEY;

  beforeEach(() => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
  });

  afterAll(() => {
    if (originalStripeKey === undefined) {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    } else {
      process.env.STRIPE_PUBLISHABLE_KEY = originalStripeKey;
    }
  });

  test('still enforces the organization role for the admin section', async () => {
    const requestedPermission = [
      [AuthorizationActions.Read, Sections.ADMIN],
    ];
    const service = createService();

    const userAbility = await service.check(
      'organization-1',
      new Date('2026-01-01T00:00:00.000Z'),
      'USER',
      requestedPermission
    );
    const adminAbility = await service.check(
      'organization-1',
      new Date('2026-01-01T00:00:00.000Z'),
      'ADMIN',
      requestedPermission
    );

    expect(userAbility.can(AuthorizationActions.Read, Sections.ADMIN)).toBe(
      false
    );
    expect(adminAbility.can(AuthorizationActions.Read, Sections.ADMIN)).toBe(
      true
    );
  });

  test('waives subscription limits without consulting billing data', async () => {
    const ability = await createService().check(
      'organization-1',
      new Date('2026-01-01T00:00:00.000Z'),
      'USER',
      [[AuthorizationActions.Create, Sections.CHANNEL]]
    );

    expect(ability.can(AuthorizationActions.Create, Sections.CHANNEL)).toBe(
      true
    );
  });
});
