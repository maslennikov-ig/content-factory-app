/** Actual Sets actions/SSR, with only data and the optional compose module inert. */
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true, url: 'http://localhost/settings?tab=sets',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true, value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { renderToString } = require('react-dom/server');
const { render, cleanup, screen, fireEvent, waitFor, act } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const h = React.createElement;
const root = path.resolve(__dirname, '..');
const source = 'apps/frontend/src/components/sets/sets.tsx';
const editorRequest = '@contentfactory/frontend/components/new-launch/add.edit.modal';
const translations = Object.fromEntries(['en', 'ru'].map(locale => [locale, JSON.parse(
  fs.readFileSync(path.join(root, 'libraries/react-shared-libraries/src/translation/locales', locale, 'translation.json'), 'utf8')
)]));
const setBody = [{ content: '<p>Own fictional set</p>', image: [], integration: 'fixture-channel' }];
const originalSet = { id: 'fixture-set', name: 'Own set', content: JSON.stringify(setBody) };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, '__esModule', { value: true });
  return { promise, resolve, reject };
}
function fixture({ locale = 'en', importModule } = {}) {
  const counters = { imports: 0, editorMounts: 0 };
  const integrations = [{ id: 'fixture-channel', name: 'Own channel', providerIdentifier: 'telegram' }];
  const data = [{ ...originalSet }];
  const t = (key, fallback) => translations[locale][key] || fallback || key;
  const request = jest.fn(async (url, options) => {
    if (options?.method === 'POST' && url === '/sets') return { json: async () => ({}) };
    if (options) throw new Error('Unexpected fixture write');
    if (url === '/integrations/list') return { json: async () => ({ integrations }) };
    if (url === '/sets') return { json: async () => data };
    throw new Error('No real HTTP allowed');
  });
  const modal = { openModal: jest.fn(), closeAll: jest.fn() };
  const toast = { show: jest.fn() };
  const sources = { '@contentfactory/react/form/button': 'libraries/react-shared-libraries/src/form/button.tsx' };
  const mocks = {
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
    '@contentfactory/frontend/components/layout/user.context': { useUser: () => ({ role: 'EDITOR' }) },
    '@contentfactory/frontend/components/layout/new-modal': { useModals: () => modal },
    '@contentfactory/react/toaster/toaster': { useToaster: () => toast },
    '@contentfactory/react/helpers/delete.dialog': { deleteDialog: () => { throw new Error('No delete in this fixture'); } },
    '@contentfactory/react/translation/get.transation.service.client': { useT: () => t },
    '@contentfactory/frontend/components/layout/set.timezone': { newDayjs: () => 'own-click-date' },
    '@contentfactory/react/form/input': { Input: ({ label, name, value, onChange }) => h('label', null,
      label, h('input', { name, value: value || '', onChange })) },
  };
  const { Sets } = loadTypeScriptModule(source, mocks, {
    sources,
    resolve: request => {
      if (request !== editorRequest) return undefined;
      counters.imports += 1;
      return importModule ? importModule(counters) : readyModule(counters);
    },
  });
  const cache = new Map();
  const swrConfig = { provider: () => cache, shouldRetryOnError: false, dedupingInterval: 0, loadingTimeout: 0 };
  const tree = () => h(SWRConfig, { value: swrConfig }, h(Sets));
  return { Sets, tree, counters, integrations, data, modal, request, toast, t };
}
function readyModule(counters) {
  return { AddEditModal: ({ set, addEditSets }) => {
    counters.editorMounts += 1;
    const [value, setValue] = React.useState(set?.[0]?.content || '');
    return h('div', null,
      h('textarea', { 'aria-label': 'Own compose text', value, onChange: event => setValue(event.target.value) }),
      h('button', { type: 'button', onClick: () => addEditSets([{ content: value, image: [] }]) }, 'Save own compose'));
  } };
}
async function loadedList(own) {
  const view = render(own.tree());
  await screen.findByText('Own set');
  await waitFor(() => expect(own.request.mock.calls.some(([url]) => url === '/integrations/list')).toBe(true));
  return view;
}
const postCalls = own => own.request.mock.calls.filter(([, options]) => options?.method === 'POST');
afterEach(() => { cleanup(); jest.restoreAllMocks(); });
afterAll(() => dom.window.close());

test('SSR and client list stay cold until an explicit add/edit action', async () => {
  const own = fixture();
  const html = renderToString(own.tree());
  expect(html).toContain(own.t('sets'));
  expect(html).toContain(own.t('add_set'));
  expect(own.counters.imports).toBe(0);
  expect(own.request).not.toHaveBeenCalled();
  await loadedList(own);
  expect(own.counters.imports).toBe(0);
  expect(own.modal.openModal).not.toHaveBeenCalled();
  expect(own.request.mock.calls.map(([url]) => url).sort()).toEqual(['/integrations/list', '/sets']);
});

