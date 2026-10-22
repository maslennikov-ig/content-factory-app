'use strict';
const { createRequire } = require('node:module');
const requireRepo = createRequire(require('node:path').resolve(__dirname, '../..') + '/package.json');
requireRepo('reflect-metadata');
requireRepo('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const { createRuntime, IDENTITY } = requireRepo('./tests/helpers/mastra-service-native-integration.probe.cjs');
const { Response, AgentThreadsService, until, mocks } = requireRepo('./tests/helpers/agent-native-session-http.probe.cjs');
const { loadTypeScriptModule } = requireRepo('./tests/helpers/load-ts-module.cjs');
const { MockLanguageModelV3 } = requireRepo('ai/test');
const ORG = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
const USER = { id: IDENTITY.userId, language: 'ru' };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function scenario(failCommit = false, alreadyFinishing = false) {
  const trace = [];
  let releaseTerminal, terminalEntered = false, stopResolved = false, stopRejected = false, stopReceipt, chatTask, stopTask;
  let runtime;
  const terminalGate = new Promise(resolve => { releaseTerminal = resolve; });
  runtime = await createRuntime({ modelFactory: modelId => new MockLanguageModelV3({ modelId,
    async doStream(args) {
      trace.push('native-provider-start');
      return { stream: new ReadableStream({ start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'text-start', id: 'partial' });
        controller.enqueue({ type: 'text-delta', id: 'partial', delta: 'Visible native stopped partial. '.repeat(30) });
        if (alreadyFinishing) {
          controller.enqueue({ type: 'text-end', id: 'partial' });
          controller.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } });
          controller.close();
          return;
        }
        args.abortSignal?.addEventListener('abort', () => {
          trace.push('native-provider-aborted');
          controller.error(Object.assign(new Error('Native fixture provider stopped.'), { name: 'AbortError' }));
        }, { once: true });
      } }) };
    }
  }) });
  const threadId = runtime.schemaName + '-stop-settlement';
  const update = runtime.memory.updateThread.bind(runtime.memory);
  runtime.memory.updateThread = async row => {
    if (row.id === threadId && row.metadata?.assistantExecution?.state === 'settled') {
      terminalEntered = true; trace.push('terminal-memory-commit-held');
      await terminalGate;
      trace.push('terminal-memory-commit-released');
      if (failCommit) throw new Error('Controlled terminal Memory store failure.');
    }
    return update(row);
  };
  const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
    ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': runtime.executionModule,
  });
  const threads = new AgentThreadsService(runtime.service, runtime.redis);
  const handler = new AgentController(runtime.service, threads, runtime.aiUsage);
  try {
    await runtime.memory.createThread({ threadId, resourceId: IDENTITY.organizationId + ':' + IDENTITY.userId, title: 'Bounded native Stop settlement' });
    const response = new Response();
    chatTask = handler.chat(ORG, USER, { threadId, messages: [{ id: 'settlement-human', role: 'user', parts: [{ type: 'text', text: 'Stream a controlled native partial.' }] }] }, response);
    await until(() => response.parts().some(part => part.type === 'text-delta'), 'native partial');
    const before = await handler.getThread(ORG, USER, threadId);
    if (alreadyFinishing) await until(() => terminalEntered, 'terminal Memory write before Stop enters');
    stopTask = handler.stopThread(ORG, USER, threadId).then(receipt => {
      trace.push('stop-response'); stopResolved = true; stopReceipt = receipt; return receipt;
    }, () => { trace.push('stop-error'); stopRejected = true; });
    await until(() => terminalEntered, 'actual native HTTP terminal Memory write');
    await wait(100);
    const whileHeld = await handler.getThread(ORG, USER, threadId);
    const respondedBeforeCommit = stopResolved;
    trace.push('held-history-' + whileHeld.execution.state);
    releaseTerminal();
    await Promise.all([chatTask, stopTask]);
    const final = await handler.getThread(ORG, USER, threadId);
    const report = { schema: 'native-stop-settlement/1', failCommit, alreadyFinishing, respondedBeforeCommit, stopRejected, stopReceipt, before: before.execution,
      whileHeld: whileHeld.execution, final: final.execution, pending: final.pending.length,
      messages: final.messages.map(message => ({ id: message.id, role: message.role })), admissions: runtime.admissions.length,
      trace, actualNativeSession: true, actualController: true, actualPostgresMemory: true, paidCalls: 0 };
    console.log(JSON.stringify(report, null, 2));
    if (failCommit) {
      assert.equal(stopRejected, true, 'Failed terminal storage cannot acknowledge a settled Stop');
      assert.equal(stopReceipt, undefined);
      assert.notEqual(final.execution.state, 'settled');
    } else {
      assert.equal(stopReceipt.requestId, before.execution.requestId);
      assert.equal(final.execution.state, 'settled');
      assert.equal(final.execution.outcome, alreadyFinishing ? 'completed' : 'interrupted');
    }
    assert.equal(respondedBeforeCommit, false, 'Stop response must wait for this exact native HTTP owner terminal Memory commit');
  } finally {
    releaseTerminal();
    await Promise.allSettled([chatTask, stopTask].filter(Boolean));
    await runtime.close({ drop: true });
  }
}
(async () => {
  if (process.env.CF_NATIVE_STOP_SETTLEMENT_MODE === 'late') await scenario(false, true);
  else { await scenario(); await scenario(true); await scenario(false, true); }
})().catch(error => { console.error(error); process.exitCode = 1; });
