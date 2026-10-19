'use strict';

/** Native question-answer/rebuild persistence with the real versioned writer. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const root = 'libraries/nestjs-libraries/src/content-intelligence/pieces';
const clone = value => JSON.parse(JSON.stringify(value));
const NOW = new Date('2026-10-18T09:00:00.000Z');
const TITLE = 'Два способа согласования: факты и наш опыт';
const QUESTION = 'Как изменилось обсуждение спорных мест в вашей команде?';
const AUTHOR_REPLY = 'Ревью стало короче, а спорные места мы обсуждаем асинхронноо.';
const FIRST_BODY = 'Последовательный режим требует отдельного согласования. Спорные места мы теперь обсуждаем асинхронно.';
const REBUILT_BODY = 'Для последовательного режима требуется подтверждение каждого шага. Наше ревью стало короче; спорные места обсуждаем асинхронно.';
const request = () => ({ version: 'intake-request/v1',
  goal: 'Сопоставить документированные способы согласования и добавить наш реальный опыт.',
  requestedOutputs: ['одна заготовка'],
  materials: [
    { role: 'author_material', origin: 'user', text: 'Мы сравнили два способа согласования.' },
    { role: 'reference', origin: 'selected_object', text: 'В исходной заметке сравниваются последовательный и параллельный режимы.' },
  ],
  evidenceNeeds: ['Документированные условия согласования'],
  constraints: { research: 'required', title: TITLE, requirements: ['Не придумывать личные результаты'] },
});
const selection = { origin: 'model', selectedKeys: ['source-approval:fact-1'], selectedAt: NOW.toISOString() };
const summary = { confirmed: 0, conflicting: 0, unverified: 0, found: 1, sources: 1, encyclopedic: 0,
  status: 'sufficient', requestedScope: { goal: request().goal, evidenceNeeds: request().evidenceNeeds },
  assessment: { status: 'sufficient', summary: 'Условия подтверждены источником.', coveredNeeds: ['Условия согласования'], gaps: [], suggestedQueries: [] }, gaps: [] };
const storedCore = () => ({ version: 'piece-core/v1', brief: {
  inputKind: 'instruction', goal: request().goal, thesis: 'Сравнение способов согласования',
  position: null, disagreement: null, audience: 'руководители команд', format: 'auto',
  origins: { thesis: 'model', audience: 'model' }, ungrounded: [],
  facts: [{ factKey: 'source-approval:fact-1', evidenceId: 'source-approval', kind: 'found', origin: 'search',
    statement: 'Последовательный режим требует подтверждения каждой операции.', sourceUrl: 'https://official.example/approval',
    quote: 'The sequential mode requires explicit approval before each operation.', verified: true, status: 'confirmed', selected: true }],
}, answers: [], questions: { round: 0, items: [{ field: 'facts', key: 'ask-1', question: QUESTION, suggested: null }], answered: [] },
slop: null, writtenBy: 'fallback', authorNumbers: false, personText: 'Мы сравнили два способа согласования.',
inputText: 'Сопоставь способы согласования и добавь наш реальный опыт.',
instructionText: request().goal, keepLinks: [] });

let modelAnswers;
const prompts = [];
const writers = [];
const chat = { getChatModel: async (_org, _temperature, _tokens, role) => ({ withStructuredOutput: () => ({ invoke: async prompt => {
  prompts.push({ role, prompt });
  if (!modelAnswers.length) throw new Error('Unexpected model call');
  return modelAnswers.shift();
} }) }) };
const nativeWriter = loadWithMocks(`${root}/core-write.ts`, {
  '@contentfactory/nestjs-libraries/openai/ai.clients': chat,
});
const recordWriter = (name, operation) => async (input, deps) => {
  const call = { name, input: clone(input) };
  writers.push(call);
  const result = await operation(input, deps);
  call.output = clone(result);
  return result;
};
const { PieceService } = loadWithMocks(`${root}/piece.service.ts`, {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.clients': { WEB_SEARCH_MAX_SOURCE_CHARS: 8_000, ...chat },
  './piece.repository': { PieceRepository: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  './core-write': { ...nativeWriter,
    writeCore: recordWriter('writeCore', nativeWriter.writeCore),
    writeCoreWithDecisions: recordWriter('writeCoreWithDecisions', nativeWriter.writeCoreWithDecisions),
  },
});

const build = ({ meaningField = 'request', legacy = false, titleEdited = false } = {}) => {
  const brief = storedCore();
  if (!legacy) Object.assign(brief, { [meaningField]: request(), researchSelection: clone(selection), researchSummary: clone(summary) });
  if (titleEdited) brief.titleEdited = true;
  const piece = { id: 'piece-1', title: titleEdited ? 'Заголовок, исправленный автором' : TITLE,
    kind: 'CORE', body: '', brief: clone(brief), language: 'ru', tags: null, archivedAt: null,
    createdAt: new Date('2026-10-17T10:00:00.000Z'), brandProfileVersion: null };
  const saved = { answers: [], rebuilds: [] };
  const checkSnapshot = expected => {
    assert.equal(expected.body, piece.body);
    assert.deepEqual(expected.brief, piece.brief);
  };
  const repository = {
    getPiece: async (organizationId, pieceId) => organizationId === 'org' && pieceId === piece.id ? piece : null,
    listPieceIds: async () => [{ id: piece.id }], listIntegrations: async () => [], adaptationsByPiece: async () => [],
    acceptCoreReview: async (organizationId, pieceId, expected, body, title, nextBrief) => {
      assert.equal(organizationId, 'org'); assert.equal(pieceId, piece.id); assert.equal(expected.title, piece.title); checkSnapshot(expected);
      const update = clone({ body, title, brief: nextBrief });
      saved.rebuilds.push(update);
      Object.assign(piece, update);
      return { body, title };
    },
  };
  const briefs = { updateCore: async (organizationId, pieceId, input) => {
    assert.equal(organizationId, 'org'); assert.equal(pieceId, piece.id); checkSnapshot(input.expected);
    const update = clone(input);
    saved.answers.push(update);
    Object.assign(piece, { body: update.body, brief: update.brief, ...(update.title ? { title: update.title } : {}) });
  } };
  const service = new PieceService(repository, { start: async function* () {} }, { getSocialIntegration: () => undefined },
    () => NOW, () => null, { executeAiOperation: async (_org, _operation, callback) => callback() }, briefs, null, null, null, null);
  return { service, piece, saved };
};
const drain = async iterable => { const events = []; for await (const event of iterable) events.push(event); return events; };
const answer = async service => {
  const plan = await service.prepareAnswer('org', 'piece-1', { answers: [{ key: 'ask-1', text: AUTHOR_REPLY }] }, 'ru');
  const events = await drain(service.answer('org', plan, 'user'));
  expect(events.some(event => event.name === 'error')).toBe(false);
  return { plan, events, core: events.find(event => event.name === 'piece').core };
};
beforeEach(() => { modelAnswers = [{ text: FIRST_BODY }, { text: REBUILT_BODY }]; prompts.length = 0; writers.length = 0; });

test.each(['request', 'requestUnderstanding'])('native author answer and rebuild retain saved %s, research provenance and explicit title', async meaningField => {
  const { service, piece, saved } = build({ meaningField });
  // Read the actual native pending-question record through the public service.
  const before = await service.detail('org', 'piece-1', 'ru');
  expect(before.core.questions.items).toEqual([{ field: 'facts', key: 'ask-1', question: QUESTION, suggested: null }]);
  expect(before.core.request).toEqual(request());
  const answered = await answer(service);
  expect(answered.plan.core.text).toBe('');
  expect(writers[0].name).toBe('writeCoreWithDecisions');
  expect(writers[0].input.request).toEqual(request());
  expect(writers[0].input.answers).toEqual([expect.objectContaining({ key: 'ask-1', text: AUTHOR_REPLY, question: QUESTION, origin: 'person' })]);
  expect(writers[0].output.core.request).toEqual(request());
  expect(saved.answers).toHaveLength(1);
  expect(saved.answers[0].title).toBe(TITLE);
  expect(piece.title).toBe(TITLE);
  expect(piece.body).toBe(FIRST_BODY);
  expect(piece.brief.request).toEqual(request());
  expect(piece.brief.researchSelection).toEqual(selection);
  expect(piece.brief.researchSummary).toEqual(summary);
  expect(piece.brief.questions.items).toEqual([]);
  expect(piece.brief.questions.answered).toContainEqual(expect.objectContaining({ key: 'ask-1', text: AUTHOR_REPLY, origin: 'person' }));
  expect(answered.core).toMatchObject({ request: request(), researchSelection: selection, researchSummary: summary });
  expect(prompts[0].prompt).toContain('PROMPT VERSION: core-write/v19');
  expect(prompts[0].prompt).toContain(request().goal);
  expect(prompts[0].prompt).toContain(AUTHOR_REPLY);
  expect(prompts[0].prompt).toContain('https://official.example/approval');

  const rebuilt = await service.rebuildCore('org', 'piece-1', 'ru');
  expect(rebuilt).toEqual({ text: REBUILT_BODY, revisions: 1 });
  expect(writers[1].name).toBe('writeCore');
  expect(writers[1].input.request).toEqual(request());
  expect(writers[1].input.rebuildFrom).toEqual({ text: FIRST_BODY, byPerson: false });
  expect(writers[1].input.answers).toContainEqual(expect.objectContaining({ text: AUTHOR_REPLY, origin: 'person' }));
  expect(writers[1].output.request).toEqual(request());
  expect(saved.rebuilds).toHaveLength(1);
  expect(saved.rebuilds[0].brief).toMatchObject({ request: request(), researchSelection: selection, researchSummary: summary });
  expect(piece.title).toBe(TITLE);
  expect(piece.body).toBe(REBUILT_BODY);
  expect(piece.brief.revisions).toEqual([expect.objectContaining({ text: FIRST_BODY, writtenBy: 'model' })]);
  const reread = await service.detail('org', 'piece-1', 'ru');
  expect(reread.core).toMatchObject({ request: request(), researchSelection: selection, researchSummary: summary });
  expect(prompts.map(call => call.role)).toEqual(['draft', 'draft']);
  expect(prompts[1].prompt).toContain('PROMPT VERSION: core-write/v19');
  expect(prompts[1].prompt).toContain(AUTHOR_REPLY);
});

test('the original requested title cannot replace a later title edited by the author', async () => {
  const { service, piece, saved } = build({ titleEdited: true });
  await answer(service);
  expect(piece.title).toBe('Заголовок, исправленный автором');
  expect(saved.answers[0]).not.toHaveProperty('title');
  expect(piece.brief.titleEdited).toBe(true);
  expect(piece.brief.request.constraints.title).toBe(TITLE);
  await service.rebuildCore('org', 'piece-1', 'ru');
  expect(piece.title).toBe('Заголовок, исправленный автором');
});

test('legacy native cores remain answerable and rebuildable without manufacturing new request or research fields', async () => {
  const { service, piece, saved } = build({ legacy: true });
  const answered = await answer(service);
  expect(writers[0].input).not.toHaveProperty('request');
  expect(writers[0].output.core).not.toHaveProperty('request');
  expect(answered.core.request).toBeUndefined();
  for (const field of ['request', 'researchSelection', 'researchSummary']) expect(saved.answers[0].brief).not.toHaveProperty(field);
  await service.rebuildCore('org', 'piece-1', 'ru');
  expect(writers[1].input).not.toHaveProperty('request');
  expect(writers[1].output).not.toHaveProperty('request');
  for (const field of ['request', 'researchSelection', 'researchSummary']) expect(piece.brief).not.toHaveProperty(field);
  expect(saved.rebuilds).toHaveLength(1);
  expect(piece.body).toBe(REBUILT_BODY);
  expect(prompts).toHaveLength(2);
  expect(prompts.every(call => call.prompt.includes('PROMPT VERSION: core-write/v16'))).toBe(true);
});
