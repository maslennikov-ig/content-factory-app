const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
    loaded.exports,
    localRequire,
    loaded,
    filename,
    path.dirname(filename)
  );
  return loaded.exports;
}

const { PostsRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': { Post: class {} },
    '@prisma/client': {
      APPROVED_SUBMIT_FOR_ORDER: { NO: 'NO' },
      CreationMethod: { WEB: 'WEB' },
      State: {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': { GetPostsDto: class {} },
    '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': {
      GetPostsListDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': { CreateTagDto: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload': {
      safeErrorLedgerPayload: (value) => value,
    },
  }
);

/**
 * `content-factory-next-jjvz`. A comment was written with the caller's
 * organisation and *any* post id: a signed-in person who knew another
 * workspace's post id could attach comments to it. The same shape as
 * `editTag` and `getMediaById`, closed on 03.09.2026.
 *
 * The fake Prisma honours `where.organizationId` on the post lookup the way
 * the real one does, so a lookup that forgets it finds the foreign post.
 */
const posts = [
  { id: 'post-ours', organizationId: 'org-a', deletedAt: null },
  { id: 'post-theirs', organizationId: 'org-b', deletedAt: null },
  { id: 'post-gone', organizationId: 'org-a', deletedAt: new Date() },
];

const matches = (record, where) =>
  Object.entries(where).every(([key, value]) =>
    key === 'post'
      ? matches(posts.find((post) => post.id === record.postId), value)
      : record[key] === value
  );

const build = (comments) => {
  const post = {
    model: {
      post: {
        findFirst: async ({ where }) => posts.find((p) => matches(p, where)) ?? null,
      },
    },
  };
  const commentsModel = {
    model: {
      comments: {
        create: async ({ data }) => {
          comments.push(data);
          return { id: `comment-${comments.length}`, ...data };
        },
        findMany: async ({ where }) => comments.filter((c) => matches(c, where)),
      },
    },
  };
  return new PostsRepository(post, {}, commentsModel, {}, {}, {});
};

test('a comment lands on a post of the caller organisation', async () => {
  const comments = [];
  const repository = build(comments);

  await repository.createComment('org-a', 'user-1', 'post-ours', 'hello');

  expect(comments).toEqual([
    { organizationId: 'org-a', userId: 'user-1', postId: 'post-ours', content: 'hello' },
  ]);
});

test('a comment on another organisation post is refused and nothing is written', async () => {
  const comments = [];
  const repository = build(comments);

  await expect(
    repository.createComment('org-a', 'user-1', 'post-theirs', 'hello')
  ).rejects.toThrow();
  expect(comments).toEqual([]);
});

test('a comment on a deleted post is refused', async () => {
  const comments = [];
  const repository = build(comments);

  await expect(
    repository.createComment('org-a', 'user-1', 'post-gone', 'hello')
  ).rejects.toThrow();
  expect(comments).toEqual([]);
});

test('the public comment list is empty for a deleted post', async () => {
  const comments = [
    { organizationId: 'org-a', userId: 'u', postId: 'post-gone', content: 'x' },
  ];
  const repository = build(comments);

  expect(await repository.getComments('post-gone')).toEqual([]);
});
