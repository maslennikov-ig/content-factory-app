'use strict';

/**
 * A post that left the queue does not go out (`content-factory-next-97dq.57`,
 * correctness review F2).
 *
 *  - stopping a post's workflow terminates it by its fixed id `post_<id>`
 *    first (no dependence on the visibility store), then by search; a closed
 *    workflow («not found») is quiet, every other failure is logged;
 *  - the activity the workflow calls after its sleep (`getPostsList`) refuses
 *    a post that is not `QUEUE` any more, and a stale workflow does not write
 *    `ERROR` over a post a person took back into drafts. No workflow code
 *    changed, so Temporal replay stays deterministic.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const guard = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/posts/post-fire-guard.ts'
);

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


const decorator = () => () => undefined;
const { PostActivity } = loadTypeScriptModule(
  'apps/orchestrator/src/activities/post.activity.ts',
  {
    '@nestjs/common': { Injectable: decorator },
    'nestjs-temporal-core': {
      Activity: decorator,
      ActivityMethod: decorator,
      TemporalService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service': {
      NotificationService: class {},
      NotificationType: {},
    },
    '@prisma/client': { State: {} },
    '@contentfactory/helpers/utils/strip.html.validation': {
      stripHtmlValidation: (value) => value,
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface': empty,
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service': {
      RefreshIntegrationService: class {},
    },
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': {
      IntegrationService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service': {
      WebhooksService: class {},
    },
    '@temporalio/common': { TypedSearchAttributes: class {} },
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': {
      organizationId: 'organizationId',
      postId: 'postId',
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service': {
      SubscriptionService: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher': {
      getSsrfSafeDispatcher: () => undefined,
    },
    '@contentfactory/nestjs-libraries/database/prisma/posts/post-fire-guard': guard,
  }
);

let errors;
let warnings;
const realError = console.error;
const realWarn = console.warn;
beforeEach(() => {
  errors = [];
  warnings = [];
  console.error = (message) => errors.push(String(message));
  console.warn = (message) => warnings.push(String(message));
});
afterEach(() => {
  console.error = realError;
  console.warn = realWarn;
});

describe('fire guard rule', () => {
  test.each([
    [{ state: 'QUEUE' }, true],
    [{ state: 'DRAFT' }, false],
    [{ state: 'QUEUE', deletedAt: new Date() }, false],
    [{ state: 'PUBLISHED' }, false],
    [{ state: 'ERROR' }, false],
    // A repeating post's repeat run fires a post that already went out.
    [{ state: 'PUBLISHED', intervalInDays: 7 }, true],
    [{ state: 'DRAFT', intervalInDays: 7 }, false],
    [null, false],
  ])('%j → %s', (post, fireable) => {
    expect(guard.isFireablePost(post)).toBe(fireable);
  });

  test('a stale workflow never writes over a draft', () => {
    expect(guard.mayWriteWorkflowState({ state: 'DRAFT' }, 'ERROR')).toBe(false);
    expect(guard.mayWriteWorkflowState({ state: 'QUEUE' }, 'ERROR')).toBe(true);
    expect(guard.mayWriteWorkflowState(null, 'ERROR')).toBe(true);
  });
});

describe('publish activities after the sleep (F2 activity guard)', () => {
  const activity = (post, writes = []) =>
    new PostActivity(
      {
        getPostsRecursively: async () => (post ? [post] : []),
        getPostStateForWorkflow: async () => (post ? { state: post.state } : null),
        changeState: async (...args) => {
          writes.push(args);
        },
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    );

  test('a post unscheduled while its workflow slept is not published', async () => {
    const list = await activity({ id: 'p1', state: 'DRAFT', parentPostId: null }).getPostsList('org-a', 'p1');
    expect(list).toEqual([]);
    expect(warnings[0]).toContain('no longer queued');
  });

  test('a queued post still goes out', async () => {
    const list = await activity({ id: 'p1', state: 'QUEUE', parentPostId: null }).getPostsList('org-a', 'p1');
    expect(list.map((one) => one.id)).toEqual(['p1']);
  });

  test('«No Post» from a stale workflow does not turn a draft into an error', async () => {
    const writes = [];
    await activity({ id: 'p1', state: 'DRAFT' }, writes).changeState('p1', 'ERROR', 'No Post');
    expect(writes).toEqual([]);
    await activity({ id: 'p2', state: 'QUEUE' }, writes).changeState('p2', 'ERROR', 'boom');
    expect(writes).toEqual([['p2', 'ERROR', 'boom', undefined]]);
  });
});

describe('stopping a post workflow (F2 termination)', () => {
  const service = (temporal) => {
    const created = new PostsService({}, {}, {}, {}, {}, {}, {}, {}, {});
    created._temporalService = temporal;
    return created;
  };
  const temporalWith = ({ terminate, list = [] }) => {
    const calls = { handles: [], starts: [] };
    return {
      calls,
      client: {
        getRawClient: () => ({
          workflow: {
            getHandle: (id) => {
              calls.handles.push(id);
              return { terminate: async () => terminate(id) };
            },
            list: () =>
              (async function* () {
                for (const one of list) yield one;
              })(),
            start: async (name, options) => {
              calls.starts.push([name, options.workflowId]);
            },
          },
        }),
        getWorkflowHandle: async () => ({
          describe: async () => ({ status: { name: 'RUNNING' } }),
          terminate: async () => {
            throw new Error('search terminate failed');
          },
        }),
      },
    };
  };

  test('a draft terminates `post_<id>` by id even when search finds nothing, and starts nothing', async () => {
    const terminated = [];
    const temporal = temporalWith({ terminate: (id) => terminated.push(id) });
    await service(temporal).startWorkflow('telegram', 'p1', 'org-a', 'DRAFT');
    expect(terminated).toEqual(['post_p1']);
    expect(temporal.calls.starts).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a closed workflow is quiet; any other failure is logged, not swallowed', async () => {
    const notFound = Object.assign(new Error('gone'), { name: 'WorkflowNotFoundError' });
    await service(temporalWith({ terminate: () => { throw notFound; } })).startWorkflow('telegram', 'p1', 'org-a', 'DRAFT');
    expect(errors).toEqual([]);

    await service(
      temporalWith({
        terminate: () => {
          throw new Error('temporal down');
        },
        list: [{ workflowId: 'post_p1_abc' }],
      })
    ).startWorkflow('telegram', 'p1', 'org-a', 'DRAFT');
    expect(errors.join('\n')).toContain('post_p1 was not terminated: temporal down');
    expect(errors.join('\n')).toContain('post_p1_abc was not terminated: search terminate failed');
  });

  test('a queued post is stopped by id, then started again under the same id', async () => {
    const terminated = [];
    const temporal = temporalWith({ terminate: (id) => terminated.push(id) });
    await service(temporal).startWorkflow('telegram', 'p1', 'org-a', 'QUEUE');
    expect(terminated).toEqual(['post_p1']);
    expect(temporal.calls.starts).toEqual([['postWorkflowV105', 'post_p1']]);
  });
});

describe('queue status tells whether the workflow started (review F7)', () => {
  const withStart = (start) => {
    const created = new PostsService({}, {}, {}, {}, {}, {}, {}, {}, {});
    created._postRepository = {
      getPostById: async (id) => ({ id, integration: { providerIdentifier: 'telegram' } }),
      changeState: async () => undefined,
      // A plain Postiz post: the CF one-queue gate lets the write through (97dq.67).
      withCfQueueGate: (_org, _ids, work) => work(),
    };
    created._temporalService = {
      client: {
        getRawClient: () => ({
          workflow: {
            getHandle: () => ({ terminate: async () => undefined }),
            list: () => (async function* () {})(),
            start,
          },
        }),
      },
    };
    return created;
  };

  test('started, failed and stopped are told apart', async () => {
    expect(
      await withStart(async () => undefined).changePostStatus('org-a', 'p1', 'schedule')
    ).toEqual({ id: 'p1', state: 'QUEUE', workflow: 'started' });
    expect(
      await withStart(async () => {
        throw new Error('temporal down');
      }).changePostStatus('org-a', 'p1', 'schedule')
    ).toEqual({ id: 'p1', state: 'QUEUE', workflow: 'failed' });
    expect(errors.join('\n')).toContain('did not start for post p1: temporal down');
    expect(
      await withStart(async () => undefined).changePostStatus('org-a', 'p1', 'draft')
    ).toEqual({ id: 'p1', state: 'DRAFT', workflow: 'stopped' });
  });
});

describe('syncPostWorkflow follows a state that changed during the Temporal call (re-check P2)', () => {
  test('queued at the first read, unscheduled meanwhile — one more pass stops it', async () => {
    const states = ['QUEUE', 'DRAFT', 'DRAFT'];
    const starts = [];
    const terminated = [];
    const service = new PostsService({}, {}, {}, {}, {}, {}, {}, {}, {});
    service._postRepository = {
      getPostById: async (id) => ({
        id,
        state: states.shift(),
        deletedAt: null,
        integration: { providerIdentifier: 'telegram' },
      }),
    };
    service._temporalService = {
      client: {
        getRawClient: () => ({
          workflow: {
            getHandle: (id) => ({ terminate: async () => terminated.push(id) }),
            list: () => (async function* () {})(),
            start: async (_name, options) => starts.push(options.workflowId),
          },
        }),
      },
    };
    expect(await service.syncPostWorkflow('org-a', 'p1')).toBe('stopped');
    expect(starts).toEqual(['post_p1']);
    expect(terminated).toEqual(['post_p1', 'post_p1']);
  });

  test('unchanged state — a single pass', async () => {
    const reads = [];
    const service = new PostsService({}, {}, {}, {}, {}, {}, {}, {}, {});
    service._postRepository = {
      getPostById: async (id) => {
        reads.push(id);
        return { id, state: 'QUEUE', deletedAt: null, integration: { providerIdentifier: 'telegram' } };
      },
    };
    const starts = [];
    service._temporalService = {
      client: {
        getRawClient: () => ({
          workflow: {
            getHandle: () => ({ terminate: async () => undefined }),
            list: () => (async function* () {})(),
            start: async (_name, options) => starts.push(options.workflowId),
          },
        }),
      },
    };
    expect(await service.syncPostWorkflow('org-a', 'p1')).toBe('started');
    expect(starts).toEqual(['post_p1']);
    expect(reads).toHaveLength(2);
  });
});
