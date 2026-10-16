const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { PieceRepository } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/pieces/piece.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
  '../materials/content-material.repository': { ContentMaterialRepository: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});
test('chooser reads bounded metadata, maintains stable pagination, scopes cursor and search to organization', async () => {
  const createdAt = new Date('2026-10-16T09:00:00Z');
  const client = { contentPiece: {
    findFirst: jest.fn(async () => ({ id: 'p4', createdAt })),
    findMany: jest.fn(async () => [{ id: 'p3' }, { id: 'p2' }, { id: 'p1' }]),
  } };
  const repo = new PieceRepository({ model: client }, {}, {});
  const result = await repo.browsePieces('org-a', { q: 'example', cursor: 'p4', limit: 2 });
  expect(client.contentPiece.findFirst.mock.calls[0][0].where).toEqual({ organizationId: 'org-a', id: 'p4' });
  const query = client.contentPiece.findMany.mock.calls[0][0];
  expect(query.take).toBe(3);
  expect(query.where.organizationId).toBe('org-a');
  expect(query.where.title).toEqual({ contains: 'example', mode: 'insensitive' });
  expect(query.select.body).toBeUndefined();
  expect(query.select.brief).toBeUndefined();
  expect(query.where.OR).toEqual([{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 'p4' } }]);
  expect(result).toEqual({ items: [{ id: 'p3' }, { id: 'p2' }], cursor: 'p2', hasMore: true });
  client.contentPiece.findFirst.mockResolvedValueOnce(null);
  client.contentPiece.findMany.mockClear();
  expect(await repo.browsePieces('org-b', { cursor: 'p4' })).toEqual({ items: [], cursor: null, hasMore: false });
  expect(client.contentPiece.findMany).not.toHaveBeenCalled();
});
