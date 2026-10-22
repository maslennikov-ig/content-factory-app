'use strict';

const assert = require('node:assert/strict');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { until } = require('./agent-native-session-http.probe.cjs');

const usage = { inputTokens: { total: 2, noCache: 2 }, outputTokens: { total: 2, text: 2 } };

async function scenario(kind) {
  let modelCalls = 0, domainCalls = 0;
  const runtime = await createRuntime({
    fixtureRun: async () => {
      domainCalls++;
      if (kind === 'fatal' || (kind === 'revision' && domainCalls === 1)) {
        throw Object.assign(new Error('Controlled native tool refusal.'), {
          code: 'ANALYTICS_UNAVAILABLE', ...(kind === 'revision' ? { canReviseInput: true } : {}),
        });
      }
      return { id: 'fixture-accepted' };
    },
    modelFactory: () => new MockLanguageModelV3({ modelId: 'lifecycle-accounting', doStream: async () => {
      const call = modelCalls++;
      const tool = call === 0 || (kind === 'revision' && call === 1);
      return { stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        ...(tool
          ? [{ type: 'tool-call', toolCallId: `accounting-tool-${call}`, toolName: 'fixture_persist', input: '{}' }]
          : [{ type: 'text-start', id: 'accounting-done' }, { type: 'text-delta', id: 'accounting-done', delta: 'Готово.' }, { type: 'text-end', id: 'accounting-done' }]),
        { type: 'finish', finishReason: { unified: tool ? 'tool-calls' : 'stop', raw: tool ? 'tool_calls' : 'stop' }, usage },
      ]) };
    } }),
  });
  const threadId = `${runtime.schemaName}-${kind}`;
  const updateThread = runtime.memory.updateThread.bind(runtime.memory);
  let settlementFailures = 0;
  try {
    await runtime.memory.createThread({ threadId, resourceId: `${IDENTITY.organizationId}:${IDENTITY.userId}`, title: 'Native accounting boundary' });
    if (kind === 'settlement-failure') runtime.memory.updateThread = async input => {
      if (input.id === threadId && input.metadata?.assistantExecution?.state === 'settled') {
        settlementFailures++;
        throw new Error('Controlled lifecycle settlement write failure.');
      }
      return updateThread(input);
    };
    const accepted = await runtime.service.queueNativeInput({
      identity: IDENTITY, threadId, requestId: `lifecycle-accounting-${kind}`, signal: {
        id: `accounting-human-${kind}`, contents: 'Run the controlled operation.', author: { id: IDENTITY.userId }, createdAt: new Date().toISOString(),
      },
    });
    const workflow = runtime.mastra.getWorkflowById('content-factory-queued-input-v1');
    let savedRun;
    await until(async () => {
      savedRun = await workflow.getWorkflowRunById(accepted.workflowRunId);
      return ['success', 'failed'].includes(savedRun?.status) && runtime.admissions[0]?.finishes.length === 1;
    }, `${kind} queued accounting settlement`);
    const thread = await runtime.memory.getThreadById({ threadId });
    const execution = thread.metadata.assistantExecution;
    const recalled = await runtime.memory.recall({ threadId, resourceId: `${IDENTITY.organizationId}:${IDENTITY.userId}`, perPage: false });
    assert.ok(JSON.stringify(recalled.messages).includes('Готово.'), 'The scripted model actually said done after the tool result.');
    assert.equal(runtime.admissions.length, 1);
    assert.equal(modelCalls, kind === 'revision' ? 3 : 2);
    assert.equal(domainCalls, kind === 'revision' ? 2 : 1);
    const admissionCompleted = runtime.admissions[0].finishes[0];
    if (kind === 'revision') {
      assert.deepEqual(execution, { requestId: `lifecycle-accounting-${kind}`, state: 'settled', outcome: 'completed' });
      assert.equal(admissionCompleted, true, 'A server-proven input revision can still complete.');
      assert.equal(savedRun.status, 'success');
    } else if (kind === 'fatal') {
      assert.deepEqual(execution, { requestId: `lifecycle-accounting-${kind}`, state: 'settled', outcome: 'failed' });
      assert.equal(admissionCompleted, false, 'A fatal tracked result cannot bill the enclosing task as successful.');
      assert.equal(savedRun.status, 'success', 'The native stream itself completed; the tracked domain outcome must still win.');
    } else {
      assert.equal(settlementFailures, 1);
      assert.notEqual(execution.state, 'settled', 'A lost durable terminal acknowledgement cannot fabricate settled success.');
      assert.equal(admissionCompleted, false);
      assert.equal(savedRun.status, 'failed');
    }
    return { kind, modelCalls, domainCalls, admissionCompleted, state: execution.state, outcome: execution.outcome ?? null, nativeStatus: savedRun.status };
  } finally {
    runtime.memory.updateThread = updateThread;
    await runtime.close({ drop: true });
  }
}

(async () => {
  const report = [];
  for (const kind of process.argv[2] ? process.argv[2].split(',') : ['fatal', 'revision', 'settlement-failure']) report.push(await scenario(kind));
  return report;
})().then(report => { console.log(JSON.stringify(report)); process.exit(0); }).catch(error => { console.error(error); process.exit(1); });
