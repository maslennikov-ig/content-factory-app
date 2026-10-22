'use strict';

const assert = require('node:assert/strict');
const { MockLanguageModelV3 } = require('ai/test');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { AGENT_STREAM_TOPIC, AgentStreamEventTypes, createDurableAgentStream } = require('@mastra/core/agent/durable');
const { randomUUID } = require('node:crypto');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { conductorOutputProcessors } = loadCapabilityModule('../conductor/conductor.secrets.ts');
const { observeConductorRun, NativeReplayCompleteError } = loadCapabilityModule('../conductor/native-run-observer.ts');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, accept, description) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) { const value = await read(); if (accept(value)) return value; await delay(10); }
  throw new Error(`Timed out: ${description}`);
}

async function main() {
  const mode = process.argv[2] ?? 'production-view';
  const count = 80;
  const text = Array.from({ length: count }, (_, index) => `[${String(index + 1).padStart(3, '0')}] `).join('');
  let produced = 0;
  let providerCalls = 0;
  let providerAborts = 0;
  let releaseCancel;
  const cancelBarrier = new Promise(resolve => { releaseCancel = resolve; });
  const runtime = await createRuntime({ modelFactory: modelId => new MockLanguageModelV3({ modelId, async doStream(options) {
    providerCalls++;
    options.abortSignal?.addEventListener('abort', () => { providerAborts++; }, { once: true });
    return { stream: new ReadableStream({ async start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({ type: 'text-start', id: 'provider-text-stable' });
      for (let index = 1; index <= count; index++) {
        controller.enqueue({ type: 'text-delta', id: 'provider-text-stable', delta: `[${String(index).padStart(3, '0')}] ` });
        produced = index;
        if (index === 36) await cancelBarrier;
        await delay(35);
      }
      controller.enqueue({ type: 'text-end', id: 'provider-text-stable' });
      controller.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: count, text: count } } });
      controller.close();
    } }) };
  } }) });
  const threadId = `${runtime.schemaName}-fanout`;
  const observers = [];
  const cleared = [];
  const clearTopic = runtime.agent.pubsub.clearTopic.bind(runtime.agent.pubsub);
  runtime.agent.pubsub.clearTopic = topic => {
    cleared.push({ topic, produced, stack: new Error().stack.split('\n').slice(1, 7) });
    return clearTopic(topic);
  };
  const observe = async label => {
    const native = mode === 'production-view' ? await observeConductorRun(runtime.agent, accepted.childRunId) : mode.startsWith('factory-') ? createDurableAgentStream({ pubsub: runtime.agent.pubsub, runId: accepted.childRunId, messageId: randomUUID(), model: { provider: 'native', modelId: 'replay', version: 'v3' }, threadId, resourceId: `${IDENTITY.organizationId}:${IDENTITY.userId}`, ...(mode === 'factory-isolated' ? { outputProcessors: conductorOutputProcessors(), processorStates: new Map() } : {}) }) : await runtime.agent.observe(accepted.childRunId);
    if (native.ready) await native.ready;
    const reader = native.output.fullStream.getReader();
    const result = { label, text: '', starts: [], ids: [] };
    const done = (async () => {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = next.value;
        if (chunk.type === 'text-start') result.starts.push(chunk.payload?.id);
        if (chunk.type === 'text-delta') { result.text += chunk.payload?.text ?? chunk.payload?.delta ?? ''; result.ids.push(chunk.payload?.id); }
      }
      return result;
    })();
    const observer = { result, done, async cancel() { native.detach(); await reader.cancel(); } };
    observers.push(observer);
    return observer;
  };
  let accepted;
  try {
    await runtime.memory.createThread({ threadId, resourceId: `${IDENTITY.organizationId}:${IDENTITY.userId}`, title: 'Native stream fanout' });
    accepted = await runtime.service.queueNativeInput({ identity: IDENTITY, threadId, requestId: 'native-fanout-logical', signal: { id: 'native-fanout-message', contents: 'Count the saved chunks.', author: { id: IDENTITY.userId }, createdAt: new Date().toISOString() } });
    await until(() => produced, value => value >= 8, 'first live deltas');
    const first = await observe('first');
    await until(() => produced, value => value >= 22, 'second joins');
    const canceled = await observe('canceled');
    await until(() => produced, value => value >= 36, 'cancel one observer');
    const beforeCancel = await runtime.agent.pubsub.getHistory(AGENT_STREAM_TOPIC(accepted.childRunId));
    assert.ok(beforeCancel.length > 0, 'Native replay already contains the live run.');
    await canceled.cancel();
    const afterCancel = await runtime.agent.pubsub.getHistory(AGENT_STREAM_TOPIC(accepted.childRunId));
    assert.deepEqual(afterCancel.slice(0, beforeCancel.length), beforeCancel, 'Detaching one reader must preserve the native cache.');
    assert.equal(cleared.length, 0, 'Observer detach must never clear a shared topic.');
    releaseCancel();
    await until(() => produced, value => value >= 44, 'third joins after cancel');
    const last = await observe('last');
    const results = await Promise.all([first.done, canceled.done, last.done]);
    const workflow = runtime.mastra.getWorkflowById('content-factory-queued-input-v1');
    await until(() => workflow.getWorkflowRunById(accepted.workflowRunId), value => value?.status === 'success', 'native completion');
    const memory = await runtime.storage.getStore('memory');
    const saved = await memory.listMessages({ threadId, resourceId: `${IDENTITY.organizationId}:${IDENTITY.userId}`, perPage: false });
    const assistant = saved.messages.filter(message => message.role === 'assistant');
    const persistedText = assistant.flatMap(message => typeof message.content === 'string' ? [message.content] : (message.content?.parts ?? []).filter(part => part.type === 'text').map(part => part.text)).join('');
    const events = await runtime.agent.pubsub.getHistory(AGENT_STREAM_TOPIC(accepted.childRunId));
    const cachedText = events.filter(event => event.data?.type === 'text-delta').map(event => event.data.payload?.text ?? event.data.payload?.delta ?? '').join('');
    const raw = await runtime.redis.xrange(`cf:mastra-events:${runtime.namespace}:${AGENT_STREAM_TOPIC(accepted.childRunId)}`, '-', '+');
    const rawEvents = raw.map(([_id, fields]) => JSON.parse(fields[fields.indexOf('event') + 1]));
    const rawText = rawEvents.filter(event => event.data?.type === 'text-delta').map(event => event.data.payload?.text ?? event.data.payload?.delta ?? '').join('');
    const labels = value => (value.match(/\[\d+\]/g) ?? []).join(' ');
    const summary = { mode, providerCalls, providerAborts, produced, observerLengths: results.map(result => ({ label: result.label, length: result.text.length, ids: [...new Set(result.ids)], starts: result.starts, labels: labels(result.text) })), persistedLength: persistedText.length, persistedLabels: labels(persistedText), cachedLength: cachedText.length, cachedLabels: labels(cachedText), rawLength: rawText.length, rawLabels: labels(rawText), expectedLength: text.length, cachePreservedAfterDetach: true, nativeTerminalCleanup: cleared, buses: { agent: runtime.agent.pubsub.constructor.name, inner: runtime.agent.pubsub.inner?.constructor.name, host: runtime.mastra.pubsub.constructor.name, innerIsHost: runtime.agent.pubsub.inner === runtime.mastra.pubsub } };
    console.log(JSON.stringify(summary));
    assert.equal(results[0].text, text, 'First observer must receive every numbered delta once.');
    assert.equal(results[2].text, text, 'Late observer must replay and receive every numbered delta once.');
    assert.equal(text.startsWith(results[1].text), true, 'Canceled observer must have a contiguous prefix.');
    assert.equal(persistedText, text.trimEnd(), 'Native Memory must retain every original provider delta.');
    // untilIdle's native onForceClose calls the inner run cleanup at terminal;
    // a live reader detaching above must preserve replay independently of it.
    assert.ok(cleared.every(event => event.produced === count));
    assert.equal(providerCalls, 1);
    assert.equal(providerAborts, 0);
    assert.equal(assistant.length, 1);
    assert.equal(runtime.admissions.length, 1, 'Readers must not create more task admissions.');
    const fencing = await verifyFencedReplay(runtime);
    return { ...summary, fencing, admissions: runtime.admissions.length, passed: true };
  } finally {
    releaseCancel();
    await Promise.allSettled(observers.map(observer => observer.cancel()));
    await runtime.close({ drop: true });
  }
}

