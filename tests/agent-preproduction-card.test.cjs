'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/original-thread' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, within, waitFor, act, fireEvent } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const ref = { id: 'saved-pilot', pieceId: 'source-piece', threadId: 'original-thread' };
let saved, requests, language, failure, hold, actor;
const fixture = () => ({ pilotId: ref.id, pieceId: ref.pieceId, threadId: ref.threadId, state: 'reviewed', sourceCurrent: true, independentReviewAccepted: true, outputLocale: 'ru',
  scenario: { directionsLanguage: 'en', outputLocale: 'ru', targetSeconds: 5, aspectRatio: '9:16', firstFrameDirections: 'FIRST: the venue before a single light sweep.', lastFrameDirections: 'LAST: the same venue after the light sweep.', motionDirections: 'MOTION: one continuous push-in, no cuts.', screenText: 'Точная строка: «Мегакампус» — 5 секунд.', spokenText: 'Выбранный русский текст.', captions: ['Сохранённые субтитры.'], unknownFacts: [], rightsConflicts: [] },
  review: { verdict: 'accept', findings: [] }, models: [{ role: 'author', selected: 'openai/gpt-6.1-sol', actual: 'openai/gpt-6.1-sol', state: 'captured' }, { role: 'critic', selected: 'openai/gpt-6.1-terra', actual: 'openai/gpt-6.1-terra', state: 'captured' }],
  frames: { state: 'unavailable', reason: 'IMAGE_ROUTE_AND_HIGGSFIELD_PROFILE_PENDING' }, video: { state: 'unavailable' }, raw: 'PRIVATE_RAW_MODEL_JSON', admissionId: 'PRIVATE_ADMISSION_ID', sourceDigest: 'PRIVATE_DIGEST',
});
const { ClipPreproductionCard } = loadWithMocks('apps/frontend/src/components/agents/agent.preproduction-card.tsx', {
  react: React, swr: require('swr'),
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => async (url, init) => {
    requests.push({ url, method: init.method, body: JSON.parse(init.body) });
    if (hold) await new Promise(resolve => { hold = resolve; });
    return { ok: !failure, status: failure || 200, json: async () => structuredClone(saved) };
  } },
  '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => language },
  '../layout/user.context': { useUser: () => actor },
});
function draw({ threadId = ref.threadId, cache = new Map(), onOpenSource = jest.fn(), readOnly = false } = {}) {
  return render(React.createElement(SWRConfig, { value: { provider: () => cache, dedupingInterval: 0, loadingTimeout: 0, errorRetryCount: 0, focusThrottleInterval: 0 } },
    React.createElement(ClipPreproductionCard, { preproduction: ref, threadId, onOpenSource, readOnly })));
}
beforeEach(() => { saved = fixture(); requests = []; language = 'ru'; failure = 0; hold = null; actor = { id: 'actor', orgId: 'org' }; });
afterEach(cleanup);
afterAll(() => dom.window.close());

test('saved per-pilot review mode is visible before preparation and selection never starts generation', async () => {
  saved.executionModeV2 = {version: 2, mode: 'review', canChange: true};
  const view = draw();
  await waitFor(() => expect(within(view.container).getByRole('combobox', {name: 'Режим пилота'}).value).toBe('review'));
  expect(view.container.textContent).toContain('С согласованием — подтверждаю сценарий и кадры');
  expect(view.container.textContent).toContain('Видео ждёт вашего отдельного согласия');
  saved.executionModeV2.mode = 'autopilot';
  await act(async () => fireEvent.change(within(view.container).getByRole('combobox', {name: 'Режим пилота'}), {target: {value: 'autopilot'}}));
  await waitFor(() => expect(within(view.container).getByRole('combobox', {name: 'Режим пилота'}).value).toBe('autopilot'));
  expect(requests.filter(r => r.method === 'PATCH')).toEqual([{url: '/social-factory/clip-preproduction/production/mode-v2', method: 'PATCH', body: {pilotId: ref.id, threadId: ref.threadId, mode: 'autopilot'}}]);
  expect(requests.every(r => r.url.endsWith('/open') || r.url.endsWith('/mode-v2'))).toBe(true);
});
test('prepared policy is visibly locked and failed selection is recoverable without resending it', async () => {
  saved.executionModeV2 = {version: 2, mode: 'review', canChange: false};
  const view = draw();
  await waitFor(() => expect(within(view.container).getByRole('combobox', {name: 'Режим пилота'}).disabled).toBe(true));
  expect(view.container.textContent).toContain('После подготовки режим зафиксирован');
  saved.executionModeV2.canChange = true;
  await act(async () => fireEvent.click(within(view.container).getByRole('button', {name: 'Обновить состояние'})));
  await waitFor(() => expect(within(view.container).getByRole('combobox', {name: 'Режим пилота'}).disabled).toBe(false));
  failure = 409;
  await act(async () => fireEvent.change(within(view.container).getByRole('combobox', {name: 'Режим пилота'}), {target: {value: 'autopilot'}}));
  await waitFor(() => expect(view.container.textContent).toContain('Не удалось сохранить режим'));
  expect(requests.filter(r => r.method === 'PATCH')).toHaveLength(1);
  expect(within(view.container).getByRole('combobox', {name: 'Режим пилота'}).value).toBe('review');
});

