'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const path = 'libraries/nestjs-libraries/src/content-intelligence';
const { resolveResearchIntent } = loadWithMocks(`${path}/intake/research-intent.ts`);
const { settleResearchDigestV4 } = loadWithMocks(`${path}/intake/research-digest.v4.ts`);
const { parseIntakeUnderstanding } = loadWithMocks(`${path}/intake/request-understanding.ts`);
let answers;
const modelCalls = [];
const { IntakeService } = loadWithMocks(`${path}/intake/intake.service.ts`, {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
    getChatModel: async (_org, _temperature, _tokens, role) => ({ withStructuredOutput: () => ({ invoke: async prompt => {
      modelCalls.push({ role, prompt });
      if (!answers.length) throw new Error('Unexpected model call');
      return answers.shift();
    } }) }),
  },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});
const now = new Date('2026-10-18T09:00:00Z');
const temporal = { mode: 'delta', priorCoverageEnd: '2026-10-08' };
const meaning = (changes = {}) => ({ version: 'intake-request/v1', goal: 'Собрать документированные изменения после предыдущей границы.',
  requestedOutputs: ['новая заготовка'], evidenceNeeds: ['Подтверждённые изменения по первичным источникам'],
  constraints: { research: 'required', temporal }, ...changes });
const brief = (changes = {}) => ({ goal: 'Объяснить изменения', thesis: 'Документированные изменения продукта',
  position: null, disagreement: null, audience: 'читатели канала', format: 'auto', facts: [],
  origins: { thesis: 'model', audience: 'model' }, options: {}, questions: [], ...changes });
const assessment = (changes = {}) => ({ status: 'sufficient', summary: 'Нужный результат подтверждён.',
  coveredNeeds: ['Нужные факты'], gaps: [], suggestedQueries: [], ...changes });
const quote = 'Alpha became available on 2026-10-12. Beta will launch later.';
const finding = (changes = {}) => ({ evidenceId: 'ev-1', statement: 'Alpha стала доступна.', quote,
  relevance: 'substantive', alreadyCovered: false, eventDate: '2026-10-12', eventDateQuote: quote,
  dateBasis: 'event', eventStatus: 'occurred', ...changes });
const result = () => ({ provider: 'tavily', sources: [{ url: 'https://official.example/alpha', title: 'Alpha', provider: 'tavily' }],
  facts: [{ sourceUrl: 'https://official.example/alpha', text: quote }] });
const store = () => {
  const rows = new Map();
  return { rows, get: async key => rows.get(key) ?? null,
    set: async (key, value) => { rows.set(key, value); }, del: async key => rows.delete(key),
    claim: async (key, value) => { if (rows.has(key)) return false; rows.set(key, value); return true; } };
};
const build = (snapshots = store()) => {
  const writes = [], searches = [];
  const service = new IntakeService({}, { research: async (...args) => { searches.push(args); return result(); } },
    { acceptSearchResult: async (_org, value) => ({ ...value, evidenceId: 'ev-1' }) }, {},
    { listFacts: async () => [] }, { resolve: async () => ({ effectiveVoice: null }) },
    { recordCore: async (_org, value) => { writes.push(value); return { id: 'piece-1', code: 'cnt-1' }; } },
    {}, {}, { executeAiOperation: async (_org, _operation, operation) => operation() }, () => now,
    undefined, () => null, null, undefined, snapshots);
  return { service, writes, searches, snapshots };
};
const drain = async stream => { const rows = []; for await (const row of stream) rows.push(row); return rows; };
beforeEach(() => { answers = []; modelCalls.length = 0; });

