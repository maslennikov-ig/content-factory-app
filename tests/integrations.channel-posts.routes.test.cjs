'use strict';

/**
 * Read model for the dedicated Channels section (`content-factory-next-tu3k.14.26`).
 *
 * The list and the detail panel must count exactly the same posts. A post is
 * visible here only when it belongs to the request organization, is a root
 * post, is not deleted and has reached delivery (`QUEUE`, `PUBLISHED`, or
 * `ERROR`). Drafts and provider-specific child posts are intentionally absent.
 */

require('reflect-metadata');

const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { doorsWithPolicies } = require('./helpers/backend-doors.cjs');

const { ChannelPostsQueryDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/integrations/channel.posts.query.dto.ts'
);

const refusals = (value) =>
  validateSync(plainToInstance(ChannelPostsQueryDto, value)).flatMap((failure) =>
    Object.keys(failure.constraints || {})
  );

describe('channel posts limit', () => {
  test('defaults to three and accepts the inclusive 1..10 range', () => {
    expect(plainToInstance(ChannelPostsQueryDto, {}).limit).toBe(3);
    expect(refusals({ limit: '1' })).toEqual([]);
    expect(refusals({ limit: '10' })).toEqual([]);
  });

  test.each([
    ['0'],
    ['11'],
    ['1.5'],
    ['three'],
  ])('refuses %s', (limit) => {
    expect(refusals({ limit })).not.toEqual([]);
  });
});

const integrationFindFirst = jest.fn();
const integrationFindMany = jest.fn();

const { IntegrationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: { createStorage: () => ({}) },
    },
    '@contentfactory/nestjs-libraries/dtos/integrations/integration.time.dto': {
      IntegrationTimeDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/plugs/plug.dto': { PlugDto: class {} },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'generated-id',
    },
  }
);

const repository = new IntegrationRepository(
  {
    model: {
      integration: {
        findFirst: integrationFindFirst,
        findMany: integrationFindMany,
      },
    },
  },
  {},
  {},
  {},
  {},
  {}
);

const VISIBLE_POSTS = {
  organizationId: 'org-1',
  deletedAt: null,
  parentPostId: null,
  state: { in: ['PUBLISHED', 'QUEUE', 'ERROR'] },
};

describe('channel posts stay inside the workspace', () => {
  beforeEach(() => {
    integrationFindFirst.mockReset().mockResolvedValue(null);
    integrationFindMany.mockReset().mockResolvedValue([]);
  });

  test('the panel reads a non-deleted channel and only its safe post fields', async () => {
    await repository.getChannelPosts('org-1', 'channel-1', 3);

    expect(integrationFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'channel-1',
        organizationId: 'org-1',
        deletedAt: null,
      },
      select: {
        id: true,
        _count: { select: { posts: { where: VISIBLE_POSTS } } },
        posts: {
          where: VISIBLE_POSTS,
          orderBy: { publishDate: 'desc' },
          take: 3,
          select: {
            id: true,
            content: true,
            publishDate: true,
            state: true,
          },
        },
      },
    });
  });

  test('the list uses the identical count and latest-post filter without an N+1 query', async () => {
    await repository.getIntegrationsForChannelList('org-1');

    expect(integrationFindMany).toHaveBeenCalledTimes(1);
    const query = integrationFindMany.mock.calls[0][0];
    expect(query.where).toEqual({ organizationId: 'org-1', deletedAt: null });
    expect(query.select.createdAt).toBe(true);
    expect(query.select._count).toEqual({
      select: { posts: { where: VISIBLE_POSTS } },
    });
    expect(query.select.posts).toEqual({
      where: VISIBLE_POSTS,
      orderBy: { publishDate: 'desc' },
      take: 1,
      select: { publishDate: true },
    });
  });
});

const HttpException = class HttpException extends Error {
  constructor(response, status) {
    super(JSON.stringify(response));
    this.response = response;
    this.status = status;
  }
};

const { IntegrationService } = loadWithMocks(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Inject: () => () => {},
      forwardRef: (fn) => fn,
      HttpException,
      HttpStatus: { NOT_FOUND: 404, BAD_REQUEST: 400, UNPROCESSABLE_ENTITY: 422 },
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: { createStorage: () => ({}) },
    },
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
    'nestjs-temporal-core': { TemporalService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.repository':
      { AutopostRepository: class {} },
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service':
      { RefreshIntegrationService: class {} },
    '@contentfactory/nestjs-libraries/integrations/analytics.snapshot.service':
      { AnalyticsSnapshotService: class {} },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
  }
);

const serviceWithChannel = (row, calls = []) =>
  new IntegrationService(
    {
      getChannelPosts: async (...args) => {
        calls.push(args);
        return row;
      },
    },
    {},
    {},
    {},
    {},
    {},
    {}
  );

