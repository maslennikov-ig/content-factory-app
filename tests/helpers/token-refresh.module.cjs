'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./load-ts-with-mocks.cjs');
const { loadIntegrationService } = require('./integration-service.module.cjs');
const { IntegrationService } = loadIntegrationService();
const { IntegrationRepository } = loadWithMocks(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts', {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
    '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
  }
);
const sensitive = 'inert-refresh-sensitive-canary';

function dribbble() {
  const { DribbbleProvider } = loadWithMocks(
    'libraries/nestjs-libraries/src/integrations/social/dribbble.provider.ts', {
      '@contentfactory/nestjs-libraries/integrations/social.abstract': { SocialAbstract: class {} },
      '@contentfactory/nestjs-libraries/integrations/tool.decorator': { Tool: () => () => {} },
    }
  );
  const provider = new DribbbleProvider();
  const requests = [];
  provider.fetch = async (...args) => {
    requests.push(args);
    throw new Error('No external request is permitted in this fixture');
  };
  return { provider, requests };
}

// Actual service/repository operations over a disposable Prisma-shaped memory
// adapter. These are not PostgreSQL or real-provider acceptance claims.
function fixture(options = {}) {
  const rows = Array.from({ length: options.count ?? 3 }, (_, index) => ({
    id: `channel-${index}`, organizationId: index === 1 ? 'tenant-b' : 'tenant-a',
    internalId: index < 2 ? 'shared-external-id' : `external-${index}`,
    rootInternalId: index < 2 ? 'shared-external-id' : `external-${index}`,
    providerIdentifier: `synthetic-${index}`, name: 'Synthetic channel', type: 'social',
    token: `inert-access-${index}`, refreshToken: `inert-refresh-${index}`,
    tokenExpiration: new Date('2000-01-01Z'), refreshNeeded: false,
    inBetweenSteps: false, deletedAt: null,
  }));
  if (options.dribbbleIndex !== undefined) rows[options.dribbbleIndex].providerIdentifier = 'dribbble';
  const before = structuredClone(rows);
  const attempts = [], notifications = [], updates = [], saves = [], queries = [];
  const indexOf = row => Number(row.id.split('-').at(-1));
  const model = {
    findMany: async ({ where }) => {
      queries.push(where);
      if (options.queryError) throw new Error(sensitive);
      return structuredClone(rows.filter(row => row.deletedAt === null &&
        row.refreshNeeded === false && row.inBetweenSteps === false &&
        row.tokenExpiration <= where.tokenExpiration.lte));
    },
    update: async ({ where, data }) => {
      updates.push({ where, data });
      const row = rows.find(row => row.id === where.id && row.organizationId === where.organizationId);
      if (!row || indexOf(row) === options.markerFailure) throw new Error(sensitive);
      Object.assign(row, structuredClone(data));
      return structuredClone(row);
    },
    upsert: async ({ where, create, update }) => {
      saves.push({ where, create, update });
      const key = where.organizationId_internalId;
      const row = rows.find(row => row.organizationId === key.organizationId && row.internalId === key.internalId);
      if (!row || row.providerIdentifier !== where.providerIdentifier || indexOf(row) === options.saveFailure) {
        throw new Error(sensitive);
      }
      for (const [key, value] of Object.entries(update)) {
        if (value !== undefined) row[key] = structuredClone(value);
      }
      return structuredClone(row);
    },
  };
  const d = dribbble();
  const manager = { getSocialIntegration: identifier => {
    if (identifier === `synthetic-${options.lookupFailure}`) throw new Error(sensitive);
    if (identifier === 'dribbble') return d.provider;
    return {
      refreshToken: async refresh => {
        const index = Number(refresh.split('-').at(-1));
        attempts.push(index);
        if (index === options.throwAt) throw new Error(sensitive);
        if (index === options.emptyAt) return { accessToken: '', refreshToken: '', expiresIn: 0 };
        if (options.reply) return options.reply(index);
        return { id: `remote-${index}`, name: 'Synthetic', username: 'Synthetic',
          accessToken: `new-access-${index}`, refreshToken: `new-refresh-${index}`, expiresIn: 3600 };
      },
    };
  } };
  const repository = new IntegrationRepository({ model: { integration: model } });
  const service = new IntegrationService(repository, {}, manager, {
    inAppNotification: async (org, title, ...rest) => {
      notifications.push({ org, title, rest, rowsAtNotification: structuredClone(rows) });
      if (org === options.notificationFailureOrg) throw new Error(sensitive);
    },
  }, {}, {}, {});
  return { service, repository, manager, rows, before, attempts, notifications, updates, saves, queries,
    dribbble: d.provider, requests: d.requests };
}

module.exports = { fixture, dribbble, sensitive };
