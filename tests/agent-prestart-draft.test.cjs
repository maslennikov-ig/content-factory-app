'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/new' });
for (const key of ['window','document','navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, act, fireEvent, waitFor } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const words = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentWordsFor('ru');
class ProvenNotStarted extends Error {}
let world;
const h = React.createElement;
const request = async () => ({ ok: false });
const useChat = (options) => {
  const [messages, setMessages] = React.useState(options.messages);
  const [status, setStatus] = React.useState('ready');
  const [error, setError] = React.useState();
  const callbacks = React.useRef(options); callbacks.current = options;
  world.messages = messages;
  const begin = React.useCallback(() => {
    world.requests++;
    setStatus('submitted');
    world.fail = async (failure) => {
      setError(failure); setStatus('error');
      callbacks.current.onError(failure);
      callbacks.current.onFinish({ isAbort: false, isError: true, isDisconnect: false });
    };
    world.finish = async () => {
      setMessages((current) => [...current, { id: 'saved-answer', role: 'assistant', parts: [{ type: 'text', text: 'Saved answer' }] }]);
      setStatus('ready'); callbacks.current.onFinish({ isAbort: false, isError: false, isDisconnect: false });
    };
  }, []);
  const sendMessage = React.useCallback((message) => {
    setMessages((current) => [...current, { id: `user-${world.requests + 1}`, role: 'user', parts: message.parts ?? [{ type: 'text', text: message.text }] }]);
    begin(); return Promise.resolve();
  }, [begin]);
  const regenerate = React.useCallback(() => { world.regenerations++; begin(); return Promise.resolve(); }, [begin]);
  const clearError = React.useCallback(() => { setError(undefined); setStatus('ready'); }, []);
  return { messages, status, error, setMessages, sendMessage, regenerate, clearError, stop() {}, addToolApprovalResponse() {} };
};
const { AgentConversation } = loadWithMocks('apps/frontend/src/components/agents/agent.conversation.tsx', {
  react: React,
  '@ai-sdk/react': { useChat },
  swr: { __esModule: true, default: () => ({ data: undefined }), useSWRConfig: () => ({ mutate() {} }) },
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
  '@contentfactory/frontend/components/onboarding/use-onboarding-progress': { useOnboardingProgress: () => ({ progress: {}, answered: true }) },
  '@contentfactory/frontend/components/layout/user.context': { useUser: () => ({ role: 'EDITOR' }) },
  '@contentfactory/frontend/components/ui/allowance-hint': { ALLOWANCE_API: '/allowance', AllowanceHint: () => null },
  './agent.threads': { THREADS_KEY: '/agent/threads' },
  './agent.transport': { createAgentTransport: () => ({}), screenTimeZone: () => 'UTC', isAgentRequestNotStarted: (error) => error instanceof ProvenNotStarted },
  './agent.markdown': { AgentMarkdown: ({ text }) => h('p', null, text) },
});
const open = () => render(h(AgentConversation, { threadId: null, initialMessages: [], pending: [], onThreadId() {}, onTitle() {}, onArtifact() {}, onArtifactRemoved() {}, openArtifact: null, starter: null, onStarterUsed() {}, words }));
const enter = async (view, text) => { fireEvent.change(view.getByRole('textbox'), { target: { value: text } }); await act(async () => fireEvent.submit(view.getByRole('textbox').closest('form'))); };
beforeEach(() => { world = { requests: 0, regenerations: 0, messages: [] }; });
afterEach(cleanup);

test('positive pre-start refusal restores text and explicit Enter retries one SDK user message once', async () => {
  const view = open();
  await enter(view, 'Preserve the full request');
  expect(view.getByRole('textbox').value).toBe('');
  await act(async () => world.fail(new ProvenNotStarted(JSON.stringify({ code: 'AI_PROVIDER_BUSY' }))));
  await waitFor(() => expect(view.getByRole('textbox').value).toBe('Preserve the full request'));
  expect(world.requests).toBe(1);
  expect(world.regenerations).toBe(0);
  await enter(view, 'Preserve the full request');
  expect(world.requests).toBe(2);
  expect(world.regenerations).toBe(1);
  expect(world.messages.filter((message) => message.role === 'user')).toHaveLength(1);
  await act(async () => world.finish());
  expect(view.getByRole('textbox').value).toBe('');
});

test('late proven refusal preserves newer composer edits; edited retry replaces the refused SDK user message', async () => {
  const view = open();
  await enter(view, 'Earlier rejected text');
  fireEvent.change(view.getByRole('textbox'), { target: { value: 'My newer draft' } });
  await act(async () => world.fail(new ProvenNotStarted(JSON.stringify({ code: 'AI_PROVIDER_BUSY' }))));
  expect(view.getByRole('textbox').value).toBe('My newer draft');
  expect(world.requests).toBe(1);
  await enter(view, 'My newer draft');
  expect(world.requests).toBe(2);
  expect(world.regenerations).toBe(0);
  expect(world.messages.filter((message) => message.role === 'user')).toHaveLength(1);
  expect(world.messages[0].parts[0].text).toBe('My newer draft');
});

test('headerless network failure stays uncertain without restoring or retrying the instruction', async () => {
  const view = open();
  await enter(view, 'Possibly executed request');
  await act(async () => world.fail(new TypeError('Failed to fetch')));
  expect(view.getByRole('textbox').value).toBe('');
  expect(view.getByRole('textbox').closest('fieldset').disabled).toBe(true);
  expect(world.requests).toBe(1);
  expect(world.regenerations).toBe(0);
});
