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

  test('A7: 100-source 476k-char research.search stays compact in toModelOutput while piece.read inspects full source #99 on demand', async () => {
    const sources = Array.from({ length: 100 }, (_, i) => ({
      url: `https://example.test/source-${i}`,
      title: `Source #${i}`,
      content: `Header for source #${i}. ` + `body-${i}-`.repeat(580) + ` TAIL_MARKER_SOURCE_${i}`,
    }));
    const facts = Array.from({ length: 100 }, (_, i) => ({
      factKey: `fact-${i}`,
      text: `Statement for fact #${i}: ` + `detail-${i}-`.repeat(30),
      sourceUrl: `https://example.test/source-${i}`,
      quote: `Quote from source #${i}: ` + `quote-${i}-`.repeat(25),
      status: 'confirmed',
      verified: true,
    }));
    const totalRawChars = sources.reduce((sum, s) => sum + s.content.length, 0);
    expect(totalRawChars).toBeGreaterThan(450_000);

    const research = jest.fn(async () => ({
      summary: '100-source synthesis.',
      facts,
      sources,
      readerAssessment: { status: 'sufficient' },
    }));
    const searchTool = tool('research.search', { WebResearchService: { research } });
    const searchResult = await executeTool(searchTool, { query: '100-source investigation', depth: 'deep' }, {
      requestContext: requestContextFor(registry),
    });
    expect(searchResult.output.ok).toBe(true);
    const modelOutput = searchTool.toModelOutput(searchResult.output);
    const serializedModelOutput = JSON.stringify(modelOutput);
    expect(serializedModelOutput.length).toBeLessThan(95_000);

    const value = summary(searchResult.output);
    expect(value.sourceCount).toBe(100);
    expect(value.sources).toHaveLength(100);
    expect(value.facts).toHaveLength(100);
    expect(value.sources[99]).toMatchObject({
      sourceIndex: 99,
      url: 'https://example.test/source-99',
      truncated: true,
      readWith: 'piece.read',
    });
    expect(value.sources[99].excerpt).not.toContain('TAIL_MARKER_SOURCE_99');

    const firstChunk = summary((await run('piece.read', {
      researchId: value.snapshotKey,
      part: 'research_source',
      sourceIndex: 99,
      length: 3_000,
    }, {})).output);
    expect(firstChunk).toMatchObject({
      part: 'research_source',
      sourceIndex: 99,
      sourceUrl: 'https://example.test/source-99',
      truncated: true,
      nextOffset: 3_000,
    });
    const secondChunk = summary((await run('piece.read', {
      researchId: value.snapshotKey,
      part: 'research_source',
      sourceIndex: 99,
      offset: firstChunk.nextOffset,
      revision: firstChunk.revision,
    }, {})).output);
    expect(secondChunk.text).toContain('TAIL_MARKER_SOURCE_99');
    expect(secondChunk.truncated).toBe(false);

    const foreignContext = requestContextFor(registry, {
      organizationId: 'org-foreign',
      organizationCreatedAt: '2026-01-01T00:00:00.000Z',
      userId: 'user-foreign',
      role: 'EDITOR',
      language: 'ru',
      timeZone: 'Europe/Moscow',
    });
    const foreignAttempt = await executeTool(tool('piece.read', {}), {
      researchId: value.snapshotKey,
      part: 'research_source',
      sourceIndex: 99,
    }, { requestContext: foreignContext });
    expect(foreignAttempt.output.ok).toBe(false);
  });

  test('A4: completed research.search is reused by piece.create and piece.create.from-research without running a second search', async () => {
    const research = jest.fn(async () => ({
      summary: 'Verified release notes.',
      facts: [
        { factKey: 'res-f1', text: 'Mastra 1.78 adds native Session.', sourceUrl: 'https://example.test/mastra-1-78', quote: 'Mastra 1.78 adds native Session.' },
        { factKey: 'res-f2', text: 'StreamErrorRetryProcessor retries mid-stream errors.', sourceUrl: 'https://example.test/retry', quote: 'StreamErrorRetryProcessor retries mid-stream errors.' },
      ],
      sources: [
        { url: 'https://example.test/mastra-1-78', title: 'Mastra 1.78 Release', content: 'Full release notes for Mastra 1.78.' },
      ],
      readerAssessment: { status: 'sufficient' },
    }));
    const searchResult = await run('research.search', { query: 'Mastra 1.78 changes' }, { WebResearchService: { research } });
    const snapshotKey = summary(searchResult.output).snapshotKey;
    expect(snapshotKey).toMatch(/^res_/);
    expect(research).toHaveBeenCalledTimes(1);

    const prepare = jest.fn(async (_org, body) => ({ body }));
    const intakeRun = jest.fn(async function* (orgId, userId, prepared) {
      yield { name: 'piece', pieceId: 'piece-from-research', code: 'cnt-42' };
      yield { name: 'done', pieceId: 'piece-from-research' };
    });
    const services = {
      WebResearchService: { research },
      IntakeService: { prepare, run: intakeRun },
    };

    const createdViaPieceCreate = await run('piece.create', {
      text: 'Write an overview of Mastra 1.78 from the completed research.',
      researchId: snapshotKey,
      factId: ['res-f1'],
    }, services);
    expect(summary(createdViaPieceCreate.output)).toMatchObject({
      outcome: 'created',
      pieceId: 'piece-from-research',
      reusedResearchId: snapshotKey,
    });
    expect(prepare).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        researchDepth: 'none',
        contextMaterial: expect.stringContaining('Mastra 1.78 adds native Session.'),
      }),
      { researchSelectionPolicy: 'model' },
    );
    expect(research).toHaveBeenCalledTimes(1);

    const createdViaFromResearch = await run('piece.create.from-research', {
      snapshotKey,
      factKeys: ['res-f2'],
      text: 'Focus on StreamErrorRetryProcessor.',
    }, services);
    expect(summary(createdViaFromResearch.output)).toMatchObject({
      outcome: 'created',
      pieceId: 'piece-from-research',
      reusedResearchId: snapshotKey,
      selectionOrigin: 'model',
    });
    expect(research).toHaveBeenCalledTimes(1);
  });
});
