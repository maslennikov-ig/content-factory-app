'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const SOURCE = 'libraries/nestjs-libraries/src/integrations/social/bluesky.provider.ts';
const SDK = 'libraries/nestjs-libraries/src/integrations/social/bluesky.sdk.ts';
const SDK_REQUEST = '@contentfactory/nestjs-libraries/integrations/social/bluesky.sdk';
const PROVIDER_REQUEST = '@contentfactory/nestjs-libraries/integrations/social/bluesky.provider';
const REGISTRY = 'libraries/nestjs-libraries/src/integrations/integration.manager.ts';

const integration = (tenant = 'alpha') => ({ customInstanceDetails: `encrypted:${tenant}` });
const credentials = (tenant) => ({
  service: `https://${tenant}.example.test`,
  identifier: `${tenant}.example.test`,
  password: `synthetic-${tenant}-password`,
});
const authParams = (tenant = 'alpha', changes = {}) => ({
  code: Buffer.from(JSON.stringify({ ...credentials(tenant), ...changes })).toString('base64'),
  codeVerifier: 'synthetic-unused-verifier',
});
const postDetails = (message = 'Synthetic text', media = []) => [{
  id: 'synthetic-local-post', message, media,
}];

function harness(options = {}) {
  const calls = { loads: 0, agents: [], videoAgents: [], events: [], plugs: [], validators: [], polls: 0 };
  const loadError = new Error('synthetic SDK import failure');
  class RefreshToken extends Error {
    constructor(provider, payload, body) {
      super('synthetic refresh token'); Object.assign(this, { provider, payload, body });
    }
  }
  class BadBody extends Error {
    constructor(provider, payload, body, message) {
      super(message); Object.assign(this, { provider, payload, body });
    }
  }
  class BskyAgent {
    constructor({ service }) {
      this.service = service;
      this.dispatchUrl = new URL(service);
      this.ordinal = calls.agents.length;
      calls.agents.push(this); calls.events.push(['agent', this.ordinal, service]);
      this.com = { atproto: { server: { getServiceAuth: async (input) => {
        calls.events.push(['serviceAuth', this.ordinal, input]);
        return { data: { token: 'synthetic-service-token' } };
      } } } };
    }
    async login(input) {
      calls.events.push(['login', this.ordinal, input]);
      if (options.loginError) throw options.loginError;
      this.credentials = { ...input };
      this.session = { did: `did:plc:synthetic-${this.ordinal}` };
      await options.loginDelay?.(this);
      return { data: { accessJwt: `synthetic-access-${this.ordinal}`, refreshJwt: `synthetic-refresh-${this.ordinal}`, handle: input.identifier, did: this.session.did } };
    }
    async getProfile(input) {
      calls.events.push(['profile', this.ordinal, input]);
      if (options.profileError) throw options.profileError;
      return { data: { displayName: `Synthetic ${this.ordinal}`, avatar: 'https://images.example.test/avatar', handle: this.credentials.identifier } };
    }
    async uploadBlob(blob) {
      calls.events.push(['uploadBlob', this.ordinal, blob]);
      if (options.mediaError) throw options.mediaError;
      return { data: { blob: `synthetic-image-${this.ordinal}` } };
    }
    async post(input) {
      calls.events.push(['post', this.ordinal, input]);
      if (options.postError) throw options.postError;
      return { cid: `synthetic-cid-${this.ordinal}`, uri: `at://${this.session.did}/app.bsky.feed.post/synthetic-${this.ordinal}`, commit: 'synthetic-commit' };
    }
    async getPostThread(input) {
      calls.events.push(['thread', this.ordinal, input]);
      if (options.threadError) throw options.threadError;
      return { data: { thread: { post: {
        uri: input.uri, cid: 'synthetic-parent-cid', likeCount: options.likes ?? 5,
        record: options.noExistingRoot ? {} : { reply: { root: { uri: 'at://synthetic-root', cid: 'synthetic-root-cid' } } },
      } } } };
    }
    async repost(uri, cid) { calls.events.push(['repost', this.ordinal, { uri, cid }]); }
    async searchActors(input) {
      calls.events.push(['actors', this.ordinal, input]);
      if (options.mentionError) throw options.mentionError;
      return { data: { actors: [{ displayName: 'Synthetic Actor', handle: 'actor.example.test', avatar: 'https://images.example.test/actor' }] } };
    }
  }
  class AtpAgent {
    constructor({ service }) {
      calls.videoAgents.push(this); calls.events.push(['videoAgent', service]);
      this.app = { bsky: { video: { getJobStatus: async (input) => {
        calls.polls++; calls.events.push(['poll', input]);
        return { data: { jobStatus: options.videoStatus?.(calls.polls) || {
          state: 'JOB_STATE_COMPLETED', blob: 'synthetic-video-blob',
        } } };
      } } } };
    }
  }
  class RichText {
    constructor({ text }) { this.text = text; calls.events.push(['richText', text]); }
    async detectFacets(agent) {
      calls.events.push(['facets', agent.ordinal]);
      if (options.facetsError) throw options.facetsError;
      this.facets = [{ syntheticAgent: agent.ordinal }];
    }
  }
  const mocks = {
    '@contentfactory/nestjs-libraries/integrations/social.abstract': { SocialAbstract: class {}, RefreshToken, BadBody },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: (length) => 's'.repeat(length) },
    '@contentfactory/helpers/auth/auth.service': { AuthService: { fixedDecryption: (input) => {
      calls.events.push(['decrypt', input]);
      if (options.decryptError) throw options.decryptError;
      return options.decryptedBody ?? JSON.stringify(credentials(input.replace('encrypted:', '')));
    } } },
    '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator': { isSafePublicHttpsUrl: async (url) => {
      calls.validators.push(url); calls.events.push(['validate', url]); return options.safe !== false;
    } },
    '@contentfactory/helpers/decorators/plug.decorator': { Plug: (metadata) => (_target, method) => { calls.plugs.push({ method, metadata }); } },
    '@contentfactory/nestjs-libraries/chat/rules.description.decorator': { Rules: () => (target) => target },
    '@contentfactory/helpers/utils/timer': { timer: async (milliseconds) => { calls.events.push(['timer', milliseconds]); } },
    '@contentfactory/helpers/utils/strip.html.validation': { stripHtmlValidation: (...input) => { calls.events.push(['stripHtml', ...input]); return 'Synthetic clean plug'; } },
    axios: { get: async (url, input) => {
      calls.events.push(['imageRead', url, input]);
      return { data: Buffer.from('synthetic image') };
    } },
    sharp: () => ({ metadata: async () => ({ width: 80, height: 40 }) }),
  };
  const sdk = { BskyAgent, AtpAgent, RichText };
  const sources = { [SDK_REQUEST]: SDK, [PROVIDER_REQUEST]: SOURCE };
  const resolve = (request) => {
    if (request !== '@atproto/api') return undefined;
    calls.loads++; calls.events.push(['sdkLoad', calls.loads]);
    if (options.failFirst && calls.loads === 1) throw loadError;
    if (options.loadAlwaysFails) throw loadError;
    return sdk;
  };
  const load = (file = SOURCE, extra = {}) => loadTypeScriptModule(file, { ...mocks, ...extra }, { sources, resolve });
  const fetch = async (url, input) => {
    const upload = !!input;
    calls.events.push([upload ? 'videoUpload' : 'videoRead', String(url), input]);
    if (options.videoReadError && !upload) throw options.videoReadError;
    if (options.videoUploadError && upload) throw options.videoUploadError;
    return upload
      ? { json: async () => {
          calls.events.push(['videoJob']);
          return { jobId: 'synthetic-video-job', ...(options.initialBlob ? { blob: 'synthetic-initial-blob' } : {}) };
        } }
      : { ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer };
  };
  return { calls, loadError, RefreshToken, BadBody, sdk, load, fetch };
}

