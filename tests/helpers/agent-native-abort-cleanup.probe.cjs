'use strict';

const assert = require('node:assert/strict');
const { getEventListeners } = require('node:events');
const { Agent } = require('@mastra/core/agent');
const { AgentController } = require('@mastra/core/agent-controller');
const { createDurableAgent, getRunRegistryEntry } = require('@mastra/core/agent/durable');
const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { createTool } = require('@mastra/core/tools');
const { Memory } = require('@mastra/memory');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { z } = require('zod');

const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } };
const composite = () => AbortSignal.any([new AbortController().signal]);
const listeners = (signal) => getEventListeners(signal, 'abort').length;
const until = async (predicate) => {
  const deadline = Date.now() + 3000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, 'native cleanup must finish');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

async function main() {
  const storage = new InMemoryStore();
  await storage.init();
  const memory = new Memory({ storage, options: { generateTitle: false, semanticRecall: false } });
  let calls = 0;
  let applied = 0;
  let gate = false;
  const model = new MockLanguageModelV3({ modelId: 'native-abort-cleanup', doStream: async (args) => {
    calls++;
    return { stream: convertArrayToReadableStream([
      { type: 'stream-start', warnings: [] },
      ...(gate && !args.prompt.some((message) => message.role === 'tool')
        ? [{ type: 'tool-call', toolCallId: 'gate-call', toolName: 'question', input: '{}' },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage }]
        : [{ type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: 'Saved native answer.' },
            { type: 'text-end', id: 'done' }, { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage }]),
    ]) };
  } });
  const question = createTool({ id: 'question', description: 'Ask a preserved native question.', inputSchema: z.object({}),
    suspendSchema: z.object({ question: z.string() }), resumeSchema: z.object({ answer: z.string() }),
    execute: async (_input, context) => {
      if (!context.agent.resumeData?.answer) return context.agent.suspend({ question: 'Exact full question?' });
      applied++;
      return { answer: context.agent.resumeData.answer };
    } });
  const agent = createDurableAgent({ agent: new Agent({ id: 'native-abort-cleanup', name: 'Native abort cleanup', model, memory, tools: { question } }), cleanupTimeoutMs: 5 });
  const controller = new AgentController({ id: agent.id, storage, memory, modes: [{ id: 'default', name: 'Default', default: true, agent }] });
  const mastra = new Mastra({ storage, agents: { agent }, agentControllers: { [agent.id]: controller }, backgroundTasks: { enabled: true } });
  try {
    const signal = composite();
    const before = listeners(signal);
    const completed = await agent.stream('Save one synthetic answer.', { memory: { thread: 'cleanup-complete', resource: 'cleanup-user' }, abortSignal: signal });
    await completed.output.consumeStream();
    completed.cleanup();
    await until(() => agent.runRegistry.size === 0);
    assert.equal(listeners(signal), before, 'completed native stream releases its upstream listener');
    assert.equal(signal.aborted, false, 'release is not Stop');

    const registrySignal = composite();
    const direct = await agent.stream('Complete before native registry release.', { memory: { thread: 'cleanup-registry', resource: 'cleanup-user' }, abortSignal: registrySignal });
    await direct.output.consumeStream();
    await getRunRegistryEntry(direct.runId, mastra)?.workflowExecution;
    agent.runRegistry.cleanup(direct.runId);
    assert.equal(listeners(registrySignal), 0, 'native registry release detaches even without the returned stream cleanup');
    direct.cleanup();

    const idleSignal = composite();
    const idle = await agent.stream('Complete a native session idle wrapper.', { memory: { thread: 'cleanup-idle', resource: 'cleanup-user' }, abortSignal: idleSignal, untilIdle: true });
    const reader = idle.fullStream.getReader();
    while (!(await reader.read()).done) { /* Native Session consumes this wrapper. */ }
    idle.cleanup();
    assert.equal(listeners(idleSignal), 0, 'the completed native untilIdle wrapper releases its own abort listener');

    // Native Session keeps these thread subscriptions open between turns.
    // A consumed generator local must not retain its previous full run output.
    const subscriptions = [];
    const consumers = [];
    const oldOutputs = [];
    const oldFinishes = [];
    try {
      for (let index = 0; index < 2; index++) {
        const threadId = `cleanup-live-${index}`;
        await memory.createThread({ threadId, resourceId: 'cleanup-user', title: 'Live subscription retention' });
        const subscription = await agent.subscribeToThread({ threadId, resourceId: 'cleanup-user' });
        subscriptions.push(subscription);
        const consumeOne = async () => {
          const next = await subscription.stream.next();
          if (!next.done && next.value.type === 'finish') oldFinishes.push(new WeakRef(next.value));
          return next.done;
        };
        consumers.push((async () => { while (!(await consumeOne())) { /* Readback frame returns before the next wait. */ } })());
        let result = await agent.stream('Complete this subscribed thread.', { memory: { thread: threadId, resource: 'cleanup-user' } });
        await result.output.consumeStream();
        await getRunRegistryEntry(result.runId, mastra)?.workflowExecution;
        oldOutputs.push(new WeakRef(result.output));
        result.cleanup();
        result = null;
      }
      await until(() => agent.runRegistry.size === 0);
      assert.equal(typeof global.gc, 'function', '--expose-gc is required');
      for (let round = 0; round < 6; round++) {
        await new Promise((resolve) => setImmediate(resolve));
        global.gc();
      }
      assert.ok(oldOutputs.every((output) => output.deref() === undefined), 'two live thread subscriptions release their completed full outputs');
      assert.ok(oldFinishes.length >= 2);
      assert.ok(oldFinishes.every((chunk) => chunk.deref() === undefined), 'idle thread subscriptions release their consumed finish payloads');
    } finally {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      await Promise.all(consumers);
    }

    const nativeFinishes = [];
    const subscribe = agent.subscribeToThread.bind(agent);
    agent.subscribeToThread = async (...args) => {
      const subscription = await subscribe(...args);
      const next = subscription.stream.next.bind(subscription.stream);
      subscription.stream.next = async (...values) => {
        const result = await next(...values);
        if (!result.done && result.value.type === 'finish') nativeFinishes.push(new WeakRef(result.value));
        return result;
      };
      return subscription;
    };
    await controller.init();
    for (let index = 0; index < 2; index++) {
      const threadId = `cleanup-session-${index}`;
      await memory.createThread({ threadId, resourceId: 'cleanup-user', title: 'Live native session retention' });
      const session = await controller.createSession({ id: threadId, resourceId: 'cleanup-user', ownerId: 'cleanup-owner', scope: threadId, createInitialThread: false });
      await session.thread.switch({ threadId, emitEvent: false });
      await session.sendMessage({ content: 'Complete this live native session.' });
    }
    await until(() => agent.runRegistry.size === 0);
    for (let round = 0; round < 6; round++) {
      await new Promise((resolve) => setImmediate(resolve));
      global.gc();
    }
    assert.ok(nativeFinishes.length >= 2);
    assert.ok(nativeFinishes.every((chunk) => chunk.deref() === undefined), 'native Session consumers release their consumed finish payloads');
    agent.subscribeToThread = subscribe;

    gate = true;
    const pendingSignal = composite();
    const pending = await agent.stream('Ask one question.', { memory: { thread: 'cleanup-pending', resource: 'cleanup-user' }, abortSignal: pendingSignal, closeOnSuspend: true });
    await pending.output.consumeStream();
    assert.ok(listeners(pendingSignal) > 0, 'pending native gate keeps its live abort forwarding');
    assert.equal(await pending.output.finishReason, 'suspended');
    await until(async () => JSON.stringify(await (await storage.getStore('workflows')).loadWorkflowSnapshot({ workflowName: agent.getWorkflow().id, runId: pending.runId })).includes('Exact full question?'));
    assert.equal(applied, 0);
    const resumeSignal = composite();
    const resumed = await agent.resume(pending.runId, { answer: 'Exact chosen answer.' }, { toolCallId: 'gate-call', abortSignal: resumeSignal, closeOnSuspend: true });
    await resumed.output.consumeStream();
    resumed.cleanup();
    await until(() => agent.runRegistry.size === 0);
    assert.equal(listeners(resumeSignal), 0, 'resumed native completion releases its new upstream listener');
    assert.equal(listeners(pendingSignal), 0, 'the resumed terminal also releases its previous segment listener');
    assert.equal(resumeSignal.aborted, false);
    assert.equal(applied, 1);
    return { passed: true, completedListenerReleased: true, registryListenerReleased: true, releaseIsNotStop: true, liveSubscriptionsReleasedOutputs: true,
      subscriptionFinishesReleased: true, nativeSessionFinishesReleased: true, pendingGatePreserved: true, resumeListenerReleased: true, applied };
  } finally { await mastra.shutdown(); }
}

main().then((result) => { console.log(JSON.stringify(result)); process.exit(0); }).catch((error) => { console.error(error); process.exit(1); });
