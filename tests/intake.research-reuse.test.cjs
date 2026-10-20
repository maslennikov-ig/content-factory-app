'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadRegistry, requestContextFor, servicesFrom, executeTool, IDENTITY } = require('./helpers/agent-capabilities.cjs');
const registry = loadRegistry();
let answers, calls;
const { IntakeService } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts', {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
    getChatModel: async (_org, _temperature, _tokens, role) => ({ withStructuredOutput: () => ({ invoke: async prompt => {
      calls.push({ role, prompt });
      if (!answers.length) throw new Error('Unexpected model call');
      return answers.shift();
    } }) }),
  },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});
const input = '  Подготовь полный обзор двух независимых изменений.\nСтарый пример — только пример структуры.  ';
const reference = 'Reference example from the earlier message. Keep its role.';
const quoteA = 'Alpha supports native sessions.';
const quoteB = 'Beta preserves interrupted streams.';
const urlA = 'https://official.example/alpha';
const urlB = 'https://official.example/beta';
const findings = [
  { factKey: 'alpha', statement: 'Alpha поддерживает сессии.', sourceUrl: urlA, quote: quoteA },
  { factKey: 'beta', statement: 'Beta сохраняет поток.', sourceUrl: urlB, quote: quoteB },
];
const researchResult = () => ({ summary: 'Both documented changes.', readerAssessment: { status: 'supported' }, facts: findings,
  sources: [{ url: urlA, title: 'Alpha docs', provider: 'exa', text: 'Introduction '.repeat(130) + quoteA },
    { url: urlB, title: 'Beta docs', provider: 'exa', text: 'Other content '.repeat(130) + quoteB }] });
const brief = changes => ({ goal: 'Обзор двух изменений', thesis: 'Два независимых изменения', position: null,
  disagreement: null, audience: 'читатели', format: 'list', facts: [], origins: {}, options: {}, questions: [], inputSufficient: true,
  understanding: { version: 'intake-request/v1', goal: 'Обзор двух изменений',
    materials: [{ role: 'reference', origin: 'conversation', text: reference, sourceUrl: urlA }],
    constraints: { research: 'allowed' } }, ...changes });
const build = () => {
  const rows = new Map();
  const snapshots = { get: async key => rows.get(key), set: async (key, value) => rows.set(key, value), del: async key => rows.delete(key),
    claim: async (key, value) => { if (rows.has(key)) return false; rows.set(key, value); return true; } };
  const writes = jest.fn(async () => ({ id: 'piece-1', code: 'cnt-1' }));
  const research = jest.fn(async () => researchResult());
  const fetch = jest.fn(async () => { throw new Error('No repeated source fetch is allowed'); });
  const accepted = [];
  const sources = { acceptSearchResult: jest.fn(async (org, value, options) => {
    accepted.push({ org, value, options });
    return { ...value, evidenceId: `ev-${accepted.length}`, sourceSnapshotId: `ss-${accepted.length}` };
  }) };
  const service = new IntakeService({}, { research }, sources, { fetch }, { listFacts: async () => [] },
    { resolve: async () => ({ effectiveVoice: null }) }, { recordCore: writes }, {}, {},
    { executeAiOperation: async (_org, _operation, callback) => callback() }, () => new Date('2026-10-20T09:00:00Z'),
    undefined, () => null, null, undefined, snapshots);
  return { service, rows, snapshots, sources, accepted, writes, research, fetch };
};
const run = (id, value, built, identity = {}) => {
  const capability = registry.CAPABILITY_CATALOGUE.find(row => row.id === id);
  const tool = registry.buildCapabilityTool(capability, { services: servicesFrom({
    IntakeService: built.service, WebResearchService: { research: built.research } }), language: 'ru', entrance: 'chat' });
  return executeTool(tool, value, { requestContext: requestContextFor(registry, { ...IDENTITY, ...identity }) });
};
const unwrap = output => output.summary?.untrustedData?.value ?? output.summary;
beforeEach(() => { answers = []; calls = []; });

