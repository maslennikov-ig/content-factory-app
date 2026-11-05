'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { InMemoryStore } = require('@mastra/core/storage');
const { fixture, identity, org, user, resourceId, human, Response, until } = require('./agent-native-stale-suspension.probe.cjs');
const text = () => [{ type: 'text-start', id: 'reply' }, { type: 'text-delta', id: 'reply', delta: 'Controlled author draft is complete.' }, { type: 'text-end', id: 'reply' }];
const script = async (_args, number) => number === 1 ? [{ type: 'tool-call', toolCallId: 'approved-subagent', toolName: 'subagent',
  input: JSON.stringify({ agentType: 'writing', forked: false, task: 'Draft three distinct five-second concepts.', modelId:'openai/gpt-6.1-sol',prompt:null,_background:null }) }] : text();
const approval = (threadId, call) => ({ threadId, messages: [{ id: 'approved-human-card', role: 'assistant', parts: [{
  type: 'tool-subagent', toolCallId: call.toolCallId, state: 'approval-responded',
  approval: { id: `${call.runId}::${call.toolCallId}`, approved: true },
}] }] });
const registerGateway = runtime => runtime.mastra.addGateway({
  id: 'native-approval-test', name: 'Controlled native snapshot model',
  handlesModel: id => id === 'mock-provider/native-stale-free',
  fetchProviders: async () => ({}), buildUrl: () => undefined,
  getApiKey: async () => 'controlled-test-key', resolveLanguageModel: () => runtime.model,
});

async function snapshotChild(threadId) {
  const runtime = await fixture({ script });
  registerGateway(runtime);
  let approval;
  const subscribe = runtime.agent.subscribeToThread.bind(runtime.agent);
  runtime.agent.subscribeToThread = async (...args) => {
    const subscription = await subscribe(...args);
    const stream = { async *[Symbol.asyncIterator]() {
      for await (const chunk of subscription.stream) {
        if (chunk.type === 'tool-call-approval') approval = structuredClone(chunk);
        yield chunk;
      }
    } };
    return new Proxy(subscription, { get: (target, key) => key === 'stream' ? stream : Reflect.get(target, key) });
  };
  await runtime.memory.createThread({ threadId, resourceId, title: 'Cold native approval' });
  void runtime.handler.chat(org, user, { threadId, messages: [human('original-human', 'Ask before delegating.')] }, new Response());
  await until(async () => approval && (await runtime.handler.getThread(org, user, threadId)).pending.length > 0, 'saved native snapshot');
  const workflows = await runtime.storage.getStore('workflows');
  const saved = {
    thread: await runtime.memory.getThreadById({ threadId }),
    messages: (await runtime.memory.recall({ threadId, resourceId })).messages,
    runs: (await workflows.listWorkflowRuns({ perPage: 100, page: 0 })).runs,
    approval, modelCalls: runtime.modelCalls.length,
  };
  assert.equal(saved.modelCalls, 1);
  assert.ok(saved.runs.some(run => run.snapshot?.status === 'suspended'));
  process.send(saved);
}

