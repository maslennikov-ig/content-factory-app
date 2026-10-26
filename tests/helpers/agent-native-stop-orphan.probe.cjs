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
  async function seed(kind, saveTail = true) {
    const threadId = `${runtime.schemaName}-${kind}`, requestId = `${threadId}-request`, runId = `${threadId}-run`;
    await runtime.memory.createThread({threadId, resourceId, title: 'Owned orphan Stop proof', metadata: {unrelated: {keep: true}}});
    const lifecycle = await threads.startTurn(IDENTITY, threadId, requestId, async () => {});
    executionKeys.push(`agent-execution:${requestId}`);
    await threads.rememberNativeRun(IDENTITY, threadId, runId, requestId);
    await threads.rememberNativeResponse(IDENTITY, threadId, runId, `${threadId}-answer`);
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
    await assert.rejects(stop(live), /settlement/);
    report.liveOwnerProtected = (await history(live)).execution.state !== 'settled';

    const replaced = await seed('successor');
    let injected = false;
    memoryStore.updateThreadMetadata = async input => {
      if (input.id === replaced.threadId && !injected) {
        injected = true;
        await runtime.memory.updateThread({id: replaced.threadId, metadata: {
          assistantNativeRun: {runId: 'successor-run', logicalRequestId: 'successor-request', state: 'running'},
          assistantExecution: {requestId: 'successor-request', state: 'running'},
        }});
      }
      return update(input);
    };
    await assert.rejects(stop(replaced), /settlement/);
    const successor = await runtime.memory.getThreadById({threadId: replaced.threadId});
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
