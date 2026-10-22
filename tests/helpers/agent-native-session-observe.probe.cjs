'use strict';

const assert = require('node:assert/strict');
const { MockLanguageModelV3 } = require('ai/test');
const { AGENT_STREAM_TOPIC } = require('@mastra/core/agent/durable');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { Response, AgentThreadsService, until, mocks } = require('./agent-native-session-http.probe.cjs');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const ORG = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
const USER = { id: IDENTITY.userId, language: 'ru' };
const text = response => response.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join('');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = async (promise, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), 12_000);
  })]); } finally { clearTimeout(timer); }
};

(async () => {
  let release;
  const joined = new Promise(resolve => { release = resolve; });
  const tokens = Array.from({ length: 40 }, (_, index) => `note${String(index + 1).padStart(3, '0')}: Preserve the complete content of this public numbered note.${index < 39 ? '\n' : ''}`);
  const syntheticKey = ['sk-or-', 'v1-', 'Synthetic1234567890Only'].join('');
  tokens[19] = 'note020: A synthetic credential must remain hidden: [KEY].\n';
  let providerCalls = 0;
  const model = new MockLanguageModelV3({ modelId: 'observe-model', doStream: async () => {
    providerCalls++;
    return { stream: new ReadableStream({ async start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({ type: 'text-start', id: 'observe-text' });
      for (let index = 0; index < tokens.length; index++) {
        const raw = index === 19 ? tokens[index].replace('[KEY]', syntheticKey) : tokens[index];
        if (index === 19) {
          const cut = raw.indexOf(syntheticKey) + 12;
          controller.enqueue({ type: 'text-delta', id: 'observe-text', delta: raw.slice(0, cut) });
          await pause(10);
          controller.enqueue({ type: 'text-delta', id: 'observe-text', delta: raw.slice(cut) });
        } else controller.enqueue({ type: 'text-delta', id: 'observe-text', delta: raw });
        if (index === 9) await joined;
        await pause(10);
      }
      controller.enqueue({ type: 'text-end', id: 'observe-text' });
      controller.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: {
        inputTokens: { total: 3, noCache: 3 }, outputTokens: { total: 40, text: 40 },
      } });
      controller.close();
    } }) };
  } });
  const runtime = await createRuntime({ modelFactory: () => model });
  const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
    ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': runtime.executionModule,
  });
  const threads = new AgentThreadsService(runtime.service, runtime.redis);
  const handler = new AgentController(runtime.service, threads, runtime.aiUsage);
  const threadId = `${runtime.schemaName}-observe`;
  let ownerTask;
  const owner = new Response();
  const observers = [];
  try {
    await runtime.memory.createThread({ threadId, resourceId: `${IDENTITY.organizationId}:${IDENTITY.userId}`, title: 'Native concurrent HTTP observers' });
    ownerTask = handler.chat(ORG, USER, { threadId, messages: [{ id: 'observe-human', role: 'user', parts: [{ type: 'text', text: 'Write forty numbered notes.' }] }] }, owner);
    // The production secret filter retains a 256-character suffix. The first
    // three complete notes are visible before the tenth-note provider barrier.
    try { await until(() => text(owner).includes(tokens[2]), 'owner first three complete notes'); }
    catch (error) {
      console.error(JSON.stringify({ phase: 'initial-owner', providerCalls, parts: owner.parts(),
        saved: await handler.getThread(ORG, USER, threadId) }));
      throw error;
    }
    const beforeFinish = await handler.getThread(ORG, USER, threadId);
    assert.equal(beforeFinish.execution.state, 'running');
    assert.deepEqual(beforeFinish.messages, [], 'A reload can read empty Memory while the native model is still streaming.');
    const first = new Response();
    const second = new Response();
    const firstTask = handler.observeThread(ORG, USER, threadId, first);
    const secondTask = handler.observeThread(ORG, USER, threadId, second);
    observers.push(first, second);
    await until(() => text(first).includes(tokens[2]) && text(second).includes(tokens[2]), 'both HTTP observers replay first three complete notes');
    first.emit('close');
    await deadline(firstTask, 'detached HTTP observer');
    release();
    await deadline(Promise.all([ownerTask, secondTask]), 'original owner and remaining observer');
    const history = await handler.getThread(ORG, USER, threadId);
    const saved = history.messages.find(message => message.role === 'assistant');
    const savedText = saved?.parts.filter(part => part.type === 'text').map(part => part.text).join('');
    if (text(owner) !== tokens.join('') || text(second) !== tokens.join('') || savedText !== tokens.join('')) {
      console.error(JSON.stringify({ phase: 'after-joined-observers', providerCalls, expectedChars: tokens.join('').length,
        ownerChars: text(owner).length, observerChars: text(second).length, savedChars: savedText?.length,
        ownerNotes: text(owner).match(/note\d{3}/g), observerNotes: text(second).match(/note\d{3}/g), savedNotes: savedText?.match(/note\d{3}/g) }));
    }
    assert.equal(text(owner), tokens.join(''), 'The original admitted consumer must receive every model delta.');
    assert.equal(text(second), tokens.join(''), 'A midstream observer must replay and follow every delta after another detaches.');
    assert.equal(owner.parts().find(part => part.type === 'start').messageId, saved.id, 'The native start ID identifies the saved assistant.');
    assert.equal(second.parts().find(part => part.type === 'start').messageId, saved.id, 'An observer uses the producer message ID.');
    assert.equal(saved.parts.filter(part => part.type === 'text').map(part => part.text).join(''), tokens.join(''),
      'Native memory must persist all provider deltas across concurrent observer joins/cancellation.');
    assert.equal(history.execution.outcome, 'completed');
    assert.equal(history.pending.length, 0);
    assert.equal(JSON.stringify(history).includes(syntheticKey), false, 'The native secret guard must redact a credential split across provider chunks.');
    const retained = new Response();
    observers.push(retained);
    await deadline(handler.observeThread(ORG, USER, threadId, retained), 'retained terminal native replay');
    assert.equal(text(retained), tokens.join(''), 'The retained native replay survives another reader detaching.');
    const pointer = await threads.readNativeRun(IDENTITY, threadId);
    assert.deepEqual(pointer.response, { runId: pointer.runId, messageId: saved.id });
    const originalRead = threads.readNativeRun.bind(threads);
    let clearAfterOwnership = true;
    threads.readNativeRun = async (...args) => {
      const owned = await originalRead(...args);
      if (clearAfterOwnership) {
        clearAfterOwnership = false;
        await runtime.agent.pubsub.clearTopic(AGENT_STREAM_TOPIC(owned.runId));
      }
      return owned;
    };
    const after = new Response();
    after.status = code => { after.code = code; return after; };
    observers.push(after);
    await deadline(handler.observeThread(ORG, USER, threadId, after), 'terminal native HTTP replay');
    threads.readNativeRun = originalRead;
    assert.equal(after.code, 204, 'A positively saved completed response replaces released native replay.');
    assert.equal(text(after), '', 'The endpoint never fabricates a replacement streaming transcript.');
    const originalRecall = runtime.memory.recall.bind(runtime.memory);
    runtime.memory.recall = async () => ({ messages: [], total: 0, page: 0, perPage: 200, hasMore: false });
    const lag = new Response();
    lag.status = code => { lag.code = code; return lag; };
    observers.push(lag);
    const lagTask = handler.observeThread(ORG, USER, threadId, lag);
    await until(() => lag.headersSent, 'native view while saved response is not yet readable');
    assert.notEqual(lag.code, 204, 'Missing committed Memory cannot be classified as completed replay.');
    assert.equal(lag.writableEnded, false);
    lag.emit('close');
    await deadline(lagTask, 'detached history-commit-lag observer');
    runtime.memory.recall = originalRecall;
    assert.equal(await threads.completedNativeResponse(IDENTITY, threadId, pointer.runId), true);
    let stopDuringRecall = true;
    runtime.memory.recall = async (...args) => {
      const recalled = await originalRecall(...args);
      if (stopDuringRecall) {
        stopDuringRecall = false;
        await handler.stopThread(ORG, USER, threadId);
      }
      return recalled;
    };
    assert.equal(await threads.completedNativeResponse(IDENTITY, threadId, pointer.runId), false,
      'Stop committed during a saved-history read must prevent a stale completed verdict.');
    runtime.memory.recall = originalRecall;
    assert.equal(providerCalls, 1);
    assert.equal(runtime.admissions.length, 1);
    return { providerCalls, admissions: runtime.admissions.length, fullOwner: true, fullConcurrentObserver: true,
      nativeMemoryComplete: true, replayAfterDetach: true, terminalUsesMemory: true, commitLagRetainsUncertainty: true,
      stopDuringReadRefused: true, splitSecretRedacted: true, expectedNotes: tokens.length };
  } finally {
    release();
    for (const observer of observers) observer.emit('close');
    await ownerTask?.catch(() => undefined);
    await runtime.close({ drop: true });
  }
})().then(report => { console.log(JSON.stringify(report)); process.exit(0); }).catch(error => { console.error(error); process.exit(1); });