async function coldSnapshot(threadId) {
  const child = fork(__filename, ['snapshot-child', threadId], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Native snapshot child timeout: ${output}`)); }, 15_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('message', saved => {
        clearTimeout(timer);
        child.once('exit', () => resolve(saved));
        child.kill('SIGKILL');
      });
      child.once('exit', code => { if (code !== null) { clearTimeout(timer); reject(new Error(`Snapshot child exited ${code}: ${output}`)); } });
    });
  } finally { child.kill('SIGKILL'); }
}

async function scenario(timing) {
  let current;
  let originalTask;
  let releaseDelivery;
  let releaseDecision;
  let decisionEntered = false;
  let held = false;
  let oldConsumerEnded = false;
  let originalModelCalls = 0;
  const decisions = [];
  try {
    const threadId = `native-denial-${timing}`;
    if (timing === 'warm-owner') {
      current = await fixture({ script });
      registerGateway(current);
      await current.memory.createThread({ threadId, resourceId, title: 'Warm native approval' });
      originalTask = current.handler.chat(org, user, { threadId, messages: [human('original-human', 'Ask before delegating.')] }, new Response());
      await until(async () => (await current.handler.getThread(org, user, threadId)).pending.length > 0, 'warm approval');
    } else {
      // Kill the test-only original process, then restore its actual native
      // Memory/workflow snapshots. No old SDK run registry or owner survives.
      const saved = await coldSnapshot(threadId);
      originalModelCalls = saved.modelCalls;
      const storage = new InMemoryStore();
      await storage.init();
      const memory = await storage.getStore('memory');
      await memory.saveThread({ thread: { ...saved.thread, createdAt: new Date(saved.thread.createdAt), updatedAt: new Date(saved.thread.updatedAt) } });
      await memory.saveMessages({ messages: saved.messages.map(message => ({ ...message, createdAt: new Date(message.createdAt) })) });
      const workflows = await storage.getStore('workflows');
      for (const run of saved.runs) await workflows.persistWorkflowSnapshot({ ...run,
        snapshot: typeof run.snapshot === 'string' ? JSON.parse(run.snapshot) : run.snapshot,
        createdAt: new Date(run.createdAt), updatedAt: new Date(run.updatedAt),
      });
      current = await fixture({ storage, script: async () => text() });
      registerGateway(current);
      const subscribe = current.agent.subscribeToThread.bind(current.agent);
      current.agent.subscribeToThread = async (...args) => {
        const subscription = await subscribe(...args);
        const stream = { async *[Symbol.asyncIterator]() {
          try {
            if (!held) {
              held = true;
              await new Promise(resolve => { releaseDelivery = resolve; });
              yield saved.approval;
            }
            for await (const chunk of subscription.stream) yield chunk;
          } finally { if (held) oldConsumerEnded = true; }
        } };
        return new Proxy(subscription, { get: (target, key) => key === 'stream' ? stream : Reflect.get(target, key) });
      };
    }
    const call = (await current.handler.getThread(org, user, threadId)).pending[0];
    const session = await current.service.sessionFor(identity, threadId, { bindThread: true });
    if(timing==='cold-armed'){await until(()=>Boolean(releaseDelivery),'cold subscription waiting');releaseDelivery();await until(()=>session.approval.isArmed({threadId}),'restored native local approval');}
    assert.equal(session.approval.isArmed({ threadId }), timing === 'warm-owner'||timing==='cold-armed');
    const dispatch = current.agent.sendToolApproval.bind(current.agent);
    current.agent.sendToolApproval = async input => { decisions.push(input.approved); return dispatch(input); };
    if (timing === 'during-answer') {
      const respond = session.respondToPersistedToolApproval.bind(session);
      session.respondToPersistedToolApproval = async input => {
        decisionEntered = true;
        await new Promise(resolve => { releaseDecision = resolve; });
        return respond(input);
      };
    }
    const approvalResponse = new Response();
    const answer = current.handler.chat(org, user, approval(threadId, call), approvalResponse);
    if (timing === 'during-answer') {
      await until(() => decisionEntered, 'restored decision boundary');
      releaseDelivery();
      await until(() => oldConsumerEnded || session.approval.isArmed({ threadId }), 'late native event handled');
      releaseDecision();
    }
    await answer;
    if (timing === 'warm-owner') await originalTask;
    assert.ok(approvalResponse.parts().some(part => part.type === 'text-delta' && part.delta === 'Controlled author draft is complete.'), 'The No continuation actually runs under its admitted owner.');
    assert.equal(approvalResponse.parts().some(part => part.type === 'error'), false);
    const settled = await current.handler.getThread(org, user, threadId);
    assert.equal(settled.execution.outcome, 'completed');
    assert.deepEqual(settled.pending, []);
    const writer=settled.messages.flatMap(m=>m.parts??[]).find(p=>p.toolCallId===call.toolCallId);
    assert.equal(writer?.state,'output-available');assert.equal(writer?.output?.ok,true);
    const threads = await current.memory.listThreads({ filter: { resourceId }, perPage: 100, page: 0 });
    assert.equal(threads.threads.length, 1, 'The bounded specialist does not create a separate conversation.');
    const modelCalls=originalModelCalls+current.modelCalls.length;
    assert.equal(modelCalls,3,'Original root, actual child and parent continuation each run once.');
    assert.deepEqual(decisions,[true]);
    return {timing,ownerOutcome:settled.execution.outcome,writerResult:true,controlledModelCalls:modelCalls,decisions:decisions.slice()};
  } finally {
    releaseDecision?.(); releaseDelivery?.();
    await current?.close();
    await originalTask;
  }
}

const watchdog = process.argv[2] === 'snapshot-child' ? undefined : setTimeout(() => {
  console.error('Cold native subagent approval did not complete within 30 seconds.');
  process.exit(1);
}, 30_000);

(async () => {
  delete process.env.REDIS_URL;
  process.env.NODE_ENV = 'test';
  process.env.MASTRA_DATABASE_URL = 'memory:native-approval-mirror';
  let externalRequests = 0;
  global.fetch = async () => { externalRequests++; throw new Error('External HTTP blocked in approval mirror probe.'); };
  if (process.argv[2] === 'snapshot-child') { await snapshotChild(process.argv[3]); return; }
  const scenarios = [];
  for (const timing of ['cold-persisted','cold-armed','warm-owner']) scenarios.push(await scenario(timing));
  assert.equal(externalRequests, 0);

  if (watchdog) clearTimeout(watchdog);
  console.log(JSON.stringify({ scenarios, externalRequests }));
})().catch(error => { if (watchdog) clearTimeout(watchdog); console.error(error.stack); process.exitCode = 1; });
