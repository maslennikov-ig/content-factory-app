const React = require('react');
const { JSDOM, VirtualConsole } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/third-party', virtualConsole: new VirtualConsole()});
for (const key of ['window', 'self', 'document', 'navigator', 'sessionStorage', 'localStorage']) Object.defineProperty(global, key, {configurable: true, value: ['window', 'self'].includes(key) ? dom.window : dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, within, fireEvent, act, waitFor } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
let role, calls, failHub, inventory, language, videoSettings; const opened = []; const modal = {openModal: value => opened.push(value), closeAll() {}};
const makeHub = () => ({providers: [
  {identifier: 'heygen', title: 'HeyGen', description: 'Avatar integration', api: {legacyAvailable: true, videoAvailable: true, connections: [{id: 'existing-api', name: 'Existing account'}]}, personal: true},
  {identifier: 'higgsfield', title: 'Higgsfield', description: '', api: {legacyAvailable: false, videoAvailable: true, connections: []}, personal: true},
  {identifier: 'reelfarm', title: 'ReelFarm', description: 'Existing integration', api: {legacyAvailable: true, videoAvailable: false, connections: []}, personal: false},
], video: {workspaceEnabled: true, providers: [{provider: 'heygen', connectReady: true, generationReady: false, enabled: false, blockers: ['VIDEO_SCHEMA_UNSUPPORTED'], trial: true}, {provider: 'higgsfield', connectReady: true, generationReady: false, enabled: false, blockers: [], trial: false}], connections: []}});
const policy = () => ({hasKey: true, enabled: false, maxCostUsd: 5, monthlyBudgetUsd: 20, available: false});
const request = async (url, init = {}) => {
  const method = init.method ?? 'GET'; const body = init.body ? JSON.parse(init.body) : undefined; calls.push({url, method, body});
  let value;
  if (url === '/third-party/hub') value = inventory;
  else if (url === '/media/video-access') value = inventory.video;
  else if (url === '/media/video-provider-settings') {
    if (method === 'POST') for (const [provider, patch] of Object.entries(body.videoSpendPolicy ?? {})) {
      const prior = videoSettings.workspace[provider];
      const source = Object.hasOwn(patch, 'credentialSource') ? patch.credentialSource : prior.credentialSource;
      videoSettings.workspace[provider] = {...prior, ...patch, ...(source ? {credentialSource: {...source, status: 'inactive'}} : {credentialSource: undefined})};
    }
    value = videoSettings;
  }
  else if (url === '/media/video-connections/heygen/start') value = {authorizationUrl: 'https://provider.example/authorize'};
  else if (url === '/media/video-v2/connections/owned-personal/discover') value = {};
  else throw new Error(`Unexpected ${method} ${url}`);
  const ok = !(failHub && url === '/third-party/hub'); return {ok, status: ok ? 200 : 403, json: async () => structuredClone(value)};
};
const mocks = {
  '@contentfactory/helpers/utils/custom.fetch': {useFetch: () => request},
  '@contentfactory/react/translation/get.transation.service.client': {useT: () => (_key, fallback) => fallback ?? _key},
  '@contentfactory/react/translation/use-interface-language': {useInterfaceLanguage: () => language},
  '../layout/user.context': {useUser: () => ({id: 'actor', orgId: 'org', role})},
  '@contentfactory/frontend/components/layout/new-modal': {useModals: () => modal},
  '@contentfactory/frontend/components/launches/launches.component': {SVGLine: () => null},
  '@contentfactory/react/helpers/image.with.fallback': {__esModule: true, default: props => React.createElement('img', {src: props.src, alt: props.alt})},
  '@contentfactory/react/toaster/toaster': {useToaster: () => ({show() {}})},
  '@contentfactory/react/helpers/delete.dialog': {deleteDialog: async () => false},
  'next/navigation': {useRouter: () => ({refresh() {}})},
};
const { ThirdPartyComponent } = loadWithMocks('apps/frontend/src/components/third-parties/third-party.component.tsx', mocks);
const { VideoProviderSettings } = loadWithMocks('apps/frontend/src/components/videos/video-provider-settings.tsx', mocks);
const draw = element => render(React.createElement(SWRConfig, {value: {provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0, errorRetryCount: 0, revalidateOnFocus: false}}, element));
const hub = async () => {const view = draw(React.createElement(ThirdPartyComponent)); await waitFor(() => expect(view.container.querySelector('[data-integration-provider="heygen"]')).not.toBeNull()); return view;};
const provider = view => within(view.container.querySelector('[data-integration-provider="heygen"]'));
const openPersonal = async view => {await act(async () => fireEvent.click(provider(view).getByRole('button', {name: 'Manage integrations'}))); const form = draw(opened.at(-1).children); await waitFor(() => expect(within(form.container).getByRole('button', {name: 'Connect account'})).toBeTruthy()); return form;};
beforeEach(() => {role = 'EDITOR'; calls = []; failHub = false; inventory = makeHub(); videoSettings = {usageMode: 'included', workspace: {heygen: policy(), higgsfield: policy()}, included: {heygen: policy(), higgsfield: policy()}, effective: {heygen: policy(), higgsfield: policy()}}; language = 'en'; opened.length = 0; window.history.replaceState(null, '', '/third-party');});
afterEach(cleanup);
afterAll(() => dom.window.close());

test('existing hub has one HeyGen card, preserves other providers and opens with stored GET inventory only', async () => {
  const view = await hub();
  expect(view.container.querySelectorAll('[data-integration-provider="heygen"]')).toHaveLength(1);
  expect(view.container.querySelectorAll('[data-integration-provider]')).toHaveLength(3);
  expect(within(view.container).getByText('Existing account')).toBeTruthy();
  expect(provider(view).getByRole('region', {name: 'Personal subscription'})).toBeTruthy();
  expect(provider(view).getByRole('region', {name: 'API · workspace'})).toBeTruthy();
  expect(calls).toEqual([{url: '/third-party/hub', method: 'GET', body: undefined}]);
});
test('editor can manage own personal connection while API credential controls stay disabled', async () => {
  const view = await hub();
  expect(provider(view).getByRole('button', {name: 'Existing API integration'}).disabled).toBe(true);
  expect(provider(view).getByRole('button', {name: 'Video API settings'}).disabled).toBe(true);
  const form = await openPersonal(view);
  expect(form.container.querySelectorAll('[data-video-subscription-provider]')).toHaveLength(1);
  expect(form.container.querySelector('[data-video-subscription-provider="higgsfield"]')).toBeNull();
  await act(async () => fireEvent.click(within(form.container).getByRole('button', {name: 'Connect account'})));
  expect(calls.find(c => c.url.endsWith('/start'))).toEqual({url: '/media/video-connections/heygen/start', method: 'POST', body: {returnPath: '/third-party'}});
  expect(calls.some(c => /video-catalog|preflight|submit|discover|assets|quote/.test(c.url))).toBe(false);
});
test('chat hub preserves the exact saved source/draft/job return without a second OAuth service', async () => {
  const saved = '/agents/owned-thread?videoDraftId=owned-draft&pieceId=owned-piece&videoJobId=owned-job';
  window.history.replaceState(null, '', '/third-party?videoReturn=' + encodeURIComponent(saved));
  const view = await hub(); expect(within(view.container).getByRole('link', {name: 'Return to saved video'}).getAttribute('href')).toBe(saved);
  const form = await openPersonal(view); await act(async () => fireEvent.click(within(form.container).getByRole('button', {name: 'Connect account'})));
  expect(calls.find(c => c.url.endsWith('/start')).body).toEqual({returnPath: saved});
});
test('malformed return context cannot start OAuth or expose an external return link', async () => {
  window.history.replaceState(null, '', '/third-party?videoReturn=' + encodeURIComponent('https://evil.example/token'));
  const view = await hub(); expect(within(view.container).queryByRole('link', {name: 'Return to saved video'})).toBeNull();
  const form = await openPersonal(view); expect(within(form.container).getByRole('button', {name: 'Connect account'}).disabled).toBe(true);
  expect(calls.every(c => c.method === 'GET')).toBe(true);
});
test('account discovery stays an explicit action in the reused hub form and never becomes generation', async () => {
  inventory.video.connections.push({id: 'owned-personal', provider: 'heygen', state: 'discovery_required', generation: 1, unit: 'heygen_credit', perJob: null, perMonth: null, workspaceGranted: true, walletVerified: false, balance: null});
  const view = await hub();
  await act(async () => fireEvent.click(provider(view).getByRole('button', {name: 'Manage integrations'})));
  const form = draw(opened.at(-1).children); await waitFor(() => expect(within(form.container).getByRole('button', {name: 'Check account'})).toBeTruthy());
  expect(calls.every(c => c.method === 'GET')).toBe(true);
  await act(async () => fireEvent.click(within(form.container).getByRole('button', {name: 'Check account'})));
  expect(calls.filter(c => c.method === 'POST')).toEqual([{url: '/media/video-v2/connections/owned-personal/discover', method: 'POST', body: {}}]);
});
test('old API settings location is a hub link and never mounts a second key form or reads API settings', () => {
  role = 'ADMIN'; const view = draw(React.createElement(VideoProviderSettings));
  expect(within(view.container).getByRole('link', {name: 'Manage integrations'}).getAttribute('href')).toBe('/third-party');
  expect(view.container.querySelector('input')).toBeNull(); expect(calls).toEqual([]);
});
test('administrator opens only the selected existing API controls without moving or copying a saved key', async () => {
  role = 'ADMIN'; const view = await hub();
  await act(async () => fireEvent.click(provider(view).getByRole('button', {name: 'Video API settings'})));
  const form = draw(opened.at(-1).children); await waitFor(() => expect(form.container.querySelector('[data-video-provider-settings="heygen"]')).not.toBeNull());
  expect(form.container.querySelector('[data-video-provider-settings="higgsfield"]')).toBeNull();
  expect(form.container.querySelector('input[name="video-heygen-key"]').value).toBe('');
  expect(calls.every(c => c.method === 'GET')).toBe(true); expect(calls.filter(c => c.url === '/media/video-provider-settings')).toHaveLength(1);
});
test('hub errors and OAuth refusal are visible without inventing empty inventory success', async () => {
  failHub = true; window.history.replaceState(null, '', '/third-party?connectionError=VIDEO_OAUTH_REFUSED');
  const view = draw(React.createElement(ThirdPartyComponent)); await waitFor(() => expect(within(view.container).getByRole('button', {name: 'Refresh'})).toBeTruthy());
  expect(view.container.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0);
  expect(within(view.container).queryByText('No Integrations Yet')).toBeNull();
});

const ownedConnection = {id: 'owned-personal', provider: 'heygen', state: 'connected', generation: 1, unit: 'heygen_credit', perJob: null, perMonth: null, workspaceGranted: true, walletVerified: false, balance: null};
const workspaceStatusCases = [
  {name: 'no account row', rows: [], status: ['Disconnected', 'Не подключён']},
  {name: 'current grant awaiting qualification', rows: [{...ownedConnection, state: 'discovery_required'}], status: ['Connected', 'Подключён'], discovery: true},
  {name: 'authenticated account without current grant', rows: [{...ownedConnection, workspaceGranted: false, walletVerified: true}], status: ['Access needed for this workspace', 'Нужен доступ для этого пространства'], grant: true},
  {name: 'another provider only', rows: [{...ownedConnection, provider: 'higgsfield'}], status: ['Disconnected', 'Не подключён']},
];
test.each(workspaceStatusCases.flatMap(scenario => ['en', 'ru'].map(locale => ({...scenario, locale}))))('personal workspace status is truthful on the card and modal: $name ($locale)', async scenario => {
  language = scenario.locale; inventory.video.connections = structuredClone(scenario.rows);
  const index = language === 'ru' ? 1 : 0; const view = await hub();
  expect(provider(view).getByText(scenario.status[index], {exact: true})).toBeTruthy();
  if (scenario.rows[0]?.provider === 'higgsfield') expect(within(view.container.querySelector('[data-integration-provider="higgsfield"]')).getByText(index ? 'Подключён' : 'Connected', {exact: true})).toBeTruthy();
  await act(async () => fireEvent.click(provider(view).getByRole('button', {name: index ? 'Управление интеграциями' : 'Manage integrations'})));
  const form = draw(opened.at(-1).children);
  await waitFor(() => expect(form.container.querySelector('[data-video-subscription-provider="heygen"]')).toBeTruthy());
  expect(within(form.container).getByText(scenario.status[index], {exact: true})).toBeTruthy();
  if (scenario.grant) expect(within(form.container).getByRole('button', {name: index ? 'Разрешить мой аккаунт в этом пространстве' : 'Allow my account in this workspace'}).disabled).toBe(false);
  if (scenario.discovery) expect(within(form.container).getByText(index ? 'Аккаунт подключён. Нужно проверить доступные действия у провайдера.' : 'Account connected. Check the provider for available actions.')).toBeTruthy();
  expect(within(form.container).getByText(index ? 'Подключение доступно; создание видео пока не подтверждено.' : 'Connection is available; video generation is not yet verified.')).toBeTruthy();
  expect(form.container.querySelector('[data-video-subscription-provider="higgsfield"]')).toBeNull();
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

const openVideoApi = async () => {
  role='ADMIN'; const view=await hub();
  await act(async()=>fireEvent.click(provider(view).getByRole('button',{name:language==='ru'?'Настройки видео API':'Video API settings'})));
  const form=draw(opened.at(-1).children);
  await waitFor(()=>expect(form.container.querySelector('[data-video-provider-settings="heygen"]')).toBeTruthy());
  return form;
};

test.each(['en','ru'])('administrator explicitly selects an existing key source without changing payer or spending (%s)',async locale=>{
  language=locale;const form=await openVideoApi();
  const select=within(form.container).getByRole('combobox',{name:locale==='ru'?'Источник ключа видео API':'Video API key source'});
  expect(select.value).toBe('');expect(within(select).getByRole('option',{name:'Existing account'}).value).toBe('existing-api');
  expect(calls.every(call=>call.method==='GET')).toBe(true);
  fireEvent.change(select,{target:{value:'existing-api'}});
  expect(form.container.querySelector('input[name="video-heygen-key"]')).toBeNull();expect(calls.every(call=>call.method==='GET')).toBe(true);
  await act(async()=>fireEvent.click(within(form.container).getByRole('button',{name:language==='ru'?'Сохранить настройки':'Save settings'})));
  expect(calls.filter(call=>call.method==='POST')).toEqual([{url:'/media/video-provider-settings',method:'POST',body:{videoSpendPolicy:{heygen:{enabled:false,maxCostUsd:5,monthlyBudgetUsd:20,credentialSource:{kind:'third_party',integrationId:'existing-api'}}}}}]);
  expect(videoSettings.usageMode).toBe('included');expect(JSON.stringify(calls)).not.toMatch(/apiKey|encrypted:/);
});

test('limit-only edit omits source changes; explicit inline and disconnect actions preserve saved integration inventory',async()=>{
  videoSettings.workspace.heygen.credentialSource={kind:'third_party',integrationId:'existing-api',name:'Existing account',status:'inactive'};
  const form=await openVideoApi();const select=within(form.container).getByRole('combobox',{name:'Video API key source'});
  expect(select.value).toBe('existing-api');expect(within(form.container).getByText('This workspace source is inactive while the included allowance is selected.')).toBeTruthy();
  await act(async()=>fireEvent.click(within(form.container).getByRole('button',{name:language==='ru'?'Сохранить настройки':'Save settings'})));
  expect(calls.filter(call=>call.method==='POST').at(-1).body.videoSpendPolicy.heygen).not.toHaveProperty('credentialSource');
  fireEvent.change(select,{target:{value:''}});
  expect(form.container.querySelector('input[name="video-heygen-key"]').value).toBe('');
  await act(async()=>fireEvent.click(within(form.container).getByRole('button',{name:language==='ru'?'Сохранить настройки':'Save settings'})));
  expect(calls.filter(call=>call.method==='POST').at(-1).body.videoSpendPolicy.heygen.credentialSource).toBeNull();
  expect(inventory.providers[0].api.connections).toEqual([{id:'existing-api',name:'Existing account'}]);
});

test('unavailable source stays selected until an explicit change; disconnect disables new work and clears only the binding',async()=>{
  videoSettings.workspace.heygen={...policy(),hasKey:false,credentialSource:{kind:'third_party',integrationId:'deleted-source',status:'unavailable'}};
  const form=await openVideoApi();const select=within(form.container).getByRole('combobox',{name:'Video API key source'});
  expect(select.value).toBe('deleted-source');expect(within(form.container).getByText('Selected API connection is unavailable. Restore it or explicitly choose another source.',{selector:'p'})).toBeTruthy();
  expect(calls.every(call=>call.method==='GET')).toBe(true);
  await act(async()=>fireEvent.click(within(form.container).getByRole('button',{name:'Disconnect video source'})));
  expect(calls.filter(call=>call.method==='POST')).toEqual([{url:'/media/video-provider-settings',method:'POST',body:{videoSpendPolicy:{heygen:{enabled:false,maxCostUsd:5,monthlyBudgetUsd:20,credentialSource:null}}}}]);
  expect(inventory.providers[0].api.connections).toHaveLength(1);
});
