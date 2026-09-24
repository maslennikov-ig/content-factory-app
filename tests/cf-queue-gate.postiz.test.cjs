'use strict';

/**
 * Postiz paths go through the one-queue rule of a Content Factory piece
 * (`content-factory-next-97dq.67`).
 *
 * The Postiz editor («Добавить в календарь» on an existing post), the calendar
 * move with `schedule` and the public `PUT /posts/:id/status` could put a CF
 * reserve draft into QUEUE while another variant of the same piece was queued
 * in the same channel. Now each of them runs under the channel lock the pieces'
 * own queue writes take, and is refused with `CF_QUEUE_BUSY` (409) while
 * another variant is queued. Plain Postiz posts are untouched.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const empty = {};

const plan = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/adaptation-plan.ts'
);

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


const FUTURE = new Date(Date.now() + 86_400_000);

/**
 * A Prisma-like client: post-1 (draft, variant v1) and post-2 (variant v2) of
 * piece-1 in int-tg; post-plain has no derivation.
 */
const clientWith = (states, log = [], v2Plan = null) => {
  const derivations = [
    { id: 'v1', contentPieceId: 'piece-1', postId: 'post-1', plan: 'reserve' },
    { id: 'v2', contentPieceId: 'piece-1', postId: 'post-2', plan: v2Plan },
  ];
  const postOf = (id) => ({
    integrationId: 'int-tg',
    state: states[id],
    publishDate: FUTURE,
    deletedAt: null,
  });
  let inLock = false;
  const findMany = async ({ where, select }) => {
    if (where.postId && where.postId.in) {
      return derivations
        .filter((row) => where.postId.in.includes(row.postId))
        .map((row) => ({ ...row, post: { integrationId: 'int-tg' } }));
    }
    log.push(['siblings', inLock]);
    return derivations
      .filter((row) => row.contentPieceId === where.contentPieceId)
      .map((row) => ({ id: row.id, plan: row.plan, post: postOf(row.postId) }));
  };
  const tx = {
    $queryRaw: async (strings, ...values) => {
      log.push(['lock', values[0]]);
      inLock = true;
    },
    contentDerivation: { findMany },
  };
  return {
    log,
    inLock: () => inLock,
    contentDerivation: { findMany },
    $transaction: async (work, options) => {
      log.push(['tx', options]);
      try {
        return await work(tx);
      } finally {
        inLock = false;
      }
    },
  };
};

describe('withForeignQueueGate', () => {
  test('a plain Postiz post: no lock, the write runs', async () => {
    const client = clientWith({});
    const result = await plan.withForeignQueueGate(client, 'org-a', ['post-plain'], async () => 'written');
    expect(result).toBe('written');
    expect(client.log).toEqual([]);
  });

  test('a CF variant while another is queued: refused, nothing written', async () => {
    const client = clientWith({ 'post-1': 'DRAFT', 'post-2': 'QUEUE' });
    let wrote = false;
    await expect(
      plan.withForeignQueueGate(client, 'org-a', ['post-1'], async () => {
        wrote = true;
      })
    ).rejects.toMatchObject({ code: 'CF_QUEUE_BUSY', status: 409 });
    expect(wrote).toBe(false);
    // The same lock key the pieces' own queue writes take.
    expect(client.log[1]).toEqual(['lock', 'cf-plan:org-a:piece-1:int-tg']);
    expect(plan.channelLockKey('org-a', 'piece-1', 'int-tg')).toBe('cf-plan:org-a:piece-1:int-tg');
  });

  test('an autopilot-queued sibling is not released silently either', async () => {
    const client = clientWith({ 'post-1': 'DRAFT', 'post-2': 'QUEUE' }, [], 'autopilot');
    await expect(
      plan.withForeignQueueGate(client, 'org-a', ['post-1'], async () => undefined)
    ).rejects.toMatchObject({ code: 'CF_QUEUE_BUSY' });
  });

  test('no other queued variant: the write runs while the lock is held', async () => {
    const client = clientWith({ 'post-1': 'DRAFT', 'post-2': 'PUBLISHED' });
    let lockedDuringWrite = null;
    await plan.withForeignQueueGate(client, 'org-a', ['post-1'], async () => {
      lockedDuringWrite = client.inLock();
    });
    expect(lockedDuringWrite).toBe(true);
    expect(client.log.find(([kind]) => kind === 'siblings')).toEqual(['siblings', true]);
  });
});