describe('channel posts response', () => {
  test('an existing channel with no matching posts has an honest empty answer', async () => {
    const calls = [];
    const answer = await serviceWithChannel(
      { id: 'channel-1', _count: { posts: 0 }, posts: [] },
      calls
    ).getChannelPosts('org-1', 'channel-1', 3);

    expect(calls).toEqual([['org-1', 'channel-1', 3]]);
    expect(answer).toEqual({ total: 0, posts: [] });
  });

  test('a missing, deleted, or foreign channel is indistinguishable and returns 404', async () => {
    await expect(
      serviceWithChannel(null).getChannelPosts('org-1', 'channel-1', 3)
    ).rejects.toMatchObject({
      response: { code: 'INTEGRATION_NOT_FOUND' },
      status: 404,
    });
  });
});

const noop = () => () => undefined;
const { IntegrationsController } = loadWithMocks(
  'apps/backend/src/api/routes/integrations.controller.ts',
  {
    '@nestjs/common': {
      Body: noop,
      Controller: noop,
      Delete: noop,
      Get: noop,
      HttpException,
      HttpStatus: {},
      Param: noop,
      Post: noop,
      Put: noop,
      Query: noop,
    },
    '@nestjs/swagger': { ApiTags: noop },
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: noop,
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      { AuthorizationActions: {}, Sections: {} },
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: noop,
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: noop,
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      { IntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service':
      { RefreshIntegrationService: class {} },
    '@contentfactory/nestjs-libraries/integrations/telegram.updates.service': {
      TelegramUpdatesService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/social/moltbook.provider': {
      MoltbookProvider: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: {},
    },
  }
);

const controllerWithService = (integrationService, integrationManager = {}) =>
  new IntegrationsController(
    integrationManager,
    integrationService,
    {},
    {},
    {}
  );

describe('the member-facing door delegates only tenant-scoped inputs', () => {
  test('GET /integrations/:id/posts is a read available to every organization member', () => {
    const source = require('fs').readFileSync(
      require('path').join(
        __dirname,
        '../apps/backend/src/api/routes/integrations.controller.ts'
      ),
      'utf8'
    );
    expect(source).toMatch(/@Get\('\/:id\/posts'\)/);
    expect(
      doorsWithPolicies().find(
        (door) =>
          door.method === 'GET' && door.path === '/integrations/:id/posts'
      )
    ).toBeUndefined();
  });

  test('passes the request organization, channel id, and validated limit', async () => {
    const calls = [];
    const answer = { total: 0, posts: [] };
    const controller = controllerWithService({
      getChannelPosts: async (...args) => {
        calls.push(args);
        return answer;
      },
    });

    await expect(
      controller.getChannelPosts({ id: 'org-1' }, 'channel-1', { limit: 7 })
    ).resolves.toBe(answer);
    expect(calls).toEqual([['org-1', 'channel-1', 7]]);
  });

  test('keeps three as a defensive default for direct calls', async () => {
    const calls = [];
    await controllerWithService({
      getChannelPosts: async (...args) => calls.push(args),
    }).getChannelPosts({ id: 'org-1' }, 'channel-1', {});

    expect(calls).toEqual([['org-1', 'channel-1', 3]]);
  });
});

const listRow = (extra = {}) => ({
  id: 'channel-1',
  internalId: 'internal-1',
  name: 'Мой канал',
  providerIdentifier: 'telegram',
  disabled: false,
  inBetweenSteps: false,
  refreshNeeded: false,
  picture: '',
  profile: '',
  type: 'social',
  postingTimes: '[]',
  customer: null,
  additionalSettings: '[]',
  contentLanguage: 'ru',
  writingProfile: null,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  _count: { posts: 2 },
  posts: [{ publishDate: new Date('2026-09-07T10:00:00.000Z') }],
  ...extra,
});

describe('the shared channel list exposes only normalized additions', () => {
  test('adds creation date, normalized profile and the matching posts summary', async () => {
    const controller = controllerWithService(
      { getIntegrationsForChannelList: async () => [listRow()] },
      { getSocialIntegration: () => ({ editor: 'normal' }) }
    );
    const [channel] = (await controller.getIntegrationList({ id: 'org-1' }))
      .integrations;

    expect(channel.createdAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));
    expect(channel.writingProfile).toMatchObject({
      version: 'channel-writing-profile/v1',
      emojiLevel: 'few',
    });
    expect(channel.writingProfileStored).toBe(false);
    expect(channel.postsSummary).toEqual({
      total: 2,
      lastPostAt: new Date('2026-09-07T10:00:00.000Z'),
    });
    expect(channel._count).toBeUndefined();
    expect(channel.posts).toBeUndefined();
  });
});
