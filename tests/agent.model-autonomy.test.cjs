'use strict';
const { loadRegistry, requestContextFor, servicesFrom, executeTool } = require('./helpers/agent-capabilities.cjs');
const registry = loadRegistry();
const capability = id => registry.CAPABILITY_CATALOGUE.find(row => row.id === id);
const tool = (id, services) => registry.buildCapabilityTool(capability(id), {
  services: servicesFrom(services), language: 'ru', entrance: 'chat',
});
const run = (id, input, services) => executeTool(tool(id, services), input,
  { requestContext: requestContextFor(registry) });
const summary = output => output.summary?.untrustedData?.value ?? output.summary;
const fact = { factKey: 'new-1', statement: 'A documented release is available.', sourceUrl: 'https://example.test/release',
  status: 'confirmed', kind: 'found', verified: true, selected: true, quote: 'A documented release is available.' };
const request = { version: 'intake-request/v1', goal: 'Compare the actual supported changes, then write a draft.',
  materials: [{ role: 'reference', origin: 'user', text: 'Earlier example covered unrelated dates.' }],
  constraints: { research: 'required', requirements: ['Keep the comparison neutral.'] } };

describe('model-led tools keep original goals and actual research outcomes', () => {
  test('a native pre-write refusal carries server proof for a revised call without claiming an artifact', async () => {
    const result = await run('piece.create', { text: 'Подготовь проверенную заготовку.', research: 'none' }, {
      IntakeService: { prepare: async () => ({}), run: async function* () {
        yield { name: 'error', code: 'INTAKE_RESEARCH_OPT_IN_REQUIRED', message: 'Нужны дополнительные источники.', canReviseInput: true };
        yield { name: 'done', pieceId: null };
      } },
    });
    expect(result.output).toMatchObject({ ok: false, code: 'INTAKE_RESEARCH_OPT_IN_REQUIRED', canReviseInput: true });
    expect(result.output.card).toBeUndefined();
  });

  test.each(['empty', 'failed', 'needs_clarification'])('%s research returns evidence without a misleading human card or invented piece', async status => {
    const prepare = jest.fn(async (_org, body) => ({ body }));
    const services = { IntakeService: { prepare, run: async function* () {
      yield { name: 'research-ready', level: 'standard', facts: [], snapshotKey: null,
        summary: { status, found: 0, sources: 2, gaps: ['No usable confirmation.'], requestedScope: { goal: request.goal } } };
      yield { name: 'done', pieceId: null };
    } } };
    const material = 'Reference from earlier conversation: unrelated dates; keep its actual role.';
    const result = await run('piece.create', { text: 'Original words, unchanged.', material, research: 'standard' }, services);
    expect(result.output.ok).toBe(true);
    const value = summary(result.output);
    expect(value).toMatchObject({ outcome: 'research-ready', status, waitingOnCard: 0 });
    expect(value.evidence.untrustedData.value.summary.gaps).toEqual(['No usable confirmation.']);
    expect(result.suspended).toHaveLength(0);
    expect(result.output.card).toBeUndefined();
    expect(prepare.mock.calls[0]).toEqual(['org-1', expect.objectContaining({ input: 'Original words, unchanged.', contextMaterial: material }),
      { researchSelectionPolicy: 'model' }]);
  });

  test('routine fact choice returns to the model, then invokes genuine model-origin continuation', async () => {
    const selectResearchForModel = jest.fn(async function* () { yield { name: 'piece', pieceId: 'created', code: 'cnt-9' }; });
    const services = { IntakeService: { prepare: async () => ({}), run: async function* () {
      yield { name: 'research-selection-required', level: 'standard', facts: [fact], snapshotKey: 'snapshot', summary: { status: 'sufficient' } };
    }, selectResearchForModel } };
    const preview = await run('piece.create', { text: 'Write from documented changes.', research: 'standard' }, services);
    expect(summary(preview.output).evidence.untrustedData.value.facts[0]).toMatchObject({ factKey: fact.factKey, quote: fact.quote });
    expect(preview.suspended).toHaveLength(0);
    const saved = await run('piece.create.from-research', { snapshotKey: 'snapshot', factKeys: [fact.factKey] }, services);
    expect(summary(saved.output)).toMatchObject({ pieceId: 'created', outcome: 'created', selectionOrigin: 'model' });
    expect(selectResearchForModel).toHaveBeenCalledWith('org-1', 'user-1', 'snapshot', [fact.factKey]);
    expect(saved.suspended).toHaveLength(0);
  });

  test('requested person review without a duplicate request object still binds the internal snapshot policy', async () => {
    const prepare = jest.fn(async () => ({}));
    const services = { IntakeService: { prepare, run: async function* () {
      yield { name: 'research-selection-required', level: 'standard', facts: [fact], snapshotKey: 'snapshot', summary: { status: 'sufficient' } };
    } } };
    const preview = await run('piece.create', { text: 'Review these facts with me.', research: 'standard', selection: 'person' }, services);
    expect(prepare.mock.calls[0][2]).toEqual({ researchSelectionPolicy: 'person' });
    expect(preview.suspended).toHaveLength(1);
    expect(preview.suspended[0]).toMatchObject({ snapshotKey: 'snapshot' });
  });

  test('person-only existing-core research retains the real subject and cannot show a failed old-facts card', async () => {
    const researchCore = jest.fn(async () => ({ snapshotKey: 's', level: 'standard', facts: [fact],
      summary: { status: 'failed', gaps: ['Engine unavailable.'] } }));
    const apply = jest.fn();
    const result = await run('piece.research', { pieceId: 'p', selection: 'person' }, {
      PieceService: { researchCore, acceptCoreResearch: apply },
    });
    expect(researchCore.mock.calls[0][3]).not.toHaveProperty('request');
    expect(researchCore.mock.calls[0][5]).toEqual({ researchSelectionPolicy: 'person' });
    expect(summary(result.output)).toMatchObject({ outcome: 'research-ready', status: 'failed' });
    expect(result.suspended).toHaveLength(0);
    expect(apply).not.toHaveBeenCalled();
  });

  test('piece.read recovers the omitted tail and refuses combining ranges after the source changes', async () => {
    let text = 'x'.repeat(9_000) + 'THE ACTUAL REQUIREMENT';
    const detail = jest.fn(async () => ({ piece: { id: 'p', title: 'Material' }, core: { text }, adaptations: [] }));
    const services = { PieceService: { detail } };
    const first = summary((await run('piece.read', { pieceId: 'p', length: 8_000 }, services)).output);
    expect(first).toMatchObject({ truncated: true, nextOffset: 8_000 });
    const tail = summary((await run('piece.read', { pieceId: 'p', offset: first.nextOffset, revision: first.revision }, services)).output);
    expect(tail.text).toContain('THE ACTUAL REQUIREMENT');
    expect(tail.truncated).toBe(false);
    text += 'Changed.';
    const stale = await run('piece.read', { pieceId: 'p', offset: first.nextOffset, revision: first.revision }, services);
    expect(stale.output.ok).toBe(false);
    expect(detail.mock.calls.every(call => call[0] === 'org-1')).toBe(true);
  });

  test('a factual investigation uses the existing search service without creating a piece', async () => {
    const research = jest.fn(async () => ({ summary: 'Evidence summary.', facts: [{ text: fact.statement, sourceUrl: fact.sourceUrl }],
      sources: [{ url: fact.sourceUrl, title: 'Primary release' }], readerAssessment: { status: 'partial' } }));
    const result = await run('research.search', { query: 'Compare the documented features.' }, { WebResearchService: { research } });
    const value = summary(result.output);
    expect(value).toMatchObject({ outcome: 'results', sourceCount: 1, assessment: { status: 'partial' } });
    expect(value.sources[0].url).toBe(fact.sourceUrl);
    expect(result.output.card).toBeUndefined();
    expect(research).toHaveBeenCalledTimes(1);
  });
});
