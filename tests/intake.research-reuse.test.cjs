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
    claim: async (key, value) => { if (rows.has(key)) return false; rows.set(key, value); return true; },
    claimMany: async (keys, value) => { if (keys.some(key=>rows.has(key))) return false; for(const key of keys) rows.set(key,value); return true; } };
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
    IntakeService: built.service, WebResearchService: { research: built.research }, PieceService: built.pieces }), language: 'ru', entrance: 'chat' });
  return executeTool(tool, value, { requestContext: requestContextFor(registry, { ...IDENTITY, ...identity }) });
};
const unwrap = output => output.summary?.untrustedData?.value ?? output.summary;
beforeEach(() => { answers = []; calls = []; });

test.each(['piece.create', 'piece.create.from-research'])('%s preserves two owned facts and late quotes into the saved brief without fetching again', async capability => {
  const built = build();
  const searched = await run('research.search', { query: input }, built);
  expect(searched.output.ok).toBe(true);
  const snapshotKey = unwrap(searched.output).snapshotKey;
  expect(built.accepted.slice(0, 2).map(row => row.value.excerpt)).toEqual([quoteA, quoteB]);
  expect(built.accepted.every(row => row.options.reuseBy === 'hash')).toBe(true);
  // The same saved capture is available to a new service instance, not just process memory.
  const restart = build(); restart.service.snapshots = built.snapshots;
  const saved = await restart.service.readStoredResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, snapshotKey);
  expect(saved.facts.filter(row => !row.sourcePassage).map(row => row.quote)).toEqual([quoteA, quoteB]);
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
  expect(captured.facts.filter(fact => fact.sourcePassage).every(fact => fact.verified === false && fact.selected === false)).toBe(true);
  expect(built.accepted.every(row => row.value.excerpt !== quoteB)).toBe(true);
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
  expect(captured.facts.filter(fact => !fact.sourcePassage).map(fact => fact.evidenceId)).toEqual(['ev-1', 'ev-2']);
  expect(captured.evidence.slice(0, 2).map(row => row.excerpt)).toEqual([quoteA, quoteB]);
  expect(built.accepted.every(row => row.options.reuseBy === 'hash')).toBe(true);
});

const longSourceResearch = () => {
  const fullText = 'Earlier documented section.\n\n'.repeat(8_000) + quoteA + '\n\n' + quoteB;
  return { summary: 'A reference manual was found; inspect the needed passage.', readerAssessment: { status: 'partial' },
    sources: [{ url: urlA, title: 'Long primary manual', provider: 'exa', text: fullText.slice(0, 6_000), fullText }],
    facts: [{ factKey: 'initial-preview', text: fullText.slice(0, 300), sourceUrl: urlA }] };
};

test('a compact native tool result retains a full 224k source, repairs a bad read and writes its late selected passage once without searching again', async () => {
  const built = build();
  const found = longSourceResearch();
  built.research.mockResolvedValue(found);
  const searched = await run('research.search', { query: input }, built);
  const saved = unwrap(searched.output);
  expect(JSON.stringify(searched.output).length).toBeLessThan(4_000);
  expect(saved.sources[0].totalCharacters).toBe(found.sources[0].fullText.length);
  const badRead = await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceIndex: 999 }, built);
  expect(badRead.output).toMatchObject({ ok: false, code: 'MATERIAL_NOT_AVAILABLE', canReviseInput: true });
  const badFind = await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA,
    find: 'No literal like this exists in the manual.' }, built);
  expect(badFind.output).toMatchObject({ ok: true });
  expect(unwrap(badFind.output)).toMatchObject({ literalMatch: false, canReviseInput: true, offset: 0, recovery: { code: 'MATERIAL_PASSAGE_NOT_FOUND' } });
  expect(unwrap(badFind.output).matchOffset).toBeUndefined();
  const read = await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA,
    find: quoteA, length: 1_000 }, built);
  const passage = unwrap(read.output);
  expect(passage.text).toContain(quoteA);
  expect(passage.offset).toBeGreaterThan(200_000);
  expect(passage.totalCharacters).toBe(found.sources[0].fullText.length);
  const staleRead = await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA,
    revision: '0'.repeat(64), offset: passage.offset }, built);
  expect(staleRead.output).toMatchObject({ ok: false, code: 'MATERIAL_STALE', canReviseInput: true });
  const args = { text: input, inputKind: 'instruction', snapshotKey: saved.snapshotKey,
    passages: [{ sourceUrl: urlA, revision: passage.revision, quote: quoteA }] };
  answers = [brief(), { text: 'Alpha поддерживает сессии.' }];
  const created = await run('piece.create.from-research', args, built);
  expect(created.output).toMatchObject({ ok: true, summary: { pieceId: 'piece-1', factsKept: 1 } });
  expect(built.writes.mock.calls[0][1].brief.brief.facts).toEqual(expect.arrayContaining([
    expect.objectContaining({ statement: quoteA, quote: quoteA, sourceUrl: urlA, verified: true, status: 'confirmed' }),
  ]));
  expect(calls[0].prompt).toContain(quoteA);
  expect(calls.every(row => row.prompt.length < 20_000)).toBe(true);
  expect((await run('piece.create.from-research', args, built)).output.ok).toBe(true);
  expect(built.writes).toHaveBeenCalledTimes(1);
  expect(built.research).toHaveBeenCalledTimes(1);
  expect(built.fetch).not.toHaveBeenCalled();
});

test.each(['piece.create', 'piece.create.from-research'].flatMap(capability =>
  ['stale', 'foreign-url', 'invented-quote'].map(kind => [capability, kind])))('%s refuses a %s passage before any model or new source write', async (capability, kind) => {
  const built = build(); built.research.mockResolvedValue(longSourceResearch());
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA }, built)).output);
  const acceptedBefore = built.accepted.length;
  const selected = { sourceUrl: urlA, revision: read.revision, quote: quoteA };
  if (kind === 'stale') selected.revision = '0'.repeat(64);
  if (kind === 'foreign-url') selected.sourceUrl = urlB;
  if (kind === 'invented-quote') selected.quote = 'The manual supports an invented unrelated claim.';
  const result = await run(capability, { text: input, ...(capability === 'piece.create' ? { researchId: saved.snapshotKey } : { snapshotKey: saved.snapshotKey }),
    passages: [selected] }, built);
  expect(result.output).toMatchObject({ ok: false, canReviseInput: true });
  expect(built.accepted).toHaveLength(acceptedBefore);
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
});

test('another person cannot capture a retained passage and an expired parent cannot authorize a derived snapshot', async () => {
  const built = build(); built.research.mockResolvedValue(longSourceResearch());
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA,
    find: quoteA }, built)).output);
  const args = { text: input, snapshotKey: saved.snapshotKey, passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] };
  const foreign = await run('piece.create.from-research', args, built, { userId: 'another-person' });
  expect(foreign.output.ok).toBe(false);
  expect(foreign.output.canReviseInput).not.toBe(true);
  expect(foreign.model.value.canReviseInput).not.toBe(true);
  const foreignUnified = await run('piece.create', { text: input, researchId: saved.snapshotKey, passages: args.passages }, built,
    { userId: 'another-person' });
  expect(foreignUnified.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SNAPSHOT_UNAVAILABLE' });
  expect(foreignUnified.output.canReviseInput).not.toBe(true);
  expect(foreignUnified.model.value.canReviseInput).not.toBe(true);
  expect(foreignUnified.output.inputRecovery).toBeUndefined();
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
  const derived = await built.service.selectStoredResearchPassages(IDENTITY.organizationId, IDENTITY.userId, saved.snapshotKey, args.passages);
  expect(await built.service.readStoredResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, derived.snapshotKey)).not.toBeNull();
  const parentKey = [...built.rows.keys()].find(key => key.endsWith(`:${saved.snapshotKey}`));
  built.rows.delete(parentKey);
  expect(await built.service.readStoredResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, derived.snapshotKey)).toBeNull();
  const blocked = await run('piece.create.from-research', { text: input, snapshotKey: derived.snapshotKey,
    factKeys: derived.facts.map(fact => fact.factKey) }, built);
  expect(blocked.output.ok).toBe(false);
  expect(calls).toEqual([]);
});

test('an uncertain derived write cannot replay through another passage or the legacy selection', async () => {
    const built = build(); built.research.mockResolvedValue(longSourceResearch());
    const saved = unwrap((await run('research.search', { query: input }, built)).output);
    const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA,
      find: quoteA }, built)).output);
    const args = { text: input, snapshotKey: saved.snapshotKey, passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] };
    answers = [brief(), { text: 'Alpha поддерживает сессии.' }];
    built.writes.mockRejectedValue(new Error('Uncertain writer receipt'));
    const first = await run('piece.create.from-research', args, built);
    expect(first.output.ok).toBe(false);
    const callsBefore = calls.length;
    expect((await run('piece.create.from-research', args, built)).output.ok).toBe(false);
    const changedPassage = await run('piece.create.from-research', { ...args,
      passages: [{ ...args.passages[0], quote: quoteB }] }, built);
    expect(changedPassage.output.ok).toBe(false);
    const legacyCollision = await run('piece.create.from-research', { text: input, snapshotKey: saved.snapshotKey,
      factKeys: ['initial-preview'] }, built);
    expect(legacyCollision.output.ok).toBe(false);
    expect(calls).toHaveLength(callsBefore);
    expect(built.writes).toHaveBeenCalledTimes(1);
    expect(built.research).toHaveBeenCalledTimes(1);
});