test.each(['video_preproduction', 'video_preproduction_open'])('native %s projects one inline owned read reference, including persisted history, without rendering embedded JSON', toolName => {
  const card = { kind: 'clip-preproduction', ...ref };
  const parts = [{ type: `tool-${toolName}`, toolCallId: 'call', title: 'Saved scenario', state: 'output-available', output: { ok: true, card: { kind: card.kind, id: card.id }, summary: { untrustedData: { value: { pilotId: ref.id, pieceId: ref.pieceId, threadId: ref.threadId, raw: 'PRIVATE_SUMMARY' } } } } }, { type: 'data-clip-preproduction', data: card }];
  const before = JSON.stringify(parts);
  const blocks = contract.readMessageBlocks({ id: 'saved', role: 'assistant', parts: JSON.parse(before) });
  expect(blocks).toEqual([{ type: 'clip-preproduction', key: 'saved:0', preproduction: ref }]);
  const [artifact] = contract.artifactsOf([{ id: 'saved', role: 'assistant', parts }]);
  expect(contract.artifactKey(artifact)).toBe(`piece:${ref.pieceId}:clip:${ref.id}`);
  expect(contract.artifactKey(artifact)).not.toBe(contract.artifactKey({kind:'piece',id:ref.pieceId,data:{}}));
  const savedRef = contract.artifactRefOf(artifact);
  const workspace = contract.readAgentWorkspace(JSON.parse(JSON.stringify({version:'assistant-workspace/v1',workContext:null,artifacts:[savedRef],activeArtifact:savedRef})));
  expect(workspace.activeArtifact).toMatchObject({kind:'piece',id:ref.pieceId,pieceId:ref.pieceId,clipPilotId:ref.id});
  expect(contract.artifactContextOf(artifact)).toMatchObject({kind:'piece',id:ref.pieceId,clipPilotId:ref.id});
  expect(contract.INLINE_CARD_KINDS).toContain('clip-preproduction');
  expect(contract.readMessageBlocks({ id: 'saved', role: 'assistant', parts: parts.slice(0, 1) })).toEqual(blocks);
  expect(JSON.stringify(parts)).toBe(before);
});

test('reopening a historical pilot as a read-only artifact shows its retained copy with no policy or generation write', async () => {
  saved.executionModeV2 = {version: 2, mode: 'review', canChange: true};
  const {ArtifactEditor}=loadWithMocks('apps/frontend/src/components/agents/agent.panel.tsx',{
    react:React, 'next/dynamic':()=>()=>null, './agent.preproduction-card':{ClipPreproductionCard},
  });
  const editor=ArtifactEditor({artifact:{kind:'piece',id:ref.pieceId,title:null,code:null,data:{clipPilotId:ref.id,clipThreadId:ref.threadId}},words:{},chatThreadId:ref.threadId});
  expect(editor.type).toBe(ClipPreproductionCard);expect(editor.props.readOnly).toBe(true);expect(editor.props.preproduction).toEqual(ref);expect(editor.props.onRequest).toBeUndefined();
  const cache = new Map(), first = draw({cache,readOnly:true});
  await waitFor(() => expect(first.container.textContent).toContain(saved.scenario.spokenText));
  const mode = within(first.container).getByRole('combobox', {name:'Режим пилота'});
  expect(mode.disabled).toBe(true);
  await act(async () => fireEvent.change(mode, {target:{value:'autopilot'}}));
  first.unmount();
  const restored = draw({cache,readOnly:true});
  await waitFor(() => expect(restored.container.textContent).toContain(saved.scenario.screenText));
  expect(requests.length).toBeGreaterThanOrEqual(2);
  expect(requests.every(row => row.method==='POST' && row.url.endsWith('/clip-preproduction/open') && row.body.pilotId===ref.id && row.body.threadId===ref.threadId)).toBe(true);
});

