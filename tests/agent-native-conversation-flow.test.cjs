'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/thread-native' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: dom.window[key] });
global.self = dom.window;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, within, waitFor } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { readThreadHistory, savedResearchContinuation, nativeTurnTimedOut } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const words = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy.ru;
const h = React.createElement;
afterEach(() => { cleanup(); window.sessionStorage.clear(); });

function fixture({ status = 'ready', initialMessages = [], initialExecution, pending = [], signalResult = { accepted: true, durability: 'native' }, historyResult, chatResponse, composerDraft } = {}) {
  const calls = [];
  let config;
  let transport;
  let updateMessages;
  let storedHistory = historyResult ?? { messages: initialMessages, pending, execution: { requestId: 'logical-native', state: 'settled', outcome: 'completed' } };
  let chatStatus = status;
  let chatError = null;
  const resumeStream = jest.fn(async () => undefined);
  const stop = jest.fn(async () => undefined);
  let nativeChat, nativeSend;
  let nativeMessages = initialMessages;
  let notify = () => undefined;
  const nativeAi = chatResponse ? process.getBuiltinModule('module').createRequire(__filename)('ai') : null;
  const nativeTransport = chatResponse ? loadWithMocks('apps/frontend/src/components/agents/agent.transport.ts', { ai: nativeAi }).createAgentTransport : null;
  const sendMessage = jest.fn((...args) => nativeChat ? (nativeSend = nativeChat.sendMessage(...args)) : Promise.resolve());
  const regenerate = jest.fn(async () => undefined);
  const request = async (url, init = {}) => {
    calls.push({ url, ...init });
    if (chatResponse && url === '/agent/chat') return chatResponse(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => String(url).endsWith('/signals')
      ? (typeof signalResult === 'function' ? signalResult(JSON.parse(init.body)) : signalResult)
      : (storedHistory instanceof Error ? Promise.reject(storedHistory) : storedHistory) };
  };
  const Component = loadWithMocks('apps/frontend/src/components/agents/agent.conversation.tsx', {
    react: React,
    '@ai-sdk/react': { useChat: options => {
      config = options;
      const [messages, setMessages] = React.useState(options.messages);
      updateMessages = setMessages;
      const [, changed] = React.useReducer(value => value + 1, 0);
      notify = changed;
      if (chatResponse && !nativeChat) {
        const state = {
          get status() { return chatStatus; }, set status(value) { chatStatus = value; notify(); },
          get error() { return chatError; }, set error(value) { chatError = value; notify(); },
          get messages() { return nativeMessages; }, set messages(value) { nativeMessages = value; setMessages(value); },
          pushMessage(message) { this.messages = [...this.messages, message]; },
          popMessage() { this.messages = this.messages.slice(0, -1); },
          replaceMessage(index, message) { this.messages = this.messages.map((saved, i) => i === index ? message : saved); },
          snapshot(value) { return structuredClone(value); },
        };
        nativeChat = new nativeAi.AbstractChat({ state, transport: options.transport,
          onError: failure => config.onError(failure), onFinish: finish => config.onFinish(finish), onData: part => config.onData(part) });
      }
      return { messages, setMessages, status: chatStatus, resumeStream, stop, sendMessage, error: chatError,
        clearError: () => { if (nativeChat) nativeChat.clearError(); else chatError = null; }, regenerate, addToolApprovalResponse: async () => undefined };
    } },
    swr: { __esModule: true, default: () => ({ data: undefined }), useSWRConfig: () => ({ mutate: async () => undefined }) },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
    '@contentfactory/frontend/components/onboarding/use-onboarding-progress': { useOnboardingProgress: () => ({ answered: false, progress: null }) },
    '@contentfactory/frontend/components/layout/user.context': { useUser: () => ({ role: 'ADMIN' }) },
    '@contentfactory/frontend/components/ui/allowance-hint': { ALLOWANCE_API: '/billing/allowance', AllowanceHint: () => null },
    '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
    './agent.threads': { THREADS_KEY: '/agent/threads' },
    './agent.transport': { isAgentRequestNotStarted: () => false, createAgentTransport: options => { transport = options; return nativeTransport ? nativeTransport(options) : {}; }, screenTimeZone: () => 'Europe/Moscow' },
    './agent.composer': { AgentComposer: ({ onSubmit, onStop, queued, recovery, busy }) => h('div', { 'data-queued': queued, 'data-composer-busy': busy },
      composerDraft !== undefined ? h('textarea', { 'aria-label': 'Unsent message', defaultValue: composerDraft }) : null,
      recovery ? h('output', { 'data-composer-recovery': recovery.kind }, recovery.text) : null,
      h('button', { onClick: () => void onSubmit({ text: 'Дополнительное указание', files: [] }) }, 'Send instruction'),
      h('button', { onClick: onStop }, 'Explicit Stop')) },
    './agent.markdown': { AgentMarkdown: ({ text }) => h('p', null, text) },
  }).AgentConversation;
  const props = { threadId: 'thread-native', initialMessages, initialExecution, pending,
    onThreadId: () => undefined, onTitle: () => undefined, onArtifact: () => undefined, openArtifact: null,
    onArtifactRemoved: () => undefined, starter: null, onStarterUsed: () => undefined, words };
  return { Component, props, calls, resumeStream, stop, sendMessage, regenerate, config: () => config, transport: () => transport, setStatus: value => { chatStatus = value; },
    nativeMessages: () => nativeMessages, nativeSend: () => nativeSend, setMessages: next => updateMessages(next), setHistory: next => { storedHistory = next; }, setError: value => { chatError = value; } };
}
const human = { id: 'human', role: 'user', parts: [{ type: 'text', text: 'Исходная задача' }] };
const active = { requestId: 'logical-native', runId: 'native-run', state: 'running' };

const completedStep = (id, title) => ({ type: 'tool-piece_read', toolCallId: id,
  state: 'output-available', input: {}, output: { ok: true }, title });

test.each(['ru', 'en'])('saved tool steps show only the latest status and expand locally (%s)', async locale => {
  const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy[locale];
  const message = { id: 'step-history', role: 'assistant', parts: [
    completedStep('first', 'First source'), completedStep('second', 'Second source'), completedStep('last', 'Last source'),
    { type: 'text', text: 'Saved answer after the steps' },
    { type: 'tool-piece_create', toolCallId: 'draft', state: 'output-available', title: 'Saved draft', input: {},
      output: { ok: true, card: { kind: 'piece', id: 'saved-piece', title: 'Saved draft', questions: 0 } } },
    { type: 'tool-piece_adapt', toolCallId: 'failed', title: 'Failed adaptation', state: 'output-error', errorText: 'AI_PROVIDER_REJECTED', input: {} },
  ] };
  const before = JSON.stringify(message);
  const f = fixture({ initialMessages: [human, message] });
  render(h(f.Component, { ...f.props, words: copy }));
  const body = within(document.body);
  const toggle = body.getByRole('button', { name: new RegExp(copy.card.done + ': Last source') });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(body.getByText(copy.card.done + ': First source').closest('[hidden]')).not.toBeNull();
  expect(body.getByText(copy.card.done + ': Second source').closest('[hidden]')).not.toBeNull();
  expect(body.getByText('Saved answer after the steps').closest('[hidden]')).toBeNull();
  expect(body.getByText('Saved draft').closest('[hidden]')).toBeNull();
  expect(body.getByText(copy.error.codes.AI_PROVIDER_REJECTED.what).closest('[hidden]')).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(body.getByText(copy.card.done + ': First source').closest('[hidden]')).toBeNull();
  fireEvent.click(toggle);
  expect(body.getByText(copy.card.done + ': First source').closest('[hidden]')).not.toBeNull();
  expect(JSON.stringify(message)).toBe(before);
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.resumeStream).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toEqual([]);
});

test('the running step replaces the completed summary while Stop remains outside the collapsed history', async () => {
  const message = { id: 'running-step-history', role: 'assistant', parts: [
    completedStep('first', 'Read source'), completedStep('second', 'Check facts'),
    { type: 'tool-piece_create', toolCallId: 'running', state: 'input-available', input: {}, title: 'Write draft' },
  ] };
  const f = fixture({ status: 'streaming', initialMessages: [human, message], initialExecution: active });
  const view = render(h(f.Component, f.props));
  const body = within(document.body);
  const toggle = body.getByRole('button', { name: /Write draft/ });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(body.getByText(words.card.done + ': Read source').closest('[hidden]')).not.toBeNull();
  expect(body.getByRole('button', { name: words.progress.stop }).closest('[hidden]')).toBeNull();
  fireEvent.click(toggle);
  await act(async () => f.config().onData({ type: 'data-progress', data: { capability: 'piece.create', stage: 'piece' } }));
  view.rerender(h(f.Component, f.props));
  expect(body.getByRole('button', { name: /Write draft/ }).getAttribute('aria-expanded')).toBe('true');
  expect(body.getByRole('button', { name: /Write draft/ }).textContent).toContain(words.progress.stages.writing);
  expect(body.getByText(words.card.done + ': Read source').closest('[hidden]')).toBeNull();
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test('text and stale actions stay outside status history; a single completed step has no disclosure', () => {
  const message = { id: 'separate-steps', role: 'assistant', parts: [
    completedStep('single', 'Only step'),
    { type: 'text', text: 'An answer between steps' },
    { ...completedStep('stale', 'Changed proposal'), output: { ok: true, summary: { outcome: 'stale' } } },
    completedStep('next', 'Next step'),
  ] };
  const f = fixture({ initialMessages: [human, message] });
  render(h(f.Component, f.props));
  const body = within(document.body);
  expect(body.getByText(words.card.done + ': Only step').closest('[hidden]')).toBeNull();
  expect(body.getByText('An answer between steps').closest('[hidden]')).toBeNull();
  expect(body.getByText('Changed proposal — ' + words.question.stale).closest('[hidden]')).toBeNull();
  expect(body.getByText(words.card.done + ': Next step').closest('[hidden]')).toBeNull();
  expect(document.querySelector('[data-agent-progress] button[aria-expanded]')).toBeNull();
});

test.each([
  [true, 'data-native-input-wait'], [false, 'data-native-input-wait'],
  [true, 'data-tool-call-suspended'], [false, 'data-tool-call-suspended'],
  [true, 'data-tool-call-approval'], [false, 'data-tool-call-approval'],
])('a replay observer detaches only for a saved gate of its current native owner (%s, %s)', async (ownsGate, event) => {
  const call = { runId: ownsGate ? active.runId : 'another-owner', toolCallId: 'slow-replay-call', toolName: 'piece_adapt' };
  const question = { kind: 'domain-questions', batchId: 'slow-replay-batch', cardId: 'slow-replay-card', question: 'Выберите акцент',
    source: { kind: 'adaptation', pieceId: 'slow-replay-piece', channelId: 'slow-replay-channel', revision: 'slow-replay-v1' },
    activeKey: 'angle', answers: [], canDecideForPerson: true,
    questions: [{ key: 'angle', question: 'На чём сделать акцент?', options: [
      { id: 'early', label: 'Раннее открытие' }, { id: 'cup', label: 'Скидка со своей кружкой' },
    ], selectionMode: 'single', canDecideForPerson: true }] };
  const asked = { id: 'slow-replay-message', role: 'assistant', parts: [{ type: 'tool-piece_adapt', toolCallId: call.toolCallId,
    state: 'input-available', title: 'Подготовить черновик', input: {} }] };
  const pending = [{ ...call, kind: 'question', suspendPayload: question, summary: null }];
  const f = fixture({ status: 'streaming', initialMessages: [human, asked], initialExecution: active,
    historyResult: { messages: [human, asked], pending: [], execution: active } });
  const view = render(h(f.Component, f.props));
  f.stop.mockImplementation(async () => {
    f.setStatus('ready');
    f.config().onFinish({ isAbort: true, isError: false, isDisconnect: false });
  });
  await act(async () => { f.config().onData({ type: event, data: {} }); });
  expect(f.stop).not.toHaveBeenCalled();
  f.setHistory({ messages: [human, asked], pending, execution: active });
  await act(async () => new Promise(resolve => setTimeout(resolve, 160)));
  await act(async () => view.rerender(h(f.Component, f.props)));
  expect(f.stop).toHaveBeenCalledTimes(ownsGate ? 1 : 0);
  expect(within(document.body).getByRole('radio', { name: 'Раннее открытие' }).disabled).toBe(!ownsGate);
  expect(f.calls.filter(call => call.method === 'POST')).toEqual([]);
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.resumeStream).not.toHaveBeenCalled();
});

test('an approval event cannot detach a live reader before native input wait', async () => {
  const call = { runId: active.runId, toolCallId: 'approval-phase-call', toolName: 'piece_adapt' };
  const asked = { id: 'approval-phase-message', role: 'assistant', parts: [{
    type: 'tool-piece_adapt', toolCallId: call.toolCallId, state: 'approval-requested', input: {},
    approval: { id: `${call.runId}::${call.toolCallId}` },
  }] };
  const approvalHistory = {
    messages: [human, asked],
    pending: [{ ...call, kind: 'approval', summary: 'Подтвердите действие.' }],
    execution: active,
  };
  const f = fixture({ status: 'streaming', initialMessages: [human, asked], initialExecution: active,
    historyResult: approvalHistory });
  render(h(f.Component, f.props));

  await act(async () => f.config().onData({ type: 'data-tool-call-approval', data: { ...call } }));
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
  expect(f.stop).not.toHaveBeenCalled();

  // The producer may auto-resume this approval. That event alone does not
  // prove that the native owner is waiting for a person now.
  await act(async () => f.config().onData({ type: 'data-tool-call-approval', data: { ...call, resumed: true } }));
  expect(f.stop).not.toHaveBeenCalled();

  await act(async () => f.config().onData({
    type: 'data-native-input-wait', data: { runId: call.runId }, transient: true,
  }));
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
  expect(f.stop).toHaveBeenCalledTimes(1);
  expect(f.calls.filter(call => call.method === 'POST')).toEqual([]);
});

test.each([false, true])('an in-flight answer detaches its reader only after its saved gate advances (%s)', async advances => {
  const question = { kind: 'domain-questions', batchId: 'advance-batch', cardId: 'advance-first', question: 'Выберите акцент',
    source: { kind: 'adaptation', pieceId: 'advance-piece', channelId: 'advance-channel', revision: 'advance-v1' },
    activeKey: 'ask-1', answers: [], canDecideForPerson: true, questions: [
      { key: 'ask-1', question: 'Первый акцент?', options: [{ id: 'early', label: 'Часы работы' }], selectionMode: 'single', canDecideForPerson: true },
      { key: 'ask-2', question: 'Второй акцент?', options: [{ id: 'cup', label: 'Своя кружка' }], selectionMode: 'single', canDecideForPerson: true },
    ] };
  const call = { runId: active.runId, toolCallId: 'advance-call', toolName: 'piece_adapt', kind: 'question', summary: null };
  const asked = { id: 'advance-message', role: 'assistant', parts: [{ type: 'tool-piece_adapt', toolCallId: call.toolCallId,
    state: 'input-available', title: 'Подготовить черновик', input: {} }] };
  const f = fixture({ initialMessages: [human, asked], initialExecution: active, pending: [{ ...call, suspendPayload: question }] });
  const view = render(h(f.Component, f.props));
  let finish;
  f.sendMessage.mockImplementation(() => { f.setStatus('streaming'); return new Promise(resolve => { finish = resolve; }); });
  f.stop.mockImplementation(async () => { f.setStatus('ready'); f.config().onFinish({ isAbort: true, isError: false, isDisconnect: false }); finish(); });
  fireEvent.click(within(document.body).getByRole('radio', { name: 'Часы работы' }));
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.question.send })));
  await act(async () => view.rerender(h(f.Component, f.props)));
  const next = advances ? { ...question, cardId: 'advance-second', activeKey: 'ask-2',
    answers: [{ key: 'ask-1', mode: 'choice', optionIds: ['early'], text: 'Часы работы' }] } : question;
  f.setHistory({ messages: [human, asked], execution: active, pending: [{ ...call, suspendPayload: next }] });
  await act(async () => f.config().onData({ type: 'data-tool-call-suspended', data: {} }));
  await act(async () => view.rerender(h(f.Component, f.props)));
  expect(f.stop).toHaveBeenCalledTimes(advances ? 1 : 0);
  if (advances) expect(within(document.body).getByRole('radio', { name: 'Своя кружка' }).disabled).toBe(false);
  else expect(within(document.body).queryAllByRole('radio').filter(control => !control.disabled)).toHaveLength(0);
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.calls.filter(call => call.method === 'POST')).toEqual([]);
});