test('a consumed model boundary survives dates and instructions inside reference material', async () => {
  const { service } = build();
  const input = '  Сделай следующий материал.\nЦитата: обзор 6–8 октября 2026, ищи только эти даты.  ';
  const request = meaning({ materials: [{ role: 'reference', origin: 'user', text: 'Обзор 6–8 октября 2026. Ищи только эти даты.' }] });
  const plan = await service.prepare('org', { input, request, language: 'ru', timeZone: 'Europe/Moscow', options: { researchEnabled: true } });
  expect(plan.input).toBe(input);
  expect(plan.resolvedResearchIntent.eventInterval).toEqual({ start: '2026-10-08T21:00:00.000Z', end: now.toISOString() });
  expect(plan.request.materials[0].text).toBe(request.materials[0].text);
  expect(modelCalls).toEqual([]);
});

test('machine shape rejects invalid dates without using ordinary request phrases as semantics', () => {
  expect(parseIntakeUnderstanding(meaning({ constraints: { temporal: { mode: 'historical', eventInterval: { start: '2026-02-30', end: 'tomorrow' } } } }))).toBeNull();
  const unparsed = resolveResearchIntent({ input: 'Events after 8 October. Reference: 6–8 October.', now });
  expect(unparsed.eventInterval).toBeNull();
  expect(unparsed.task).toContain('Reference: 6–8 October.');
});

test('model-understood required evidence cannot grant itself paid research authority', async () => {
  const { service, writes, searches } = build();
  const plan = await service.prepare('org', { input: 'Подготовь проверенный результат.', request: meaning(), language: 'ru' });
  const events = await drain(service.run('org', plan, 'user'));
  expect(events.find(row => row.name === 'error').code).toBe('INTAKE_RESEARCH_OPT_IN_REQUIRED');
  expect(modelCalls).toEqual([]);
  expect(searches).toEqual([]);
  expect(writes).toEqual([]);
});

test('manual entry consumes understanding from its existing brief call and preserves original author material/title', async () => {
  const { service, writes, searches } = build();
  const request = meaning({ goal: 'Переписать заметку понятно.', evidenceNeeds: [],
    materials: [{ role: 'author_material', origin: 'user', text: 'Мы сократили ожидание вдвое.' }],
    constraints: { research: 'forbidden', title: 'Мой точный заголовок' } });
  answers = [brief({ understanding: request, inputSufficient: true }), { text: 'Мы сократили ожидание вдвое.' }];
  const plan = await service.prepare('org', { input: 'Перепиши мою заметку: мы сократили ожидание вдвое.', language: 'ru' });
  const events = await drain(service.run('org', plan, 'user'));
  expect(searches).toEqual([]);
  expect(modelCalls.map(call => call.role)).toEqual(['extract', 'draft']);
  expect(events.filter(row => row.name === 'questions')).toEqual([]);
  expect(writes[0].title).toBe('Мой точный заголовок');
  expect(writes[0].brief.personText).toBe('Мы сократили ожидание вдвое.');
  expect(writes[0].brief.request).toEqual(request);
  expect(modelCalls.at(-1).prompt).toContain('PROMPT VERSION: core-write/v19');
});

test('borrowed factual material does not manufacture an opinion question; a missing private episode remains a real question', async () => {
  const first = build();
  answers = [{ materialKind: 'foreign_post', topic: 'выход продукта', angle: '', structure: [], claims: [] }, brief(), { text: 'Продукт появился в открытом доступе.' }];
  const plan = await first.service.prepare('org', { input: 'Материал чужого автора о доступности продукта.', inputKind: 'foreign_post', language: 'ru' });
  expect((await drain(first.service.run('org', plan, 'user'))).filter(row => row.name === 'questions')).toEqual([]);
  const second = build();
  answers = [brief({ questions: [{ about: 'material', question: 'Что произошло в вашем разговоре с заказчиком?', options: [] }], inputSufficient: false })];
  const personal = await second.service.prepare('org', { input: 'Напиши о моём разговоре с заказчиком.', inputKind: 'instruction', language: 'ru' });
  const events = await drain(second.service.run('org', personal, 'user'));
  expect(events.find(row => row.name === 'questions').questions[0].question).toContain('разговоре с заказчиком');
  expect(second.writes[0].body).toBe('');
  expect(modelCalls.filter(call => call.role === 'draft')).toHaveLength(1);
});