let previousSsrfOptOut;
beforeEach(() => {
  previousSsrfOptOut = process.env.DISABLE_SSRF_PROTECTION;
  delete process.env.DISABLE_SSRF_PROTECTION;
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  if (previousSsrfOptOut === undefined) delete process.env.DISABLE_SSRF_PROTECTION;
  else process.env.DISABLE_SSRF_PROTECTION = previousSsrfOptOut;
});

test('the real integration registry and Bluesky metadata keep the SDK cold', async () => {
  const run = harness();
  const source = fs.readFileSync(path.join(__dirname, '..', REGISTRY), 'utf8');
  const mocks = { '@nestjs/common': { Injectable: () => (target) => target } };
  for (const match of source.matchAll(/import \{ (\w+) \} from '([^']+\/social\/[^']+)';/g)) {
    if (match[2] !== PROVIDER_REQUEST) mocks[match[2]] = { [match[1]]: class {} };
  }
  const { socialIntegrationList, IntegrationManager } = run.load(REGISTRY, mocks);
  expect(socialIntegrationList).toHaveLength(34);
  const bluesky = socialIntegrationList.find((provider) => provider.identifier === 'bluesky');
  expect(bluesky).toMatchObject({ name: 'Bluesky', maxConcurrentJob: 2, editor: 'normal', isBetweenSteps: false });
  expect((await new IntegrationManager().getAllIntegrations()).social.find(({ identifier }) => identifier === 'bluesky').customFields).toHaveLength(3);
  expect(run.calls.plugs.map(({ method, metadata }) => [method, metadata.identifier, metadata.runEveryMilliseconds, metadata.totalRuns])).toEqual([
    ['autoRepostPost', 'bluesky-autoRepostPost', 21600000, 3],
    ['autoPlugPost', 'bluesky-autoPlugPost', 21600000, 3],
  ]);
  expect(run.calls.loads).toBe(0);
  expect(run.calls.agents).toHaveLength(0);
});