test('reload resumes the real SDK observer once and explicit Stop also reaches the server', async () => {
  const f = fixture({ initialMessages: [human], initialExecution: active });
  await act(async () => render(h(f.Component, f.props)));
  expect(f.resumeStream).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Explicit Stop' })));
  expect(f.stop).toHaveBeenCalledTimes(1);
  expect(f.calls.some(call => call.url === '/agent/threads/thread-native/stop' && call.method === 'POST')).toBe(true);
});

test('Stop hydrates the new saved human and partial answer before its aborted observer finishes', async () => {
  const oldAnswer = { id: 'old-answer', role: 'assistant', parts: [{ type: 'text', text: 'Ранее завершённый ответ.' }] };
  const nextHuman = { id: 'next-human', role: 'user', parts: [{ type: 'text', text: 'Новая задача перед остановкой.' }] };
  const partial = { id: 'stopped-assistant', role: 'assistant', parts: [{ type: 'text', text: 'Уже сохранённая часть нового ответа.' }] };
  const f = fixture({ status: 'streaming', initialMessages: [human, oldAnswer], initialExecution: active,
    historyResult: { messages: [human, oldAnswer], pending: [], execution: active } });
  await act(async () => render(h(f.Component, f.props)));
  f.setHistory({ messages: [human, oldAnswer, nextHuman, partial], pending: [],
    execution: { requestId: active.requestId, state: 'settled', outcome: 'interrupted' } });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Explicit Stop' })));
  f.setStatus('ready');
  await act(async () => { f.config().onFinish({ isAbort: true, isError: false, isDisconnect: false }); });
  expect(within(document.body).getAllByText('Ранее завершённый ответ.')).toHaveLength(1);
  expect(within(document.body).getAllByText('Новая задача перед остановкой.')).toHaveLength(1);
  expect(within(document.body).getAllByText('Уже сохранённая часть нового ответа.')).toHaveLength(1);
  expect(f.calls.filter(call => call.method === 'POST')).toEqual([
    expect.objectContaining({ url: '/agent/threads/thread-native/stop' }),
  ]);
  expect(f.stop).toHaveBeenCalledTimes(1);
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test.each(['settled', 'running'])('native replay finishing after empty history hydrates the human once when the owner is %s', async state => {
  const assistant = { id: 'replayed-assistant', role: 'assistant', parts: [{ type: 'text', text: 'Полный восстановленный ответ.' }] };
  const f = fixture({ initialExecution: active, historyResult: { messages: [], pending: [], execution: active } });
  const view = render(h(f.Component, f.props));
  await act(async () => undefined);
  expect(f.resumeStream).toHaveBeenCalledTimes(1);
  f.setStatus('streaming');
  await act(async () => f.setMessages([assistant]));
  f.setHistory({ messages: [human, state === 'settled' ? assistant : { ...assistant, parts: [{ type: 'text', text: 'Ещё сохраняемый фрагмент.' }] }],
    pending: [], execution: { requestId: active.requestId, ...(state === 'running' ? { ...active } : { state: 'settled', outcome: 'completed' }) } });
  f.setStatus('ready');
  await act(async () => { f.config().onFinish({ isAbort: false, isError: false, isDisconnect: false }); });
  await act(async () => view.rerender(h(f.Component, f.props)));
  expect(document.body.textContent).toContain('Исходная задача');
  expect(within(document.body).getAllByText('Полный восстановленный ответ.')).toHaveLength(1);
  expect(document.body.textContent).not.toContain('Ещё сохраняемый фрагмент.');
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
});

test('a released native replay hydrates committed history even when the SDK never calls onFinish', async () => {
  const final = { id: 'released-assistant', role: 'assistant', parts: [{ type: 'text', text: 'Сохранённый ответ после завершения.' }] };
  const f = fixture({ initialExecution: active, historyResult: { messages: [], pending: [], execution: active } });
  await act(async () => render(h(f.Component, f.props)));
  expect(f.resumeStream).toHaveBeenCalledTimes(1);
  f.setHistory({ messages: [human, final], pending: [], execution: { requestId: active.requestId, state: 'settled', outcome: 'completed' } });
  await act(async () => f.transport().onReplayComplete());
  expect(within(document.body).getAllByText('Исходная задача')).toHaveLength(1);
  expect(within(document.body).getAllByText('Сохранённый ответ после завершения.')).toHaveLength(1);
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
});

test('an unreadable completed response remains uncertain until a deliberate saved-history check succeeds', async () => {
  const final = { id: 'late-committed-assistant', role: 'assistant', parts: [{ type: 'text', text: 'Позже сохранённый ответ.' }] };
  const f = fixture({ initialExecution: active, historyResult: { messages: [], pending: [], execution: active } });
  await act(async () => render(h(f.Component, f.props)));
  await act(async () => f.transport().onReplayComplete());
  expect(document.querySelector('fieldset').disabled).toBe(true);
  expect(within(document.body).getByRole('button', { name: 'Refresh status' })).toBeTruthy();
  expect(f.sendMessage).not.toHaveBeenCalled();
  f.setHistory({ messages: [human, final], pending: [], execution: { requestId: active.requestId, state: 'settled', outcome: 'completed' } });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Refresh status' })));
  expect(within(document.body).getAllByText('Позже сохранённый ответ.')).toHaveLength(1);
  expect(document.querySelector('fieldset').disabled).toBe(false);
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
});

test('an old released-replay history read cannot block a later deliberate task', async () => {
  const f = fixture({ initialMessages: [human] });
  await act(async () => render(h(f.Component, f.props)));
  let release;
  f.setHistory(new Promise(resolve => { release = resolve; }));
  const oldReplay = f.transport().onReplayComplete();
  await act(async () => { await Promise.resolve(); });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Send instruction' })));
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  await act(async () => { release({ messages: [], pending: [], execution: active }); await oldReplay; });
  expect(document.querySelector('fieldset').disabled).toBe(false);
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
});

test.each(['question', 'approval'])('an old history snapshot cannot replace the response after a native %s answer', async kind => {
  const call = { runId: 'gate-run', toolCallId: 'gate-call', toolName: kind === 'question' ? 'ask_user' : 'plan_move' };
  const asked = { id: 'gate-message', role: 'assistant', parts: [kind === 'question'
    ? { type: 'tool-ask_user', toolCallId: call.toolCallId, state: 'input-available', input: { question: 'Choose a direction' } }
    : { type: 'tool-plan_move', toolCallId: call.toolCallId, state: 'approval-requested', input: { title: 'Confirm the action' }, approval: { id: `${call.runId}::${call.toolCallId}` } }] };
  const pending = [{ ...call, kind, summary: 'Confirm the action', suspendPayload: kind === 'question'
    ? { question: 'Choose a direction', cardId: 'gate-card', options: [{ label: 'Cases' }] } : null }];
  const f = fixture({ initialMessages: [human, asked], initialExecution: active, pending });
  await act(async () => render(h(f.Component, f.props)));
  let release;
  f.setHistory(new Promise(resolve => { release = resolve; }));
  await act(async () => f.config().onFinish({ isAbort: false, isError: false, isDisconnect: false }));
  f.sendMessage.mockImplementation(async () => f.setStatus('submitted'));
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: kind === 'question' ? 'Cases' : words.approval.yes })));
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  f.setStatus('streaming');
  await act(async () => f.setMessages([human, { ...asked, parts: [{ type: 'text', text: 'Current resumed response' }] }]));
  await act(async () => release({ messages: [human, { ...asked, parts: [{ type: 'text', text: 'Obsolete response before the answer' }] }],
    pending: [], execution: { requestId: active.requestId, state: 'settled', outcome: 'completed' } }));
  expect(document.body.textContent).toContain('Current resumed response');
  expect(document.body.textContent).not.toContain('Obsolete response before the answer');
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
});

test('a busy instruction is accepted by native server delivery and shown without a browser execution queue', async () => {
  const f = fixture({ status: 'streaming', initialMessages: [human], initialExecution: active });
  await act(async () => render(h(f.Component, f.props)));
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Send instruction' })));
  const signal = f.calls.find(call => call.url.endsWith('/signals'));
  expect(signal.method).toBe('POST');
  expect(JSON.parse(signal.body)).toMatchObject({ kind: 'deliver', message: { role: 'user', parts: [{ type: 'text', text: 'Дополнительное указание' }] } });
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain(words.composer.signalAccepted);
  expect(document.querySelector('[data-queued]').getAttribute('data-queued')).toBe('false');
});

test('positive native idle refusal submits the same human message through the ordinary chat door', async () => {
  const f = fixture({ status: 'streaming', initialMessages: [human], initialExecution: active,
    signalResult: body => ({ accepted: false, code: 'AGENT_SIGNAL_IDLE', id: body.message.id }),
  });
  await act(async () => render(h(f.Component, f.props)));
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Send instruction' })));
  const original = JSON.parse(f.calls.find(call => call.url.endsWith('/signals')).body).message;
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.sendMessage.mock.calls[0][0]).toEqual(original);
  expect(document.body.textContent).not.toContain(words.composer.signalAccepted);
});

test.each(['finish', 'released'])('a native continuation preserves its earlier partial after terminal %s', async terminal => {
  const partial = { id: 'partial', role: 'assistant', parts: [{ type: 'text', text: 'Уже показанный фрагмент' }] };
  const f = fixture({ status: 'streaming', initialMessages: [human, partial], initialExecution: active });
  const view = render(h(f.Component, f.props));
  await act(async () => f.config().onData({ type: 'data-native-run-continuation', data: { runId: 'next-native-run' }, transient: true }));
  f.setStatus('ready');
  await act(async () => view.rerender(h(f.Component, f.props)));
  expect(f.resumeStream).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain('Уже показанный фрагмент');
  const final = { id: 'final-native', role: 'assistant', parts: [{ type: 'text', text: 'Завершённое продолжение.' }] };
  f.setHistory({ messages: [human, final], pending: [], execution: { requestId: active.requestId, state: 'settled', outcome: 'completed' } });
  await act(async () => f.setMessages(current => [...current, final]));
  await act(async () => {
    if (terminal === 'released') await f.transport().onReplayComplete();
    else f.config().onFinish({ isAbort: false, isError: false, isDisconnect: false });
  });
  expect(document.body.textContent).toContain('Уже показанный фрагмент');
  expect(within(document.body).getAllByText('Завершённое продолжение.')).toHaveLength(1);
});