async function verifyFencedReplay(runtime) {
  const workflows = await runtime.storage.getStore('workflows');
  const finish = { output: { text: '', steps: [], usage: {} }, stepResult: { reason: 'stop', output: [], usage: {} } };
  let verifiedTools = 0;
  for (const floor of ['replay', 'skipped-markers', 'storage', 'retry-storage']) {
    const runId = `${runtime.schemaName}-fence-${floor}`;
    const topic = AGENT_STREAM_TOPIC(runId);
    const first = await workflows.claimRunOwnership({ runId, ownerId: 'first', leaseMs: 10_000 });
    assert.equal(first.acquired, true);
    await workflows.releaseRunOwnership({ runId, ownerId: 'first', generation: first.record.generation });
    const second = await workflows.claimRunOwnership({ runId, ownerId: 'second', leaseMs: 10_000 });
    assert.equal(second.acquired, true);
    assert.ok(second.record.generation > first.record.generation);
    const publish = (type, data, generation = second.record.generation) => runtime.agent.pubsub.publish(topic, { type, data, generation });
    if (floor === 'replay' || floor === 'skipped-markers') {
      await publish(AgentStreamEventTypes.OWNERSHIP_CLAIMED, {}, first.record.generation);
      await publish(AgentStreamEventTypes.OWNERSHIP_CLAIMED, {});
    }
    let offset;
    if (floor === 'skipped-markers') offset = 2;
    if (floor === 'storage') offset = 1;
    const history = runtime.agent.pubsub.getHistory.bind(runtime.agent.pubsub);
    if (floor === 'retry-storage') {
      offset = 1;
      let failed = false;
      runtime.agent.pubsub.getHistory = async (...args) => {
        if (!failed) { failed = true; throw new Error('Synthetic replay floor read failure'); }
        return history(...args);
      };
    }
    let observed;
    try { observed = await observeConductorRun(runtime.agent, runId, { offset }); }
    finally { runtime.agent.pubsub.getHistory = history; }
    const reader = observed.fullStream.getReader();
    const chunks = [];
    const drained = (async () => { while (true) { const next = await reader.read(); if (next.done) return; chunks.push(next.value); } })();
    // For storage fallback the intentionally missing earlier event index must
    // still be consumed before fresh live data begins at numeric offset 1.
    if (floor === 'storage' || floor === 'retry-storage') await publish(AgentStreamEventTypes.OWNERSHIP_CLAIMED, {});
    // Native failed-read protection retries the claim before a terminal event.
    // It deliberately does not add a storage read to every ordinary delta.
    if (floor === 'retry-storage') await publish(AgentStreamEventTypes.FINISH, finish, first.record.generation);
    await publish(AgentStreamEventTypes.CHUNK, { type: 'text-delta', payload: { id: 'stale', text: 'STALE' } }, first.record.generation);
    if (floor !== 'retry-storage') await publish(AgentStreamEventTypes.FINISH, finish, first.record.generation);
    for (const chunk of [
      { type: 'text-start', payload: { id: 'fenced-text' } },
      { type: 'text-delta', payload: { id: 'fenced-text', text: 'Current owner.' } },
      { type: 'text-end', payload: { id: 'fenced-text' } },
      { type: 'tool-call', payload: { toolCallId: 'fenced-tool', toolName: 'fixture_persist', args: {} } },
      { type: 'tool-result', payload: { toolCallId: 'fenced-tool', toolName: 'fixture_persist', result: { id: 'once' } } },
    ]) await publish(AgentStreamEventTypes.CHUNK, { runId, from: 'AGENT', ...chunk });
    await publish(AgentStreamEventTypes.FINISH, finish);
    await drained;
    observed.detach();
    assert.equal(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.payload.text).join(''), 'Current owner.', floor);
    assert.equal(chunks.filter(chunk => chunk.type === 'finish').length, 1, floor);
    assert.equal(chunks.filter(chunk => chunk.type === 'tool-call').length, 1, floor);
    assert.equal(chunks.filter(chunk => chunk.type === 'tool-result').length, 1, floor);
    verifiedTools++;
    await workflows.releaseRunOwnership({ runId, ownerId: 'second', generation: second.record.generation });
    await runtime.agent.pubsub.clearTopic(topic);
  }
  const emptyRunId = `${runtime.schemaName}-empty-replay`;
  await assert.rejects(
    observeConductorRun(runtime.agent, emptyRunId, { isComplete: async () => true }),
    error => error instanceof NativeReplayCompleteError && error.code === 'NATIVE_REPLAY_COMPLETE'
  );
  const unknown = await observeConductorRun(runtime.agent, emptyRunId, { isComplete: async () => false });
  unknown.detach();
  const empty = unknown.fullStream.getReader();
  assert.equal((await empty.read()).done, true);
  empty.releaseLock();
  await assert.rejects(
    observeConductorRun(runtime.agent, emptyRunId, { isComplete: async () => { throw new Error('Synthetic saved-assistant read failed'); } }),
    /Synthetic saved-assistant read failed/
  );
  const history = runtime.agent.pubsub.getHistory.bind(runtime.agent.pubsub);
  let reads = 0;
  runtime.agent.pubsub.getHistory = async (...args) => {
    if (++reads === 2) throw new Error('Synthetic post-subscription history read failed');
    return history(...args);
  };
  try {
    await assert.rejects(
      observeConductorRun(runtime.agent, emptyRunId, { isComplete: async () => true }),
      /Synthetic post-subscription history read failed/
    );
  } finally { runtime.agent.pubsub.getHistory = history; }
  return { publicStorageClaims: true, staleGenerationDropped: true, modes: verifiedTools, toolPairsPreserved: verifiedTools, terminalProofRequired: true, terminalReadFailuresPropagated: true };
}

main().then(report => { console.log(JSON.stringify(report)); process.exit(0); }, error => { console.error(error); process.exit(1); });