test('metadata, validation, empty refresh and synchronous mention formatting stay cold', async () => {
  const run = harness(); const { BlueskyProvider } = run.load(); const provider = new BlueskyProvider();
  expect(provider.maxLength()).toBe(300);
  expect(provider.mentionFormat('actor.example.test', 'unused')).toBe('@actor.example.test');
  await expect(provider.checkValidity([])).resolves.toBe(true);
  await expect(provider.checkValidity([[{ path: 'video.mp4' }, { path: 'image.jpg' }]])).resolves.toBe('You can only upload one video per post.');
  await expect(provider.checkValidity([Array.from({ length: 5 }, () => ({ path: 'image.jpg' }))])).resolves.toBe('There can be maximum 4 pictures in a post.');
  await expect(provider.customFields()).resolves.toHaveLength(3);
  await expect(provider.refreshToken('synthetic-unused')).resolves.toMatchObject({ accessToken: '', refreshToken: '', expiresIn: 0 });
  await expect(provider.generateAuthUrl()).resolves.toEqual({ url: 'ssssss', codeVerifier: 'ssssssssss', state: 'ssssss' });
  expect(run.calls.loads).toBe(0); expect(run.calls.agents).toHaveLength(0);
});

test.each(['http://example.test', 'https://127.0.0.1', 'https://private.example.test', 'malformed'])('invalid public HTTPS admission keeps SDK/login cold (%s)', async (service) => {
  const run = harness({ safe: false }); const { BlueskyProvider } = run.load();
  await expect(new BlueskyProvider().authenticate(authParams('alpha', { service }))).resolves.toBe('Invalid service URL: must be a public HTTPS address');
  expect(run.calls.validators).toEqual([service]); expect(run.calls.loads).toBe(0); expect(run.calls.agents).toHaveLength(0);
});

test('the existing explicit SSRF opt-out retains its behavior', async () => {
  process.env.DISABLE_SSRF_PROTECTION = 'true';
  const run = harness({ safe: false }); const { BlueskyProvider } = run.load();
  await expect(new BlueskyProvider().authenticate(authParams())).resolves.toHaveProperty('id', 'did:plc:synthetic-0');
  expect(run.calls.validators).toEqual([]); expect(run.calls.loads).toBe(1);
});

test('malformed auth JSON fails before any SDK load', async () => {
  const run = harness(); const { BlueskyProvider } = run.load();
  await expect(new BlueskyProvider().authenticate({ code: Buffer.from('{').toString('base64'), codeVerifier: '' })).rejects.toBeInstanceOf(SyntaxError);
  expect(run.calls.loads).toBe(0); expect(run.calls.agents).toHaveLength(0);
});