test('history arriving after a fresh conversation mount populates the log', async () => {
  const f = fixture();
  const view = render(h(f.Component, f.props));
  await act(async () => view.rerender(h(f.Component, { ...f.props, initialMessages: [human] })));
  expect(document.body.textContent).toContain('Исходная задача');
});

test('a native pending question arriving in the mounted thread restores controls from its persisted input part', async () => {
  const asked = { id: 'native-question', role: 'assistant', parts: [{
    type: 'tool-ask_user', toolCallId: 'native-question-call', state: 'input-available', input: { question: 'Выберите тему.' },
  }] };
  const pending = [{ runId: 'native-question-run', toolCallId: 'native-question-call', toolName: 'ask_user', kind: 'question',
    suspendPayload: { question: 'Выберите тему.', cardId: 'native-question-card', options: [{ label: 'Кейсы' }, { label: 'Цифры' }] }, summary: null }];
  const f = fixture({ initialMessages: [human, asked], initialExecution: active });
  let view;
  await act(async () => { view = render(h(f.Component, f.props)); });
  await act(async () => view.rerender(h(f.Component, { ...f.props, pending })));
  expect(within(document.body).getByRole('button', { name: 'Кейсы' }).disabled).toBe(false);
  expect(document.body.textContent).toContain('Выберите тему.');
  expect(document.body.textContent).not.toContain('больше не ждёт ответа');
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Кейсы' })));
  expect(f.sendMessage).toHaveBeenCalledWith(undefined, { body: { resume: {
    runId: 'native-question-run', toolCallId: 'native-question-call', cardId: 'native-question-card', resumeData: { answer: 'Кейсы' },
  } } });
});

const draftReviewCall = { runId: 'draft-review-run', toolCallId: 'draft-review-call', toolName: 'piece_rewrite' };
const draftReviewQuestion = {
  kind: 'selection', cardId: 'draft-review-card', question: 'Проверьте предложенные изменения', answerKey: 'changeIds',
  canDecideForPerson: false,
  options: [{ id: 'change-intro', label: 'Новое начало', selected: true }, { id: 'change-ending', label: 'Новый вывод', selected: false }],
  fullPreview: { title: 'Предложенный полный черновик', text: 'Полное новое начало.\n\nСохранённый основной текст.\n\nТочный новый вывод.' },
};
const draftReviewPart = { type: 'tool-piece_rewrite', toolCallId: draftReviewCall.toolCallId, title: 'Правка черновика', state: 'input-available', input: {} };
const draftReviewPending = { ...draftReviewCall, kind: 'question', suspendPayload: draftReviewQuestion, summary: null };
const draftReviewExecution = { requestId: 'draft-review-request', runId: draftReviewCall.runId, state: 'running' };

test.each([true, false])('a saved draft review is visible and actionable after reload and steering while the native owner remains running (full preview: %s)', async fullPreview => {
  const payload = fullPreview ? draftReviewQuestion : { ...draftReviewQuestion, fullPreview: undefined };
  const asked = { id: 'draft-review-message', role: 'assistant', parts: [draftReviewPart] };
  const instruction = { id: 'draft-review-steering', role: 'user', parts: [{ type: 'text', text: 'Поясните, почему выбрали это начало.' }] };
  const messages = [human, asked, instruction];
  const pending = [{ ...draftReviewPending, suspendPayload: payload }];
  const f = fixture({ initialMessages: messages, initialExecution: draftReviewExecution, pending,
    historyResult: { messages, pending, execution: draftReviewExecution } });
  await act(async () => render(h(f.Component, f.props)));
  const body = within(document.body);
  expect(body.getByText('The draft is waiting for your review. Review it in the card before accepting any changes.')).toBeTruthy();
  const jump = body.getByRole('button', { name: 'Review draft' });
  const target = document.querySelector('[data-agent-review-card]');
  target.scrollIntoView = jest.fn();
  fireEvent.click(jump);
  expect(document.activeElement).toBe(target);
  expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
  if (fullPreview) {
    expect(document.querySelector('[data-agent-full-preview]').textContent).toContain(draftReviewQuestion.fullPreview.text);
    expect(body.getByRole('button', { name: 'Accept' }).disabled).toBe(false);
    expect(body.getByRole('button', { name: 'Keep current draft' }).disabled).toBe(false);
  }
  expect(f.resumeStream).not.toHaveBeenCalled();
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
  if (fullPreview) {
    await act(async () => fireEvent.click(body.getByRole('button', { name: 'Accept' })));
    expect(f.sendMessage).toHaveBeenCalledWith(undefined, { body: { resume: {
      runId: draftReviewCall.runId, toolCallId: draftReviewCall.toolCallId, cardId: draftReviewQuestion.cardId, resumeData: { changeIds: ['change-intro', 'change-ending'] },
    } } });
  }
});

test('a native wait restores a missing draft review input in the same live message before the workflow settles', async () => {
  const earlierPart = completedStep('earlier-read', 'Прочитать черновик');
  const live = { id: 'draft-review-live', role: 'assistant', parts: [earlierPart] };
  const saved = { ...live, parts: [earlierPart, draftReviewPart] };
  const f = fixture({ status: 'streaming', initialMessages: [human, live], initialExecution: draftReviewExecution,
    historyResult: { messages: [human, saved], pending: [draftReviewPending], execution: draftReviewExecution } });
  let view;
  await act(async () => { view = render(h(f.Component, f.props)); });
  await act(async () => f.config().onData({ type: 'data-native-input-wait', data: { runId: draftReviewCall.runId }, transient: true }));
  await waitFor(() => expect(document.querySelector('[data-agent-full-preview]')).not.toBeNull());
  expect(f.stop).toHaveBeenCalledTimes(1);
  f.setStatus('ready');
  await act(async () => view.rerender(h(f.Component, f.props)));
  await act(async () => f.config().onFinish({ isAbort: true, isError: false, isDisconnect: false }));
  expect(within(document.body).getByRole('button', { name: 'Review draft' })).toBeTruthy();
  expect(within(document.body).getByRole('button', { name: 'Accept' }).disabled).toBe(false);
  expect(document.querySelector('[data-agent-full-preview]').textContent).toContain('Точный новый вывод.');
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test('a settled or unrelated native gate does not advertise an old draft review as actionable', async () => {
  const asked = { id: 'old-draft-review', role: 'assistant', parts: [draftReviewPart, { type: 'data-tool-call-suspended', data: {
    ...draftReviewCall, suspendPayload: draftReviewQuestion,
  } }] };
  const f = fixture({ initialMessages: [human, asked], initialExecution: { ...draftReviewExecution, state: 'settled', outcome: 'completed' } });
  await act(async () => render(h(f.Component, f.props)));
  expect(within(document.body).queryByRole('button', { name: 'Review draft' })).toBeNull();
  expect(within(document.body).queryByRole('button', { name: 'Accept' })).toBeNull();
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test('a pending draft review from another native run cannot replace the current live message or detach its observer', async () => {
  const live = { id: 'draft-review-other-owner', role: 'assistant', parts: [completedStep('current-read', 'Текущая задача')] };
  const saved = { ...live, parts: [...live.parts, draftReviewPart] };
  const f = fixture({ status: 'streaming', initialMessages: [human, live], initialExecution: draftReviewExecution,
    historyResult: { messages: [human, saved], pending: [{ ...draftReviewPending, runId: 'another-native-run' }], execution: draftReviewExecution } });
  await act(async () => render(h(f.Component, f.props)));
  await act(async () => {
    f.config().onData({ type: 'data-native-input-wait', data: { runId: draftReviewCall.runId }, transient: true });
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  expect(document.querySelector('[data-agent-full-preview]')).toBeNull();
  expect(f.stop).not.toHaveBeenCalled();
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test('a native question suspension supersedes the earlier approval projection for the same call', async () => {
  const call = { runId: 'native-question-run', toolCallId: 'native-question-call', toolName: 'ask_user' };
  const question = { question: 'Какой вывод донести читателю?', questionPurpose: 'creative', canDecideForPerson: true, cardId: 'native-question-card' };
  const asked = { id: 'native-question', role: 'assistant', parts: [
    { type: 'tool-ask_user', toolCallId: call.toolCallId, state: 'approval-requested', input: { question: question.question, options: null },
      approval: { id: `${call.runId}::${call.toolCallId}` } },
    { type: 'data-tool-call-approval', data: { ...call, args: { question: question.question, options: null } } },
    { type: 'data-tool-call-suspended', data: { ...call, suspendPayload: question, resumeSchema: JSON.stringify({ anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }) } },
  ] };
  const pending = [{ ...call, kind: 'question', suspendPayload: question, summary: null }];
  const f = fixture({ initialMessages: [human, asked], initialExecution: active, pending });
  await act(async () => render(h(f.Component, f.props)));
  expect((await within(document.body).findByRole('button', { name: 'Решите за меня' })).disabled).toBe(false);
  expect(within(document.body).getByRole('textbox')).toBeTruthy();
  expect(document.body.textContent).toContain(question.question);
  expect(document.body.textContent).not.toContain('больше не ждёт ответа');
});

test('native input wait reloads a pending ask_user question when the suspension event is absent', async () => {
  const call = { runId: 'native-choice-run', toolCallId: 'native-choice-call', toolName: 'ask_user' };
  const question = {
    question: 'Какой ответ отправить клиенту?', questionPurpose: 'creative',
    options: [
      { label: 'Клиентам', description: 'Подготовить сообщение для клиентов.' },
      { label: 'Коллегам', description: 'Подготовить сообщение для коллег.' },
    ],
    selectionMode: 'single_select',
    canDecideForPerson: true,
    cardId: 'a'.repeat(32),
  };
  const savedQuestion = { id: 'native-choice-message', role: 'assistant', parts: [
    { type: 'tool-ask_user', toolCallId: call.toolCallId, state: 'input-available',
      input: { question: question.question, options: question.options, selectionMode: question.selectionMode } },
  ] };
  // The browser still has the approval state from the earlier tool event; the
  // authoritative saved history has already advanced this same call to a wait.
  const staleApproval = { ...savedQuestion, parts: [
    { type: 'tool-ask_user', toolCallId: call.toolCallId, state: 'approval-requested',
      input: { question: question.question, options: question.options },
      approval: { id: `${call.runId}::${call.toolCallId}` } },
  ] };
  const nativeHistory = {
    messages: [human, savedQuestion],
    pending: [{ runId: call.runId, toolCallId: call.toolCallId, toolName: call.toolName,
      kind: 'question', suspendPayload: question }],
    execution: { requestId: 'logical-native', runId: call.runId, state: 'running' },
  };
  const f = fixture({ status: 'streaming', initialMessages: [human, staleApproval], initialExecution: { ...active, runId: call.runId } });
  let view;
  await act(async () => { view = render(h(f.Component, f.props)); });
  f.setHistory(nativeHistory);
  expect(document.body.textContent).toContain('Обновить данные действия');
  await act(async () => f.config().onData({
    type: 'data-tool-call-approval',
    data: { state: 'data-tool-call-approval', ...call, args: staleApproval.parts[0].input, resumed: true },
  }));
  // A missing/dropped suspension data part must not leave the approval card
  // as the only visible gate once the native owner announces its saved wait.
  await act(async () => f.config().onData({ type: 'data-native-input-wait', data: { runId: call.runId }, transient: true }));
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));

  expect(await within(document.body).findByRole('button', { name: 'Клиентам' })).toBeTruthy();
  expect(within(document.body).getByRole('button', { name: 'Коллегам' })).toBeTruthy();
  expect(document.querySelector('[data-agent-card="approval"]')).toBeNull();
  expect(document.body.textContent).not.toContain('Обновить данные действия');

  f.setStatus('ready');
  await act(async () => view.rerender(h(f.Component, f.props)));
  await act(async () => f.config().onFinish({ isAbort: false, isError: false, isDisconnect: false }));

  const questionCard = document.querySelector('[data-agent-card="question"]');
  expect(within(questionCard).getByRole('button', { name: 'Решите за меня' }).disabled).toBe(false);
  const clients = within(questionCard).getByRole('button', { name: 'Клиентам' });
  expect(clients.disabled).toBe(false);
  expect(f.calls.some(call => call.url === '/agent/threads/thread-native')).toBe(true);
  await act(async () => fireEvent.click(clients));
  expect(f.sendMessage).toHaveBeenCalledWith(undefined, { body: { resume: {
    runId: call.runId, toolCallId: call.toolCallId, cardId: question.cardId, resumeData: { answer: 'Клиентам' },
  } } });
});

test('a persisted pending ask_user question replaces its obsolete denied permission part', async () => {
  const call = { runId: 'native-choice-run', toolCallId: 'native-choice-call', toolName: 'ask_user' };
  const question = {
    question: 'Какой ответ отправить клиенту?', questionPurpose: 'creative',
    options: [
      { label: 'Да', description: 'Подтвердить предложенный ответ.' },
      { label: 'Нет', description: 'Отказаться от предложенного ответа.' },
    ],
    selectionMode: 'single_select',
    canDecideForPerson: true,
    cardId: 'a'.repeat(32),
  };
  const asked = { id: 'native-choice-message', role: 'assistant', parts: [
    { type: 'tool-ask_user', toolCallId: call.toolCallId, state: 'output-denied',
      input: { question: question.question, options: question.options },
      approval: { id: `${call.runId}::${call.toolCallId}` } },
  ] };
  const history = readThreadHistory({
    messages: [asked],
    pending: [{ ...call, kind: 'question', suspendPayload: question, summary: null }],
  });
  const f = fixture({ initialMessages: [human, ...history.messages], initialExecution: active, pending: history.pending });

  await act(async () => render(h(f.Component, f.props)));

  expect(await within(document.body).findByRole('button', { name: 'Да' })).toBeTruthy();
  expect(within(document.body).getByRole('button', { name: 'Нет' })).toBeTruthy();
  expect(document.querySelector('[data-agent-card="approval"]')).toBeNull();
  expect(document.body.textContent).not.toContain('Обновить данные действия');
});

test('parallel approval answers reach one native continuation after every distinct gate is answered', async () => {
  const runId = 'parallel-approval-run';
  const tools = ['plan_move', 'piece_delete'];
  const asked = { id: 'parallel-approval-message', role: 'assistant', parts: tools.map((name, index) => ({
    type: `tool-${name}`, toolCallId: `parallel-call-${index}`, title: index ? 'Удалить заготовку' : 'Перенести пост', state: 'approval-requested',
    approval: { id: `${runId}::parallel-call-${index}`, requestReason: index ? 'Заготовка «Демонстрация» будет удалена без восстановления.' : 'Пост «Демонстрация» будет перенесён на 15:00.' },
  })) };
  const pending = tools.map((toolName, index) => ({ kind: 'approval', runId, toolCallId: `parallel-call-${index}`, toolName,
    summary: asked.parts[index].approval.requestReason, suspendPayload: null }));
  const f = fixture({ initialMessages: [human, asked], pending });
  await act(async () => render(h(f.Component, f.props)));
  const buttons = within(document.body).getAllByRole('button', { name: words.approval.yes });
  await act(async () => { fireEvent.click(buttons[0]); fireEvent.click(buttons[1]); fireEvent.click(buttons[1]); });
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
});

test('a durable manual question resumes its exact run/card with custom text without an extra continue step', async () => {
  const call = { runId: 'manual-run', toolCallId: 'manual-call', toolName: 'piece_create' };
  const question = { kind: 'domain-questions', batchId: 'manual-batch', cardId: 'manual-card', question: 'Уточните материал',
    source: { kind: 'piece', pieceId: 'manual-piece', revision: 'v1' }, activeKey: 'experience', answers: [], canDecideForPerson: true,
    questions: [{ key: 'experience', question: 'Какой пример добавить?', options: [], suggested: null, selectionMode: 'single', canDecideForPerson: true }] };
  const asked = { id: 'manual-question-message', role: 'assistant', parts: [{ type: 'tool-piece_create', toolCallId: call.toolCallId, title: 'Написать материал', state: 'input-available', input: {} }] };
  const f = fixture({ initialMessages: [human, asked], pending: [{ ...call, kind: 'question', suspendPayload: question, summary: null }] });
  await act(async () => render(h(f.Component, { ...f.props, draftStorageKey: 'owned-user:manual-thread' })));
  fireEvent.change(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }), { target: { value: 'Сохраните точную формулировку\nс новой строкой.' } });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.question.send })));
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.sendMessage).toHaveBeenCalledWith(undefined, { body: { resume: {
    runId: call.runId, toolCallId: call.toolCallId, cardId: 'manual-card', resumeData: { answers: [{ key: 'experience', mode: 'custom', text: 'Сохраните точную формулировку\nс новой строкой.' }] },
  } } });
});

