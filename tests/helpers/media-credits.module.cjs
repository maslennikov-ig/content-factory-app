'use strict';

const { loadTypeScriptModule } = require('./load-ts-module.cjs');

const subscriptions =
  'libraries/nestjs-libraries/src/database/prisma/subscriptions';
const media = 'libraries/nestjs-libraries/src/database/prisma/media';

/** Real admission and media services; only external provider/storage are fakes. */
function loadMediaCredits({ storage, allowance = 1 } = {}) {
  const { pricing } = loadTypeScriptModule(`${subscriptions}/pricing.ts`);
  const syntheticPricing = {
    ...pricing,
    STANDARD: {
      ...pricing.STANDARD,
      image_generation_count: allowance,
      generate_videos: allowance,
    },
  };
  const mocks = {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
      PrismaTransaction: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      { IntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
      { OrganizationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: syntheticPricing,
    },
    '@contentfactory/nestjs-libraries/openai/openai.service': {
      OpenaiService: class {},
    },
    '@contentfactory/nestjs-libraries/videos/video.manager': {
      VideoManager: class {},
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: {
        createStorage: () =>
          storage ?? {
            uploadSimple: async () => 'https://synthetic.invalid/media.png',
          },
      },
    },
  };
  const sources = {
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.repository': `${subscriptions}/subscription.repository.ts`,
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service': `${subscriptions}/subscription.service.ts`,
    '@contentfactory/nestjs-libraries/database/prisma/media/media.repository': `${media}/media.repository.ts`,
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      'apps/backend/src/services/auth/permissions/permission.exception.class.ts',
  };
  return {
    ...loadTypeScriptModule(
      `${subscriptions}/subscription.repository.ts`,
      mocks,
      { sources }
    ),
    ...loadTypeScriptModule(`${subscriptions}/subscription.service.ts`, mocks, {
      sources,
    }),
    ...loadTypeScriptModule(`${media}/media.repository.ts`, mocks, { sources }),
    ...loadTypeScriptModule(`${media}/media.service.ts`, mocks, { sources }),
  };
}

module.exports = { loadMediaCredits };