test.each(['piece.create', 'piece.create.from-research'])('%s preserves two owned facts and late quotes into the saved brief without fetching again', async capability => {
  const built = build();
  const searched = await run('research.search', { query: input }, built);
  expect(searched.output.ok).toBe(true);
  const snapshotKey = unwrap(searched.output).snapshotKey;
  expect(built.accepted.map(row => row.value.excerpt)).toEqual([quoteA, quoteB]);
  expect(built.accepted.every(row => row.options.reuseBy === 'hash')).toBe(true);
  // The same saved capture is available to a new service instance, not just process memory.
  const restart = build(); restart.service.snapshots = built.snapshots;
  const saved = await restart.service.readStoredResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, snapshotKey);
  expect(saved.facts.map(row => row.quote)).toEqual([quoteA, quoteB]);
  answers = [brief({ facts: [{ statement: 'An unrelated invented assertion.', evidenceId: 'ev-1' }] }),
    { text: 'Alpha поддерживает сессии. Beta сохраняет поток.' }];
  const created = await run(capability, capability === 'piece.create'
    ? { text: input, material: reference, inputKind: 'instruction', researchId: snapshotKey, factId: ['alpha', 'beta'] }
    : { text: input, inputKind: 'instruction', snapshotKey, factKeys: ['alpha', 'beta'] }, restart);
  expect(created.output).toMatchObject({ ok: true, summary: { outcome: 'created', factsKept: 2 } });
  expect(restart.fetch).not.toHaveBeenCalled();
  expect(restart.research).not.toHaveBeenCalled();
  const core = restart.writes.mock.calls[0][1].brief;
  expect(core.inputText).toBe(input);
  expect(core.brief.facts.filter(row => row.verified)).toEqual(findings.map((fact, index) => expect.objectContaining({
    ...fact, evidenceId: `ev-${index + 1}`, status: 'confirmed', verified: true, selected: true,
  })));
  expect(core.brief.facts.find(row => row.statement === 'An unrelated invented assertion.')).toMatchObject({ verified: false, evidenceId: null });
  expect(calls[0].prompt).toContain(quoteA);
  expect(calls[0].prompt).toContain(quoteB);
  expect(calls[1].prompt).toContain('Alpha поддерживает сессии.');
  expect(calls[1].prompt).toContain('Beta сохраняет поток.');
  expect(core.request.materials[0]).toMatchObject({ role: 'reference', text: reference });
  const repeated = await run(capability, capability === 'piece.create'
    ? { text: input, material: reference, inputKind: 'instruction', researchId: snapshotKey, factId: ['alpha', 'beta'] }
    : { text: input, inputKind: 'instruction', snapshotKey, factKeys: ['alpha', 'beta'] }, restart);
  expect(repeated.output).toMatchObject({ ok: true, summary: { pieceId: 'piece-1' } });
  expect(restart.writes).toHaveBeenCalledTimes(1);
  expect(calls).toHaveLength(2);
});