test('a safe insufficient initial selection can read later evidence and revise without another search or a poisoned writer claim', async () => {
  const built = build(); built.research.mockResolvedValue(longSourceResearch());
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  answers = [brief({ inputSufficient: false })];
  const insufficient = await run('piece.create.from-research', { text: input, snapshotKey: saved.snapshotKey,
    factKeys: ['initial-preview'] }, built);
  expect(insufficient.output).toMatchObject({ ok: false, code: 'INTAKE_INPUT_INSUFFICIENT', canReviseInput: true });
  expect(built.writes).not.toHaveBeenCalled();
  expect([...built.rows.keys()].some(key => key.endsWith(':continuation'))).toBe(false);
  const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA,
    find: quoteA }, built)).output);
  expect(read.offset).toBeGreaterThan(200_000);
  answers = [brief(), { text: 'Alpha поддерживает сессии.' }];
  const args = { text: input, snapshotKey: saved.snapshotKey, passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] };
  expect((await run('piece.create.from-research', args, built)).output.ok).toBe(true);
  expect((await run('piece.create.from-research', args, built)).output.ok).toBe(true);
  expect(built.writes).toHaveBeenCalledTimes(1);
  expect(built.research).toHaveBeenCalledTimes(1);
  expect(built.fetch).not.toHaveBeenCalled();
});

test('a reuse-only create refusal identifies fixed selected quotes and accepts revised exact passages through the same tool', async () => {
  const built = build(); built.research.mockResolvedValue(longSourceResearch());
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  const understood = brief({ inputSufficient: false });
  understood.understanding.unresolvedChoices = ['The selected quote is incomplete. Search is globally unavailable.'];
  answers = [understood];
  const insufficient = await run('piece.create', { text: input, inputKind: 'instruction', research: 'none',
    researchId: saved.snapshotKey, factId: ['initial-preview'], material: 'An unsupported model paraphrase of a later source section.' }, built);
  expect(insufficient.output).toMatchObject({ ok: false, code: 'INTAKE_INPUT_INSUFFICIENT', canReviseInput: true,
    inputRecovery: { kind: 'research_selection', snapshotKey: saved.snapshotKey, selectedFactKeys: ['initial-preview'],
      selectedFactCount: 1, evidenceScope: 'captured_quotes_only', currentCall: { mode: 'reuse_only', newSearch: 'not_started' },
      globalSearchAvailability: 'not_assessed', sourceRead: { tool: 'piece.read', part: 'research_source', find: true, ranges: true },
      selection: { tool: 'piece.create', input: 'passages', fields: ['sourceUrl', 'revision', 'quote'] }, artifactWritten: false } });
  expect(insufficient.model).toEqual({ type: 'json', value: insufficient.output });
  expect(insufficient.output.reason).not.toContain('globally unavailable');
  expect(calls[0].prompt).toContain('Additional search inside this writing invocation: false');
  expect(calls[0].prompt).toContain('Saved research selection supplied: true');
  expect(calls[0].prompt).toContain('Global search provider availability: not assessed by this invocation');
  expect(built.writes).not.toHaveBeenCalled();
  expect([...built.rows.keys()].some(key => key.endsWith(':continuation'))).toBe(false);
  const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA,
    find: quoteA }, built)).output);
  answers = [brief(), { text: 'Alpha supports native sessions.' }];
  const revised = { text: input, material: reference, inputKind: 'instruction', research: 'none', researchId: saved.snapshotKey,
    passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] };
  expect((await run('piece.create', revised, built)).output).toMatchObject({ ok: true, summary: { pieceId: 'piece-1', factsKept: 1 } });
  expect((await run('piece.create', revised, built)).output.ok).toBe(true);
  expect(built.writes).toHaveBeenCalledTimes(1);
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(input);
  expect(calls[1].prompt).toContain(reference);
  expect(built.writes.mock.calls[0][1].brief.brief.facts).toEqual(expect.arrayContaining([
    expect.objectContaining({ statement: quoteA, quote: quoteA, sourceUrl: urlA, verified: true }),
  ]));
  expect(built.research).toHaveBeenCalledTimes(1);
  expect(built.fetch).not.toHaveBeenCalled();
});

test('a writer exception with the insufficiency code cannot acquire pre-write evidence recovery or release its claim', async () => {
  const built = build();
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  answers = [brief(), { text: 'Alpha supports native sessions.' }];
  built.writes.mockRejectedValue(Object.assign(new Error('Writer result is unknown.'), { code: 'INTAKE_INPUT_INSUFFICIENT' }));
  const args = { text: input, research: 'none', researchId: saved.snapshotKey, factId: ['alpha'] };
  const failed = await run('piece.create', args, built);
  expect(failed.output.ok).toBe(false);
  expect(failed.output.inputRecovery).toBeUndefined();
  expect(failed.output.canReviseInput).not.toBe(true);
  expect(failed.model.value.inputRecovery).toBeUndefined();
  const before = calls.length;
  const repeat = await run('piece.create', args, built);
  expect(repeat.output.ok).toBe(false);
  expect(repeat.output.inputRecovery).toBeUndefined();
  expect(calls).toHaveLength(before);
  expect(built.writes).toHaveBeenCalledTimes(1);
});

test.each(['claim', 'completed-result'])('a lost %s acknowledgement cannot reopen the existing writer scope', async boundary => {
  const built = build(); built.research.mockResolvedValue(longSourceResearch());
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA,
    find: quoteA }, built)).output);
  const originalClaim = built.snapshots.claim, originalSet = built.snapshots.set;
  let lost = false;
  built.snapshots.claim = async (key, value) => {
    const accepted = await originalClaim(key, value);
    if (boundary === 'claim' && key.endsWith(':continuation') && !lost) {
      lost = true; throw new Error('Lost native claim acknowledgement');
    }
    return accepted;
  };
  built.snapshots.set = async (key, value) => {
    if (boundary === 'completed-result' && JSON.parse(value).research?.continuation?.status === 'complete' && !lost) {
      lost = true; throw new Error('Lost completion persistence acknowledgement');
    }
    return originalSet(key, value);
  };
  answers = [brief(), { text: 'Alpha поддерживает сессии.' }];
  const args = { text: input, snapshotKey: saved.snapshotKey, passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] };
  await expect(run('piece.create.from-research', args, built)).rejects.toThrow(
    boundary === 'claim' ? 'Lost native claim acknowledgement' : 'Lost completion persistence acknowledgement');
  const callsBefore = calls.length;
  // A new service has no process-local pending map, only the real saved claim.
  const restart = build(); restart.service.snapshots = built.snapshots;
  expect((await run('piece.create.from-research', args, restart)).output.ok).toBe(false);
  expect((await run('piece.create.from-research', { ...args,
    passages: [{ ...args.passages[0], quote: quoteB }] }, restart)).output.ok).toBe(false);
  expect(calls).toHaveLength(callsBefore);
  expect(built.writes).toHaveBeenCalledTimes(boundary === 'claim' ? 0 : 1);
  expect(restart.writes).not.toHaveBeenCalled();
  expect([...built.rows.keys()].some(key => key.endsWith(`:${saved.snapshotKey}:continuation`))).toBe(true);
});

test('an uncertain legacy write also fences a newly selected retained passage', async () => {
  const built = build(); built.research.mockResolvedValue(longSourceResearch());
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA,
    find: quoteA }, built)).output);
  answers = [brief(), { text: 'An earlier section.' }];
  built.writes.mockRejectedValue(new Error('Unknown legacy writer effect'));
  expect((await run('piece.create.from-research', { text: input, snapshotKey: saved.snapshotKey,
    factKeys: ['initial-preview'] }, built)).output.ok).toBe(false);
  const callsBefore = calls.length;
  expect((await run('piece.create.from-research', { text: input, snapshotKey: saved.snapshotKey,
    passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] }, built)).output.ok).toBe(false);
  expect(calls).toHaveLength(callsBefore);
  expect(built.writes).toHaveBeenCalledTimes(1);
});

test('intake-origin snapshots retain full sources with actor authority and can feed late passages to the same writer', async () => {
  const built = build(); const found = longSourceResearch(); built.research.mockResolvedValue(found);
  const plan = await built.service.prepare(IDENTITY.organizationId, { input, inputKind: 'instruction', language: 'ru',
    options: { researchEnabled: true, researchLevel: 'standard' } }, { researchSelectionPolicy: 'model' });
  const evidence = new Map();
  const result = await built.service.researchForIntake(IDENTITY.organizationId, input, plan, evidence, 'standard');
  expect([...evidence.values()][0].fullText).toBe(found.sources[0].fullText);
  expect(result.sources[0].text.length).toBeLessThanOrEqual(6_000);
  const state = { filled: { brief: brief() }, evidence: [...evidence.values()], extraction: null, urls: [urlA],
    foreignShingles: [], level: 'standard', corrections: [], summary: { status: 'partial' }, correctedInput: '', resumePlan: plan };
  const snapshotKey = await built.service.writeSnapshot(IDENTITY.organizationId, IDENTITY.userId, state);
  const readyEvent = built.service.researchReadyEvent(state, snapshotKey);
  expect(JSON.stringify(readyEvent).length).toBeLessThan(6_000);
  expect(JSON.stringify(readyEvent)).not.toContain(quoteA);
  const read = unwrap((await run('piece.read', { researchId: snapshotKey, part: 'research_source', sourceUrl: urlA,
    find: quoteA }, built)).output);
  expect(read.offset).toBeGreaterThan(200_000);
  expect(read.text).toContain(quoteA);
  // Reading once populates a process preview. It must not authorize another actor.
  const foreign = await run('piece.read', { researchId: snapshotKey, part: 'research_source', sourceUrl: urlA }, built,
    { userId: 'another-person' });
  expect(foreign.output).toMatchObject({ ok: false, code: 'MATERIAL_NOT_AVAILABLE' });
  expect(foreign.output.canReviseInput).not.toBe(true);
  answers = [brief(), { text: 'Alpha поддерживает сессии.' }];
  expect((await run('piece.create.from-research', { text: input, snapshotKey,
    passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] }, built)).output.ok).toBe(true);
  expect(built.writes).toHaveBeenCalledTimes(1);
  expect(built.research).toHaveBeenCalledTimes(1);
});

