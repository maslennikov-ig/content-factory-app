require('reflect-metadata');

const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { repositoryRoot } = require('./helpers/load-ts-module.cjs');

const prismaMock = {
  PrismaRepository: class PrismaRepository {},
};

const postsModule = () =>
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service':
        prismaMock,
      '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': {},
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

// `changeState` is a Temporal-proxied activity, so the workflow's caught error
// reaches the repository as plain JSON. Build the fixture the way production
// does — decode a server failure with the real SDK converter, then put it
// through the payload converter's JSON.stringify — instead of hand-writing a
// shape the wire never carries.
function serializedActivityFailure({ message, type, stackTrace }) {
  const {
    defaultFailureConverter,
    defaultPayloadConverter,
  } = require('@temporalio/common');

  const error = defaultFailureConverter.failureToError(
    {
      message: 'Activity task failed',
      source: 'TypeScriptSDK',
      stackTrace: '',
      activityFailureInfo: {
        activityType: { name: 'post' },
        activityId: '1',
        identity: 'worker',
        retryState: 2,
        scheduledEventId: 5,
        startedEventId: 6,
      },
      cause: {
        message,
        source: 'TypeScriptSDK',
        stackTrace,
        applicationFailureInfo: { type, nonRetryable: true },
      },
    },
    defaultPayloadConverter
  );

  return JSON.stringify(error);
}

function repositoryWithRecorder(PostsRepository, updates, creates) {
  return new PostsRepository(
      {
        model: {
          post: {
            update: async (query) => {
              updates.push(query);
              return {
                id: 'post-1',
                organizationId: 'org-1',
                integration: { providerIdentifier: 'linkedin' },
              };
            },
          },
        },
      },
      {},
      {},
      {},
      {},
      {
        model: {
          errors: {
            create: async (query) => {
              creates.push(query);
              return query.data;
            },
          },
        },
      }
    );
}