test('parallel first callers share one module promise, never agents', async () => {
  const run = harness(); const { loadBlueskySdk } = run.load(SDK);
  const first = loadBlueskySdk(); expect(loadBlueskySdk()).toBe(first);
  const modules = await Promise.all(Array.from({ length: 12 }, () => loadBlueskySdk()));
  expect(modules.every((module) => module === modules[0] && module.BskyAgent === run.sdk.BskyAgent)).toBe(true);
  expect(loadBlueskySdk()).toBe(first); expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(0);
});

test('one shared rejected import resets for a later independent invocation without retry', async () => {
  const run = harness({ failFirst: true }); const { loadBlueskySdk } = run.load(SDK);
  const first = loadBlueskySdk(); const second = loadBlueskySdk(); expect(second).toBe(first);
  const rejected = await Promise.allSettled([first, second]);
  expect(rejected.map(({ reason }) => reason)).toEqual([run.loadError, run.loadError]);
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(0);
  await expect(loadBlueskySdk()).resolves.toHaveProperty('BskyAgent', run.sdk.BskyAgent);
  await expect(loadBlueskySdk()).resolves.toHaveProperty('AtpAgent', run.sdk.AtpAgent);
  expect(run.calls.loads).toBe(2);
});

test('authenticate validates, loads, constructs, logs in and reads its own profile in order', async () => {
  const run = harness(); const { BlueskyProvider } = run.load();
  const result = await new BlueskyProvider().authenticate(authParams('alpha'));
  expect(run.calls.events.map(([name]) => name)).toEqual(['validate', 'sdkLoad', 'agent', 'login', 'profile']);
  expect(run.calls.agents[0]).toMatchObject({ service: credentials('alpha').service, credentials: { identifier: credentials('alpha').identifier, password: credentials('alpha').password } });
  expect(result).toMatchObject({ accessToken: 'synthetic-access-0', refreshToken: 'synthetic-refresh-0', id: 'did:plc:synthetic-0', name: 'Synthetic 0', username: 'alpha.example.test' });
  expect(result.expiresIn).toEqual(expect.any(Number));
});

test('authenticate maps first-use import failure through its original catch only', async () => {
  const run = harness({ failFirst: true }); const { BlueskyProvider } = run.load(); const provider = new BlueskyProvider();
  await expect(provider.authenticate(authParams())).resolves.toBe('Invalid credentials');
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(0);
  await expect(provider.authenticate(authParams('beta'))).resolves.toHaveProperty('username', 'beta.example.test');
  expect(run.calls.loads).toBe(2); expect(run.calls.agents).toHaveLength(1);
});

test.each(['loginError', 'profileError'])('authenticate retains Invalid credentials for %s', async (kind) => {
  const run = harness({ [kind]: new Error('synthetic auth failure') }); const { BlueskyProvider } = run.load();
  await expect(new BlueskyProvider().authenticate(authParams())).resolves.toBe('Invalid credentials');
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(1);
  expect(run.calls.events.filter(([name]) => name === 'login')).toHaveLength(1);
});

test('getAgent propagates import failure outside the login-only RefreshToken catch', async () => {
  const run = harness({ failFirst: true }); const { BlueskyProvider } = run.load(); const provider = new BlueskyProvider();
  await expect(provider.post('synthetic-id', '', postDetails(), integration())).rejects.toBe(run.loadError);
  expect(run.loadError).not.toBeInstanceOf(run.RefreshToken);
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(0);
  await expect(provider.post('synthetic-id', '', postDetails(), integration())).resolves.toHaveLength(1);
  expect(run.calls.loads).toBe(2); expect(run.calls.agents).toHaveLength(1);
});

test('only getAgent login errors keep the original RefreshToken mapping', async () => {
  const original = { kind: 'synthetic-login-failure' }; const run = harness({ loginError: original }); const { BlueskyProvider } = run.load();
  await expect(new BlueskyProvider().post('synthetic-id', '', postDetails(), integration())).rejects.toMatchObject({ provider: 'bluesky', payload: JSON.stringify(original) });
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(1);
  expect(run.calls.events.filter(([name]) => name === 'login')).toHaveLength(1);
  expect(run.calls.events.some(([name]) => name === 'richText' || name === 'post')).toBe(false);
});

