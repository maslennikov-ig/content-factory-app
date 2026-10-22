'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const { z } = require('zod');
const { InMemoryStore } = require('@mastra/core/storage');
const { Mastra } = require('@mastra/core/mastra');
const { Agent } = require('@mastra/core/agent');
const { AgentController } = require('@mastra/core/agent-controller');
const { Memory } = require('@mastra/memory');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { loadCapabilityModule, IDENTITY } = require('./agent-capabilities.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};

async function fixture(risk = 'write') {
  const storage = new InMemoryStore();
  await storage.init();
  const memory = new Memory({ storage, options: { generateTitle: false, semanticRecall: false } });
  const threadId = `receipt-thread-${risk}`;
  await memory.createThread({ threadId, resourceId: 'receipt-resource', title: 'Receipt fault test' });
  const mastra = new Mastra({ storage });
  const state = await storage.getStore('threadState');
  const workflows = await storage.getStore('workflows');
  const f = { storage, memory, mastra, state, workflows, writes: 0 };
  f.run = async () => ({ id: `piece-${++f.writes}` });
  f.execute = async (change = {}) => {
    // Each invocation reloads the real modules, so process-local caches cannot prove safety.
    const adapter = loadCapabilityModule('mastra.adapter.ts');
    const context = loadCapabilityModule('../conductor/conductor.context.ts').buildConductorContext({
      identity: { ...IDENTITY, language: 'ru', timeZone: 'UTC' }, threadId,
    });
    context.set('mastra__durableExecutions', { 'receipt-run': {} });
    f.requestContext = context;
    const tool = adapter.buildMastraCapabilityTools([{
      id: 'piece.create', group: 'content', risk,
      label: { ru: 'Создать', en: 'Create' }, description: 'Synthetic domain write',
      door: {}, input: z.object({ title: z.string() }), untrusted: [],
      run: (...args) => f.run(...args), summarize: (out) => ({ pieceId: out.id }),
    }], { services: () => ({}), language: 'ru' }).piece_create;
    return tool.execute({ title: 'Keep this once' }, {
      runId: 'receipt-run', memory, mastra, requestContext: context,
      agent: { threadId, toolCallId: 'receipt-call' }, ...change,
    });
  };
  return f;
}

describe('durable capability operations fail closed at the real side-effect boundary (R4)', () => {
  for (const risk of ['write', 'paid', 'confirm']) test(`${risk}: losing the completion receipt never authorizes replay after fresh module load`, async () => {
    const f = await fixture(risk);
    const save = f.state.setState.bind(f.state);
    f.state.setState = async (args) => {
      if (args.value?.state === 'committed') throw new Error('receipt store unavailable');
      return save(args);
    };
    const first = await f.execute();
    assert.partialDeepStrictEqual(first, { ok: false, code: 'CAPABILITY_OUTCOME_UNCERTAIN' });
    f.state.setState = save;
    const second = await f.execute();
    assert.partialDeepStrictEqual(second, { ok: false, code: 'CAPABILITY_OUTCOME_UNCERTAIN' });
    assert.equal(f.writes, 1);
  });

  test('read failure cannot mean absence, even when a prior invocation populated a process cache', async () => {
    const f = await fixture();
    assert.partialDeepStrictEqual(await f.execute(), { ok: true, summary: { pieceId: 'piece-1' } });
    f.state.getState = async () => { throw new Error('read unavailable'); };
    assert.partialDeepStrictEqual(await f.execute(), { ok: false, code: 'CAPABILITY_RECEIPT_UNAVAILABLE' });
    assert.equal(f.writes, 1);
  });

  test('an unavailable intent store prevents the domain operation from starting', async () => {
    const f = await fixture();
    f.state.setState = async () => { throw new Error('intent unavailable'); };
    assert.partialDeepStrictEqual(await f.execute(), { ok: false, code: 'CAPABILITY_RECEIPT_UNAVAILABLE' });
    assert.equal(f.writes, 0);
  });

  test('failed atomic ownership acquisition prevents any domain operation', async () => {
    const f = await fixture();
    f.workflows.claimRunOwnership = async () => { throw new Error('claim unavailable'); };
    assert.partialDeepStrictEqual(await f.execute(), { ok: false, code: 'CAPABILITY_RECEIPT_UNAVAILABLE' });
    assert.equal(f.writes, 0);
  });

  test('lost claim acknowledgement cannot be retried even when no intent slot was saved', async () => {
    const f = await fixture();
    const claim = f.workflows.claimRunOwnership.bind(f.workflows);
    f.workflows.claimRunOwnership = async (args) => {
      await claim(args);
      throw new Error('claim acknowledgement lost');
    };
    assert.partialDeepStrictEqual(await f.execute(), { ok: false, code: 'CAPABILITY_RECEIPT_UNAVAILABLE' });
    f.workflows.claimRunOwnership = claim;
    assert.partialDeepStrictEqual(await f.execute(), { ok: false, code: 'CAPABILITY_OUTCOME_UNCERTAIN' });
    assert.equal(f.writes, 0);
  });

  test('a stored completion with lost acknowledgement replays its original result without a second write', async () => {
    const f = await fixture();
    const save = f.state.setState.bind(f.state);
    f.state.setState = async (args) => {
      await save(args);
      if (args.value?.state === 'committed') throw new Error('acknowledgement lost');
    };
    assert.partialDeepStrictEqual(await f.execute(), { ok: false, code: 'CAPABILITY_OUTCOME_UNCERTAIN' });
    f.state.setState = save;
    assert.partialDeepStrictEqual(await f.execute(), { ok: true, summary: { pieceId: 'piece-1' } });
    assert.equal(f.writes, 1);
  });

  test('concurrent drivers invoke one operation and replay only after its completion is durable', async () => {
    const f = await fixture();
    const started = deferred(), finish = deferred();
    f.run = async () => { f.writes++; started.resolve(); await finish.promise; return { id: 'piece-concurrent' }; };
    const first = f.execute();
    await started.promise;
    assert.partialDeepStrictEqual(await f.execute(), { ok: false, code: 'CAPABILITY_OUTCOME_UNCERTAIN' });
    finish.resolve();
    assert.partialDeepStrictEqual(await first, { ok: true });
    assert.partialDeepStrictEqual(await f.execute(), { ok: true, summary: { pieceId: 'piece-concurrent' } });
    assert.equal(f.writes, 1);
  });

  test('completion is retained when Stop arrives after a committed domain write', async () => {
    const f = await fixture();
    const abort = new AbortController();
    f.run = async () => { f.writes++; abort.abort(); return { id: 'piece-before-stop' }; };
    await f.execute({ abortSignal: abort.signal });
    assert.partialDeepStrictEqual(await f.execute(), { ok: true, summary: { pieceId: 'piece-before-stop' } });
    assert.equal(f.writes, 1);
  });

  test('a domain exception after a possible commit remains uncertain and never reexecutes', async () => {
    const f = await fixture();
    f.run = async () => { f.writes++; throw new Error('connection lost after domain commit'); };
    assert.partialDeepStrictEqual(await f.execute(), { ok: false, code: 'CAPABILITY_OUTCOME_UNCERTAIN' });
    assert.partialDeepStrictEqual(await f.execute(), { ok: false, code: 'CAPABILITY_OUTCOME_UNCERTAIN' });
    assert.equal(f.writes, 1);
  });

  test('a lease release never authorizes a second execution, even if its intent slot is missing', async () => {
    const f = await fixture();
    const save = f.state.setState.bind(f.state);
    f.state.setState = async (args) => {
      if (args.value?.state === 'committed') throw new Error('receipt unavailable');
      return save(args);
    };
    assert.equal((await f.execute()).code, 'CAPABILITY_OUTCOME_UNCERTAIN');
    const type = loadCapabilityModule('../conductor/agent-operation-receipts.ts').agentOperationStateType({
      organizationId: IDENTITY.organizationId, runId: 'receipt-run', threadId: 'receipt-thread-write',
      toolName: 'piece_create', toolCallId: 'receipt-call',
    });
    const owner = await f.workflows.getRunOwnership({ runId: type });
    assert.ok(owner);
    await f.workflows.releaseRunOwnership(owner);
    await f.state.deleteState({ threadId: 'receipt-thread-write', type });
    assert.equal((await f.execute()).code, 'CAPABILITY_OUTCOME_UNCERTAIN');
    assert.equal(f.writes, 1);
  });

  test('legacy durable metadata receipts preserve their original result', async () => {
    const f = await fixture();
    await f.memory.updateThread({ id: 'receipt-thread-write', metadata: {
      'assistantReceipt:receipt-run:piece_create:receipt-call': {
        result: { ok: true, capability: 'piece.create', summary: { pieceId: 'piece-legacy' } },
      },
    } });
    assert.partialDeepStrictEqual(await f.execute(), { ok: true, summary: { pieceId: 'piece-legacy' } });
    assert.equal(f.writes, 0);
  });

  test('a durable write missing its native tool-call identity is refused before work', async () => {
    const f = await fixture();
    assert.equal((await f.execute({ agent: { threadId: 'receipt-thread-write' } })).code, 'CAPABILITY_RECEIPT_UNAVAILABLE');
    assert.equal(f.writes, 0);
  });

  test('Stop before invocation cannot start a write or make it replayable', async () => {
    const f = await fixture();
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(f.execute({ abortSignal: abort.signal }), { name: 'AbortError' });
    assert.equal((await f.execute()).code, 'CAPABILITY_OUTCOME_UNCERTAIN');
    assert.equal(f.writes, 0);
  });

  test('an uncertain result blocks a model trying another tool-call ID in the same run', async () => {
    const f = await fixture();
    const save = f.state.setState.bind(f.state);
    f.state.setState = async (args) => {
      if (args.value?.state === 'committed') throw new Error('receipt unavailable');
      return save(args);
    };
    assert.equal((await f.execute()).code, 'CAPABILITY_OUTCOME_UNCERTAIN');
    const requestContext = f.requestContext;
    f.state.setState = save;
    assert.equal((await f.execute({ requestContext,
      agent: { threadId: 'receipt-thread-write', toolCallId: 'a-new-model-call' },
    })).code, 'CAPABILITY_OUTCOME_UNCERTAIN');
    assert.equal(f.writes, 1);
  });

  test('losing both receipt and run-guard writes still blocks alternate IDs from a fresh context', async () => {
    const f = await fixture();
    const save = f.state.setState.bind(f.state);
    f.state.setState = async (args) => {
      if (args.value?.state !== 'pending') throw new Error('all completion and guard writes unavailable');
      return save(args);
    };
    assert.equal((await f.execute()).code, 'CAPABILITY_OUTCOME_UNCERTAIN');
    f.state.setState = save;
    assert.equal((await f.execute({
      agent: { threadId: 'receipt-thread-write', toolCallId: 'new-call-after-restart' },
    })).code, 'CAPABILITY_OUTCOME_UNCERTAIN');
    assert.equal(f.writes, 1);
    const receipts = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
    const scope = { organizationId: IDENTITY.organizationId, runId: 'receipt-run', threadId: 'receipt-thread-write',
      toolName: 'piece_create', toolCallId: 'receipt-call', storage: f.storage };
    assert.equal((await receipts.readAgentOperationRunGuard(scope)).operationType, receipts.agentOperationStateType(scope));
  });

  test('ordinary native batch writes stay allowed, and a tool verdict overrides global approval', async () => {
    const f = await fixture();
    const adapter = loadCapabilityModule('mastra.adapter.ts');
    let active = 0, maximum = 0, step = 0;
    const nativeFences = [];
    const tools = adapter.buildMastraCapabilityTools([{
      id: 'piece.create', group: 'content', risk: 'write', door: {},
      label: { ru: 'Создать', en: 'Create' }, description: 'Create two independent test pieces',
      input: z.object({ title: z.string() }), untrusted: [],
      run: async (_context, input) => {
        maximum = Math.max(maximum, ++active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active--; f.writes++;
        return { id: input.title };
      }, summarize: (value) => ({ pieceId: value.id }),
    }], { services: () => ({}), language: 'ru' });
    const original = tools.piece_create.execute.bind(tools.piece_create);
    tools.piece_create.execute = async (input, context) => {
      const nativeStorage = context.mastra.getStorage();
      const { resolveRunFence } = require('@mastra/core/storage');
      nativeFences.push({ runId: context.runId,
        workflows: resolveRunFence(await nativeStorage.getStore('workflows'), undefined, context.runId),
        memory: resolveRunFence(await nativeStorage.getStore('memory'), undefined),
        memoryOwn: resolveRunFence(await context.memory.storage.getStore('memory'), undefined),
      });
      return original(input, context);
    };
    const usage = { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 5, text: 5 } };
    const model = new MockLanguageModelV3({ doStream: async () => ({ stream: convertArrayToReadableStream([
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: `native-${step}`, modelId: 'mock', timestamp: new Date(0) },
      ...(step++ === 0 ? [
        { type: 'tool-call', toolName: 'piece_create', toolCallId: 'parallel-1', input: JSON.stringify({ title: 'piece-one' }) },
        { type: 'tool-call', toolName: 'piece_create', toolCallId: 'parallel-2', input: JSON.stringify({ title: 'piece-two' }) },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
      ] : [
        { type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: 'Done.' }, { type: 'text-end', id: 'done' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
      ]),
    ]) }) });
    const agent = new Agent({ id: 'receipt-parallel', name: 'Receipt parallel', instructions: 'Run the tools.',
      model, tools, memory: f.memory, durable: { cleanupTimeoutMs: 250 } });
    const mastra = new Mastra({ storage: f.storage, agents: { 'receipt-parallel': agent }, recovery: { durableAgents: 'auto' } });
    const requestContext = loadCapabilityModule('../conductor/conductor.context.ts').buildConductorContext({
      identity: { ...IDENTITY, language: 'ru', timeZone: 'UTC' }, threadId: 'native-parallel',
    });
    const result = await mastra.getAgentById('receipt-parallel').generate('Create two pieces', {
      runId: 'native-parallel-run', memory: { thread: 'native-parallel', resource: `${IDENTITY.organizationId}:${IDENTITY.userId}` },
      requestContext, maxSteps: 3, toolCallConcurrency: { limit: 2, strategy: 'called' }, requireToolApproval: true,
    });
    assert.equal(result.text, 'Done.');
    assert.equal(f.writes, 2, JSON.stringify(nativeFences));
    // Native 1.78 serializes calls under a run-wide approval policy.
    assert.equal(maximum, 1);
    assert.ok(nativeFences.every((value) => value.workflows?.generation > 0));
    await mastra.shutdown();
  });

  test('a native input yield permits its human-resumed phase once, across a fresh context', async () => {
    const f = await fixture('input');
    f.run = async (context) => {
      if (context.resumeData === undefined) return undefined;
      f.writes++;
      return { id: 'piece-after-answer' };
    };
    assert.equal(await f.execute(), undefined);
    const resumed = { agent: { threadId: 'receipt-thread-input', toolCallId: 'receipt-call', resumeData: { answer: 'yes' } } };
    assert.partialDeepStrictEqual(await f.execute(resumed), { ok: true, summary: { pieceId: 'piece-after-answer' } });
    assert.partialDeepStrictEqual(await f.execute(resumed), { ok: true, summary: { pieceId: 'piece-after-answer' } });
    assert.equal(f.writes, 1);
    f.run = async () => ({ id: `piece-after-resume-${++f.writes}` });
    const following = { agent: { threadId: 'receipt-thread-input', toolCallId: 'following-call' } };
    assert.partialDeepStrictEqual(await f.execute(following), { ok: true, summary: { pieceId: 'piece-after-resume-2' } });
    assert.partialDeepStrictEqual(await f.execute(following), { ok: true, summary: { pieceId: 'piece-after-resume-2' } });
    assert.partialDeepStrictEqual(await f.execute(resumed), { ok: true, summary: { pieceId: 'piece-after-answer' } });
    assert.equal(f.writes, 2, 'A committed human-resumed phase permits the next distinct action once.');
    f.run = async () => undefined;
    assert.equal(await f.execute({ agent: { threadId: 'receipt-thread-input', toolCallId: 'receipt-call',
      resumeData: { answer: 'next question' }, suspendPayload: { kind: 'another-question' },
    } }), undefined);
    assert.partialDeepStrictEqual(await f.execute({ agent: { threadId: 'receipt-thread-input', toolCallId: 'after-unanswered-phase' } }),
      { ok: false, code: 'CAPABILITY_OUTCOME_UNCERTAIN' });
    assert.equal(f.writes, 2, 'An older committed resume cannot resolve a later unanswered phase.');
  });

  test('consent and interview resumes of one native call have distinct durable phases', async () => {
    const f = await fixture('paid');
    let phases = 0;
    f.run = async (context) => {
      phases++;
      if (context.resumeData?.stage !== 2) return undefined;
      f.writes++;
      return { id: 'piece-after-consent-and-interview' };
    };
    assert.equal(await f.execute(), undefined);
    assert.equal(await f.execute({ agent: { threadId: 'receipt-thread-paid', toolCallId: 'receipt-call',
      resumeData: { stage: 1, consentGiven: true }, suspendPayload: { kind: 'consent' },
    } }), undefined);
    const interview = { agent: { threadId: 'receipt-thread-paid', toolCallId: 'receipt-call',
      resumeData: { stage: 2, answer: 'Use my answer' }, suspendPayload: { kind: 'interview' },
    } };
    assert.partialDeepStrictEqual(await f.execute(interview), { ok: true });
    assert.partialDeepStrictEqual(await f.execute(interview), { ok: true });
    assert.equal(f.writes, 1);
    assert.equal(phases, 3);
  });

  test('a native queued successor escapes the finished parent lifecycle while old callbacks remain stopped', { timeout: 10_000 }, async () => {
    const storage = new InMemoryStore();
    await storage.init();
    const memory = new Memory({ storage, options: { generateTitle: false, semanticRecall: false } });
    const lifecycle = loadCapabilityModule('../conductor/agent-turn-lifecycle.ts');
    const adapter = loadCapabilityModule('mastra.adapter.ts', { mocks: { '../conductor/agent-turn-lifecycle': lifecycle } });
    const parent = new lifecycle.AgentTurnLifecycle('queue-parent-request', async () => {});
    const started = deferred(), release = deferred(), successorFinished = deferred();
    const writes = [], observedRequests = [], observations = [];
    const tools = adapter.buildMastraCapabilityTools([{
      id: 'piece.create', group: 'content', risk: 'write', door: {},
      label: { ru: 'Создать', en: 'Create' }, description: 'Persist parent and queued pieces',
      input: z.object({ title: z.string() }), untrusted: [],
      run: async (_context, input) => {
        if (input.title === 'parent') { started.resolve(); await release.promise; }
        writes.push(input.title);
        return { id: input.title };
      }, summarize: (value) => ({ pieceId: value.id }),
    }], { services: () => ({}), language: 'ru' });
    const execute = tools.piece_create.execute.bind(tools.piece_create);
    tools.piece_create.execute = async (input, context) => {
      observedRequests.push(context.requestContext.get('cf.executionId'));
      const observation = { runId: context.runId, accepting: parent.acceptingWork,
        hasAbortSignal: !!context.abortSignal, aborted: context.abortSignal?.aborted,
        durable: Object.entries(context.requestContext.get('mastra__durableExecutions') || {}).map(([id, entry]) =>
          ({ id, aborted: entry?.abortController?.signal?.aborted })) };
      observations.push(observation);
      try { const result = await execute(input, context); observation.result = result; return result; }
      catch (error) { observation.error = String(error); throw error; }
    };
    let step = 0, ended = 0;
    const usage = { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 5, text: 5 } };
    const model = new MockLanguageModelV3({ doStream: async () => {
      const phase = step++;
      const title = phase < 2 ? 'parent' : 'successor';
      return { stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'response-metadata', id: `queue-${phase}`, modelId: 'mock', timestamp: new Date(0) },
        ...(phase % 2 === 0 ? [
          { type: 'tool-call', toolName: 'piece_create', toolCallId: `queue-call-${phase}`, input: JSON.stringify({ title }) },
          { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
        ] : [
          { type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: `${title} complete` }, { type: 'text-end', id: 'done' },
          { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
        ]),
      ]) };
    } });
    const agent = new Agent({ id: 'lifecycle-queue', name: 'Lifecycle queue', instructions: 'Run the tools.',
      model, tools, memory, durable: { cleanupTimeoutMs: 250 } });
    const controller = new AgentController({ id: 'lifecycle-queue', agent, storage, memory,
      modes: [{ id: 'assistant', name: 'Assistant', default: true }], defaultModeId: 'assistant' });
    const mastra = new Mastra({ logger: false, storage, agents: { 'lifecycle-queue': agent },
      agentControllers: { 'lifecycle-queue': controller }, recovery: { durableAgents: 'auto' } });
    const host = mastra.getAgentController('lifecycle-queue');
    await host.initStorage();
    const identity = { ...IDENTITY, language: 'ru', timeZone: 'UTC' };
    const resourceId = `${identity.organizationId}:${identity.userId}`;
    const session = await host.createSession({ id: 'lifecycle-queue-session', resourceId, threadId: 'lifecycle-queue-thread' });
    const contextFor = (requestId) => loadCapabilityModule('../conductor/conductor.context.ts').buildConductorContext({
      identity, threadId: 'lifecycle-queue-thread', requestId, trackExecution: true,
    });
    const oldContext = contextFor('queue-parent-request');
    session.onBeforeAgentEnd(async () => {
      if (++ended === 1) await parent.finish('completed');
      else successorFinished.resolve();
    });
    try {
      const running = parent.run(() => session.sendMessage({ content: 'parent', requestContext: oldContext }));
      await started.promise;
      await session.queueMessage({ content: 'successor', requestContext: contextFor('queue-successor-request') });
      release.resolve();
      await running;
      await successorFinished.promise;
      assert.deepEqual(observedRequests, ['queue-parent-request', 'queue-successor-request']);
      assert.deepEqual(writes, ['parent', 'successor'], JSON.stringify(observations));
      assert.ok(observations.every((entry) => entry.hasAbortSignal && entry.aborted === false));
      const witnesses = Object.entries((await memory.getThreadById({ threadId: 'lifecycle-queue-thread' })).metadata || {})
        .filter(([key]) => key.startsWith('assistant-operation-run:'));
      assert.equal(witnesses.length, 2);
      const state = await storage.getStore('threadState');
      for (const [, witness] of witnesses) {
        assert.equal((await state.getState({ threadId: 'lifecycle-queue-thread', type: witness.operationType })).state, 'committed');
      }
      await assert.rejects(parent.run(() => lifecycle.trackAgentTurnWork(oldContext, async () => {
        writes.push('late-parent');
      })), /request has stopped/);
      await assert.rejects(parent.run(() => lifecycle.trackAgentTurnWork(contextFor('fresh-without-native-invocation'), async () => {
        writes.push('unbound-fresh-call');
      })), /request has stopped/);
      assert.deepEqual(writes, ['parent', 'successor']);
    } finally { await host.deleteSession({ resourceId }); await mastra.shutdown(); }
  });

  test('a new native attempt inherits the uncertainty guard of its explicit logical-task lineage', async () => {
    const f = await fixture();
    const save = f.state.setState.bind(f.state);
    f.state.setState = async (args) => {
      if (args.value?.state === 'committed') throw new Error('completion unavailable');
      return save(args);
    };
    assert.equal((await f.execute()).code, 'CAPABILITY_OUTCOME_UNCERTAIN');
    const receipts = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
    const guard = await receipts.readAgentOperationRunGuard({ organizationId: IDENTITY.organizationId,
      threadId: 'receipt-thread-write', runId: 'new-native-attempt', previousRunIds: ['receipt-run'], storage: f.storage, memory: f.memory });
    assert.equal(guard?.state, 'uncertain');
    assert.equal(guard.operationType, receipts.agentOperationStateType({ organizationId: IDENTITY.organizationId,
      threadId: 'receipt-thread-write', runId: 'receipt-run', toolName: 'piece_create', toolCallId: 'receipt-call' }));
    assert.equal(f.writes, 1);
  });

  test('lineage witnesses retain uncertainty after both completion and run-guard acknowledgements are lost', async () => {
    const f = await fixture();
    const save = f.state.setState.bind(f.state);
    f.state.setState = async (args) => {
      if (args.value?.state !== 'pending') throw new Error('completion and guard unavailable');
      return save(args);
    };
    assert.equal((await f.execute()).code, 'CAPABILITY_OUTCOME_UNCERTAIN');
    f.state.setState = save;
    const receipts = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
    const scope = { organizationId: IDENTITY.organizationId, threadId: 'receipt-thread-write',
      runId: 'handoff-attempt', previousRunIds: ['receipt-run'], storage: f.storage, memory: f.memory };
    assert.equal((await receipts.readAgentOperationRunGuard(scope))?.state, 'uncertain');
    // A genuinely separate human request chooses its own logical lineage.
    assert.equal(await receipts.readAgentOperationRunGuard({ ...scope, previousRunIds: [] }), null);
    assert.equal(f.writes, 1);
  });

  test('known committed phases of previous native attempts do not block the next logical-task step', async () => {
    const f = await fixture();
    assert.equal((await f.execute()).ok, true);
    const receipts = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
    assert.equal(await receipts.readAgentOperationRunGuard({ organizationId: IDENTITY.organizationId,
      threadId: 'receipt-thread-write', runId: 'next-native-attempt', previousRunIds: ['receipt-run'], storage: f.storage, memory: f.memory }), null);
    assert.equal(f.writes, 1);
  });

  test('a failed lineage receipt read and a missing memory reader cannot become a clean handoff', async () => {
    const f = await fixture();
    assert.equal((await f.execute()).ok, true);
    const receipts = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
    const scope = { organizationId: IDENTITY.organizationId, threadId: 'receipt-thread-write',
      runId: 'next-native-attempt', previousRunIds: ['receipt-run'], storage: f.storage, memory: f.memory };
    await assert.rejects(receipts.readAgentOperationRunGuard({ ...scope, memory: undefined }), { code: 'CAPABILITY_RECEIPT_UNAVAILABLE' });
    const read = f.state.getState.bind(f.state);
    f.state.getState = async (args) => {
      if (args.type.startsWith('assistant-operation:')) throw new Error('prior operation read unavailable');
      return read(args);
    };
    await assert.rejects(receipts.readAgentOperationRunGuard(scope), { code: 'CAPABILITY_RECEIPT_UNAVAILABLE' });
    assert.equal(f.writes, 1);
  });
});