test('passage captures are canonical across source order and keep multi-source evidence separate', async () => {
  const built = build();
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  const passages = [];
  for (const sourceUrl of [urlA, urlB]) {
    const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl }, built)).output);
    passages.push({ sourceUrl, revision: read.revision, quote: sourceUrl === urlA ? quoteA : quoteB });
  }
  const first = await built.service.selectStoredResearchPassages(IDENTITY.organizationId, IDENTITY.userId, saved.snapshotKey, passages);
  const reversed = await built.service.selectStoredResearchPassages(IDENTITY.organizationId, IDENTITY.userId, saved.snapshotKey, [...passages].reverse());
  expect(first.snapshotKey).toBe(reversed.snapshotKey);
  expect(first.facts.map(row => row.sourceUrl)).toEqual([urlA, urlB]);
  expect(first.evidence.map(row => row.excerpt)).toEqual([quoteA, quoteB]);
  const other = build();
  const parentRow = [...built.rows.values()].map(value => JSON.parse(value)).find(row => row.research?.snapshotKey === saved.snapshotKey);
  other.rows.set(`intake:snapshot:${IDENTITY.organizationId}:another-person:${saved.snapshotKey}`,
    JSON.stringify({ ...parentRow, actorUserId: 'another-person' }));
  const foreignDerived = await other.service.selectStoredResearchPassages(IDENTITY.organizationId, 'another-person', saved.snapshotKey, passages);
  expect(foreignDerived.snapshotKey).not.toBe(first.snapshotKey);
});

test.each(['piece.create', 'piece.create.from-research'].flatMap(capability =>
  ['person-policy', 'human-requirement'].map(policy => [capability, policy])))('%s retained source selection preserves the original %s', async (capability, policy) => {
  const built = build(); const found = longSourceResearch();
  const plan = await built.service.prepare(IDENTITY.organizationId, { input, inputKind: 'instruction', language: 'ru' },
    { researchSelectionPolicy: policy === 'person-policy' ? 'person' : 'model' });
  if (policy === 'human-requirement') plan.request = { ...brief().understanding, constraints: { humanFactSelection: true } };
  const state = { filled: { brief: brief() }, evidence: [{ evidenceId: 'native-evidence', url: urlA,
    title: 'Manual', excerpt: found.facts[0].text, fullText: found.sources[0].fullText }], extraction: null,
    urls: [urlA], foreignShingles: [], level: 'standard', corrections: [], summary: { status: 'partial' }, correctedInput: '', resumePlan: plan };
  const snapshotKey = await built.service.writeSnapshot(IDENTITY.organizationId, IDENTITY.userId, state);
  const read = unwrap((await run('piece.read', { researchId: snapshotKey, part: 'research_source', sourceUrl: urlA,
    find: quoteA }, built)).output);
  const result = await run(capability, { text: input, ...(capability === 'piece.create' ? { researchId: snapshotKey } : { snapshotKey }),
    passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] }, built);
  expect(result.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON' });
  expect(result.output.canReviseInput).not.toBe(true);
  expect(result.model.value.canReviseInput).not.toBe(true);
  expect(result.output.inputRecovery).toBeUndefined();
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
  expect(built.accepted).toEqual([]);
});

test('an existing piece research read uses the public scoped service only with both explicit ids', async () => {
  const built = build(); const found = longSourceResearch();
  built.pieces = { readCoreResearchSnapshot: jest.fn(async (org, pieceId, actorUserId, snapshotKey) =>
    org === IDENTITY.organizationId && actorUserId === IDENTITY.userId && pieceId === 'owned-piece' && snapshotKey === 'piece-research-snapshot'
      ? { snapshotKey, input: 'Original saved core.', summary: { status: 'partial' }, facts: [],
        evidence: [{ ...found.sources[0], excerpt: found.facts[0].text }] } : null) };
  const args = { pieceId: 'owned-piece', researchId: 'piece-research-snapshot', part: 'research_source', sourceUrl: urlA, find: quoteA };
  const read = unwrap((await run('piece.read', args, built)).output);
  expect(read.text).toContain(quoteA);
  expect(read.offset).toBeGreaterThan(200_000);
  expect(built.pieces.readCoreResearchSnapshot).toHaveBeenCalledWith(IDENTITY.organizationId, 'owned-piece', IDENTITY.userId, 'piece-research-snapshot');
  const callsBefore = built.pieces.readCoreResearchSnapshot.mock.calls.length;
  const withoutPiece = await run('piece.read', { researchId: args.researchId, part: 'research_source', sourceUrl: urlA }, built);
  expect(withoutPiece.output.ok).toBe(false);
  expect(built.pieces.readCoreResearchSnapshot).toHaveBeenCalledTimes(callsBefore);
  expect((await run('piece.read', args, built, { userId: 'another-person' })).output.ok).toBe(false);
  expect((await run('piece.read', { ...args, pieceId: 'another-piece' }, built)).output.ok).toBe(false);
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
});

test('a retained descendant cannot outlive its immediate parent or bypass a terminal root when the native claim expires', async () => {
  const built = build(); built.research.mockResolvedValue(longSourceResearch());
  let now = 0;
  const expiries = new Map();
  built.snapshots.get = async key => {
    if ((expiries.get(key) ?? Infinity) <= now) built.rows.delete(key);
    return built.rows.get(key);
  };
  built.snapshots.set = async (key, value, _mode, seconds) => {
    built.rows.set(key, value); expiries.set(key, now + seconds); return true;
  };
  built.snapshots.claim = async (key, value, seconds) => {
    if (await built.snapshots.get(key)) return false;
    await built.snapshots.set(key, value, 'EX', seconds); return true;
  };
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA }, built)).output);
  now = 10;
  const parent = await built.service.selectStoredResearchPassages(IDENTITY.organizationId, IDENTITY.userId, saved.snapshotKey,
    [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }]);
  now = 30;
  answers = [brief(), { text: 'An earlier section.' }];
  built.writes.mockImplementation(async () => { now = 50; return { id: 'piece-1', code: 'cnt-1' }; });
  expect((await run('piece.create.from-research', { text: input, snapshotKey: saved.snapshotKey,
    factKeys: ['initial-preview'] }, built)).output.ok).toBe(true);
  now = 60;
  const passage = [{ sourceUrl: urlA, revision: read.revision, quote: quoteB }];
  await expect(built.service.selectStoredResearchPassages(IDENTITY.organizationId, IDENTITY.userId,
    parent.snapshotKey, passage)).rejects.toMatchObject({ code: 'INTAKE_RESEARCH_SELECTION_CONFLICT' });
  // A descendant persisted by the pre-repair code must also fail closed.
  const child = await built.service.storeResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, {
    query: input, level: 'standard', summary: { status: 'partial' }, sources: parent.sources,
    facts: [{ factKey: 'late-quote', statement: quoteB, quote: quoteB, sourceUrl: urlA }],
  }, { snapshotKey: 'res_pre-repair-descendant', parentSnapshotKey: parent.snapshotKey, sourceSnapshotKey: saved.snapshotKey });
  now = 3_635;
  const rootKey = `intake:snapshot:${IDENTITY.organizationId}:${IDENTITY.userId}:${saved.snapshotKey}`;
  expect(await built.snapshots.get(`${rootKey}:continuation`)).toBeUndefined();
  expect(await built.snapshots.get(rootKey)).toBeDefined();
  expect(await built.service.readStoredResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, child.snapshotKey)).toBeNull();
  // Even if a parent remains available, terminal root state itself fences
  // admission after claim expiry rather than depending on TTL coincidence.
  const parentKey = `intake:snapshot:${IDENTITY.organizationId}:${IDENTITY.userId}:${parent.snapshotKey}`;
  await built.snapshots.set(parentKey, JSON.stringify({ organizationId: IDENTITY.organizationId,
    actorUserId: IDENTITY.userId, research: parent }), 'EX', 100);
  const restored = await built.service.readStoredResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, child.snapshotKey);
  expect(restored).not.toBeNull();
  const before = calls.length;
  const rejected = await run('piece.create.from-research', { text: input, snapshotKey: child.snapshotKey,
    factKeys: ['late-quote'] }, built);
  expect(rejected.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SELECTION_CONFLICT' });
  expect(calls).toHaveLength(before);
  expect(built.writes).toHaveBeenCalledTimes(1);
});

