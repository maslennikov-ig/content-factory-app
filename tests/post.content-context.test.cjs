require('reflect-metadata');

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { Client } = require('pg');
const test = globalThis.test || require('node:test');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const sources = {
  '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize':
    'libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts',
  './content-context.errors':
    'libraries/nestjs-libraries/src/content-intelligence/context/content-context.errors.ts',
};

const { PostsRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
      PrismaTransaction: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': {
      Post: class {},
    },
    '@prisma/client': {
      APPROVED_SUBMIT_FOR_ORDER: { NO: 'NO' },
      CreationMethod: { WEB: 'WEB' },
      State: {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': {
      GetPostsDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': {
      GetPostsListDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': {
      CreateTagDto: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload':
      {
        safeErrorLedgerPayload: () => ({ message: '{}', body: '{}' }),
      },
  },
  { sources }
);

function makeDatabase({
  outputFailure = false,
  foreign = false,
  removed = false,
  blocked = false,
  sourceStale = false,
  liveLinksMutated = false,
  tamperedFrozenStatement = false,
  existingPostOrganizationId,
  existingGroupOrganizationId,
  groundedExisting = false,
} = {}) {
  const now = new Date();
  const future = new Date(now.getTime() + 86_400_000);
  const past = new Date(now.getTime() - 86_400_000);
  const frozenStatement = tamperedFrozenStatement
    ? 'Tampered frozen statement'
    : 'Verified frozen fact';
  const initial = {
    posts: [
      ...(existingPostOrganizationId
        ? [
            {
              id: 'existing-post',
              organizationId: existingPostOrganizationId,
              group: 'existing-group',
              deletedAt: null,
              parentPostId: null,
              contentContextSnapshotId: groundedExisting ? 'context-1' : null,
              brandProfileVersionId: groundedExisting
                ? 'profile-version-1'
                : null,
            },
          ]
        : []),
      ...(existingGroupOrganizationId
        ? [
            {
              id: 'existing-group-post',
              organizationId: existingGroupOrganizationId,
              group: 'foreign-group',
              deletedAt: null,
              parentPostId: null,
            },
          ]
        : []),
    ],
    outputs: groundedExisting
      ? [
          {
            organizationId: existingPostOrganizationId,
            postId: 'existing-post',
            contentContextSnapshotId: 'context-1',
          },
        ]
      : [],
    draftEvidence: groundedExisting
      ? [
          {
            organizationId: existingPostOrganizationId,
            postId: 'existing-post',
            evidenceId: 'evidence-1',
          },
        ]
      : [],
    autoPosts: [
      {
        id: 'autopost-v2',
        organizationId: 'org-a',
        workflowVersion: 2,
        active: true,
        requiresAttention: false,
        deletedAt: null,
        lastUrl: '',
      },
    ],
    tagsPosts: [],
  };
  const storedEvidence = {
    id: 'evidence-1',
    organizationId: foreign ? 'org-b' : 'org-a',
    sourceSnapshotId: 'snapshot-1',
    tombstone: removed ? 'SOURCE_REMOVED' : null,
    freshnessStatus: 'FRESH',
    freshUntil: future,
    assessment: {
      status: blocked ? 'REJECTED' : 'ACCEPTED',
      trustTier: blocked ? 'BLOCKED' : 'OFFICIAL',
    },
    snapshot: {
      kind: 'SOURCE',
      freshUntil: future,
      purgedAt: null,
      source: {
        currentSnapshotId: 'snapshot-1',
        freshUntil: sourceStale ? past : future,
        desiredState: 'ACTIVE',
        rightsState: 'CONFIRMED',
        robotsState: 'ALLOWED',
        archivedAt: null,
        purgedAt: null,
      },
    },
  };
  const context = {
    id: 'context-1',
    organizationId: foreign ? 'org-b' : 'org-a',
    contractVersion: 'content-context/v1',
    status: 'READY',
    generationPolicy: 'ALLOW_GROUNDED',
    expiresAt: future,
    invalidatedAt: null,
    brandProfileVersionId: 'profile-version-1',
    profileContentDigest: 'profile-digest',
    items: [
      {
        citationId: 'F1',
        factId: 'fact-1',
        evidenceId: null,
        tombstone: null,
        factStatement: frozenStatement,
        statementHash: createHash('sha256')
          .update('Verified frozen fact')
          .digest('hex'),
        factTemporalKind: 'CURRENT',
        factVerifiedAt: new Date('2026-08-20T10:00:00.000Z'),
        factFreshUntil: future,
        factEvidenceCitationIds: ['E1'],
        fact: {
          id: 'fact-1',
          status: 'VERIFIED',
          freshUntil: future,
          statement: liveLinksMutated
            ? 'Live fact edited later'
            : frozenStatement,
          evidenceLinks: liveLinksMutated
            ? []
            : [
                {
                  stance: 'SUPPORTS',
                  reviewStatus: 'ACCEPTED',
                  evidence: storedEvidence,
                },
              ],
        },
      },
      {
        citationId: 'E1',
        factId: null,
        evidenceId: 'evidence-1',
        tombstone: removed ? 'SOURCE_REMOVED' : null,
        evidence: storedEvidence,
      },
    ],
    brandProfileVersion: {
      id: 'profile-version-1',
      organizationId: foreign ? 'org-b' : 'org-a',
      lifecycle: 'PUBLISHED',
      contentDigest: 'profile-digest',
      profile: { deletedAt: null },
    },
  };

  const normalizeCheckedPostRelations = (data) => {
    if (
      Object.hasOwn(data, 'contentContextSnapshotId') ||
      Object.hasOwn(data, 'brandProfileVersionId')
    ) {
      throw new Error(
        'checked Post input must use tenant-scoped provenance relations'
      );
    }
    const normalized = { ...data };
    for (const [relation, scalar] of [
      ['contentContextSnapshot', 'contentContextSnapshotId'],
      ['brandProfileVersion', 'brandProfileVersionId'],
    ]) {
      const operation = normalized[relation];
      if (!operation) continue;
      if (operation.disconnect) {
        // What the database actually does, and the fixture used to be kinder
        // than it: both provenance relations are composite —
        // `@relation(fields: [organizationId, <scalar>])` — so a `disconnect`
        // nulls *every* field of the relation, the post's own required
        // `organizationId` among them. PostgreSQL answers P2011 and the save
        // dies (`content-factory-next-fn33.88`). Clearing the foreign key is
        // a scalar write, not a disconnect.
        const error = new Error(
          'Null constraint violation on the fields: (`organizationId`)'
        );
        error.code = 'P2011';
        throw error;
      } else {
        const key = operation.connect?.organizationId_id;
        if (key?.organizationId !== 'org-a' || typeof key?.id !== 'string') {
          throw new Error('provenance relation must use the tenant composite');
        }
        normalized[scalar] = key.id;
      }
      delete normalized[relation];
    }
    return normalized;
  };

  const makeClient = (state) => ({
    contentContextSnapshot: {
      findFirst: async ({ where }) =>
        where.organizationId === context.organizationId &&
        where.id === context.id
          ? structuredClone(context)
          : null,
      updateMany: async () => ({ count: 1 }),
    },
    post: {
      upsert: async ({ where, create, update }) => {
        const key = where.organizationId_id;
        const id = key?.id || where.id;
        const existing = state.posts.find(
          (post) =>
            post.id === id &&
            (!key || post.organizationId === key.organizationId)
        );
        if (existing) {
          Object.assign(existing, normalizeCheckedPostRelations(update));
          return structuredClone(existing);
        }
        const row = {
          id,
          organizationId: 'org-a',
          ...normalizeCheckedPostRelations(create),
        };
        state.posts.push(row);
        return structuredClone(row);
      },
      update: async () => ({}),
      updateMany: async ({ where, data }) => {
        const matches = state.posts.filter(
          (post) =>
            (!where.organizationId ||
              post.organizationId === where.organizationId) &&
            (!where.id || post.id === where.id) &&
            (!where.group || post.group === where.group) &&
            (where.deletedAt === undefined ||
              post.deletedAt === where.deletedAt)
        );
        for (const post of matches) Object.assign(post, data);
        return { count: matches.length };
      },
      // Kept as general as Prisma is: the ownership check now looks posts up
      // by id alone, so a fixture that insisted on `where.organizationId`
      // would answer "nothing found" to the one query that has to see across
      // tenants.
      findMany: async ({ where }) =>
        state.posts
          .filter(
            (post) =>
              (where.organizationId === undefined ||
                post.organizationId === where.organizationId) &&
              (where.id?.in === undefined || where.id.in.includes(post.id)) &&
              (where.deletedAt === undefined ||
                post.deletedAt === where.deletedAt)
          )
          .map((post) => ({ ...post })),
      findFirst: async ({ where }) => {
        const post = state.posts.find(
          (item) =>
            (!where.organizationId ||
              item.organizationId === where.organizationId) &&
            (!where.group || item.group === where.group) &&
            (where.deletedAt === undefined ||
              item.deletedAt === where.deletedAt) &&
            (where.parentPostId === undefined ||
              item.parentPostId === where.parentPostId)
        );
        return post ? { id: post.id } : null;
      },
    },
    autoPost: {
      findFirst: async ({ where }) => {
        const row = state.autoPosts.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.workflowVersion === where.workflowVersion &&
            item.active === where.active &&
            item.requiresAttention === where.requiresAttention &&
            item.deletedAt === where.deletedAt
        );
        return row ? { id: row.id, lastUrl: row.lastUrl } : null;
      },
      updateMany: async ({ where, data }) => {
        const row = state.autoPosts.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.lastUrl === where.lastUrl
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    contentOutputContext: {
      upsert: async ({ create, update }) => {
        if (outputFailure) throw new Error('forced output failure');
        const existing = state.outputs.find(
          (item) =>
            item.organizationId === create.organizationId &&
            item.postId === create.postId &&
            item.contentContextSnapshotId === create.contentContextSnapshotId
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        state.outputs.push(create);
        return create;
      },
      deleteMany: async ({ where }) => {
        const before = state.outputs.length;
        state.outputs = state.outputs.filter(
          (item) =>
            item.organizationId !== where.organizationId ||
            item.postId !== where.postId
        );
        return { count: before - state.outputs.length };
      },
    },
    draftEvidence: {
      createMany: async ({ data }) => {
        state.draftEvidence.push(...data);
        return { count: data.length };
      },
      deleteMany: async ({ where }) => {
        const before = state.draftEvidence.length;
        state.draftEvidence = state.draftEvidence.filter(
          (item) =>
            item.organizationId !== where.organizationId ||
            item.postId !== where.postId
        );
        return { count: before - state.draftEvidence.length };
      },
    },
    tagsPosts: {
      deleteMany: async () => ({ count: 0 }),
    },
    tags: {
      findMany: async () => [],
    },
  });

  const client = makeClient(initial);
  const transaction = {
    model: {
      $transaction: async (work) => {
        const draft = structuredClone(initial);
        const result = await work(makeClient(draft));
        initial.posts = draft.posts;
        initial.outputs = draft.outputs;
        initial.draftEvidence = draft.draftEvidence;
        initial.autoPosts = draft.autoPosts;
        initial.tagsPosts = draft.tagsPosts;
        return result;
      },
    },
  };
  return { initial, client, transaction };
}

function repositoryFor(database) {
  return new PostsRepository(
    { model: database.client },
    {},
    {},
    { model: database.client },
    { model: database.client },
    {},
    database.transaction
  );
}

function body(overrides = {}) {
  return {
    integration: { id: 'channel-a' },
    settings: { __type: 'telegram' },
    researchSources: [
      {
        title: 'Compatibility source',
        url: 'https://example.com/public',
        publishedAt: '2026-08-20T00:00:00.000Z',
      },
    ],
    contentContextSnapshotId: 'context-1',
    brandProfileVersionId: 'profile-version-1',
    usedCitationIds: ['F1', 'E1'],
    value: [{ content: 'Grounded draft', delay: 0, image: [] }],
    ...overrides,
  };
}

test('draft write atomically persists exact context, profile, citations and evidence while preserving legacy sources', async () => {
  const database = makeDatabase();
  const repository = repositoryFor(database);

  await repository.createOrUpdatePost(
    'draft',
    'org-a',
    '2026-08-20T12:00:00.000Z',
    body(),
    [],
    'WEB'
  );

  assert.equal(database.initial.posts.length, 1);
  assert.equal(database.initial.posts[0].contentContextSnapshotId, 'context-1');
  assert.equal(
    database.initial.posts[0].brandProfileVersionId,
    'profile-version-1'
  );
  assert.equal(
    database.initial.posts[0].researchSources,
    JSON.stringify(body().researchSources)
  );
  assert.deepEqual(database.initial.outputs[0].usedCitationIds, ['E1', 'F1']);
  assert.equal(database.initial.outputs[0].validationStatus, 'VALID');
  assert.equal(
    JSON.stringify(
      database.initial.draftEvidence.map((item) => item.evidenceId)
    ),
    JSON.stringify(['evidence-1'])
  );
});

test('AutoPost V2 draft set and lastUrl marker commit or roll back together', async () => {
  const database = makeDatabase();
  const repository = repositoryFor(database);

  const result = await repository.createAutopostV2DraftAtomic({
    organizationId: 'org-a',
    autoPostId: 'autopost-v2',
    sourceSnapshotId: 'snapshot-1',
    date: '2026-08-20T12:00:00.000Z',
    posts: [
      body({
        group: undefined,
        value: [
          {
            content: 'Grounded draft',
            delay: 0,
            image: [],
            usedCitationIds: ['F1', 'E1'],
          },
        ],
      }),
    ],
  });

  assert.equal(result.created, true);
  assert.equal(database.initial.posts.length, 1);
  assert.equal(database.initial.autoPosts[0].lastUrl, 'snapshot-1');

  const failingDatabase = makeDatabase({ outputFailure: true });
  const failingRepository = repositoryFor(failingDatabase);
  await assert.rejects(
    failingRepository.createAutopostV2DraftAtomic({
      organizationId: 'org-a',
      autoPostId: 'autopost-v2',
      sourceSnapshotId: 'snapshot-1',
      date: '2026-08-20T12:00:00.000Z',
      posts: [
        body({
          group: undefined,
          value: [
            {
              content: 'Grounded draft',
              delay: 0,
              image: [],
              usedCitationIds: ['F1', 'E1'],
            },
          ],
        }),
      ],
    }),
    /forced output failure/
  );
  assert.equal(failingDatabase.initial.posts.length, 0);
  assert.equal(failingDatabase.initial.autoPosts[0].lastUrl, '');
});

test('foreign, missing or tombstoned context fails closed before any post write', async () => {
  for (const scenario of [
    { foreign: true, expected: 'CONTENT_CONTEXT_NOT_FOUND' },
    { removed: true, expected: 'CONTENT_CONTEXT_INVALIDATED' },
    { blocked: true, expected: 'CONTENT_CONTEXT_INVALIDATED' },
    { sourceStale: true, expected: 'CONTENT_CONTEXT_INVALIDATED' },
  ]) {
    const database = makeDatabase(scenario);
    const repository = repositoryFor(database);

    await assert.rejects(
      repository.createOrUpdatePost(
        'draft',
        'org-a',
        '2026-08-20T12:00:00.000Z',
        body(),
        [],
        'WEB'
      ),
      (error) => error.code === scenario.expected
    );
    assert.equal(database.initial.posts.length, 0);
    assert.equal(database.initial.outputs.length, 0);
  }
});

test('provenance failure rolls back the Post instead of leaving a partial draft', async () => {
  const database = makeDatabase({ outputFailure: true });
  const repository = repositoryFor(database);

  await assert.rejects(
    repository.createOrUpdatePost(
      'draft',
      'org-a',
      '2026-08-20T12:00:00.000Z',
      body(),
      [],
      'WEB'
    ),
    /forced output failure/
  );
  assert.equal(database.initial.posts.length, 0);
  assert.equal(database.initial.outputs.length, 0);
  assert.equal(database.initial.draftEvidence.length, 0);
});

test('profile or citations cannot be trusted without a server-issued context id', async () => {
  const database = makeDatabase();
  const repository = repositoryFor(database);

  await assert.rejects(
    repository.createOrUpdatePost(
      'draft',
      'org-a',
      '2026-08-20T12:00:00.000Z',
      body({ contentContextSnapshotId: undefined }),
      [],
      'WEB'
    ),
    (error) => error.code === 'CONTENT_CONTEXT_INPUT_INVALID'
  );
  assert.equal(database.initial.posts.length, 0);
});

test('each thread item persists only its own validated citations', async () => {
  const database = makeDatabase();
  const repository = repositoryFor(database);

  await repository.createOrUpdatePost(
    'draft',
    'org-a',
    '2026-08-20T12:00:00.000Z',
    body({
      usedCitationIds: undefined,
      value: [
        {
          content: 'Fact-based item',
          delay: 0,
          image: [],
          usedCitationIds: ['F1'],
        },
        {
          content: 'Evidence-based item',
          delay: 1,
          image: [],
          usedCitationIds: ['E1'],
        },
      ],
    }),
    [],
    'WEB'
  );

  assert.equal(
    JSON.stringify(
      database.initial.outputs.map((item) => item.usedCitationIds)
    ),
    JSON.stringify([['F1'], ['E1']])
  );
  assert.equal(database.initial.draftEvidence.length, 2);
  assert.notEqual(
    database.initial.draftEvidence[0].postId,
    database.initial.draftEvidence[1].postId
  );
});

test('common citations are rejected for a multi-item thread', async () => {
  const database = makeDatabase();
  await assert.rejects(
    repositoryFor(database).createOrUpdatePost(
      'draft',
      'org-a',
      '2026-08-20T12:00:00.000Z',
      body({
        value: [
          { content: 'First', delay: 0, image: [] },
          { content: 'Second', delay: 1, image: [] },
        ],
      }),
      [],
      'WEB'
    ),
    (error) => error.code === 'CONTENT_CONTEXT_INPUT_INVALID'
  );
  assert.equal(database.initial.posts.length, 0);
});

test('finalization uses frozen fact statement and evidence links after live mutation', async () => {
  const database = makeDatabase({ liveLinksMutated: true });

  await repositoryFor(database).createOrUpdatePost(
    'draft',
    'org-a',
    '2026-08-20T12:00:00.000Z',
    body({ usedCitationIds: ['F1'] }),
    [],
    'WEB'
  );

  assert.equal(
    JSON.stringify(database.initial.outputs[0].usedCitationIds),
    JSON.stringify(['F1'])
  );
  assert.equal(
    JSON.stringify(
      database.initial.draftEvidence.map((item) => item.evidenceId)
    ),
    JSON.stringify(['evidence-1'])
  );
});

test('tampered frozen fact statement fails closed before a post write', async () => {
  const database = makeDatabase({ tamperedFrozenStatement: true });
  await assert.rejects(
    repositoryFor(database).createOrUpdatePost(
      'draft',
      'org-a',
      '2026-08-20T12:00:00.000Z',
      body({ usedCitationIds: ['F1'] }),
      [],
      'WEB'
    ),
    (error) => error.code === 'CONTENT_CONTEXT_INVALIDATED'
  );
  assert.equal(database.initial.posts.length, 0);
});

test('contextless update atomically clears stale typed provenance', async () => {
  const database = makeDatabase({
    existingPostOrganizationId: 'org-a',
    groundedExisting: true,
  });
  await repositoryFor(database).createOrUpdatePost(
    'update',
    'org-a',
    '2026-08-20T12:00:00.000Z',
    body({
      contentContextSnapshotId: undefined,
      brandProfileVersionId: undefined,
      usedCitationIds: undefined,
      value: [
        {
          content: 'Ungrounded edit',
          delay: 0,
          image: [],
          id: 'existing-post',
        },
      ],
    }),
    [],
    'WEB'
  );

  assert.equal(database.initial.posts[0].contentContextSnapshotId, null);
  assert.equal(database.initial.posts[0].brandProfileVersionId, null);
  assert.equal(database.initial.outputs.length, 0);
  assert.equal(database.initial.draftEvidence.length, 0);
});

test('foreign post id and replacement group fail before any tenant write', async () => {
  for (const overrides of [
    {
      database: { existingPostOrganizationId: 'org-b' },
      body: {
        value: [
          { content: 'Attack', delay: 0, image: [], id: 'existing-post' },
        ],
      },
    },
    {
      database: { existingGroupOrganizationId: 'org-b' },
      body: {
        group: 'foreign-group',
        value: [{ content: 'Attack', delay: 0, image: [] }],
      },
    },
  ]) {
    const database = makeDatabase(overrides.database);
    await assert.rejects(
      repositoryFor(database).createOrUpdatePost(
        'update',
        'org-a',
        '2026-08-20T12:00:00.000Z',
        body({
          contentContextSnapshotId: undefined,
          brandProfileVersionId: undefined,
          usedCitationIds: undefined,
          ...overrides.body,
        }),
        [],
        'WEB'
      ),
      (error) => error.code === 'POST_NOT_FOUND' && error.status === 404
    );
    assert.equal(
      database.initial.posts.every((post) => post.deletedAt === null),
      true
    );
  }
});

test('a client-minted post id and group create the post instead of a 404', async () => {
  // `content-factory-next-fn33.49`: the composer generates `value[].id` and
  // `group` before anything is saved, so the first save of a new post carries
  // ids nothing holds yet. Reading them as "an existing post to update" made
  // every new post fail with POST_NOT_FOUND.
  const database = makeDatabase();
  const result = await repositoryFor(database).createOrUpdatePost(
    'draft',
    'org-a',
    '2026-09-04T11:40:00.000Z',
    body({
      contentContextSnapshotId: undefined,
      brandProfileVersionId: undefined,
      usedCitationIds: undefined,
      group: 'utVLUeBV7d',
      value: [
        { content: 'First draft', delay: 0, image: [], id: 'xumBniSw3J' },
      ],
    }),
    [],
    'WEB'
  );

  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].id, 'xumBniSw3J');
  assert.equal(database.initial.posts.length, 1);
  assert.equal(database.initial.posts[0].organizationId, 'org-a');
  assert.equal(database.initial.posts[0].deletedAt, undefined);
});

