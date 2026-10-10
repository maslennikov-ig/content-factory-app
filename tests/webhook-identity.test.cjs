'use strict';

const { fixture } = require('./helpers/webhook-identity.module.cjs');
const { BASE_TIME, runClockWorkflow } = require('./helpers/automation-deadlines.module.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const originalFetch = global.fetch;
const originalOptOut = process.env.DISABLE_SSRF_PROTECTION;
const identity = { localPostId: 'local-post', organizationId: 'org', integrationId: 'channel' };
const response = status => ({ ok: status >= 200 && status < 300, status,
  body: { cancel: jest.fn(async () => {}) } });
let warnings;
beforeEach(() => {
  delete process.env.DISABLE_SSRF_PROTECTION;
  warnings = jest.spyOn(console, 'warn').mockImplementation(() => {});
  global.fetch = jest.fn(async () => response(200));
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalOptOut === undefined) delete process.env.DISABLE_SSRF_PROTECTION;
  else process.env.DISABLE_SSRF_PROTECTION = originalOptOut;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('legacy V105 retains its recorded provider-ID argument and empty-payload behavior', async () => {
  jest.useFakeTimers({ now: BASE_TIME });
  const f = fixture();
  const requests = [];
  global.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, status: 200 }; };
  const calls = await runClockWorkflow(5, { post: f.post, global: [],
    webhook: (...args) => f.old().sendWebhooks(...args) });
  expect(calls.webhooks[0][0]).toBe('remote-post');
  expect(requests).toHaveLength(1);
  expect(requests[0]).toEqual([]);
});

test('V108 actual workflow/activity/service/repository sends the scoped local post and separate provider ID', async () => {
  jest.useFakeTimers({ now: BASE_TIME });
  const f = fixture();
  const calls = await runClockWorkflow(8, { post: f.post, global: [],
    webhook: input => f.current().sendWebhooksV108(input) });
  expect(calls.webhooks).toEqual([[identity]]);
  expect(calls.names.filter(n => n === 'postSocialV106')).toHaveLength(1);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe(f.hooks[0].url);
  expect(options.method).toBe('POST');
  expect(options.headers).toEqual({ 'Content-Type': 'application/json',
    'X-Content-Factory-Webhook-Version': '2' });
  expect(JSON.parse(options.body)).toEqual([{
    id: 'local-post', providerPostId: 'remote-post', content: f.post.content,
    publishDate: '2000-01-01T00:00:00.000Z', state: 'PUBLISHED', releaseURL: f.post.releaseURL,
    integration: { id: 'channel', name: 'Synthetic', providerIdentifier: 'synthetic', picture: null, type: 'social' },
  }]);
  expect(f.queries[0].where).toEqual({ id: 'local-post', organizationId: 'org',
    integrationId: 'channel', integration: { organizationId: 'org' }, deletedAt: null, parentPostId: null });
  expect(options.body).not.toMatch(/releaseId|organizationId|publicationJournal|token|synthetic-sensitive/);
  expect(calls.proxies.find(p => p.name === 'sendWebhooksV108').settings.retry).toEqual({ maximumAttempts: 1 });
  expect(warnings).not.toHaveBeenCalled();
});

test.each([
  ['provider ID used as local ID', f => ({ ...identity, localPostId: f.post.releaseId })],
  ['foreign post ID', f => ({ ...identity, localPostId: f.foreign.id })],
  ['foreign organization', () => ({ ...identity, organizationId: 'foreign' })],
  ['different channel', () => ({ ...identity, integrationId: 'other-channel' })],
  ['foreign integration ownership', f => { f.integration.organizationId = 'foreign'; return identity; }],
  ['foreign post ownership', f => { f.post.organizationId = 'foreign'; return identity; }],
  ['deleted root', f => { f.post.deletedAt = new Date(BASE_TIME); return identity; }],
  ['child post', f => { f.post.parentPostId = 'parent'; return identity; }],
  ['missing post', () => ({ ...identity, localPostId: 'missing' })],
])('%s refuses delivery without disclosing a row', async (_name, input) => {
  const f = fixture();
  await expect(f.current().sendWebhooksV108(input(f))).rejects.toMatchObject({
    type: 'webhook_post_unavailable', nonRetryable: true,
    details: [{ delivered: 0, failed: 0, skipped: 1 }],
  });
  expect(global.fetch).not.toHaveBeenCalled();
  expect(warnings).toHaveBeenCalledWith('webhook_delivery_failed', { reason: 'post_unavailable' });
});