test.each(['piece.create', 'piece.create.from-research'].flatMap(capability =>
  [false, true].map(mixed => [capability, mixed])))('%s native passage continuation preserves the captured plan, private answers and source/profile binding (mixed keys=%s)', async (capability, mixed) => {
  const built = build(); const found = longSourceResearch();
  const original = 'Original author instruction, with exclusions retained exactly.';
  const nativeRequest = { ...brief().understanding, goal: 'Native captured goal',
    constraints: { research: 'required', humanFactSelection: false, title: 'CAPTURED NATIVE TITLE', requirements: ['Keep the author restriction.'] } };
  const plan = await built.service.prepare(IDENTITY.organizationId, {
    input: original, inputKind: 'instruction', language: 'ru', contextMaterial: 'PRIVATE_CONTEXT_ONLY_IN_NATIVE_PLAN',
    request: nativeRequest, answers: [{ field: 'position', text: 'PRIVATE_AUTHOR_POSITION' }], decide: ['audience'],
    interview: [{ key: 'personal_detail', text: 'PRIVATE_INTERVIEW_EXAMPLE', origin: 'person' }], decideKeys: ['hook'],
    briefOverrides: { thesis: 'AUTHOR_THESIS_OVERRIDE' }, skipInterview: true,
    brandProfileSelection: { mode: 'version', versionId: 'captured-profile-version' }, sourceLeadId: 'captured-owned-lead',
    timeZone: 'Europe/Moscow', priorExample: 'AUTHOR_PRIOR_EXAMPLE', options: { researchEnabled: true, researchLevel: 'deep' },
  }, { researchSelectionPolicy: 'model' });
  const nativeFact = { ...findings[0], factKey: 'native-late-fact', evidenceId: 'native-owned-evidence',
    status: 'confirmed', verified: true, selected: true, origin: 'search', kind: 'found' };
  const authorFact = { factKey: 'author-fact', statement: 'Author supplied private experience.', origin: 'person',
    kind: 'own', verified: true, selected: true };
  const state = { filled: { brief: { ...brief(), inputKind: 'instruction', facts: [authorFact, nativeFact] }, inputSufficient: false },
    evidence: [{ evidenceId: 'native-owned-evidence', url: urlA, title: 'Manual', excerpt: found.facts[0].text,
      fullText: found.sources[0].fullText }], extraction: null, urls: [urlA], foreignShingles: [], level: 'deep',
    corrections: [], summary: { status: 'partial' }, correctedInput: '', inputKind: 'instruction', inputKindExplicit: true, resumePlan: plan };
  const nativeKey = await built.service.writeSnapshot(IDENTITY.organizationId, IDENTITY.userId, state);
  const read = unwrap((await run('piece.read', { researchId: nativeKey, part: 'research_source', sourceUrl: urlA, find: quoteB }, built)).output);
  const brand = jest.fn(async () => ({ effectiveVoice: null })); built.service.brandProfiles = { resolve: brand };
  built.service.leads = { getLead: jest.fn(async () => ({ sourceUrl: 'https://owned.example/original-lead', title: 'Owned original lead' })) };
  const finish = jest.spyOn(built.service, 'finish');
  const reconsidered = brief(); reconsidered.understanding.constraints.humanFactSelection = true;
  answers = [reconsidered, { text: 'Alpha and Beta are supported.' }];
  const args = { text: 'A later tool argument must not replace the captured author plan.',
    ...(capability === 'piece.create' ? { researchId: nativeKey } : { snapshotKey: nativeKey }),
    passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteB }],
    ...(mixed ? capability === 'piece.create' ? { factId: ['native-late-fact'] } : { factKeys: ['native-late-fact'] } : {}) };
  const created = await run(capability, args, built);
  expect(created.output.ok).toBe(true);
  const stored = built.writes.mock.calls[0][1];
  expect(stored.title).toBe('CAPTURED NATIVE TITLE');
  expect(stored.brief.inputText).toBe(original);
  expect(stored.brief.request).toEqual(nativeRequest);
  expect(stored.brief.brief.position).toBe('PRIVATE_AUTHOR_POSITION');
  expect(stored.brief.brief.thesis).toBe('AUTHOR_THESIS_OVERRIDE');
  expect(stored.brief.leadSource).toEqual({ leadId: 'captured-owned-lead', url: 'https://owned.example/original-lead', title: 'Owned original lead' });
  const consumedPlan = finish.mock.calls[0][1];
  for (const field of ['input', 'contextMaterial', 'request', 'answers', 'decide', 'interview', 'decideKeys',
    'skipInterview', 'briefOverrides', 'brandProfileSelection', 'sourceLeadId', 'priorExample', 'timeZone', 'resolvedResearchIntent']) {
    expect(consumedPlan[field]).toEqual(plan[field]);
  }
  expect(stored.brief.brief.facts).toEqual(expect.arrayContaining([expect.objectContaining(authorFact)]));
  if (mixed) expect(stored.brief.brief.facts).toEqual(expect.arrayContaining([expect.objectContaining({ factKey: nativeFact.factKey, quote: quoteA })]));
  expect(calls[0].prompt).toContain('PRIVATE_CONTEXT_ONLY_IN_NATIVE_PLAN');
  expect(calls[0].prompt).toContain(quoteB);
  expect(brand.mock.calls.every(call => call[1].versionId === 'captured-profile-version')).toBe(true);
  expect((await run(capability, args, built)).output.ok).toBe(true);
  expect(built.writes).toHaveBeenCalledTimes(1);
  expect(built.research).not.toHaveBeenCalled();
  expect(built.fetch).not.toHaveBeenCalled();
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

test('unified passage selection retains a direct person-selection request without creating model consent', async () => {
  const built = build(); built.research.mockResolvedValue(longSourceResearch());
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA, find: quoteA }, built)).output);
  const result = await run('piece.create', { text: input, researchId: saved.snapshotKey, selection: 'person',
    passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] }, built);
  expect(result.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON' });
  expect(result.output.canReviseInput).not.toBe(true);
  expect(result.model.value.canReviseInput).not.toBe(true);
  expect(result.output.inputRecovery).toBeUndefined();
  expect(built.writes).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
  expect([...built.rows.keys()].some(key => key.endsWith(':continuation'))).toBe(false);
});

test('passages without an explicit owned research id request input repair before any provider or source write', async () => {
  const built = build();
  const result = await run('piece.create', { text: input, passages: [{ sourceUrl: urlA, revision: '0'.repeat(64), quote: quoteA }] }, built);
  expect(result.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SNAPSHOT_REQUIRED', canReviseInput: true });
  expect(result.model.value).toMatchObject({ code: 'INTAKE_RESEARCH_SNAPSHOT_REQUIRED', canReviseInput: true });
  expect(result.output.inputRecovery).toBeUndefined();
  expect(calls).toEqual([]);
  expect(built.accepted).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
  expect(built.research).not.toHaveBeenCalled();
});

test.each([
  ['assistant verification', false, 'Проверь факты по первоисточнику, сохрани заметку, затем прочитай сохранённый результат и проверь его.'],
  ['user fact choice', true, 'Покажи мне найденные факты и дождись моего выбора до сохранения заметки.'],
  ['designated reviewer choice', true, 'Дай редактору выбрать факты и дождись его одобрения до сохранения заметки.'],
])('the consumed brief preserves the actor and stage of %s', async (_scenario, humanFactSelection, original) => {
  const built = build();
  const saved = unwrap((await run('research.search', { query: input }, built)).output);
  const read = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceUrl: urlA }, built)).output);
  const understood = brief(); understood.understanding.constraints.humanFactSelection = humanFactSelection;
  answers = [understood, { text: 'Alpha supports native sessions.' }];
  const result = await run('piece.create.from-research', { text: original, inputKind: 'instruction', snapshotKey: saved.snapshotKey,
    passages: [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }] }, built);
  expect(calls[0].prompt).toContain(original);
  expect(calls[0].prompt).toContain(quoteA);
  if (humanFactSelection) {
    expect(result.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON' });
    expect(result.model.value.canReviseInput).not.toBe(true);
    expect(result.output.inputRecovery).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(built.writes).not.toHaveBeenCalled();
    expect([...built.rows.keys()].some(key => key.endsWith(':continuation'))).toBe(false);
  } else {
    expect(result.output).toMatchObject({ ok: true, summary: { pieceId: 'piece-1', selectionOrigin: 'model' } });
    expect(built.writes).toHaveBeenCalledTimes(1);
    expect(built.writes.mock.calls[0][1].brief.inputText).toBe(original);
    expect(built.writes.mock.calls[0][1].brief.request.constraints.humanFactSelection).toBe(false);
  }
  expect(built.research).toHaveBeenCalledTimes(1);
  expect(built.fetch).not.toHaveBeenCalled();
});

// Reuse the actual producer's existing ports; no fake research result bypasses
// admission, reader compilation, cache identity or source bounds in this test.
const fs = require('node:fs');
const producerPorts = fs.readFileSync(require('node:path').join(__dirname, 'web.research.source-admission.test.cjs'), 'utf8');
let resetProducer;
const producer = new Function('require', 'beforeEach', producerPorts.slice(0,
  producerPorts.indexOf("describe('Russian advertising-labeling reader admission'"))
  .replace('modelLedgers: [],', 'modelLedgers: [], warnings: [],').replace('warn() {}', 'warn(message) { calls.warnings.push(message); }') + `
  return { calls, WebResearchService, aiUsage,
    configure(results, review) {
      aiConfig.search.provider='exa'; aiConfig.search.topic='general';
      responses.exa=({query})=>({usage:{costUsd:0.001},results:results[query]});
      summaryOutput=review;
    }
  };
`)(require, callback => { resetProducer = callback; });
const readerEvidence = prompt => JSON.parse(prompt.slice(prompt.indexOf('Untrusted reader evidence:\n') + 'Untrusted reader evidence:\n'.length));

