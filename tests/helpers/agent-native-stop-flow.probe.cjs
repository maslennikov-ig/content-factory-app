'use strict';
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = require('node:path').resolve(__dirname, '..', '..');
const requireRepo = createRequire(root + '/package.json');
const React = requireRepo('react');
const { JSDOM } = requireRepo('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/stop-sdk' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: dom.window[key] });
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
const { act, cleanup, fireEvent, render, within } = requireRepo('@testing-library/react');
const { useChat } = requireRepo('@ai-sdk/react');
const { loadWithMocks } = requireRepo('./tests/helpers/load-ts-with-mocks.cjs');
const { createNativeStopIdentityFixture } = requireRepo('./tests/helpers/agent-native-stop-identity.cjs');
const words = loadWithMocks('apps/frontend/src/components/agents/agent.copy.ts').agentCopy.ru;
const h = React.createElement;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const oldHuman = { id: 'old-human', role: 'user', parts: [{ type: 'text', text: 'Earlier task' }] };
const oldAnswer = { id: 'old-answer', role: 'assistant', parts: [{ type: 'text', text: 'Earlier saved answer' }] };
const fullText = 'Already visible first note. Already visible second partial note.';
const requestId = 'actual-stopped-request';
const copy = value => JSON.parse(JSON.stringify(value));