test('own foreign tenant sends its own row, never the first tenant row', async () => {
  const f = fixture();
  await expect(f.current().sendWebhooksV108({ localPostId: 'foreign-post',
    organizationId: 'foreign', integrationId: 'foreign-channel' })).resolves.toEqual({ delivered: 1, failed: 0, skipped: 0 });
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe(f.hooks[1].url);
  expect(JSON.parse(options.body)[0]).toMatchObject({ id: 'foreign-post',
    content: f.foreign.content, integration: { id: 'foreign-channel' } });
});

test('only all-channel or matching-channel hooks in the same organization receive the event', async () => {
  const f = fixture();
  f.hooks.push({ organizationId: 'org', url: 'https://synthetic.invalid/matching',
    integrations: [{ integration: { id: 'channel' } }] },
    { organizationId: 'org', url: 'https://synthetic.invalid/other',
      integrations: [{ integration: { id: 'other-channel' } }] });
  await expect(f.current().sendWebhooksV108(identity)).resolves.toEqual({ delivered: 2, failed: 0, skipped: 0 });
  expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([f.hooks[0].url, f.hooks[2].url]);
});

test('no eligible hooks avoids lookup and network entirely', async () => {
  const f = fixture();
  f.hooks[0].integrations = [{ integration: { id: 'other-channel' } }];
  await expect(f.current().sendWebhooksV108(identity)).resolves.toEqual({ delivered: 0, failed: 0, skipped: 0 });
  expect(f.queries).toEqual([]);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('missing provider receipt remains explicit null, never borrowed from the local ID', async () => {
  const f = fixture();
  f.post.releaseId = null;
  await f.current().sendWebhooksV108(identity);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)[0]).toMatchObject({ id: 'local-post', providerPostId: null });
});

test.each([200, 204, 299])('HTTP %i acknowledges transport and discards the response body', async status => {
  const result = response(status);
  global.fetch.mockResolvedValue(result);
  await expect(fixture().current().sendWebhooksV108(identity)).resolves.toEqual({ delivered: 1, failed: 0, skipped: 0 });
  expect(result.body.cancel).toHaveBeenCalledTimes(1);
});

test.each([302, 401, 500])('HTTP %i is visibly failed without following redirects or automatically resending', async status => {
  global.fetch.mockResolvedValue(response(status));
  await expect(fixture().current().sendWebhooksV108(identity)).rejects.toMatchObject({
    message: 'Webhook delivery failed', type: 'webhook_delivery_failed', nonRetryable: true,
    details: [{ delivered: 0, failed: 1, skipped: 0 }],
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][1].redirect).toBe('manual');
  expect(warnings).toHaveBeenCalledWith('webhook_delivery_failed', { reason: 'http_status', status });
});

test.each([
  ['network', new Error('synthetic-sensitive-network-error')],
  ['SSRF rejection', new Error('synthetic-sensitive-private-ip')],
  ['bounded abort', new DOMException('synthetic-sensitive-timeout', 'TimeoutError')],
])('%s exposes a fixed failure without recording raw receiver/error material', async (_kind, error) => {
  const f = fixture();
  f.hooks[0].url += '?token=synthetic-sensitive-query';
  global.fetch.mockRejectedValue(error);
  let failure;
  try { await f.current().sendWebhooksV108(identity); } catch (e) { failure = e; }
  expect(failure).toMatchObject({ type: 'webhook_delivery_failed', nonRetryable: true,
    details: [{ delivered: 0, failed: 1, skipped: 0 }] });
  expect(warnings).toHaveBeenCalledWith('webhook_delivery_failed', { reason: 'transport' });
  expect(JSON.stringify({ log: warnings.mock.calls, failure })).not.toMatch(/synthetic-sensitive|https:\/\/|public text/);
});

test('failed response-body cancellation cannot turn an HTTP acknowledgement into a delivery failure', async () => {
  const result = response(200);
  result.body.cancel.mockRejectedValue(new Error('synthetic-sensitive-body'));
  global.fetch.mockResolvedValue(result);
  await expect(fixture().current().sendWebhooksV108(identity)).resolves.toEqual({ delivered: 1, failed: 0, skipped: 0 });
  expect(warnings).not.toHaveBeenCalled();
});