test('actual explicit-query producer fairly admits late query pages, semantically reviews beyond first eight, and saves source-only selection without another fetch', async () => {
  resetProducer();
  const query = 'Targetneedle native sessions and pending changes: explain the documented capability.';
  const targetQuote = 'Targetneedle native sessions preserve pending changes.';
  const targetUrl = 'https://docs.example/targetneedle';
  const literalUrl = 'https://docs.example/source-only';
  const noise = (prefix, index) => ({ url: `https://example.org/${prefix}-${index}`, title: 'Unrelated background',
    rawContent: (`Unrelated ${prefix} document ${index} background and surrounding prose. `.repeat(150)) });
  const target = { url: targetUrl, title: 'Targetneedle native sessions',
    rawContent: 'General introduction. '.repeat(90) + '\n\n' + targetQuote };
  const literal = { url: literalUrl, title: 'A separately captured page', rawContent: 'A separately retained source passage for explicit editorial selection.' };
  const results = { broad: Array.from({length:55}, (_, index)=>noise('broad',index)),
    secondary: [...Array.from({length:10}, (_, index)=>noise('secondary',index)), target],
    precise: [literal] };
  let presented;
  producer.configure(results, prompt => {
    presented = readerEvidence(prompt);
    const targetSource = presented.sources.find(source => source.url === targetUrl);
    expect(targetSource).toBeDefined();
    expect(Number(targetSource.id.slice(1))).toBeGreaterThan(8);
    expect(targetSource.excerpt).toContain(targetQuote);
    return { scopeQuote:null,scopeStatus:'not_temporal',answer: targetQuote, references: presented.sources.map(source => ({ id: source.id,
      relevance: source.url === targetUrl ? 'relevant' : 'irrelevant' })), gaps: [] };
  });
  const built = build();
  const service = new producer.WebResearchService(producer.aiUsage);
  built.research = jest.fn((org, subject, options) => service.research(org, subject, options));
  const found = await run('research.search', { query, level: 'deep', queries: ['broad','secondary','precise'] }, built);
  expect(found.output.ok).toBe(true);
  const output = unwrap(found.output);
  expect(producer.calls.search.map(call=>call.input.query)).toEqual(['broad','secondary','precise']);
  expect(producer.calls.model.map(call=>call.role)).toEqual(['classify']); // reader only, no query classifier
  if (output.assessment.status === 'review_unavailable') throw new Error(JSON.stringify({warnings:producer.calls.warnings,presented:presented?.sources.find(source=>source.url===targetUrl)}));
  expect(output.assessment).toMatchObject({ status: 'partial' });
  expect(output.assessment.inputBytes).toBeLessThanOrEqual(25_000);
  expect(output.sourceCount).toBe(50);
  expect(output.sources.some(source=>source.url===literalUrl)).toBe(true);
  const targetFact = output.facts.find(fact=>fact.sourceUrl===targetUrl && !fact.sourcePassage);
  expect(targetFact).toMatchObject({status:'confirmed',selected:true});
  const literalCandidate = output.facts.find(fact=>fact.sourceUrl===literalUrl && fact.sourcePassage);
  expect(literalCandidate).toMatchObject({status:'unverified',selected:false,sourcePassage:true});
  const snapshot = await built.service.readStoredResearchEvidence(IDENTITY.organizationId,IDENTITY.userId,output.snapshotKey);
  const { selectReusableResearch } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/research-reuse.ts');
  expect(selectReusableResearch(snapshot).some(fact=>fact.sourceUrl===literalUrl)).toBe(false);
  const tampered=JSON.parse(JSON.stringify(snapshot));
  tampered.facts.find(fact=>fact.factKey===literalCandidate.factKey).statement='An invented claim citing an existing source id.';
  expect(()=>selectReusableResearch(tampered,[literalCandidate.factKey])).toThrow(/literal text/);
  const foreign=await run('piece.create.from-research',{snapshotKey:output.snapshotKey,factKeys:[literalCandidate.factKey],text:query},built,{userId:'other-user'});
  expect(foreign.output).toMatchObject({ok:false,code:'INTAKE_RESEARCH_SNAPSHOT_UNAVAILABLE'});
  expect(snapshot.evidence.find(row=>row.url===literalUrl).excerpt).toBe(literal.rawContent);
  answers=[brief({ understanding:{version:'intake-request/v1',goal:query,constraints:{research:'allowed'}} }),{text:targetQuote}];
  const created=await run('piece.create.from-research',{snapshotKey:output.snapshotKey,factKeys:[targetFact.factKey,literalCandidate.factKey],text:query},built);
  expect(created.output).toMatchObject({ok:true,summary:{factsKept:2}});
  expect(built.research).toHaveBeenCalledTimes(1);
  expect(built.fetch).not.toHaveBeenCalled();
  const facts=built.writes.mock.calls[0][1].brief.brief.facts;
  expect(facts).toEqual(expect.arrayContaining([
    expect.objectContaining({sourceUrl:targetUrl,quote:expect.stringContaining(targetQuote),verified:true}),
    expect.objectContaining({sourceUrl:literalUrl,quote:literal.rawContent,verified:true}),
  ]));
});

test('supplied queries with readerResponse false retain the no-reader model budget and exact query text', async () => {
  resetProducer();
  producer.configure({ exact:[{url:'https://example.org/no-reader',title:'Source',content:'A real source passage about a documented capability and the way it works.', rawContent:'A real source passage about a documented capability and the way it works.'}] }, () => {throw new Error('Reader must not run');});
  const result=await new producer.WebResearchService(producer.aiUsage).research('org', 'Original subject',{
    level:'deep',language:'ru',readerResponse:false,queries:['exact']});
  expect(producer.calls.search.map(call=>call.input.query)).toEqual(['exact']);
  expect(producer.calls.model).toEqual([]);
  expect(result.readerAssessment).toBeUndefined();
  expect(result.facts).toHaveLength(1);
});

test('reader cache identity cannot replay the old supplied-query no-reader outcome', async () => {
  resetProducer();
  const passage='A documented capability preserves pending changes for the author.';
  producer.configure({exact:[{url:'https://example.org/cache-source',title:'Capability',content:passage,rawContent:passage}]},prompt=>{
    const evidence=readerEvidence(prompt);
    return {scopeQuote:null,scopeStatus:'not_temporal',answer:passage,references:evidence.sources.map(source=>({id:source.id,relevance:'relevant'})),gaps:[]};
  });
  const service=new producer.WebResearchService(producer.aiUsage);
  const options={level:'deep',language:'ru',queries:['exact']};
  await service.research('org','Capability',{...options,readerResponse:false});
  const consumerKey=service.cache.journal().at(-1).key;
  service.cache.set(consumerKey.replace('|consumer|','|reader|'),{provider:'exa',summary:'OLD_UNREVIEWED_CACHE',facts:[],sources:[]});
  const reviewed=await service.research('org','Capability',{...options,readerResponse:true});
  expect(reviewed.summary).not.toContain('OLD_UNREVIEWED_CACHE');
  expect(reviewed.readerAssessment.status).toBe('supported');
  expect(service.cache.journal().at(-1).key).toContain('|reader-summary/v4|exact|');
  expect(producer.calls.search).toHaveLength(2);
  expect(producer.calls.model).toHaveLength(1);
});

test('actual producer insufficient-evidence assessment keeps candidates inspectable but refuses explicit reuse before any model, claim or writer', async () => {
  resetProducer();
  const passage='The captured article describes unrelated background and supplies no requested result.';
  producer.configure({ exact:[{url:'https://example.org/unrelated',title:'Unrelated article',content:passage,rawContent:passage}] },prompt=>{
    const evidence=readerEvidence(prompt);
    return {scopeQuote:null,scopeStatus:'not_temporal',answer:'',references:evidence.sources.map(source=>({id:source.id,relevance:'irrelevant'})),gaps:['The requested result is not supported.']};
  });
  const built=build();
  const service=new producer.WebResearchService(producer.aiUsage);
  built.research=jest.fn((org,subject,options)=>service.research(org,subject,options));
  const found=await run('research.search',{query:'Explain the requested capability.',level:'deep',queries:['exact']},built);
  expect(found.output.ok).toBe(true);
  const output=unwrap(found.output);
  expect(output.assessment).toMatchObject({status:'insufficient_evidence'});
  const candidate=output.facts.find(fact=>fact.sourcePassage);
  expect(candidate).toMatchObject({status:'unverified',selected:false});
  answers=[brief(),{text:'This must never be written.'}];
  const result=await run('piece.create.from-research',{snapshotKey:output.snapshotKey,factKeys:[candidate.factKey],text:'Explain the requested capability.'},built);
  expect(result.output).toMatchObject({ok:false,code:'INTAKE_RESEARCH_INCOMPLETE'});
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
  expect([...built.rows.keys()].some(key=>key.endsWith(':continuation'))).toBe(false);
  expect(producer.calls.model).toHaveLength(1);
});

test.each([
  ['en','from 9 October 2026 through 20 October 2026','Prepare a new overview from 9 October 2026 through 20 October 2026. The previous reference covered 6–8 October 2026, with an example dated 7 October 2026.','The documented capability shipped on 15 October 2026.'],
  ['ru','с 9 октября 2026 года по 20 октября 2026 года','Подготовь новый обзор с 9 октября 2026 года по 20 октября 2026 года. Прошлый пример охватывал 6–8 октября 2026 года и содержал событие от 7 октября 2026 года.','Документированная функция появилась 15 октября 2026 года.'],
  ['en','from 09/10/2026 through 20/10/2026','Prepare a new overview from 09/10/2026 through 20/10/2026. The previous reference covered 7 October 2026.','The documented capability shipped on 15 October 2026.'],
])('actual %s producer preserves range framing %s separately from sourced event dates', async (language,scopeQuote,subject,passage) => {
  resetProducer();
  let reviewedSubject;
  producer.configure({exact:[{url:'https://example.org/dated-capability',title:'Documented capability',content:passage,rawContent:passage}]},prompt=>{
    const evidence=readerEvidence(prompt);
    reviewedSubject=evidence.subject;
    expect(evidence.requestedDate).toBeNull();
    return {scopeQuote,scopeStatus:'resolved',answer:passage,references:evidence.sources.map(source=>({id:source.id,relevance:'relevant'})),gaps:[]};
  });
  const service=new producer.WebResearchService(producer.aiUsage);
  const result=await service.research('org',subject,{level:'deep',language,readerResponse:true,queries:['exact']});
  expect(producer.calls.search.map(call=>call.input.query)).toEqual(['exact']);
  expect(producer.calls.model.map(call=>call.role)).toEqual(['classify']);
  expect(reviewedSubject).toBe(subject);
  expect(result.readerAssessment).toMatchObject({status:'supported',requestedDate:null});
  expect(result.readerAssessment.inputBytes).toBeGreaterThan(0);
  expect(result.summary).toContain(passage);
  expect(result.summary).toContain(scopeQuote);
  expect(result.facts).toEqual([{sourceUrl:'https://example.org/dated-capability',text:passage}]);
});