test('editing a draft that has no verified context saves the edit', async () => {
  // `content-factory-next-fn33.88`: the ordinary case. A post with no
  // provenance is saved again, and the update branch used to answer that by
  // disconnecting both provenance relations — which are composite and carry
  // the post's own required `organizationId`.
  const database = makeDatabase({ existingPostOrganizationId: 'org-a' });

  const result = await repositoryFor(database).createOrUpdatePost(
    'draft',
    'org-a',
    '2026-09-04T11:40:00.000Z',
    body({
      contentContextSnapshotId: undefined,
      brandProfileVersionId: undefined,
      usedCitationIds: undefined,
      value: [
        {
          content: 'Правка участника.',
          delay: 0,
          image: [],
          id: 'existing-post',
        },
      ],
    }),
    [],
    'WEB'
  );

  assert.equal(result.posts[0].id, 'existing-post');
  assert.equal(database.initial.posts.length, 1);
  assert.equal(database.initial.posts[0].content, 'Правка участника.');
  assert.equal(database.initial.posts[0].organizationId, 'org-a');
  assert.equal(database.initial.posts[0].contentContextSnapshotId, null);
  assert.equal(database.initial.posts[0].brandProfileVersionId, null);
});

test('an id deleted inside this organization is still refused', async () => {
  const database = makeDatabase({ existingPostOrganizationId: 'org-a' });
  database.initial.posts[0].deletedAt = new Date();

  await assert.rejects(
    repositoryFor(database).createOrUpdatePost(
      'update',
      'org-a',
      '2026-09-04T11:40:00.000Z',
      body({
        contentContextSnapshotId: undefined,
        brandProfileVersionId: undefined,
        usedCitationIds: undefined,
        value: [
          { content: 'Resurrect', delay: 0, image: [], id: 'existing-post' },
        ],
      }),
      [],
      'WEB'
    ),
    (error) => error.code === 'POST_NOT_FOUND' && error.status === 404
  );
});

