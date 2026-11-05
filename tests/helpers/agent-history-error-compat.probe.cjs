'use strict';
const assert = require('node:assert/strict');
const { InMemoryStore } = require('@mastra/core/storage');
const { MessageList } = require('@mastra/core/agent');
const { RequestContext } = require('@mastra/core/request-context');
const { TokenCounter } = require('@mastra/memory/processors');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const BASE = 'libraries/nestjs-libraries/src/chat/conductor/';
const PRIVATE = 'PRIVATE_ERROR_OBJECT_MUST_NOT_REACH_MODEL';
const threadId = 'history-error-thread', resourceId = 'fixture-org:fixture-actor';
const toolPart = errorText => ({
  type: 'tool-invocation',
  toolInvocation: { state: 'output-error', toolName: 'source_resolve_artifact', toolCallId: 'fixture-call',
    args: { version: 1, kind: 'piece', pieceId: 'fixture-piece', adaptationId: null, postId: null, revision: null }, errorText },
  providerMetadata: { mastra: { toolPayloadTransform: {
    display: { error: { transformed: { code: 'CAPABILITY_FAILED' } } },
    transcript: { error: { transformed: { code: 'CAPABILITY_FAILED' } } },
  } } },
});
const message = (id, parts) => ({ id, threadId, resourceId, role: 'assistant', createdAt: new Date('2026-01-01T00:00:00Z'), content: { format: 2, parts } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function main() {
  let externalCalls = 0;
  global.fetch = async () => { externalCalls++; throw new Error('No external call permitted'); };
  const { createConductorMemory, conductorMemoryOptions } = loadTypeScriptModule(BASE + 'conductor.memory.ts', {
    './conductor.execution': { currentConductorExecution: () => { throw new Error('No AI admission permitted'); } },
    '../conductor/conductor.execution': { currentConductorExecution: () => { throw new Error('No AI admission permitted'); } },
  });
  const { NativeToolResultPromptProcessor } = loadTypeScriptModule(BASE + 'native-tool-result.ts');
  const { historyMessageForCountingV1, modelToolErrorTextV1 } = loadTypeScriptModule(BASE + 'native-history-errors.v1.ts');
  const store = new InMemoryStore(), originalMemoryStore = await store.getStore('memory');
  // Actual SDK conversion of the same UI part shape retained by the failed run.
  const uiPart = { type: 'tool-source_resolve_artifact', toolCallId: 'fixture-call', title: 'Selected source', state: 'output-error',
    input: { version: 1, kind: 'piece', pieceId: 'fixture-piece', adaptationId: null, postId: null, revision: null },
    errorText: { code: 'CAPABILITY_FAILED', privateDetail: PRIVATE }, callProviderMetadata: toolPart(null).providerMetadata };
  const conversion = new MessageList();
  conversion.add({ id: 'stored-bad', role: 'assistant', parts: [uiPart] }, 'memory');
  const bad = { ...conversion.get.all.db()[0], threadId, resourceId, createdAt: new Date('2026-01-01T00:00:00Z') };
  assert.equal(bad.content.parts[0].type, 'tool-invocation');
  assert.deepEqual(bad.content.parts[0].toolInvocation.errorText, uiPart.errorText);
  assert.throws(() => new TokenCounter().countMessage(structuredClone(bad)), /errorText.*trim.*not a function/);
  const entered = deferred(), release = deferred(); let held = false;
  // A distinct fixture adapter pauses a model read; no shared SDK instance is patched.
  const fixtureMemoryStore = new Proxy(originalMemoryStore, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (key === 'listMessages') return async (...args) => {
      const result = await value.apply(target, args);
      if (!held && args[0].includeTotal === false) { held = true; entered.resolve(); await release.promise; }
      return result;
    };
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const fixtureStore = new Proxy(store, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (key === 'getStore') return async name => name === 'memory' ? fixtureMemoryStore : value.call(target, name);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const memory = createConductorMemory(fixtureStore);
  await memory.createThread({ threadId, resourceId, title: 'Synthetic history error' });
  await originalMemoryStore.saveMessages({ messages: [bad] });
  const before = structuredClone((await originalMemoryStore.listMessages({ threadId, resourceId, page: 0, perPage: 20 })).messages);
  const context = new RequestContext();
  context.set('MastraMemory', { thread: { id: threadId }, resourceId, memoryConfig: conductorMemoryOptions });
  const history = (await memory.getInputProcessors([], context)).find(p => p.id === 'message-history');
  assert.ok(history);
  const list = new MessageList();
  const running = history.processInput({ messageList: list, messages: [], requestContext: context, abort(reason) { throw new Error(reason); } });
  await entered.promise;
  const uiRead = await memory.recall({ threadId, resourceId, page: 0, perPage: 20 });
  assert.equal(typeof uiRead.messages[0].content.parts[0].toolInvocation.errorText, 'object');
  assert.equal(uiRead.messages[0].content.parts[0].toolInvocation.errorText.privateDetail, PRIVATE);
  release.resolve();
  await running;
  const modelMessages = list.get.all.db();
  const invocation = modelMessages[0].content.parts.find(p => p.type === 'tool-invocation').toolInvocation;
  assert.deepEqual(invocation.errorText, bad.content.parts[0].toolInvocation.errorText);
  assert.deepEqual((await originalMemoryStore.listMessages({ threadId, resourceId, page: 0, perPage: 20 })).messages, before);
  assert.deepEqual((await memory.recall({ threadId, resourceId, page: 0, perPage: 20 })).messages, before);
  assert.equal(typeof bad.content.parts[0].toolInvocation.errorText, 'object');
  const prompt = list.get.all.aiV5.prompt(), originalPrompt = structuredClone(prompt);
  const outgoing = new NativeToolResultPromptProcessor().processLLMRequest({ prompt }).prompt;
  const errorOutput = outgoing.find(m => m.role === 'tool').content[0].output;
  assert.equal(errorOutput.type, 'error-text');
  assert.equal(typeof errorOutput.value, 'string');
  assert.match(errorOutput.value, /CAPABILITY_FAILED/);
  assert.ok(!JSON.stringify(outgoing).includes(PRIVATE));
  assert.deepEqual(prompt, originalPrompt, 'provider projection must not mutate retained context');
  // The entire history may be fed through native save again after a resume.
  await memory.saveMessages({ messages: modelMessages });
  const saved = (await originalMemoryStore.listMessages({ threadId, resourceId, page: 0, perPage: 20 })).messages;
  assert.deepEqual(saved[0].content.parts[0].toolInvocation.errorText, before[0].content.parts[0].toolInvocation.errorText);
  assert.deepEqual(saved[0].content.parts[0].providerMetadata, before[0].content.parts[0].providerMetadata);
  let scalarCases = 0;
  const values = [null, undefined, 12, false, true, [], [PRIVATE], { message: PRIVATE }, { code: 'unsafe code', details: PRIVATE },
    { code: 'SOURCE_ARTIFACT_STALE', details: PRIVATE }, '', 'Readable failure.', 'sk-or-v1-SyntheticOnlyA1B2C3D4E5F6G7H8'];
  for (const value of values) {
    const original = message('case', [toolPart(value)]), raw = structuredClone(original);
    const normalized = historyMessageForCountingV1(original);
    const error = normalized.content.parts[0].toolInvocation.errorText;
    assert.equal(typeof error, 'string'); assert.ok(error.length > 0 && error.length <= 1000);
    assert.ok(!error.includes(PRIVATE)); assert.ok(!error.includes('sk-or-v1-SyntheticOnly'));
    assert.ok(Number.isFinite(new TokenCounter().countMessage(normalized)));
    assert.deepEqual(original, raw, 'counter input copying must not modify raw values or cached metadata');
    const projected = new NativeToolResultPromptProcessor().processLLMRequest({ prompt: [{ role: 'tool', content: [
      { type: 'tool-result', toolCallId: 'case', toolName: 'source_resolve_artifact', output: { type: 'error-json', value } },
    ] }] }).prompt;
    assert.equal(projected[0].content[0].output.type, 'error-text');
    assert.equal(projected[0].content[0].output.value, modelToolErrorTextV1(value));
    scalarCases++;
  }
  assert.equal(modelToolErrorTextV1('Readable failure.'), 'Readable failure.');
  const legacy = message('legacy', [{ type: 'tool-invocation', toolInvocation: { state: 'result', isError: true, toolCallId: 'legacy', toolName: 'fixture', args: {}, errorText: 1 } }]);
  assert.ok(Number.isFinite(new TokenCounter().countMessage(historyMessageForCountingV1(legacy))));
  process.stdout.write(JSON.stringify({ passed: true, installedCounterRedReproduced: true, actualUiConversion: true, installedMessageHistory: true,
    concurrentRawReadPreserved: true, sourceMetadataPreserved: true, nativeSavePreserved: true, modelErrorPlain: true, scalarCases, externalCalls }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