test('actual producer unresolved temporal scope refuses native reuse even with a literal relevant source', async () => {
  resetProducer();
  const query='Explain the capability as of 31 February 2026.';
  const passage='The documented capability shipped on 15 October 2026.';
  producer.configure({exact:[{url:'https://example.org/dated-capability',title:'Documented capability',content:passage,rawContent:passage}]},prompt=>{
    const evidence=readerEvidence(prompt);
    expect(evidence.subject).toBe(query);
    expect(evidence.requestedDate).toBeNull();
    return {scopeQuote:'as of 31 February 2026',scopeStatus:'needs_clarification',answer:passage,
      references:evidence.sources.map(source=>({id:source.id,relevance:'relevant'})),gaps:['The requested calendar date does not exist.']};
  });
  const built=build();
  const service=new producer.WebResearchService(producer.aiUsage);
  built.research=jest.fn((org,subject,options)=>service.research(org,subject,options));
  const found=await run('research.search',{query,level:'deep',queries:['exact']},built);
  expect(found.output.ok).toBe(true);
  const output=unwrap(found.output);
  expect(output.assessment).toMatchObject({status:'insufficient_evidence'});
  expect(output.assessment.inputBytes).toBeGreaterThan(0);
  expect(output.facts.filter(fact=>!fact.sourcePassage)).toEqual([]);
  const candidate=output.facts.find(fact=>fact.sourcePassage);
  expect(candidate).toMatchObject({status:'unverified',selected:false,quote:passage});
  answers=[brief(),{text:'This must never be written.'}];
  const result=await run('piece.create.from-research',{snapshotKey:output.snapshotKey,factKeys:[candidate.factKey],text:query},built);
  expect(result.output).toMatchObject({ok:false,code:'INTAKE_RESEARCH_INCOMPLETE'});
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
  expect([...built.rows.keys()].some(key=>key.endsWith(':continuation'))).toBe(false);
  expect(built.fetch).not.toHaveBeenCalled();
  expect(producer.calls.model).toHaveLength(1);
});

test('literal source spans retain Unicode compatibility characters before tolerant matching', () => {
  const { exactResearchSourceSpan } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.v4.ts');
  const passage='The original note ¯_(ツ)_/¯ stays exactly as captured.';
  expect(exactResearchSourceSpan(passage,passage)).toBe(passage);
  expect(exactResearchSourceSpan(passage,`Introduction\n${passage}\nConclusion`)).toBe(passage);
  expect(exactResearchSourceSpan('¯_(ツ)_/¯',passage)).toBe('¯_(ツ)_/¯');
  expect(exactResearchSourceSpan('The absent note ¯_(ツ)_/¯',passage)).toBeNull();
  expect(exactResearchSourceSpan('',passage)).toBeNull();
  expect(exactResearchSourceSpan('   ',passage)).toBeNull();
  // The existing punctuation/whitespace-tolerant fallback still returns the
  // actual source span when the caller did not supply a literal substring.
  expect(exactResearchSourceSpan('A "quoted" - sentence.', 'A “quoted”  — sentence.')).toBe('A “quoted”  — sentence.');
});

test('literal Unicode source capture survives the real registry normalization and owned reuse without refetch', async () => {
  const { ContentSourceRegistryService } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/source-registry/source-registry.service.ts', {
    './source-registry.repository': { ContentSourceRegistryRepository: class {} },
    './source-fetch.gateway': { SourceFetchGateway: class {} },
  });
  const passage='The original note ¯_(ツ)_/¯ stays exactly as captured.';
  const gateway={fetch:jest.fn(async()=>{throw new Error('No source fetch is allowed');})};
  const persisted=[];
  const repository={
    findFreshSearchProviderEvidence:jest.fn(async()=>null),
    createSearchProviderEvidence:jest.fn(async payload=>{
      persisted.push(payload);
      return {id:'literal-snapshot',finalCanonicalUrl:payload.finalCanonicalUrl,
        normalizedTitle:payload.normalizedTitle,publishedAt:payload.publishedAt,
        evidence:[{id:'literal-evidence',excerpt:payload.excerpt,observedAt:payload.observedAt,freshUntil:payload.freshUntil}]};
    }),
  };
  const registry=new ContentSourceRegistryService(repository,gateway,{},undefined,()=>new Date('2026-10-20T09:00:00Z'));
  const built=build();
  built.service.sources=registry;
  const snapshot=await built.service.storeResearchEvidence('org','person',{
    query:'Explain the original note.',level:'standard',summary:{status:'supported'},facts:[],
    sources:[{url:'https://example.org/unicode-source',title:'Original\u0001 note',provider:'exa',text:passage}],
  });
  expect(persisted).toHaveLength(1);
  expect(persisted[0]).toMatchObject({excerpt:passage,normalizedTitle:'Original note'});
  expect(repository.findFreshSearchProviderEvidence).toHaveBeenCalledWith('org',{contentHash:persisted[0].contentHash},expect.any(Date));
  const saved=await built.service.readStoredResearchEvidence('org','person',snapshot.snapshotKey);
  expect(saved.facts).toEqual([expect.objectContaining({sourcePassage:true,verified:false,selected:false,quote:passage})]);
  expect(saved.evidence).toEqual([expect.objectContaining({evidenceId:'literal-evidence',excerpt:passage})]);
  const { selectReusableResearch } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/research-reuse.ts');
  expect(selectReusableResearch(saved,[saved.facts[0].factKey])).toEqual([expect.objectContaining({quote:passage,verified:true,selected:true})]);
  const forged=JSON.parse(JSON.stringify(saved));
  forged.facts[0].quote=forged.facts[0].statement='An absent claim ¯_(ツ)_/¯ cannot be confirmed.';
  expect(()=>selectReusableResearch(forged,[forged.facts[0].factKey])).toThrow(/saved supporting source and quote/);
  expect(gateway.fetch).not.toHaveBeenCalled();
  expect(built.fetch).not.toHaveBeenCalled();
  expect(built.research).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
});

const capturePair=async built=>{
  const first=await built.service.storeResearchEvidence(IDENTITY.organizationId,IDENTITY.userId,{query:'News task',level:'standard',summary:{status:'supported',gaps:['News coverage is bounded.']},facts:[findings[0]],sources:researchResult().sources.slice(0,1)});
  const second=await built.service.storeResearchEvidence(IDENTITY.organizationId,IDENTITY.userId,{query:'Reset task',level:'quick',summary:{status:'partial',gaps:['Account eligibility remains unknown.']},facts:[{...findings[1],factKey:'alpha'}],sources:researchResult().sources.slice(1)});
  return [{snapshotKey:first.snapshotKey,factKeys:['alpha']},{snapshotKey:second.snapshotKey,factKeys:['alpha']}];
};

test('actual producer multi-capture selection preserves both source quotes through one durable brief and completed replay', async()=>{
  resetProducer();
  producer.configure({news:[{url:urlA,title:'Alpha',content:quoteA,rawContent:quoteA}],reset:[{url:urlB,title:'Beta',content:quoteB,rawContent:quoteB}]},prompt=>{
    const evidence=readerEvidence(prompt);
    return {scopeQuote:null,scopeStatus:'not_temporal',answer:evidence.sources[0].excerpt,references:evidence.sources.map(source=>({id:source.id,relevance:'relevant'})),gaps:[]};
  });
  const built=build(),service=new producer.WebResearchService(producer.aiUsage);
  built.research=jest.fn((org,subject,options)=>service.research(org,subject,options));
  const refs=[];
  for(const query of ['news','reset']){
    const searched=unwrap((await run('research.search',{query,level:'quick',queries:[query]},built)).output);
    refs.push({snapshotKey:searched.snapshotKey,factKeys:[searched.facts[0].factKey]});
  }
  answers=[brief(),{text:'Both changes.'}];
  const created=await run('piece.create.from-research',{references:refs,text:input},built);
  expect(created.output).toMatchObject({ok:true,summary:{factsKept:2}});
  const facts=built.writes.mock.calls[0][1].brief.brief.facts;
  expect(facts).toEqual(expect.arrayContaining([expect.objectContaining({sourceUrl:urlA,quote:quoteA,verified:true}),expect.objectContaining({sourceUrl:urlB,quote:quoteB,verified:true})]));
  const repeated=await run('piece.create.from-research',{references:[...refs].reverse(),text:input},built);
  expect(repeated.output).toMatchObject({ok:true,summary:{pieceId:'piece-1'}});
  expect(built.writes).toHaveBeenCalledTimes(1);
  expect(built.fetch).not.toHaveBeenCalled();
  expect(built.research).toHaveBeenCalledTimes(2);
});

