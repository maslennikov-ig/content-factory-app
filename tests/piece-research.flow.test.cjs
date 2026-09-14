'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence';
let responses, modelCalls;
const mocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getChatModel: async (_org, _temp, _limit, role) => ({ withStructuredOutput: () => ({
      invoke: async (prompt) => {
        modelCalls.push({ role, prompt });
        const value = responses.shift();
        if (value instanceof Error) throw value;
        if (!value) throw new Error('Unexpected model call');
        return value;
      },
    }) }),
  },
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  '../search/text-search.service': { TextSearchService: class {} },
  './piece.repository': { PieceRepository: class {} },
};
const { IntakeService } = loadWithMocks(`${base}/intake/intake.service.ts`, mocks);
const { PieceService } = loadWithMocks(`${base}/pieces/piece.service.ts`, {
  ...mocks, '../intake/intake.service': { IntakeService },
});
const url = 'https://example.org/study';
const excerpt = 'Productivity remained the same or improved in the majority of workplaces.';
let piece, repo, research, intake, service, snapshots, storage;
beforeEach(() => {
  modelCalls = [];
  responses = [
    { verdicts: [], findings: [{ statement: 'Производительность сохранилась или выросла.', evidenceId: 'ev-study', quote: excerpt }] },
    { text: 'Мне важен результат работы. Исследование показывает, что производительность сохранилась или выросла.' },
  ];
  piece = { id: 'p', organizationId: 'org', kind: 'CORE', archivedAt: null,
    title: 'Рабочая неделя', body: 'Мне важен результат работы.',
    brief: { version: 'piece-core/v1', answers: [], personText: 'Мне важен результат работы.',
      authorNumbers: false, questions: { round: 1, items: [], answered: [] }, customMetadata: 'keep',
      brief: { inputKind: 'thought', thesis: 'Мне важен результат работы.', position: 'Результат важнее часов.',
        goal: null, disagreement: null, audience: null, origins: {}, facts: [], ungrounded: [] } },
  };
  repo = { getPiece: jest.fn(async (org, id) => org === 'org' && id === 'p' ? JSON.parse(JSON.stringify(piece)) : null),
    acceptCoreReview: jest.fn(async (_org, _id, snapshot, body, title, brief) => {
      if (snapshot.body !== piece.body || JSON.stringify(snapshot.brief) !== JSON.stringify(piece.brief)) throw new Error('stale');
      Object.assign(piece, { body, title, brief }); return { body, title };
    }),
  };
  const usage = { executeAiOperation: async (_org, _op, callback) => callback() };
  research = { research: jest.fn(async () => ({ provider: 'exa', facts: [{ text: excerpt, sourceUrl: url }],
    sources: [{ url, title: 'Study', provider: 'exa' }] })) };
  intake = new IntakeService({}, research, {
    acceptSearchResult: async () => ({ evidenceId: 'ev-study', url, title: 'Study', excerpt }),
  }, {}, {}, {}, {}, {}, {}, usage);
  storage = new Map();
  snapshots = { get: async key => storage.get(key), set: async (key, value) => storage.set(key, value), del: async key => storage.delete(key) };
  service = new PieceService(repo, {}, {}, undefined, () => null, usage, {}, null, null, null, intake, snapshots);
});
const start = () => service.researchCore('org', 'p', 'user', { confirmWebSpend: true }, 'ru');
const accept = (preview, selectedKeys = preview.facts.filter(f => f.selected).map(f => f.factKey)) =>
  service.acceptCoreResearch('org', 'p', 'user', { snapshotKey: preview.snapshotKey, selectedKeys });

