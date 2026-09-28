'use strict';

/**
 * `PostsService` loaded without Nest, a database or Temporal: every import it
 * has is a stub, the two pure modules it leans on are real. The suite gives
 * the instance its repository and Temporal client (`Object.create` or
 * `new PostsService(...)`). First written for `cf-queue-gate.postiz.test.cjs`;
 * shared since the channel deletion suite needed it too (review W3-19 P2-1).
 */

const { loadTypeScriptModule } = require('./load-ts-module.cjs');

const empty = {};

const loadPostsService = () =>
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts',
    {
      '@nestjs/common': {
        BadRequestException: class extends Error {},
        Injectable: () => (target) => target,
        Inject: () => () => undefined,
        Optional: () => () => undefined,
        ValidationPipe: class {},
      },
      '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository': {
        PostsRepository: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': empty,
      '@contentfactory/nestjs-libraries/integrations/integration.manager': {
        IntegrationManager: class {},
      },
      '@prisma/client': { CreationMethod: {}, State: {}, From: {} },
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': empty,
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': empty,
      '@contentfactory/nestjs-libraries/dtos/generator/create.generated.posts.dto':
        empty,
      '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
        { IntegrationService: class {} },
      '@contentfactory/nestjs-libraries/services/make.is': {
        makeId: () => 'group-id',
      },
      '@contentfactory/nestjs-libraries/database/prisma/media/media.service': {
        MediaService: class {},
      },
      '@contentfactory/nestjs-libraries/short-linking/short.link.service': {
        ShortLinkService: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': empty,
      '@contentfactory/helpers/utils/posts.list.minify': {
        minifyPosts: (value) => value,
        minifyPostsList: (value) => value,
      },
      axios: { __esModule: true, default: {} },
      sharp: { __esModule: true, default: () => ({}) },
      '@contentfactory/nestjs-libraries/upload/upload.factory': {
        UploadFactory: { createStorage: () => ({}) },
      },
      '@contentfactory/nestjs-libraries/openai/openai.service': {
        OpenaiService: class {},
      },
      '@sentry/nestjs': { captureException: () => undefined },
      'nestjs-temporal-core': { TemporalService: class {} },
      '@temporalio/common': { TypedSearchAttributes: class {} },
      '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': {
        organizationId: 'organizationId',
        postId: 'postId',
      },
      '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface':
        empty,
      '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
      '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
      '@contentfactory/nestjs-libraries/integrations/social.abstract': {
        RefreshToken: class extends Error {},
      },
      '@contentfactory/nestjs-libraries/integrations/refresh.integration.service':
        { RefreshIntegrationService: class {} },
      '@contentfactory/nestjs-libraries/integrations/telegram.updates.service': {
        TelegramUpdatesService: class {},
      },
      '@contentfactory/helpers/utils/has.extension': { hasExtension: () => true },
      '@contentfactory/helpers/utils/strip.links': {
        stripLinks: (value) => value,
      },
      '@contentfactory/helpers/utils/strip.html.validation': {
        stripHtmlValidation: (value) => value,
      },
      '@contentfactory/helpers/utils/count.length': {
        weightedLength: (value) => value.length,
      },
    },
    {
      sources: {
        '@contentfactory/nestjs-libraries/database/prisma/posts/production.analytics':
          'libraries/nestjs-libraries/src/database/prisma/posts/production.analytics.ts',
        '@contentfactory/nestjs-libraries/locale/backend-strings':
          'libraries/nestjs-libraries/src/locale/backend-strings.ts',
      },
    }
  );

module.exports = { loadPostsService };
