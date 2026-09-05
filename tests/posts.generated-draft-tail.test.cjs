'use strict';

/**
 * Один черновик на тему, а не два (`content-factory-next-fn33.137`).
 *
 * Прогон 05.09.2026: рядом с каждым русским черновиком в базе стенда лежал
 * второй, с той же датой публикации и текстом «Check out the full story
 * here:» без адреса — десять записей Post вместо пяти. Хвост достался от
 * донора: `generatePostsDraft` дописывал в ветку поста ещё одну коробку со
 * ссылкой на источник, и дописывал её всегда, даже когда ни `url`, ни
 * `postId` в запросе не было.
 *
 * Здесь проверяются оба условия приёмки: пустая ссылка — пустой хвост; ссылка
 * есть — хвост есть, и говорит он на языке канала, а не по-английски всегда.
 */

const dayjs = require('dayjs');
// Плагин недели живёт в репозитории постов; здесь его подключает набор, потому
// что настоящий репозиторий подменён заглушкой.
dayjs.extend(require('dayjs/plugin/isoWeek'));

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const empty = {};

const { PostsService } = loadTypeScriptModule(
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

/** Канал, который пишет по-русски: язык хвоста берётся у него. */
const channel = {
  id: 'integration-1',
  providerIdentifier: 'telegram',
  disabled: false,
  contentLanguage: 'ru',
};

const draftsFor = async (body, integration = channel) => {
  const service = new PostsService(
    {},
    {},
    { getIntegrationsList: async () => [integration] },
    {},
    {},
    {},
    {},
    {},
    {}
  );
  const created = [];
  service.createPost = async (orgId, post) => {
    created.push(post);
  };
  await service.generatePostsDraft('org-a', {
    posts: [{ list: [{ post: 'Русский текст поста' }] }],
    // Неделя следующего года: `findTime` перебирает случайные минуты и
    // отбрасывает прошедшие, поэтому неделя должна быть целиком впереди.
    week: 10,
    year: dayjs().year() + 1,
    ...body,
  });
  return created;
};

const boxes = (created) => created[0].posts[0].value;

describe('the generated draft carries a link tail only when there is a link', () => {
  test('no link — one draft with one box', async () => {
    const created = await draftsFor({ url: '', postId: '' });

    expect(created).toHaveLength(1);
    expect(boxes(created)).toHaveLength(1);
    expect(boxes(created)[0].content).toBe('Русский текст поста');
  });

  test('a link — the tail comes back, in the language the channel writes in', async () => {
    const created = await draftsFor({
      url: 'https://example.test/story',
      postId: '',
    });

    const value = boxes(created);
    expect(value).toHaveLength(2);
    expect(value[1].content).toContain('https://example.test/story');
    expect(value[1].content).not.toContain('Check out the full story here');
    expect(value[1].content).toMatch(/Читать/i);
  });

  test('a channel writing in English gets the English tail', async () => {
    const created = await draftsFor(
      { url: 'https://example.test/story', postId: '' },
      { ...channel, contentLanguage: 'en' }
    );

    expect(boxes(created)[1].content).toMatch(/full story/i);
  });

  test('blank spaces are not a link', async () => {
    const created = await draftsFor({ url: '   ', postId: '' });

    expect(boxes(created)).toHaveLength(1);
  });
});
