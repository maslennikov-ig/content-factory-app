const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const decorator = () => () => undefined;
const redisDeletes = [];
let redisUser = 'initiating-user';
const ioRedis = {
  get: async () => redisUser,
  del: async (key) => {
    redisDeletes.push(key);
    redisUser = null;
  },
};

const controllerModule = loadTypeScriptModule(
  'apps/backend/src/api/routes/no.auth.integrations.controller.ts',
  {
    '@nestjs/common': {
      Body: decorator,
      Controller: decorator,
      Get: decorator,
      HttpException: class HttpException extends Error {},
      Inject: () => () => undefined,
      Logger: class Logger {
        error() {}
      },
      Param: decorator,
      Post: decorator,
      UseFilters: decorator,
    },
    '@nestjs/swagger': { ApiTags: decorator },
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis },
    '@contentfactory/nestjs-libraries/dtos/integrations/connect.integration.dto': {
      ConnectIntegrationDto: class ConnectIntegrationDto {},
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class IntegrationManager {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': {
      IntegrationService: class IntegrationService {},
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: decorator,
    },
    '@contentfactory/nestjs-libraries/integrations/integration.missing.scopes': {
      NotEnoughScopesFilter: class NotEnoughScopesFilter {},
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { fixedEncryption: (value) => value, signJWT: (value) => value },
    },
    '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface': {},
    '@contentfactory/nestjs-libraries/integrations/social.abstract': {
      NotEnoughScopes: class NotEnoughScopes extends Error {},
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': {
      AuthorizationActions: { Create: 'create' },
      Sections: { CHANNEL: 'channel' },
    },
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service': {
      RefreshIntegrationService: class RefreshIntegrationService {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': {
      OrganizationService: class OrganizationService {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service': {
      ProductEventsService: class ProductEventsService {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.service': {
      PublicGrowthService: class PublicGrowthService {},
    },
  },
  {
    // Compiled, not stubbed: the controller and the module that binds the
    // provider have to resolve the same token, and a stub would let a rename
    // pass here and fail only at Nest boot.
    sources: {
      '@contentfactory/backend/api/routes/public-growth.token':
        'apps/backend/src/api/routes/public-growth.token.ts',
    },
  }
);

function createController({ growthFailure = false } = {}) {
  const orderedWrites = [];
  const activatedOrganizations = new Set();
  const growth = {
    recordTrusted: async (name, key) => {
      orderedWrites.push(['growth', name, key]);
      if (growthFailure) throw new Error('growth unavailable');
      const recorded = !activatedOrganizations.has(key);
      activatedOrganizations.add(key);
      return { recorded };
    },
  };
  const controller = new controllerModule.NoAuthIntegrationsController(
    {},
    {},
    {},
    {},
    {
      recordTrusted: async (event) => {
        orderedWrites.push(['product', event.name, event.organizationId]);
        return { recorded: true };
      },
    },
    growth
  );
  return { activatedOrganizations, controller, orderedWrites };
}

beforeEach(() => {
  redisUser = 'initiating-user';
  redisDeletes.length = 0;
});

describe('trusted workspace activation', () => {
  test('records activation only after the real channel_added write', async () => {
    const { controller, orderedWrites } = createController();

    await controller.recordChannelAdded('oauth-state', 'org-private', 'integration-1');

    expect(orderedWrites).toEqual([
      ['product', 'channel_added', 'org-private'],
      ['growth', 'workspace_activated', 'workspace_activated:org-private'],
    ]);
    expect(redisDeletes).toEqual(['product-event-user:oauth-state']);
  });

  test('organization-level activation is safe to retry and deduplicate', async () => {
    const { activatedOrganizations, controller, orderedWrites } = createController();

    await controller.recordChannelAdded('state-1', 'org-private', 'integration-1');
    redisUser = 'initiating-user';
    await controller.recordChannelAdded('state-2', 'org-private', 'integration-2');

    expect(
      orderedWrites.filter(([kind, name]) =>
        kind === 'growth' && name === 'workspace_activated'
      )
    ).toEqual([
      ['growth', 'workspace_activated', 'workspace_activated:org-private'],
      ['growth', 'workspace_activated', 'workspace_activated:org-private'],
    ]);
    expect(activatedOrganizations.size).toBe(1);
  });

  test('keeps retry state when trusted aggregate persistence fails', async () => {
    const { controller } = createController({ growthFailure: true });

    await controller.recordChannelAdded('oauth-state', 'org-private', 'integration-1');

    expect(redisDeletes).toEqual([]);
    expect(redisUser).toBe('initiating-user');
  });
});