test.each([['network', 'same'], ['closed', 'same'], ['network', 'next']])('a verified current native question unlocks after a %s answer failure and %s pending gate without an automatic resend', async (kind, gate) => {
  const call = { runId: 'restored-manual-run', toolCallId: 'restored-manual-call', toolName: 'piece_create' };
  const question = { kind: 'domain-questions', batchId: 'restored-batch', cardId: 'restored-card-1', question: 'Уточните материал',
    source: { kind: 'piece', pieceId: 'restored-piece', revision: 'restored-v1' }, activeKey: 'experience', answers: [], canDecideForPerson: true,
    questions: [ { key: 'experience', question: 'Какой пример добавить?', options: [], selectionMode: 'single', canDecideForPerson: true },
      { key: 'angle', question: 'Какую мысль объяснить?', options: [], selectionMode: 'single', canDecideForPerson: true } ] };
  const asked = { id: 'restored-manual-message', role: 'assistant', parts: [{ type: 'tool-piece_create', toolCallId: call.toolCallId, title: 'Написать материал', state: 'input-available', input: {} }] };
  const pending = [{ ...call, kind: 'question', suspendPayload: question, summary: null }];
  const execution = { requestId: 'restored-request', runId: call.runId, state: 'running' };
  const f = fixture({ initialMessages: [human, asked], initialExecution: execution, pending,
    historyResult: { messages: [human, asked], pending: [], execution: { ...execution, state: 'unknown' } } });
  const props = { ...f.props, draftStorageKey: `restored-owner:${kind}:${gate}` };
  const view = render(h(f.Component, props));
  const failure = kind === 'network' ? new TypeError('connection reset') : new Error('AGENT_RUN_NOT_PENDING');
  f.sendMessage.mockImplementation(async () => {
    f.setError(failure); f.setStatus('error'); f.config().onError(failure);
    f.config().onFinish({ isAbort: false, isError: true, isDisconnect: kind === 'network' });
  });
  fireEvent.change(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }), { target: { value: 'Точный сохранённый черновик' } });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.question.send })));
  await act(async () => view.rerender(h(f.Component, props)));
  expect(document.querySelector('fieldset').disabled).toBe(true);
  const current = gate === 'next' ? { ...question, cardId: 'restored-card-2', activeKey: 'angle', answers: [{ key: 'experience', mode: 'custom', text: 'Точный сохранённый черновик' }] } : question;
  f.setHistory({ messages: [human, asked], pending: [{ ...pending[0], suspendPayload: current }], execution });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Refresh status' })));
  expect(document.querySelector('fieldset').disabled).toBe(false);
  expect(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }).disabled).toBe(false);
  expect(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }).value).toBe(gate === 'same' ? 'Точный сохранённый черновик' : '');
  expect(document.body.textContent).not.toContain('Ответ не принят');
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.resumeStream).not.toHaveBeenCalled();
});

test('a current pending gate cannot override an explicit Stop without terminal stop proof', async () => {
  const pending = [{ runId: active.runId, toolCallId: 'stopped-question', toolName: 'ask_user', kind: 'question',
    suspendPayload: { question: 'Какой пример оставить?', cardId: 'stopped-question-card', options: [{ label: 'Кейсы' }] }, summary: null }];
  const asked = { id: 'stopped-question-message', role: 'assistant', parts: [{ type: 'tool-ask_user', toolCallId: 'stopped-question', state: 'input-available', input: { question: 'Какой пример оставить?' } }] };
  const f = fixture({ initialMessages: [human, asked], initialExecution: active, pending, historyResult: { messages: [human, asked], pending, execution: active } });
  await act(async () => render(h(f.Component, f.props)));
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Explicit Stop' })));
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Refresh status' })));
  expect(document.querySelector('fieldset').disabled).toBe(true);
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test('a settled observer leaves Stop available on a pending domain gate without submitting its draft or accepted partial answers', async () => {
  const call = { runId: 'waiting-stop-run', toolCallId: 'waiting-stop-call', toolName: 'piece_adapt' };
  const accepted = { key: 'ask-1', mode: 'custom', text: 'Уже принятый личный пример' };
  const question = { kind: 'domain-questions', batchId: 'waiting-stop-batch', cardId: 'waiting-stop-card', question: 'Уточните черновик',
    source: { kind: 'adaptation', pieceId: 'waiting-stop-piece', channelId: 'waiting-stop-channel', revision: 'waiting-stop-v1' },
    activeKey: 'ask-2', answers: [accepted], canDecideForPerson: true,
    questions: [ { key: 'ask-1', question: 'Какой пример добавить?', options: [], selectionMode: 'single', canDecideForPerson: true },
      { key: 'ask-2', question: 'Какой вывод сохранить?', options: [], selectionMode: 'single', canDecideForPerson: true } ] };
  const asked = { id: 'waiting-stop-message', role: 'assistant', parts: [{ type: 'tool-piece_adapt', toolCallId: call.toolCallId, title: 'Подготовить черновик', state: 'input-available', input: {} }] };
  const pending = [{ ...call, kind: 'question', suspendPayload: question, summary: null }];
  const execution = { requestId: 'waiting-stop-request', runId: call.runId, state: 'running' };
  const f = fixture({ initialMessages: [human, asked], initialExecution: execution, pending,
    historyResult: { messages: [human, asked], pending, execution } });
  const scope = 'owned-user:waiting-stop-thread';
  await act(async () => render(h(f.Component, { ...f.props, draftStorageKey: scope })));
  fireEvent.change(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }), { target: { value: 'Этот черновик ещё не отправлен' } });
  expect(within(document.body).getByRole('button', { name: words.question.send }).disabled).toBe(false);
  expect(document.querySelector('fieldset').disabled).toBe(false);
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.progress.stop })));
  expect(f.calls.filter((request) => request.method === 'POST')).toEqual([expect.objectContaining({ url: '/agent/threads/thread-native/stop' })]);
  expect(f.stop).toHaveBeenCalledTimes(1);
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.resumeStream).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain(accepted.text);
  expect(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }).value).toBe('Этот черновик ещё не отправлен');
  const { domainQuestionDraftKey } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.question-draft.ts');
  expect(JSON.parse(window.sessionStorage.getItem(domainQuestionDraftKey(scope, question.batchId, question.source.revision, question.activeKey)))).toEqual({ mode: 'custom', text: 'Этот черновик ещё не отправлен' });
  expect(question.answers).toEqual([accepted]);
  expect(document.querySelector('fieldset').disabled).toBe(true);
});

test('a positively refused stale domain answer keeps its reason after native pending reconciliation clears the transport error', async () => {
  const call = { runId: 'stale-question-run', toolCallId: 'stale-question-call', toolName: 'piece_create' };
  const question = { kind: 'domain-questions', batchId: 'stale-question-batch', cardId: 'stale-question-card', question: 'Уточните материал',
    source: { kind: 'piece', pieceId: 'stale-question-piece', revision: 'stale-v1' }, activeKey: 'experience', answers: [], canDecideForPerson: true,
    questions: [{ key: 'experience', question: 'Какой пример добавить?', options: [], selectionMode: 'single', canDecideForPerson: true }] };
  const asked = { id: 'stale-question-message', role: 'assistant', parts: [{ type: 'tool-piece_create', toolCallId: call.toolCallId, title: 'Создать заготовку', state: 'input-available', input: {} }] };
  const pending = [{ ...call, kind: 'question', suspendPayload: question, summary: null }];
  const execution = { requestId: 'stale-question-request', runId: call.runId, state: 'running' };
  const f = fixture({ initialMessages: [human, asked], initialExecution: execution, pending, historyResult: { messages: [human, asked], pending, execution } });
  await act(async () => render(h(f.Component, { ...f.props, draftStorageKey: 'owned-stale-thread' })));
  f.sendMessage.mockImplementation(async () => {
    const failure = new Error(JSON.stringify({ code: 'AGENT_QUESTION_STALE' }));
    f.setError(failure); f.setStatus('error'); f.config().onError(failure);
    f.config().onFinish({ isAbort: false, isError: true, isDisconnect: false });
  });
  fireEvent.change(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }), { target: { value: 'Точный черновик после чужой ручной правки' } });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.question.send })));
  const card = document.querySelector('[data-agent-card="domain-questions"]');
  expect(card.textContent).toContain(words.error.codes.AGENT_QUESTION_STALE.what);
  expect(card.textContent).toContain(words.error.codes.AGENT_QUESTION_STALE.next);
  expect(card.textContent).not.toContain(words.question.answerFailed);
  expect(within(card).getByRole('textbox', { name: words.question.ownAnswer }).value).toBe('Точный черновик после чужой ручной правки');
  expect(within(card).getByRole('button', { name: words.question.send }).disabled).toBe(true);
  expect(within(document.body).getByRole('button', { name: words.progress.stop }).disabled).toBe(false);
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
});

