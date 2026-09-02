require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

// `getPosts` (calendar view) and `getPostsList` (list view) are the two
// server-side reads behind `calendar.context.tsx`'s filter. Both must accept
// an optional `editorialStage` and turn it into a Prisma `where` clause —
// this is what content-factory-next-pdbe's point 2 ("по этапу должен работать
// отбор") means on the server half. Neither test touches a database: Prisma
// itself is stubbed, and only the shape of the `where` object handed to
// `findMany`/`count` is inspected.
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
      State: { QUEUE: 'QUEUE', DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ERROR: 'ERROR' },
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
    '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload': {
      safeErrorLedgerPayload: () => ({ message: '{}', body: '{}' }),
    },
  }
);

function repositoryWithSpy(findManyResult = []) {
  const calls = { findMany: [], count: [] };
  const post = {
    findMany: async (args) => {
      calls.findMany.push(args);
      return findManyResult;
    },
    count: async (args) => {
      calls.count.push(args);
      return findManyResult.length;
    },
  };
  const repository = new PostsRepository(
    { model: { post } },
    {},
    {},
    { model: {} },
    { model: {} },
    {},
    undefined
  );
  return { repository, calls };
}

describe('editorial stage filter reaches Prisma', () => {
  it('getPosts (calendar) adds editorialStage to the where clause when given one', async () => {
    const { repository, calls } = repositoryWithSpy();

    await repository.getPosts('org-1', {
      startDate: '2026-09-01',
      endDate: '2026-09-08',
      customer: undefined,
      editorialStage: 'REVIEW',
    });

    expect(calls.findMany).toHaveLength(1);
    expect(calls.findMany[0].where.editorialStage).toBe('REVIEW');
  });

  it('getPosts (calendar) omits editorialStage from the where clause when not given', async () => {
    const { repository, calls } = repositoryWithSpy();

    await repository.getPosts('org-1', {
      startDate: '2026-09-01',
      endDate: '2026-09-08',
      customer: undefined,
    });

    expect(calls.findMany).toHaveLength(1);
    expect('editorialStage' in calls.findMany[0].where).toBe(false);
  });

  it('getPostsList adds editorialStage to the where clause when given one', async () => {
    const { repository, calls } = repositoryWithSpy();

    await repository.getPostsList('org-1', {
      page: 0,
      limit: 20,
      state: 'all',
      editorialStage: 'PLAN',
    });

    expect(calls.findMany).toHaveLength(1);
    expect(calls.findMany[0].where.editorialStage).toBe('PLAN');
    // The count query backing pagination must see the same filter, or the
    // page count would silently disagree with what the page itself shows.
    expect(calls.count).toHaveLength(1);
    expect(calls.count[0].where.editorialStage).toBe('PLAN');
  });

  it('getPostsList omits editorialStage from the where clause when not given', async () => {
    const { repository, calls } = repositoryWithSpy();

    await repository.getPostsList('org-1', {
      page: 0,
      limit: 20,
      state: 'all',
    });

    expect(calls.findMany).toHaveLength(1);
    expect('editorialStage' in calls.findMany[0].where).toBe(false);
  });
});

// Point 5 of the task: the stage has to be honestly written and read on the
// post itself, through the same save path every post already goes through
// (`CreatePostDto` -> `PostsRepository.createOrUpdatePost`).
function repositoryForWrite() {
  const upsertCalls = [];
  const post = {
    upsert: async (args) => {
      upsertCalls.push(args);
      return { id: 'post-1' };
    },
    findMany: async () => [],
    findFirst: async () => null,
    update: async () => ({}),
  };
  const tagsPosts = { deleteMany: async () => ({}) };
  const tags = { findMany: async () => [] };
  const repository = new PostsRepository(
    { model: { post } },
    {},
    {},
    { model: { tags } },
    { model: { tagsPosts } },
    {},
    undefined
  );
  return { repository, upsertCalls };
}

function writeBody(overrides = {}) {
  return {
    integration: { id: 'channel-a' },
    settings: { __type: 'telegram' },
    researchSources: [],
    value: [{ content: 'hello', image: [] }],
    ...overrides,
  };
}

describe('editorial stage is written honestly on save', () => {
  it('a new draft carrying editorialStage writes it on create', async () => {
    const { repository, upsertCalls } = repositoryForWrite();

    await repository.createOrUpdatePost(
      'draft',
      'org-1',
      '2026-09-01',
      writeBody({ editorialStage: 'REVIEW' }),
      [],
      'WEB'
    );

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].create.editorialStage).toBe('REVIEW');
  });

  it('a new draft that sends no editorialStage writes none (stays the schema default)', async () => {
    const { repository, upsertCalls } = repositoryForWrite();

    await repository.createOrUpdatePost(
      'draft',
      'org-1',
      '2026-09-01',
      writeBody(),
      [],
      'WEB'
    );

    expect(upsertCalls).toHaveLength(1);
    expect('editorialStage' in upsertCalls[0].create).toBe(false);
  });

  it('an update that omits editorialStage leaves the post\'s existing stage alone', async () => {
    const { repository, upsertCalls } = repositoryForWrite();

    await repository.createOrUpdatePost(
      'update',
      'org-1',
      '2026-09-01',
      writeBody(),
      [],
      'WEB'
    );

    expect(upsertCalls).toHaveLength(1);
    expect('editorialStage' in upsertCalls[0].update).toBe(false);
  });

  it('an update that sends editorialStage: null explicitly clears the stage', async () => {
    const { repository, upsertCalls } = repositoryForWrite();

    await repository.createOrUpdatePost(
      'update',
      'org-1',
      '2026-09-01',
      writeBody({ editorialStage: null }),
      [],
      'WEB'
    );

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].update.editorialStage).toBe(null);
  });
});
