'use strict';

require('reflect-metadata');
const { loadWithMocks } = require('./load-ts-with-mocks.cjs');
const { loadIntegrationService } = require('./integration-service.module.cjs');
const { AuthService } = loadWithMocks(
  'libraries/helpers/src/auth/auth.service.ts'
);
const { IntegrationRepository } = loadWithMocks(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: { createStorage: () => ({}) },
    },
  }
);
const { IntegrationService } = loadIntegrationService();
const { NoAuthIntegrationsController } = loadWithMocks(
  'apps/backend/src/api/routes/no.auth.integrations.controller.ts',
  {
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: {
        get: async (key) =>
          key === 'organization:fixture-state'
            ? 'a'
            : key === 'login:fixture-state'
            ? 'verifier'
            : null,
        del: async () => {},
      },
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      { IntegrationService },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: () => () => {},
    },
    '@contentfactory/nestjs-libraries/integrations/integration.missing.scopes':
      {
        NotEnoughScopesFilter: class {
          catch() {}
        },
      },
    '@contentfactory/nestjs-libraries/integrations/social.abstract': {
      NotEnoughScopes: class extends Error {},
    },
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service':
      { RefreshIntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
      { OrganizationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service':
      { ProductEventsService: class {} },
  }
);
const GENERATION_KEY = '__cfExtensionConnection';
const COOKIES = {
  client_id: 'synthetic-client',
  auth_token: 'synthetic-cookie',
};
const encodedCookies = (cookies = COOKIES) =>
  Buffer.from(JSON.stringify(cookies)).toString('base64');
const encryptedDetails = (generation = 'connection-1', cookies = COOKIES) =>
  AuthService.fixedEncryption(
    JSON.stringify({ ...cookies, [GENERATION_KEY]: generation })
  );
const grant = (generation = 'connection-1', overrides = {}) =>
  AuthService.signJWT({
    purpose: 'extension_refresh',
    integrationId: 'channel',
    organizationId: 'a',
    internalId: 'account',
    provider: 'skool',
    connectionGeneration: generation,
    ...overrides,
  });
const integration = () => ({
  id: 'channel',
  organizationId: 'a',
  internalId: 'account',
  providerIdentifier: 'skool',
  name: 'Synthetic',
  type: 'social',
  token: 'old-token',
  refreshToken: '',
  deletedAt: null,
  disabled: false,
  refreshNeeded: false,
  customInstanceDetails: encryptedDetails(),
});
const serviceFor = (client) =>
  new IntegrationService(new IntegrationRepository({ model: client }));
const controllerFor = (service, provider) =>
  new NoAuthIntegrationsController(
    {
      getAllowedSocialsIntegrations: () => ['skool'],
      getSocialIntegration: () => provider,
    },
    service,
    { startRefreshWorkflow: async () => {} },
    { getOrgById: async () => ({ id: 'a', apiKey: 'synthetic-api-key' }) },
    { recordTrusted: async () => ({ recorded: true }) }
  );

function fixture() {
  let row = integration();
  const writes = [];
  const matches = (where) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const client = {
    integration: {
      findFirst: async ({ where }) => (matches(where) ? { ...row } : null),
      upsert: async ({ update }) => {
        writes.push(update);
        Object.assign(row, update);
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        if (!matches(where)) return { count: 0 };
        writes.push(data);
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  const provider = {
    identifier: 'skool',
    isChromeExtension: true,
    authenticate: jest.fn(async () => ({
      id: 'account',
      name: 'Synthetic',
      accessToken: 'fresh-token',
      refreshToken: '',
      expiresIn: 3600,
    })),
  };
  const service = serviceFor(client);
  const controller = controllerFor(service, provider);
  return {
    controller,
    service,
    provider,
    writes,
    row: () => row,
    replace: (replacement) => {
      row = { ...replacement };
    },
    refresh: (jwt) =>
      controller.extensionRefreshCookies({
        jwt: jwt ?? grant(),
        cookies: encodedCookies(),
      }),
  };
}
module.exports = {
  AuthService,
  GENERATION_KEY,
  COOKIES,
  encodedCookies,
  encryptedDetails,
  grant,
  integration,
  serviceFor,
  controllerFor,
  fixture,
  loadWithMocks,
};
