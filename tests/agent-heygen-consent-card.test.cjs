'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/agents/original-thread'});
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, {configurable: true, value: dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT = true;
const {render, cleanup, within, waitFor, act, fireEvent} = require('@testing-library/react');
const {SWRConfig} = require('swr');
const {loadWithMocks} = require('./helpers/load-ts-with-mocks.cjs');
const {loadTypeScriptModule} = require('./helpers/load-tsx.cjs');
const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const words = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy.ru;
const now = Date.parse('2030-01-01T00:00:00.000Z');
const ref = {id: 'opaque-handle', threadId: 'original-thread', name: 'Личный аватар', expiresAt: '2030-01-02T00:00:00.000Z'};
let requests, response, status, actor, hold;
const {HeygenConsentCard, readHeygenConsentLink} = loadWithMocks('apps/frontend/src/components/agents/agent.heygen-consent-card.tsx', {
  react: React, swr: require('swr'),
  '@contentfactory/helpers/utils/custom.fetch': {useFetch: () => async (url, init) => {
    requests.push({url, ...init});
    if (hold) await new Promise(resolve => {hold = resolve;});
    return {ok: status === 200, status, json: async () => response};
  }},
  '../layout/user.context': {useUser: () => actor},
});
function draw({consent = ref, cache = new Map()} = {}) {
  return render(React.createElement(SWRConfig, {value: {provider: () => cache, dedupingInterval: 0, loadingTimeout: 0}},
    React.createElement(HeygenConsentCard, {consent, words})));
}
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  requests = []; status = 200; hold = null; actor = {id: 'actor', orgId: 'workspace'};
  response = {url: 'https://heygen.com/consent/example-token?code=browser-only', expiresAt: ref.expiresAt};
});
afterEach(() => {cleanup(); jest.restoreAllMocks();});
afterAll(() => dom.window.close());

test('restored native card contains an opaque reference only and never becomes a workspace artifact', () => {
  const data = {kind: 'heygen-consent', ...ref};
  const message = {id: 'saved', role: 'assistant', parts: [
    {type: 'tool-video_avatar_consent', toolCallId: 'issue', title: 'Согласие для аватара', state: 'output-available', output: {ok: true, card: {kind: data.kind, id: data.id}}},
    {type: 'data-heygen-consent', data},
  ]};
  const before = JSON.stringify(message);
  expect(contract.readMessageBlocks(JSON.parse(before))).toEqual([{type: 'heygen-consent', key: 'saved:1', consent: ref}]);
  expect(contract.artifactsOf([message])).toEqual([]);
  expect(contract.INLINE_CARD_KINDS).toContain('heygen-consent');
  expect(contract.readHeygenConsentRef({...data, url: response.url})).toBeNull();
  expect(contract.readHeygenConsentRef({...data, threadId: '../foreign'})).toBeNull();
  expect(JSON.stringify(message)).toBe(before);
  expect(before).not.toContain(response.url);
});

test.each([false, true])('restores the same opaque ref when persisted native history omits its data-part (wrapped=%s)', wrapped => {
  const value = {handle: ref.id, ownerThreadId: ref.threadId, name: ref.name, expiresAt: ref.expiresAt};
  const part = {type: 'tool-video_avatar_consent', toolCallId: 'issued', title: 'Согласие для аватара', state: 'output-available', output: {
    ok: true, card: {kind: 'heygen-consent', id: ref.id}, summary: wrapped ? {untrustedData: {value}} : value,
  }};
  const message = {id: 'restored', role: 'assistant', parts: [part]};
  expect(contract.readMessageBlocks(message)).toEqual([{type: 'heygen-consent', key: 'restored:0', consent: ref}]);
  expect(contract.readMessageBlocks({...message, parts: [...message.parts, {type: 'data-heygen-consent', data: {kind: 'heygen-consent', ...ref}}]})).toHaveLength(1);
  expect(contract.artifactsOf([message])).toEqual([]);
  const mismatch = structuredClone(message);
  mismatch.parts[0].output.card.id = 'different-handle';
  expect(contract.readMessageBlocks(mismatch)).toEqual([]);
});

