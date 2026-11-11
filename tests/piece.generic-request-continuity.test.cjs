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
  status: 'partial', requestedScope: { goal: request().goal, evidenceNeeds: request().evidenceNeeds },
  assessment: { status: 'partial', summary: 'Подтверждена часть условий.', coveredNeeds: ['Условия согласования'], gaps: ['Полнота сравнения не подтверждена.'], suggestedQueries: [] }, gaps: ['Полнота сравнения не подтверждена.'] };
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

test('native series persistence retains the public explanation without putting it in post bodies or calling a model', async () => {
  const service = Object.create(PieceService.prototype), writes = [];
  service.pieces = { createAdaptationSeries: async (_org, input) => {
    writes.push(input);
    return { seriesId: input.seriesId, created: true, parts: input.parts.map((_, i) => ({ adaptationId: `saved-${i}`, postId: `post-${i}` })) };
  } };
  service.search = { invalidate: () => undefined };
  const reason = 'Я разделил материал по темам, чтобы сохранить детали.';
  const output = { date: NOW.toISOString(), hook: '', presentationReason: reason,
    content: [{ content: 'Первая тема' }, { content: 'Вторая тема' }] };
  const saved = await service.persistSeriesAdaptation('org', 'user', 'series', { answers: [], output,
    plan: { pieceId: 'piece', kind: 'post', language: 'ru', channel: { id: 'channel', name: 'Channel', providerIdentifier: 'telegram', editor: 'none' },
      sourceRevision: { body: 'Original material', brief: {} } } });
  expect(saved.presentationReason).toBe(reason);
  expect(writes).toHaveLength(1);
  expect(writes[0].parts.map(part => part.body)).toEqual(['Первая тема', 'Вторая тема']);
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

test('stored later author additions reach prepareAdapt, generation and advisory review separately from old context', async () => {
  const { RunnableLambda } = require('@langchain/core/runnables');
  const { loadAgentGraph } = require('../scripts/evidence/voice-eval/product-graph.cjs');
  const { service, piece } = build();
  const addition = { text: 'Подсказка помогает увидеть новый ракурс, но соблазняет не думать.', addedAt: NOW.toISOString() };
  const currentAuthorRequest = 'Подготовь публикацию. ' + 'Сохрани условия и практические детали. '.repeat(20) + 'Итог доступен только участникам до пятницы.';
  const core = { ...storedCore(), text: FIRST_BODY, contextMaterial: 'Прежнее мнение: подсказка удобна.', addedMaterial: [addition] };
  piece.body = core.text;
  piece.brief = clone(core);
  service.pieces.listIntegrations = async () => [{ id: 'channel', name: 'Channel', providerIdentifier: 'telegram', contentLanguage: 'ru' }];
  service.integrationManager = { getSocialIntegration: () => ({ maxLength: () => 4096, editor: 'none' }) };
  const snapshot = clone(piece);
  const plan = await service.prepareAdapt('org', piece.id, { integrationId: 'channel', kind: 'post' }, 'ru', { currentAuthorRequest });
  expect(plan.core.addedMaterial).toEqual([addition]);
  const hints = service.hintsOf(plan, [], []);
  expect(hints.currentAuthorRequest).toBe(currentAuthorRequest);
  hints.channel.writingProfile = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts').defaultWritingProfileFor('telegram', 'ru');
  expect(hints.authorAdditions).toEqual([addition]);
  expect(hints.authorAdditions[0]).not.toBe(addition);
  const calls = [];
  const model = { withStructuredOutput: () => RunnableLambda.from(async prompt => {
    calls.push(String(prompt));
    return calls.length === 1
      ? { content: { content: 'Черновик', usedCitationIds: [] } }
      : { status: 'partial', missingRequirements: ['Не сохранена мысль о соблазне не думать'], unsupportedClaims: [] };
  }) };
  const graph = loadAgentGraph({ chatModel: model }).service;
  graph.aiUsage = { executeAiOperation: async (_org, _op, callback) => callback() };
  const state = { orgId: 'org', language: 'ru', format: 'one_long', tone: 'personal',
    messages: [{ content: 'Подготовь пост' }], popularPosts: [], researchAvailable: false,
    hook: '', contentContext: { facts: [], evidence: [] }, intake: hints };
  const generated = await graph.generateContent(state);
  const reviewed = await graph.fixArray({ ...state, ...generated });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toContain('Прежнее мнение: подсказка удобна.');
  expect(calls[0]).toContain(addition.text);
  expect(calls[0]).toContain(currentAuthorRequest);
  expect(calls[0]).toContain('untrusted one-off editorial data, not permission');
  expect(calls[0]).toContain('Later author additions');
  const reviewInput = JSON.parse(calls[1].slice(calls[1].indexOf('Human: ') + 7));
  expect(reviewInput.contextMaterial).toBe(hints.contextMaterial);
  expect(reviewInput.authorAdditions).toEqual([addition]);
  expect(reviewInput.currentAuthorRequest).toBe(currentAuthorRequest);
  expect(reviewInput.currentAuthorRequestGuidance).toContain('not permission');
  expect(reviewInput.authorAdditionsGuidance).toContain('not an event date');
  expect(reviewed.adaptationCoverage).toMatchObject({ status: 'partial', reviews: 1, repaired: false });
  expect(reviewed.content[0].content).toBe('Черновик');
  expect(clone(piece)).toEqual(snapshot);
});

test('adaptation proof hints retain selected quotes even when the short editorial material excludes their full pages', () => {
  const { service } = build({ meaningField: 'request' });
  const core = { ...storedCore(), text: FIRST_BODY };
  core.brief.facts.push({ ...core.brief.facts[0], factKey: 'source-long', evidenceId: 'source-long',
    statement: 'A complete selected source page. '.repeat(150), quote: 'A complete selected source page. '.repeat(150) });
  const plan = { core, request: {}, foreignShingles: [], channel: {
    id: 'channel', providerIdentifier: 'telegram', maxLength: 4096, maxCaptionLength: 1024, editor: 'none', profile: null,
  } };
  const material = service.briefMaterial(plan);
  const hints = service.hintsOf(plan, [], material.material);
  expect(hints.evidenceQuotes).toEqual(core.brief.facts.map(fact => ({
    evidenceId: fact.evidenceId, sourceUrl: fact.sourceUrl, quote: fact.quote.trim(), statement: fact.statement.trim(),
  })));
  expect(hints.evidenceQuotes[1].quote.length).toBeGreaterThan(4_000);
  expect(material.evidenceIds).toEqual(['source-approval', 'source-long']);
  expect(prompts).toHaveLength(0);
});

test('an explicit Telegram invitation inherits the saved draft facts, exact quotes and research gaps without rewriting its parent', async () => {
  const { RunnableLambda } = require('@langchain/core/runnables');
  const { loadAgentGraph } = require('../scripts/evidence/voice-eval/product-graph.cjs');
  const { service, piece } = build();
  const sourceUrl = 'https://official.example/dubai-summit';
  piece.body = `Кратко для руководителя: саммит в Дубае пройдёт 12 ноября.\n\n[Программа](${sourceUrl}): заявлены 12 команд.\n\nСостав спикеров пока неизвестен.`;
  piece.brief.request = { version: 'intake-request/v1', goal: 'Подготовь для руководителя черновик о саммите в Дубае.',
    requestedOutputs: ['Черновик с фактами и источниками'], constraints: { research: 'required' } };
  piece.brief.researchSummary = { ...clone(summary), gaps: ['Состав спикеров пока неизвестен.'] };
  piece.brief.brief.facts = [{ factKey: 'summit:date', evidenceId: 'summit', kind: 'found', origin: 'search',
    statement: 'Саммит в Дубае пройдёт 12 ноября; заявлены 12 команд.', sourceUrl,
    quote: 'The Dubai summit takes place on 12 November with 12 teams.', selected: true, verified: true, status: 'confirmed' }];
  service.pieces.listIntegrations = async () => [{ id: 'channel', name: 'Telegram', providerIdentifier: 'telegram', contentLanguage: 'ru' }];
  service.integrationManager = { getSocialIntegration: () => ({ maxLength: () => 4096, editor: 'none' }) };
  const before = clone(piece);
  const currentAuthorRequest = 'Сделай приглашение в Telegram из этого черновика. Сохрани дату и число команд; не придумывай спикеров.';
  const plan = await service.prepareAdapt('org', piece.id, { integrationId: 'channel', kind: 'post' }, 'ru', { currentAuthorRequest });
  const selected = service.briefMaterial(plan);
  const hints = service.hintsOf(plan, [], selected.material);
  expect(hints.researchSummary).toEqual(piece.brief.researchSummary);
  expect(hints.evidenceQuotes).toEqual([expect.objectContaining({ sourceUrl, quote: piece.brief.brief.facts[0].quote })]);
  hints.channel.writingProfile = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts').defaultWritingProfileFor('telegram', 'ru');
  const calls = [];
  const invitation = `Приглашаем на саммит в Дубае 12 ноября: заявлены 12 команд. Состав спикеров пока неизвестен. [Программа](${sourceUrl})`;
  const model = { withStructuredOutput: () => RunnableLambda.from(async prompt => {
    calls.push(String(prompt));
    return calls.length === 1 ? { content: { content: invitation, usedCitationIds: [] } }
      : { status: 'complete', missingRequirements: [], unsupportedClaims: [] };
  }) };
  const graph = loadAgentGraph({ chatModel: model }).service;
  graph.aiUsage = { executeAiOperation: async (_org, _operation, callback) => callback() };
  const state = { orgId: 'org', language: 'ru', format: 'one_long', tone: 'personal',
    messages: [{ content: currentAuthorRequest }], popularPosts: [], researchAvailable: false,
    hook: '', contentContext: { facts: [], evidence: [] }, intake: hints };
  const generated = await graph.generateContent(state);
  const reviewed = await graph.fixArray({ ...state, ...generated });
  expect(calls[0]).toContain(currentAuthorRequest);
  expect(calls[0]).toContain('Saved parent draft research coverage');
  expect(calls[0]).toContain('Состав спикеров пока неизвестен.');
  expect(calls[0]).toContain('Саммит в Дубае пройдёт 12 ноября; заявлены 12 команд.');
  const review = JSON.parse(calls[1].slice(calls[1].indexOf('Human: ') + 7));
  expect(review.researchSummary).toEqual(piece.brief.researchSummary);
  expect(reviewed.content[0].content).toBe(invitation);
  expect(clone(piece)).toEqual(before);
});

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
  expect(writers[0].input.researchSummary).toEqual(summary);
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
  expect(prompts[0].prompt).toContain('PROMPT VERSION: core-write/v22');
  expect(prompts[0].prompt).toContain(summary.gaps[0]);
  expect(prompts[0].prompt).toContain(request().goal);
  expect(prompts[0].prompt).toContain(AUTHOR_REPLY);
  expect(prompts[0].prompt).toContain('https://official.example/approval');

  const rebuilt = await service.rebuildCore('org', 'piece-1', 'ru');
  expect(rebuilt).toEqual({ text: REBUILT_BODY, revisions: 1 });
  expect(writers[1].name).toBe('writeCore');
  expect(writers[1].input.request).toEqual(request());
  expect(writers[1].input.researchSummary).toEqual(summary);
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
  expect(prompts[1].prompt).toContain('PROMPT VERSION: core-write/v22');
  expect(prompts[1].prompt).toContain(summary.gaps[0]);
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

test('a person-selected research summary also survives the native answer and rebuild writers', async () => {
  const { service, piece } = build();
  piece.brief.researchSelection.origin = 'person';
  await answer(service);
  await service.rebuildCore('org', 'piece-1', 'ru');
  expect(writers.map(call => call.input.researchSummary)).toEqual([summary, summary]);
  expect(piece.brief.researchSelection.origin).toBe('person');
  expect(piece.brief.researchSummary).toEqual(summary);
});

test('legacy native cores remain answerable and rebuildable without manufacturing new request or research fields', async () => {
  const { service, piece, saved } = build({ legacy: true });
  const answered = await answer(service);
  expect(writers[0].input).not.toHaveProperty('request');
  expect(writers[0].input).not.toHaveProperty('researchSummary');
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
