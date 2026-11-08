'use strict';
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { GetPostsDto } = loadWithMocks('libraries/nestjs-libraries/src/dtos/posts/get.posts.dto.ts');
const { GetPostsListDto } = loadWithMocks('libraries/nestjs-libraries/src/dtos/posts/get.posts.list.dto.ts');
const { PostsRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {}, PrismaTransaction: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-plan': { supersededDraftPostIds: async () => [] },
});

test('calendar and list parse comma or repeated ids and reject malformed/oversized input', () => {
  for (const Dto of [GetPostsDto, GetPostsListDto]) {
    const base = { startDate: '2026-11-01', endDate: '2026-11-07' };
    for (const value of [' a, b ', ['a', 'b']]) {
      const dto = plainToInstance(Dto, { ...base, integrationIds: value });
      expect(dto.integrationIds).toEqual(['a', 'b']);
      expect(validateSync(dto)).toEqual([]);
    }
    for (const value of [7, ['a', 4], Array.from({ length: 201 }, () => 'a')]) {
      expect(validateSync(plainToInstance(Dto, { ...base, integrationIds: value })).length).toBeGreaterThan(0);
    }
  }
});

function fixture() {
  const findMany = jest.fn(async () => []);
  const count = jest.fn(async () => 125);
  const repository = new PostsRepository({ model: { post: { findMany, count }, contentPiece: { findMany: async () => [] } } }, {}, {}, {}, {}, {}, undefined);
  return { repository, findMany, count };
}

test('calendar sends selected ids to Prisma alongside tenant, project, stage and UTC window', async () => {
  const { repository, findMany } = fixture();
  await repository.getPosts('org-a', { startDate: '2026-11-01T21:00:00Z', endDate: '2026-11-07T20:59:59Z', customer: 'project-a', editorialStage: 'REVIEW', integrationIds: ['a', 'foreign'] });
  const { where } = findMany.mock.calls[0][0];
  expect(where.integration).toEqual({ organizationId: 'org-a', deletedAt: null, customerId: 'project-a', id: { in: ['a', 'foreign'] } });
  expect(where.editorialStage).toBe('REVIEW');
  expect(where.AND[1].OR[0].publishDate.gte.toISOString()).toBe('2026-11-01T21:00:00.000Z');
  expect(where.AND[0].OR).toEqual([{ organizationId: 'org-a' }]);
});

test('paginated list and count use the same selected-id predicate and keep legacy id narrowing', async () => {
  const { repository, findMany, count } = fixture();
  findMany.mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({ id: `post-${index}` })));
  const result = await repository.getPostsList('org-a', { page: 1, limit: 100, state: 'published', customer: 'project-a', editorialStage: 'REVIEW', integrationId: 'b', integrationIds: ['a', 'b'] });
  const args = findMany.mock.calls[0][0];
  expect(args.where).toBe(count.mock.calls[0][0].where);
  expect(args.where.integration).toEqual({ organizationId: 'org-a', deletedAt: null, customerId: 'project-a', id: { in: ['a', 'b'], equals: 'b' } });
  expect(args.where.state).toBe('PUBLISHED');
  expect(args.where.editorialStage).toBe('REVIEW');
  expect(args.skip).toBe(100);
  expect(result.total).toBe(125);
  expect(result.hasMore).toBe(false);
});

test('empty multiselect means all channels while the legacy single filter still works', async () => {
  const { repository, findMany } = fixture();
  await repository.getPostsList('org-a', { state: 'scheduled', integrationIds: [] });
  expect(findMany.mock.calls[0][0].where.integration.id).toBeUndefined();
  await repository.getPostsList('org-a', { state: 'scheduled', integrationId: 'legacy' });
  expect(findMany.mock.calls[1][0].where.integration.id).toBe('legacy');
});

test('calendar and list retain persisted diagnostics through the shared API minification boundary',async()=>{
 const {repository,findMany}=fixture();
 const error='Результат публикации не подтверждён. Проверьте публикацию в канале; автоматическая повторная отправка заблокирована.';
 const row={id:'synthetic-post',publishDate:new Date('2026-11-01T12:00:00Z'),state:'ERROR',error,integration:{providerIdentifier:'vk'}};
 findMany.mockImplementation(async({select})=>[row,{...row,id:'old-post',error:'Bearer private-token private-caption'}].map(post=>Object.fromEntries(Object.entries(post).filter(([key])=>select[key]))));
 const calendar=await repository.getPosts('org-a',{startDate:'2026-11-01',endDate:'2026-11-07'});
 const list=await repository.getPostsList('org-a',{page:0,limit:10,state:'all'});
 const {minifyPosts,expandPosts}=loadWithMocks('libraries/helpers/src/utils/posts.list.minify.ts');
 expect(calendar[0].error).toBe(error);
 expect(list.posts[0].error).toBe(error);
 expect(expandPosts(minifyPosts({posts:calendar})).posts[0].error).toBe(error);
 expect(calendar[1].error).toBeNull();expect(list.posts[1].error).toBeNull();
 expect(JSON.stringify(minifyPosts({posts:calendar}))).not.toMatch(/private-token|private-caption/);
});
