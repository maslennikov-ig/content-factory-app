'use strict';
const React = require('react');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/media?video=1'});
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, {configurable: true, value: key === 'window' ? dom.window : dom.window[key]});
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
const {act, cleanup, fireEvent, render, screen, waitFor} = require('@testing-library/react');
const {SWRConfig} = require('swr');
const {loadWithMocks} = require('./helpers/load-ts-with-mocks.cjs');

const draftId = '33333333-3333-4333-8333-333333333333', jobId = '44444444-4444-4444-8444-444444444444';
const id = `heygen-performance-feedback:${'a'.repeat(64)}`;
const observation = 'Ведущий несколько раз повторяет жест.';
const reply = value => ({ok: true, status: 200, json: async () => structuredClone(value)});
const request = jest.fn();
let persisted;
const {VideoHeygenPerformanceFeedback} = loadWithMocks('apps/frontend/src/components/videos/video-heygen-performance-feedback.tsx', {
  '@contentfactory/helpers/utils/custom.fetch': {useFetch: () => request},
  '@contentfactory/react/translation/use-interface-language': {useInterfaceLanguage: () => 'ru-RU'},
});
const draw = (extra = {}) => {
  const props = {actorKey: 'org:actor', draftId, draftVersion: 3, jobId, onSaved: jest.fn(async () => {}), onBusyChange: jest.fn(), ...extra};
  const cache = new Map();
  const view = render(React.createElement(SWRConfig, {value: {provider: () => cache, dedupingInterval: 0, loadingTimeout: 0,
    focusThrottleInterval: 0, errorRetryCount: 0}}, React.createElement(VideoHeygenPerformanceFeedback, props)));
  return {view, props};
};
const posts = () => request.mock.calls.filter(([, init]) => init?.method === 'POST').map(([path, init]) => [path, JSON.parse(init.body)]);
const change = (label, value) => act(async () => fireEvent.change(screen.getByLabelText(label), {target: {value}}));
const click = name => act(async () => fireEvent.click(screen.getByRole('button', {name})));

beforeEach(() => {
  persisted = [];
  request.mockReset();
  request.mockImplementation(async (path, init) => {
    if (!init?.method) return reply({draftId, draftVersion: 3, revision: 4, observations: persisted,
      target: {kind: 'render', jobId, draftVersion: 2, durationMs: 65516}});
    const body = JSON.parse(init.body);
    if (path.endsWith('/performance-feedback')) {
      persisted = [{id, draftVersion: 2, text: body.text, fragment: null, createdAt: new Date(0).toISOString(), render: body.render}];
      return reply({draftId, draftVersion: 3, feedbackId: id, feedbackSaved: true});
    }
    if (path.endsWith('/correction')) return reply({draftId, draftVersion: 3, expectedRevision: 4, feedbackId: id, changes: body.changes,
      lockedFields: [], generated: false, submitted: false});
    return reply({draftId, draftVersion: 4, draft: {id: draftId, version: 4, settings: {heygenV2: {}}}, generated: false, submitted: false});
  });
});
afterEach(cleanup);
afterAll(() => dom.window.close());

test('the exact owned result has a saved timestamp and separate correction preview and draft save', async () => {
  const {view, props} = draw();
  await screen.findByText('Готовый ролик · версия 2');
  await change('Что вы заметили?', observation);
  await change('С какой секунды', '9,25');
  await change('По какую секунду', '70');
  await click('Сохранить замечание');
  expect(screen.getByRole('alert').textContent).toMatch(/внутри ролика/);
  expect(posts()).toHaveLength(0);
  await change('По какую секунду', '16');
  await click('Сохранить замечание');
  await screen.findByText('Готовый ролик · версия 2 · 0:09.250–0:16.000');
  expect(posts()).toEqual([['/media/video-v2/performance-feedback', {draftId, version: 3, expectedRevision: 4,
    text: observation, render: {jobId, startMs: 9250, endMs: 16000}}]]);
  view.unmount();
  draw({onSaved: props.onSaved, onBusyChange: props.onBusyChange});
  await screen.findByText('Готовый ролик · версия 2 · 0:09.250–0:16.000');
  await change('Что изменить в подаче?', 'gestures');
  expect(posts()).toHaveLength(1);
  await click('Показать правку');
  await screen.findByText(/Предложение для новой версии/);
  expect(props.onSaved).not.toHaveBeenCalled();
  await click('Сохранить новую версию');
  await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.objectContaining({id: draftId, version: 4}), {id: draftId, version: 3}));
  expect(posts().slice(1)).toEqual(['/media/video-v2/performance-feedback/correction', '/media/video-v2/performance']
    .map(path => [path, {draftId, version: 3, expectedRevision: 4, feedbackId: id, changes: {gestures: 'none'}}]));
  expect(props.onBusyChange.mock.calls).toEqual([[true], [false]]);
});

test('actor scope disables an old video response and a late apply cannot adopt a draft after unmount', async () => {
  persisted = [{id, draftVersion: 2, text: observation, fragment: null, createdAt: new Date(0).toISOString(), render: {jobId}}];
  let complete;
  request.mockImplementationOnce(async () => reply({draftId, draftVersion: 3, revision: 4, observations: persisted,
    target: {kind: 'render', jobId: 'unrelated', draftVersion: 2, durationMs: 65516}}));
  const wrong = draw();
  await screen.findByText(/Не удалось загрузить замечания/);
  expect(screen.queryByLabelText('Что вы заметили?')).toBeNull();
  wrong.view.unmount();
  const {view, props} = draw({actorKey: 'org:other'});
  await screen.findByLabelText('Что изменить в подаче?');
  await change('Что изменить в подаче?', 'face');
  await click('Показать правку');
  await screen.findByText(/Предложение для новой версии/);
  request.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  await click('Сохранить новую версию');
  await act(async () => view.unmount());
  await act(async () => complete(reply({draftId, draftVersion: 4, draft: {id: draftId, version: 4, settings: {heygenV2: {}}}, generated: false, submitted: false})));
  expect(props.onSaved).not.toHaveBeenCalled();
  expect(props.onBusyChange.mock.calls).toEqual([[true], [false]]);
});
