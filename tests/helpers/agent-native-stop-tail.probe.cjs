'use strict';
const { createRequire } = require('node:module');
const take = createRequire(require('node:path').resolve(__dirname, '../..') + '/package.json');
take('reflect-metadata');
take('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const { createRuntime, IDENTITY } = take('./tests/helpers/mastra-service-native-integration.probe.cjs');
const { Response, AgentThreadsService, until, mocks } = take('./tests/helpers/agent-native-session-http.probe.cjs');
const { loadTypeScriptModule } = take('./tests/helpers/load-ts-module.cjs');
const { MockLanguageModelV3 } = take('ai/test');
const ORG = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
const USER = { id: IDENTITY.userId, language: 'ru' };
const resourceId = IDENTITY.organizationId + ':' + IDENTITY.userId;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function tailScenario(mode) {
 const failTail = mode.includes('failed');
 const earlyResponse = mode === 'early-response-failed';
 const earlyRun = mode === 'accepted-run-pointer-failed';
 const trace = [];
 let tailHeld = false, releaseTail, stopResolved = false, stopRejected = false, nativeEnded = false, chatTask, stopTask, nativeOff;
 let releaseResponse, responseEntered = false, runEntered = false, stopDispatched = false, abortedNative;
 const responseGate = new Promise(resolve => { releaseResponse = resolve; });
 const tailGate = new Promise(resolve => { releaseTail = resolve; });
 const runtime = await createRuntime({ modelFactory: modelId => new MockLanguageModelV3({ modelId, async doStream(args) {
  trace.push('provider-start');
  return { stream: new ReadableStream({ start(controller) {
   controller.enqueue({ type: 'stream-start', warnings: [] });
   controller.enqueue({ type: 'text-start', id: 'tail-text' });
   controller.enqueue({ type: 'text-delta', id: 'tail-text', delta: 'Visible second native response. '.repeat(30) });
   args.abortSignal?.addEventListener('abort', () => {
    trace.push('provider-aborted');
    controller.error(Object.assign(new Error('Native fixture provider stopped.'), { name: 'AbortError' }));
   }, { once: true });
  } }) };
 } }) });
 const threadId = runtime.schemaName + '-tail-stop';
 const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
  ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': runtime.executionModule,
 });
 const threads = new AgentThreadsService(runtime.service, runtime.redis);
 const handler = new AgentController(runtime.service, threads, runtime.aiUsage);
 if (earlyRun) {
  const remember = threads.rememberNativeRun.bind(threads);
  threads.rememberNativeRun = async (...args) => { runEntered = true; trace.push('accepted-native-run-pointer-held'); return remember(...args); };
  const abortNative = runtime.agent.abortThreadStream.bind(runtime.agent);
  runtime.agent.abortThreadStream = (...args) => { abortedNative = abortNative(...args); return abortedNative; };
 }
 if (earlyResponse) {
  const remember = threads.rememberNativeResponse.bind(threads);
  threads.rememberNativeResponse = async (...args) => { responseEntered = true; trace.push('response-pointer-held'); await responseGate; return remember(...args); };
 }
 try {
  await runtime.memory.createThread({ threadId, resourceId, title: 'Native tail Stop race' });
  const old = (id, role, text) => ({ id, role, threadId, resourceId, createdAt: new Date('2026-01-01T00:00:00Z'),
   type: 'text', content: { format: 2, parts: [{ type: 'text', text }] } });
  await runtime.memory.saveMessages({ messages: [old('old-human', 'user', 'Old saved task.'), old('old-answer', 'assistant', 'Old saved reply.')] });
  const memoryStore = await runtime.storage.getStore('memory');
  if (earlyRun) {
   const update = memoryStore.updateThread.bind(memoryStore);
   memoryStore.updateThread = async args => {
    if (args.id === threadId && args.metadata?.assistantNativeRun) {
     trace.push('native-run-pointer-store-held'); await responseGate;
     throw new Error('Controlled native run pointer storage failure.');
    }
    return update(args);
   };
  }
  const originalSave = memoryStore.saveMessages.bind(memoryStore);
  memoryStore.saveMessages = async args => {
   if (args.messages.some(message => message.threadId === threadId && !['old-human', 'old-answer'].includes(message.id))) {
    tailHeld = true; trace.push('native-tail-commit-held');
    await tailGate;
    trace.push('native-tail-commit-released');
    if (failTail) throw new Error('Controlled native tail storage failure.');
   }
   return originalSave(args);
  };
  const response = new Response();
  chatTask = handler.chat(ORG, USER, { threadId, messages: [{ id: 'new-human', role: 'user', parts: [{ type: 'text', text: 'Stream a native second response.' }] }] }, response)
   .catch(error => { trace.push('chat-rejected:' + error.getStatus?.()); return { error: error.message }; });
  await until(() => earlyRun ? runEntered : earlyResponse ? responseEntered : response.parts().some(part => part.type === 'text-delta'), 'native response boundary');
  const session = await runtime.controller.getSessionByResource(resourceId, threadId);
  nativeOff = session.onBeforeAgentEnd(event => {
   trace.push('native-before-agent-end:' + event.reason + ':' + session.run.getRunId());
   nativeEnded = true;
  });
  const before = await handler.getThread(ORG, USER, threadId);
  const active = await threads.activeTurnFor(IDENTITY, threadId);
  const stop = active.stop;
  active.stop = async () => { stopDispatched = true; return stop(); };
  const beforePointer = await threads.readNativeRun(IDENTITY, threadId);
  stopTask = handler.stopThread(ORG, USER, threadId).then(receipt => { trace.push('stop-response'); stopResolved = true; return receipt; }, error => { stopRejected = true; trace.push('stop-rejected'); return { error: error.message, status: error.getStatus?.() }; });
  if (earlyResponse || earlyRun) { await until(() => stopDispatched, 'Stop captured the incomplete native pointer'); releaseResponse(); }
  await until(() => tailHeld, 'actual native Memory tail flush');
  await wait(mode === 'delayed-tail' ? 5500 : 50);
  const held = await handler.getThread(ORG, USER, threadId);
  const heldState = { stoppedBeforeTailPersisted: stopResolved, nativeEndBeforeTailPersisted: nativeEnded,
   execution: held.execution, messageIds: held.messages.map(message => message.id), pending: held.pending.length };
  releaseTail();
  const [, receipt] = await Promise.all([chatTask, stopTask]);
  let final;
  await until(() => nativeEnded, 'public Session terminal callback');
  final = await handler.getThread(ORG, USER, threadId);
  const report = { schema: 'native-stop-tail/2', mode, stopRejected, pointerInitiallyHadResponse: Boolean(beforePointer?.response), pointerInitiallyExisted: Boolean(beforePointer), abortedNative, receipt, before: { execution: before.execution, messageIds: before.messages.map(message => message.id) },
   held: heldState, final: { execution: final.execution, messageIds: final.messages.map(message => message.id), pending: final.pending.length }, trace,
   nativePublicHook: 'Session.onBeforeAgentEnd (diagnostic only)', applicationReader: 'original native HTTP owner view only', originalNativeSession: true, actualPostgresMemory: true, paidCalls: 0 };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(stopRejected, failTail, 'a swallowed tail failure cannot produce a positive Stop receipt');
  assert.equal(final.messages.length, failTail ? 2 : 4);
  assert.equal(runtime.admissions.length, 1);
  if (earlyResponse) assert.equal(report.pointerInitiallyHadResponse, false);
  if (earlyRun) { assert.equal(report.pointerInitiallyExisted, false); assert.equal(abortedNative, true, 'the native producer was already accepted despite the failed pointer write'); }
  assert.equal(heldState.stoppedBeforeTailPersisted, false, 'positive Stop must wait for original native tail persistence');
 } finally {
  releaseTail(); releaseResponse(); nativeOff?.();
  await Promise.allSettled([chatTask, stopTask].filter(Boolean));
  await runtime.close({ drop: true });
 }
}
async function boundaryScenario(kind) {
 const parked = kind === 'approval' || kind === 'question';
 const runtime = await createRuntime(parked ? { mode: kind, fixtureMode: kind } : { mode: 'success' });
 const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
  ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': runtime.executionModule,
 });
 const threads = new AgentThreadsService(runtime.service, runtime.redis);
 const handler = new AgentController(runtime.service, threads, runtime.aiUsage);
 const threadId = runtime.schemaName + '-' + kind;
 let chatTask, stopTask, releaseStart, entered = false, stopDispatched = false;
 const startGate = new Promise(resolve => { releaseStart = resolve; });
 if (!parked) {
  const start = threads.startTurn.bind(threads);
  threads.startTurn = async (...args) => { const turn = await start(...args); entered = true; await startGate; return turn; };
 }
 try {
  await runtime.memory.createThread({ threadId, resourceId, title: 'Native Stop boundary ' + kind });
  const response = new Response();
  chatTask = handler.chat(ORG, USER, { threadId, messages: [{ id: 'boundary-human', role: 'user', parts: [{ type: 'text', text: 'Ask before the controlled change.' }] }] }, response);
  if (parked) await until(() => response.writableEnded, 'native parked ' + kind);
  else await until(() => entered, 'nonstreaming pre-start owner');
  const before = await handler.getThread(ORG, USER, threadId);
  const callsBefore = runtime.attempts.length;
  if (!parked) {
   const active = await threads.activeTurnFor(IDENTITY, threadId);
   const stop = active.stop;
   active.stop = async () => { stopDispatched = true; return stop(); };
  }
  stopTask = handler.stopThread(ORG, USER, threadId);
  if (!parked) await until(() => stopDispatched, 'explicit Stop before nonstreaming producer start');
  releaseStart();
  let timer;
  let receipt;
  try { receipt = await Promise.race([stopTask, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(kind + ' Stop must not hang')), 8000); })]); }
  finally { clearTimeout(timer); }
  await chatTask;
  const final = await handler.getThread(ORG, USER, threadId);
  assert.equal(receipt.stopped, true);
  assert.equal(receipt.requestId, before.execution.requestId);
  assert.equal(final.execution.state, 'settled');
  assert.equal(final.pending.length, 0);
  assert.equal(runtime.attempts.length, callsBefore, 'Stop must not execute another model');
  if (!parked) assert.equal(callsBefore, 0, 'nonstreaming Stop cannot start a provider');
  console.log(JSON.stringify({ schema: 'native-stop-boundary/1', kind, nativePendingBefore: before.pending.length,
   pendingAfter: final.pending.length, receipt, execution: final.execution, callsBefore, callsAfter: runtime.attempts.length, paidCalls: 0 }, null, 2));
 } finally {
  releaseStart();
  await Promise.allSettled([chatTask, stopTask].filter(Boolean));
  await runtime.close({ drop: true });
 }
}
async function internalAbortScenario() {
 const runtime = await createRuntime({ mode: 'success' });
 let readerCancelled = 0;
 const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
  ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': runtime.executionModule,
  '@mastra/ai-sdk': { ...take('@mastra/ai-sdk'), handleChatStream: async () => new ReadableStream({
   start(controller) { controller.enqueue({ type: 'text-delta', id: 'internal-text', delta: 'Controlled transport awaiting data.' }); },
   cancel() { readerCancelled++; },
  }) },
 });
 const threads = new AgentThreadsService(runtime.service, runtime.redis);
 // The legacy transport boundary must retain immediate reader cancellation;
 // it has no later explicit native Session.abort call to release a drain.
 threads.isDurableConductor = async () => false;
 const handler = new AgentController(runtime.service, threads, runtime.aiUsage);
 const threadId = runtime.schemaName + '-internal-close';
 let chatTask;
 try {
  await runtime.memory.createThread({ threadId, resourceId, title: 'Internal HTTP cancellation' });
  const response = new Response();
  chatTask = handler.chat(ORG, USER, { threadId, messages: [{ id: 'internal-human', role: 'user', parts: [{ type: 'text', text: 'Controlled hanging provider.' }] }] }, response);
  await until(() => response.parts().some(part => part.type === 'text-delta'), 'legacy running HTTP reader');
  const started = Date.now();
  response.emit('close');
  let timer;
  try { await Promise.race([chatTask, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Internal cancellation must not wait for explicit native Stop')), 3000); })]); }
  finally { clearTimeout(timer); }
  const final = await handler.getThread(ORG, USER, threadId);
  assert.equal(final.execution.state, 'settled');
  assert.equal(readerCancelled, 1, 'internal cancellation must cancel its reader without Session.abort');
  assert.equal(runtime.attempts.length, 0);
  assert.deepEqual(runtime.admissions[0].finishes, [false]);
  console.log(JSON.stringify({ schema: 'native-stop-boundary/1', kind: 'internal-close', explicitStopCalls: 0,
   transport: 'controlled legacy HTTP reader', readerCancelled, settledWithinMs: Date.now() - started, execution: final.execution,
   modelCalls: runtime.attempts.length, admissionFinishes: runtime.admissions[0].finishes, paidCalls: 0 }, null, 2));
 } finally {
  await Promise.allSettled([chatTask].filter(Boolean));
  await runtime.close({ drop: true });
 }
}
(async () => {
 if (process.env.CF_NATIVE_BOUNDARY_KIND === 'internal-close') { await internalAbortScenario(); return; }
 if (process.env.CF_NATIVE_BOUNDARY_KIND) { await boundaryScenario(process.env.CF_NATIVE_BOUNDARY_KIND); return; }
 const modes = process.env.CF_NATIVE_TAIL_MODE ? [process.env.CF_NATIVE_TAIL_MODE] : ['delayed-tail', 'failed-tail', 'early-response-failed', 'accepted-run-pointer-failed'];
 for (const mode of modes) await tailScenario(mode);
 if (!process.env.CF_NATIVE_TAIL_MODE) for (const kind of ['pre-start', 'approval', 'question']) await boundaryScenario(kind);
 if (!process.env.CF_NATIVE_TAIL_MODE) await internalAbortScenario();
})().catch(error => { console.error(error); process.exitCode = 1; });
