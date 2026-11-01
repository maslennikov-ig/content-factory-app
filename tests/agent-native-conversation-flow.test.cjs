'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/thread-native' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: dom.window[key] });
global.self = dom.window;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { readThreadHistory } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const words = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy.ru;
const h = React.createElement;
afterEach(() => { cleanup(); window.sessionStorage.clear(); });

function fixture({ status = 'ready', initialMessages = [], initialExecution, pending = [], signalResult = { accepted: true, durability: 'native' }, historyResult } = {}) {
  const calls = [];
  let config;
  let transport;
  let updateMessages;
  let storedHistory = historyResult ?? { messages: initialMessages, pending, execution: { requestId: 'logical-native', state: 'settled', outcome: 'completed' } };
  let chatStatus = status;
  let chatError = null;
  const resumeStream = jest.fn(async () => undefined);
  const stop = jest.fn(async () => undefined);
  const sendMessage = jest.fn(async () => undefined);
  const regenerate = jest.fn(async () => undefined);
  const request = async (url, init = {}) => {
    calls.push({ url, ...init });
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
      return { messages, setMessages, status: chatStatus, resumeStream, stop, sendMessage, error: chatError,
        clearError: () => { chatError = null; }, regenerate, addToolApprovalResponse: async () => undefined };
    } },
    swr: { __esModule: true, default: () => ({ data: undefined }), useSWRConfig: () => ({ mutate: async () => undefined }) },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
    '@contentfactory/frontend/components/onboarding/use-onboarding-progress': { useOnboardingProgress: () => ({ answered: false, progress: null }) },
    '@contentfactory/frontend/components/layout/user.context': { useUser: () => ({ role: 'ADMIN' }) },
    '@contentfactory/frontend/components/ui/allowance-hint': { ALLOWANCE_API: '/billing/allowance', AllowanceHint: () => null },
    '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
    './agent.threads': { THREADS_KEY: '/agent/threads' },
    './agent.transport': { isAgentRequestNotStarted: () => false, createAgentTransport: options => { transport = options; return {}; }, screenTimeZone: () => 'Europe/Moscow' },
    './agent.composer': { AgentComposer: ({ onSubmit, onStop, queued, recovery }) => h('div', { 'data-queued': queued },
      recovery ? h('output', { 'data-composer-recovery': recovery.kind }, recovery.text) : null,
      h('button', { onClick: () => void onSubmit({ text: 'Дополнительное указание', files: [] }) }, 'Send instruction'),
      h('button', { onClick: onStop }, 'Explicit Stop')) },
    './agent.markdown': { AgentMarkdown: ({ text }) => h('p', null, text) },
  }).AgentConversation;
  const props = { threadId: 'thread-native', initialMessages, initialExecution, pending,
    onThreadId: () => undefined, onTitle: () => undefined, onArtifact: () => undefined, openArtifact: null,
    onArtifactRemoved: () => undefined, starter: null, onStarterUsed: () => undefined, words };
  return { Component, props, calls, resumeStream, stop, sendMessage, regenerate, config: () => config, transport: () => transport, setStatus: value => { chatStatus = value; },
    setMessages: next => updateMessages(next), setHistory: next => { storedHistory = next; }, setError: value => { chatError = value; } };
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

test('a native question suspension supersedes the earlier approval projection for the same call', async () => {
  const call = { runId: 'native-question-run', toolCallId: 'native-question-call', toolName: 'ask_user' };
  const question = { question: 'Какой вывод донести читателю?', canDecideForPerson: true, cardId: 'native-question-card' };
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
    question: 'Какой ответ отправить клиенту?',
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
    question: 'Какой ответ отправить клиенту?',
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
  expect(within(document.body).getByText(outcome === 'running' ? /still running or waiting/ : /task did not complete/)).toBeTruthy();
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
    expect(body.getByText(/task did not complete/)).toBeTruthy();
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