test('a stable comparison needs supported facts rather than manufactured event dates', () => {
  const row = finding({ eventDate: null, eventDateQuote: null, dateBasis: null, eventStatus: null });
  const settled = settleResearchDigestV4({ verdicts: [], findings: [row], assessment: assessment(), temporalConstraint: null }, {
    language: 'ru', level: 'standard', subject: 'Сравни документированные свойства.', claims: [],
    sources: [{ evidenceId: 'ev-1', url: 'https://official.example/alpha', title: 'Alpha', excerpt: quote }],
  });
  expect(settled.findings).toHaveLength(1);
  expect(settled.assessment.status).toBe('sufficient');
  expect(settled.findings[0].dateProvenance).toBeUndefined();
});

test('the evidence model and quote validation retain a relevant passage beyond the old snippet prefix', () => {
  const tail = 'The documented engine supports only one concurrent writer.';
  const excerpt = 'Introduction. '.repeat(190) + tail;
  const settled = settleResearchDigestV4({ verdicts: [], findings: [finding({ statement: 'Поддерживается один писатель.', quote: tail })], assessment: assessment() }, {
    language: 'ru', level: 'standard', subject: 'Объяснить ограничения.', claims: [],
    sources: [{ evidenceId: 'ev-1', url: 'https://official.example/article', title: 'Technical article', excerpt }],
  });
  expect(settled.findings[0].quote).toBe(tail);
  expect(settled.assessment.status).toBe('sufficient');
});

test('a relevant homepage is judged by the model, while a quote spliced across source passages is refused', () => {
  const input = { language: 'ru', level: 'standard', subject: 'Что подтверждает источник?', claims: [],
    sources: [{ evidenceId: 'ev-1', url: 'https://official.example/', title: 'Official source',
      excerpt: 'The first independently retrieved passage.', text: 'The second independently retrieved passage.' }] };
  const genuine = settleResearchDigestV4({ verdicts: [], findings: [finding({ quote: input.sources[0].text })], assessment: assessment() }, input);
  expect(genuine.findings).toHaveLength(1);
  const spliced = settleResearchDigestV4({ verdicts: [], findings: [finding({ quote: 'retrieved passage. The second independently' })], assessment: assessment() }, input);
  expect(spliced.findings).toEqual([]);
  expect(spliced.rejected.findings).toBe(1);
});

test.each(['general', 'delta'])('overlap with prior material respects the model-understood %s goal', mode => {
  const intent = resolveResearchIntent({ input: 'Собрать подтверждённый результат.', now,
    temporal: mode === 'delta' ? temporal : { mode: 'general' } });
  const settled = settleResearchDigestV4({ verdicts: [], findings: [finding({ alreadyCovered: true })], assessment: assessment() }, {
    language: 'ru', level: 'standard', subject: intent.task, claims: [], researchIntent: intent,
    sources: [{ evidenceId: 'ev-1', url: 'https://official.example/alpha', title: 'Alpha', excerpt: quote }],
  });
  if (mode === 'general') {
    expect(settled.findings).toHaveLength(1);
    expect(settled.assessment.status).toBe('sufficient');
  } else {
    expect(settled.findings).toEqual([]);
    expect(settled.assessment.status).toBe('empty');
    expect(settled.periodDiagnostics.rejected.prior_coverage).toBe(1);
  }
});

test('a later digest cannot turn an understood general task into a historical interval', async () => {
  const { service, writes } = build();
  const request = meaning({ goal: 'Объяснить документированные свойства, без новостного периода.',
    constraints: { research: 'required' }, materials: [{ role: 'reference', origin: 'user', text: 'Образец за другой период.' }] });
  answers = [brief({ understanding: request, inputSufficient: true }),
    { verdicts: [], findings: [finding({ alreadyCovered: true })], assessment: assessment(),
      temporalConstraint: { mode: 'historical', eventInterval: { start: '2026-09-01', end: '2026-09-08' } } }];
  const plan = await service.prepare('org', { input: 'Нужно объяснение. Даты в образце относятся к образцу.',
    inputKind: 'instruction', language: 'ru', options: { researchEnabled: true } }, { researchSelectionPolicy: 'model' });
  const events = await drain(service.run('org', plan, 'user'));
  expect(plan.resolvedResearchIntent.mode).toBe('general');
  const ready = events.find(row => row.name === 'research-ready');
  expect(ready.summary.status).toBe('sufficient');
  expect(ready.facts.some(row => row.kind === 'found')).toBe(true);
  expect(writes).toEqual([]);
});