test.each(['ru', 'en'])('saved scenario, exact RU output and critique are visible inline with honest next stage (%s)', async locale => {
  language = locale; const onOpenSource = jest.fn(); const view = draw({ onOpenSource });
  await waitFor(() => expect(view.container.textContent).toContain('MOTION: one continuous push-in, no cuts.'));
  expect(view.container.textContent).toContain(saved.scenario.firstFrameDirections);
  expect(view.container.textContent).toContain(saved.scenario.lastFrameDirections);
  for (const text of [saved.scenario.screenText, saved.scenario.spokenText, ...saved.scenario.captions]) expect(view.container.textContent).toContain(text);
  expect(view.container.textContent).toContain(locale === 'ru' ? 'Сценарий проверен' : 'Scenario reviewed');
  expect(view.container.textContent).toContain(locale === 'ru' ? 'Используется текущая версия материала' : 'Using the current source version');
  expect(view.container.textContent).toContain(locale === 'ru' ? 'Принят' : 'Accepted');
  expect(view.container.textContent).toContain(locale === 'ru' ? 'Кадры и видео ещё не созданы' : 'Frames and video have not been created');
  expect(view.container.querySelector('div[lang="en"]')).toBeTruthy(); expect(view.container.querySelector('p[lang="ru"]')).toBeTruthy();
  for (const model of ['openai/gpt-6.1-sol', 'openai/gpt-6.1-terra']) expect(view.container.textContent).toContain(model);
  for (const secret of ['PRIVATE_RAW_MODEL_JSON', 'PRIVATE_ADMISSION_ID', 'PRIVATE_DIGEST', 'IMAGE_ROUTE_AND_HIGGSFIELD_PROFILE_PENDING']) expect(view.container.textContent).not.toContain(secret);
  await act(async () => fireEvent.click(within(view.container).getByRole('button', { name: locale === 'ru' ? 'Открыть исходный материал' : 'Open source material' })));
  expect(onOpenSource).toHaveBeenCalledTimes(1);
  expect(requests).toEqual([{ url: '/social-factory/clip-preproduction/open', method: 'POST', body: { pilotId: ref.id, threadId: ref.threadId } }]);
});

test('remount rechecks the source before showing a cached acceptance and never generates again', async () => {
  const cache = new Map(), first = draw({ cache });
  await waitFor(() => expect(first.container.textContent).toContain('Сценарий проверен')); first.unmount();
  saved.sourceCurrent = false; saved.state = 'needs_input'; saved.independentReviewAccepted = false; hold = true;
  const reloaded = draw({ cache });
  await waitFor(() => expect(typeof hold).toBe('function'));
  expect(reloaded.container.textContent).not.toContain('Сценарий проверен');
  expect(within(reloaded.container).getByLabelText('Проверяем сохранённый сценарий')).toBeTruthy();
  await act(async () => { const release = hold; hold = null; release(); });
  await waitFor(() => expect(reloaded.container.textContent).toContain('Источник изменился — проверка устарела'));
  expect(reloaded.container.textContent).not.toContain('Сценарий проверен');
  expect(requests).toHaveLength(2); expect(requests.every(request => request.url.endsWith('/clip-preproduction/open'))).toBe(true);
});