test('recorded search → digest → saved findings → writer; continuation never repeats paid search', async () => {
  const preview = await start();
  expect(preview.version).toBe('piece-research/v1');
  expect(preview.level).toBe('standard');
  expect(preview.input).toBe(piece.body);
  expect(preview.facts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'found', quote: excerpt, sourceUrl: url, selected: true })]));
  expect(modelCalls.map(c => c.role)).toEqual(['review']);
  expect(repo.acceptCoreReview).not.toHaveBeenCalled();
  await accept(preview);
  expect(research.research).toHaveBeenCalledTimes(1);
  expect(research.research).toHaveBeenCalledWith('org', 'Мне важен результат работы.', { language: 'ru', level: 'standard' });
  expect(modelCalls.map(c => c.role)).toEqual(['review', 'draft']);
  expect(modelCalls[1].prompt).toContain('Мне важен результат работы.');
  expect(modelCalls[1].prompt).toContain('Производительность сохранилась или выросла.');
  expect(piece.body).toContain('Исследование показывает');
  expect(piece.brief.customMetadata).toBe('keep');
  expect(piece.brief.authorNumbers).toBe(false);
  expect(piece.brief.questions.items).toEqual([]);
  await expect(accept(preview)).rejects.toMatchObject({ code: 'PIECE_RESEARCH_EXPIRED' });
  expect(research.research).toHaveBeenCalledTimes(1);
});

test('foreign actor, expired snapshot, and edited core fail without repeat search or writer', async () => {
  const preview = await start();
  await expect(service.acceptCoreResearch('org', 'p', 'other', { snapshotKey: preview.snapshotKey, selectedKeys: [] })).rejects.toMatchObject({ status: 409 });
  piece.body = 'Правка из другой вкладки.';
  await expect(accept(preview)).rejects.toMatchObject({ code: 'PIECE_RESEARCH_STALE' });
  storage.clear();
  await expect(accept(preview)).rejects.toMatchObject({ code: 'PIECE_RESEARCH_EXPIRED' });
  expect(modelCalls).toHaveLength(1);
  expect(research.research).toHaveBeenCalledTimes(1);
  expect(repo.acceptCoreReview).not.toHaveBeenCalled();
});

test('no storage, missing explicit spend, or missing tenant piece fail before search', async () => {
  await expect(service.researchCore('org', 'p', 'user', {}, 'ru')).rejects.toMatchObject({ status: 400 });
  await expect(service.researchCore('other', 'p', 'user', { confirmWebSpend: true }, 'ru')).rejects.toMatchObject({ status: 404 });
  service.snapshots = null;
  await expect(start()).rejects.toMatchObject({ status: 503 });
  expect(research.research).not.toHaveBeenCalled();
});

test('deselected finding is not fed to writer; writer failure preserves existing core', async () => {
  const before = structuredClone(piece);
  const preview = await start();
  responses = [new Error('recorded model failure')];
  await expect(accept(preview, [])).rejects.toMatchObject({ code: 'PIECE_RESEARCH_WRITE_FAILED' });
  expect(modelCalls.at(-1).prompt).not.toContain('Производительность сохранилась или выросла.');
  expect(piece).toEqual(before);
  expect(repo.acceptCoreReview).not.toHaveBeenCalled();
});

test('research is rejected by both review entrypoints before any paid call', async () => {
  await expect(service.reviewV2('org', 'p', undefined, { mode: 'research', confirmWebSpend: true }, 'ru')).rejects.toMatchObject({ status: 400 });
  await expect(service.reviewAdaptation('org', 'p', 'a', 'research', 'ru', true)).rejects.toMatchObject({ status: 400 });
  expect(research.research).not.toHaveBeenCalled();
  expect(modelCalls).toHaveLength(0);
});

test('research DTOs require explicit intent and reject invalid snapshot IDs', async () => {
  const { validate } = require('class-validator');
  const { PieceResearchDto, PieceResearchAcceptDto } = loadWithMocks('libraries/nestjs-libraries/src/dtos/content-intelligence/piece-research.dto.ts', {});
  expect(await validate(Object.assign(new PieceResearchDto(), { confirmWebSpend: true }))).toHaveLength(0);
  expect(await validate(new PieceResearchDto())).not.toHaveLength(0);
  expect(await validate(Object.assign(new PieceResearchAcceptDto(), { snapshotKey: '../other', selectedKeys: [] }))).not.toHaveLength(0);
});