test('model date meaning is honored without neighbouring-future dictionaries; metadata-only dates stay gaps', () => {
  const intent = resolveResearchIntent({ input: 'Что изменилось?', now, temporal });
  const sourceQuote = 'Alpha became available on 2026-10-12.\nBeta will launch later.';
  const row = finding();
  const input = { language: 'ru', level: 'standard', subject: intent.task, researchIntent: intent, claims: [],
    sources: [{ evidenceId: 'ev-1', url: 'https://official.example/alpha', title: 'Alpha', excerpt: sourceQuote }] };
  const settled = settleResearchDigestV4({ verdicts: [], findings: [row], assessment: assessment() }, input);
  expect(settled.findings[0].quote).toBe(sourceQuote);
  expect(settled.findings[0].dateProvenance.eventDateQuote).toBe(sourceQuote);
  const metadata = settleResearchDigestV4({ verdicts: [], findings: [finding({ dateBasis: 'publication' })], assessment: assessment() }, input);
  expect(metadata.findings).toEqual([]);
  expect(metadata.assessment.status).toBe('empty');
  expect(metadata.periodDiagnostics.rejected.unknown_date).toBe(1);
});

test('an empty research result reaches the caller with gaps, no successful fact-selection card and no fabricated piece', async () => {
  const { service, writes } = build();
  answers = [brief(), { verdicts: [], findings: [], assessment: assessment({ status: 'empty', gaps: ['Не найдены подтверждения'], suggestedQueries: ['уточнённый предмет поиска'] }) }];
  const plan = await service.prepare('org', { input: 'Проверь сведения по открытым источникам.', request: meaning({ constraints: { research: 'required' } }), language: 'ru', options: { researchEnabled: true } });
  const events = await drain(service.run('org', plan, 'user'));
  const ready = events.find(row => row.name === 'research-ready');
  expect(ready.summary).toMatchObject({ status: 'empty', found: 0, gaps: ['Не найдены подтверждения'], suggestedQueries: ['уточнённый предмет поиска'] });
  expect(events.filter(row => row.name === 'research-selection-required')).toEqual([]);
  expect(writes).toEqual([]);
});

test('model continuation is owner-scoped, recorded as model-origin, atomic across instances and repeatable without another write', async () => {
  const snapshots = store();
  const first = build(snapshots);
  answers = [brief(), { verdicts: [], findings: [finding()], assessment: assessment() }, { text: 'Alpha стала доступна 12 октября.' }];
  const plan = await first.service.prepare('org', { input: 'Сделай материал об изменениях после прежней границы.', request: meaning(), language: 'ru', options: { researchEnabled: true } }, { researchSelectionPolicy: 'model' });
  const events = await drain(first.service.run('org', plan, 'user'));
  const ready = events.find(row => row.name === 'research-ready');
  const snapshot = await first.service.readResearchSnapshot('org', 'user', ready.snapshotKey);
  expect(snapshot.summary.status).toBe('sufficient');
  expect(await first.service.readResearchSnapshot('another-org', 'user', ready.snapshotKey)).toBeNull();
  await expect(drain(first.service.selectResearchForModel('org', 'foreign-user', ready.snapshotKey, []))).rejects.toThrow('unavailable');
  const second = build(snapshots);
  const keys = [ready.facts.find(row => row.kind === 'found').factKey];
  const results = await Promise.allSettled([
    drain(first.service.selectResearchForModel('org', 'user', ready.snapshotKey, keys)),
    drain(second.service.selectResearchForModel('org', 'user', ready.snapshotKey, keys)),
  ]);
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  expect(first.writes.length + second.writes.length).toBe(1);
  const saved = [...first.writes, ...second.writes][0];
  expect(saved.brief.researchSelection).toMatchObject({ origin: 'model', selectedKeys: keys });
  expect(saved.brief.answers).toEqual([]);
  const repeated = await drain(second.service.selectResearchForModel('org', 'user', ready.snapshotKey, keys));
  expect(repeated.find(row => row.name === 'piece').pieceId).toBe('piece-1');
  expect(first.writes.length + second.writes.length).toBe(1);
  expect(first.searches.length + second.searches.length).toBe(1);
});

