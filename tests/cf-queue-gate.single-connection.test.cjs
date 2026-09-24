'use strict';

/**
 * The CF queue gate and the write it guards share one connection
 * (`content-factory-next-97dq.67`, review F1 of the fourteenth walk).
 *
 * The gate holds `pg_advisory_xact_lock` in an interactive transaction. When
 * the write went through its own pooled connection, N concurrent gated saves
 * with a pool of about N connections each held one connection and waited for a
 * second, and nobody progressed until the timeouts fired; a gate timeout after
 * the write had committed left a QUEUE post with no workflow. Here the pool
 * has exactly one connection: any query outside the gate's transaction while
 * the gate holds it is the starvation and fails the test.
 */

require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { PostsRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
    },
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

const REACHED_TX = 'write reached the gate transaction';

/** A Prisma-like client over a pool of exactly one connection. */
const onePool = () => {
  const log = [];
  let held = false;
  const root = (label) => async (query) => {
    if (held) {
      throw new Error(`pool exhausted: ${label} asked for a second connection`);
    }
    log.push(['root', label]);
    return label === 'contentDerivation.findMany'
      ? [
          {
            id: 'v1',
            contentPieceId: 'piece-1',
            postId: 'post-1',
            post: { integrationId: 'int-tg' },
          },
        ]
      : { id: 'post-1', organizationId: 'org-a', query };
  };
  const tx = {
    $queryRaw: async () => log.push(['tx', 'lock']),
    contentDerivation: {
      findMany: async () => {
        log.push(['tx', 'siblings']);
        return [
          { id: 'v1', plan: 'reserve', post: { state: 'DRAFT', publishDate: new Date(Date.now() + 86_400_000), deletedAt: null } },
        ];
      },
    },
    post: {
      update: async (query) => {
        log.push(['tx', 'post.update', query.data]);
        return { id: 'post-1', organizationId: 'org-a', integration: { providerIdentifier: 'telegram' } };
      },
      findMany: async () => {
        log.push(['tx', 'post.findMany']);
        throw Object.assign(new Error(REACHED_TX), { reached: true });
      },
    },
  };
  const transactions = [];
  const client = {
    contentDerivation: { findMany: root('contentDerivation.findMany') },
    post: { update: root('post.update'), findMany: root('post.findMany') },
    $transaction: async (work, options) => {
      if (held) throw new Error('pool exhausted: a second transaction was opened');
      transactions.push(options);
      held = true;
      try {
        return await work(tx);
      } finally {
        held = false;
      }
    },
  };
  return { client, tx, log, transactions };
};

const repositoryOver = (client) =>
  new PostsRepository(
    { model: client },
    {},
    {},
    { model: { tags: {} } },
    { model: { tagsPosts: {} } },
    {},
    { model: client }
  );

describe('the gated write runs on the gate transaction', () => {
  test('changeState: one transaction, READ COMMITTED, lock before the write', async () => {
    const { client, log, transactions } = onePool();
    const repository = repositoryOver(client);
    await repository.withCfQueueGate('org-a', ['post-1'], (tx) =>
      repository.changeState('post-1', 'QUEUE', undefined, undefined, tx)
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ isolationLevel: 'ReadCommitted' });
    expect(log.filter(([where]) => where === 'tx').map(([, what]) => what)).toEqual([
      'lock',
      'siblings',
      'post.update',
    ]);
  });

  test('changeDate: the QUEUE write goes through the same connection', async () => {
    const { client, log } = onePool();
    const repository = repositoryOver(client);
    await repository.withCfQueueGate('org-a', ['post-1'], (tx) =>
      repository.changeDate('org-a', 'post-1', '2030-01-01T10:00:00', false, 'schedule', tx)
    );
    expect(log.find(([, what]) => what === 'post.update')).toEqual([
      'tx',
      'post.update',
      expect.objectContaining({ state: 'QUEUE' }),
    ]);
  });

  test('createOrUpdatePost with an existing id joins the gate transaction instead of opening its own', async () => {
    const { client, transactions } = onePool();
    const repository = repositoryOver(client);
    await expect(
      repository.withCfQueueGate('org-a', ['post-1'], (tx) =>
        repository.createOrUpdatePost(
          'schedule',
          'org-a',
          '2030-01-01T10:00:00',
          {
            integration: { id: 'int-tg' },
            settings: { __type: 'telegram' },
            value: [{ id: 'post-1', content: 'Текст', image: [] }],
          },
          [],
          'WEB',
          undefined,
          tx
        )
      )
    ).rejects.toMatchObject({ reached: true });
    // Only the gate's own transaction; the old nested `$transaction` would be
    // a second one on the exhausted pool.
    expect(transactions).toHaveLength(1);
  });

  test('without the tx the old path starves: the guard in this fixture notices', async () => {
    const { client } = onePool();
    const repository = repositoryOver(client);
    await expect(
      repository.withCfQueueGate('org-a', ['post-1'], () =>
        repository.changeState('post-1', 'QUEUE')
      )
    ).rejects.toThrow(/pool exhausted/);
  });
});
