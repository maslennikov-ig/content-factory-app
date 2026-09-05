const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
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

const empty = {};

const { PostsService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts',
  {
    '@nestjs/common': {
      BadRequestException: class extends Error {},
      Injectable: () => (target) => target,
      // Правки автора приходят сюда необязательными и по имени: сервис постов
      // поднимается и там, где голосового модуля нет вовсе.
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
    '@contentfactory/nestjs-libraries/dtos/generator/create.generated.posts.dto': empty,
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      { IntegrationService: class {} },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
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
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service': {
      RefreshIntegrationService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/telegram.updates.service': {
      TelegramUpdatesService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/posts/production.analytics':
      loadTypeScriptModule(
        'libraries/nestjs-libraries/src/database/prisma/posts/production.analytics.ts'
      ),
    /**
     * Настоящий каталог строк, а не заглушка: у него нет своих импортов, и
     * сервис постов берёт из него подпись хвостовой ссылки в языке канала
     * (`content-factory-next-fn33.137`). Местный загрузчик этого набора не
     * разбирает `@contentfactory/*`, поэтому файл назван путём.
     */
    '@contentfactory/nestjs-libraries/locale/backend-strings':
      loadTypeScriptModule('libraries/nestjs-libraries/src/locale/backend-strings.ts'),
    '@contentfactory/helpers/utils/has.extension': { hasExtension: () => true },
    '@contentfactory/helpers/utils/strip.links': { stripLinks: (value) => value },
    '@contentfactory/helpers/utils/strip.html.validation': {
      stripHtmlValidation: (value) => value,
    },
    '@contentfactory/helpers/utils/count.length': {
      weightedLength: (value) => value.length,
    },
  }
);

const buildService = ({ post, manager, telegram }) =>
  new PostsService(
    { getPost: async () => post },
    manager,
    {},
    {},
    { getStatistics: async () => [] },
    {},
    {},
    {},
    telegram
  );

describe('post statistics provider lookup', () => {
  test('an unknown provider identifier reads as no analytics', async () => {
    const service = buildService({
      post: {
        id: 'post-a',
        content: 'Text',
        childrenPost: [],
        integration: { providerIdentifier: 'retired-network' },
      },
      manager: { getSocialIntegration: () => undefined },
      telegram: { getPostMetrics: async () => null },
    });

    await expect(service.getStatistics('org-a', 'post-a')).resolves.toEqual({
      clicks: [],
      hasPostAnalytics: false,
      telegram: undefined,
    });
  });

  test('a Telegram post still reports its stored engagement', async () => {
    const getPostMetrics = jest.fn().mockResolvedValue({
      reactions: 7,
      comments: 3,
      collectedAt: '2026-08-13T10:00:00.000Z',
    });
    const service = buildService({
      post: {
        id: 'post-a',
        content: 'Text',
        childrenPost: [],
        releaseId: '42',
        integration: { providerIdentifier: 'telegram', token: '-1001' },
      },
      manager: {
        getSocialIntegration: () => ({ postAnalytics: async () => [] }),
      },
      telegram: { getPostMetrics },
    });

    await expect(service.getStatistics('org-a', 'post-a')).resolves.toEqual({
      clicks: [],
      hasPostAnalytics: true,
      telegram: {
        reactions: 7,
        comments: 3,
        collectedAt: '2026-08-13T10:00:00.000Z',
      },
    });
    expect(getPostMetrics).toHaveBeenCalledWith('-1001', '42');
  });
});