test('multi-capture qualifies colliding keys and preserves immutable members, assessments and original request',async()=>{
  const built=build(),references=await capturePair(built);
  answers=[brief(),{text:'Both changes.'}];
  const created=await run('piece.create',{references,text:input,material:reference,research:'none'},built);
  expect(created.output).toMatchObject({ok:true,summary:{factsKept:2}});
  const core=built.writes.mock.calls[0][1].brief;
  expect(core.inputText).toBe(input);
  expect(new Set(core.brief.facts.map(f=>f.factKey)).size).toBe(2);
  expect(core.brief.facts.map(f=>f.quote)).toEqual(expect.arrayContaining([quoteA,quoteB]));
  expect(calls[0].prompt).not.toContain('Introduction '.repeat(20));
  expect(calls[0].prompt).not.toContain('Other content '.repeat(20));
  const id=created.output.summary.reusedResearchId;
  const merged=await built.service.readStoredResearchEvidence(IDENTITY.organizationId,IDENTITY.userId,id);
  expect(merged.members.map(m=>m.snapshotKey).sort()).toEqual(references.map(r=>r.snapshotKey).sort());
  expect(JSON.stringify(merged.summary)).toContain('Account eligibility remains unknown.');
  expect(JSON.stringify(merged.summary)).toContain('News coverage is bounded.');
  expect(merged.facts).toHaveLength(4); // complete immutable members include literal candidates too
  const member=await built.service.readStoredResearchEvidence(IDENTITY.organizationId,IDENTITY.userId,references[0].snapshotKey);
  const otherKey=member.facts.find(f=>f.sourcePassage).factKey;
  const changed=await run('piece.create.from-research',{references:[{...references[0],factKeys:[otherKey]},references[1]],text:input},built);
  expect(changed.output).toMatchObject({ok:false,code:'INTAKE_RESEARCH_SELECTION_CONFLICT'});

  const conflict=await run('piece.create.from-research',{references:[{...references[0],factKeys:[references[0].factKeys[0]]},{...references[1],factKeys:['missing']}],text:input},built);
  expect(conflict.output).toMatchObject({ok:false,code:'INTAKE_RESEARCH_SELECTION_INVALID'});
  expect(built.writes).toHaveBeenCalledTimes(1);
});

test('multi-capture ownership, status, missing request and mixed contracts fail before any claim, model or writer',async()=>{
  const built=build(),references=await capturePair(built);
  const foreign=await run('piece.create.from-research',{references,text:input},built,{userId:'foreign'});
  expect(foreign.output).toMatchObject({ok:false,code:'INTAKE_RESEARCH_SNAPSHOT_UNAVAILABLE'});
  const noRequest=await run('piece.create.from-research',{references},built);
  expect(noRequest.output.ok).toBe(false);
  const mixed=await run('piece.create.from-research',{references,snapshotKey:references[0].snapshotKey,factKeys:['alpha'],text:input},built);
  expect(mixed.output.ok).toBe(false);
  const raw=await built.service.readStoredResearchEvidence(IDENTITY.organizationId,IDENTITY.userId,references[1].snapshotKey);
  raw.summary={status:'insufficient_evidence'};
  const key=[...built.rows.keys()].find(k=>k.endsWith(references[1].snapshotKey));
  built.rows.set(key,JSON.stringify({organizationId:IDENTITY.organizationId,actorUserId:IDENTITY.userId,research:raw}));
  const incomplete=await run('piece.create.from-research',{references,text:input},built);
  expect(incomplete.output).toMatchObject({ok:false,code:'INTAKE_RESEARCH_INCOMPLETE'});
  expect([...built.rows.keys()].some(k=>k.endsWith(':continuation'))).toBe(false);
  expect(calls).toEqual([]);
  expect(built.writes).not.toHaveBeenCalled();
});

test('multi-capture atomic claims exclude racing singleton and overlapping bundles and leave no partial locks',async()=>{
  const built=build(),references=await capturePair(built);
  const third=await built.service.storeResearchEvidence(IDENTITY.organizationId,IDENTITY.userId,{query:'Third task',level:'quick',summary:{status:'supported'},facts:[{...findings[0],factKey:'third'}],sources:researchResult().sources.slice(0,1)});
  const other=build();other.service.snapshots=built.snapshots;
  answers=[brief(),{text:'Both changes.'}];
  const results=await Promise.all([
    run('piece.create.from-research',{references,text:input},built),
    run('piece.create.from-research',{snapshotKey:references[0].snapshotKey,factKeys:['alpha'],text:input},built),
    run('piece.create.from-research',{references:[references[0],{snapshotKey:third.snapshotKey,factKeys:['third']}],text:input},other),
  ]);
  expect(results.filter(r=>r.output.ok)).toHaveLength(1);
  expect(built.writes.mock.calls.length+other.writes.mock.calls.length).toBe(1);
  const claimKeys=[...built.rows.keys()].filter(k=>k.endsWith(':continuation'));
  // If the singleton wins it owns one key; a winning bundle owns exactly
  // its two member keys plus its bundle key. No loser may leave partial locks.
  expect([1,3]).toContain(claimKeys.length);
});

test('an uncertain multi-capture write blocks repeated, singleton and overlapping writes',async()=>{
  const built=build(),references=await capturePair(built);
  answers=[brief(),{text:'Uncertain result.'}];built.writes.mockRejectedValue(new Error('Uncertain write receipt'));
  expect((await run('piece.create.from-research',{references,text:input},built)).output.ok).toBe(false);
  for(const args of [{references,text:input},{snapshotKey:references[0].snapshotKey,factKeys:['alpha'],text:input}])
    expect((await run('piece.create.from-research',args,built)).output.ok).toBe(false);
  expect(built.writes).toHaveBeenCalledTimes(1);
  expect(calls).toHaveLength(2);
});

test('a bundle already inside the writer atomically excludes singleton and overlapping bundle attempts',async()=>{
  const built=build(),references=await capturePair(built);
  const third=await built.service.storeResearchEvidence(IDENTITY.organizationId,IDENTITY.userId,{query:'Third',level:'quick',summary:{status:'supported'},facts:[{...findings[0],factKey:'third'}],sources:researchResult().sources.slice(0,1)});
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  const finish=new Promise(resolve=>{release=resolve;});
  built.writes.mockImplementation(async()=>{entered();await finish;return{id:'piece-1',code:'cnt-1'};});
  answers=[brief(),{text:'Both changes.'}];
  const pending=run('piece.create.from-research',{references,text:input},built);
  await started;
  const other=build();other.service.snapshots=built.snapshots;
  const singleton=await run('piece.create.from-research',{snapshotKey:references[0].snapshotKey,factKeys:['alpha'],text:input},other);
  const overlap=await run('piece.create.from-research',{references:[references[0],{snapshotKey:third.snapshotKey,factKeys:['third']}],text:input},other);
  expect(singleton.output.ok).toBe(false);
  expect(overlap.output.ok).toBe(false);
  expect(other.writes).not.toHaveBeenCalled();
  expect([...built.rows.keys()].some(k=>k.endsWith(`${third.snapshotKey}:continuation`))).toBe(false);
  expect([...built.rows.keys()].filter(k=>k.endsWith(':continuation'))).toHaveLength(3);
  release();
  expect((await pending).output.ok).toBe(true);
  expect(built.writes).toHaveBeenCalledTimes(1);
});

test('a completed or uncertain singleton cannot be reused through a fresh bundle',async()=>{
  for(const uncertain of [false,true]){
    const built=build(),references=await capturePair(built);
    answers=[brief(),{text:'Single change.'}];
    if(uncertain)built.writes.mockRejectedValue(new Error('Uncertain write receipt'));
    await run('piece.create.from-research',{snapshotKey:references[0].snapshotKey,factKeys:['alpha'],text:input},built);
    const result=await run('piece.create.from-research',{references,text:input},built);
    expect(result.output).toMatchObject({ok:false,code:'INTAKE_RESEARCH_SELECTION_CONFLICT'});
    expect(built.writes).toHaveBeenCalledTimes(1);
    expect([...built.rows.keys()].filter(k=>k.endsWith(':continuation'))).toHaveLength(1);
  }
});

test('a composed passage capture fences the original singleton writer as well as its selected capture', async () => {
  const built = build();
  const references = await capturePair(built);
  const originalId = references[0].snapshotKey;
  const read = unwrap((await run('piece.read', { researchId: originalId, part: 'research_source', sourceUrl: urlA }, built)).output);
  const selected = await built.service.selectStoredResearchPassages(IDENTITY.organizationId, IDENTITY.userId,
    originalId, [{ sourceUrl: urlA, revision: read.revision, quote: quoteA }]);
  const composed = [{ snapshotKey: selected.snapshotKey, factKeys: [selected.facts[0].factKey] }, references[1]];
  answers = [brief(), { text: 'Both documented changes.' }];
  expect((await run('piece.create.from-research', { references: composed, text: input }, built)).output.ok).toBe(true);
  const other = build(); other.service.snapshots = built.snapshots;
  const singleton = await run('piece.create.from-research', { snapshotKey: originalId, factKeys: ['alpha'], text: input }, other);
  expect(singleton.output.ok).toBe(false);
  expect(other.writes).not.toHaveBeenCalled();
  expect(built.writes).toHaveBeenCalledTimes(1);
  expect(built.research).not.toHaveBeenCalled();
  expect(built.fetch).not.toHaveBeenCalled();
});

test('an incomplete composed brief leaves every original capture available for corrected preparation', async () => {
  const built = build(); const references = await capturePair(built);
  answers = [brief({ inputSufficient: false, questions: ['Which audience should this address?'] })];
  expect((await run('piece.create.from-research', { references, text: input }, built)).output.ok).toBe(false);
  expect(built.writes).not.toHaveBeenCalled();
  expect([...built.rows.keys()].filter(key => key.endsWith(':continuation'))).toEqual([]);
  answers = [brief(), { text: 'Both documented changes.' }];
  expect((await run('piece.create.from-research', { references, text: input }, built)).output.ok).toBe(true);
  expect(built.writes).toHaveBeenCalledTimes(1);
});

