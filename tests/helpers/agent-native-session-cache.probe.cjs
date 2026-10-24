'use strict';

const assert = require('node:assert/strict');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { z } = require('zod');
const { NativeSessionCache } = loadCapabilityModule('../conductor/native-session-cache.ts');
const resourceId = 'org-service:user-service';
const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } };
const until = async (predicate) => {
  const deadline = Date.now() + 10_000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, 'native cache condition must settle');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

async function protectedEntries() {
  const removed = [];
  const cache = new NativeSessionCache({ idleTimeoutMs: 20, maxIdleSessions: 2,
    hasActiveTask: ({ scope }) => scope === 'task', onError: (error) => { throw error; } });
  const session = (scope) => ({
    run: { isRunning: () => scope === 'running', getRunId: () => null },
    displayState: { get: () => ({ isRunning: false }) },
    approval: { isArmed: () => scope === 'approval' },
    suspensions: { hasPending: () => scope === 'suspension' },
    subscribe: () => () => undefined,
  });
  const controller = { deleteSession: async ({ scope }) => { removed.push(scope); return true; } };
  try {
    for (const scope of ['running', 'approval', 'suspension', 'task']) await cache.remember({ resourceId, scope }, session(scope), controller);
    const release = cache.pin({ resourceId, scope: 'binding' });
    await cache.remember({ resourceId, scope: 'binding' }, session('binding'), controller);
    for (const scope of ['old', 'middle', 'new']) await cache.remember({ resourceId, scope }, session(scope), controller);
    assert.ok(removed.includes('old'), 'new materialization bounds the oldest idle mirror');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.ok(['running', 'approval', 'suspension', 'task', 'binding'].every((scope) => !removed.includes(scope)));
    release();
    await until(() => removed.includes('binding'));
  } finally { await cache.close(); }

  // A timer may fire before the wall-clock idle threshold. Retry its remaining
  // millisecond, rather than postponing otherwise idle memory by another 30s.
  const realNow = Date.now;
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  let elapsed = 0;
  let scheduled;
  Date.now = () => elapsed;
  global.setTimeout = (callback, delay) => (scheduled = { callback, delay, unref() {} });
  global.clearTimeout = () => undefined;
  const earlyRemoved = [];
  const early = new NativeSessionCache({ idleTimeoutMs: 20, hasActiveTask: () => false, onError: (error) => { throw error; } });
  try {
    await early.remember({ resourceId, scope: 'early' }, session('early'), { deleteSession: async () => { earlyRemoved.push('early'); return true; } });
    elapsed = 19;
    scheduled.callback();
    await early.pruning;
    assert.equal(scheduled.delay, 1, 'an early timer retries only the remaining idle time');
    elapsed = 20;
    scheduled.callback();
    await early.pruning;
    assert.deepEqual(earlyRemoved, ['early'], 'an early timer preserves the remaining idle deadline');
  } finally {
    await early.close();
    Date.now = realNow;
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
  }

  let releaseDelete;
  let deleting = false;
  let staleDeletes = 0;
  const racing = new NativeSessionCache({ maxIdleSessions: 0, hasActiveTask: () => false, onError: (error) => { throw error; } });
  const unpinA = racing.pin({ resourceId, scope: 'a' });
  const unpinB = racing.pin({ resourceId, scope: 'b' });
  try {
    await racing.remember({ resourceId, scope: 'a' }, session('a'), { deleteSession: async () => {
      deleting = true;
      await new Promise((resolve) => { releaseDelete = resolve; });
      return true;
    } });
    await racing.remember({ resourceId, scope: 'b' }, session('b'), { deleteSession: async () => { staleDeletes++; return true; } });
    unpinA();
    await until(() => deleting);
    unpinB();
    const replacement = racing.remember({ resourceId, scope: 'b' }, session('replacement'), { deleteSession: async () => true });
    releaseDelete();
    await replacement;
    assert.equal(staleDeletes, 0, 'a stale prune snapshot cannot delete a replacement native Session');
  } finally { releaseDelete?.(); await racing.close(); }
}