test.each(['heygen.com', 'www.heygen.com', 'app.heygen.com'])('accepts only the agreed HTTPS consent URL on %s', host => {
  const url = `https://${host}/consent/example-token?code=browser-only`;
  expect(readHeygenConsentLink({url, expiresAt: ref.expiresAt})).toEqual({url, expiresAt: ref.expiresAt});
});
test('accepts the provider-observed avatar consent recording page', () => {
  const url='https://app.heygen.com/avatars/api-video/record?token=synthetic-token_123';
  expect(readHeygenConsentLink({url,expiresAt:ref.expiresAt})).toEqual({url,expiresAt:ref.expiresAt});
});
test.each([
  'https://heygen.com.attacker.test/consent/token', 'https://attacker.test/consent/token',
  'https://other.heygen.com/consent/token', 'http://heygen.com/consent/token',
  'https://actor:secret@heygen.com/consent/token', 'https://heygen.com:8443/consent/token',
  'https://heygen.com/consent/token#secret', 'https://heygen.com/consent/', 'https://heygen.com/redirect/token',
  'https://app.heygen.com/avatars/api-video/record', 'https://heygen.com/avatars/api-video/record?token=x',
  'https://app.heygen.com/avatars/api-video/record?token=x&redirect=https%3A%2F%2Fevil.example',
  'https://app.heygen.com/avatars/api-video/record?token=x&token=y',
])('rejects unsafe browser URLs without exposing the value: %s', url => {
  expect(readHeygenConsentLink({url, expiresAt: ref.expiresAt})).toBeNull();
});

test('reload reads the issued handle and immediately shows a native link, with no send or issuance action', async () => {
  const view = draw();
  const link = await within(view.container).findByRole('link', {name: 'Дать согласие в HeyGen'});
  expect(link.href).toBe(response.url);
  expect(link.target).toBe('_blank');
  expect(link.rel).toBe('noopener noreferrer');
  expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(requests).toEqual([{url: '/agent/threads/original-thread/heygen-consent/opaque-handle', method: 'GET', cache: 'no-store'}]);
  expect(view.container.textContent).toContain('Одноразовая ссылка');
  expect(view.container.textContent).toContain('Если уже отправили согласие, дождитесь проверки HeyGen');
  expect(view.container.textContent).not.toContain('browser-only');
  view.unmount();
  const restored = draw();
  await within(restored.container).findByRole('link', {name: 'Дать согласие в HeyGen'});
  expect(requests).toHaveLength(2);
  expect(requests.every(request => request.method === 'GET')).toBe(true);
});

test('loading, expired and unavailable states expose no link; retry only reads the same handle', async () => {
  hold = true;
  const view = draw();
  expect(view.container.textContent).toContain('Загружаю ссылку');
  expect(within(view.container).queryByRole('link')).toBeNull();
  status = 503;
  await act(async () => hold());
  await waitFor(() => expect(view.container.textContent).toContain('Не удалось загрузить ссылку'));
  status = 200; hold = null;
  await act(async () => fireEvent.click(within(view.container).getByRole('button', {name: 'Повторить загрузку'})));
  await within(view.container).findByRole('link', {name: 'Дать согласие в HeyGen'});
  expect(requests.every(request => request.method === 'GET' && request.url.endsWith('/opaque-handle'))).toBe(true);
  view.unmount();
  const expired = draw({consent: {...ref, expiresAt: '2029-12-31T23:59:59.000Z'}});
  expect(expired.container.textContent).toContain('Срок действия ссылки истёк');
  expect(within(expired.container).queryByRole('link')).toBeNull();
  expect(requests).toHaveLength(2);
});

test('original thread ownership is rechecked after reload and another actor never reuses a cached bearer link', async () => {
  const cache = new Map();
  const original = draw({cache});
  await within(original.container).findByRole('link');
  original.unmount();
  status = 403;
  const unavailable = draw({cache});
  expect(within(unavailable.container).queryByRole('link')).toBeNull();
  await waitFor(() => expect(unavailable.container.textContent).toContain('Ссылка недоступна'));
  expect(within(unavailable.container).queryByRole('link')).toBeNull();
  expect(requests[1].url).toBe('/agent/threads/original-thread/heygen-consent/opaque-handle');
  unavailable.unmount();
  actor = {id: 'another-actor', orgId: 'workspace'};
  const changed = draw({cache});
  await waitFor(() => expect(changed.container.textContent).toContain('Ссылка недоступна'));
  expect(within(changed.container).queryByRole('link')).toBeNull();
  expect(requests).toHaveLength(3);
});

test.each([410, 200])('an expired read or unsafe response never exposes a link or repeats issuance (status=%s)', async failureStatus => {
  status = failureStatus;
  response = {...response, url: 'https://foreign.example/consent/not-a-provider-link'};
  const view = draw();
  await waitFor(() => expect(view.container.textContent).toContain(status === 410 ? 'Срок действия ссылки истёк' : 'Ссылка недоступна'));
  expect(within(view.container).queryByRole('link')).toBeNull();
  expect(within(view.container).queryByRole('button')).toBeNull();
  expect(view.container.innerHTML).not.toContain(response.url);
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe('GET');
});