test('returning focus to the chat refreshes source currentness without a generation request', async () => {
  const view = draw(); await waitFor(() => expect(view.container.textContent).toContain('Сценарий проверен'));
  saved.sourceCurrent = false; saved.state = 'needs_input'; saved.independentReviewAccepted = false;
  await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
  await waitFor(() => expect(view.container.textContent).toContain('Источник изменился — проверка устарела'));
  expect(view.container.textContent).not.toContain('Сценарий проверен');
  expect(requests.length).toBeGreaterThan(1); expect(requests.every(request => request.url.endsWith('/clip-preproduction/open'))).toBe(true);
});

test('refresh failure hides previous acceptance, then a safe read recovers exact saved findings', async () => {
  const view = draw(); await waitFor(() => expect(view.container.textContent).toContain('Сценарий проверен'));
  failure = 403;
  await act(async () => fireEvent.click(within(view.container).getByRole('button', { name: 'Обновить состояние' })));
  await waitFor(() => expect(within(view.container).getByRole('alert')).toBeTruthy());
  expect(view.container.textContent).not.toContain('Сценарий проверен'); expect(view.container.textContent).not.toContain(saved.scenario.screenText);
  failure = 0; saved.state = 'needs_input'; saved.independentReviewAccepted = false; saved.review = { verdict: 'blocked', findings: [{ category: 'facts', detail: 'Дату события нужно уточнить.' }] };
  await act(async () => fireEvent.click(within(view.container).getByRole('button', { name: 'Обновить состояние' })));
  await waitFor(() => expect(view.container.textContent).toContain('Факты: Дату события нужно уточнить.'));
  expect(view.container.textContent).toContain('Подготовка остановлена');
});

test('a card in another chat cannot read the original pilot', () => {
  const view = draw({ threadId: 'other-thread' });
  expect(within(view.container).getByRole('alert').textContent).toContain('недоступен'); expect(requests).toEqual([]);
});
test('foreign or mismatched server output is not displayed', async () => {
  saved.threadId = 'foreign'; const view = draw();
  await waitFor(() => expect(within(view.container).getByRole('alert')).toBeTruthy());
  expect(view.container.textContent).not.toContain(saved.scenario.screenText);
});
test('unconfirmed actual models never produce a green independent review', async () => {
  saved.models[1].actual = null; saved.blocker = 'CLIP_ACTUAL_MODEL_UNVERIFIED'; const view = draw();
  await waitFor(() => expect(view.container.textContent).toContain('Не подтверждено, какой ИИ ответил'));
  expect(view.container.textContent).not.toContain('Сценарий проверен'); expect(view.container.textContent).toContain('Независимая проверка не подтверждена');
  expect(view.container.textContent).toContain('Не удалось подтвердить, какой ИИ ответил'); expect(view.container.textContent).not.toContain(saved.blocker);
});
test('unresolved facts and rights are visible without an invented accepted verdict', async () => {
  saved.state = 'needs_input'; saved.independentReviewAccepted = false; delete saved.review;
  saved.scenario.unknownFacts = ['Точная дата не подтверждена.']; saved.scenario.rightsConflicts = ['Права на фотографию не подтверждены.'];
  saved.blocker = 'CLIP_FACT_RIGHTS_OR_LANGUAGE_BLOCKED';
  const view = draw(); await waitFor(() => expect(view.container.textContent).toContain('Точная дата не подтверждена.'));
  expect(view.container.textContent).toContain('Права на фотографию не подтверждены.'); expect(view.container.textContent).not.toContain('Сценарий проверен');
  expect(view.container.textContent).toContain('Эти ограничения нельзя снять редакторским решением'); expect(view.container.textContent).not.toContain(saved.blocker);
});
test('unfinished text has no fabricated scenario or verdict and preserves pending media status', async () => {
  saved.state = 'uncertain'; saved.independentReviewAccepted = false; delete saved.scenario; delete saved.review; saved.models = [];
  saved.blocker = 'PRIVATE_UNKNOWN_CODE';
  const view = draw(); await waitFor(() => expect(view.container.textContent).toContain('Результат подготовки не подтверждён'));
  expect(view.container.textContent).toContain('Завершённый сценарий пока не сохранён'); expect(view.container.textContent).toContain('Сохранённого вердикта пока нет');
  expect(view.container.textContent).toContain('Подготовка остановлена. Проверьте сохранённые замечания'); expect(view.container.textContent).not.toContain(saved.blocker);
});