async function scenario(mode) {
 const trace = [];
 let streamController, chat, submit, calls = 0, finish = 0, errors = 0;
 let saved, stopResolve, lagResolve, delayedFinish, heldFinishRead, lagDelivered = false, ackResolved = false, historyReads = 0;
 let lateSettlement = false, beforeLateRead;
 const settlementLag = mode.startsWith('settlement-lag');
 const successor = mode === 'successor' || mode === 'late-stop-reply';
 const oldHistory = { messages: [oldHuman, oldAnswer], pending: [], execution: { requestId, state: 'running' } };
 const request = async (url, init = {}) => {
  if (init.method === 'POST' && String(url).endsWith('/stop')) {
   trace.push('stop-request');
   if (['retired-owner', 'cold-native-owner', 'mismatched-native-pointer'].includes(mode)) {
    const fixture = createNativeStopIdentityFixture({ threadId: 'stop-sdk', requestId,
     ...(mode === 'cold-native-owner' ? { active: false } : { retireAt: 'availability' }),
     ...(mode === 'mismatched-native-pointer' ? { pointer: { runId: 'prior-native-run', logicalRequestId: 'prior-request', state: 'stopped' } } : {}),
    });
    const receipt = await fixture.stop();
    trace.push(`actual-stop-receipt:${JSON.stringify(receipt)}`);
    trace.push('stop-ack'); ackResolved = true;
    return { ok: true, json: async () => receipt };
   }
   if (mode === 'lag' || mode === 'late-stop-reply') return new Promise(resolve => { stopResolve = () => { ackResolved = true; trace.push('stop-ack'); resolve({ ok: true, json: async () => ({ stopped: true, threadId: 'stop-sdk', requestId }) }); }; });
   trace.push('stop-ack'); ackResolved = true;
   return { ok: true, json: async () => ({ stopped: mode !== 'no-ack', threadId: 'stop-sdk', requestId: mode === 'null-receipt' ? null : mode === 'mismatch' ? 'another-request' : requestId }) };
  }
  const snapshot = copy(mode === 'lag' && !lagDelivered ? oldHistory : saved ?? oldHistory);
  if (settlementLag && !lateSettlement) snapshot.execution = { requestId, state: 'running' };
  trace.push(`history-read:${snapshot.messages.length}:${snapshot.execution.state}`);
  historyReads++;
  if (mode === 'successor' && finish === 1 && !heldFinishRead) return new Promise(resolve => {
   trace.push('old-finish-history-held');
   heldFinishRead = () => { trace.push('old-finish-history-delivered-after-new-send'); resolve({ ok: true, json: async () => snapshot }); };
  });
  if (mode === 'lag' && ackResolved && !lagResolve) return new Promise(resolve => { lagResolve = () => { lagDelivered = true; trace.push('old-history-response'); resolve({ ok: true, json: async () => snapshot }); }; });
  return { ok: true, json: async () => snapshot };
 };
 const transport = {
  async sendMessages() {
   calls++; trace.push('sdk-send');
   return new ReadableStream({ start(controller) { streamController = controller;
    controller.enqueue({ type: 'start', messageId: calls === 1 ? 'stopped-native-answer' : 'next-native-answer' });
    controller.enqueue({ type: 'text-start', id: 'text' });
    controller.enqueue({ type: 'text-delta', id: 'text', delta: fullText });
    if (mode === 'unresolved') controller.enqueue({ type: 'tool-input-available', toolCallId: 'unresolved-write', toolName: 'create_piece', input: { title: 'Unconfirmed write' } });
   }, cancel() { trace.push('sdk-reader-cancel'); } });
  },
  async reconnectToStream() { throw new Error('A stopped task must not reconnect automatically.'); },
 };
 const Component = loadWithMocks('apps/frontend/src/components/agents/agent.conversation.tsx', {
  react: React,
  '@ai-sdk/react': { useChat(options) { chat = useChat({ ...options,
   onFinish(args) { finish++; trace.push(`sdk-finish:${args.isAbort}:${args.isError}`);
    if (mode === 'late-finish') { delayedFinish = () => { trace.push('owner-finish-after-confirmed-stop'); options.onFinish(args); }; return; }
    return options.onFinish(args); },
   onError(error) { errors++; trace.push('sdk-error'); return options.onError(error); },
  }); return chat; } },
  swr: { __esModule: true, default: () => ({ data: undefined }), useSWRConfig: () => ({ mutate: async () => undefined }) },
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
  '@contentfactory/frontend/components/onboarding/use-onboarding-progress': { useOnboardingProgress: () => ({ answered: false, progress: null }) },
  '@contentfactory/frontend/components/layout/user.context': { useUser: () => ({ role: 'ADMIN' }) },
  '@contentfactory/frontend/components/ui/allowance-hint': { ALLOWANCE_API: '/billing/allowance', AllowanceHint: () => null },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
  './agent.threads': { THREADS_KEY: '/agent/threads' },
  './agent.transport': { isAgentRequestNotStarted: () => false, createAgentTransport: () => transport, screenTimeZone: () => 'Europe/Moscow' },
  './agent.composer': { AgentComposer: ({ onSubmit, onStop }) => { submit = onSubmit; return h('div', null,
   h('button', { onClick: () => void onSubmit({ text: 'New task to stop', files: [] }) }, 'Submit controlled task'),
   h('button', { onClick: onStop }, 'Stop controlled task')); } },
  './agent.markdown': { AgentMarkdown: ({ text }) => h('p', null, text) },
 }).AgentConversation;
 await act(async () => { render(h(Component, { threadId: 'stop-sdk', initialMessages: [oldHuman, oldAnswer], initialExecution: { requestId: 'old-request', state: 'settled', outcome: 'completed' }, pending: [],
  onThreadId() {}, onTitle() {}, onArtifact() {}, openArtifact: null, onArtifactRemoved() {}, starter: null, onStarterUsed() {}, words })); });
 await act(async () => { fireEvent.click(within(document.body).getByRole('button', { name: 'Submit controlled task' })); await wait(90); });
 const nextHuman = chat.messages.find(message => message.role === 'user' && message.id !== oldHuman.id);
 assert(nextHuman, 'real SDK must append the new human');
 assert(document.body.textContent.includes(fullText), 'real SDK must render streamed partial text');
 const partial = { id: 'stopped-native-answer', role: 'assistant', parts: [{ type: 'text', text: mode === 'shorter' ? 'Already visible first note.' : fullText }] };
 if (mode === 'unresolved') partial.parts.push({ type: 'tool-create_piece', toolCallId: 'unresolved-write', state: 'input-available', input: { title: 'Unconfirmed write' } });
 if (['uncertain', 'settlement-lag-uncertain'].includes(mode)) partial.parts.push({ type: 'tool-create_piece', toolCallId: 'uncertain-write', state: 'output-error', input: {}, errorText: 'CAPABILITY_OUTCOME_UNCERTAIN' });
 saved = { messages: [oldHuman, oldAnswer, nextHuman, partial], pending: mode === 'pending' ? [{ runId: 'waiting-native', toolCallId: 'still-pending', toolName: 'ask_user', kind: 'question', suspendPayload: { question: 'Still waiting', cardId: 'pending-card' } }] : [], execution: { requestId, state: mode === 'unknown' ? 'unknown' : 'settled', ...(mode === 'unknown' ? {} : { outcome: mode === 'failed' ? 'failed' : 'interrupted' }) } };
 if (mode === 'network') {
  await act(async () => { streamController.error(new TypeError('Failed to fetch')); await wait(100); });
 } else {
  await act(async () => { fireEvent.click(within(document.body).getByRole('button', { name: 'Stop controlled task' })); await wait(100); });
  if (mode === 'lag') {
   await act(async () => { stopResolve(); await wait(20); });
   assert(lagResolve, 'acknowledged Stop must read saved history');
   await act(async () => { lagResolve(); await wait(100); });
  }
  if (mode === 'late-finish') {
   assert.equal(document.querySelector('fieldset').disabled, false, 'confirmed Stop must unlock before the delayed owner callback');
   assert(delayedFinish, 'installed SDK must have emitted its real finish arguments');
   await act(async () => { delayedFinish(); await wait(100); });
  }
 }
 let lateStopIgnored;
 if (successor) {
  if (mode === 'late-stop-reply') await act(async () => {
   fireEvent.click(within(document.body).getByRole('button', { name: 'Check saved result' })); await wait(80);
  });
  assert.equal(document.querySelector('fieldset').disabled, false, 'verified/reconciled A must allow deliberate task B');
  await act(async () => { await submit({ text: 'Deliberate task B after verified Stop', files: [] }); await wait(80); });
  assert.equal(calls, 2);
  const nextHumanB = chat.messages.filter(message => message.role === 'user').at(-1);
  const nextAnswerB = chat.messages.find(message => message.id === 'next-native-answer');
  assert(nextAnswerB);
  if (mode === 'successor') {
   assert(heldFinishRead, 'the first real finish must have a held history response');
   await act(async () => { heldFinishRead(); await wait(80); });
  } else {
   const before = historyReads;
   await act(async () => { stopResolve(); await wait(80); });
   lateStopIgnored = historyReads === before;
  }
  saved = { messages: [oldHuman, oldAnswer, nextHuman, partial, nextHumanB, nextAnswerB], pending: [],
   execution: { requestId: 'task-B-request', runId: 'native-task-B', state: 'settled', outcome: 'completed' } };
  await act(async () => {
   streamController.enqueue({ type: 'text-end', id: 'text' });
   streamController.enqueue({ type: 'finish', finishReason: 'stop' }); streamController.close(); await wait(100);
  });
 }
 if (settlementLag) {
  assert(historyReads >= 2, 'the SDK finish and Stop receipt must both read pre-settlement history');
  beforeLateRead = { historyReads, blocked: document.querySelector('fieldset').disabled };
  lateSettlement = true;
  await act(async () => { window.dispatchEvent(new dom.window.Event('focus')); await wait(100); });
 }
 const blocked = document.querySelector('fieldset').disabled;
 const actual = { mode, messages: chat.messages.map(message => message.id), humanPreserved: document.body.textContent.includes('New task to stop'), partialPreserved: document.body.textContent.includes(fullText), blocked, calls, finish, errors, trace,
  lateStopIgnored, beforeLateRead, historyReads, status: chat.status,
  toolStates: chat.messages.flatMap(message => message.parts.flatMap(part => 'toolCallId' in part ? [part.state] : [])) };
 // Attempt a direct submit as well as checking the rendered disabled fieldset.
 if (blocked) await act(async () => { await submit({ text: 'Do not repeat an unknown action', files: [] }); });
 actual.callsAfterBlockedSubmit = calls;
 if (mode === 'lag') {
  await act(async () => { fireEvent.click(within(document.body).getByRole('button', { name: 'Check saved result' })); await wait(100); });
  actual.manualReconcilePreserved = document.body.textContent.includes(fullText) && document.body.textContent.includes('New task to stop');
  actual.manualReconcileUnlocked = !document.querySelector('fieldset').disabled;
  assert.equal(actual.manualReconcilePreserved, true); assert.equal(actual.manualReconcileUnlocked, true);
 }
 await act(async () => cleanup());
 return actual;
}
(async () => {
 const modes = process.env.STOP_PROBE_MODE ? [process.env.STOP_PROBE_MODE] : ['lag', 'shorter', 'terminal', 'late-finish', 'mismatch', 'unknown', 'failed', 'uncertain', 'unresolved', 'pending', 'no-ack', 'network', 'successor', 'late-stop-reply', 'retired-owner', 'cold-native-owner', 'mismatched-native-pointer', 'null-receipt', 'settlement-lag', 'settlement-lag-uncertain'];
 const reports = [];
 for (const mode of modes) reports.push(await scenario(mode));
 console.log(JSON.stringify({ reports }, null, 2));
 for (const report of reports) {
  const expected = ['successor', 'late-stop-reply'].includes(report.mode) ? 2 : 1;
  assert.equal(report.calls, expected, `${report.mode}: only deliberate controlled tasks may execute`);
  assert.equal(report.callsAfterBlockedSubmit, expected, `${report.mode}: unknown work must not repeat`);
  assert.equal(report.finish, expected, `${report.mode}: installed SDK emits one final callback per task`);
  assert.equal(report.humanPreserved, true, `${report.mode}: preserve the new human after Stop`);
  assert.equal(report.partialPreserved, true, `${report.mode}: preserve the already displayed partial after Stop`);
  assert.equal(report.blocked, !['settlement-lag','shorter','terminal','late-finish','successor','late-stop-reply','retired-owner','cold-native-owner','mismatched-native-pointer'].includes(report.mode), `${report.mode}: unlock only positively settled work`);
  if (report.mode === 'late-stop-reply') assert.equal(report.lateStopIgnored, true, 'an old Stop reply must not read or change a newer task');
  if (report.mode === 'uncertain') assert.deepEqual(report.toolStates, ['output-error'], 'preserving text must not invent a successful write');
  if (report.mode === 'settlement-lag-uncertain') assert.equal(report.toolStates.includes('output-available'), false, 'a late focus read must not invent a successful write');
  if (report.mode === 'unresolved') assert.deepEqual(report.toolStates, ['input-available'], 'an unconfirmed write must stay unconfirmed');
 }
 dom.window.close();
})().catch(error => { console.error(error); dom.window.close(); process.exitCode = 1; });