describe('legacy publishing error ledger privacy', () => {
  test('a serialized Temporal failure keeps its unknown-error classification', async () => {
    const updates = [];
    const creates = [];
    const { PostsRepository } = postsModule();
    const repository = repositoryWithRecorder(PostsRepository, updates, creates);

    await repository.changeState(
      'post-1',
      'ERROR',
      serializedActivityFailure({
        message: 'An unknown error occurred while publishing',
        type: 'PROVIDER_TIMEOUT',
        stackTrace: 'Error\n    at /srv/app/dist/provider.js:12:9',
      }),
      {
        content: 'the complete unpublished post',
        accessToken: 'stored-secret',
      }
    );

    // Neither `message` nor `cause.message` exists on the wire: the classifier
    // has to reach the protobuf failure or every error degrades to the generic
    // "Publishing failed" branch and the admin unknown-error views go blind.
    expect(updates[0].data.error).toBe(
      '{"message":"Unknown Error","code":"PROVIDER_TIMEOUT"}'
    );
    expect(creates).toHaveLength(1);
    expect(creates[0].data).toMatchObject({
      message: '{"message":"Unknown Error","code":"PROVIDER_TIMEOUT"}',
      body: '{}',
      organizationId: 'org-1',
      platform: 'linkedin',
      postId: 'post-1',
    });
    const written = JSON.stringify({ updates, creates });
    expect(written).not.toContain('stored-secret');
    expect(written).not.toContain('complete unpublished post');
    // The wire object carries the provider text and a server stack trace. The
    // classification is derived from them; neither is stored.
    expect(written).not.toContain('while publishing');
    expect(written).not.toContain('/srv/app/dist/provider.js');
  });

  test('a serialized Temporal failure with a real provider message stays generic', async () => {
    const updates = [];
    const creates = [];
    const { PostsRepository } = postsModule();
    const repository = repositoryWithRecorder(PostsRepository, updates, creates);

    await repository.changeState(
      'post-1',
      'ERROR',
      serializedActivityFailure({
        message: 'Rate limit exceeded, retry in 900s',
        type: 'rate_limit',
        stackTrace: '',
      }),
      {}
    );

    expect(updates[0].data.error).toBe(
      '{"message":"Publishing failed","code":"rate_limit"}'
    );
    expect(JSON.stringify({ updates, creates })).not.toContain('Rate limit');
  });

  test('an in-process provider error keeps its numeric status', async () => {
    const updates = [];
    const creates = [];
    const { PostsRepository } = postsModule();
    const repository = repositoryWithRecorder(PostsRepository, updates, creates);

    // Provider adapters throw inside the backend process too. There the error
    // is a live object, so `cause.message` and the HTTP status do survive.
    await repository.changeState(
      'post-1',
      'ERROR',
      {
        message: 'Publishing failed',
        code: 429,
        cause: {
          message: 'Unknown Error',
          type: 'PROVIDER_TIMEOUT',
          statusCode: 504,
        },
        authorization: 'Bearer stored-secret',
      },
      { accessToken: 'stored-secret' }
    );

    // A numeric `code` must not swallow the usable `cause.type` classifier.
    expect(updates[0].data.error).toBe(
      '{"message":"Unknown Error","code":"PROVIDER_TIMEOUT","status":504}'
    );
    expect(JSON.stringify({ updates, creates })).not.toContain('stored-secret');
  });

  test('the admin ledger can filter by email without returning user or post content', async () => {
    const reads = [];
    const { ErrorsRepository } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/errors/errors.repository.ts',
      {
        '@contentfactory/nestjs-libraries/database/prisma/prisma.service':
          prismaMock,
      },
      {
        sources: {
          '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload':
            'libraries/nestjs-libraries/src/database/prisma/errors/error-ledger.payload.ts',
        },
      }
    );
    const repository = new ErrorsRepository({
      model: {
        errors: {
          findMany: async (query) => {
            reads.push(query);
            return [];
          },
          count: async () => 0,
        },
      },
    });

    await repository.listErrors({ email: 'owner@example.test' });

    expect(reads[0].where).toEqual({
      organization: {
        users: {
          some: {
            user: {
              email: {
                contains: 'owner@example.test',
                mode: 'insensitive',
              },
            },
          },
        },
      },
    });
    expect(reads[0].include).toEqual({
      organization: { select: { id: true, name: true } },
      post: { select: { id: true } },
    });
  });

  test('unknown-first sorting recognizes legacy and minimized messages', async () => {
    const counts = [];
    const { ErrorsRepository } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/errors/errors.repository.ts',
      {
        '@contentfactory/nestjs-libraries/database/prisma/prisma.service':
          prismaMock,
      },
      {
        sources: {
          '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload':
            'libraries/nestjs-libraries/src/database/prisma/errors/error-ledger.payload.ts',
        },
      }
    );
    const repository = new ErrorsRepository({
      model: {
        errors: {
          findMany: async () => [],
          count: async (query) => {
            counts.push(query);
            return 0;
          },
        },
      },
    });

    await repository.listErrors({ unknownFirst: true, platform: 'linkedin' });

    // One insensitive `contains`: `An unknown error occurred, please try again
    // later` — the legacy provider text this classifier was widened for —
    // contains `unknown error`, so the second branch only ever matched rows the
    // first already did.
    const classifier = {
      message: { contains: 'Unknown Error', mode: 'insensitive' },
    };
    const filter = { platform: 'linkedin' };

    // Composed with AND rather than spread: a caller filter and the classifier
    // must never be able to overwrite each other's keys.
    expect(counts[0].where).toEqual({ AND: [filter, classifier] });
    expect(counts[1].where).toEqual({ AND: [filter, { NOT: classifier }] });
  });

  test('unknown-only admin stats recognize legacy and minimized messages', async () => {
    const errorCounts = [];
    const { AdminStatsRepository } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/admin-stats/admin-stats.repository.ts',
      {
        '@contentfactory/nestjs-libraries/database/prisma/prisma.service':
          prismaMock,
        '@prisma/client': { Prisma: {} },
      },
      {
        sources: {
          '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload':
            'libraries/nestjs-libraries/src/database/prisma/errors/error-ledger.payload.ts',
        },
      }
    );
    const emptyModel = {
      count: async () => 0,
      groupBy: async () => [],
      findMany: async () => [],
    };
    const repository = new AdminStatsRepository(
      { model: { post: emptyModel } },
      { model: { integration: emptyModel } },
      {
        model: {
          errors: {
            count: async (query) => {
              errorCounts.push(query);
              return 0;
            },
            groupBy: async () => [],
          },
        },
      }
    );

    await repository.getStats({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-18T23:59:59.999Z'),
      unknownOnly: true,
    });

    expect(errorCounts[0].where).toEqual({
      createdAt: {
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lte: new Date('2026-08-18T23:59:59.999Z'),
      },
      message: { contains: 'Unknown Error', mode: 'insensitive' },
    });
  });

  test('cleanup defaults to a non-mutating retention dry-run', async () => {
    let cleanupModule;
    expect(() => {
      cleanupModule = require(path.join(
        repositoryRoot,
        'scripts/operations/cleanup-legacy-errors.cjs'
      ));
    }).not.toThrow();
    if (!cleanupModule) return;

    const mutations = [];
    const counts = [3, 2, 4];
    const result = await cleanupModule.cleanupLegacyErrors(
      {
        errors: {
          count: async () => counts.shift(),
          deleteMany: async (query) => mutations.push(['delete', query]),
          updateMany: async (query) => mutations.push(['update', query]),
        },
      },
      { now: new Date('2026-08-18T12:00:00.000Z') }
    );

    expect(result).toEqual({
      mode: 'dry-run',
      retentionDays: 90,
      before: '2026-05-20T12:00:00.000Z',
      expired: 3,
      unsafeUnknown: 2,
      unsafeKnown: 4,
    });
    expect(mutations).toEqual([]);
  });

  test('apply deletes expired rows and normalizes only survivors', async () => {
    const { cleanupLegacyErrors } = require(path.join(
      repositoryRoot,
      'scripts/operations/cleanup-legacy-errors.cjs'
    ));
    const mutations = [];
    // One page per selector, so each pass performs exactly one mutation.
    const served = new Set();
    const client = {
      errors: {
        count: async () => 0,
        findMany: async ({ where }) => {
          const key = JSON.stringify(where);
          if (served.has(key)) return [];
          served.add(key);
          return [{ id: 'row-1' }];
        },
        deleteMany: async (query) => {
          mutations.push(['delete', query]);
          return { count: 3 };
        },
        updateMany: async (query) => {
          mutations.push(['update', query]);
          return { count: mutations.length === 2 ? 2 : 4 };
        },
      },
    };

    const result = await cleanupLegacyErrors(client, {
      apply: true,
      now: new Date('2026-08-18T12:00:00.000Z'),
    });

    expect(result).toMatchObject({
      mode: 'apply',
      retentionDays: 90,
      deleted: 3,
      normalizedUnknown: 2,
      normalizedKnown: 4,
      verification: { expired: 0, unsafeUnknown: 0, unsafeKnown: 0 },
    });
    expect(mutations).toHaveLength(3);

    const before = new Date('2026-05-20T12:00:00.000Z');
    const survivor = { createdAt: { gte: before } };
    // The operations script keeps its own copy of the classifier because it is
    // CommonJS; this is where the two are held to the same shape.
    const {
      unknownErrorMessageWhere,
    } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/errors/error-ledger.payload.ts'
    );
    const unknown = JSON.parse(JSON.stringify(unknownErrorMessageWhere()));
    const unsafe = (safeMessage) => ({
      OR: [{ message: { not: safeMessage } }, { body: { not: '{}' } }],
    });
    const batched = (where) => ({
      AND: [where, { id: { in: ['row-1'] } }],
    });

    expect(mutations[0][1].where).toEqual(
      batched({ createdAt: { lt: before } })
    );

    // Assert the selector, not only the payload: without the `survivor` clause
    // the normalizing passes would reach rows the retention window has already
    // condemned, and a data-only assertion would not notice.
    expect(mutations[1][1].where).toEqual(
      batched({ AND: [survivor, unknown, unsafe('{"message":"Unknown Error"}')] })
    );
    expect(mutations[1][1].data).toEqual({
      message: '{"message":"Unknown Error"}',
      body: '{}',
    });
    expect(mutations[2][1].where).toEqual(
      batched({
        AND: [
          survivor,
          { NOT: unknown },
          unsafe('{"message":"Publishing failed"}'),
        ],
      })
    );
    expect(mutations[2][1].data).toEqual({
      message: '{"message":"Publishing failed"}',
      body: '{}',
    });
  });
});
