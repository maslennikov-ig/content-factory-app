const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
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

const upsert = jest.fn();

const { PostsRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
  {
    './publication-store.v106': { PublicationStoreV106: class {} },
    './publication-diagnostic.v110': require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/posts/publication-diagnostic.v110.ts'),
    '@contentfactory/nestjs-libraries/dtos/posts/integration-ids': require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/dtos/posts/integration-ids.ts'),

      // Правило держателя слота (`97dq.57`): без вытесненных версий.
      '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-plan': {
        supersededDraftPostIds: async () => [],
      },
      // Word search in the posts list (odb8.4.1): the real parser.
      '@contentfactory/nestjs-libraries/content-intelligence/search-terms': loadTypeScriptModule(
        'libraries/nestjs-libraries/src/content-intelligence/search-terms.ts'
      ),
      '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize': {
        // Статический импорт с ff7cfe3c (fn33.28.7); этим тестам контекст не нужен.
        validateContentContextForDraft: async () => {
          throw new Error('content context is not part of this test');
        },
        writeContentContextDraftProvenance: async () => undefined,
      },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
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
  }
);

describe('post research source persistence', () => {
  test('serializes cited sources next to every post in the draft', async () => {
    upsert.mockResolvedValue({ id: 'post-1' });
    const repository = new PostsRepository(
      { model: { post: { upsert } } },
      {},
      {},
      { model: { tags: { findMany: jest.fn() } } },
      { model: { tagsPosts: { deleteMany: jest.fn() } } },
      {}
    );
    const researchSources = [
      {
        title: 'Source',
        url: 'https://example.com/article',
        publishedAt: '2026-08-12',
      },
    ];

    await repository.createOrUpdatePost(
      'draft',
      'organization-a',
      '2026-08-13T12:00:00',
      {
        integration: { id: 'channel-a' },
        settings: { __type: 'telegram' },
        researchSources,
        value: [{ content: 'Draft', delay: 0, image: [], id: undefined }],
      },
      [],
      'WEB'
    );

    expect(upsert.mock.calls[0][0].create.researchSources).toBe(
      JSON.stringify(researchSources)
    );
  });
});

test('a ready publication with an existing ID never updates the original post', async () => {
  const id = 'mcp-tg-test';
  const duplicate = Object.assign(new Error('duplicate primary key'), { code: 'P2002' });
  const post = {
    findMany: jest.fn().mockResolvedValue([{ id, organizationId: 'organization-a', deletedAt: null }]),
    create: jest.fn().mockRejectedValue(duplicate),
    upsert: jest.fn(),
  };
  const repository = new PostsRepository({}, {}, {}, {}, {}, {});
  await expect(repository.createOrUpdatePost(
    'now', 'organization-a', '2026-08-13T12:00:00Z',
    {
      integration: { id: 'channel-a' },
      settings: { __type: 'telegram' },
      value: [{ id, content: 'Same request', image: [] }],
    },
    [], 'API', undefined, { post }, { createOnly: true }
  )).rejects.toBe(duplicate);
  expect(post.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id, state: 'QUEUE' }) });
  expect(post.upsert).not.toHaveBeenCalled();
});
