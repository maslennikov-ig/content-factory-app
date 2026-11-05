'use strict';

// Actual installed Session, durable Agent, product stream and HTTP controller.
// Delay only the public Session subscription; durable replay remains live.
const assert = require('node:assert/strict');
const { fixture, identity, org, user, resourceId, human, Response, until } = require('./agent-native-stale-suspension.probe.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = [
  { type: 'text-start', id: 'result' },
  { type: 'text-delta', id: 'result', delta: 'Controlled native result.' },
  { type: 'text-end', id: 'result' },
];

async function scenario(policy, delayed, approve = false) {
  const f = await fixture({ script: async (_args, number) => number === 1 ? [{
    type: 'tool-call', toolCallId: 'wait-subagent', toolName: 'subagent',
    input: JSON.stringify({ agentType: 'writing', modelId: 'openai/gpt-6.1-sol',
      task: 'Write a complete controlled concept.', forked: false }),
  }] : output });
  // The reused fixture predates the checkpoint port. Supply the successful
  // project billing fixture contract; no real ledger/provider is accessed.
  const begin = f.service.aiUsage.beginAiOperation.bind(f.service.aiUsage);
  f.service.aiUsage.beginAiOperation = async (...args) => ({
    ...await begin(...args), checkpoint: async () => true,
  });
  let release;
  const delivery = new Promise(resolve => { release = resolve; });
  let held = false;
  let parent;
  const decisions = [];
  const sendApproval = f.agent.sendToolApproval.bind(f.agent);
  f.agent.sendToolApproval = async answer => {
    decisions.push(answer.approved);
    return sendApproval(answer);
  };
  const threadId = `manual-wait-${policy}-${delayed}-${approve}`;
  const response = new Response();
  try {
    await f.memory.createThread({ threadId, resourceId, title: 'Native manual wait' });
    const session = await f.service.sessionFor(identity, threadId, { bindThread: true });
    await session.permissions.setForTool({ toolName: 'subagent', policy });
    if (delayed) {
      const subscribe = f.agent.subscribeToThread.bind(f.agent);
      f.agent.subscribeToThread = async (...args) => {
        const subscription = await subscribe(...args);
        const stream = { async *[Symbol.asyncIterator]() {
          for await (const chunk of subscription.stream) {
            if (!held && chunk.type === 'tool-call-approval') {
              held = true;
              await delivery;
            }
            yield chunk;
          }
        } };
        return new Proxy(subscription, {
          get: (target, key) => key === 'stream' ? stream : Reflect.get(target, key),
        });
      };
    }
    parent = f.handler.chat(org, user, {
      threadId, messages: [human('manual-wait-user', 'Delegate the controlled task.')],
    }, response);
    void parent.catch(() => undefined);
    await until(() => response.parts().some(part => part.type === 'data-tool-call-approval'), 'displayed native approval');
    if (delayed) await until(() => held, 'held Session approval subscription');
    const durable = await f.agent.listSuspendedRuns({ threadId, resourceId });
    const history = await f.handler.getThread(org, user, threadId);
    const call = history.pending.find(call => call.toolCallId === 'wait-subagent');
    assert.ok(call, 'Exact native approval must be persisted');
    const stored = durable.runs.find(run => run.runId === call.runId && run.threadId === threadId && run.resourceId === resourceId);
    assert.ok(stored?.toolCalls.some(tool => tool.toolCallId === call.toolCallId && tool.requiresApproval));
    if (!delayed) await until(() => session.approval.isArmed({ threadId, runId: call.runId, toolCallId: call.toolCallId }), 'on-time Session arm');
    for (let i = 0; i < 30 && !response.writableEnded; i++) await sleep(10);
    const observed = {
      policy, delayed, approve, currentRun: call.runId, validSummary: !!call.summary,
      nativeRequiresApproval: true,
      sessionArmed: session.approval.isArmed({ threadId, runId: call.runId, toolCallId: call.toolCallId }),
      httpEnded: response.writableEnded,
      nativeWait: response.parts().some(part => part.type === 'data-native-input-wait' && part.data?.runId === call.runId),
      partTypes: response.parts().map(part => part.type),
    };
    if (policy === 'ask') {
      // Exercise the newly enabled UI path: answer the real persisted gate
      // while the independent Session subscriber is still deliberately held.
      const answer = f.handler.chat(org, user, { threadId, messages: [{
        id: 'manual-wait-decline', role: 'assistant', parts: [{ type: 'tool-subagent',
          toolCallId: call.toolCallId, state: 'approval-responded',
          approval: { id: `${call.runId}::${call.toolCallId}`, approved: approve },
        }],
      }] }, new Response());
      let answerDone = false, answerError;
      void answer.then(() => { answerDone = true; }, error => { answerDone = true; answerError = error; });
      await until(() => answerDone, 'persisted answer before Session mirror');
      if (answerError) throw answerError;
      observed.answerCompletedBeforeMirror = delayed;
    }
    release();
    await parent;
    const final = await f.handler.getThread(org, user, threadId);
    assert.equal(final.execution.outcome, 'completed');
    assert.equal(final.pending.length, 0);
    assert.equal(response.parts().some(part => part.type === 'error'), false);
    assert.deepEqual(decisions, [policy === 'allow' || approve]);
    return { ...observed, completed: true, controlledModelCalls: f.modelCalls.length, decisions };
  } finally {
    release();
    await f.close();
    await parent?.catch(() => undefined);
  }
}

(async () => {
  process.env.NODE_ENV = 'test';
  delete process.env.REDIS_URL;
  let externalRequests = 0;
  global.fetch = async () => { externalRequests++; throw Error('External HTTP forbidden in manual wait probe.'); };
  const selected = process.argv[2];
  const scenarios = selected === 'delayed' ? [await scenario('ask', true)] : [
    await scenario('ask', false), await scenario('ask', true),
    await scenario('ask', true, true), await scenario('allow', true),
  ];
  console.log(JSON.stringify({ scenarios, externalRequests }));
  assert.equal(externalRequests, 0);
  for (const value of scenarios) {
    if (value.policy === 'ask') {
      assert.equal(value.nativeWait, true, 'Persisted manual approval must release its UI observer even before the Session mirror arms');
      assert.equal(value.httpEnded, true);
    } else {
      assert.equal(value.nativeWait, false, 'Automatic allow must not masquerade as a human wait');
    }
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