describe('PostsService queue writes from Postiz', () => {
  const serviceWith = (states, post) => {
    const client = clientWith(states);
    const calls = { changeState: [], changeDate: [], createOrUpdate: [] };
    const repository = {
      getPostById: async (id) => ({
        id,
        state: post.state,
        integration: { providerIdentifier: 'telegram' },
      }),
      changeState: async (id, state) => {
        calls.changeState.push([id, state, client.inLock()]);
      },
      changeDate: async (...args) => {
        calls.changeDate.push(args);
        return {};
      },
      createOrUpdatePost: async (...args) => {
        calls.createOrUpdate.push(args);
        return { posts: [{ id: 'post-1', state: 'QUEUE' }] };
      },
      withCfQueueGate: (orgId, ids, work) => plan.withForeignQueueGate(client, orgId, ids, work),
    };
    const service = new PostsService(repository, {
      getSocialIntegration: () => ({}),
    }, {}, {}, {}, {}, {}, {}, {});
    service.startWorkflow = async () => true;
    service.recordVoiceEdit = async () => undefined;
    return { service, calls, client };
  };

  test('public PUT /posts/:id/status: a CF draft does not join a queued sibling', async () => {
    const { service, calls } = serviceWith({ 'post-1': 'DRAFT', 'post-2': 'QUEUE' }, { state: 'DRAFT' });
    await expect(service.changePostStatus('org-a', 'post-1', 'schedule')).rejects.toMatchObject({
      code: 'CF_QUEUE_BUSY',
    });
    expect(calls.changeState).toEqual([]);
  });

  test('public status: allowed when alone, written under the lock', async () => {
    const { service, calls } = serviceWith({ 'post-1': 'DRAFT', 'post-2': 'DRAFT' }, { state: 'DRAFT' });
    await service.changePostStatus('org-a', 'post-1', 'schedule');
    expect(calls.changeState).toEqual([['post-1', 'QUEUE', true]]);
  });

  test('back to draft is never gated', async () => {
    const { service, calls, client } = serviceWith({ 'post-1': 'QUEUE', 'post-2': 'QUEUE' }, { state: 'QUEUE' });
    await service.changePostStatus('org-a', 'post-1', 'draft');
    expect(calls.changeState).toEqual([['post-1', 'DRAFT', false]]);
    expect(client.log).toEqual([]);
  });

  test('editor «schedule» on an existing CF variant is refused while a sibling is queued', async () => {
    const { service, calls } = serviceWith({ 'post-1': 'DRAFT', 'post-2': 'QUEUE' }, { state: 'DRAFT' });
    const body = {
      type: 'schedule',
      date: FUTURE.toISOString(),
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: 'int-tg' },
          settings: { __type: 'telegram' },
          value: [{ id: 'post-1', content: 'Текст' }],
        },
      ],
    };
    await expect(service.createPost('org-a', body, 'WEB')).rejects.toMatchObject({
      code: 'CF_QUEUE_BUSY',
    });
    expect(calls.createOrUpdate).toEqual([]);
    // Saving it as a draft is not a queue write.
    await service.createPost('org-a', { ...body, type: 'draft' }, 'WEB');
    expect(calls.createOrUpdate).toHaveLength(1);
  });

  test('calendar move: a draft stays a draft (no gate); a failed CF post re-queued is gated', async () => {
    const draft = serviceWith({ 'post-1': 'DRAFT', 'post-2': 'QUEUE' }, { state: 'DRAFT' });
    await draft.service.changeDate('org-a', 'post-1', FUTURE.toISOString(), 'schedule');
    expect(draft.calls.changeDate).toHaveLength(1);
    expect(draft.client.log).toEqual([]);

    const failed = serviceWith({ 'post-1': 'ERROR', 'post-2': 'QUEUE' }, { state: 'ERROR' });
    await expect(
      failed.service.changeDate('org-a', 'post-1', FUTURE.toISOString(), 'schedule')
    ).rejects.toMatchObject({ code: 'CF_QUEUE_BUSY' });
    expect(failed.calls.changeDate).toEqual([]);
  });

  test('review F2: a post read as QUEUE is still gated, the decision is taken under the lock', async () => {
    // Read as QUEUE, but a pieces path unqueued it and queued the sibling since.
    const { service, calls } = serviceWith({ 'post-1': 'DRAFT', 'post-2': 'QUEUE' }, { state: 'QUEUE' });
    await expect(service.changePostStatus('org-a', 'post-1', 'schedule')).rejects.toMatchObject({
      code: 'CF_QUEUE_BUSY',
    });
    expect(calls.changeState).toEqual([]);
    const moved = serviceWith({ 'post-1': 'DRAFT', 'post-2': 'QUEUE' }, { state: 'QUEUE' });
    await expect(
      moved.service.changeDate('org-a', 'post-1', FUTURE.toISOString(), 'schedule')
    ).rejects.toMatchObject({ code: 'CF_QUEUE_BUSY' });
    expect(moved.calls.changeDate).toEqual([]);
  });

  test('review F1: the write gets the gate transaction client', async () => {
    const { service, calls } = serviceWith({ 'post-1': 'DRAFT', 'post-2': 'DRAFT' }, { state: 'ERROR' });
    await service.changeDate('org-a', 'post-1', FUTURE.toISOString(), 'schedule');
    const tx = calls.changeDate[0][5];
    expect(tx && typeof tx.$queryRaw).toBe('function');
  });

  test('review F1: a gate that fails for another reason resyncs the workflow, a refusal does not', async () => {
    const { service } = serviceWith({ 'post-1': 'DRAFT', 'post-2': 'DRAFT' }, { state: 'DRAFT' });
    const synced = [];
    service.syncPostWorkflow = async (orgId, id) => {
      synced.push(id);
      return 'started';
    };
    service._postRepository.withCfQueueGate = async () => {
      throw new Error('Transaction already closed: timeout');
    };
    await expect(service.changePostStatus('org-a', 'post-1', 'schedule')).rejects.toThrow(/timeout/);
    expect(synced).toEqual(['post-1']);

    service._postRepository.withCfQueueGate = async () => {
      throw Object.assign(new Error('busy'), { code: 'CF_QUEUE_BUSY' });
    };
    synced.length = 0;
    await expect(service.changePostStatus('org-a', 'post-1', 'schedule')).rejects.toMatchObject({
      code: 'CF_QUEUE_BUSY',
    });
    expect(synced).toEqual([]);
  });
});