test.each(['same-assistant', 'new-assistant'])('a lost successful answer hydrates a new native adaptation call in %s history and never resends the accepted creation answer', async (where) => {
  const createCall = { runId: 'lost-success-run', toolCallId: 'lost-create-call', toolName: 'piece_create' };
  const createQuestion = { kind: 'domain-questions', batchId: 'create-batch', cardId: 'create-card', question: 'Уточните материал',
    source: { kind: 'piece', pieceId: 'created-piece', revision: 'create-v1' }, activeKey: 'experience', answers: [], canDecideForPerson: true,
    questions: [{ key: 'experience', question: 'Какой пример добавить в материал?', options: [], selectionMode: 'single', canDecideForPerson: true }] };
  const initial = { id: 'lost-original-assistant', role: 'assistant', parts: [{ type: 'tool-piece_create', toolCallId: createCall.toolCallId, title: 'Создать заготовку', state: 'input-available', input: {} }] };
  const savedCreate = { ...initial, parts: [{ ...initial.parts[0], state: 'output-available', output: { ok: true, card: { kind: 'piece', id: 'created-piece', title: 'Сохранённая новая заготовка', questions: 0 } } }] };
  const adaptCall = { runId: createCall.runId, toolCallId: 'lost-new-adapt-call', toolName: 'piece_adapt' };
  const adaptQuestion = { kind: 'domain-questions', batchId: 'adapt-batch', cardId: 'adapt-card', question: 'Уточните Telegram-черновик',
    source: { kind: 'adaptation', pieceId: 'created-piece', channelId: 'telegram-draft-channel', revision: 'adapt-v1' }, activeKey: 'ask-1', answers: [], canDecideForPerson: true,
    questions: [{ key: 'ask-1', question: 'Какую особенность сохранить в Telegram?', options: [], selectionMode: 'single', canDecideForPerson: true }] };
  const adaptPart = { type: 'tool-piece_adapt', toolCallId: adaptCall.toolCallId, title: 'Подготовить Telegram-черновик', state: 'input-available', input: { pieceId: 'created-piece', channelId: 'telegram-draft-channel' } };
  const savedMessages = where === 'same-assistant'
    ? [human, { ...savedCreate, parts: [...savedCreate.parts, adaptPart] }]
    : [human, savedCreate, { id: 'lost-next-assistant', role: 'assistant', parts: [adaptPart] }];
  const execution = { requestId: 'lost-success-request', runId: createCall.runId, state: 'running' };
  const f = fixture({ initialMessages: [human, initial], initialExecution: execution,
    pending: [{ ...createCall, kind: 'question', suspendPayload: createQuestion, summary: null }],
    historyResult: { messages: savedMessages, execution, pending: [{ ...adaptCall, kind: 'question', suspendPayload: adaptQuestion, summary: null }] } });
  const props = { ...f.props, draftStorageKey: `lost-success-owner:${where}` };
  await act(async () => render(h(f.Component, props)));
  f.sendMessage.mockImplementation(async () => {
    const failure = new TypeError('Failed to fetch after server accepted the answer');
    f.setError(failure); f.setStatus('error'); f.config().onError(failure);
    f.config().onFinish({ isAbort: false, isError: true, isDisconnect: true });
  });
  fireEvent.change(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }), { target: { value: 'Принятый точный пример' } });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.question.send })));
  expect(within(document.body).getByText('Какую особенность сохранить в Telegram?')).toBeTruthy();
  expect(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }).disabled).toBe(false);
  expect(document.body.textContent).toContain('Сохранённая новая заготовка');
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.resumeStream).not.toHaveBeenCalled();
  expect(f.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});

test('an uncertain native queue acknowledgement stays unknown after history reload', async () => {
  const f = fixture({ initialMessages: [human] });
  f.props.initialSignalReceipts = [{ id: 'uncertain-input', text: 'Следующее поручение', kind: 'queue', durability: 'native', state: 'unknown' }];
  await act(async () => render(h(f.Component, f.props)));
  expect(document.body.textContent).toContain(words.composer.signalUnknown);
  expect(document.body.textContent).not.toContain(words.composer.signalQueued);
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test.each([['ru','AI_PROVIDER_PAYMENT_REQUIRED'],['en','AI_PROVIDER_PAYMENT_REQUIRED'],['ru','AGENT_FAILED']])('a live native %s %s SSE unlocks the confirmed saved turn without reload or replay', async (locale,errorCode) => {
  const copy=loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy[locale];
  let stream;
  const bodies=[];
  const f=fixture({initialMessages:[human],chatResponse:body=>{
    bodies.push(body);
    return new Response(new ReadableStream({start(controller){
      stream=controller;
      controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'start',messageId:`failed-${bodies.length}`})+'\n\n'));
    }}),{headers:{'Content-Type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1'}});
  }});
  const view=render(h(f.Component,{...f.props,words:copy}));
  await act(async()=>fireEvent.click(within(document.body).getByRole('button',{name:'Send instruction'})));
  const submitted=f.nativeMessages().filter(m=>m.role==='user').at(-1);
  const execution={requestId:'payment-error-request',runId:'payment-error-run',state:'settled',outcome:'failed',errorCode};
  f.setHistory({messages:[human,submitted],pending:[],execution});
  await act(async()=>{
    stream.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'error',errorText:errorCode})+'\n\n'));
    stream.close();await f.nativeSend();
  });
  const button=within(document.body).getByRole('button',{name:'Send instruction'});
  await waitFor(()=>expect(button.closest('fieldset').disabled).toBe(false));
  expect(document.body.textContent).toContain(copy.error.codes[errorCode].what);
  expect(document.querySelector('[data-composer-busy]').getAttribute('data-composer-busy')).toBe('false');
  expect(f.sendMessage).toHaveBeenCalledTimes(1);expect(f.regenerate).not.toHaveBeenCalled();expect(f.resumeStream).not.toHaveBeenCalled();
  expect(f.calls.filter(call=>call.method==='POST').map(call=>call.url)).toEqual(['/agent/chat']);
  expect(view.container.querySelector('fieldset')).toBe(button.closest('fieldset')); // same mounted conversation
  await act(async()=>fireEvent.click(button));
  expect(f.sendMessage).toHaveBeenCalledTimes(2);expect(bodies).toHaveLength(2);
  expect(bodies[1].messages[0].id).not.toBe(submitted.id);
  await act(async()=>{stream.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'finish',finishReason:'stop'})+'\n\ndata: [DONE]\n\n'));stream.close();await f.nativeSend();});
});

test.each(['unknown','missing-user','newer-user','running','approval'])('terminal-error recovery preserves the %s boundary without replay',async boundary=>{
  let stream;
  const f=fixture({initialMessages:[human],chatResponse:()=>new Response(new ReadableStream({start(controller){
    stream=controller;controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'start',messageId:'boundary-error'})+'\n\n'));
  }}),{headers:{'Content-Type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1'}})});
  render(h(f.Component,f.props));
  await act(async()=>fireEvent.click(within(document.body).getByRole('button',{name:'Send instruction'})));
  const submitted=f.nativeMessages().filter(m=>m.role==='user').at(-1);
  const history={messages:[human,submitted],pending:[],execution:{requestId:'boundary-request',runId:'boundary-run',state:'settled',outcome:'failed'}};
  if(boundary==='unknown')history.execution={requestId:'boundary-request',state:'unknown'};
  if(boundary==='missing-user')history.messages=[human];
  if(boundary==='newer-user')history.messages.push({...human,id:'newer-user'});
  if(boundary==='running'||boundary==='approval')history.execution={requestId:'boundary-request',runId:'boundary-run',state:'running'};
  if(boundary==='approval')history.pending=[{runId:'boundary-run',toolCallId:'approval-call',toolName:'video_pilot_launch',kind:'approval',summary:'Current approval'}];
  f.setHistory(history);
  await act(async()=>{stream.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'error',errorText:'AGENT_FAILED'})+'\n\n'));stream.close();await f.nativeSend();});
  if(['unknown','missing-user','newer-user'].includes(boundary))expect(within(document.body).getByRole('button',{name:'Send instruction'}).closest('fieldset').disabled).toBe(true);
  if(boundary==='running')expect(document.querySelector('[data-composer-busy]').getAttribute('data-composer-busy')).toBe('true');
  expect(document.body.textContent).not.toContain(words.error.checkedFailed);
  expect(document.body.textContent).not.toContain(words.error.checkedFailedWithReply);
  expect(f.sendMessage).toHaveBeenCalledTimes(1);expect(f.regenerate).not.toHaveBeenCalled();
  expect(f.calls.filter(call=>call.method==='POST').map(call=>call.url)).toEqual(['/agent/chat']);
});

test('a reloaded failed task shows the retained provider category without retrying inference', async () => {
  const execution={requestId:'failed-native',state:'settled',outcome:'failed',errorCode:'AI_PROVIDER_PAYMENT_REQUIRED'};
  const history=readThreadHistory({messages:[human],pending:[],execution});
  expect(history.execution.errorCode).toBe('AI_PROVIDER_PAYMENT_REQUIRED');
  const f=fixture({initialMessages:[human],initialExecution:history.execution,historyResult:{messages:[human],pending:[],execution}});
  await act(async()=>render(h(f.Component,f.props)));
  expect(document.body.textContent).toContain(words.error.codes.AI_PROVIDER_PAYMENT_REQUIRED.what);
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.resumeStream).not.toHaveBeenCalled();
});

const retainedCore = { type: 'tool-piece_core_rebuild', toolCallId: 'retained-core-call', title: 'Пересобрать суть', state: 'output-available', input: {},
  output: { ok: true, card: { kind: 'piece', id: 'retained-current-piece', title: 'Сохранённая суть', questions: 0 } } };
const invalidAdaptation = { type: 'tool-piece_adapt', toolCallId: 'invalid-adaptation-call', title: 'Адаптировать текст', state: 'output-available', input: {},
  output: { ok: false, code: 'CAPABILITY_INPUT_INVALID', reason: 'Select a channel for this adaptation.' } };
const uncertainVideo = { type: 'tool-video_prepare', toolCallId: 'uncertain-video-call', title: 'Подготовить видео', state: 'output-available', input: {},
  output: { ok: false, code: 'CAPABILITY_OUTCOME_UNCERTAIN' } };