const postgresUrl = process.env.POST_CONTENT_CONTEXT_POSTGRES_URL;
if (postgresUrl) {
  let parsed;
  try {
    parsed = new URL(postgresUrl);
  } catch {
    parsed = null;
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const targetOverrideKeys = new Set([
    'host',
    'hostaddr',
    'service',
    'servicefile',
  ]);
  const hasTargetOverride = parsed
    ? [...parsed.searchParams.keys()].some((key) =>
        targetOverrideKeys.has(key.toLowerCase())
      )
    : false;
  if (
    !parsed ||
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !loopbackHosts.has(parsed.hostname) ||
    hasTargetOverride ||
    process.env.CF_DOCKER_CI_DISPOSABLE_POSTGRES !== '1'
  ) {
    throw new Error(
      'POST_CONTENT_CONTEXT_POSTGRES_URL must identify an explicitly marked loopback disposable PostgreSQL database'
    );
  }
}
const postgresSkip = postgresUrl
  ? false
  : 'POST_CONTENT_CONTEXT_POSTGRES_URL is not configured';

test(
  'PostgreSQL rejects foreign post id and group before mutation',
  { skip: postgresSkip },
  async () => {
    const schema = `post_context_${randomUUID().replaceAll('-', '')}`;
    const admin = new Client({ connectionString: postgresUrl });
    const scopedUrl = new URL(postgresUrl);
    scopedUrl.searchParams.set('schema', schema);
    const prisma = new PrismaClient({
      datasources: { db: { url: scopedUrl.toString() } },
    });
    await admin.connect();
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      await admin.query(`
        CREATE TABLE "${schema}"."Post" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "group" text NOT NULL,
          "state" text NOT NULL,
          "deletedAt" timestamptz,
          "parentPostId" text
        )
      `);
      await admin.query(
        `INSERT INTO "${schema}"."Post"
          ("id", "organizationId", "group", "state", "deletedAt", "parentPostId")
         VALUES ($1, $2, $3, 'DRAFT', NULL, NULL),
                ($4, $2, $5, 'DRAFT', NULL, NULL)`,
        [
          'foreign-post',
          'org-b',
          'foreign-post-group',
          'foreign-group-post',
          'foreign-group',
        ]
      );
      const repository = new PostsRepository(
        { model: prisma },
        {},
        {},
        { model: prisma },
        { model: prisma },
        {},
        { model: prisma }
      );
      for (const attack of [
        body({
          contentContextSnapshotId: undefined,
          brandProfileVersionId: undefined,
          usedCitationIds: undefined,
          value: [
            { content: 'Attack', delay: 0, image: [], id: 'foreign-post' },
          ],
        }),
        body({
          contentContextSnapshotId: undefined,
          brandProfileVersionId: undefined,
          usedCitationIds: undefined,
          group: 'foreign-group',
          value: [{ content: 'Attack', delay: 0, image: [] }],
        }),
      ]) {
        await assert.rejects(
          repository.createOrUpdatePost(
            'update',
            'org-a',
            '2026-08-20T12:00:00.000Z',
            attack,
            [],
            'WEB'
          ),
          (error) => error.code === 'POST_NOT_FOUND' && error.status === 404
        );
      }
      const rows = await admin.query(
        `SELECT "id", "deletedAt" FROM "${schema}"."Post" ORDER BY "id"`
      );
      assert.deepEqual(rows.rows, [
        { id: 'foreign-group-post', deletedAt: null },
        { id: 'foreign-post', deletedAt: null },
      ]);
    } finally {
      try {
        await prisma.$disconnect();
      } finally {
        try {
          await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await admin.end();
        }
      }
    }
  }
);

