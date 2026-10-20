'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/chat-0' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, fireEvent, cleanup, waitFor } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { agentWordsFor } = require('./helpers/load-tsx.cjs').loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const h = React.createElement;
let pathname, failed, calls, navigate, push;
const words = agentWordsFor('ru');
const fetcher = async (url) => {
  calls.push(url);
  if (failed) return Response.json({}, { status: 503 });
  const page = Number(new URL(url, 'http://localhost').searchParams.get('page') ?? 0);
  return Response.json({ threads: Array.from({ length: page ? 5 : 100 }, (_, i) => ({ id: `chat-${page * 100 + i}`, title: `Чат ${page * 100 + i}`, createdAt: null, updatedAt: null })), pagination: { page, perPage: 100, total: 105, hasMore: page === 0 } });
};
const mocks = {
  'next/navigation': { usePathname: () => pathname, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push }) },
  'next/link': { __esModule: true, default: ({ children, href, prefetch, onClick, ...rest }) => h('a', { href, ...rest, onClick: (event) => { onClick?.(event); event.preventDefault(); } }, children) },
  '@contentfactory/react/helpers/variable.context': { useVariables: () => ({ language: 'ru' }) },
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetcher },
};
const { AssistantMenuItem } = loadWithMocks('apps/frontend/src/components/new-layout/assistant-menu.tsx', mocks);
const { ThreadSwitcher } = loadWithMocks('apps/frontend/src/components/agents/agent.threads.tsx', mocks);
const menu = (collapsed = false) => h(AssistantMenuItem, { label: 'ИИ-помощник', icon: h('svg'), collapsed, onNavigate: () => navigate() });
const draw = (content) => render(h(SWRConfig, { value: { provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 } }, content));
beforeEach(() => { pathname = '/agents/chat-0'; failed = false; calls = []; navigate = jest.fn(); push = jest.fn(); });
afterEach(cleanup);

test('assistant disclosure reveals native paginated chats and marks the current one', async () => {
  const view = draw(menu());
  await view.findByRole('link', { name: 'Чат 0' });
  expect(view.getByRole('link', { name: 'Чат 0' }).getAttribute('aria-current')).toBe('page');
  expect(view.getByRole('button', { name: 'ИИ-помощник' }).getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(view.getByRole('button', { name: 'Ещё чаты' }));
  await view.findByRole('link', { name: 'Чат 104' });
  expect(view.queryByRole('button', { name: 'Ещё чаты' })).toBeNull();
  expect(calls.some((url) => url.includes('page=1'))).toBe(true);
  fireEvent.click(view.getByRole('button', { name: 'ИИ-помощник' }));
  expect(view.queryByRole('link', { name: 'Чат 0' })).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'ИИ-помощник' }));
  expect(view.getByRole('link', { name: 'Чат 104' })).toBeTruthy();
});

test('sidebar plus starts a new chat and thread selection closes the mobile menu', async () => {
  const view = draw(menu());
  await view.findByRole('link', { name: 'Чат 2' });
  fireEvent.click(view.getByRole('link', { name: 'Чат 2' }));
  expect(push).toHaveBeenLastCalledWith('/agents/chat-2');
  expect(navigate).toHaveBeenCalledTimes(1);
  fireEvent.click(view.getByRole('button', { name: 'Новый чат' }));
  expect(push).toHaveBeenLastCalledWith('/agents/new');
  expect(navigate).toHaveBeenCalledTimes(2);
  expect(calls.every((url) => url.startsWith('/agent/threads?'))).toBe(true);
});

test('modifier click keeps the native thread link without changing the current chat', async () => {
  const view = draw(menu());
  fireEvent.click(await view.findByRole('link', { name: 'Чат 2' }), { ctrlKey: true });
  expect(push).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

test('manual sections defer thread loading until the assistant is expanded', async () => {
  pathname = '/content';
  const view = draw(menu());
  expect(calls).toHaveLength(0);
  fireEvent.click(view.getByRole('button', { name: 'ИИ-помощник' }));
  await view.findByRole('link', { name: 'Чат 0' });
  expect(push).not.toHaveBeenCalled();
});

test('sidebar list failure offers retry and recovers in place', async () => {
  failed = true;
  const view = draw(menu());
  await view.findByText(words.threads.failed);
  failed = false;
  fireEvent.click(view.getByRole('button', { name: words.threads.retry }));
  await view.findByRole('link', { name: 'Чат 0' });
});

test('collapsed rail retains assistant navigation without loading hidden history', () => {
  const view = draw(menu(true));
  expect(view.getByRole('link', { name: 'ИИ-помощник' }).getAttribute('href')).toBe('/agents');
  expect(calls).toHaveLength(0);
});

test('conversation toolbar leaves the persistent archive out of the message column', async () => {
  const view = draw(h(ThreadSwitcher, { threadId: null, title: 'Новый чат', language: 'ru', onOpen: jest.fn(), onNew: jest.fn(), onRemoved: jest.fn(), words }));
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  expect(view.container.querySelector('ul')).toBeNull();
  expect(view.getByRole('button', { name: 'Чаты' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Новый чат' })).toBeTruthy();
});