test('another person in the same organization and an unknown selection are refused before any model or write', async () => {
  const built = build();
  const searched = await run('research.search', { query: input }, built);
  const snapshotKey = unwrap(searched.output).snapshotKey;
  const foreign = await run('piece.create', { text: input, researchId: snapshotKey, factId: ['alpha'] }, built, { userId: 'another-person' });
  expect(foreign.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SNAPSHOT_UNAVAILABLE' });
  const read = await run('piece.read', { researchId: snapshotKey, part: 'research_source', sourceIndex: 0 }, built, { userId: 'another-person' });
  expect(read.output).toMatchObject({ ok: false, code: 'MATERIAL_NOT_AVAILABLE' });
  const ownRead = await run('piece.read', { researchId: snapshotKey, part: 'research_source', sourceIndex: 0, offset: 1_500 }, built);
  expect(unwrap(ownRead.output).text).toContain(quoteA);
  const unknown = await run('piece.create.from-research', { text: input, snapshotKey, factKeys: ['alpha', 'made-up'] }, built);
  expect(unknown.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SELECTION_INVALID' });
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
  expect(built.fetch).not.toHaveBeenCalled();
});

test('a quote from a different source and unknown claim body never become confirmed through an id', async () => {
  const built = build();
  const raw = researchResult(); raw.facts = [{ ...findings[0], quote: quoteB }];
  const captured = await built.service.storeResearchEvidence('org', 'person', { query: input, level: 'standard', summary: null, ...raw });
  expect(captured.facts[0]).toMatchObject({ status: 'unverified', verified: false, evidenceId: null, quote: null });
  expect(built.sources.acceptSearchResult).not.toHaveBeenCalled();
});


test('an uncertain standalone write cannot replay the writer or silently fall back to creating another piece', async () => {
  const built = build();
  const searched = await run('research.search', { query: input }, built);
  const snapshotKey = unwrap(searched.output).snapshotKey;
  answers = [brief(), { text: 'Alpha и Beta изменились.' }];
  built.writes.mockRejectedValue(new Error('Uncertain write receipt'));
  const args = { text: input, inputKind: 'instruction', researchId: snapshotKey, factId: ['alpha', 'beta'] };
  const failed = await run('piece.create', args, built);
  expect(failed.output.ok).toBe(false);
  const repeat = await run('piece.create', args, built);
  expect(repeat.output.ok).toBe(false);
  expect(built.writes).toHaveBeenCalledTimes(1);
  expect(calls).toHaveLength(2);
});


test('two passages from the same URL retain independent evidence instead of reusing an old URL excerpt', async () => {
  const built = build();
  const captured = await built.service.storeResearchEvidence('org', 'person', { query: input, level: 'standard', summary: { status: 'supported' },
    sources: [{ url: urlA, title: 'Both changes', text: quoteA + '\n' + quoteB, provider: 'exa' }],
    facts: [findings[0], { ...findings[1], sourceUrl: urlA }] });
  expect(captured.facts.map(fact => fact.evidenceId)).toEqual(['ev-1', 'ev-2']);
  expect(captured.evidence.map(row => row.excerpt)).toEqual([quoteA, quoteB]);
  expect(built.accepted.every(row => row.options.reuseBy === 'hash')).toBe(true);
});

test('a material requirement for human fact selection is not replaced with model consent', async () => {
  const built = build();
  const searched = await run('research.search', { query: input }, built);
  const snapshotKey = unwrap(searched.output).snapshotKey;
  const understood = brief(); understood.understanding.constraints.humanFactSelection = true;
  answers = [understood];
  const result = await run('piece.create', { text: input, inputKind: 'instruction', researchId: snapshotKey, factId: ['alpha'] }, built);
  expect(result.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON' });
  expect(built.writes).not.toHaveBeenCalled();
  expect(calls).toHaveLength(1);
});


test('query-only reuse keeps the supported fallback and labels it as the research task', async () => {
  const built = build();
  const searched = await run('research.search', { query: input }, built);
  const snapshotKey = unwrap(searched.output).snapshotKey;
  answers = [brief(), { text: 'Alpha поддерживает сессии.' }];
  const result = await run('piece.create.from-research', { snapshotKey, factKeys: ['alpha'] }, built);
  expect(result.output).toMatchObject({ ok: true, summary: { requestBasis: 'research_query' } });
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(input);
});

test('selection person cannot turn standalone research reuse into human consent or claim a writer', async () => {
  const built = build();
  const searched = await run('research.search', { query: input }, built);
  const snapshotKey = unwrap(searched.output).snapshotKey;
  const understood = brief(); understood.understanding.constraints.humanFactSelection = true;
  answers = [understood, { text: 'This must never be written.' }];
  const result = await run('piece.create', { text: input, inputKind: 'instruction', selection: 'person',
    researchId: snapshotKey, factId: ['alpha'] }, built);
  expect(result.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON' });
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
  expect([...built.rows.keys()].some(key => key.endsWith(':continuation'))).toBe(false);
});

test('selection person cannot replay a completed model-origin standalone write as an answered human card', async () => {
  const built = build();
  const searched = await run('research.search', { query: input }, built);
  const snapshotKey = unwrap(searched.output).snapshotKey;
  answers = [brief(), { text: 'Alpha поддерживает сессии.' }];
  const args = { text: input, inputKind: 'instruction', researchId: snapshotKey, factId: ['alpha'] };
  expect((await run('piece.create', args, built)).output.ok).toBe(true);
  const result = await run('piece.create', { ...args, selection: 'person' }, built);
  expect(result.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON' });
  expect(calls).toHaveLength(2);
  expect(built.writes).toHaveBeenCalledTimes(1);
});
