'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { Response, HttpController, AgentThreadsService, until } = require('./agent-native-session-http.probe.cjs');
const ORG = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
const USER = { id: IDENTITY.userId, language: 'ru' };

async function scenario(kind) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-native-queued-http-'));
  const auditPath = path.join(directory, 'audit.jsonl');
  const mode = kind === 'stop' ? 'question' : kind;
  const modelScopes = [];
  let executionModule;
  const runtime = await createRuntime({ auditPath, mode, fixtureMode: mode,
    onAttempt: () => { modelScopes.push(executionModule?.currentConductorExecution() ?? null); },
  });
  executionModule = runtime.executionModule;
  const threadId = `${runtime.schemaName}-${kind}`;
  const threads = new AgentThreadsService(runtime.service, runtime.redis);
  let httpAdmissions = 0;
  const handler = new HttpController(runtime.service, threads, {
    beginAiOperation: async () => { httpAdmissions++; throw new Error('A queued card must reuse its native owner admission.'); },
  });
  const phase = label => { if (process.env.CF_NATIVE_QUEUED_HTTP_DEBUG) console.error(JSON.stringify({ kind, phase: label, schemaName: runtime.schemaName })); };
  let pendingRunId;
  let completed = false;
  try {
    phase('create');
    await runtime.memory.createThread({ threadId, resourceId: `${IDENTITY.organizationId}:${IDENTITY.userId}`, title: 'Queued native card' });
    const accepted = await handler.signalThread(ORG, USER, threadId, { kind: 'queue', message: {
      id: `queued-${kind}`, role: 'user', parts: [{ type: 'text', text: 'Ask before continuing.' }],
    } });
    assert.equal(accepted.accepted, true);
    phase('accepted');
    let history;
    await until(async () => {
      history = await handler.getThread(ORG, USER, threadId);
      return history.pending.length > 0;
    }, `${kind} queued native card`);
    const pending = history.pending[0];
    pendingRunId = pending.runId;
    phase('pending');
    assert.equal(await threads.activeTurnFor(IDENTITY, threadId), null, 'This task is owned by the native queue, outside HTTP ActiveTurns.');
    const pointer = await threads.readNativeRun(IDENTITY, threadId);
    assert.equal(pointer.logicalRequestId, accepted.requestId);
    assert.equal(runtime.service.hasNativeTaskOwner(IDENTITY, threadId, accepted.requestId), true, JSON.stringify({
      admissions: runtime.admissions,
      registry: runtime.agent.runRegistry.runIds.map(runId => ({ runId,
        workflowExecution: !!runtime.agent.runRegistry.get(runId)?.workflowExecution,
        aborted: runtime.agent.runRegistry.get(runId)?.abortSignal?.aborted,
        requestId: runtime.agent.runRegistry.get(runId)?.requestContext?.getRaw('cf.requestId'),
        memory: runtime.agent.runRegistry.getMemoryInfo(runId),
      })),
    }));
    const answer = mode === 'approval'
      ? { threadId, messages: [{ id: 'queued-approval', role: 'assistant', parts: [{ type: 'tool-fixture_persist', toolCallId: pending.toolCallId,
        state: 'approval-responded', input: {}, approval: { id: `${pending.runId}::${pending.toolCallId}`, approved: true } }] }] }
      : { threadId, runId: pending.runId, toolCallId: pending.toolCallId, cardId: pending.suspendPayload?.cardId, resumeData: { answer: 'Proceed.' } };
    const session = await runtime.controller.getSessionByResource(`${IDENTITY.organizationId}:${IDENTITY.userId}`, threadId);
    const errors = [];
    const unsubscribe = session.subscribe(event => { if (event.type === 'error') errors.push(String(event.error?.message ?? event.error)); });
    if (kind === 'stop') {
      phase('stop-dispatch');
      let timeout;
      try {
        await Promise.race([handler.stopThread(ORG, USER, threadId), new Promise((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(`Queued Stop did not return: ${JSON.stringify({
            schemaName: runtime.schemaName, errors, admissions: runtime.admissions,
            nativeOwner: runtime.service.hasNativeTaskOwner(IDENTITY, threadId, accepted.requestId),
            running: session.run.isRunning(), streaming: session.stream.isActive(),
          })}`)), 10_000);
        })]);
      } finally { clearTimeout(timeout); }
      phase('stop-returned');
    } else {
      phase('answer-dispatch');
      const response = new Response();
      let timeout;
      try {
        await Promise.race([handler.chat(ORG, USER, answer, response), new Promise((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(`Queued ${kind} answer did not finish: ${JSON.stringify({
            schemaName: runtime.schemaName, errors, admissions: runtime.admissions,
            running: session.run.isRunning(), streaming: session.stream.isActive(),
            parts: response.parts().map(part => part.type),
          })}`)), 10_000);
        })]);
      } finally { clearTimeout(timeout); }
      assert.equal(response.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join(''), 'Service native answer.');
      phase('answer-finished');
    }
    unsubscribe();
    let settledHistory;
    await until(async () => {
      const saved = await handler.getThread(ORG, USER, threadId);
      settledHistory = saved;
      return saved.pending.length === 0 && saved.execution.state === 'settled';
    }, `${kind} native owner settled`).catch(async error => { throw new Error(`${error.message}: ${JSON.stringify({
      pending: settledHistory?.pending, execution: settledHistory?.execution, errors,
      admissions: runtime.admissions, nativeOwner: runtime.service.hasNativeTaskOwner(IDENTITY, threadId, accepted.requestId),
      metadata: (await runtime.memory.getThreadById({ threadId }))?.metadata,
    })}`); });
    await assert.rejects(handler.chat(ORG, USER, answer, new Response()), error => error.getStatus?.() === 409);
    assert.equal(runtime.service.hasNativeTaskOwner(IDENTITY, threadId, accepted.requestId), false);
    const savedPointer = await threads.readNativeRun(IDENTITY, threadId);
    assert.equal(savedPointer.response?.runId, savedPointer.runId);
    assert.equal(typeof savedPointer.response?.messageId, 'string');
    assert.ok(settledHistory.messages.some(message =>
      message.role === 'assistant' && message.id === savedPointer.response.messageId
    ), 'The native queue proof must identify an actual saved assistant, including Stop without an HTTP owner.');
    const events = fs.readFileSync(auditPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const domainCalls = events.filter(event => event.type === 'tool').length;
    assert.equal(domainCalls, kind === 'stop' ? 0 : 1);
    assert.equal(httpAdmissions, 0);
    assert.equal(runtime.admissions.length, 1);
    assert.ok(modelScopes[0] && modelScopes.every(scope => scope === modelScopes[0]),
      `Native queued callbacks retain the original execution scope: ${JSON.stringify(modelScopes.map(Boolean))}`);
    completed = true;
    phase('complete');
    return { kind, nativeAdmissions: runtime.admissions.length, httpAdmissions, domainCalls, repeatedAnswerRefused: true };
  } finally {
    phase('cleanup');
    if (!completed && pendingRunId) {
      runtime.agent.abortRunStream(pendingRunId);
      await (await runtime.agent.getWorkflow().createRun({ runId: pendingRunId })).cancel().catch(() => undefined);
    }
    await runtime.close({ drop: true });
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function proofScenario() {
  const runtime = await createRuntime({ mode: 'success' });
  const threadId = runtime.schemaName + '-proof';
  const resourceId = IDENTITY.organizationId + ':' + IDENTITY.userId;
  const requestId = 'queued-proof-request-a';
  const runId = 'queued-proof-run-a';
  const input = { identity: IDENTITY, threadId, resourceId, requestId, childRunId: runId,
    signal: { id: 'proof-human', contents: 'Controlled queued proof.', createdAt: '2026-01-01T00:00:00.000Z', author: { id: IDENTITY.userId } } };
  let releaseWrite;
  try {
    await runtime.memory.createThread({ threadId, resourceId, title: 'Queued exact response proof' });
    const owner = await runtime.service.queuedInputRuntime(input);
    assert.equal(typeof owner.onMessageId, 'function');
    const memoryStore = await runtime.storage.getStore('memory');
    const update = memoryStore.updateThread.bind(memoryStore);
    const reset = (marker = { requestId, state: 'running' }, pointer) => runtime.memory.updateThread({ id: threadId,
      metadata: { assistantExecution: marker, assistantNativeRun: pointer ?? { runId, logicalRequestId: requestId, state: 'running' } } });
    const pointer = async () => (await runtime.memory.getThreadById({ threadId })).metadata.assistantNativeRun;
    const record = messageId => owner.onMessageId(runId, messageId);

    // A start chunk can reach its original reader before model admission
    // writes its run pointer. Both writers must preserve the same proof.
    await reset({ requestId, state: 'running' }, {});
    let entered = false;
    const held = new Promise(resolve => { releaseWrite = resolve; });
    memoryStore.updateThread = async args => {
      if (args.id === threadId && args.metadata?.assistantNativeRun?.response) { entered = true; await held; }
      return update(args);
    };
    const recording = record('exact-queued-assistant-a');
    await until(() => entered, 'held exact proof write');
    let initialised = false;
    const initialising = runtime.service.patchNativeRun(threadId, { runId, logicalRequestId: requestId, state: 'running' }, true)
      .then(() => { initialised = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(initialised, false, 'same-instance initializer must not race past the public metadata updater');
    releaseWrite();
    await Promise.all([recording, initialising]);
    memoryStore.updateThread = update;
    assert.deepEqual((await pointer()).response, { runId, messageId: 'exact-queued-assistant-a' });

    // A newer request is authoritative; an old reader cannot restore itself.
    const successor = { runId: 'queued-proof-run-b', logicalRequestId: 'queued-proof-request-b', state: 'running',
      response: { runId: 'queued-proof-run-b', messageId: 'exact-queued-assistant-b' } };
    await reset({ requestId: successor.logicalRequestId, state: 'running' }, successor);
    await record('late-a');
    assert.deepEqual(await pointer(), successor);
    await reset();
    await owner.onMessageId('wrong-run', 'wrong-response');
    assert.equal((await pointer()).response, undefined);
    await reset({ requestId, state: 'running' }, { runId: 'same-request-successor', logicalRequestId: requestId, state: 'running' });
    await record('old-run-response');
    assert.equal((await pointer()).runId, 'same-request-successor');
    assert.equal((await pointer()).response, undefined);

    for (const [marker, savedPointer] of [
      [{ requestId, state: 'stopping', stopRequested: true }, undefined],
      [{ requestId, state: 'settled' }, undefined],
      [{ requestId, state: 'running' }, { runId, logicalRequestId: requestId, state: 'stopped' }],
    ]) {
      await reset(marker, savedPointer);
      await record('must-not-restore-stopped');
      assert.equal((await pointer()).response, undefined);
    }

    // Replacement may retain response identity only for the exact same run
    // and logical request, including when a run id is reused by a new owner.
    await reset(); await record('exact-retained');
    await runtime.service.patchNativeRun(threadId, { runId, logicalRequestId: requestId, state: 'running' }, true);
    assert.equal((await pointer()).response.messageId, 'exact-retained');
    await runtime.service.patchNativeRun(threadId, { runId, logicalRequestId: 'different-request', state: 'running' }, true);
    assert.equal((await pointer()).response, undefined);
    await reset(); await record('exact-old-run');
    await runtime.service.patchNativeRun(threadId, { runId: 'different-run', logicalRequestId: requestId, state: 'running' }, true);
    assert.equal((await pointer()).response, undefined);

    // A failed proof write cannot manufacture a successful Stop receipt.
    await reset();
    memoryStore.updateThread = async args => {
      if (args.id === threadId && args.metadata?.assistantNativeRun?.response) throw new Error('Controlled queued proof persistence failure.');
      return update(args);
    };
    await assert.rejects(record('failed-proof'), /Controlled queued proof persistence failure/);
    memoryStore.updateThread = update;
    assert.equal((await pointer()).response, undefined);
    const threads = new AgentThreadsService(runtime.service, runtime.redis);
    await assert.rejects(threads.stopTurn(IDENTITY, threadId), error => error.getStatus?.() === 503);
    assert.equal(runtime.attempts.length, 0);
    assert.equal(runtime.admissions.length, 0);
    return { kind: 'proof', sameRunInitRetained: true,
      initWaitedForHeldProof: true, newOwnerCleared: true, newRunCleared: true,
      lateWrongRequestRefused: true, wrongRunRefused: true, sameRequestOldRunRefused: true,
      stoppedRefused: true, settledRefused: true, failedProofRefused: true, unprovenStopRefused503: true,
      actualPostgres: true, providerCalls: 0 };
  } finally {
    releaseWrite?.();
    await runtime.close({ drop: true });
  }
}

(async () => {
  const result = [];
  for (const kind of ['approval', 'question', 'stop']) result.push(await scenario(kind));
  result.push(await proofScenario());
  console.log(JSON.stringify(result));
})().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