const operation = (provider, kind, tenant = 'alpha') => {
  if (kind === 'post') return provider.post('synthetic-id', '', postDetails(), integration(tenant));
  if (kind === 'autoRepostPost') return provider.autoRepostPost(integration(tenant), 'at://synthetic-post', { likesAmount: '100' });
  if (kind === 'autoPlugPost') return provider.autoPlugPost(integration(tenant), 'at://synthetic-post', { likesAmount: '100', post: '<p>Synthetic</p>' });
  return provider.mention('', { query: 'synthetic' }, '', integration(tenant));
};

test.each(['post', 'autoRepostPost', 'autoPlugPost', 'mention'])('%s decrypts/parses before import', async (kind) => {
  const run = harness({ decryptedBody: '{' }); const { BlueskyProvider } = run.load();
  await expect(operation(new BlueskyProvider(), kind)).rejects.toBeInstanceOf(SyntaxError);
  expect(run.calls.loads).toBe(0); expect(run.calls.agents).toHaveLength(0);
  expect(run.calls.events).toEqual([['decrypt', 'encrypted:alpha']]);
});

test.each(['autoRepostPost', 'autoPlugPost', 'mention'])('%s does not remap or retry an SDK import failure', async (kind) => {
  const run = harness({ failFirst: true }); const { BlueskyProvider } = run.load();
  await expect(operation(new BlueskyProvider(), kind)).rejects.toBe(run.loadError);
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(0);
});

test('concurrent and later posts share only the SDK, preserving per-call tenant credentials/session/facets', async () => {
  const run = harness(); const { BlueskyProvider } = run.load(); const provider = new BlueskyProvider();
  const a = postDetails('Synthetic alpha'); const b = postDetails('Synthetic beta'); const before = structuredClone([a, b]);
  const results = await Promise.all([
    provider.post('alpha-id', '', a, integration('alpha')),
    provider.post('beta-id', '', b, integration('beta')),
  ]);
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(2);
  expect(run.calls.agents[0]).not.toBe(run.calls.agents[1]);
  expect(run.calls.agents.map(({ service }) => service)).toEqual([credentials('alpha').service, credentials('beta').service]);
  expect(run.calls.agents.map(({ credentials: value }) => value.password)).toEqual([credentials('alpha').password, credentials('beta').password]);
  expect(new Set(run.calls.agents.map(({ session }) => session)).size).toBe(2);
  const posted = run.calls.events.filter(([name]) => name === 'post');
  expect(posted.map(([, , value]) => value.text)).toEqual(['Synthetic alpha', 'Synthetic beta']);
  expect(posted.map(([, , value]) => value.facets[0].syntheticAgent)).toEqual([0, 1]);
  expect(results[0][0].postId).not.toBe(results[1][0].postId); expect([a, b]).toEqual(before);
  await provider.post('alpha-id', '', postDetails('Synthetic alpha again'), integration('alpha'));
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(3);
});

test('post keeps image upload before RichText/facets and preserves the final embed/reference', async () => {
  const run = harness(); const { BlueskyProvider } = run.load();
  const result = await new BlueskyProvider().post('synthetic-id', '', postDetails('Synthetic image', [{ path: 'https://assets.example.test/image.jpg', alt: 'Synthetic alt' }]), integration());
  expect(run.calls.events.map(([name]) => name)).toEqual(['decrypt', 'sdkLoad', 'agent', 'login', 'imageRead', 'uploadBlob', 'richText', 'facets', 'post']);
  expect(run.calls.events.at(-1)[2].embed).toEqual({ $type: 'app.bsky.embed.images', images: [{ alt: 'Synthetic alt', image: 'synthetic-image-0', aspectRatio: { width: 80, height: 40 } }] });
  expect(result[0]).toMatchObject({ id: 'synthetic-local-post', status: 'completed', releaseURL: 'https://bsky.app/profile/synthetic-id/post/synthetic-0' });
});

test.each([false, true])('comment preserves facets/thread/CID ordering and root fallback (%s)', async (noExistingRoot) => {
  const run = harness({ noExistingRoot }); const { BlueskyProvider } = run.load();
  await new BlueskyProvider().comment('synthetic-id', 'at://synthetic-original', 'at://synthetic-last', '', postDetails('Synthetic comment'), integration());
  expect(run.calls.events.map(([name]) => name)).toEqual(['decrypt', 'sdkLoad', 'agent', 'login', 'richText', 'facets', 'thread', 'post']);
  expect(run.calls.events.find(([name]) => name === 'thread')[2]).toEqual({ uri: 'at://synthetic-last', depth: 0 });
  expect(run.calls.events.at(-1)[2].reply).toEqual({
    parent: { uri: 'at://synthetic-last', cid: 'synthetic-parent-cid' },
    root: noExistingRoot ? { uri: 'at://synthetic-original', cid: 'synthetic-parent-cid' } : { uri: 'at://synthetic-root', cid: 'synthetic-root-cid' },
  });
});