test(
  'PostgreSQL atomically commits or rolls back an AutoPost V2 draft and provenance set',
  { skip: postgresSkip },
  async () => {
    const schema = `post_context_${randomUUID().replaceAll('-', '')}`;
    const runId = randomUUID().replaceAll('-', '');
    const ids = {
      organization: `org-${runId}`,
      integration: `channel-${runId}`,
      profile: `profile-${runId}`,
      profileVersion: `profile-version-${runId}`,
      source: `source-${runId}`,
      snapshot: `snapshot-${runId}`,
      evidence: `evidence-${runId}`,
      assessment: `assessment-${runId}`,
      context: `context-${runId}`,
      contextItem: `context-item-${runId}`,
      autoPost: `autopost-${runId}`,
      rollbackAutoPost: `autopost-rollback-${runId}`,
    };
    const admin = new Client({ connectionString: postgresUrl });
    const scopedUrl = new URL(postgresUrl);
    scopedUrl.searchParams.set('schema', schema);
    const prisma = new PrismaClient({
      datasources: { db: { url: scopedUrl.toString() } },
    });
    const now = new Date();
    const future = new Date(now.getTime() + 86_400_000);
    const repository = new PostsRepository(
      { model: prisma },
      { model: prisma },
      { model: prisma },
      { model: prisma },
      { model: prisma },
      {},
      { model: prisma }
    );
    let adminConnected = false;
    try {
      await admin.connect();
      adminConnected = true;
      await admin.query(`CREATE SCHEMA "${schema}"`);
      execFileSync(
        'pnpm',
        [
          'exec',
          'prisma',
          'db',
          'push',
          '--skip-generate',
          '--schema',
          path.join(
            __dirname,
            '../libraries/nestjs-libraries/src/database/prisma/schema.prisma'
          ),
        ],
        {
          cwd: path.resolve(__dirname, '..'),
          env: { ...process.env, DATABASE_URL: scopedUrl.toString() },
          stdio: 'pipe',
        }
      );
      await prisma.organization.create({
        data: {
          id: ids.organization,
          name: 'Post context PostgreSQL proof',
        },
      });
      await prisma.integration.create({
        data: {
          id: ids.integration,
          internalId: `proof-integration-${runId}`,
          organizationId: ids.organization,
          name: 'Proof integration',
          providerIdentifier: 'proof',
          type: 'social',
          token: 'local-proof-token',
        },
      });
      await prisma.projectBrandProfile.create({
        data: { id: ids.profile, organizationId: ids.organization },
      });
      await prisma.projectBrandProfileVersion.create({
        data: {
          id: ids.profileVersion,
          organizationId: ids.organization,
          profileId: ids.profile,
          versionNumber: 1,
          lifecycle: 'PUBLISHED',
          label: 'Proof voice',
          content: { tone: 'precise' },
          contentDigest: 'profile-digest',
          createdByUserId: 'proof-user',
          updatedByUserId: 'proof-user',
          publishedByUserId: 'proof-user',
          publishedAt: now,
        },
      });
      await prisma.projectBrandProfile.update({
        // The compound unique, not `organizationId` alone. A space stopped
        // holding exactly one avatar on 25.08.2026, and from that day this
        // fixture asked the real client for a unique key that no longer exists
        // — the one proof in this file that runs against PostgreSQL rather than
        // an in-memory stand-in, and the only one that could have said so.
        where: {
          organizationId_id: {
            organizationId: ids.organization,
            id: ids.profile,
          },
        },
        data: { activeVersionId: ids.profileVersion },
      });
      await prisma.contentSource.create({
        data: {
          id: ids.source,
          organizationId: ids.organization,
          kind: 'URL',
          displayName: 'Proof source',
          canonicalKey: `https://example.test/proof/${runId}`,
          canonicalUrl: `https://example.test/proof/${runId}`,
          desiredState: 'ACTIVE',
          healthState: 'FRESH',
          rightsState: 'CONFIRMED',
          robotsState: 'ALLOWED',
          freshUntil: future,
          createdByUserId: 'proof-user',
          updatedByUserId: 'proof-user',
        },
      });
      await prisma.sourceSnapshot.create({
        data: {
          id: ids.snapshot,
          organizationId: ids.organization,
          sourceId: ids.source,
          sequence: 1,
          observedAt: now,
          validatedAt: now,
          freshUntil: future,
          contentHash: 'snapshot-hash',
          parser: 'proof',
          parserVersion: '1',
          normalizedTitle: 'Proof source',
          normalizedText: 'Verified proof evidence',
        },
      });
      await prisma.contentSource.update({
        where: {
          organizationId_id: {
            organizationId: ids.organization,
            id: ids.source,
          },
        },
        data: { currentSnapshotId: ids.snapshot },
      });
      await prisma.sourceEvidence.create({
        data: {
          id: ids.evidence,
          organizationId: ids.organization,
          sourceSnapshotId: ids.snapshot,
          excerpt: 'Verified proof evidence',
          observedAt: now,
          freshUntil: future,
          freshnessStatus: 'FRESH',
          exposure: 'PUBLIC',
        },
      });
      await prisma.contentEvidenceAssessment.create({
        data: {
          id: ids.assessment,
          organizationId: ids.organization,
          evidenceId: ids.evidence,
          trustTier: 'OFFICIAL',
          status: 'ACCEPTED',
          reviewedByUserId: 'proof-user',
          reviewedAt: now,
        },
      });
      await prisma.contentContextSnapshot.create({
        data: {
          id: ids.context,
          organizationId: ids.organization,
          consumer: 'AUTOPOST',
          purpose: 'DRAFT_CREATE',
          queryHash: 'proof-query',
          language: 'en',
          freshnessMode: 'REQUIRE_CURRENT',
          asOf: now,
          expiresAt: future,
          status: 'READY',
          generationPolicy: 'ALLOW_GROUNDED',
          brandProfileVersionId: ids.profileVersion,
          profileContentDigest: 'profile-digest',
          selectedEvidenceCount: 1,
        },
      });
      await prisma.contentContextItem.create({
        data: {
          id: ids.contextItem,
          organizationId: ids.organization,
          contentContextSnapshotId: ids.context,
          ordinal: 0,
          citationId: 'E1',
          evidenceId: ids.evidence,
          inclusionReason: 'accepted-current-evidence',
        },
      });
      for (const id of [ids.autoPost, ids.rollbackAutoPost]) {
        await prisma.autoPost.create({
          data: {
            id,
            organizationId: ids.organization,
            title: 'Proof AutoPost',
            onSlot: false,
            syncLast: false,
            url: `https://example.test/feed/${runId}`,
            lastUrl: '',
            active: true,
            addPicture: false,
            generateContent: true,
            language: 'en',
            contentSourceId: ids.source,
            brandProfileVersionId: ids.profileVersion,
            workflowVersion: 2,
            integrations: JSON.stringify([{ id: ids.integration }]),
          },
        });
      }

      const grounded = body({
        integration: { id: ids.integration },
        group: undefined,
        contentContextSnapshotId: ids.context,
        brandProfileVersionId: ids.profileVersion,
        usedCitationIds: ['E1'],
        value: [
          {
            content: 'Grounded PostgreSQL draft',
            delay: 0,
            image: [],
            usedCitationIds: ['E1'],
          },
        ],
      });
      const committed = await repository.createAutopostV2DraftAtomic({
        organizationId: ids.organization,
        autoPostId: ids.autoPost,
        sourceSnapshotId: ids.snapshot,
        date: now.toISOString(),
        posts: [grounded],
      });
      assert.equal(committed.created, true);
      assert.equal(
        await prisma.post.count({ where: { organizationId: ids.organization } }),
        1
      );
      assert.equal(
        await prisma.contentOutputContext.count({
          where: {
            organizationId: ids.organization,
            validationStatus: 'VALID',
          },
        }),
        1
      );
      assert.equal(
        await prisma.draftEvidence.count({
          where: {
            organizationId: ids.organization,
            evidenceId: ids.evidence,
          },
        }),
        1
      );
      assert.equal(
        (
          await prisma.autoPost.findFirstOrThrow({
            where: { organizationId: ids.organization, id: ids.autoPost },
          })
        ).lastUrl,
        ids.snapshot
      );

      const beforeRollback = {
        posts: await prisma.post.count({
          where: { organizationId: ids.organization },
        }),
        outputs: await prisma.contentOutputContext.count({
          where: { organizationId: ids.organization },
        }),
        evidence: await prisma.draftEvidence.count({
          where: { organizationId: ids.organization },
        }),
      };
      await assert.rejects(
        repository.createAutopostV2DraftAtomic({
          organizationId: ids.organization,
          autoPostId: ids.rollbackAutoPost,
          sourceSnapshotId: ids.snapshot,
          date: now.toISOString(),
          posts: [
            grounded,
            body({
              integration: { id: ids.integration },
              group: undefined,
              contentContextSnapshotId: ids.context,
              brandProfileVersionId: ids.profileVersion,
              usedCitationIds: ['E2'],
              value: [
                {
                  content: 'Invalid second draft',
                  delay: 0,
                  image: [],
                  usedCitationIds: ['E2'],
                },
              ],
            }),
          ],
        }),
        (error) => error.code === 'CONTENT_CONTEXT_CITATIONS_INVALID'
      );
      assert.deepEqual(
        {
          posts: await prisma.post.count({
            where: { organizationId: ids.organization },
          }),
          outputs: await prisma.contentOutputContext.count({
            where: { organizationId: ids.organization },
          }),
          evidence: await prisma.draftEvidence.count({
            where: { organizationId: ids.organization },
          }),
        },
        beforeRollback
      );
      assert.equal(
        (
          await prisma.autoPost.findFirstOrThrow({
            where: {
              organizationId: ids.organization,
              id: ids.rollbackAutoPost,
            },
          })
        ).lastUrl,
        ''
      );
    } finally {
      try {
        await prisma.$disconnect();
      } finally {
        if (adminConnected) {
          try {
            await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          } finally {
            await admin.end();
          }
        }
      }
    }
  }
);