test('requested human selection and unknown rows cannot be forged as model completion', async () => {
  const { service } = build();
  const state = { filled: { brief: { ...brief(), inputKind: 'instruction', facts: [{ factKey: 'known', verified: true, status: 'confirmed', kind: 'found' }] } },
    corrections: [], evidence: [], correctedInput: '', summary: { status: 'sufficient' }, resumePlan: { request: meaning({ constraints: { humanFactSelection: true } }) } };
  expect(() => service.selectCoreResearchForModel(state, 'original', 'ru', ['known'])).toThrow('person');
  expect(() => service.selectCoreResearchForModel({ ...state, resumePlan: { researchSelectionPolicy: 'model' } }, 'original', 'ru', ['unknown'])).toThrow('existing verified');
});

test('a pre-search insufficiency is reassessed against selected partial evidence before writing', async () => {
  const { service, writes, searches } = build();
  answers = [brief({ inputSufficient: false }),
    { verdicts: [], findings: [finding()], assessment: assessment({ status: 'partial', gaps: ['Полнота не подтверждена'] }) },
    brief({ inputSufficient: true }), { text: 'Alpha стала доступна. Полнота обзора не подтверждена.' }];
  const plan = await service.prepare('org', { input: 'Подготовь подтверждённую часть и укажи пробелы.',
    request: meaning(), language: 'ru', options: { researchEnabled: true } }, { researchSelectionPolicy: 'model' });
  const first = await drain(service.run('org', plan, 'user'));
  const ready = first.find(row => row.name === 'research-ready');
  const keys = ready.facts.filter(row => row.kind === 'found').map(row => row.factKey);
  const saved = await drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, keys));
  expect(saved.some(row => row.name === 'piece')).toBe(true);
  expect(searches).toHaveLength(1);
  expect(writes).toHaveLength(1);
  expect(writes[0].brief.researchSelection).toMatchObject({ origin: 'model', selectedKeys: keys });
  expect(modelCalls[2].prompt).toContain('selectedResearch');
  expect(modelCalls[2].prompt).toContain('Alpha стала доступна.');
  expect(modelCalls[2].prompt).toContain('constraints, not factual assertions');
});

test('native contextual material reaches the existing semantic model without altering the original request', async () => {
  const { service, writes } = build();
  const input = 'Перепиши мою раннюю заметку без дополнительного поиска.';
  const contextMaterial = 'Заметка из ранней истории: мы уменьшили время ожидания вдвое.';
  const request = meaning({ goal: 'Переписать раннюю заметку.', constraints: { research: 'forbidden' },
    materials: [{ role: 'author_material', origin: 'conversation', text: contextMaterial }] });
  answers = [brief({ understanding: request, inputSufficient: true }), { text: 'Время ожидания сократилось вдвое.' }];
  const plan = await service.prepare('org', { input, contextMaterial, inputKind: 'instruction', language: 'ru' });
  await drain(service.run('org', plan, 'user'));
  expect(plan.input).toBe(input);
  expect(modelCalls[0].prompt).toContain(contextMaterial);
  expect(writes[0].brief.inputText).toBe(input);
  expect(writes[0].brief.request.materials[0]).toEqual(request.materials[0]);
});

