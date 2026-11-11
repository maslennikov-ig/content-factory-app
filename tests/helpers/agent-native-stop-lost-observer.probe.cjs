'use strict';
require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const {createRuntime, IDENTITY} = require('./mastra-service-native-integration.probe.cjs');
const {Response, AgentThreadsService, until, mocks} = require('./agent-native-session-http.probe.cjs');
const {loadTypeScriptModule} = require('./load-ts-module.cjs');
const {MockLanguageModelV3} = require('ai/test');
const {AGENT_STREAM_TOPIC} = require('@mastra/core/agent/durable');
const ORG = {id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{role: 'EDITOR'}]};
const USER = {id: IDENTITY.userId, language: 'ru'};
const resourceId = `${IDENTITY.organizationId}:${IDENTITY.userId}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  let providerStarted = false, aborted = false, releasePointer, pointerHeld = false;
  let providerCalls = 0;
  let chatTask, stopTask, runId, stopFinished = false, chatFinished = false;
  let releaseWork, trackedWork, workEntered = false;
  const workGate = new Promise(resolve => { releaseWork = resolve; });
  const tracked = process.env.CF_NATIVE_LOST_OBSERVER_TRACKED === '1';
  const retained = process.env.CF_NATIVE_LOST_OBSERVER_RETAINED === '1';
  const scopeFailed = process.env.CF_NATIVE_LOST_OBSERVER_SCOPE_FAIL === '1';
  let retainedRunId, restoreCleanup, scopeLifecycle;
  const pointerGate = new Promise(resolve => { releasePointer = resolve; });
  const runtime = await createRuntime({modelFactory: modelId => new MockLanguageModelV3({modelId,
    async doStream(args) {
      providerStarted = true;
      providerCalls++;
      return {stream: new ReadableStream({start(controller) {
        controller.enqueue({type: 'stream-start', warnings: []});
        if (providerCalls > 1) {
          controller.enqueue({type: 'text-start', id: 'fresh-text'});
          controller.enqueue({type: 'text-delta', id: 'fresh-text', delta: 'Fresh explicit continuation after verified interruption.'});
          controller.enqueue({type: 'text-end', id: 'fresh-text'});
          controller.enqueue({type: 'finish', finishReason: {unified: 'stop', raw: 'stop'},
            usage: {inputTokens: {total: 1}, outputTokens: {total: 1}}});
          controller.close();
          return;
        }
        args.abortSignal.addEventListener('abort', () => {
          aborted = true;
          controller.error(Object.assign(new Error('Controlled provider abort.'), {name: 'AbortError'}));
        }, {once: true});
      }})};
    },
  })});
  const {AgentController} = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
    ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': runtime.executionModule,
  });
  const threads = new AgentThreadsService(runtime.service, runtime.redis);
  if (tracked) {
    const start = threads.startTurn.bind(threads);
    threads.startTurn = async (...args) => {
      const lifecycle = await start(...args);
      trackedWork = lifecycle.track(async () => {workEntered = true; await workGate; return {ok: true};});
      return lifecycle;
    };
  }
  const handler = new AgentController(runtime.service, threads, runtime.aiUsage);
  const threadId = runtime.schemaName + '-lost-observer';
  const remember = threads.rememberNativeRun.bind(threads);
  threads.rememberNativeRun = async (...args) => {
    await remember(...args);
    runId = args[2]; pointerHeld = true;
    await pointerGate;
  };
  try {
    await runtime.memory.createThread({threadId, resourceId, title: 'Stop before native observer subscription'});
    chatTask = handler.chat(ORG, USER, {threadId, messages: [{id: 'lost-observer-human', role: 'user',
      parts: [{type: 'text', text: 'Controlled native task.'}]}]}, new Response()).finally(() => {chatFinished = true;});
    await until(() => pointerHeld && providerStarted, 'accepted native run before HTTP subscription');
    if (retained) {
      retainedRunId = runId;
      const cleanup = runtime.agent.runRegistry.cleanup.bind(runtime.agent.runRegistry);
      runtime.agent.runRegistry.cleanup = id => {if (id !== retainedRunId) cleanup(id);};
      restoreCleanup = () => {runtime.agent.runRegistry.cleanup = cleanup; cleanup(retainedRunId);};
      const {AgentTurnLifecycle} = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/agent-turn-lifecycle.ts');
      const current = await runtime.memory.getThreadById({threadId});
      scopeLifecycle = new AgentTurnLifecycle(current.metadata.assistantExecution.requestId, async () => {});
      trackedWork = scopeLifecycle.track(async () => {workEntered = true; await workGate; return {ok: !scopeFailed};});
      runtime.service.nativeTaskScopes.set(`${resourceId}:${threadId}`, {
        requestId: scopeLifecycle.requestId, active: () => scopeLifecycle.acceptingWork,
        stopped: () => !scopeLifecycle.acceptingWork,
        drainStoppedWork: () => scopeLifecycle.drainStoppedWork(),
        run: callback => scopeLifecycle.run(callback), stop: () => scopeLifecycle.stop(),
      });
    }
    let stopFailure;
    stopTask = handler.stopThread(ORG, USER, threadId).catch(error => {
      if (!scopeFailed) throw error;
      stopFailure = error;
      return null;
    }).finally(() => {stopFinished = true;});
    const workflows = await runtime.storage.getStore('workflows');
    await until(async () => aborted && (retained || !runtime.agent.runRegistry.get(runId)) &&
      !(await workflows.getWorkflowRunById({workflowName: 'durable-agentic-loop', runId})) &&
      !(await workflows.getWorkflowRunById({workflowName: 'durable-agentic-execution', runId})) &&
      !(await workflows.getRunOwnership({runId}))?.live &&
      (await runtime.agent.pubsub.getHistory(AGENT_STREAM_TOPIC(runId))).length === 0,
    'actual SDK terminal cleanup before HTTP observer');
    if (retained) {
      const entry = runtime.agent.runRegistry.get(runId);
      assert.ok(entry, 'Keep the completed SDK registry entry to reproduce the ownership exclusion cycle.');
      await entry.executionFence.whenSettled;
    }
    const before = await runtime.memory.getThreadById({threadId});
    assert.equal(before.metadata.assistantNativeRun.response, undefined);
    const messagesBefore = (await handler.getThread(ORG, USER, threadId)).messages;
    releasePointer();
    if (tracked || retained) {
      await until(() => workEntered, 'real tracked service Promise');
      await wait(500);
      assert.equal(stopFinished, false, 'An orphan observer does not settle an in-flight capability.');
      assert.notEqual((await handler.getThread(ORG, USER, threadId)).execution.state, 'settled');
      releaseWork();
      await trackedWork;
    }
    let timer;
    const receipt = await Promise.race([stopTask, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Stop hung after native cleanup removed replay before HTTP subscription.')), 3000);
    })]).finally(() => clearTimeout(timer));
    await chatTask;
    const after = await handler.getThread(ORG, USER, threadId);
    const saved = await runtime.memory.getThreadById({threadId});
    if (scopeFailed) {
      assert.ok(stopFailure, 'A failed tracked mutation cannot receive a positive missing-response Stop receipt.');
      assert.equal(after.execution.state, 'settled');
      assert.equal(after.execution.outcome, 'failed', 'The stopped outer HTTP owner must preserve the tracked failure.');
      assert.deepEqual(after.messages, messagesBefore);
      console.log(JSON.stringify({schema: 'native-stop-retained-failed-scope/1', outcome: 'failed', stopRejected: true,
        pendingWorkDrained: true, savedMessagesPreserved: true, paidCalls: 0}));
      return;
    }
    assert.equal(receipt.requestId, before.metadata.assistantExecution.requestId);
    assert.equal(after.execution.state, 'settled');
    assert.equal(after.execution.outcome, 'interrupted');
    assert.equal(after.pending.length, 0);
    assert.deepEqual(after.messages, messagesBefore, 'Interruption must not fabricate or discard a saved message.');
    assert.equal(saved.metadata.assistantNativeRun.stopReceipt.reason, 'native-driver-absent');
    assert.equal(runtime.admissions.length, 1);
    runtime.service.nativeTaskScopes.delete(`${resourceId}:${threadId}`);
    restoreCleanup?.(); restoreCleanup = undefined;
    const stoppedRunId = runId;
    await handler.chat(ORG, USER, {threadId, messages: [{id: 'fresh-continuation-human', role: 'user',
      parts: [{type: 'text', text: 'Continue the same chat with a fresh explicit task.'}]}]}, new Response());
    const continued = await handler.getThread(ORG, USER, threadId);
    assert.equal(continued.execution.outcome, 'completed');
    assert.notEqual(runId, stoppedRunId, 'A new explicit message must start a fresh run.');
    assert.equal(providerCalls, 2, 'Stop must not replay the interrupted work.');
    assert.equal(runtime.admissions.length, 2);
    console.log(JSON.stringify({schema: 'native-stop-lost-observer/1', interrupted: true, replayRemovedBySdk: true,
      responseWasNeverAnnounced: true, savedMessagesPreserved: true, sameChatContinuation: true,
      retainedRegistryAndStoppedScope: retained, nativeProviderCalls: providerCalls, paidCalls: 0}));
  } finally {
    releasePointer(); releaseWork();
    runtime.service.nativeTaskScopes.delete(`${resourceId}:${threadId}`);
    restoreCleanup?.();
    // On the pre-fix failure, release the deliberately empty fixture observer
    // only for cleanup. The successful path never publishes a synthetic tail.
    if ((!chatFinished || !stopFinished) && runId) {
      for (let attempt = 0; attempt < 5 && !chatFinished; attempt++) {
        await runtime.agent.pubsub.publish(AGENT_STREAM_TOPIC(runId), {type: 'finish', runId,
          data: {output: {}, stepResult: {reason: 'abort'}}});
        await wait(50);
      }
    }
    await Promise.allSettled([chatTask, stopTask].filter(Boolean));
    await runtime.close({drop: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
