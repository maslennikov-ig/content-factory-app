'use strict';

const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { Response, AgentThreadsService, until, mocks } = require('./agent-native-session-http.probe.cjs');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { TextUsageLedger, runWithUsageLedger } = require('./ai-text-chain.cjs');
const ORG = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
const USER = { id: IDENTITY.userId, language: 'ru' };
const human = (id, text) => ({ id, role: 'user', parts: [{ type: 'text', text }] });
const delayApprovalDelivery = process.argv.includes('--delay-approval-delivery');
const withinDeadline = async (work, name) => {
  let timer;
  try { return await Promise.race([work, new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out.`)), 10_000);
  })]); } finally { clearTimeout(timer); }
};

async function scenario(kind) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-native-session-owner-'));
  const auditPath = path.join(directory, 'audit.jsonl');
  const controlPath = path.join(directory, 'control.json');
  fs.writeFileSync(controlPath, JSON.stringify({ mode: 'success', active: true }));
  const admissionScope = new AsyncLocalStorage();
  const ledgerRows = [];
  const attempts = [];
  let runtime;
  runtime = await createRuntime({ auditPath, controlPath, fixtureMode: 'approval', fixtureSelectedContext: true, onAttempt: (_attempt, args) => {
    const admission = admissionScope.getStore();
    attempts.push({ execution: runtime.executionModule.currentConductorExecution(), admission, closedAtCall: admission?.closed,
      prompt: JSON.stringify(args.prompt) });
  } });
  let releaseApproval;
  let reportApprovalHeld;
  const approvalHeld = new Promise(resolve => { reportApprovalHeld = resolve; });
  if (delayApprovalDelivery && kind === 'queue') {
    const subscribe = runtime.agent.subscribeToThread.bind(runtime.agent);
    let held = false;
    runtime.agent.subscribeToThread = async (...args) => {
      const subscription = await subscribe(...args);
      const stream = { async *[Symbol.asyncIterator]() {
        for await (const chunk of subscription.stream) {
          if (!held && chunk.type === 'tool-call-approval') {
            held = true;
            const delivered = new Promise(resolve => { releaseApproval = resolve; });
            reportApprovalHeld();
            await delivered;
          }
          yield chunk;
        }
      } };
      return new Proxy(subscription, {
        get(target, key) { return key === 'stream' ? stream : Reflect.get(target, key); },
      });
    };
  }
  const originalBegin = runtime.aiUsage.beginAiOperation.bind(runtime.aiUsage);
  runtime.aiUsage.beginAiOperation = async (...args) => {
    const admitted = await originalBegin(...args);
    const row = { ledger: new TextUsageLedger(), closed: false };
    ledgerRows.push(row);
    return { ...admitted,
      run: work => admissionScope.run(row, () => runWithUsageLedger(row.ledger, () => admitted.run(work))),
      finish: async (...values) => { try { await admitted.finish(...values); } finally { row.closed = true; } },
    };
  };
  // The actual handler and service share their execution accessor, as in Nest.
  const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
    ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': runtime.executionModule,
  });
  const threadId = `${runtime.schemaName}-${kind}`;
  const threads = new AgentThreadsService(runtime.service, runtime.redis);
  if (delayApprovalDelivery && kind === 'queue') {
    const activeTurn = threads.activeTurnFor.bind(threads);
    threads.activeTurnFor = async (...args) => {
      const owner = await activeTurn(...args);
      // Stored approval is visible before Session consumes its native event.
      // Release only after the answer has reached its actual owner lookup.
      releaseApproval?.();
      releaseApproval = undefined;
      return owner;
    };
  }
  const handler = new AgentController(runtime.service, threads, runtime.aiUsage);
  let pendingRunId;
  let completed = false;
  try {
    await runtime.memory.createThread({ threadId, resourceId: `${IDENTITY.organizationId}:${IDENTITY.userId}`, title: 'Prior completed native HTTP session' });
    await withinDeadline(handler.chat(ORG, USER, { threadId, messages: [human('parent-human', 'Finish the first HTTP task.')] }, new Response()), 'prior HTTP task');
    assert.equal(ledgerRows.length, 1);
    assert.equal(ledgerRows[0].closed, true, 'The prior HTTP ledger is finished before the next owner starts.');
    assert.deepEqual(runtime.admissions[0].finishes, [true]);
    assert.equal((await handler.getThread(ORG, USER, threadId)).execution.outcome, 'completed');
    assert.ok(attempts[0].execution && attempts[0].admission === ledgerRows[0]);
    fs.writeFileSync(controlPath, JSON.stringify({ mode: 'approval', active: true }));
    let ownerTask;
    if (kind === 'queue') {
      const selected = { version: 'assistant-work-context/v1', kind: 'piece', id: 'original-queued-piece' };
      const accepted = await handler.signalThread(ORG, USER, threadId, { kind: 'queue', workContext: selected,
        message: human('child-human', 'Ask before the next change.') });
      assert.equal(accepted.accepted, true);
      await assert.rejects(() => handler.signalThread(ORG, USER, threadId, { kind: 'queue',
        workContext: { ...selected, id: 'different-retried-piece' }, message: human('child-human', 'Ask before the next change.') }),
      /already belongs to different input/, 'The same human ID cannot silently change its accepted target.');
      await runtime.memory.updateThread({ id: threadId, metadata: { assistantWorkspace: {
        version: 'assistant-workspace/v1', workContext: { ...selected, id: 'later-selected-piece' }, artifacts: [], activeArtifact: null,
      } } });
    } else {
      const response = new Response();
      ownerTask = handler.chat(ORG, USER, { threadId, messages: [human('child-human', 'Ask before the next change.')] }, response);
      await until(() => response.writableEnded, 'new HTTP approval card');
    }
    let history;
    await until(async () => { history = await handler.getThread(ORG, USER, threadId); return history.pending.length > 0; }, 'current native approval');
    const pending = history.pending[0];
    pendingRunId = pending.runId;
    if (delayApprovalDelivery && kind === 'queue') {
      await withinDeadline(approvalHeld, 'held native approval delivery');
    }
    const answer = { threadId, messages: [{ id: 'current-approval', role: 'assistant', parts: [{
      type: 'tool-fixture_persist', toolCallId: pending.toolCallId, state: 'approval-responded', input: {},
      approval: { id: `${pending.runId}::${pending.toolCallId}`, approved: true },
    }] }] };
    await withinDeadline(handler.chat(ORG, USER, answer, new Response()), 'current approval answer');
    if (ownerTask) await withinDeadline(ownerTask, 'current HTTP owner');
    await until(async () => (await handler.getThread(ORG, USER, threadId)).execution.state === 'settled', 'current logical owner settlement');
    assert.equal(attempts.length, 3);
    assert.ok(attempts[1].execution && attempts[1].execution !== attempts[0].execution, 'A new human task has its own execution.');
    assert.equal(attempts[2].execution, attempts[1].execution, `${kind}: resumed provider keeps its current execution, not the completed parent.`);
    assert.equal(attempts[1].admission, ledgerRows[1]);
    assert.equal(attempts[2].admission, ledgerRows[1], `${kind}: resumed provider keeps its current admitted ledger.`);
    assert.equal(attempts[2].closedAtCall, false, 'A completed ledger cannot own resumed work.');
    if (kind === 'queue') {
      assert.match(attempts[1].prompt, /original-queued-piece/, 'The queued instruction retains its captured object.');
      assert.doesNotMatch(attempts[1].prompt, /later-selected-piece/, 'A later workspace selection cannot redirect the queued task.');
    }
    assert.equal(ledgerRows.length, 2, 'Approval continuation creates no extra billing admission.');
    assert.equal(runtime.admissions.length, 2);
    assert.deepEqual(runtime.admissions.map(row => row.finishes), [[true], [true]]);
    const events = fs.readFileSync(auditPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events.filter(event => event.type === 'tool').length, 1);
    assert.equal((await handler.getThread(ORG, USER, threadId)).pending.length, 0);
    completed = true;
    return { kind, priorFinished: true, admissions: 2, currentScopeRetained: true, domainCalls: 1 };
  } finally {
    releaseApproval?.();
    if (!completed && pendingRunId) {
      runtime.agent.abortRunStream(pendingRunId);
      await (await runtime.agent.getWorkflow().createRun({ runId: pendingRunId })).cancel().catch(() => undefined);
    }
    await runtime.close({ drop: true });
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

(async () => {
  const report = [];
  for (const kind of delayApprovalDelivery ? ['queue'] : ['http', 'queue']) report.push(await scenario(kind));
  console.log(JSON.stringify(report));
})().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
