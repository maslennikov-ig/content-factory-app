'use strict';
require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const {createRuntime, IDENTITY} = require('./mastra-service-native-integration.probe.cjs');
const {AgentThreadsService, mocks} = require('./agent-native-session-http.probe.cjs');
const {loadTypeScriptModule} = require('./load-ts-module.cjs');
const ORG = {id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{role: 'EDITOR'}]};
const USER = {id: IDENTITY.userId, language: 'ru'};
const resourceId = `${IDENTITY.organizationId}:${IDENTITY.userId}`;

(async () => {
  const runtime = await createRuntime();
  const {AgentController} = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
    ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': runtime.executionModule,
  });
  const threads = new AgentThreadsService(runtime.service, runtime.redis);
  const handler = new AgentController(runtime.service, threads, runtime.aiUsage);
  const memoryStore = await runtime.storage.getStore('memory');
  const update = memoryStore.updateThreadMetadata.bind(memoryStore);
  const report = {};
  const executionKeys = [];
  async function seed(kind, saveTail = true, announceResponse = true) {
    const threadId = `${runtime.schemaName}-${kind}`, requestId = `${threadId}-request`, runId = `${threadId}-run`;
    await runtime.memory.createThread({threadId, resourceId, title: 'Owned orphan Stop proof', metadata: {unrelated: {keep: true}}});
    const lifecycle = await threads.startTurn(IDENTITY, threadId, requestId, async () => {});
    executionKeys.push(`agent-execution:${requestId}`);
    await threads.rememberNativeRun(IDENTITY, threadId, runId, requestId);
    if (announceResponse) await threads.rememberNativeResponse(IDENTITY, threadId, runId, `${threadId}-answer`);
    if (saveTail) await runtime.memory.saveMessages({messages: [{id: `${threadId}-answer`, role: 'assistant', threadId, resourceId,
      createdAt: new Date('2026-10-25T00:00:00Z'), type: 'text', content: {format: 2, parts: [{type: 'text', text: 'Preserved partial draft.'}]}}]});
    return {threadId, requestId, runId, lifecycle};
  }
  const history = args => handler.getThread(ORG, USER, args.threadId);
  const stop = args => handler.stopThread(ORG, USER, args.threadId);
  try {
    const orphan = await seed('orphan');
    assert.equal((await history(orphan)).execution.state, 'running');
    const before = await runtime.memory.getThreadById({threadId: orphan.threadId});
    const receipt = await stop(orphan);
    const stopped = await history(orphan);
    assert.equal(receipt.requestId, orphan.requestId);
    assert.equal(stopped.execution.state, 'settled', 'A positive cold Stop must not leave its orphan task running');
    assert.equal(stopped.execution.outcome, 'interrupted');
    assert.equal(stopped.pending.length, 0);
    assert.ok(stopped.messages.some(m => m.id === `${orphan.threadId}-answer`));
    assert.deepEqual((await runtime.memory.getThreadById({threadId: orphan.threadId})).metadata.unrelated, before.metadata.unrelated);
    report.orphan = stopped.execution.outcome;
    await runtime.redis.del(`agent-execution:${orphan.requestId}`);
    report.redisExpired = (await history(orphan)).execution.outcome;
    assert.equal((await stop(orphan)).requestId, orphan.requestId, 'Repeated Stop keeps the original identity');

    const workflows = await runtime.storage.getStore('workflows');
    const terminalAncestors = ['success', 'failed', 'canceled', 'tripwire', 'bailed', 'skipped'];
    for (const status of terminalAncestors) {
      const continued = await seed(`ancestor-${status}`);
      const previousRunId = `${continued.runId}-previous`;
      const snapshot = {runId: previousRunId, status, value: {}, context: {}, serializedStepGraph: [],
        activePaths: [], activeStepsPath: {}, suspendedPaths: {}, resumeLabels: {}, waitingPaths: {}, timestamp: Date.now()};
      await workflows.persistWorkflowSnapshot({workflowName: 'durable-agentic-loop', runId: previousRunId, resourceId, snapshot});
      await update({id: continued.threadId, resourceId, update: current => ({assistantNativeRun: {
        ...current.metadata.assistantNativeRun, previousRunId, lineageRunIds: [previousRunId],
      }})});
      await stop(continued);
      const after = await history(continued);
      assert.equal(after.execution.state, 'settled', `Terminal ancestor ${status} must not block cold Stop`);
      assert.equal(after.execution.outcome, 'interrupted');
      assert.equal(after.pending.length, 0);
      assert.equal((await workflows.getWorkflowRunById({workflowName: 'durable-agentic-loop', runId: previousRunId})).snapshot.status, status);
    }
    report.terminalAncestorsPreserved = terminalAncestors.length;

    const activeAncestors = ['running', 'pending', 'suspended', 'waiting', 'paused'];
    for (const status of [...activeAncestors, 'success']) {
      const currentTarget = status === 'success';
      const target = await seed(`protected-${status}`);
      const relatedRunId = currentTarget ? target.runId : `${target.runId}-previous`;
      await workflows.persistWorkflowSnapshot({workflowName: 'durable-agentic-loop', runId: relatedRunId, resourceId,
        snapshot: {runId: relatedRunId, status, value: {}, context: {}, serializedStepGraph: [], activePaths: [],
          activeStepsPath: {}, suspendedPaths: {}, resumeLabels: {}, waitingPaths: {}, timestamp: Date.now()}});
      await update({id: target.threadId, resourceId, update: current => ({
        assistantNativeRun: {...current.metadata.assistantNativeRun, state: 'stopped', ...(currentTarget ? {} : {previousRunId: relatedRunId})},
        assistantExecution: {...current.metadata.assistantExecution, state: 'stopping', stopRequested: true},
      })});
      assert.equal(await runtime.service.settleStoppedNativeRun({threadId: target.threadId, requestId: target.requestId,
        runId: target.runId, resourceId}), false, `Uncanceled target/nonterminal ancestor ${status} must stay protected`);
      assert.equal(await runtime.service.stoppedNativeDriverAbsent({threadId: target.threadId, requestId: target.requestId,
        runId: target.runId, resourceId}), false, `Stored target/nonterminal ancestor ${status} is not an absent driver`);
    }
    report.nonterminalAncestorsProtected = activeAncestors.length;
    report.uncanceledTargetProtected = true;

    const completed = await seed('completed');
    await completed.lifecycle.finish('completed');
    await stop(completed);
    report.completedPreserved = (await history(completed)).execution.outcome === 'completed';

    const missing = await seed('missing-tail', false);
    await assert.rejects(stop(missing), /saved response/);
    report.missingTailRejected = (await history(missing)).execution.state !== 'settled';

    const unannounced = await seed('unannounced', false, false);
    const unannouncedReceipt = await stop(unannounced);
    const unannouncedThread = await runtime.memory.getThreadById({threadId: unannounced.threadId});
    assert.equal(unannouncedReceipt.requestId, unannounced.requestId);
    assert.equal((await history(unannounced)).execution.outcome, 'interrupted');
    assert.equal((await history(unannounced)).messages.length, 0, 'An interruption receipt cannot invent an assistant.');
    assert.deepEqual(unannouncedThread.metadata.assistantNativeRun.stopReceipt,
      {version: 1, runId: unannounced.runId, requestId: unannounced.requestId, reason: 'native-driver-absent'});
    assert.equal((await stop(unannounced)).requestId, unannounced.requestId);
    report.unannouncedOrphanInterrupted = true;

    const failedProof = await seed('failed-http-proof', false, false);
    memoryStore.updateThreadMetadata = async input => update({...input, update: current => {
      const patch = input.update(current);
      if (current.id === failedProof.threadId && patch?.assistantNativeRun?.response)
        throw new Error('Controlled HTTP response proof failure.');
      return patch;
    }});
    try {
      await assert.rejects(threads.rememberNativeResponse(IDENTITY, failedProof.threadId, failedProof.runId, 'not-saved'), /Controlled HTTP response proof failure/);
    } finally { memoryStore.updateThreadMetadata = update; }
    const failedProofPointer = (await runtime.memory.getThreadById({threadId: failedProof.threadId})).metadata.assistantNativeRun;
    assert.equal(failedProofPointer.response, undefined);
    assert.equal(failedProofPointer.responseAnnounced, true);
    await assert.rejects(stop(failedProof), /saved response/);
    report.failedHttpProofRejected = true;

    const failed = await seed('failed-commit');
    memoryStore.updateThreadMetadata = async input => update({...input, update: current => {
      const patch = input.update(current);
      if (current.id === failed.threadId && patch?.assistantExecution?.state === 'settled') throw new Error('Controlled orphan terminal commit failure.');
      return patch;
    }});
    await assert.rejects(stop(failed), /Controlled orphan terminal commit failure/);
    report.failedCommitRejected = (await history(failed)).execution.state !== 'settled';
    memoryStore.updateThreadMetadata = update;

    const live = await seed('live-owner');
    const claimed = await workflows.claimRunOwnership({runId: live.runId, ownerId: 'another-live-driver', leaseMs: 10_000});
    assert.equal(claimed.acquired, true);
    const ownerBefore = await workflows.getRunOwnership({runId: live.runId});
    assert.equal(ownerBefore.live, true);
    const finalize = runtime.service.finalizeNativeStop.bind(runtime.service);
    let deadlineVerified = false;
    runtime.service.finalizeNativeStop = async (input, options) => {
      assert.deepEqual(input, {threadId: live.threadId, resourceId, requestId: live.requestId, runId: live.runId});
      assert.equal(options?.waitForOwnerMs, 35_000, 'Production Stop retains its configured owner wait.');
      try { return await finalize(input, {waitForOwnerMs: 20}); }
      catch (error) {
        assert.equal(error.code, 'NATIVE_STOP_OWNER_PENDING');
        assert.equal(error.message, 'Native Stop still has an active or changed native owner.');
        deadlineVerified = true;
        throw error;
      }
    };
    try {
      await assert.rejects(stop(live), error => error.getStatus?.() === 503 && error.message === 'Native Stop is waiting for its current owner.');
    } finally { runtime.service.finalizeNativeStop = finalize; }
    const ownerAfter = await workflows.getRunOwnership({runId: live.runId});
    assert.equal(ownerAfter.live, true);
    assert.equal(ownerAfter.ownerId, ownerBefore.ownerId);
    assert.equal(ownerAfter.generation, ownerBefore.generation);
    assert.equal(deadlineVerified, true);
    report.liveOwnerDeadlineVerified = true;
    report.liveOwnerProtected = (await history(live)).execution.state !== 'settled';

    const pendingOwner = await seed('pending-http-owner');
    let releaseOwner;
    const pendingHandle = threads.registerActiveTurn({identity: IDENTITY, threadId: pendingOwner.threadId,
      requestId: pendingOwner.requestId, onStop: async () => {},
      settled: new Promise(resolve => {releaseOwner = resolve;}),
    });
    const originalTimeout = global.setTimeout;
    let boundedWaitObserved = false;
    global.setTimeout = (callback, delay, ...args) => {
      if (delay === 35_000) {boundedWaitObserved = true; delay = 20;}
      return originalTimeout(callback, delay, ...args);
    };
    try {
      await assert.rejects(stop(pendingOwner), error => error.getStatus?.() === 503 &&
        error.message === 'Native Stop is waiting for its current owner.');
      assert.equal(boundedWaitObserved, true, 'The HTTP owner wait must retain its bounded production deadline.');
      assert.notEqual((await history(pendingOwner)).execution.state, 'settled');
      assert.equal(await threads.activeTurnFor(IDENTITY, pendingOwner.threadId), pendingHandle,
        'An unresolved owner is preserved after a bounded Stop refusal.');
      report.pendingHttpOwnerDeadlineProtected = true;
    } finally {
      global.setTimeout = originalTimeout;
      releaseOwner(); pendingHandle.finishStream();
    }

    const replaced = await seed('successor');
    let injected = false, successorBefore;
    memoryStore.updateThreadMetadata = async input => {
      if (input.id === replaced.threadId && !injected) {
        injected = true;
        await runtime.memory.updateThread({id: replaced.threadId, metadata: {
          assistantNativeRun: {runId: 'successor-run', logicalRequestId: 'successor-request', state: 'running'},
          assistantExecution: {requestId: 'successor-request', state: 'running'},
        }});
        successorBefore = await runtime.memory.getThreadById({threadId: replaced.threadId});
      }
      return update(input);
    };
    await assert.rejects(stop(replaced), error => error.message === 'Native Stop task changed.');
    const successor = await runtime.memory.getThreadById({threadId: replaced.threadId});
    assert.deepEqual(successor.metadata, successorBefore.metadata, 'Refusing the stale Stop preserves all successor metadata.');
    assert.equal(successor.resourceId, successorBefore.resourceId);
    report.successorPreserved = successor.metadata.assistantNativeRun.runId === 'successor-run' &&
      successor.metadata.assistantExecution.requestId === 'successor-request' && successor.metadata.assistantExecution.state === 'running';
    report.modelCalls = runtime.attempts.length;
    assert.equal(report.modelCalls, 0, 'Cold Stop cannot invoke a model or replay an answer');
  } finally {
    memoryStore.updateThreadMetadata = update;
    if (executionKeys.length) await runtime.redis.del(...executionKeys);
    await runtime.close({drop: true});
  }
  console.log(JSON.stringify(report));
})().catch(error => {console.error(error); process.exitCode = 1;});