test('insufficient input and an expired saved search never fabricate a piece or silently buy another search', async () => {
  const { service, writes, searches } = build();
  answers = [brief({ inputSufficient: false, questions: [] })];
  const plan = await service.prepare('org', { input: 'Напиши точные итоги нашего внутреннего эксперимента.', inputKind: 'instruction', language: 'ru' });
  const events = await drain(service.run('org', plan, 'user'));
  expect(events.find(row => row.name === 'error').code).toBe('INTAKE_INPUT_INSUFFICIENT');
  const expired = await service.prepare('org', { input: 'Продолжи сохранённое исследование.', language: 'ru', snapshotKey: 'expired', researchSelections: ['key'], options: { researchEnabled: true } });
  const missing = await drain(service.run('org', expired, 'user'));
  expect(missing.find(row => row.name === 'error').code).toBe('INTAKE_SNAPSHOT_EXPIRED');
  expect(writes).toEqual([]);
  expect(searches).toEqual([]);
  expect(modelCalls).toHaveLength(1);
});

test('a missing atomic claim port or uncertain failed save blocks continuation before any automatic retry', async () => {
  const snapshots = store();
  const { service, writes } = build(snapshots);
  answers = [brief(), { verdicts: [], findings: [finding()], assessment: assessment() }, { text: 'Подтверждённый материал.' }];
  const plan = await service.prepare('org', { input: 'Подготовь материал из проверенных фактов.', request: meaning(), language: 'ru', options: { researchEnabled: true } }, { researchSelectionPolicy: 'model' });
  const events = await drain(service.run('org', plan, 'user'));
  const ready = events.find(row => row.name === 'research-ready');
  const keys = [ready.facts.find(row => row.kind === 'found').factKey];
  const atomicClaim = snapshots.claim;
  snapshots.claim = undefined;
  await expect(drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, keys))).rejects.toThrow('Atomic');
  expect(modelCalls).toHaveLength(2);
  snapshots.claim = atomicClaim;
  service.briefRepository.recordCore = async () => { throw new Error('Uncertain persistence'); };
  const failed = await drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, keys));
  expect(failed.find(row => row.name === 'error').code).toBe('PIECE_NOT_SAVED');
  const callsBeforeRetry = modelCalls.length;
  await expect(drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, keys))).rejects.toThrow('already started');
  expect(modelCalls).toHaveLength(callsBeforeRetry);
  expect(writes).toEqual([]);
});

test('pending and completed writes bind origin and canonical fact keys; different choices never coalesce', async () => {
  const { service, writes, snapshots } = build();
  let beganDraft;
  const draftStarted = new Promise(resolve => { beganDraft = resolve; });
  let releaseDraft;
  const pausedDraft = { then: resolve => {
    releaseDraft = () => resolve({ text: 'Alpha стала доступна 12 октября.' });
    beganDraft();
  } };
  answers = [brief(), { verdicts: [], findings: [finding(), finding({ statement: 'Доступность Alpha датирована 12 октября.' })], assessment: assessment() }, pausedDraft];
  const plan = await service.prepare('org', { input: 'Подготовь проверенные сведения о доступности Alpha.', request: meaning(), language: 'ru', options: { researchEnabled: true } }, { researchSelectionPolicy: 'model' });
  const ready = (await drain(service.run('org', plan, 'user'))).find(row => row.name === 'research-ready');
  const keys = ready.facts.filter(row => row.kind === 'found').map(row => row.factKey);
  expect(keys).toHaveLength(2);
  // A reversible malformed choice does not claim or poison the snapshot.
  await expect(drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, ['unknown']))).rejects.toMatchObject({
    code: 'INTAKE_RESEARCH_SELECTION_INVALID', canReviseInput: true, status: 400,
  });
  expect([...snapshots.rows.keys()].some(key => key.endsWith(':continuation'))).toBe(false);
  const pending = drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, keys));
  await draftStarted;
  await expect(drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, [keys[0]]))).rejects.toMatchObject({ code: 'INTAKE_RESEARCH_SELECTION_CONFLICT', status: 409 });
  await expect(drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, ['unknown']))).rejects.toMatchObject({ code: 'INTAKE_RESEARCH_SELECTION_CONFLICT' });
  const sameChoice = drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, [...keys].reverse()));
  releaseDraft();
  const [firstResult, coalesced] = await Promise.all([pending, sameChoice]);
  expect(coalesced).toEqual(firstResult);
  expect(writes).toHaveLength(1);
  const repeated = await drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, [...keys].reverse()));
  expect(repeated).toEqual(firstResult);
  await expect(drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, [keys[1]]))).rejects.toMatchObject({ code: 'INTAKE_RESEARCH_SELECTION_CONFLICT' });
  await expect(drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, ['unknown']))).rejects.toMatchObject({ code: 'INTAKE_RESEARCH_SELECTION_CONFLICT' });
  const manualPlan = await service.prepare('org', { input: plan.input, language: 'ru', snapshotKey: ready.snapshotKey, researchSelections: keys });
  await expect(drain(service.run('org', manualPlan, 'user'))).rejects.toMatchObject({ code: 'INTAKE_RESEARCH_SELECTION_CONFLICT' });
  expect(modelCalls.filter(call => call.role === 'draft')).toHaveLength(1);
  expect(writes).toHaveLength(1);
});