async function main() {
  await protectedEntries();
  let providerActive = false;
  let deniedDomainCalls = 0;
  const modelCalls = [];
  const { CAPABILITY_CATALOGUE } = loadCapabilityModule('capability.registry.ts');
  const common = { group: 'content', label: { ru: 'Проверка кэша', en: 'Cache fixture' }, description: 'Native cache fixture.', input: z.object({}),
    untrusted: [], beforeApproval: undefined, approvalContent: undefined, describeApproval: undefined, summarize: (result) => result };
  const read = { ...CAPABILITY_CATALOGUE.find((entry) => entry.risk === 'read'), ...common, id: 'cache.read', risk: 'read',
    run: async () => { deniedDomainCalls++; return { answer: 'unexpected domain read' }; } };
  const question = { ...CAPABILITY_CATALOGUE.find((entry) => entry.risk === 'input'), ...common, id: 'cache.question', risk: 'input',
    suspendSchema: z.object({ question: z.string() }), resumeSchema: z.object({ answer: z.string() }), run: async (ctx) => {
      if (!ctx.resumeData?.answer) return ctx.suspend({ question: 'Exact pending cache question?' });
      return { answer: ctx.resumeData.answer };
    } };
  const runtime = await createRuntime({ capabilities: [read, question],
    modelFactory: (modelId) => new MockLanguageModelV3({ modelId, doStream: async (args) => {
      const prompt = JSON.stringify(args.prompt);
      modelCalls.push({ modelId, coldRead: prompt.includes('CHECK_READ_DENY') });
      if (prompt.includes('HOLD_CACHE_PROVIDER')) {
        providerActive = true;
        await new Promise((_resolve, reject) => {
          const abort = () => reject(Object.assign(new Error('Owned cache test stopped.'), { name: 'AbortError' }));
          if (args.abortSignal?.aborted) abort();
          else args.abortSignal?.addEventListener('abort', abort, { once: true });
        });
      }
      const tool = (prompt.includes('PARK_CACHE_QUESTION') || prompt.includes('CHECK_READ_DENY')) && !args.prompt.some((message) => message.role === 'tool');
      return { stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        ...(tool ? [{ type: 'tool-call', toolCallId: 'cache-gate', toolName: prompt.includes('CHECK_READ_DENY') ? 'cache_read' : 'cache_question', input: '{}' },
          { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage }]
          : [{ type: 'text-start', id: 'saved' }, { type: 'text-delta', id: 'saved', delta: 'Saved cached answer.' },
            { type: 'text-end', id: 'saved' }, { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage }]),
      ]) };
    } }),
  });
  let active;
  let pending;
  const work = async (threadId, content, create = true) => {
    if (create) await runtime.memory.createThread({ threadId, resourceId, title: `Cache ${threadId}` });
    const requestContext = runtime.contextModule.buildConductorContext({ identity: IDENTITY, threadId, requestId: `request-${threadId}-${content}` });
    const session = await runtime.service.sessionFor(IDENTITY, threadId, { bindThread: true, requestContext });
    const execution = new runtime.executionModule.ConductorExecution({ requestId: `request-${threadId}-${content}`, native: true });
    const settled = execution.run(() => session.sendMessage({ content, requestContext }));
    return { session, settled: settled.catch((error) => ({ error })) };
  };
  try {
    const first = await work('cache-first', 'COMPLETE_CACHE_FIRST');
    assert.equal((await first.settled)?.error, undefined);
    await first.session.permissions.setForCategory({ category: 'read', policy: 'deny' });
    await first.session.model.switch('selected-primary');
    pending = await work('cache-pending', 'PARK_CACHE_QUESTION');
    await until(() => pending.session.suspensions.hasPending());
    active = await work('cache-active', 'HOLD_CACHE_PROVIDER');
    await until(() => providerActive && active.session.run.isRunning());
    for (let index = 0; index < 12; index++) {
      const completed = await work(`cache-idle-${index}`, `COMPLETE_CACHE_${index}`);
      assert.equal((await completed.settled)?.error, undefined);
    }
    await until(async () => !(await runtime.controller.getSessionByResource(resourceId, 'cache-first')));
    assert.ok(runtime.service.nativeSessionCache.size <= 10, 'at most eight idle mirrors plus the two protected runs');
    await new Promise((resolve) => setTimeout(resolve, 35_000));
    const cached = [];
    for (const scope of ['cache-first', 'cache-pending', 'cache-active', ...Array.from({ length: 12 }, (_, index) => `cache-idle-${index}`)]) {
      const current = await runtime.controller.getSessionByResource(resourceId, scope);
      if (current) cached.push({ scope, running: current.run.isRunning(), runId: current.run.getRunId(), displayRunning: current.displayState.get().isRunning,
        pending: current.suspensions.hasPending(), approval: current.approval.isArmed({ threadId: scope }) });
    }
    process.stderr.write(`${JSON.stringify({ stage: 'cache-expiry', count: runtime.service.nativeSessionCache.size, cached })}\n`);
    await until(() => runtime.service.nativeSessionCache.size === 2);
    assert.equal(await runtime.controller.getSessionByResource(resourceId, 'cache-pending'), pending.session);
    assert.equal(await runtime.controller.getSessionByResource(resourceId, 'cache-active'), active.session);
    assert.equal(pending.session.suspensions.hasPending(), true);
    assert.equal(active.session.run.isRunning(), true);
    const history = await runtime.memory.recall({ threadId: 'cache-first', resourceId, page: 0, perPage: 10 });
    assert.ok(JSON.stringify(history.messages).includes('Saved cached answer.'));
    const recreated = await work('cache-first', 'CHECK_READ_DENY', false);
    assert.notEqual(recreated.session, first.session);
    assert.equal(recreated.session.model.get(), 'selected-primary');
    assert.equal(recreated.session.permissions.getRules().categories.read, 'deny');
    assert.equal((await recreated.settled)?.error, undefined);
    assert.equal(deniedDomainCalls, 0, 'cold recreation preserves denial before domain execution');
    assert.ok(modelCalls.some((call) => call.coldRead && call.modelId === 'selected-primary'), 'the next native provider call uses the saved selected model');
    assert.equal((await runtime.memory.getThreadById({ threadId: 'cache-first' })).title, 'Cache cache-first');
    return { passed: true, maxIdleSessions: 8, idleTimeoutMs: 30000, coldHistory: true, coldReadDeny: true,
      nextRequest: true, pendingPreserved: true, activePreserved: true, bindingAndTaskScopeProtected: true };
  } finally {
    active?.session.abort({ localOnly: true });
    pending?.session.abort({ localOnly: true });
    await Promise.allSettled([active?.settled, pending?.settled]);
    await runtime.close({ drop: true });
  }
}

main().then((result) => { console.log(JSON.stringify(result)); process.exit(0); }).catch((error) => { console.error(error); process.exit(1); });