test('SSRF-safe dispatcher and a 30-second signal are used unless the existing explicit opt-out is set', async () => {
  const f = fixture();
  const timeout = jest.spyOn(AbortSignal, 'timeout');
  await f.current().sendWebhooksV108(identity);
  expect(global.fetch.mock.calls[0][1].dispatcher).toBe(f.dispatcher.getSsrfSafeDispatcher());
  expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  expect(timeout).toHaveBeenCalledWith(30000);
  process.env.DISABLE_SSRF_PROTECTION = 'true';
  await f.current().sendWebhooksV108(identity);
  expect(global.fetch.mock.calls[1][1].dispatcher).toBeUndefined();
});

test('a mixed batch reports counts only after the other delivery has finished', async () => {
  const f = fixture();
  f.hooks.push({ ...f.hooks[0], url: 'https://synthetic.invalid/second' });
  let finish, started;
  const secondStarted = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { finish = resolve; });
  global.fetch.mockResolvedValueOnce(response(500)).mockImplementationOnce(() => { started(); return pending; });
  let settled = false;
  const delivery = f.current().sendWebhooksV108(identity).catch(error => { settled = true; return error; });
  await secondStarted;
  expect(settled).toBe(false);
  finish(response(204));
  expect(await delivery).toMatchObject({ type: 'webhook_delivery_failed', nonRetryable: true,
    details: [{ delivered: 1, failed: 1, skipped: 0 }] });
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('a failed webhook leaves one confirmed publication and continues V108 absolute actions and repeat child', async () => {
  jest.useFakeTimers({ now: BASE_TIME });
  global.fetch.mockResolvedValue(response(500));
  const f = fixture();
  const calls = await runClockWorkflow(8, { post: f.post, actionTime: 200, repeatAt: 5000,
    webhook: input => f.current().sendWebhooksV108(input) });
  expect(calls.names.filter(n => n === 'postSocialV106')).toHaveLength(1);
  expect(calls.webhooks).toHaveLength(1);
  expect(calls.actions.map(action => action.at)).toEqual([1000, 2000, 3000]);
  expect(calls.children).toMatchObject([{ name: 'postWorkflowV108', at: 5000 }]);
  expect(warnings).toHaveBeenCalledWith('webhook_delivery_failed', { reason: 'activity_failure' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each(['direct', 'activity-wrapped'])('workflow cancellation (%s) must stop subsequent actions', async kind => {
  jest.useFakeTimers({ now: BASE_TIME });
  const { ActivityFailure, CancelledFailure, RetryState } = require('@temporalio/common');
  const cancelled = new CancelledFailure('synthetic cancellation');
  const failure = kind === 'direct' ? cancelled : new ActivityFailure('synthetic cancellation',
    'sendWebhooksV108', 'synthetic-activity', RetryState.CANCEL_REQUESTED, 'synthetic-worker', cancelled);
  const processPlug = jest.fn(async () => false);
  await expect(runClockWorkflow(8, { processPlug,
    webhook: async () => { throw failure; } })).rejects.toBe(failure);
  expect(processPlug).not.toHaveBeenCalled();
  expect(warnings).not.toHaveBeenCalled();
});

test('new recovery activity selects V108 while signaling the fixed ID with USE_EXISTING and tenant attributes', async () => {
  const f = fixture();
  f.posts.searchForMissingThreeHoursPosts = async () => [f.post];
  await f.current().searchForMissingThreeHoursPostsV108();
  const [name, options] = f.starts[0];
  expect(name).toBe('postWorkflowV108');
  expect(options).toMatchObject({ workflowId: 'post_local-post', taskQueue: 'main',
    signal: 'poke', signalArgs: [], workflowIdConflictPolicy: 'USE_EXISTING',
    args: [{ postId: 'local-post', organizationId: 'org', taskQueue: 'synthetic' }] });
  const keys = loadTypeScriptModule('libraries/nestjs-libraries/src/temporal/temporal.search.attribute.ts');
  expect(options.typedSearchAttributes.get(keys.postId)).toBe('local-post');
  expect(options.typedSearchAttributes.get(keys.organizationId)).toBe('org');
});

test('new missing-post loop invokes V108 recovery at its existing hourly cadence', async () => {
  const actions = [];
  const stop = new Error('end synthetic loop');
  const { missingPostWorkflowV108 } = loadTypeScriptModule('apps/orchestrator/src/workflows/missing.post.workflow.v108.ts', {
    '@temporalio/workflow': { proxyActivities: () => ({ searchForMissingThreeHoursPostsV108: async () => { actions.push('recover'); } }),
      sleep: async duration => { actions.push(duration); throw stop; } },
  });
  await expect(missingPostWorkflowV108()).rejects.toBe(stop);
  expect(actions).toEqual(['recover', '1 hour']);
});
