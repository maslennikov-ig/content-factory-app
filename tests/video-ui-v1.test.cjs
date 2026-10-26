'use strict';

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/media?video=1' });
for (const key of ['window', 'self', 'document', 'navigator', 'sessionStorage', 'localStorage']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' || key === 'self' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, waitFor, within } = require('@testing-library/react');
const { SWRConfig, useSWRConfig } = require('swr');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const helper = loadTypeScriptModule('apps/frontend/src/components/videos/video-ui.v1.ts');
const accessHelper = loadTypeScriptModule('apps/frontend/src/components/videos/video-ui.v2.ts');
const en = require('../libraries/react-shared-libraries/src/translation/locales/en/translation.json');
const pieceId = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';
const actorId = 'editor-1';
const fact = 'До 22.10.2026 не дороже 12,5 млн.';
let calls, stored, currentJob, unknownPrice, failLaunchOnce, failDownload, role, mutateReaders;
const clip = { provider: 'higgsfield', model: 'wan-3.0', label: 'Wan 3.0', mode: 'clip', durations: { min: 2, max: 30 }, aspectRatios: ['9:16', '16:9'], resolutions: ['720p', '1080p'], audio: true, captions: false, inputs: ['text', 'image'], evidence: 'documented', price: { text: 'Account quote', checkedAt: '2026-10-22', source: 'https://example.com' } };
const presenter = { ...clip, provider: 'heygen', model: 'heygen-avatar', label: 'HeyGen', mode: 'presenter', durations: { min: 2, max: 300 }, resolutions: [], inputs: ['text'], captions: true };
const settings = helper.videoSettingsForRoute(clip, 'ru-RU');
const makeDraft = () => ({ id: draftId, pieceId, pieceRevision: 'source-revision', version: 1, brief: { intent: '', audience: '', keyMessage: 'Launch facts', visualIntent: '', prompt: fact, script: fact, scriptPolicy: 'exact', sourceLocale: 'ru', outputLocale: 'ru-RU', facts: [{ text: fact, sourceId: pieceId, policy: 'must_include' }], avoidImplications: [], referenceMediaIds: [] }, settings: { ...settings } });
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => structuredClone(body) });
const request = async (url, init = {}) => {
  const method = init.method ?? 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url, method, body });
  if (url === '/media/video-catalog') return response({ routes: [clip, presenter], settings: { usageMode: 'workspace_key', effective: {higgsfield: {available: true, hasKey: true}, heygen: {available: true, hasKey: true}} }, assets: { avatars: [{ id: 'stock-avatar', name: 'Stock presenter', engines: ['avatar_iii'] }], voices: [{ id: 'stock-voice', name: 'Russian voice' }] } });
  if (url === '/media/video-access') return response({workspaceEnabled: false, providers: [{provider: 'higgsfield', enabled: false, trial: false}, {provider: 'heygen', enabled: false, trial: true}], connections: []});
  if (url === '/content-intelligence/pieces') return response({ pieces: [{ id: pieceId, title: 'Original article' }] });
  if (url.startsWith('/media/video-prompts?')) return response(stored ? [stored] : []);
  if (url === `/media/video-prompts/${draftId}` && method === 'GET') return response(stored);
  if (url === '/media/video-prompts' && method === 'POST') { stored = makeDraft(); stored.settings = body.settings; stored.brief.outputLocale = body.settings.locale; return response(stored); }
  if (url === `/media/video-prompts/${draftId}` && method === 'PUT') { stored = { ...stored, version: stored.version + 1, brief: body.brief, settings: body.settings }; return response(stored); }
  if (url === '/media/video-v2/preflight' && method === 'POST') {
    if (unknownPrice) return response({code: 'VIDEO_PRICE_UNAVAILABLE'}, false);
    const expiresAt = new Date(Date.now() + 300000).toISOString();
    return response({id: `quote-${stored.version}`, preflightId: `quote-${stored.version}`, draftId, version: stored.version, access: body.access, brief: stored.brief, settings: stored.settings, quote: {amount: '0.5', unit: 'USD', source: 'fixture', asOf: new Date().toISOString(), expiresAt, upperBound: null}, expiresAt, accountGeneration: null, perJob: '1', perMonth: null, remaining: null, providerBillingCap: false});
  }
  if (['/media/video-v2/jobs', '/media/video-jobs'].includes(url) && method === 'POST') { if (failLaunchOnce) { failLaunchOnce = false; throw new Error('lost response'); } currentJob = { id: 'job-1', draftId, pieceId, state: 'accepted', access: {kind: 'api', payer: 'workspace_key'}, snapshot: { brief: stored.brief, settings: stored.settings }, result: null, canCancel: false }; return response(currentJob); }
  if (url.endsWith('/download')) return { ok: !failDownload, status: failDownload ? 500 : 200, blob: async () => new Blob(['fixture-video-bytes'], { type: 'video/mp4' }) };
  if (url.endsWith('/retry-save')) { currentJob = { ...currentJob, state: 'completed', result: { id: 'owned-media', path: '/owned/fixture.mp4', name: 'fixture.mp4' } }; return response(currentJob); }
  if (url === '/media/video-v2/jobs/job-1') return response({...currentJob, access: currentJob.access ?? {kind: 'api', payer: 'workspace_key'}});
  if (url.startsWith('/media/video-v2/jobs')) return response(currentJob ? [{...currentJob, access: currentJob.access ?? {kind: 'api', payer: 'workspace_key'}}] : []);
  throw new Error(`Unexpected request ${method} ${url}`);
};
// Compile the shared approval module once, outside each UI interaction's timeout.
const { ApprovalCard } = loadWithMocks('apps/frontend/src/components/agents/agent.cards.tsx', {
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (key, fallback) => en[key] || fallback },
  '../layout/user.context': { useUser: () => ({ orgId: 'workspace-1' }) },
});
const { agentWordsFor } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');