test.each(['manual', 'legacy'])('%s snapshots cannot acquire model policy from body data or inferred user consent', async kind => {
  const { service, writes, snapshots } = build();
  answers = [brief(), { verdicts: [], findings: [finding()], assessment: assessment() }];
  const plan = await service.prepare('org', { input: 'Подготовь материал и дай мне выбрать опоры.',
    request: meaning({ constraints: { research: 'required' } }), researchSelectionPolicy: 'model', language: 'ru', options: { researchEnabled: true } });
  expect(plan.researchSelectionPolicy).toBe('person');
  const ready = (await drain(service.run('org', plan, 'user'))).find(row => row.name === 'research-ready');
  if (kind === 'legacy') {
    for (const [key, raw] of snapshots.rows) {
      const saved = JSON.parse(raw);
      delete saved.state.resumePlan.researchSelectionPolicy;
      snapshots.rows.set(key, JSON.stringify(saved));
    }
  }
  const keys = ready.facts.filter(row => row.kind === 'found').map(row => row.factKey);
  const view = await service.readResearchSnapshot('org', 'user', ready.snapshotKey);
  expect(view.selectionPolicy).toBe('person');
  await expect(drain(service.selectResearchForModel('org', 'user', ready.snapshotKey, keys))).rejects.toMatchObject({ code: 'INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON' });
  expect(writes).toEqual([]);
  expect([...snapshots.rows.keys()].some(key => key.endsWith(':continuation'))).toBe(false);
  expect(modelCalls).toHaveLength(2);
});

test('existing-core research defaults to person policy and accepts model policy only from its internal context', async () => {
  const { service } = build();
  answers = [
    { verdicts: [], findings: [finding()], assessment: assessment() },
    { verdicts: [], findings: [finding()], assessment: assessment() },
  ];
  const sourceBrief = { ...brief(), inputKind: 'thought', ungrounded: [] };
  const manual = await service.researchExistingCore('org', 'Исходный материал.', sourceBrief, 'ru');
  expect(manual.resumePlan.researchSelectionPolicy).toBe('person');
  const keys = manual.filled.brief.facts.filter(row => row.kind === 'found').map(row => row.factKey);
  expect(() => service.selectCoreResearchForModel(manual, 'Исходный материал.', 'ru', keys)).toThrow('person');
  const model = await service.researchExistingCore('org', 'Исходный материал.', sourceBrief, 'ru', 'standard', undefined, { researchSelectionPolicy: 'model' });
  expect(service.selectCoreResearchForModel(model, 'Исходный материал.', 'ru', keys).researchSelection.origin).toBe('model');
});
