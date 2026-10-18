'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://factory.test/' });
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, fireEvent, waitFor, cleanup } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;
let reads;
const response = (id, hasMore = false) => ({ items: [{ id, adaptationId: id, pieceId: `piece-${id}`, postId: `post-${id}`, channelId: 'channel-1', title: `План ${id}`, slot: { status: 'reserved', date: '2026-10-20T10:00:00Z' } }], hasMore, cursor: hasMore ? id : null });
const request = async (path) => {
  reads.push(path);
  const url = new URL(path, 'https://factory.test');
  return { ok: true, json: async () => response(url.searchParams.has('q') ? 'p026' : url.searchParams.has('cursor') ? 'p024' : 'p000', !url.searchParams.has('cursor') && !url.searchParams.has('q')) };
};
const { AgentWorkspaceBrowserContent } = loadWithMocks('apps/frontend/src/components/agents/agent.workspace-browser.tsx', {
  react: React,
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (key) => key },
  '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => 'ru' },
  '@contentfactory/react/form/button': { Button: ({ children, onClick, disabled }) => h('button', { onClick, disabled }, children) },
  '@contentfactory/react/form/button-link': { ButtonLink: ({ children, href }) => h('a', { href }, children) },
  '@contentfactory/react/form/input': { Input: ({ label, value, onChange }) => h('input', { 'aria-label': label, value, onChange }) },
  '@contentfactory/frontend/components/ui/layers': { Dialog: () => null },
  '@contentfactory/frontend/components/ui/surface': { ErrorState: ({ title }) => h('p', null, title), SkeletonRows: () => h('p', null, 'Loading') },
});
afterEach(cleanup);
afterAll(() => dom.window.close());

test('plan page, cursor and search are sent to the shared metadata endpoint; selection keeps the exact target', async () => {
  reads = [];
  const onSelect = jest.fn();
  const view = render(h(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0 } }, h(AgentWorkspaceBrowserContent, { initialKind: 'plan', onSelect, words: { panel: { loading: 'Loading' }, history: { failedTitle: 'Failed', retry: 'Retry' } } })));
  await waitFor(() => expect(view.getByText('План p000')).toBeTruthy());
  expect(reads[0]).toBe('/agent/workspace/browser?limit=24&kind=plan');
  fireEvent.click(view.getByText('next'));
  await waitFor(() => expect(view.getByText('План p024')).toBeTruthy());
  expect(new URL(reads.at(-1), 'https://factory.test').searchParams.get('cursor')).toBe('p000');
  fireEvent.change(view.getByLabelText('assistant_workspace_search'), { target: { value: 'Материал p026' } });
  await waitFor(() => expect(view.getByText('План p026')).toBeTruthy());
  const search = new URL(reads.at(-1), 'https://factory.test').searchParams;
  expect(search.get('q')).toBe('Материал p026');
  expect(search.has('cursor')).toBe(false);
  expect(view.getByText('previous').disabled).toBe(true);
  fireEvent.click(view.getByText('План p026'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'plan', id: 'p026', data: expect.objectContaining({ pieceId: 'piece-p026', channelId: 'channel-1', adaptationId: 'p026' }) }));
  expect(reads.every((path) => path.startsWith('/agent/workspace/browser?'))).toBe(true);
});