test('explicit edit loads once, prevents duplicate opens and preserves original modal props', async () => {
  const pending = deferred(); const own = fixture({ importModule: () => pending.promise });
  await loadedList(own);
  const edit = screen.getByRole('button', { name: own.t('edit') });
  fireEvent.click(edit);
  await waitFor(() => expect(own.counters.imports).toBe(1));
  expect(edit.disabled).toBe(true);
  expect(edit.getAttribute('aria-busy')).toBe('true');
  fireEvent.click(edit);
  expect(own.modal.openModal).not.toHaveBeenCalled();
  await act(async () => pending.resolve(readyModule(own.counters)));
  expect(own.modal.openModal).toHaveBeenCalledTimes(1);
  const opened = own.modal.openModal.mock.calls[0][0];
  expect(opened).toMatchObject({ id: 'add-edit-modal', askClose: true, fullScreen: true,
    closeOnClickOutside: false, closeOnEscape: false, withCloseButton: false });
  expect(opened.children.props.set).toEqual(setBody);
  expect(opened.children.props.integrations).toEqual(own.integrations);
  expect(opened.children.props.allIntegrations).toEqual(own.integrations);
  expect(opened.children.props.date).toBe('own-click-date');
  expect(postCalls(own)).toHaveLength(0);
});

test('loaded editor retains typed text, cursor selection and the existing name/save flow', async () => {
  const own = fixture(); await loadedList(own);
  fireEvent.click(screen.getByRole('button', { name: own.t('edit') }));
  await waitFor(() => expect(own.modal.openModal).toHaveBeenCalledTimes(1));
  const editor = render(own.modal.openModal.mock.calls[0][0].children);
  const text = screen.getByRole('textbox', { name: 'Own compose text' });
  expect(text.value).toBe(setBody[0].content);
  fireEvent.change(text, { target: { value: 'Own edited text' } });
  text.setSelectionRange(4, 10);
  editor.rerender(own.modal.openModal.mock.calls[0][0].children);
  expect(text.value).toBe('Own edited text');
  expect([text.selectionStart, text.selectionEnd]).toEqual([4, 10]);
  fireEvent.click(screen.getByRole('button', { name: 'Save own compose' }));
  const save = render(own.modal.openModal.mock.calls[1][0].children);
  const name = screen.getByRole('textbox', { name: own.t('label_set_name') });
  expect(name.value).toBe(originalSet.name);
  fireEvent.change(name, { target: { value: 'Own renamed set' } });
  expect(postCalls(own)).toHaveLength(0);
  fireEvent.submit(save.container.querySelector('form'));
  await waitFor(() => expect(postCalls(own)).toHaveLength(1));
  const [, options] = postCalls(own)[0];
  expect(JSON.parse(options.body)).toEqual({ id: originalSet.id, name: 'Own renamed set',
    content: JSON.stringify([{ content: 'Own edited text', image: [] }]) });
  expect(own.modal.closeAll).toHaveBeenCalledTimes(1);
});

test.each(['en', 'ru'])('rejected load is localized, stays failed and only manual retry reloads (%s)', async locale => {
  const first = deferred(); const second = deferred();
  const own = fixture({ locale, importModule: counter => counter.imports === 1 ? first.promise : second.promise });
  const view = await loadedList(own);
  fireEvent.click(screen.getByRole('button', { name: own.t('edit') }));
  await waitFor(() => expect(own.counters.imports).toBe(1));
  await act(async () => first.reject(new Error('Private chunk path must remain hidden')));
  expect(screen.getByRole('alert').textContent).toContain(own.t('error_occurred'));
  expect(document.body.textContent).not.toContain('Private chunk');
  view.rerender(own.tree());
  await act(async () => Promise.resolve());
  expect(own.counters.imports).toBe(1);
  expect(own.modal.openModal).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: own.t('try_again') }));
  await waitFor(() => expect(own.counters.imports).toBe(2));
  await act(async () => second.resolve(readyModule(own.counters)));
  expect(own.modal.openModal).toHaveBeenCalledTimes(1);
  expect(own.modal.openModal.mock.calls[0][0].children.props.set).toEqual(setBody);
  expect(screen.queryByRole('alert')).toBe(null);
  expect(postCalls(own)).toHaveLength(0);
});

test.each(['resolve', 'reject'])('canceling a pending open prevents late modal/error (%s)', async outcome => {
  const pending = deferred(); const own = fixture({ importModule: () => pending.promise });
  await loadedList(own);
  fireEvent.click(screen.getByRole('button', { name: own.t('add_set') }));
  await waitFor(() => expect(own.counters.imports).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: own.t('cancel') }));
  await act(async () => outcome === 'resolve' ? pending.resolve(readyModule(own.counters)) : pending.reject(new Error('Canceled load')));
  expect(own.modal.openModal).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBe(null);
  expect(postCalls(own)).toHaveLength(0);
});

test.each(['resolve', 'reject'])('unmounting during load prevents late modal/state updates (%s)', async outcome => {
  const pending = deferred(); const own = fixture({ importModule: () => pending.promise });
  const view = await loadedList(own); const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: own.t('add_set') }));
  await waitFor(() => expect(own.counters.imports).toBe(1));
  view.unmount();
  await act(async () => outcome === 'resolve' ? pending.resolve(readyModule(own.counters)) : pending.reject(new Error('Unmounted load')));
  expect(own.modal.openModal).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
  expect(postCalls(own)).toHaveLength(0);
});

test('a later explicit add reuses only the loaded module and has no previous set data', async () => {
  const own = fixture(); await loadedList(own);
  fireEvent.click(screen.getByRole('button', { name: own.t('edit') }));
  await waitFor(() => expect(own.modal.openModal).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: own.t('add_set') }));
  await waitFor(() => expect(own.modal.openModal).toHaveBeenCalledTimes(2));
  expect(own.counters.imports).toBe(1);
  expect(own.modal.openModal.mock.calls[1][0].children.props.set).toBeUndefined();
  expect(postCalls(own)).toHaveLength(0);
});