test.each(['mediaError', 'facetsError', 'threadError', 'postError'])('%s propagates without an operation retry or invalidating the loaded module', async (kind) => {
  const error = new Error('synthetic original operation error'); const options = { [kind]: error }; const run = harness(options); const { BlueskyProvider } = run.load(); const provider = new BlueskyProvider();
  const perform = () => kind === 'threadError'
    ? provider.comment('id', 'at://synthetic-root', undefined, '', postDetails(), integration())
    : provider.post('id', '', postDetails('Synthetic', kind === 'mediaError' ? [{ path: 'https://assets.example.test/image.jpg' }] : []), integration());
  await expect(perform()).rejects.toBe(error);
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(1);
  delete options[kind]; await expect(perform()).resolves.toHaveLength(1);
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(2);
});

test.each(['autoRepostPost', 'autoPlugPost'])('%s preserves below-threshold no-op and inclusive threshold/timer ordering', async (kind) => {
  const options = { likes: 9 }; const run = harness(options); const { BlueskyProvider } = run.load(); const provider = new BlueskyProvider();
  const perform = () => provider[kind](integration(), 'at://synthetic-post', { likesAmount: '10', post: '<p>Synthetic plug</p>' });
  await expect(perform()).resolves.toBe(true);
  expect(run.calls.events.map(([name]) => name)).toEqual(['decrypt', 'sdkLoad', 'agent', 'login', 'thread']);
  options.likes = 10; run.calls.events.length = 0;
  await expect(perform()).resolves.toBe(true);
  expect(run.calls.events.map(([name]) => name)).toEqual(kind === 'autoRepostPost'
    ? ['decrypt', 'agent', 'login', 'thread', 'timer', 'repost']
    : ['decrypt', 'agent', 'login', 'thread', 'timer', 'stripHtml', 'richText', 'post']);
  expect(run.calls.events.find(([name]) => name === 'timer')).toEqual(['timer', 2000]);
  if (kind === 'autoPlugPost') expect(run.calls.events.at(-1)[2].facets).toBeUndefined();
  expect(run.calls.loads).toBe(1); expect(run.calls.agents).toHaveLength(2);
});

test('mention retains its own agent/login/searchActors mapping', async () => {
  const run = harness(); const { BlueskyProvider } = run.load();
  await expect(operation(new BlueskyProvider(), 'mention', 'beta')).resolves.toEqual([{ label: 'Synthetic Actor', id: 'actor.example.test', image: 'https://images.example.test/actor' }]);
  expect(run.calls.events.map(([name]) => name)).toEqual(['decrypt', 'sdkLoad', 'agent', 'login', 'actors']);
  expect(run.calls.agents[0].credentials.password).toBe(credentials('beta').password);
});

const videoPost = async (run) => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(run.fetch);
  const { BlueskyProvider } = run.load();
  return new BlueskyProvider().post('synthetic-id', '', postDetails('Synthetic video', [{ path: 'https://assets.example.test/video.mp4' }]), integration());
};

test('video keeps service-auth/download/upload/job/constructor/poll order and final thirty-second delay', async () => {
  const run = harness({ videoStatus: (attempt) => attempt === 1 ? { state: 'JOB_STATE_PROCESSING', progress: 50 } : { state: 'JOB_STATE_COMPLETED', blob: 'synthetic-final-video' } });
  await expect(videoPost(run)).resolves.toHaveLength(1);
  expect(run.calls.events.map(([name]) => name)).toEqual(['decrypt', 'sdkLoad', 'agent', 'login', 'serviceAuth', 'videoRead', 'videoUpload', 'videoJob', 'videoAgent', 'poll', 'timer', 'poll', 'timer', 'richText', 'facets', 'post']);
  expect(run.calls.videoAgents).toHaveLength(1); expect(run.calls.polls).toBe(2); expect(run.calls.loads).toBe(1);
  expect(run.calls.events.filter(([name]) => name === 'timer').map(([, delay]) => delay)).toEqual([30000, 30000]);
  expect(run.calls.events.at(-1)[2].embed).toEqual({ $type: 'app.bsky.embed.video', video: 'synthetic-final-video' });
});

