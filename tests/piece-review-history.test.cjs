'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const root = 'libraries/nestjs-libraries/src/content-intelligence/pieces';
const fixedNow = new Date('2026-10-17T10:00:00.000Z');
const clients = {
  getModelForRole: async () => 'review-model',
  getOpenAiClient: async () => ({ chat: { completions: { create: async () => ({}) } } }),
};
const serviceMocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': clients,
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': {
    AgentGraphService: class {},
  },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': {
    IntegrationManager: class {},
  },
  './piece.repository': { PieceRepository: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
    AiUsageService: class {},
  },
  '../search/text-search.service': { TextSearchService: class {} },
};
const { PieceService } = loadWithMocks(`${root}/piece.service.ts`, serviceMocks);
const { PieceRepository } = loadWithMocks(`${root}/piece.repository.ts`, {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class {},
  },
  '../materials/content-material.repository': {
    ContentMaterialRepository: class {},
  },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});
const { signReview } = loadWithMocks(`${root}/review.v3.ts`, {
  '@contentfactory/nestjs-libraries/openai/ai.clients': clients,
});

const originalBody = 'Это точный текст сути до переписывания.';
const previousRevisions = Array.from({ length: 20 }, (_, index) => ({
  text: `Предыдущая редакция ${index + 1}.`,
  writtenBy: index === 0 ? 'model' : index % 2 ? 'person' : 'fallback',
  replacedAt: `2026-10-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
}));

function initialPiece() {
  return {
    organizationId: 'org',
    id: 'piece',
    kind: 'CORE',
    body: originalBody,
    title: 'Тема',
    brief: {
      brief: { facts: [] },
      writtenBy: 'model',
      editedBy: 'person',
      editedAt: '2026-10-16T09:00:00.000Z',
      materialPending: true,
      revisions: previousRevisions,
    },
  };
}

function database(initial) {
  let row = structuredClone(initial);
  const updateMany = jest.fn(async ({ where, data }) => {
    if (
      row.organizationId !== where.organizationId ||
      row.id !== where.id ||
      row.body !== where.body ||
      row.title !== where.title ||
      JSON.stringify(row.brief) !== JSON.stringify(where.brief.equals)
    )
      return { count: 0 };

    row = { ...row, ...data };
    return { count: 1 };
  });
  const repository = new PieceRepository(
    { model: { contentPiece: { updateMany } } },
    {},
    {}
  );
  return {
    repository,
    updateMany,
    get: () => row,
    set: (next) => {
      row = next;
    },
  };
}

function reviewToken(piece, changes) {
  return signReview({
    version: 'adaptation-review/v3',
    language: 'ru',
    organizationId: 'org',
    pieceId: 'piece',
    expires: Date.now() + 60_000,
    originalText: piece.body,
    text: piece.body,
    title: piece.title,
    changes,
    verdict: 'review',
    summary: '',
    slopBefore: 0,
    slopAfter: 0,
    pieceSnapshot: {
      body: piece.body,
      brief: structuredClone(piece.brief),
      title: piece.title,
    },
  });
}

function serviceFor(repository) {
  return new PieceService(
    repository,
    {},
    { getSocialIntegration: jest.fn() },
    () => fixedNow,
    null,
    { executeAiOperation: jest.fn(async (_org, _operation, run) => run()) }
  );
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-piece-review-history-key';
});

test('accepted core rewrite appends the exact replaced text and preserves provenance and prior history', async () => {
  const piece = initialPiece();
  const db = database(piece);
  const service = serviceFor(db.repository);
  const token = reviewToken(piece, [
    {
      id: 'body',
      excerpt: originalBody,
      replacement: 'Новая суть после проверки.',
      why: 'Текст стал яснее.',
      basket: 'show',
      target: 'body',
    },
  ]);

  await service.acceptReviewV2('org', 'piece', undefined, {
    token,
    selectedIds: ['body'],
  });

  expect(db.get().body).toBe('Новая суть после проверки.');
  expect(db.get().brief.revisions).toEqual([
    previousRevisions[0],
    ...previousRevisions.slice(-18),
    {
      text: originalBody,
      writtenBy: 'person',
      replacedAt: fixedNow.toISOString(),
      materialPending: true,
    },
  ]);
  expect(db.get().brief.revisions).toHaveLength(20);
  expect(db.get().brief).toMatchObject({ writtenBy: 'model', materialPending: true });
  expect(db.updateMany).toHaveBeenCalledTimes(1);
  expect(db.updateMany.mock.calls[0][0].where).toMatchObject({
    body: originalBody,
    title: 'Тема',
    brief: { equals: piece.brief },
  });
});

test('accepted legacy core with null brief keeps its body and uses native defaults for history', async () => {
  const piece = initialPiece();
  piece.brief = null;
  const db = database(piece);
  const service = serviceFor(db.repository);
  const token = reviewToken(piece, [
    {
      id: 'body',
      excerpt: originalBody,
      replacement: 'Новая суть старой заготовки.',
      why: 'Текст стал яснее.',
      basket: 'show',
      target: 'body',
    },
  ]);

  await service.acceptReviewV2('org', 'piece', undefined, {
    token,
    selectedIds: ['body'],
  });

  expect(db.get().body).toBe('Новая суть старой заготовки.');
  expect(db.get().brief.revisions).toEqual([
    {
      text: originalBody,
      writtenBy: 'model',
      replacedAt: fixedNow.toISOString(),
      materialPending: false,
    },
  ]);
  expect(db.updateMany.mock.calls[0][0].where.brief.equals).toBeNull();
});

test.each([
  [
    'title-only change',
    (piece) => [
      {
        id: 'title',
        excerpt: piece.title,
        replacement: 'Новая тема',
        why: 'Точнее.',
        basket: 'show',
        target: 'title',
      },
    ],
    ['title'],
  ],
  [
    'no-op body change',
    () => [
      {
        id: 'same',
        excerpt: originalBody,
        replacement: originalBody,
        why: 'Без изменения.',
        basket: 'show',
        target: 'body',
      },
    ],
    ['same'],
  ],
  [
    'declined body change',
    () => [
      {
        id: 'body',
        excerpt: originalBody,
        replacement: 'Отклонённая суть.',
        why: 'Исправление.',
        basket: 'show',
        target: 'body',
      },
    ],
    [],
  ],
])('%s does not create a body revision', async (_label, makeChanges, selectedIds) => {
  const piece = initialPiece();
  const db = database(piece);
  const service = serviceFor(db.repository);
  const token = reviewToken(piece, makeChanges(piece));

  await service.acceptReviewV2('org', 'piece', undefined, { token, selectedIds });

  expect(db.get().brief.revisions).toEqual(previousRevisions);
});

test('stale core snapshot rejects the write and leaves history untouched', async () => {
  const piece = initialPiece();
  const db = database(piece);
  const service = serviceFor(db.repository);
  const token = reviewToken(piece, [
    {
      id: 'body',
      excerpt: originalBody,
      replacement: 'Новая суть.',
      why: 'Текст стал яснее.',
      basket: 'show',
      target: 'body',
    },
  ]);
  db.set({
    ...db.get(),
    brief: { ...db.get().brief, personText: 'Параллельное изменение.' },
  });
  const before = structuredClone(db.get());

  await expect(
    service.acceptReviewV2('org', 'piece', undefined, {
      token,
      selectedIds: ['body'],
    })
  ).rejects.toMatchObject({ status: 409 });

  expect(db.get()).toEqual(before);
  expect(db.get().brief.revisions).toEqual(previousRevisions);
  expect(db.updateMany).toHaveBeenCalledTimes(1);
});
