'use strict';
const assert = require('node:assert/strict');
const {fixture, identity, org, user, resourceId, human, Response, until} = require('./agent-native-stale-suspension.probe.cjs');
const taskArgs = {tasks: [{id: 'internal-draft', content: 'Prepare the controlled draft.', status: 'pending', activeForm: 'Preparing the controlled draft'}]};
const approve = (call, name = call.toolName) => ({id: 'answer-' + call.toolCallId, role: 'assistant', parts: [{
  type: `tool-${name}`, toolCallId: call.toolCallId, state: 'approval-responded',
  approval: {id: `${call.runId}::${call.toolCallId}`, approved: true},
}]});

(async () => {
  process.env.NODE_ENV = 'test';
  delete process.env.REDIS_URL;
  let externalRequests = 0, parent, finished = false;
  global.fetch = async () => {externalRequests++; throw new Error('External request forbidden in internal approval probe.');};
  const f = await fixture({script: async (_args, number) => number === 1 ? [{type: 'tool-call',
    toolCallId: 'memory-before-task', toolName: 'updateWorkingMemory', input: JSON.stringify({memory: {answerLength: 'short'}})}]
    : number === 2 ? [{type: 'tool-call', toolCallId: 'parked-native-task', toolName: 'task_write', input: JSON.stringify(taskArgs)}]
    : [{type: 'text-start', id: 'reply'}, {type: 'text-delta', id: 'reply', delta: 'Internal task approved and saved.'}, {type: 'text-end', id: 'reply'}]});
  const threadId = 'internal-approval-after-memory';
  try {
    await f.memory.createThread({threadId, resourceId, title: 'Internal approval after an earlier approval'});
    const session = await f.service.sessionFor(identity, threadId, {bindThread: true});
    await session.permissions.setForTool({toolName: 'updateWorkingMemory', policy: 'ask'});
    await session.permissions.setForTool({toolName: 'task_write', policy: 'ask'});
    const response = new Response();
    parent = f.handler.chat(org, user, {threadId, messages: [human('internal-human', 'Remember my preference, then prepare the task list.')]}, response)
      .finally(() => {finished = true;});
    void parent.catch(() => undefined);
    await until(async () => (await f.handler.getThread(org, user, threadId)).pending.some(call => call.toolCallId === 'memory-before-task'), 'first memory approval');
    const memoryCall = (await f.handler.getThread(org, user, threadId)).pending.find(call => call.toolCallId === 'memory-before-task');
    assert.ok(memoryCall.summary);
    await f.handler.chat(org, user, {threadId, messages: [approve(memoryCall)]}, new Response());
    await until(async () => (await f.handler.getThread(org, user, threadId)).pending.some(call => call.toolCallId === 'parked-native-task'), 'task approval after the first approval');
    const taskCall = (await f.handler.getThread(org, user, threadId)).pending.find(call => call.toolCallId === 'parked-native-task');
    assert.equal(taskCall.runId, memoryCall.runId);
    assert.equal(f.modelCalls.length, 2, 'An ask policy must keep the native task parked.');
    await assert.rejects(f.handler.chat(org, {...user, id: 'foreign-user'}, {threadId, messages: [approve(taskCall)]}, new Response()), error => error.getStatus?.() === 403);
    await assert.rejects(f.handler.contentBoundApprovals(identity, {runId: taskCall.runId,
      approved: [{toolCallId: taskCall.toolCallId, toolName: 'unknown_internal_tool', args: taskArgs}]}), error => error.getStatus?.() === 409);
    assert.equal(await f.service.describeApproval(identity, 'unknown_internal_tool', taskArgs), null);
    assert.equal(f.modelCalls.length, 2);
    if (process.env.CF_NATIVE_INTERNAL_STOP === '1') {
      let timer;
      const stop = f.handler.stopThread(org, user, threadId);
      void stop.catch(() => undefined);
      try {
        await Promise.race([stop, new Promise((_resolve, reject) => {timer = setTimeout(() => reject(new Error('Stop after an earlier approval did not settle.')), 3000);})]);
      } finally {clearTimeout(timer);}
      await parent;
      const after = await f.handler.getThread(org, user, threadId);
      assert.equal(after.execution.state, 'settled');
      assert.equal(after.execution.outcome, 'interrupted');
      assert.equal(after.pending.length, 0);
      assert.equal(f.modelCalls.length, 2, 'Stopping the parked native successor must not call a model.');
      console.log(JSON.stringify({schema: 'native-multiple-approval-stop/1', interrupted: true, calls: f.modelCalls.length, paidCalls: 0}));
      return;
    }
    await f.handler.chat(org, user, {threadId, messages: [approve(taskCall)]}, new Response());
    await parent;
    const final = await f.handler.getThread(org, user, threadId);
    const taskStore = await f.storage.getStore('threadState');
    const savedTasks = await taskStore.getState({threadId, type: 'task'});
    assert.deepEqual(savedTasks, taskArgs.tasks, 'Only the exact approved internal task list is saved.');
    assert.ok(taskCall.summary, 'A parked internal call needs a visible summary.');
    assert.equal(final.execution.outcome, 'completed');
    assert.equal(final.pending.length, 0);
    assert.equal(session.resolveToolApproval('task_write', threadId), 'ask');
    assert.equal(f.modelCalls.length, 3);
    assert.equal(externalRequests, 0);
    console.log(JSON.stringify({schema: 'native-internal-approval/1', acceptedAfterEarlierApproval: true,
      summaryVisible: true, exactTaskSaved: true, askPreserved: true, foreignRejected: true, unknownRejected: true,
      controlledModelCalls: f.modelCalls.length, externalRequests, paidCalls: 0}));
  } finally {
    if (!finished && parent) await f.handler.stopThread(org, user, threadId).catch(() => undefined);
    await f.close();
    await parent?.catch(() => undefined);
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
