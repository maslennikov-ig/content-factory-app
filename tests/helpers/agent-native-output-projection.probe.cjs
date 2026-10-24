'use strict';

const assert = require('node:assert/strict');
const { z } = require('zod');
const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { Memory } = require('@mastra/memory');
const { MASTRA_THREAD_ID_KEY, MASTRA_RESOURCE_ID_KEY } = require('@mastra/core/request-context');
const { loadCapabilityModule, IDENTITY } = require('./agent-capabilities.cjs');

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
  return { passed: true, projectionBytes: Buffer.byteLength(JSON.stringify(first.output)), fullBytes: first.output.nativeResult.totalBytes,
    sources: preview.sources.length, facts: preview.facts.length, completeRangeRetrieval: true, domainWrites: 1, digestAndThreadChecked: true, readOutageNotUncertain: true };
}

main().then((result) => { console.log(JSON.stringify(result)); process.exit(0); }).catch((error) => { console.error(error); process.exit(1); });
