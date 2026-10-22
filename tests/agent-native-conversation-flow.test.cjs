'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/thread-native' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: dom.window[key] });
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const words = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy.ru;
const h = React.createElement;
afterEach(cleanup);

function fixture({ status = 'ready', initialMessages = [], initialExecution, pending = [], signalResult = { accepted: true, durability: 'native' }, historyResult } = {}) {
  const calls = [];
  let config;
  let transport;
  let updateMessages;
  let storedHistory = historyResult ?? { messages: initialMessages, pending, execution: { requestId: 'logical-native', state: 'settled', outcome: 'completed' } };
  let chatStatus = status;
  const resumeStream = jest.fn(async () => undefined);
  const stop = jest.fn(async () => undefined);
  const sendMessage = jest.fn(async () => undefined);
  const request = async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, status: 200, json: async () => String(url).endsWith('/signals')
      ? (typeof signalResult === 'function' ? signalResult(JSON.parse(init.body)) : signalResult)
      : storedHistory };
  };
  const Component = loadWithMocks('apps/frontend/src/components/agents/agent.conversation.tsx', {
    react: React,
    '@ai-sdk/react': { useChat: options => {
      config = options;
      const [messages, setMessages] = React.useState(options.messages);
      updateMessages = setMessages;
      return { messages, setMessages, status: chatStatus, resumeStream, stop, sendMessage, error: null,
        clearError: () => undefined, regenerate: async () => undefined, addToolApprovalResponse: async () => undefined };
    } },
    swr: { __esModule: true, default: () => ({ data: undefined }), useSWRConfig: () => ({ mutate: async () => undefined }) },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
    '@contentfactory/frontend/components/onboarding/use-onboarding-progress': { useOnboardingProgress: () => ({ answered: false, progress: null }) },
    '@contentfactory/frontend/components/layout/user.context': { useUser: () => ({ role: 'ADMIN' }) },
    '@contentfactory/frontend/components/ui/allowance-hint': { ALLOWANCE_API: '/billing/allowance', AllowanceHint: () => null },
    '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
    './agent.threads': { THREADS_KEY: '/agent/threads' },
    './agent.transport': { isAgentRequestNotStarted: () => false, createAgentTransport: options => { transport = options; return {}; }, screenTimeZone: () => 'Europe/Moscow' },
    './agent.composer': { AgentComposer: ({ onSubmit, onStop, queued }) => h('div', { 'data-queued': queued },
      h('button', { onClick: () => void onSubmit({ text: 'Дополнительное указание', files: [] }) }, 'Send instruction'),
      h('button', { onClick: onStop }, 'Explicit Stop')) },
    './agent.markdown': { AgentMarkdown: ({ text }) => h('p', null, text) },
  }).AgentConversation;
  const props = { threadId: 'thread-native', initialMessages, initialExecution, pending,
    onThreadId: () => undefined, onTitle: () => undefined, onArtifact: () => undefined, openArtifact: null,
    onArtifactRemoved: () => undefined, starter: null, onStarterUsed: () => undefined, words };
  return { Component, props, calls, resumeStream, stop, sendMessage, config: () => config, transport: () => transport, setStatus: value => { chatStatus = value; },
    setMessages: next => updateMessages(next), setHistory: next => { storedHistory = next; } };
}
const human = { id: 'human', role: 'user', parts: [{ type: 'text', text: 'Исходная задача' }] };
const active = { requestId: 'logical-native', runId: 'native-run', state: 'running' };

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
  expect(within(document.body).getByRole('button', { name: 'Check saved result' })).toBeTruthy();
  expect(f.sendMessage).not.toHaveBeenCalled();
  f.setHistory({ messages: [human, final], pending: [], execution: { requestId: active.requestId, state: 'settled', outcome: 'completed' } });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Check saved result' })));
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

test('an uncertain native queue acknowledgement stays unknown after history reload', async () => {
  const f = fixture({ initialMessages: [human] });
  f.props.initialSignalReceipts = [{ id: 'uncertain-input', text: 'Следующее поручение', kind: 'queue', durability: 'native', state: 'unknown' }];
  await act(async () => render(h(f.Component, f.props)));
  expect(document.body.textContent).toContain(words.composer.signalUnknown);
  expect(document.body.textContent).not.toContain(words.composer.signalQueued);
  expect(f.sendMessage).not.toHaveBeenCalled();
});
