'use strict';

const assert = require('node:assert/strict');
const { z } = require('zod');
const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { Memory } = require('@mastra/memory');
const { MASTRA_THREAD_ID_KEY, MASTRA_RESOURCE_ID_KEY } = require('@mastra/core/request-context');
const { loadCapabilityModule, loadRegistry, servicesFrom, IDENTITY } = require('./agent-capabilities.cjs');

async function main() {
  const storage = new InMemoryStore();
  await storage.init();
  const memory = new Memory({ storage, options: { generateTitle: false, semanticRecall: false } });
  const mastra = new Mastra({ storage });
  await memory.createThread({ threadId: 'projection-owned', resourceId: 'org-1:user-1', title: 'Owned result' });
  await memory.createThread({ threadId: 'projection-sibling', resourceId: 'org-1:user-1', title: 'Sibling result' });
  const { buildMastraCapabilityTools } = loadCapabilityModule('mastra.adapter.ts');
  const { buildConductorContext } = loadCapabilityModule('../conductor/conductor.context.ts');
  const { conversationHistoryTool } = loadCapabilityModule('../conductor/conversation-history.ts');
  const receipts = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
  const { NATIVE_TOOL_RESULT_MAX_BYTES, nativeToolResultJson, NativeToolResultPromptProcessor } = loadCapabilityModule('../conductor/native-tool-result.ts');
  const context = (threadId = 'projection-owned') => {
    const requestContext = buildConductorContext({ identity: IDENTITY, threadId });
    requestContext.set(MASTRA_THREAD_ID_KEY, threadId);
    requestContext.set(MASTRA_RESOURCE_ID_KEY, 'org-1:user-1');
    requestContext.set('mastra__durableExecutions', { 'projection-run': {} });
    return requestContext;
  };
  const result = {
    snapshotKey: 'res_frozen', sourceCount: 50, factCount: 50,
    sources: Array.from({ length: 50 }, (_, index) => ({ sourceIndex: index, url: `https://source.example.test/${index}`, revision: `revision-${index}`, title: 'Long source text. '.repeat(500) })),
    facts: Array.from({ length: 50 }, (_, index) => ({ factKey: `fact-${index}`, statement: `Exact fact ${index}: ` + 'Complete retained text. '.repeat(500), sourceUrl: `https://source.example.test/${index}` })),
  };
  let writes = 0;
  const capability = (risk) => ({ id: 'projection.result', group: 'content', risk,
    label: { ru: 'Результат', en: 'Result' }, description: 'Synthetic retained result', input: z.object({}), untrusted: ['fetched-page'], door: {},
    run: async () => { writes++; return result; }, summarize: (value) => value });
  const execute = async (risk, callId) => {
    const tool = buildMastraCapabilityTools([capability(risk)], { services: () => ({}), language: 'en' }).projection_result;
    const output = await tool.execute({}, { runId: 'projection-run', mastra, memory, requestContext: context(), agent: { threadId: 'projection-owned', toolCallId: callId } });
    return { output, model: tool.toModelOutput(output) };
  };
  const first = await execute('write', 'write-result');
  assert.equal(first.output.ok, true);
  assert.ok(Buffer.byteLength(JSON.stringify(first.output)) <= NATIVE_TOOL_RESULT_MAX_BYTES);
  assert.equal(first.output.nativeResult.truncated, true);
  assert.equal(first.output.nativeResult.readWith, 'readConversationHistory');
  assert.deepEqual(first.model.value.nativeResult, first.output.nativeResult);
  const preview = first.output.summary.untrustedData.value;
  assert.equal(preview.sources.length, 50);
  assert.equal(preview.facts.length, 50);
  assert.equal(preview.sources[49].url, result.sources[49].url);
  assert.equal(preview.facts[49].factKey, result.facts[49].factKey);
  const scope = { organizationId: IDENTITY.organizationId, runId: 'projection-run', threadId: 'projection-owned', toolName: 'projection_result', toolCallId: 'write-result', storage, memory };
  const receipt = await receipts.readCommittedToolReceipt(scope);
  assert.deepEqual(receipt.result.summary.untrustedData.value, result, 'the complete original result remains in its receipt');
  const replay = await execute('write', 'write-result');
  assert.deepEqual(replay.output, first.output);
  assert.equal(writes, 1, 'replaying a projected result cannot repeat the domain mutation');
  const tool = conversationHistoryTool(memory);
  const ref = first.output.nativeResult.outputRef;
  let offset = 0;
  let all = '';
  do {
    const page = await tool.execute({ outputRef: ref, offset, length: 12000 }, { requestContext: context() });
    assert.equal(page.ok, true);
    all += page.text.untrustedData.value;
    if (!page.truncated) break;
    assert.ok(page.nextOffset > offset);
    offset = page.nextOffset;
  } while (offset < 10_000_000);
  assert.equal(all, nativeToolResultJson(receipt.result));
  assert.equal((await tool.execute({ outputRef: { ...ref, sha256: '0'.repeat(64) } }, { requestContext: context() })).code, 'TOOL_RESULT_UNAVAILABLE');
  assert.equal((await tool.execute({ outputRef: ref }, { requestContext: context('projection-sibling') })).code, 'TOOL_RESULT_UNAVAILABLE');
  const read = await execute('read', 'read-result');
  assert.equal(read.output.ok, true);
  assert.ok(read.output.nativeResult);
  const readReceipt = await receipts.readCommittedToolReceipt({ ...scope, toolCallId: 'read-result' });
  assert.deepEqual(readReceipt.result.summary.untrustedData.value, result);
  const state = await storage.getStore('threadState');
  const save = state.setState.bind(state);
  state.setState = async () => { throw new Error('Storage unavailable'); };
  const failedRead = await execute('read', 'read-unavailable');
  state.setState = save;
  assert.equal(failedRead.output.code, 'CAPABILITY_RESULT_UNAVAILABLE');
  assert.equal(await receipts.readAgentOperationRunGuard(scope), null, 'failed result retention cannot mark a domain write uncertain');
  const readsAfter = await tool.execute({ outputRef: ref, length: 10 }, { requestContext: context() });
  assert.equal(readsAfter.ok, true, 'prior full receipts survive a read-retention outage');
  const modelOutput = { type: 'json', value: { text: 'Exact provider result.' } };
  const providerOptions = { anthropic: { signature: 'provider-signature', cacheControl: { type: 'ephemeral' } },
    mastra: { createdAt: 42, modelOutput: result, toolPayloadTransform: { display: result, transcript: result } } };
  const prompt = [{ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'provider-call', toolName: 'projection_result', input: {}, providerOptions }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'provider-call', toolName: 'projection_result', output: modelOutput, providerOptions }] }];
  const stripped = new NativeToolResultPromptProcessor().processLLMRequest({ prompt }).prompt;
  assert.equal(stripped[1].content[0].output, modelOutput);
  assert.deepEqual(stripped[0].content[0].providerOptions, { anthropic: providerOptions.anthropic, mastra: { createdAt: 42 } });
  assert.equal(prompt[0].content[0].providerOptions.mastra.modelOutput, result, 'native history metadata was not mutated');
  assert.ok(JSON.stringify(stripped).length < JSON.stringify(prompt).length / 10);
  const registry = loadRegistry();
  const research = registry.CAPABILITY_CATALOGUE.find((entry) => entry.id === 'research.search');
  const readCapability = registry.CAPABILITY_CATALOGUE.find((entry) => entry.id === 'piece.read');
  const sourceRows = Array.from({ length: 60 }, (_, i) => ({
    url: `https://example.test/${i}/` + 'идентификатор'.repeat(90), title: `Источник ${i} 日本語`,
    text: (i === 59 ? '🧭研究данные'.repeat(5_000) : 'Начало страницы. '.repeat(200)) + `Уникальный поздний абзац ${i}`, }));
  const factRows = Array.from({ length: 80 }, (_, i) => ({ factKey: `fact-${i}-` + 'x'.repeat(700),
    statement: `Проверяемый факт ${i}`, sourceUrl: sourceRows[i % 60].url, status: 'unverified', sourcePassage: i === 79 }));
  const assessment = { status: 'partial', periodStatus: 'partial', reason: 'Данные неполны',
    coverage: Array.from({ length: 100 }, (_, i) => ({ question: `Пробел ${i} ` + 'данные '.repeat(80), status: 'missing' })),
    evidence: Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}-` + 'x'.repeat(700) })) };
  let snapshot;
  const intake = {
    storeResearchEvidence: async (org, user, input) => { snapshot = { ...input, snapshotKey: 'res_large', owner: `${org}:${user}` }; return snapshot; },
    readStoredResearchEvidence: async (org, user, key) => key === snapshot?.snapshotKey && snapshot.owner === `${org}:${user}` ? snapshot : null,
  };
  const researchTools = registry.buildMastraCapabilityTools([research, readCapability], { language: 'ru',
    services: servicesFrom({ IntakeService: intake, WebResearchService: { research: async () => ({ summary: 'Полезная сводка исследования: данные неполны.', readerAssessment: assessment,
      sources: sourceRows, facts: factRows, fromCache: false }) } }) });
  const invoke = async (toolName, input, callId, identity = IDENTITY) => {
    const requestContext = buildConductorContext({ identity, threadId: 'projection-owned' });
    requestContext.set(MASTRA_THREAD_ID_KEY, 'projection-owned');
    requestContext.set(MASTRA_RESOURCE_ID_KEY, `${identity.organizationId}:${identity.userId}`);
    requestContext.set('mastra__durableExecutions', { 'projection-run': {} });
    const tool = researchTools[toolName];
    const output = await tool.execute(input, { runId: 'projection-run', mastra, memory, requestContext,
      agent: { threadId: 'projection-owned', toolCallId: callId } });
    return { output, model: tool.toModelOutput(output) };
  };
  const searched = await invoke('research_search', { query: 'Найди сведения', level: 'standard' }, 'large-research');
  assert.equal(searched.output.ok, true);
  assert.ok(Buffer.byteLength(JSON.stringify(searched.model.value)) <= NATIVE_TOOL_RESULT_MAX_BYTES);
  const overview = searched.model.value.summary.untrustedData.value;
  assert.equal(overview.snapshotKey, 'res_large');
  assert.match(overview.summary, /Полезная сводка/);
  assert.equal(overview.assessment.status, 'partial');
  assert.equal(overview.assessment.coverage[0].status, 'missing');
  assert.equal(overview.sourceCount, 60);
  assert.equal(overview.factCount, 80);
  assert.ok(overview.sourcePage.nextRead && overview.factPage.nextRead);
  assert.equal(searched.output.nativeResult.truncated, true);
  const retainedResearch = await receipts.readCommittedToolReceipt({ ...scope, toolName: 'research_search', toolCallId: 'large-research' });
  assert.equal(retainedResearch.result.summary.untrustedData.value.sources.length, 60);
  assert.equal(retainedResearch.result.summary.untrustedData.value.facts.length, 80);
  const legacyStored = { ok: true, capability: 'research.search', summary: { savedResultAvailable: true }, nativeResult: searched.output.nativeResult };
  await memory.saveMessages({ messages: [{ id: 'legacy-tool-only', threadId: 'projection-owned', resourceId: 'org-1:user-1',
    role: 'assistant', createdAt: new Date('2026-01-01T00:00:00Z'), content: { format: 2, parts: [{ type: 'tool-invocation',
      toolInvocation: { state: 'result', toolCallId: 'large-research', toolName: 'research_search', args: {}, result: legacyStored } }] } }] });
  const historyBefore = await memory.recall({ threadId: 'projection-owned', resourceId: 'org-1:user-1', page: 0, perPage: 20 });
  const recoveredHistory = await tool.execute({ messageId: 'legacy-tool-only', perPage: 20 }, { requestContext: context() });
  const recovered = recoveredHistory.messages.untrustedData.value.find(row => row.id === 'legacy-tool-only').toolResults[0].output;
  assert.equal(recovered.summary.untrustedData.value.snapshotKey, 'res_large');
  assert.match(recovered.summary.untrustedData.value.summary, /Полезная сводка/);
  assert.deepEqual(recovered.nativeResult.outputRef, legacyStored.nativeResult.outputRef);
  const historyAfter = await memory.recall({ threadId: 'projection-owned', resourceId: 'org-1:user-1', page: 0, perPage: 20 });
  assert.deepEqual(historyAfter.messages, historyBefore.messages, 'Recovery is a read, never a rewrite of historical rows.');
  const { projectResearchOverview } = loadCapabilityModule('catalogue/research-evidence.ts');
  const legacy = projectResearchOverview({ ...overview, sources: sourceRows.map((row, i) => ({ ...row, sourceIndex: i, revision: 'a'.repeat(64) })),
    facts: factRows, sourceCount: 60, factCount: 80 });
  assert.match(legacy.summary, /Полезная сводка/);
  assert.equal(legacy.sourcePage.nextRead.part, 'research_sources');
  assert.equal(legacy.sourcePage.nextRead.revision, undefined);
  assert.equal(legacy.sources[0].revision, 'a'.repeat(64));
  const escaped = projectResearchOverview({ snapshotKey: 'res_escaped', level: 'standard', outcome: 'results',
    summary: '\u0001'.repeat(10_000), query: '漢'.repeat(10_000), sourceCount: 60, factCount: 80,
    sources: Array.from({ length: 60 }, (_, i) => ({ sourceIndex: i, revision: 'a'.repeat(64), url: '漢'.repeat(2_000), title: '\u0001'.repeat(1_000), excerpt: '\u0001'.repeat(1_000) })),
    facts: Array.from({ length: 80 }, (_, i) => ({ factIndex: i, factKey: '\u0001'.repeat(1_000), sourceUrl: '漢'.repeat(2_000), statement: '\u0001'.repeat(1_000), status: '\u0001'.repeat(1_000) })),
    assessment: { status: 'partial', coverage: Array.from({ length: 100 }, () => ({ question: '\u0001'.repeat(1_000), status: 'missing' })) } });
  const adversarialEnvelope = { ok: true, capability: 'research.search', summary: { untrustedData: { sources: ['search-result', 'fetched-page'],
    rule: 'untrusted', value: escaped } }, nativeResult: searched.output.nativeResult };
  assert.ok(Buffer.byteLength(JSON.stringify(adversarialEnvelope)) <= NATIVE_TOOL_RESULT_MAX_BYTES);
  let sourcePageRevision;
  for (const [part, initial, meta, total] of [['research_sources', overview.sources, overview.sourcePage, 60],
    ['research_facts', overview.facts, overview.factPage, 80]]) {
    const allRows = [...initial];
    let next = meta.nextRead, pageNo = 0, pageRevision;
    while (next) {
      const pageOutput = await invoke('piece_read', next, `${part}-${pageNo++}`);
      assert.equal(pageOutput.output.ok, true);
      assert.ok(Buffer.byteLength(JSON.stringify(pageOutput.model.value)) <= NATIVE_TOOL_RESULT_MAX_BYTES);
      const page = pageOutput.model.value.summary.untrustedData.value;
      pageRevision ??= page.revision;
      assert.equal(page.revision, pageRevision);
      allRows.push(...page.items);
      next = page.nextRead;
    }
    assert.equal(allRows.length, total);
    if (part === 'research_sources') sourcePageRevision = pageRevision;
    assert.deepEqual(allRows.map(row => row.sourceIndex ?? row.factIndex), Array.from({ length: total }, (_, i) => i));
    if (part === 'research_sources') {
      const later = allRows[59];
      const readLater = await invoke('piece_read', { researchId: 'res_large', part: 'research_source', sourceIndex: 59,
        revision: later.revision, find: 'Уникальный поздний абзац 59' }, 'late-source');
      assert.equal(readLater.output.ok, true);
      assert.match(readLater.model.value.summary.untrustedData.value.text, /Уникальный поздний абзац 59/);
      let offset = 0, assembled = '';
      do {
        const rangeOutput = await invoke('piece_read', { researchId: 'res_large', part: 'research_source', sourceIndex: 59,
          revision: later.revision, offset, length: 16_000 }, `unicode-range-${offset}`);
        assert.equal(rangeOutput.output.ok, true);
        assert.equal(rangeOutput.output.nativeResult, undefined);
        assert.ok(Buffer.byteLength(JSON.stringify(rangeOutput.model.value)) <= NATIVE_TOOL_RESULT_MAX_BYTES);
        const range = rangeOutput.model.value.summary.untrustedData.value;
        assembled += range.text;
        offset = range.nextOffset;
      } while (offset !== undefined);
      assert.equal(assembled, sourceRows[59].text);
      const stale = await invoke('piece_read', { researchId: 'res_large', part: 'research_source', sourceIndex: 59, revision: '0'.repeat(64) }, 'stale-source');
      assert.equal(stale.output.code, 'MATERIAL_STALE');
    }
    if (part === 'research_facts') {
      assert.equal(allRows[79].sourcePassage, true);
      assert.equal(allRows[79].selected, false);
      const laterFact = await invoke('piece_read', { researchId: 'res_large', part: 'research_fact', factIndex: 79,
        revision: allRows[79].revision }, 'late-fact');
      assert.equal(laterFact.output.ok, true);
      assert.equal(laterFact.model.value.summary.untrustedData.value.text, factRows[79].statement);
    }
  }
  const stalePage = await invoke('piece_read', { ...overview.sourcePage.nextRead, revision: '0'.repeat(64) }, 'stale-page');
  assert.equal(stalePage.output.code, 'MATERIAL_STALE');
  const oldTitle = snapshot.sources[59].title;
  snapshot.sources[59].title = 'Changed after the preceding page';
  const changedPage = await invoke('piece_read', { ...overview.sourcePage.nextRead, revision: sourcePageRevision }, 'changed-page');
  assert.equal(changedPage.output.code, 'MATERIAL_STALE');
  snapshot.sources[59].title = oldTitle;
  const foreignPage = await invoke('piece_read', overview.sourcePage.nextRead, 'foreign-page', { ...IDENTITY, userId: 'other-user' });
  assert.equal(foreignPage.output.code, 'MATERIAL_NOT_AVAILABLE');
  return { passed: true, projectionBytes: Buffer.byteLength(JSON.stringify(first.output)), fullBytes: first.output.nativeResult.totalBytes,
    sources: preview.sources.length, facts: preview.facts.length, completeRangeRetrieval: true, domainWrites: 1, digestAndThreadChecked: true, readOutageNotUncertain: true,
    researchOverviewBytes: Buffer.byteLength(JSON.stringify(searched.model.value)), researchPagesVerified: true };
}

main().then((result) => { console.log(JSON.stringify(result)); process.exit(0); }).catch((error) => { console.error(error); process.exit(1); });