test.each([['MATERIAL_FORMAT_REQUIRED', 'campaign_create', 'question'], ['MATERIAL_FORMAT_REQUIRED', 'campaign_create', 'success'],
  ['CAPABILITY_INPUT_INVALID', 'campaign_plan_materials', 'success']])('a server-marked %s refusal becomes a neutral input recovery after %s (%s)', async (code, tool, followup) => {
  const refused = { type: `tool-${tool}`, toolCallId: 'correctable-input-call', title: 'Подготовить материалы', state: 'output-available', input: tool === 'campaign_plan_materials' ? { campaignId: 'current-campaign' } : {},
    output: { ok: false, code, canReviseInput: true } };
  const call = { runId: 'format-question-run', toolCallId: 'format-question-call', toolName: 'ask_user' };
  const question = { cardId: 'format-question-card', question: 'Какой формат использовать?', options: [{ label: 'Пост' }] };
  const next = followup === 'question' ? { type: 'tool-ask_user', toolCallId: call.toolCallId, state: 'input-available', input: { question: question.question } }
    : { ...refused, toolCallId: 'corrected-input-call', output: { ok: true } };
  const message = { id: 'correctable-input-message', role: 'assistant', parts: [refused, next] };
  const before = JSON.stringify(message);
  const pending = followup === 'question' ? [{ ...call, kind: 'question', suspendPayload: question }] : [];
  const execution = followup === 'question' ? { requestId: 'format-owner', runId: call.runId, state: 'running' }
    : { requestId: 'format-owner', state: 'settled', outcome: 'completed' };
  const f = fixture({ initialMessages: [human, message], initialExecution: execution, pending });
  if (code === 'CAPABILITY_INPUT_INVALID') f.setError(new Error('CAPABILITY_INPUT_INVALID'));
  await act(async () => render(h(f.Component, f.props)));
  await waitFor(() => expect(document.body.textContent).toContain(followup === 'question' ? words.error.inputClarification : words.error.inputRecovered));
  expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
  if (followup === 'question') expect(within(document.body).getByRole('button', { name: 'Пост' }).disabled).toBe(false);
  const blocks = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts').readMessageBlocks(message, pending);
  expect(blocks.find(block => block.type === 'error').canReviseInput).toBe(true);
  expect(JSON.stringify(message)).toBe(before);
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test.each(['unresolved', 'uncertain', 'auth', 'unknown', 'unmarked'])('input recovery does not neutralize an %s failure', async mode => {
  const code = mode === 'uncertain' ? 'CAPABILITY_OUTCOME_UNCERTAIN' : mode === 'auth' ? 'PERMISSION_DENIED'
    : mode === 'unknown' ? 'UNKNOWN_NATIVE_FAILURE' : 'MATERIAL_FORMAT_REQUIRED';
  const refused = { type: 'tool-campaign_create', toolCallId: 'retained-refusal-call', title: 'Подготовить материалы', state: 'output-available', input: {},
    output: { ok: false, code, ...(mode === 'unmarked' ? {} : { canReviseInput: true }) } };
  const parts = mode === 'unresolved' ? [refused] : [refused, { ...refused, toolCallId: 'later-success-call', output: { ok: true } }];
  const f = fixture({ initialMessages: [human, { id: 'retained-refusal-message', role: 'assistant', parts }],
    initialExecution: { requestId: 'retained-refusal-owner', state: 'settled', outcome: mode === 'unresolved' ? 'failed' : 'completed' } });
  await act(async () => render(h(f.Component, f.props)));
  expect(document.querySelector('[data-agent-card="error"]')).not.toBeNull();
});

test.each(['same-campaign', 'different-campaign', 'unresolved'])('legacy campaign planning input failure is neutral only after actual same-campaign success (%s)', async mode => {
  const refused = { type: 'tool-campaign_plan_materials', toolCallId: 'legacy-plan-failed', title: 'Темы и длина материалов', state: 'output-available',
    input: { campaignId: 'original-campaign' }, output: { ok: false, code: 'CAPABILITY_INPUT_INVALID', reason: 'Invalid planning input' } };
  const success = { ...refused, toolCallId: 'legacy-plan-corrected', input: { campaignId: mode === 'different-campaign' ? 'other-campaign' : 'original-campaign' },
    output: { ok: true, capability: 'campaign.plan_materials', summary: {}, card: { kind: 'campaign', id: 'original-campaign' } } };
  const message = { id: 'legacy-plan-message', role: 'assistant', parts: mode === 'unresolved' ? [refused] : [refused, success] };
  const before = JSON.stringify(message);
  const f = fixture({ initialMessages: [human, message], initialExecution: { requestId: 'legacy-plan-owner', state: 'settled', outcome: mode === 'unresolved' ? 'failed' : 'completed' } });
  await act(async () => render(h(f.Component, f.props)));
  if (mode === 'same-campaign') {
    await waitFor(() => expect(document.body.textContent).toContain(words.error.inputRecovered));
    expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
  } else expect(document.querySelector('[data-agent-card="error"]')).not.toBeNull();
  expect(JSON.stringify(message)).toBe(before);
  expect(refused.output.canReviseInput).toBeUndefined();
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test('a corrected native ask_user SDK input failure is neutral while the real question remains actionable', async () => {
  const call = { runId: 'corrected-sdk-run', toolCallId: 'corrected-sdk-call', toolName: 'ask_user' };
  const question = { cardId: 'corrected-sdk-card', question: 'Какой формат выбрать?', options: [{ label: 'Пост' }] };
  const message = { id: 'corrected-sdk-message', role: 'assistant', parts: [
    { type: 'tool-ask_user', toolCallId: 'invalid-sdk-call', title: 'Уточнить формат', state: 'output-error', input: {}, errorText: 'Invalid ask_user input: questionPurpose' },
    { type: 'tool-ask_user', toolCallId: call.toolCallId, state: 'input-available', input: { question: question.question } }] };
  const f = fixture({ initialMessages: [human, message], initialExecution: { requestId: 'corrected-sdk-owner', runId: call.runId, state: 'running' },
    pending: [{ ...call, kind: 'question', suspendPayload: question }] });
  await act(async () => render(h(f.Component, f.props)));
  expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
  expect(within(document.body).getByRole('button', { name: 'Пост' }).disabled).toBe(false);
});

test('the native transport passes a checked continuation owner only for its explicit user turn', async () => {
  const seen = [];
  class CaptureTransport {
    constructor(options) { this.options = options; }
    async sendMessages(options) {
      seen.push(await this.options.prepareSendMessagesRequest(options));
      return new ReadableStream({ start(controller) { controller.close(); } });
    }
  }
  const transport = loadWithMocks('apps/frontend/src/components/agents/agent.transport.ts', { ai: { DefaultChatTransport: CaptureTransport } })
    .createAgentTransport({ request: async () => { throw new Error('No network needed'); }, currentThread: () => 'owned-thread', onThread: () => undefined });
  await transport.sendMessages({ trigger: 'submit-message', messages: [human], body: { continueFromRequestId: 'checked-failed-owner' } });
  await transport.sendMessages({ trigger: 'submit-message', messages: [human], body: {} });
  await transport.sendMessages({ trigger: 'submit-message', messages: [human], body: { continueFromRequestId: 'not-a-question-owner',
    resume: { runId: 'question-run', toolCallId: 'question-call', cardId: 'question-card', resumeData: { answer: 'Пост' } } } });
  await transport.sendMessages({ trigger: 'submit-message', messages: [{ id: 'assistant-approval', role: 'assistant', parts: [] }], body: { continueFromRequestId: 'not-an-approval-owner' } });
  expect(seen[0].body.continueFromRequestId).toBe('checked-failed-owner');
  expect(seen.slice(1).every(request => request.body.continueFromRequestId === undefined)).toBe(true);
});

test('Continue checks the same failed owner then sends only unfinished work once while preserving the composer draft', async () => {
  const messages = [human, { id: 'paused-saved-owner', role: 'assistant', parts: [retainedCore, invalidAdaptation] }];
  const execution = { requestId: 'paused-saved-request', state: 'settled', outcome: 'failed' };
  const f = fixture({ initialMessages: messages, initialExecution: execution, composerDraft: 'Несохранённый текст', historyResult: { messages, pending: [], execution } });
  await act(async () => render(h(f.Component, f.props)));
  const button = within(document.body).getByRole('button', { name: 'Продолжить' });
  await act(async () => { fireEvent.click(button); fireEvent.click(button); });
  expect(f.calls.filter(call => call.url === '/agent/threads/thread-native')).toHaveLength(1);
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.sendMessage.mock.calls[0][0]).toEqual({ text: words.error.continueMessage, files: [] });
  expect(f.sendMessage.mock.calls[0][1].body.continueFromRequestId).toBe(execution.requestId);
  expect(f.sendMessage.mock.calls[0][0].text).toContain('не повторяй завершённые действия');
  expect(within(document.body).getByRole('textbox', { name: 'Unsent message' }).value).toBe('Несохранённый текст');
  expect(f.regenerate).not.toHaveBeenCalled();
});

test('an uncertain saved effect uses Check result and never sends a continuation', async () => {
  const messages = [human, { id: 'uncertain-saved-owner', role: 'assistant', parts: [retainedCore, uncertainVideo] }];
  const execution = { requestId: 'uncertain-saved-request', state: 'settled', outcome: 'failed' };
  const f = fixture({ initialMessages: messages, initialExecution: execution, historyResult: { messages, pending: [], execution } });
  await act(async () => render(h(f.Component, f.props)));
  expect(within(document.body).queryByRole('button', { name: 'Продолжить' })).toBeNull();
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Проверить результат' })));
  expect(f.calls.filter(call => call.url === '/agent/threads/thread-native')).toHaveLength(1);
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.regenerate).not.toHaveBeenCalled();
});

test.each(['running', 'question', 'changed-owner', 'newer-user', 'new-uncertainty'])('Continue rereads fresh %s state instead of issuing another request', async mode => {
  const message = { id: 'fresh-state-owner', role: 'assistant', parts: [retainedCore, invalidAdaptation] };
  const execution = { requestId: 'fresh-state-request', state: 'settled', outcome: 'failed' };
  const current = { messages: [human, message], pending: [], execution: { ...execution } };
  if (mode === 'running') current.execution = { ...execution, state: 'running', runId: 'existing-live-run' };
  if (mode === 'changed-owner') current.execution.requestId = 'newer-owner-request';
  if (mode === 'newer-user') current.messages.push({ ...human, id: 'newer-user-request' });
  if (mode === 'new-uncertainty') current.messages = [human, { ...message, parts: [...message.parts, uncertainVideo] }];
  if (mode === 'question') {
    const call = { runId: 'existing-question-run', toolCallId: 'existing-question-call', toolName: 'ask_user' };
    const question = { cardId: 'existing-question-card', question: 'Как продолжить?', options: [{ label: 'Сохранённый результат' }] };
    current.pending = [{ ...call, kind: 'question', suspendPayload: question }];
    current.messages = [human, { ...message, parts: [...message.parts, { type: 'tool-ask_user', toolCallId: call.toolCallId,
      state: 'input-available', input: { question: question.question } }] }];
  }
  const f = fixture({ initialMessages: [human, message], initialExecution: execution, historyResult: current });
  await act(async () => render(h(f.Component, f.props)));
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Продолжить' })));
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.regenerate).not.toHaveBeenCalled();
  if (mode === 'running') expect(f.resumeStream).toHaveBeenCalledTimes(1);
  if (mode === 'question') expect(within(document.body).getByRole('button', { name: 'Сохранённый результат' }).disabled).toBe(false);
  if (mode === 'new-uncertainty') expect(within(document.body).getByRole('button', { name: 'Проверить результат' })).toBeTruthy();
});

test('known video preparation validation failures explain the unsaved draft without claiming an unspent action', () => {
  const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
  for (const locale of ['ru', 'en']) {
    for (const code of ['VIDEO_PREPARATION_EMPTY', 'VIDEO_PROMPT_EMPTY', 'VIDEO_REQUIRED_NUMBER_MISSING', 'VIDEO_UNSUPPORTED_NUMBER', 'VIDEO_REQUIRED_NEGATION_MISSING']) {
      const explanation = copy.errorWordsFor(copy.agentCopy[locale], code, true);
      expect(explanation.known).toBe(true);
      expect(explanation.what).toContain(locale === 'ru' ? 'Видеочерновик не сохранён' : 'video draft was not saved');
      expect(explanation.next).toContain(locale === 'ru' ? 'исправить' : 'corrected');
      expect(explanation.what + explanation.next).not.toMatch(/не выполнялось|не выполнено|не спис|бесплат|did not run|not done|not charged|unspent|free/i);
    }
  }
});

test.each([undefined, 'AGENT_TASK_OPERATION_FAILED'])('a failed saved owner explains its current uncertain action and retained result without replay (receipt code: %s)', async errorCode => {
  const messages = [human, { id: 'current-operation-failure', role: 'assistant', parts: [retainedCore, invalidAdaptation, uncertainVideo] }];
  const execution = { requestId: 'failed-operation-owner', state: 'settled', outcome: 'failed', ...(errorCode ? { errorCode } : {}) };
  const f = fixture({ initialMessages: messages, initialExecution: execution, historyResult: { messages, pending: [], execution } });
  await act(async () => render(h(f.Component, f.props)));
  expect(within(document.body).getByText('Сохранённая суть')).toBeTruthy();
  const errors = document.querySelectorAll('[data-agent-card="error"]');
  const finalError = within(errors[errors.length - 1]);
  expect(finalError.getByText(words.error.codes.CAPABILITY_OUTCOME_UNCERTAIN.what)).toBeTruthy();
  expect(finalError.getByText(words.error.savedResultsNext)).toBeTruthy();
  expect(finalError.queryByRole('button', { name: words.error.retry })).toBeNull();
  await act(async () => fireEvent.click(finalError.getByRole('button', { name: 'Проверить результат' })));
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.regenerate).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
});

test('a terminal owner without a code does not inherit an earlier turn error or stale SDK exception', async () => {
  const earlier = { id: 'earlier-provider-timeout', role: 'assistant', parts: [{ type: 'error', error: { name: 'NonReplayableTextAttempt', message: 'Request timed out.' } }] };
  const messages = [human, earlier, { ...human, id: 'new-operation-request' }, { id: 'new-operation-result', role: 'assistant', parts: [retainedCore] }];
  const execution = { requestId: 'new-operation-owner', state: 'settled', outcome: 'failed' };
  const f = fixture({ initialMessages: messages, initialExecution: execution });
  f.setError(new Error('Request timed out.'));
  await act(async () => render(h(f.Component, f.props)));
  expect(within(document.body).getByText(words.error.codes.AGENT_TASK_OPERATION_FAILED.what)).toBeTruthy();
  expect(within(document.body).queryByText(words.researchRecovery.timeout)).toBeNull();
  expect(within(document.body).getByRole('button', { name: 'Продолжить' })).toBeTruthy();
  expect(f.regenerate).not.toHaveBeenCalled();
});

test('refresh reports checking and the unchanged failed status with its saved answer in the clicked card without replay', async () => {
  const messages = [human, { id: 'saved-final-answer', role: 'assistant', parts: [retainedCore, { type: 'text', text: 'Сохранённый итог работы.' }, uncertainVideo] }];
  const execution = { requestId: 'saved-final-failed-owner', state: 'settled', outcome: 'failed' };
  let release;
  const historyResult = new Promise(resolve => { release = resolve; });
  const f = fixture({ initialMessages: messages, initialExecution: execution, historyResult });
  await act(async () => render(h(f.Component, f.props)));
  const errorCards = document.querySelectorAll('[data-agent-card="error"]');
  const card = errorCards[errorCards.length - 1], button = within(card).getByRole('button', { name: 'Проверить результат' });
  await act(async () => fireEvent.click(button));
  expect(within(card).getByText(words.error.checkingStatus)).toBeTruthy();
  await act(async () => fireEvent.click(button));
  expect(f.calls.filter(call => call.url === '/agent/threads/thread-native')).toHaveLength(1);
  await act(async () => release({ messages, pending: [], execution }));
  expect(within(card).getByText(words.error.checkedFailedWithReply)).toBeTruthy();
  expect(within(card).getByText(words.error.codes.CAPABILITY_OUTCOME_UNCERTAIN.what)).toBeTruthy();
  expect(within(document.body).getByText('Сохранённый итог работы.')).toBeTruthy();
  expect(within(document.body).getByText('Сохранённая суть')).toBeTruthy();
  await act(async () => fireEvent.click(button));
  expect(f.calls.filter(call => call.url === '/agent/threads/thread-native')).toHaveLength(2);
  expect(within(card).getByText(words.error.checkedFailedWithReply)).toBeTruthy();
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.regenerate).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
});