test('an initial video blob still constructs the per-call video agent without polling', async () => {
  const run = harness({ initialBlob: true }); await videoPost(run);
  expect(run.calls.videoAgents).toHaveLength(1); expect(run.calls.polls).toBe(0);
  expect(run.calls.events.some(([name]) => name === 'timer')).toBe(false);
  expect(run.calls.events.at(-1)[2].embed.video).toBe('synthetic-initial-blob');
});

test.each([
  ['failed', () => ({ state: 'JOB_STATE_FAILED' }), 1, 0, 'Could not upload video, job failed'],
  ['timeout', () => ({ state: 'JOB_STATE_PROCESSING' }), 18, 18, 'Video upload timed out, job did not complete'],
])('video %s retains exact BadBody/poll/timer bound without retry', async (_name, videoStatus, polls, timers, message) => {
  const run = harness({ videoStatus }); await expect(videoPost(run)).rejects.toMatchObject({ provider: 'bluesky', message });
  expect(run.calls.polls).toBe(polls); expect(run.calls.videoAgents).toHaveLength(1); expect(run.calls.agents).toHaveLength(1);
  expect(run.calls.events.filter(([name]) => name === 'timer')).toHaveLength(timers);
  expect(run.calls.events.some(([name]) => name === 'richText' || name === 'post')).toBe(false); expect(run.calls.loads).toBe(1);
});

test('the actual installed public SDK constructors and RichText UTF-8 facets work with all transport blocked', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const assert = require('node:assert/strict');
    let networkAttempts = 0;
    const deny = () => { networkAttempts++; throw new Error('offline transport blocked'); };
    for (const [name, methods] of [['node:http',['request','get']],['node:https',['request','get']],['node:net',['connect','createConnection']],['node:tls',['connect']],['node:dns',['lookup','resolve','resolve4','resolve6']]]) {
      const module = require(name); for (const method of methods) module[method] = deny;
    }
    require('node:net').Socket.prototype.connect = deny;
    const dnsPromises = require('node:dns').promises;
    for (const name of ['lookup','resolve','resolve4','resolve6']) dnsPromises[name] = deny;
    globalThis.fetch = deny;
    const sdk = require('@atproto/api');
    assert.equal(require('@atproto/api/package.json').version, '0.15.27');
    for (const name of ['BskyAgent','AtpAgent','RichText']) assert.equal(typeof sdk[name], 'function');
    const a = new sdk.BskyAgent({ service: 'https://alpha.example.test' });
    const b = new sdk.BskyAgent({ service: 'https://beta.example.test' });
    const video = new sdk.AtpAgent({ service: 'https://video.bsky.app' });
    assert.notEqual(a, b); assert.equal(typeof video.app.bsky.video.getJobStatus, 'function');
    const rich = new sdk.RichText({ text: '🦋 https://example.com/a #тест' });
    (async () => {
      await rich.detectFacets({ com: { atproto: { identity: { resolveHandle: deny } } } });
      assert.equal(rich.facets.length, 2);
      assert.equal(rich.facets[0].index.byteStart, 5);
      assert.equal(rich.facets[0].features[0].$type, 'app.bsky.richtext.facet#link');
      assert.equal(rich.facets[1].features[0].$type, 'app.bsky.richtext.facet#tag');
      assert.equal(networkAttempts, 0);
      process.stdout.write(JSON.stringify({ version: '0.15.27', namedConstructors: 3, facetCount: 2, utf8LinkStart: 5, networkAttempts }));
    })().catch(() => { process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'), env: { PATH: process.env.PATH }, timeout: 10000, maxBuffer: 64 * 1024, encoding: 'utf8',
  });
  expect(result.error).toBeUndefined(); expect(result.status).toBe(0); expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toEqual({ version: '0.15.27', namedConstructors: 3, facetCount: 2, utf8LinkStart: 5, networkAttempts: 0 });
});