// Equivalent synthetic retained captures: the private incident exposes all five
// literal misses but only one source's successful first range. No private export
// or unverified historical release claim belongs in this executable fixture.
const incidentMisses = ['October 2026', '28 days', 'October 9, 2026',
  'Ultrafast is rolling out today', 'Ultrafast'];
const fixedPeriodRequest = 'Соберите подтверждённые обновления с 9 по 23 октября 2026 включительно. Старый пост за 6–8 октября — только пример. Нужны заготовка и черновик для Telegram.';

test.each(incidentMisses)('literal miss %s returns a truthful resumable retained range without search or fabricated match', async missing => {
  const built = build();
  const text = '2026-10-09. Alpha native sessions are documented.\n' + 'Retained primary-source context. '.repeat(400) + '\n2026-10-23. Beta preserves interrupted streams.';
  const snapshot = await built.service.storeResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, {
    query: fixedPeriodRequest, level: 'standard', summary: { status: 'partial', periodStatus: 'partial' },
    sources: [{ url: urlA, title: 'Synthetic retained changelog', publishedAt: '2026-10-23T12:00:00Z', fullText: text }], facts: [],
  });
  const result = await run('piece.read', { researchId: snapshot.snapshotKey, part: 'research_source', sourceIndex: 0,
    find: missing, length: 256 }, built);
  expect(result.output.ok).toBe(true);
  const read = unwrap(result.output);
  expect(read).toMatchObject({ snapshotKey: snapshot.snapshotKey, sourceUrl: urlA,
    publishedAt: '2026-10-23T12:00:00Z', offset: 0, text: text.slice(0, 256), totalCharacters: text.length,
    literalMatch: false, canReviseInput: true, recovery: { code: 'MATERIAL_PASSAGE_NOT_FOUND', requestedLiteral: missing,
      searchedFrom: 0, nextRead: { offset: 256, length: 256 } } });
  expect(read.matchOffset).toBeUndefined();
  const next = unwrap((await run('piece.read', read.recovery.nextRead, built)).output);
  expect(next).toMatchObject({ revision: read.revision, offset: 256, text: text.slice(256, 512) });
  expect(await built.service.readStoredResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, snapshot.snapshotKey))
    .toMatchObject({ query: fixedPeriodRequest });
  const stale = await run('piece.read', { ...read.recovery.nextRead, revision: '0'.repeat(64) }, built);
  expect(stale.output).toMatchObject({ ok: false, code: 'MATERIAL_STALE' });
  const foreign = await run('piece.read', read.recovery.nextRead, built, { userId: 'foreign-reader' });
  expect(foreign.output).toMatchObject({ ok: false, code: 'MATERIAL_NOT_AVAILABLE' });
  expect(built.research).not.toHaveBeenCalled();
  expect(built.fetch).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
});

test('research evidence repetition ignores guessed literals and new search ids but preserves new ranges, revisions, dates and coverage', () => {
  const { researchProgressIdentity: identity } = loadWithMocks('libraries/nestjs-libraries/src/chat/capabilities/catalogue/research-progress.ts');
  const read = { snapshotKey: 'res_synthetic', part: 'research_source', sourceUrl: urlA, revision: 'a'.repeat(64), offset: 0, text: 'Actual range' };
  const envelope = summary => ({ ok: true, summary: { untrustedData: { value: summary } } });
  const first = identity('piece_read', { find: 'October 2026' }, envelope(read));
  expect(identity('piece_read', { find: '28 days' }, envelope({ ...read, literalMatch: false, recovery: { requestedLiteral: '28 days' } }))).toEqual(first);
  expect(identity('piece_read', {}, envelope({ ...read, offset: 100, text: 'New range' }))).not.toEqual(first);
  expect(identity('piece_read', {}, envelope({ ...read, revision: 'b'.repeat(64) }))).not.toEqual(first);
  const search = { snapshotKey: 'res_first', query: fixedPeriodRequest, sources: [{ url: urlA, excerpt: quoteA, publishedAt: '2026-10-09' }],
    facts: [{ statement: quoteA, sourceUrl: urlA, dateProvenance: { eventDate: '2026-10-09', basis: 'source' } }], assessment: { periodStatus: 'partial' } };
  const searchIdentity = identity('research_search', { query: 'first query' }, envelope(search));
  expect(identity('research_search', { query: 'rephrased query' }, envelope({ ...search, snapshotKey: 'res_second', query: 'rephrased query', fromCache: true }))).toEqual(searchIdentity);
  expect(identity('research_search', {}, envelope({ ...search, assessment: { periodStatus: 'complete' } }))).not.toEqual(searchIdentity);
  expect(identity('research_search', {}, envelope({ ...search, facts: [{ ...search.facts[0], dateProvenance: { eventDate: '2026-10-08', basis: 'source' } }] }))).not.toEqual(searchIdentity);
  expect(identity('piece_open', {}, envelope(read))).toBeUndefined();
});

test('preview cache is bounded by source bytes and an oversized snapshot remains readable through domain storage', async () => {
  const { recordResearchEvidence, readResearchEvidence, MAX_RESEARCH_EVIDENCE_CACHE_BYTES } = loadWithMocks('libraries/nestjs-libraries/src/chat/capabilities/catalogue/research-evidence.ts');
  const text = 'x'.repeat(3 * 1024 * 1024);
  recordResearchEvidence('byte-test', { snapshotKey: 'first', sources: [{ url: urlA, fullText: text }] });
  expect(readResearchEvidence('byte-test', 'first')).not.toBeNull();
  recordResearchEvidence('byte-test', { snapshotKey: 'second', sources: [{ url: urlB, fullText: text }] });
  expect(readResearchEvidence('byte-test', 'first')).toBeNull();
  expect(readResearchEvidence('byte-test', 'second')).not.toBeNull();
  const tooLarge = 'z'.repeat(MAX_RESEARCH_EVIDENCE_CACHE_BYTES / 2 + 1);
  const recorded = recordResearchEvidence('byte-test', { snapshotKey: 'oversize', sources: [{ url: urlA, fullText: tooLarge }] });
  expect(recorded.sources[0].text).toBe(tooLarge);
  expect(readResearchEvidence('byte-test', 'oversize')).toBeNull();
  const built = build();
  const saved = await built.service.storeResearchEvidence(IDENTITY.organizationId, IDENTITY.userId,
    { query: fixedPeriodRequest, level: 'standard', sources: [{ url: urlA, fullText: tooLarge }], facts: [] });
  const tail = unwrap((await run('piece.read', { researchId: saved.snapshotKey, part: 'research_source', sourceIndex: 0,
    offset: tooLarge.length - 32, length: 32 }, built)).output);
  expect(tail).toMatchObject({ text: 'z'.repeat(32), totalCharacters: tooLarge.length, truncated: false });
});

test('compact assessment retains dates and coverage while complete authorized assessment can be read with stable ranges', async () => {
  const built = build();
  const assessment = { version: 'reader-source-review/v1', status: 'partial', requestedDate: '2026-10-23',
    requestedPeriod: { start: '2026-10-09', end: '2026-10-23' },
    bounds: { candidateCount: 50, presentedCount: 50, omittedCount: 0, excludedUrlCount: 0 },
    evidence: Array.from({ length: 50 }, (_, index) => ({ id: `s${index}`, url: `https://primary.example/${index}`, publishedAt: '2026-10-09',
      excerpt: 'Long retained excerpt. '.repeat(100), excerptSha256: 'a'.repeat(64), retainedChars: 2200, clipped: true })),
    claims: [{ text: quoteA, kind: 'event', refs: [{ source: 's0', start: 0, end: 32 }], dates: [{ kind: 'event', date: '2026-10-09', ref: { source: 's0', start: 0, end: 10 } }] }],
    coverage: [{ question: 'Native sessions', status: 'supported' }, { question: 'Daily campaign claim from the old post', status: 'missing' }],
    sources: Array.from({ length: 50 }, (_, index) => ({ id: `s${index}`, relevance: 'relevant' })) };
  built.research.mockResolvedValue({ ...researchResult(), readerAssessment: assessment });
  const searched = unwrap((await run('research.search', { query: fixedPeriodRequest }, built)).output);
  expect(searched.assessment).toMatchObject({ requestedDate: '2026-10-23', requestedPeriod: assessment.requestedPeriod,
    status: 'partial', coverage: assessment.coverage, assessmentTruncated: true, readWith: 'piece.read', part: 'research_assessment' });
  expect(searched.assessment.evidence).toHaveLength(50);
  expect(searched.assessment.sources).toHaveLength(50);
  expect(searched.assessment.claims[0].dates).toEqual(assessment.claims[0].dates);
  expect(searched.assessment.evidence[0].excerpt).toBeUndefined();
  const full = JSON.stringify(assessment);
  let assembled = '', offset = 0, revision;
  do {
    const output = await run('piece.read', { researchId: searched.snapshotKey, part: 'research_assessment', offset, length: 16_000, ...(revision ? { revision } : {}) }, built);
    expect(output.output.ok).toBe(true);
    const range = unwrap(output.output);
    revision ??= range.revision;
    expect(range.revision).toBe(revision);
    assembled += range.text;
    offset = range.nextOffset;
  } while (offset !== undefined);
  expect(assembled).toBe(full);
  expect(JSON.stringify(searched.assessment).length).toBeLessThan(full.length / 3);
  expect(built.research).toHaveBeenCalledTimes(1);
  expect(built.fetch).not.toHaveBeenCalled();
});