test('Continue checks and points to a newly restored native question without answering it or resending the original request', async () => {
  const call = { runId: 'refreshed-question-run', toolCallId: 'refreshed-question-call', toolName: 'ask_user' };
  const question = { cardId: 'refreshed-question-card', question: 'Какой результат продолжить?', options: [{ label: 'Сохранённый материал' }] };
  const saved = { id: 'refreshed-question-message', role: 'assistant', parts: [{ type: 'tool-ask_user', toolCallId: call.toolCallId,
    state: 'input-available', input: { question: question.question } }] };
  const execution = { requestId: 'refreshed-question-owner', state: 'settled', outcome: 'failed' };
  const f = fixture({ initialMessages: [human], initialExecution: execution,
    historyResult: { messages: [human, saved], pending: [{ ...call, kind: 'question', suspendPayload: question }], execution } });
  await act(async () => render(h(f.Component, f.props)));
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Продолжить' })));
  expect(within(document.body).getByText(words.error.checkedWaiting)).toBeTruthy();
  expect(within(document.body).getByRole('button', { name: 'Сохранённый материал' }).disabled).toBe(false);
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.regenerate).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
});

test('an invalid action followed by a real native clarification keeps that current question actionable', async () => {
  const call = { runId: 'revise-input-run', toolCallId: 'revise-input-call', toolName: 'ask_user' };
  const question = { cardId: 'revise-input-card', question: 'Какой канал использовать?', options: [{ label: 'Выбранный канал' }] };
  const messages = [human, { id: 'revise-input-message', role: 'assistant', parts: [invalidAdaptation,
    { type: 'tool-ask_user', toolCallId: call.toolCallId, state: 'input-available', input: { question: question.question } }] }];
  const f = fixture({ initialMessages: messages, initialExecution: { requestId: 'revise-input-owner', state: 'settled', outcome: 'failed' },
    pending: [{ ...call, kind: 'question', suspendPayload: question, summary: null }] });
  await act(async () => render(h(f.Component, f.props)));
  const choice = within(document.body).getByRole('button', { name: 'Выбранный канал' });
  expect(choice.disabled).toBe(false);
  await act(async () => fireEvent.click(choice));
  expect(f.sendMessage).toHaveBeenCalledWith(undefined, { body: { resume: {
    runId: call.runId, toolCallId: call.toolCallId, cardId: question.cardId, resumeData: { answer: 'Выбранный канал' },
  } } });
});

test('multiple native task_write and task_update parts in one failed owner display every active task as interrupted', async () => {
  const tasks = [{ content: 'Собрать материал', status: 'completed' }, { content: 'Адаптировать текст', activeForm: 'Адаптирую текст', status: 'in_progress' },
    { content: 'Подготовить видео', activeForm: 'Готовлю видео', status: 'in_progress' }, { content: 'Согласовать результат', status: 'pending' }];
  const planParts = ['task_write', 'task_update'].map((name, index) => ({ type: `tool-${name}`, toolCallId: `current-tasks-${index}`,
    state: 'output-available', input: { tasks: index ? tasks : tasks.map(task => ({ ...task, status: 'pending' })) }, output: { ok: true } }));
  const message = { id: 'failed-multiple-task-parts', role: 'assistant', parts: [...planParts, retainedCore, invalidAdaptation, uncertainVideo] };
  const before = JSON.stringify(message);
  const f = fixture({ initialMessages: [human, message], initialExecution: { requestId: 'failed-multiple-task-owner', state: 'settled', outcome: 'failed' } });
  await act(async () => render(h(f.Component, f.props)));
  const card = document.querySelector('[data-agent-card="tasks"]');
  expect(card.querySelectorAll('[data-agent-task-status="interrupted"]')).toHaveLength(2);
  expect(card.querySelector('[data-agent-task-status="in_progress"]')).toBeNull();
  expect(card.querySelectorAll('[data-agent-task-status="completed"]')).toHaveLength(1);
  expect(card.querySelectorAll('[data-agent-task-status="pending"]')).toHaveLength(1);
  expect(JSON.stringify(message)).toBe(before);
});

test('a failed current owner interrupts only the most recent persisted plan even when that plan belongs to an earlier assistant message', async () => {
  const olderPlan = { id: 'historical-plan-message', role: 'assistant', parts: [{ type: 'data-tasks', data: { tasks: [
    { content: 'Исторический шаг', status: 'in_progress' }, { content: 'Исторический результат', status: 'completed' },
  ] } }] };
  const currentPlan = { id: 'retained-plan-message', role: 'assistant', parts: [{ type: 'data-tasks', data: { tasks: [
    { content: 'Собрать исходный материал', status: 'completed' }, { content: 'Адаптировать материал', status: 'in_progress' },
    { content: 'Подготовить видео', status: 'in_progress' }, { content: 'Согласовать', status: 'pending' },
  ] } }] };
  const messages = [human, olderPlan, currentPlan, { ...human, id: 'current-followup-request' },
    { id: 'current-followup-failure', role: 'assistant', parts: [retainedCore, invalidAdaptation, uncertainVideo] }];
  const before = JSON.stringify(messages);
  const f = fixture({ initialMessages: messages, initialExecution: { requestId: 'current-followup-owner', state: 'settled', outcome: 'failed' } });
  await act(async () => render(h(f.Component, f.props)));
  const plans = document.querySelectorAll('[data-agent-card="tasks"]');
  expect(plans).toHaveLength(2);
  expect(plans[0].querySelector('[data-agent-task-status="interrupted"]')).toBeNull();
  expect(plans[0].querySelector('[data-agent-task-status="in_progress"]')).not.toBeNull();
  expect(plans[0].querySelector('[data-agent-task-status="completed"]')).not.toBeNull();
  expect(plans[1].querySelectorAll('[data-agent-task-status="interrupted"]')).toHaveLength(2);
  expect(plans[1].querySelector('[data-agent-task-status="in_progress"]')).toBeNull();
  expect(plans[1].querySelector('[data-agent-task-status="completed"]')).not.toBeNull();
  expect(plans[1].querySelector('[data-agent-task-status="pending"]')).not.toBeNull();
  expect(JSON.stringify(messages)).toBe(before);
});

const savedResearchPart = { type: 'tool-piece_create', toolCallId: 'saved-research-call', title: 'Написать черновик', state: 'output-available', input: {},
  output: { ok: true, capability: 'piece.create', summary: { outcome: 'research-ready', snapshotKey: 'snapshot-retained-test', waitingOnCard: 0 } } };
const savedResearchMessage = { id: 'research-result-message', role: 'assistant', parts: [savedResearchPart,
  ...Array.from({ length: 8 }, (_, index) => ({ ...completedStep(`retained-read-${index}`, 'Прочитать сохранённый источник'), type: 'tool-piece_read' })),
  { type: 'error', error: { name: 'NonReplayableTextAttempt', message: 'Request timed out.' } }] };
const savedResearchFailure = { requestId: 'research-failed-owner', state: 'settled', outcome: 'failed', errorCode: 'AGENT_FAILED' };

test('a failed native draft continues once on click through the existing send path while preserving the unsent message and context', async () => {
  const messages = [human, savedResearchMessage];
  const f = fixture({ initialMessages: messages, initialExecution: savedResearchFailure, composerDraft: 'Мой несохранённый текст',
    historyResult: { messages, pending: [], execution: savedResearchFailure } });
  const workContext = { version: 'assistant-work-context/v1', kind: 'piece', id: 'context-piece', revision: 'retained-context-v1' };
  const writingSelection = { channelId: 'current-channel', avatarId: 'current-avatar' };
  await act(async () => render(h(f.Component, { ...f.props, workContext, writingSelection })));
  const body = within(document.body);
  expect(body.getByText(words.researchRecovery.saved)).toBeTruthy();
  expect(body.queryByText('Готово: Написать черновик')).toBeNull();
  expect(body.getByText(words.researchRecovery.next)).toBeTruthy();
  expect(body.getByText(words.researchRecovery.timeout)).toBeTruthy();
  expect(body.queryByRole('button', { name: words.error.retry })).toBeNull();
  const continueButton = body.getByRole('button', { name: 'Продолжить' });
  await act(async () => { fireEvent.click(continueButton); fireEvent.click(continueButton); });
  const continuation = words.researchRecovery.message('snapshot-retained-test');
  expect(continuation).toContain('без нового поиска.');
  expect(continuation).not.toContain('piece.create');
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.sendMessage).toHaveBeenCalledWith({ text: continuation, files: [] }, { body: { workContext, writingSelection, continueFromRequestId: savedResearchFailure.requestId } });
  expect(body.getByRole('textbox', { name: 'Unsent message' }).value).toBe('Мой несохранённый текст');
  expect(document.querySelector('[data-composer-recovery]')).toBeNull();
  expect(f.regenerate).not.toHaveBeenCalled();
  expect(f.resumeStream).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
});

test('a stale continuation click cannot follow a newer authored send before a rerender', async () => {
  const f = fixture({ initialMessages: [human, savedResearchMessage], initialExecution: savedResearchFailure });
  await act(async () => render(h(f.Component, f.props)));
  const body = within(document.body), continueButton = body.getByRole('button', { name: 'Продолжить' });
  await act(async () => {
    fireEvent.click(body.getByRole('button', { name: 'Send instruction' }));
    fireEvent.click(continueButton);
  });
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.sendMessage.mock.calls[0][0].text).toBe('Дополнительное указание');
});

test('an active native turn does not offer or send a research continuation', async () => {
  const f = fixture({ status: 'streaming', initialMessages: [human, savedResearchMessage], initialExecution: { ...savedResearchFailure, state: 'running' } });
  f.setError(new Error('AGENT_FAILED'));
  await act(async () => render(h(f.Component, f.props)));
  expect(within(document.body).queryByRole('button', { name: 'Продолжить' })).toBeNull();
  expect(within(document.body).queryByRole('button', { name: words.error.retry })).toBeNull();
  expect(f.sendMessage).not.toHaveBeenCalled();
});

test('only the latest native error shape identifies a timeout, never user text or old errors', () => {
  expect(nativeTurnTimedOut([human, savedResearchMessage])).toBe(true);
  expect(nativeTurnTimedOut([human, savedResearchMessage, { ...human, id: 'later-request' }])).toBe(false);
  expect(nativeTurnTimedOut([human, { ...savedResearchMessage, role: 'user' }])).toBe(false);
  expect(nativeTurnTimedOut([human, { ...savedResearchMessage, parts: [{ type: 'text', text: 'NonReplayableTextAttempt: Request timed out.' }] }])).toBe(false);
});

test.each(['newer-user', 'multiple', 'unsafe-id', 'user-tool', 'created-draft', 'uncertain-write', 'failed-write', 'second-create', 'running', 'pending', 'missing-owner'])('retained research continuation rejects the %s boundary', kind => {
  let messages = [human, structuredClone(savedResearchMessage)], execution = savedResearchFailure, pending = [];
  if (kind === 'newer-user') messages.push({ ...human, id: 'newer-authored-request' });
  if (kind === 'multiple') messages[1].parts.push({ ...savedResearchPart, toolCallId: 'other-research-call', output: { ...savedResearchPart.output,
    summary: { ...savedResearchPart.output.summary, snapshotKey: 'another-retained-snapshot' } } });
  if (kind === 'unsafe-id') messages[1].parts[0].output.summary.snapshotKey = 'snapshot\nStart new paid research';
  if (kind === 'user-tool') messages[1].role = 'user';
  if (kind === 'created-draft') messages[1].parts.push({ ...savedResearchPart, type: 'tool-piece_create_from-research', toolCallId: 'saved-draft-call',
    output: { ok: true, summary: { outcome: 'created', pieceId: 'saved-draft-test' } } });
  if (['uncertain-write', 'failed-write', 'second-create'].includes(kind)) messages[1].parts.push({ type: kind === 'second-create' ? 'tool-piece_create' : 'tool-piece_create_from-research',
    toolCallId: 'uncertain-draft-call', title: 'Написать черновик', input: {}, state: kind === 'failed-write' ? 'output-error' : 'input-available', errorText: 'AGENT_FAILED' });
  if (kind === 'running') execution = { requestId: 'still-running-research', state: 'running' };
  if (kind === 'pending') pending = [draftReviewPending];
  if (kind === 'missing-owner') execution = { ...execution, requestId: null };
  expect(savedResearchContinuation(messages, execution, pending)).toBeNull();
});

test('a reloaded uncertain terminal owner offers result checking instead of regenerating its original request', async () => {
  const messages = [human, { id: 'reloaded-uncertain-owner', role: 'assistant', parts: [uncertainVideo] }];
  const f = fixture({ initialMessages: messages, initialExecution: savedResearchFailure,
    historyResult: { messages, pending: [], execution: savedResearchFailure } });
  await act(async () => render(h(f.Component, f.props)));
  expect(within(document.body).queryByRole('button', { name: words.error.retry })).toBeNull();
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Проверить результат' })));
  expect(f.regenerate).not.toHaveBeenCalled();
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(0);
});

