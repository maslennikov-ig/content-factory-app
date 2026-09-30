'use strict';

/**
 * A calendar/agent move must not put a published post back into the queue
 * (`content-factory-next-kcxz.30`, review W2 F11).
 *
 * `PostsService.changeDate(…, 'schedule')` read the post, then wrote QUEUE for
 * anything that was not a draft. A post published between that read and the
 * write went back into the queue. Now the write is conditional on the state
 * read (`updateMany` with `state` in `where`), a changed row is refused with
 * `POST_STATE_CHANGED` (409), and by default only a queued post or a draft
 * moves at all. The calendar route keeps the upstream «Reschedule the post»
 * choice for a published or failed card, still under the same conditional
 * write.
 */

require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const empty = {};

const plan = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/adaptation-plan.ts'
);

const { PostsRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': empty,
    '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': {
      GetPostsDto: class GetPostsDto {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': {
      GetPostsListDto: class GetPostsListDto {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': {
      CreateTagDto: class CreateTagDto {},
    },
    '@prisma/client': {
      APPROVED_SUBMIT_FOR_ORDER: {},
      CreationMethod: {},
      State: {},
    },
  },
  {
    sources: {
      '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload':
        'libraries/nestjs-libraries/src/database/prisma/errors/error-ledger.payload.ts',
    },
  }
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

const FUTURE = '2030-01-01T10:00:00';
const CALENDAR = ['QUEUE', 'DRAFT', 'PUBLISHED', 'ERROR'];

/**
 * A Prisma-like client over one post row. `afterRead` runs right after the
 * service's read returns — the publisher committing inside the window.
 * `variant` makes the post a CF variant, so the write runs in the gate's
 * transaction.
 */
const world = ({ state, afterRead, variant = false, variantPlan = 'reserve' }) => {
  const row = {
    id: 'post-1',
    organizationId: 'org-a',
    integrationId: 'int-tg',
    state,
    publishDate: new Date('2029-12-31T10:00:00Z'),
    releaseURL: state === 'PUBLISHED' ? 'https://t.me/c/1/2' : null,
    releaseId: state === 'PUBLISHED' ? '2' : null,
    deletedAt: null,
  };
  const log = [];
  const matches = (where) =>
    where.id === row.id &&
    where.organizationId === row.organizationId &&
    (where.state === undefined || where.state === row.state);
  const post = (via) => ({
    findUnique: async ({ where }) => {
      if (!matches(where)) return null;
      const read = { ...row, integration: { providerIdentifier: 'telegram' } };
      if (afterRead) afterRead(row);
      return read;
    },
    findFirst: async ({ where }) => (matches(where) ? { ...row } : null),
    update: async ({ where, data }) => {
      log.push([via, 'update']);
      if (!matches(where)) throw new Error('Record to update not found');
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }) => {
      log.push([via, 'updateMany', where.state]);
      if (!matches(where)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  });
  // The variant's own plan label (`kcxz.56`): a person's move takes the
  // autopilot label off it on the gate's transaction.
  const derivation = { id: 'v1', postId: 'post-1', plan: variantPlan };
  const tx = {
    $queryRaw: async () => log.push(['tx', 'lock']),
    contentDerivation: {
      findMany: async () => [
        { id: 'v1', plan: derivation.plan, post: { state: row.state, publishDate: row.publishDate, deletedAt: null } },
      ],
      updateMany: async ({ where, data }) => {
        log.push(['tx', 'derivation', where.plan]);
        const hit =
          where.organizationId === row.organizationId &&
          where.postId === derivation.postId &&
          (where.plan === undefined || where.plan === derivation.plan);
        if (hit) Object.assign(derivation, data);
        return { count: hit ? 1 : 0 };
      },
    },
    post: post('tx'),
  };
  const client = {
    post: post('root'),
    contentDerivation: {
      findMany: async () =>
        variant
          ? [{ id: 'v1', contentPieceId: 'piece-1', postId: 'post-1', post: { integrationId: 'int-tg' } }]
          : [],
    },
    $transaction: async (work) => work(tx),
  };
  const repository = new PostsRepository(
    { model: client },
    {},
    {},
    { model: { tags: {} } },
    { model: { tagsPosts: {} } },
    {},
    { model: client }
  );
  // The gate as the repository wires it, with a clock-free adapter.
  repository.withCfQueueGate = (orgId, ids, work) =>
    plan.withForeignQueueGate(client, orgId, ids, work);
  const service = new PostsService(repository, { getSocialIntegration: () => ({}) }, {}, {}, {}, {}, {}, {}, {});
  const workflows = [];
  service.startWorkflow = async (provider, id, orgId, target) => {
    workflows.push([id, target]);
    return true;
  };
  const synced = [];
  service.syncPostWorkflow = async (orgId, id) => {
    synced.push(id);
    return 'stopped';
  };
  return { row, log, service, workflows, synced, derivation };
};

const published = (row) => {
  row.state = 'PUBLISHED';
  row.releaseURL = 'https://t.me/c/1/2';
  row.releaseId = '2';
};

describe('changeDate refuses a post that left the queue between read and write', () => {
  test('read as QUEUE, published in the window: refused, the row stays published', async () => {
    const { row, log, service, workflows } = world({ state: 'QUEUE', afterRead: published });
    await expect(
      service.changeDate('org-a', 'post-1', FUTURE, 'schedule')
    ).rejects.toMatchObject({ code: 'POST_STATE_CHANGED', status: 409 });
    expect(row).toMatchObject({ state: 'PUBLISHED', releaseURL: 'https://t.me/c/1/2', releaseId: '2' });
    expect(log).toEqual([['root', 'updateMany', 'QUEUE']]);
    expect(workflows).toEqual([]);
  });

  test('the calendar route is conditional too: its wider states do not re-queue a post published in the window', async () => {
    const { row, service } = world({ state: 'QUEUE', afterRead: published });
    await expect(
      service.changeDate('org-a', 'post-1', FUTURE, 'schedule', CALENDAR)
    ).rejects.toMatchObject({ code: 'POST_STATE_CHANGED' });
    expect(row.state).toBe('PUBLISHED');
  });

  test('a CF variant: the conditional write runs on the gate transaction and is refused there', async () => {
    const { row, log, service } = world({ state: 'QUEUE', afterRead: published, variant: true });
    await expect(
      service.changeDate('org-a', 'post-1', FUTURE, 'schedule')
    ).rejects.toMatchObject({ code: 'POST_STATE_CHANGED' });
    expect(row.state).toBe('PUBLISHED');
    expect(log).toEqual([
      ['tx', 'lock'],
      ['tx', 'updateMany', 'QUEUE'],
    ]);
  });

  test('a refused gated write touches no workflow: the just-published post keeps its run (kcxz.38, P3-1)', async () => {
    const { row, service, workflows, synced } = world({ state: 'QUEUE', afterRead: published, variant: true });
    await expect(
      service.changeDate('org-a', 'post-1', FUTURE, 'schedule')
    ).rejects.toMatchObject({ code: 'POST_STATE_CHANGED' });
    expect(row.state).toBe('PUBLISHED');
    expect(synced).toEqual([]);
    expect(workflows).toEqual([]);
  });

  test('any other gated failure still re-syncs the workflow (review F1)', async () => {
    const { service, synced } = world({ state: 'QUEUE', variant: true });
    service._postRepository.changeDate = async () => {
      throw new Error('connection reset');
    };
    await expect(
      service.changeDate('org-a', 'post-1', FUTURE, 'schedule')
    ).rejects.toThrow('connection reset');
    expect(synced).toEqual(['post-1']);
  });

  test('a draft published in the window is refused as well', async () => {
    const { row, service } = world({ state: 'DRAFT', afterRead: published });
    await expect(
      service.changeDate('org-a', 'post-1', FUTURE, 'schedule')
    ).rejects.toMatchObject({ code: 'POST_STATE_CHANGED' });
    expect(row.state).toBe('PUBLISHED');
  });
});

describe('which states a schedule move starts from', () => {
  test('default (agent plan.move): a published post is refused before any write', async () => {
    const { row, log, service } = world({ state: 'PUBLISHED' });
    await expect(
      service.changeDate('org-a', 'post-1', FUTURE, 'schedule')
    ).rejects.toMatchObject({ code: 'POST_STATE_CHANGED', status: 409 });
    expect(row.state).toBe('PUBLISHED');
    expect(log).toEqual([]);
  });

  test('default: a failed post is refused too', async () => {
    const { log, service } = world({ state: 'ERROR' });
    await expect(
      service.changeDate('org-a', 'post-1', FUTURE, 'schedule')
    ).rejects.toMatchObject({ code: 'POST_STATE_CHANGED' });
    expect(log).toEqual([]);
  });

  test('no race: a queued post moves and stays queued', async () => {
    const { row, service, workflows } = world({ state: 'QUEUE' });
    const moved = await service.changeDate('org-a', 'post-1', FUTURE, 'schedule');
    expect(moved).toMatchObject({ id: 'post-1', state: 'QUEUE' });
    expect(row.publishDate.toISOString()).toBe(new Date(FUTURE).toISOString());
    expect(workflows).toEqual([['post-1', 'QUEUE']]);
  });

  test('no race: a draft moves and stays a draft', async () => {
    const { row, service } = world({ state: 'DRAFT' });
    await service.changeDate('org-a', 'post-1', FUTURE, 'schedule');
    expect(row.state).toBe('DRAFT');
  });

  test('calendar «Reschedule the post» on a published card still re-queues it', async () => {
    const { row, log, service } = world({ state: 'PUBLISHED' });
    await service.changeDate('org-a', 'post-1', FUTURE, 'schedule', CALENDAR);
    expect(row).toMatchObject({ state: 'QUEUE', releaseURL: null, releaseId: null });
    expect(log).toEqual([['root', 'updateMany', 'PUBLISHED']]);
  });

  test('`update` (date only) is not a queue write and keeps the plain update', async () => {
    const { row, log, service } = world({ state: 'PUBLISHED' });
    await service.changeDate('org-a', 'post-1', FUTURE, 'update');
    expect(row.state).toBe('PUBLISHED');
    expect(log).toEqual([['root', 'update']]);
  });

  test('a missing post is a 404 refusal, not a crash', async () => {
    const { service } = world({ state: 'QUEUE' });
    await expect(
      service.changeDate('org-b', 'post-1', FUTURE, 'schedule')
    ).rejects.toMatchObject({ code: 'POST_NOT_FOUND', status: 404 });
  });
});

describe('kcxz.56: a person moving a queued CF variant makes the queue theirs', () => {
  test('calendar drag / plan.move: the autopilot label comes off on the gate transaction, after the move', async () => {
    const { row, log, service, derivation, workflows } = world({
      state: 'QUEUE',
      variant: true,
      variantPlan: 'autopilot',
    });
    await service.changeDate('org-a', 'post-1', FUTURE, 'schedule', CALENDAR);
    expect(row.state).toBe('QUEUE');
    expect(row.publishDate.toISOString()).toBe(new Date(FUTURE).toISOString());
    expect(derivation.plan).toBe('reserve');
    expect(log).toEqual([
      ['tx', 'lock'],
      ['tx', 'updateMany', 'QUEUE'],
      ['tx', 'derivation', 'autopilot'],
    ]);
    expect(workflows).toEqual([['post-1', 'QUEUE']]);
  });

  test('a refused move leaves the label as it was', async () => {
    const { service, derivation, log } = world({
      state: 'QUEUE',
      afterRead: published,
      variant: true,
      variantPlan: 'autopilot',
    });
    await expect(service.changeDate('org-a', 'post-1', FUTURE, 'schedule')).rejects.toMatchObject({
      code: 'POST_STATE_CHANGED',
    });
    expect(derivation.plan).toBe('autopilot');
    expect(log.some(([, what]) => what === 'derivation')).toBe(false);
  });

  test('a plain Postiz post and a draft move write no plan label', async () => {
    const plain = world({ state: 'QUEUE' });
    await plain.service.changeDate('org-a', 'post-1', FUTURE, 'schedule');
    expect(plain.log).toEqual([['root', 'updateMany', 'QUEUE']]);

    const draft = world({ state: 'DRAFT', variant: true, variantPlan: 'autopilot' });
    await draft.service.changeDate('org-a', 'post-1', FUTURE, 'schedule');
    expect(draft.derivation.plan).toBe('autopilot');
  });
});