const { VideoWorkspace } = loadWithMocks('apps/frontend/src/components/videos/video.workspace.tsx', {
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (key, fallback) => en[key] || fallback },
  '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => 'en' },
  '../layout/user.context': { useUser: () => ({ id: actorId, orgId: 'workspace-1', role }) },
  '../media/media.component': { useOpenMediaBox: () => callback => callback([{ id: '33333333-3333-4333-8333-333333333333', path: '/owned/reference.png' }]) },
});
function CaptureReaders() { mutateReaders = useSWRConfig().mutate; return null; }
const draw = (props = {}) => render(React.createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0, revalidateOnFocus: false, errorRetryCount: 0 } }, React.createElement(React.Fragment, null, React.createElement(CaptureReaders), React.createElement(VideoWorkspace, { pieceId, draftId, ...props }))));
const button = (view, key) => within(view.container).getByRole('button', { name: en[`video_v1_${key}`], exact: true });
const loaded = async view => waitFor(() => expect(view.container.querySelector('#video-prompt')).not.toBeNull());
const selectApi = async view => { await act(async () => fireEvent.change(view.container.querySelector('#video-access-method'), {target: {value: 'api'}})); expect(view.container.querySelector('#video-access-method').value).toBe('api'); };
const check = async view => { await selectApi(view); await act(async () => fireEvent.click(button(view, 'preflight'))); await waitFor(() => expect(button(view, 'launch').disabled).toBe(false)); };
beforeEach(() => { calls = []; stored = makeDraft(); currentJob = null; unknownPrice = false; failLaunchOnce = false; failDownload = false; role = 'EDITOR'; sessionStorage.clear(); localStorage.clear(); window.history.replaceState(null, '', '/media?video=1'); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

test('saved facts and exact script survive reopening; mounting makes no write or paid request', async () => {
  stored.settings = { ...helper.videoSettingsForRoute(presenter, 'ru-RU'), avatarId: 'stock-avatar', voiceId: 'stock-voice', engine: 'avatar_iii' };
  const view = draw(); await loaded(view);
  expect(view.container.querySelector('#video-script').value).toBe(fact);
  expect(view.container.querySelector('input[name="video-output-locale"]').value).toBe('ru-RU');
  expect(view.container.querySelector('#video-access-method').value).toBe('api');
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

test('a first visit requires an explicit access choice and choosing API never submits', async () => {
  const view = draw({draftId: undefined});
  await waitFor(() => expect(view.container.querySelector('#video-mode')).not.toBeNull());
  expect(view.container.querySelector('#video-access-method').value).toBe('');
  expect(button(view, 'launch').disabled).toBe(true);
  await selectApi(view);
  expect(button(view, 'launch').disabled).toBe(true);
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

test.each(['api', 'subscription', 'manual'])('opening a %s chat result by job ID loads its draft and preserves access without submitting', async kind => {
  currentJob = {id: 'job-1', draftId, pieceId, state: 'completed', snapshot: {brief: stored.brief, settings: stored.settings}, result: {id: 'owned-media', path: '/owned/fixture.mp4', name: 'fixture.mp4'}, access: kind === 'api' ? {kind, payer: 'workspace_key'} : kind === 'subscription' ? {kind, connectionId: 'personal'} : {kind}, cost: {amount: null, unit: kind === 'api' ? 'USD' : 'higgsfield_credit', certainty: kind === 'manual' ? 'external_unknown' : 'unknown'}};
  const view = draw({draftId: undefined, jobId: 'job-1'}); await loaded(view);
  expect(view.container.querySelector('#video-prompt').value).toBe(fact);
  expect(view.container.querySelector('#video-access-method').value).toBe(kind);
  if (kind === 'manual') {
    expect(within(view.container).getByRole('button', {name: 'Copy text and settings'}).disabled).toBe(false);
    expect(view.container.querySelector('[data-video-job-id="job-1"]').textContent).not.toContain(en.video_v1_actualCost);
  }
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

test('editing invalidates preflight; save preserves content and a fresh quote is required', async () => {
  const view = draw(); await loaded(view); await check(view);
  expect(calls.find(call => call.url === '/media/video-v2/preflight').body).toEqual({draftId, version: 1, access: {kind: 'api', payer: 'workspace_key'}});
  await act(async () => fireEvent.change(view.container.querySelector('#video-prompt'), { target: { value: `${fact}\nПлавное движение камеры.` } }));
  expect(button(view, 'launch').disabled).toBe(true);
  expect(button(view, 'preflight').disabled).toBe(true);
  await act(async () => fireEvent.click(button(view, 'save')));
  await waitFor(() => expect(stored.version).toBe(2));
  expect(stored.brief.prompt).toContain('Плавное движение камеры.');
  expect(stored.brief.facts[0].text).toBe(fact);
  expect(button(view, 'launch').disabled).toBe(true);
  expect(calls.filter(call => ['/media/video-v2/jobs', '/media/video-jobs'].includes(call.url) && call.method === 'POST')).toHaveLength(0);
});

test('unknown price keeps generation disabled and visible', async () => {
  unknownPrice = true;
  const view = draw(); await loaded(view);
  await selectApi(view);
  await act(async () => fireEvent.click(button(view, 'preflight')));
  await waitFor(() => expect(view.container.textContent).toContain(en.video_v1_unknown));
  expect(button(view, 'launch').disabled).toBe(true);
});

test('lost submit response retains one intent; an explicit retry sends the identical request', async () => {
  failLaunchOnce = true;
  const view = draw(); await loaded(view); await check(view);
  await act(async () => fireEvent.click(button(view, 'launch')));
  await waitFor(() => expect(view.container.textContent).toContain(en.video_v1_uncertain));
  expect(JSON.parse(sessionStorage.getItem(accessHelper.videoPendingKeyV2('workspace-1', actorId, draftId))).draftId).toBe(draftId);
  await act(async () => fireEvent.click(button(view, 'retrySubmit')));
  await waitFor(() => expect(view.container.querySelector('[data-video-job-id="job-1"]')).not.toBeNull());
  const submissions = calls.filter(call => call.url === '/media/video-v2/jobs' && call.method === 'POST');
  expect(submissions).toHaveLength(2);
  expect(submissions[1].body).toEqual(submissions[0].body);
  expect(submissions[0].body).toEqual({preflightId: 'quote-1', intentId: expect.any(String)});
  expect(sessionStorage.getItem(accessHelper.videoPendingKeyV2('workspace-1', actorId, draftId))).toBeNull();
  expect(calls.some(call => call.url === '/media/video-jobs')).toBe(false);
});

test('reloading with an unresolved local intent never resubmits automatically', async () => {
  sessionStorage.setItem(helper.videoPendingKey('workspace-1', draftId), JSON.stringify({ draftId, version: 1, preflightId: 'quote-1', intentId: 'same-logical-intent' }));
  const view = draw(); await loaded(view);
  expect(view.container.textContent).toContain(en.video_v1_uncertain);
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

test('an explicit retry of a retained V1 API intent keeps its original API-only request', async () => {
  const intent = {draftId, version: 1, preflightId: 'quote-1', intentId: 'same-logical-intent'};
  sessionStorage.setItem(helper.videoPendingKey('workspace-1', draftId), JSON.stringify(intent));
  const view = draw(); await loaded(view);
  expect(calls.every(call => call.method === 'GET')).toBe(true);
  expect(view.container.querySelector('#video-access-method').value).toBe('api');
  await act(async () => fireEvent.click(button(view, 'retrySubmit')));
  await waitFor(() => expect(view.container.querySelector('[data-video-job-id="job-1"]')).not.toBeNull());
  expect(calls.filter(call => call.method === 'POST')).toEqual([{url: '/media/video-jobs', method: 'POST', body: intent}]);
  expect(sessionStorage.getItem(helper.videoPendingKey('workspace-1', draftId))).toBeNull();
});

test.each(['clip', 'presenter'])('%s completed job reopens an owned player and download without a new generation', async mode => {
  currentJob = { id: 'job-1', draftId, pieceId, state: 'completed', snapshot: { settings: { ...settings, mode } }, result: { id: 'owned-media', path: '/owned/fixture.mp4', name: 'saved.mp4' } };
  const view = draw({ jobId: 'job-1' }); await loaded(view);
  await waitFor(() => expect(view.container.querySelector('video')?.getAttribute('src')).toBe('/owned/fixture.mp4'));
  const createUrl = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:owned-download');
  const revokeUrl = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let clicked;
  jest.spyOn(dom.window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicked = { href: this.href, filename: this.download }; });
  await act(async () => fireEvent.click(button(view, 'download')));
  await waitFor(() => expect(clicked).toEqual({ href: 'blob:owned-download', filename: 'saved.mp4' }));
  expect(createUrl).toHaveBeenCalledTimes(1);
  expect(calls.some(call => call.url === '/media/video-v2/jobs/job-1/download')).toBe(true);
  expect(calls.some(call => call.url === '/owned/fixture.mp4')).toBe(false);
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

test('failed ingestion retries only saving, never generation; unsupported cancel is absent', async () => {
  currentJob = { id: 'job-1', draftId, pieceId, state: 'save_failed', canCancel: false, result: null };
  const view = draw({ jobId: 'job-1' }); await loaded(view);
  await waitFor(() => expect(button(view, 'retrySave')).toBeTruthy());
  expect(within(view.container).queryByRole('button', { name: en.video_v1_cancel })).toBeNull();
  await act(async () => fireEvent.click(button(view, 'retrySave')));
  await waitFor(() => expect(view.container.querySelector('video')).not.toBeNull());
  expect(calls.filter(call => call.method === 'POST').map(call => call.url)).toEqual(['/media/video-v2/jobs/job-1/retry-save']);
});

test('the one-second approval clock does not starve four-second job and history polling', async () => {
  jest.useFakeTimers();
  try {
    currentJob = {id: 'job-1', draftId, pieceId, state: 'accepted', result: null};
    const view = draw({jobId: 'job-1'}); await loaded(view);
    await waitFor(() => expect(view.container.querySelector('[data-video-job-state="accepted"]')).not.toBeNull());
    const statusReads = calls.filter(call => call.url === '/media/video-v2/jobs/job-1').length;
    const historyReads = calls.filter(call => call.url === `/media/video-v2/jobs?pieceId=${pieceId}`).length;
    currentJob = {...currentJob, state: 'completed', result: {id: 'owned', path: '/owned/fixture.mp4', name: 'saved.mp4'}};
    for (let second = 0; second < 5; second++) await act(async () => { jest.advanceTimersByTime(1000); });
    expect(calls.filter(call => call.url === '/media/video-v2/jobs/job-1').length).toBeGreaterThan(statusReads);
    expect(calls.filter(call => call.url === `/media/video-v2/jobs?pieceId=${pieceId}`).length).toBeGreaterThan(historyReads);
    expect(view.container.querySelector('[data-video-job-state="completed"] video')?.getAttribute('src')).toBe('/owned/fixture.mp4');
    expect(calls.every(call => call.method === 'GET')).toBe(true);
  } finally { cleanup(); jest.useRealTimers(); }
});


test('failed authenticated download leaves the owned player and can be retried without generation', async () => {
  failDownload = true;
  currentJob = { id: 'job-1', draftId, pieceId, state: 'completed', result: { id: 'owned', path: 'https://owned.example/media.mp4', name: 'video.mp4' } };
  const view = draw({ jobId: 'job-1' }); await loaded(view);
  await waitFor(() => expect(button(view, 'download')).toBeTruthy());
  await act(async () => fireEvent.click(button(view, 'download')));
  expect(within(view.container).getByRole('alert').textContent).toContain(en.video_v1_failed);
  expect(view.container.querySelector('video').getAttribute('src')).toBe('https://owned.example/media.mp4');
  failDownload = false;
  jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:retry-download');
  jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = jest.spyOn(dom.window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await act(async () => fireEvent.click(button(view, 'download')));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(calls.filter(call => call.url.endsWith('/download'))).toHaveLength(2);
  expect(calls.every(call => call.method === 'GET')).toBe(true);
  expect(calls.some(call => call.url.startsWith('https://owned.example'))).toBe(false);
});

test('readers cannot prepare, edit, preflight, launch, or retry a paid request', async () => {
  role = 'USER';
  const view = draw(); await loaded(view);
  for (const key of ['save', 'prepare', 'preflight', 'launch']) expect(button(view, key).disabled).toBe(true);
  expect(view.container.querySelector('#video-prompt').disabled).toBe(true);
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

test('all interface locales supply every video label without falling back to English', () => {
  const { VIDEO_WORDS_V1 } = loadWithMocks('apps/frontend/src/components/videos/video.copy.ts', { '@contentfactory/react/translation/get.transation.service.client': { useT: () => (key, fallback) => fallback } });
  for (const locale of ['ar','bn','de','en','es','fr','he','it','ja','ka_ge','ko','pt','ru','tr','vi','zh']) {
    const file = path.resolve(__dirname, `../libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`);
    const copy = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of Object.keys(VIDEO_WORDS_V1)) expect(copy[`video_v1_${key}`]).toEqual(expect.any(String));
  }
});

test('quotes bind exact draft/version, expiry, known price and limit; route choice makes presenter audio explicit', () => {
  const draft = makeDraft();
  const quote = { id: draftId, version: 1, preflightId: 'q', maxCostUsd: 1, estimate: { usd: 0.5, expiresAt: '2040-01-01T01:00:00Z' } };
  const now = Date.parse('2040-01-01T00:00:00Z');
  expect(helper.videoCanLaunch(draft, quote, false, now)).toBe(true);
  for (const other of [{ ...quote, version: 2 }, { ...quote, id: 'foreign-draft' }, { ...quote, maxCostUsd: 0.1 }, { ...quote, estimate: { ...quote.estimate, usd: null } }, { ...quote, estimate: { ...quote.estimate, expiresAt: '2039-01-01T00:00:00Z' } }]) expect(helper.videoCanLaunch(draft, other, false, now)).toBe(false);
  expect(helper.videoCanLaunch(draft, quote, true, now)).toBe(false);
  expect(helper.videoSettingsForRoute(presenter, 'ja-JP').audio).toBe(true);
  expect(helper.videoWorkspacePath({ pieceId: 'p/?', jobId: 'j&' })).toBe('/media?video=1&pieceId=p%2F%3F&jobId=j%26');
});


test('blob download releases its temporary URL and rejects a non-video attachment', async () => {
  jest.useFakeTimers();
  const createUrl = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download-cleanup');
  const revokeUrl = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  jest.spyOn(dom.window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    await helper.downloadOwnedVideoV1(async () => ({ ok: true, blob: async () => new Blob(['video'], { type: 'video/mp4' }) }), 'job/1', 'saved.mp4');
    expect(createUrl).toHaveBeenCalledTimes(1);
    jest.runOnlyPendingTimers();
    expect(revokeUrl).toHaveBeenCalledWith('blob:download-cleanup');
    await expect(helper.downloadOwnedVideoV1(async () => ({ ok: true, blob: async () => new Blob(['login'], { type: 'text/html' }) }), 'job', 'wrong.mp4')).rejects.toThrow('VIDEO_DOWNLOAD_FAILED');
  } finally { jest.useRealTimers(); }
});

test('chat video artifacts stay distinct from the library and each other after persistence', () => {
  const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
  const workspace = loadTypeScriptModule('apps/frontend/src/components/agents/agent.workspace-state.ts');
  const library = { kind: 'media', id: 'library', title: null, code: null, data: {} };
  const first = { ...library, data: { videoJobId: 'job-1', videoDraftId: 'draft-1', pieceId } };
  const second = { ...library, data: { videoJobId: 'job-2', videoDraftId: 'draft-2', pieceId } };
  expect(new Set([library, first, second].map(contract.artifactKey)).size).toBe(3);
  expect(contract.artifactHref(first)).toContain('jobId=job-1');
  const refs = [library, first, second].map(contract.artifactRefOf);
  const saved = contract.readAgentWorkspace({ version: 'assistant-workspace/v1', workContext: null, artifacts: refs, activeArtifact: refs[1] });
  const restored = workspace.artifactWorkspaceReducer(workspace.emptyArtifactWorkspace(false), { type: 'restore', artifacts: refs.map(contract.refToArtifact), workspace: saved });
  expect(restored.artifacts).toHaveLength(3);
  expect(workspace.persistedArtifactSelection(restored).activeArtifact.data.videoJobId).toBe('job-1');
});

test('embedded save, draft selection and launch retain the conversation URL', async () => {
  window.history.replaceState(null, '', '/agents/owned-thread');
  const view = draw({ embedded: true }); await loaded(view);
  await act(async () => fireEvent.change(view.container.querySelector('#video-prompt'), { target: { value: `${fact}\nСохранённая правка.` } }));
  await act(async () => fireEvent.click(button(view, 'save')));
  await waitFor(() => expect(stored.version).toBe(2));
  expect(window.location.pathname).toBe('/agents/owned-thread');
  await act(async () => fireEvent.change(view.container.querySelector('#video-draft-picker'), { target: { value: draftId } }));
  expect(window.location.pathname).toBe('/agents/owned-thread');
  await check(view);
  await act(async () => fireEvent.click(button(view, 'launch')));
  await waitFor(() => expect(view.container.querySelector('[data-video-job-id="job-1"]')).not.toBeNull());
  expect(window.location.pathname).toBe('/agents/owned-thread');
});

test('a completed chat edit refreshes the retained saved draft through its exact SWR reader', async () => {
  const { artifactReadMatches } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.revalidate.ts');
  const artifact = { kind: 'media', id: 'library', data: { videoDraftId: draftId, pieceId } };
  const view = draw({ embedded: true }); await loaded(view);
  stored = { ...stored, version: 2, brief: { ...stored.brief, prompt: `${fact}\nПравка из чата.` } };
  await act(async () => mutateReaders(key => artifactReadMatches(artifact, key)));
  await waitFor(() => expect(view.container.querySelector('#video-prompt').value).toBe(stored.brief.prompt));
  expect(calls.filter(call => call.url === `/media/video-prompts/${draftId}`)).toHaveLength(2);
});

test('a concurrent chat edit preserves dirty manual text and offers an explicit current-version reload', async () => {
  const { artifactReadMatches } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.revalidate.ts');
  const artifact = { kind: 'media', id: 'library', data: { videoDraftId: draftId, pieceId } };
  const view = draw({ embedded: true }); await loaded(view);
  const manual = `${fact}\nНесохранённая ручная правка.`;
  await act(async () => fireEvent.change(view.container.querySelector('#video-prompt'), { target: { value: manual } }));
  stored = { ...stored, version: 2, brief: { ...stored.brief, prompt: `${fact}\nНовая сохранённая версия.` } };
  await act(async () => mutateReaders(key => artifactReadMatches(artifact, key)));
  await waitFor(() => expect(view.container.textContent).toContain(en.video_v1_draftChanged));
  expect(view.container.querySelector('#video-prompt').value).toBe(manual);
  expect(button(view, 'save').disabled).toBe(true);
  await act(async () => fireEvent.click(button(view, 'reloadDraft')));
  await waitFor(() => expect(view.container.querySelector('#video-prompt').value).toBe(stored.brief.prompt));
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

test('media query changes and back navigation switch the existing page between library and exact video', () => {
  let query = new URLSearchParams();
  const { MediaLayoutComponent } = loadWithMocks('apps/frontend/src/components/new-layout/layout.media.component.tsx', {
    'next/navigation': { useSearchParams: () => query },
    'next/dynamic': () => function RetainedVideo(props) { const [opened] = React.useState(props.draftId); return React.createElement('div', { 'data-open-video': opened, 'data-piece': props.pieceId }); },
    '@contentfactory/frontend/components/media/media.component': { MediaBox: () => React.createElement('div', { 'data-media-library': true }) },
    '../videos/video.entry': { VideoMediaEntry: () => null },
  });
  const view = render(React.createElement(MediaLayoutComponent));
  expect(view.container.querySelector('[data-media-library]')).not.toBeNull();
  query = new URLSearchParams({ video: '1', pieceId, draftId });
  view.rerender(React.createElement(MediaLayoutComponent));
  expect(view.container.querySelector('[data-open-video]')?.getAttribute('data-open-video')).toBe(draftId);
  query = new URLSearchParams({ video: '1', pieceId, draftId: 'other-draft' });
  view.rerender(React.createElement(MediaLayoutComponent));
  expect(view.container.querySelector('[data-open-video]')?.getAttribute('data-open-video')).toBe('other-draft');
  query = new URLSearchParams();
  view.rerender(React.createElement(MediaLayoutComponent));
  expect(view.container.querySelector('[data-media-library]')).not.toBeNull();
});

test('paid video approval shows the exact saved script/settings and never promises cancellation', async () => {
  const words = agentWordsFor('en');
  stored.preflightId = 'quote-1';
  stored.settings = { ...helper.videoSettingsForRoute(presenter, 'ru'), avatarId: 'stock-avatar', voiceId: 'stock-voice', engine: 'avatar_iii' };
  const answer = jest.fn();
  const view = render(React.createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0, errorRetryCount: 0 } }, React.createElement(ApprovalCard, {
    title: 'Launch video', reason: 'Estimate 0.50 USD; reservation 1 USD', irreversible: false, toolName: 'video_launch', state: 'asked', busy: false, words, onAnswer: answer,
    videoApproval: { draftId, version: 1, preflightId: 'quote-1' },
  })));
  const yes = within(view.container).getByRole('button', { name: words.approval.yes });
  expect(yes.disabled).toBe(true);
  await waitFor(() => expect(view.container.textContent).toContain(fact));
  await waitFor(() => expect(yes.disabled).toBe(false));
  expect(view.container.textContent).toContain('stock-avatar');
  expect(view.container.textContent).toContain('avatar_iii');
  expect(view.container.textContent).toContain(en.video_v1_paymentNote);
  expect(view.container.textContent).not.toContain(words.approval.reversibleNote);
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

test('paid approval refuses a changed saved draft while leaving decline and refresh available', async () => {
  const words = agentWordsFor('en');
  stored.version = 2; stored.preflightId = 'quote-2';
  const view = render(React.createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0, errorRetryCount: 0 } }, React.createElement(ApprovalCard, {
    title: 'Launch video', reason: 'Estimate 0.50 USD; reservation 1 USD', irreversible: false, toolName: 'video_launch', state: 'asked', busy: false, words, onAnswer: jest.fn(),
    videoApproval: { draftId, version: 1, preflightId: 'quote-1' },
  })));
  await waitFor(() => expect(view.container.textContent).toContain(en.video_v1_approvalChanged));
  expect(within(view.container).getByRole('button', {name: words.approval.yes}).disabled).toBe(true);
  expect(within(view.container).getByRole('button', {name: words.approval.no}).disabled).toBe(false);
  expect(within(view.container).getByRole('button', {name: en.video_v1_refresh})).toBeTruthy();
});

test('video selection, route, native edit completion and approval projection keep exact identities', () => {
  const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
  const { assistantRouteContext, assistantContextKey } = loadTypeScriptModule('apps/frontend/src/components/agents/assistant.route-context.ts');
  const { artifactReadMatches } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.revalidate.ts');
  const artifact = { kind: 'media', id: 'library', title: null, code: null, data: {pieceId, videoDraftId: draftId, videoJobId: 'job-1'} };
  const context = contract.artifactContextOf(artifact);
  expect(contract.readAgentWorkContext(context)).toEqual(context);
  expect(assistantRouteContext('/media', `?video=1&pieceId=${pieceId}&draftId=${draftId}&jobId=job-1`)).toEqual(context);
  expect(assistantContextKey(context)).not.toBe(assistantContextKey({...context, videoDraftId: 'other-draft'}));
  const messages = [{id: 'reply', role: 'assistant', parts: [{type: 'tool-video_edit', toolCallId: 'edit-1', state: 'output-available', input: {draftId}, output: {ok: true, card: {kind: 'media', id: 'library', videoDraftId: draftId}}}]}];
  const touch = contract.videoTouchesOf(messages)[0];
  expect(touch.key).toBe('reply:edit-1');
  expect(artifactReadMatches(touch.artifact, [`/media/video-prompts/${draftId}`, 'workspace-1'])).toBe(true);
  expect(artifactReadMatches(touch.artifact, ['/media/video-prompts/other-draft', 'workspace-1'])).toBe(false);
  expect(artifactReadMatches(touch.artifact, ['/media/video-prompts?pieceId=other-piece', 'foreign-workspace'])).toBe(false);
  const scope = {draftId, version: 1, preflightId: 'quote-1'};
  const blocks = contract.readMessageBlocks({id: 'approval', role: 'assistant', parts: [{type: 'tool-video_launch', toolCallId: 'launch-1', title: 'Launch video', state: 'approval-requested', input: {...scope, requestMessageId: 'author'}, approval: {id: 'approval-1', requestReason: 'Estimate and reservation'}}]});
  expect(blocks.find(block => block.type === 'approval').videoApproval).toEqual(scope);
});