test.each([false, true])('a failed latest owner displays its unfinished task as interrupted only without a pending gate (%s)', async hasPending => {
  const tasks = [
    { content: 'Собрать источники', status: 'completed' },
    { content: 'Написать черновик', activeForm: 'Пишу черновик', status: 'in_progress' },
    { content: 'Согласовать текст', status: 'pending' },
  ];
  const message = { ...savedResearchMessage, parts: [{ type: 'data-tasks', data: { tasks } }, ...savedResearchMessage.parts] };
  const before = JSON.stringify(message);
  const f = fixture({ initialMessages: [human, message], initialExecution: savedResearchFailure, pending: hasPending ? [draftReviewPending] : [] });
  await act(async () => render(h(f.Component, f.props)));
  const taskCard = document.querySelector('[data-agent-card="tasks"]');
  expect(within(taskCard).getByText(hasPending ? 'Пишу черновик' : 'Написать черновик')).toBeTruthy();
  expect(within(taskCard).getByText(hasPending ? words.tasks.statuses.in_progress : words.tasks.interrupted)).toBeTruthy();
  expect(taskCard.querySelector('[data-agent-task-status="pending"]')).not.toBeNull();
  expect(taskCard.querySelector('[data-agent-task-status="completed"]')).not.toBeNull();
  expect(JSON.stringify(message)).toBe(before);
});

test('a research-ready outcome without a retained snapshot never claims that research or a draft was saved', async () => {
  const part = structuredClone(savedResearchPart);
  part.output.summary.snapshotKey = null;
  const messages = [human, { ...savedResearchMessage, parts: [part] }];
  const f = fixture({ initialMessages: messages, initialExecution: savedResearchFailure,
    historyResult: { messages, pending: [], execution: savedResearchFailure } });
  await act(async () => render(h(f.Component, f.props)));
  expect(within(document.body).getByText(words.researchRecovery.ready)).toBeTruthy();
  expect(within(document.body).queryByText(words.researchRecovery.saved)).toBeNull();
  expect(within(document.body).queryByText('Готово: Написать черновик')).toBeNull();
  const button = within(document.body).getByRole('button', { name: words.researchRecovery.prepare });
  await act(async () => fireEvent.click(button));
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.sendMessage.mock.calls[0][0]).toEqual({ text: words.error.continueMessage, files: [] });
  expect(f.sendMessage.mock.calls[0][1].body.continueFromRequestId).toBe(savedResearchFailure.requestId);
});

const refusedSource = (id, code = 'REMOTE_4XX', input = { url: 'https://source.example/article' }) => ({
  type: 'tool-piece_read', title: 'Read source', toolCallId: id, input, state: 'output-available',
  output: { ok: false, code, reason: 'Source rejected the request (HTTP 403)' },
});
test('source attempt failures stay in collapsed progress while evidence gaps and terminal errors remain visible', async () => {
  const message = { id: 'source-attempts', role: 'assistant', parts: [
    refusedSource('remote'), completedStep('retained', 'Read saved material'),
    refusedSource('cache', 'MATERIAL_NOT_AVAILABLE', { researchId: 'retained', part: 'research_source' }),
    completedStep('more', 'Read more available material'), { type: 'text', text: 'The requested coverage still has an evidence gap.' },
    { type: 'tool-piece_create', title: 'Write draft', toolCallId: 'denied-write', state: 'output-available', input: {}, output: { ok: false, code: 'PERMISSION_DENIED' } },
  ] };
  const before = JSON.stringify(message), f = fixture({ initialMessages: [human, message] });
  render(h(f.Component, f.props));
  const attempts = [...document.querySelectorAll('[data-agent-source-issue]')];
  expect(attempts).toHaveLength(2);expect(attempts.every(node => node.closest('[hidden]'))).toBe(true);
  expect(within(document.body).getByText('The requested coverage still has an evidence gap.').closest('[hidden]')).toBeNull();
  expect(document.querySelector('[data-agent-card="error"]').closest('[hidden]')).toBeNull();
  fireEvent.click(within(document.body).getByRole('button', { name: /Read more available material/ }));
  expect(attempts.every(node => !node.closest('[hidden]'))).toBe(true);
  expect(JSON.stringify(message)).toBe(before);expect(f.sendMessage).not.toHaveBeenCalled();
});
test('an isolated source failure has a neutral activity summary without claiming successful recovery', () => {
  const f = fixture({ initialMessages: [human, { id: 'single-source-refusal', role: 'assistant', parts: [refusedSource('only')] }] });
  render(h(f.Component, f.props));
  expect(within(document.body).getByRole('button', { name: 'Source activity' })).toBeTruthy();
  expect(document.querySelector('[data-agent-source-issue]').closest('[hidden]')).not.toBeNull();
  expect(within(document.body).queryByText(words.card.done + ': Read source')).toBeNull();
  expect(f.sendMessage).not.toHaveBeenCalled();
});


const draftKey = 'cf-assistant-draft/v1:recovery-org:recovery-user:thread-native';
const pendingInstruction = { id: 'actual-sdk-submission-id', role: 'user', parts: [{ type: 'text', text: 'Дополнительное указание' }] };
const oldFailed = { messages: [human], pending: [], execution: { requestId: 'old-task', state: 'settled', outcome: 'failed', errorCode: 'AGENT_FAILED' } };
async function failedSubmission(f, view) {
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Send instruction' })));
  await act(async () => {
    f.transport().onUserMessage(pendingInstruction);
    f.setMessages([human, pendingInstruction]);
    f.transport().onRequestFailure({ status: 503, code: 'AGENT_FAILED', notStarted: false });
    f.setError(new Error('AGENT_FAILED'));
    f.setStatus('error');
    view.rerender(h(f.Component, { ...f.props, draftStorageKey: draftKey }));
  });
  await act(async () => {
    f.config().onError(new Error('AGENT_FAILED'));
    f.config().onFinish({ isAbort: false, isError: true, isDisconnect: false });
  });
}
async function refreshStatus() {
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Refresh status' })));
}

test('failed submission keeps its native user ID and restores absent text instead of silently showing old history', async () => {
  const f = fixture({ initialMessages: [human], historyResult: oldFailed });
  const view = render(h(f.Component, { ...f.props, draftStorageKey: draftKey }));
  await failedSubmission(f, view);
  expect(JSON.parse(window.sessionStorage.getItem(draftKey + ':submission')).id).toBe(pendingInstruction.id);
  await refreshStatus();
  const body = within(document.body);
  expect(body.getAllByText('Дополнительное указание')).toHaveLength(2); // bubble and recovered input
  expect(body.getByText(/new message was not found in saved history/)).toBeTruthy();
  expect(body.getByText('HTTP 503 · AGENT_FAILED').closest('[hidden]')).not.toBeNull();
  expect(document.querySelector('[data-composer-recovery="restore"]').textContent).toBe('Дополнительное указание');
  expect(window.sessionStorage.getItem(draftKey)).toBe('Дополнительное указание');
  expect(JSON.parse(window.sessionStorage.getItem(draftKey + ':submission')).id).toBe(pendingInstruction.id);
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.regenerate).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toEqual([]);
});

test.each(['running', 'failed'])('a matching saved message is acknowledged and its %s outcome is explicit', async outcome => {
  const f = fixture({ initialMessages: [human], historyResult: oldFailed });
  const view = render(h(f.Component, { ...f.props, draftStorageKey: draftKey }));
  await failedSubmission(f, view);
  f.setHistory({ messages: [human, pendingInstruction], pending: [], execution: outcome === 'running'
    ? active : { requestId: 'new-task', state: 'settled', outcome: 'failed', errorCode: 'AGENT_FAILED' } });
  await refreshStatus();
  expect(document.querySelector('[data-composer-recovery]')).toBeNull();
  expect(window.sessionStorage.getItem(draftKey + ':submission')).toBeNull();
  expect(within(document.body).getAllByText('Дополнительное указание')).toHaveLength(1);
  expect(within(document.body).getByText(outcome === 'running' ? /still running or waiting/ : words.error.checkedFailed)).toBeTruthy();
  if (outcome === 'failed') expect(within(document.body).getByText(words.error.codes.AGENT_FAILED.what)).toBeTruthy();
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.regenerate).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toEqual([]);
});

test('an unavailable status read retains the pending message, error and draft receipt', async () => {
  const f = fixture({ initialMessages: [human], historyResult: oldFailed });
  const view = render(h(f.Component, { ...f.props, draftStorageKey: draftKey }));
  await failedSubmission(f, view);
  f.setHistory(new Error('controlled read failure'));
  await refreshStatus();
  expect(within(document.body).getByText('Дополнительное указание')).toBeTruthy();
  expect(within(document.body).getByText(/Could not refresh status/)).toBeTruthy();
  expect(within(document.body).getByText(words.error.codes.AGENT_FAILED.what)).toBeTruthy();
  expect(window.sessionStorage.getItem(draftKey + ':submission')).not.toBeNull();
  expect(document.querySelector('[data-composer-recovery]')).toBeNull();
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  expect(f.regenerate).not.toHaveBeenCalled();
});

test.each(['empty', 'newer', 'acknowledged'])('reload recovers only the unacknowledged actor/thread draft (%s)', async mode => {
  window.sessionStorage.setItem(draftKey + ':submission', JSON.stringify({ id: pendingInstruction.id, text: 'Дополнительное указание', attachments: true }));
  if (mode === 'newer') window.sessionStorage.setItem(draftKey, 'Новый несохранённый ввод');
  const history = mode === 'acknowledged' ? { ...oldFailed, messages: [human, pendingInstruction] } : oldFailed;
  const f = fixture({ initialMessages: history.messages, historyResult: history });
  await act(async () => render(h(f.Component, { ...f.props, draftStorageKey: draftKey })));
  const body = within(document.body);
  if (mode === 'empty') {
    expect(window.sessionStorage.getItem(draftKey)).toBe('Дополнительное указание');
    expect(document.querySelector('[data-composer-recovery="restore"]')).not.toBeNull();
    expect(body.getByText(/Attach the files again/)).toBeTruthy();
  } else if (mode === 'newer') {
    expect(window.sessionStorage.getItem(draftKey)).toBe('Новый несохранённый ввод');
    expect(document.querySelector('[data-composer-recovery]')).toBeNull();
    expect(body.getByText(/your newer draft was kept/)).toBeTruthy();
    expect(body.getByText('Дополнительное указание')).toBeTruthy();
  } else {
    expect(window.sessionStorage.getItem(draftKey)).toBeNull();
    expect(window.sessionStorage.getItem(draftKey + ':submission')).toBeNull();
    expect(document.querySelector('[data-composer-recovery]')).toBeNull();
    expect(body.getAllByText('Дополнительное указание')).toHaveLength(1);
    expect(body.getByText(words.error.checkedFailed)).toBeTruthy();
  }
  expect(f.sendMessage).not.toHaveBeenCalled();
  expect(f.regenerate).not.toHaveBeenCalled();
  expect(f.calls.filter(call => call.method === 'POST')).toEqual([]);
});

test('unacknowledged drafts remain actor scoped and ignore malformed or unavailable browser storage', () => {
  const drafts = loadTypeScriptModule('apps/frontend/src/components/agents/agent.submission-draft.ts');
  drafts.writeSubmissionDraft(draftKey, { id: pendingInstruction.id, text: 'private draft' });
  expect(drafts.readSubmissionDraft(draftKey.replace('recovery-user', 'other-user'))).toBeNull();
  drafts.clearSubmissionDraft(draftKey, 'different-newer-id');
  expect(drafts.readSubmissionDraft(draftKey).id).toBe(pendingInstruction.id);
  window.sessionStorage.setItem(draftKey + ':submission', '{broken');
  expect(drafts.readSubmissionDraft(draftKey)).toBeNull();
  const blocked = jest.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
  expect(drafts.writeSubmissionDraft(draftKey, { id: 'x', text: 'text' })).toBe(false);
  expect(drafts.restoreSubmissionDraft(draftKey, { id: 'x', text: 'text' })).toBe(false);
  blocked.mockRestore();
});


test('an old active task cannot acknowledge a new missing message', async () => {
  const f = fixture({ initialMessages: [human], historyResult: oldFailed });
  const view = render(h(f.Component, { ...f.props, draftStorageKey: draftKey }));
  await failedSubmission(f, view);
  f.setHistory({ messages: [human], pending: [], execution: active });
  await refreshStatus();
  expect(within(document.body).getByText(/not yet in saved history/)).toBeTruthy();
  expect(within(document.body).getByText('Дополнительное указание')).toBeTruthy();
  expect(window.sessionStorage.getItem(draftKey + ':submission')).not.toBeNull();
  expect(document.querySelector('fieldset').disabled).toBe(true);
  expect(f.resumeStream).not.toHaveBeenCalled();
  expect(f.regenerate).not.toHaveBeenCalled();
});


test('a late native acknowledgment retires the missing-message retry without deleting the saved user message', async () => {
  const f = fixture({ initialMessages: [human], historyResult: oldFailed });
  const view = render(h(f.Component, { ...f.props, draftStorageKey: draftKey }));
  await failedSubmission(f, view);
  await refreshStatus();
  f.setHistory({ messages: [human, pendingInstruction], pending: [], execution: { requestId: 'late-receipt', state: 'settled', outcome: 'completed' } });
  await act(async () => f.config().onFinish({ isAbort: false, isError: false, isDisconnect: false }));
  expect(window.sessionStorage.getItem(draftKey + ':submission')).toBeNull();
  f.setStatus('ready');
  view.rerender(h(f.Component, { ...f.props, draftStorageKey: draftKey }));
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Send instruction' })));
  expect(f.sendMessage).toHaveBeenCalledTimes(2);
  expect(f.regenerate).not.toHaveBeenCalled();
  expect(within(document.body).getByText('Дополнительное указание', { selector: 'p' })).toBeTruthy();
});
