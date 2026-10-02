'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const SOURCE =
  'libraries/nestjs-libraries/src/integrations/social/x.provider.ts';
const REGISTRY =
  'libraries/nestjs-libraries/src/integrations/integration.manager.ts';
const REQUEST =
  '@contentfactory/nestjs-libraries/integrations/social/x.provider';
const ROOT = 'twitter-api-v2';

function harness(options = {}) {
  const calls = {
    loads: 0,
    constructs: [],
    clients: [],
    operations: [],
    events: [],
    plugs: [],
    postPlugs: [],
    rules: [],
  };
  const loadError = new Error('synthetic public SDK load failure');
  const constructorError = new Error('synthetic constructor failure');
  const operationsError = new Error('synthetic request failure');
  class TwitterApi {
    constructor(input) {
      calls.constructs.push({ ...input });
      calls.events.push(['construct', calls.constructs.length]);
      if (options.failConstructor && calls.constructs.length === 1)
        throw constructorError;
      this.ordinal = calls.constructs.length;
      this.requestMaker = {}; // Synthetic ownership marker, not an SDK private read.
      this.input = input;
      calls.clients.push(this);
      const operation =
        (method, result) =>
        async (...args) => {
          calls.operations.push({ ordinal: this.ordinal, method, args });
          calls.events.push([method, this.ordinal]);
          if (options.failMethod === method) throw operationsError;
          await options.onOperation?.(method, args, this);
          return typeof result === 'function' ? result(...args) : result;
        };
      const metrics = {
        impression_count: 10,
        bookmark_count: 2,
        like_count: 3,
        quote_count: 4,
        reply_count: 5,
        retweet_count: 6,
      };
      this.v2 = {
        tweetLikedBy: operation('tweetLikedBy', {
          meta: { result_count: options.likes ?? 3 },
        }),
        retweet: operation('retweet', {}),
        tweet: operation('tweet', { data: { id: 'synthetic-tweet-id' } }),
        me: operation('me', {
          data: {
            id: 'synthetic-user',
            username: 'synthetic-handle',
            verified: true,
            name: 'Synthetic user',
            profile_image_url: 'https://images.example.test/profile',
          },
        }),
        userByUsername: operation('userByUsername', {
          data: {
            username: 'synthetic-handle',
            name: 'Synthetic user',
            profile_image_url: 'https://images.example.test/profile',
          },
        }),
        userTimeline: operation(
          'userTimeline',
          options.timeline ?? {
            data: { data: [{ id: 'synthetic-tweet-id' }] },
            meta: {},
          }
        ),
        tweets: operation('tweets', {
          data: [{ id: 'synthetic-tweet-id', public_metrics: metrics }],
        }),
        singleTweet: operation('singleTweet', {
          data: { public_metrics: metrics },
        }),
        uploadMedia: operation('uploadMedia', 'synthetic-media-id'),
      };
      this.generateAuthLink = operation('generateAuthLink', {
        url: 'https://example.test/auth',
        oauth_token: 'synthetic-oauth',
        oauth_token_secret: 'synthetic-oauth-secret',
      });
      this.login = operation('login', {
        accessToken: 'synthetic-access',
        accessSecret: 'synthetic-secret',
        client: this,
      });
    }
  }
  const mocks = {
    '@contentfactory/nestjs-libraries/integrations/social.abstract': {
      SocialAbstract: class {
        assetBoolean(value) {
          return value === true;
        }
        async runInConcurrent(task, option) {
          calls.events.push(['concurrent', option]);
          return task();
        }
        async fetch(url, input) {
          calls.operations.push({ method: 'fetch', args: [url, input] });
          return {
            json: async () => ({ data: { id: 'synthetic-published-id' } }),
          };
        }
      },
    },
    '@contentfactory/helpers/utils/read.or.fetch': {
      readOrFetch: async (source) => {
        calls.events.push(['media', source]);
        return Buffer.from('synthetic-media');
      },
    },
    '@contentfactory/helpers/utils/timer': {
      timer: async (ms) => calls.events.push(['timer', ms]),
    },
    '@contentfactory/helpers/decorators/plug.decorator': {
      Plug: (config) => (_target, method) => {
        calls.plugs.push({ ...config, method });
      },
    },
    '@contentfactory/helpers/decorators/post.plug': {
      PostPlug: (config) => (_target, method) => {
        calls.postPlugs.push({ ...config, method });
      },
    },
    sharp: (_buffer, input) => {
      calls.events.push(['sharp', input]);
      return {
        resize(settings) {
          calls.events.push(['resize', settings]);
          return this;
        },
        gif() {
          calls.events.push(['gif']);
          return this;
        },
        async toBuffer() {
          return Buffer.from('synthetic-converted');
        },
      };
    },
  };
  const resolve = (request) => {
    if (request.startsWith(ROOT + '/'))
      throw new Error('SDK deep import forbidden');
    if (request !== ROOT) return undefined;
    calls.loads++;
    calls.events.push(['load', calls.loads]);
    if (options.blockSdk || (options.failLoad && calls.loads === 1))
      throw loadError;
    return options.sdk ?? { TwitterApi };
  };
  const load = (file = SOURCE, extra = {}) =>
    loadTypeScriptModule(
      file,
      { ...mocks, ...extra },
      { sources: { [REQUEST]: SOURCE }, resolve }
    );
  return { calls, loadError, constructorError, operationsError, load };
}

function registry(run) {
  const source = fs.readFileSync(path.join(__dirname, '..', REGISTRY), 'utf8');
  const mocks = { '@nestjs/common': { Injectable: () => (target) => target } };
  for (const match of source.matchAll(
    /import \{ (\w+) \} from '([^']+\/social\/[^']+)';/g
  )) {
    if (match[2] !== REQUEST)
      mocks[match[2]] = { [match[1]]: { [match[1]]: class {} }[match[1]] };
  }
  const loaded = run.load(REGISTRY, mocks);
  const listOrder = [...source.matchAll(/  new (\w+)\(\),/g)].map(
    (match) => match[1]
  );
  return { ...loaded, listOrder };
}

test('real synchronous registry and X metadata remain public-SDK cold', async () => {
  const run = harness({ blockSdk: true });
  const { IntegrationManager, socialIntegrationList, listOrder } =
    registry(run);
  const manager = new IntegrationManager();
  const provider = manager.getSocialIntegration('x');
  expect(socialIntegrationList.map((p) => p.constructor.name)).toEqual(
    listOrder
  );
  expect(provider).toMatchObject({
    identifier: 'x',
    name: 'X',
    maxConcurrentJob: 1,
    editor: 'normal',
    isBetweenSteps: false,
    scopes: [],
  });
  expect(provider.maxLength()).toBe(280);
  expect(provider.maxLength([{ title: 'Verified', value: true }])).toBe(4000);
  expect(provider.dto.name).toBe('XDto');
  expect(manager.getAllRulesDescription().x).toContain('maximum 4 pictures');
  expect(
    (await manager.getAllIntegrations()).social.find(
      (p) => p.identifier === 'x'
    )
  ).toMatchObject({ name: 'X', editor: 'normal' });
  expect(
    run.calls.plugs.map((p) => [p.method, p.identifier, p.totalRuns])
  ).toEqual([
    ['autoRepostPost', 'x-autoRepostPost', 3],
    ['autoPlugPost', 'x-autoPlugPost', 3],
  ]);
  expect(run.calls.postPlugs[0]).toMatchObject({
    identifier: 'x-repost-post-users',
    pickIntegration: ['x'],
  });
  expect(run.calls.loads).toBe(0);
  expect(run.calls.constructs).toEqual([]);
});

let priorEnv;
const envKeys = [
  'X_API_KEY',
  'X_API_SECRET',
  'X_URL',
  'FRONTEND_URL',
  'DISABLE_X_ANALYTICS',
  'STRIP_LINKS_FROM_X_POSTS',
];
beforeEach(() => {
  priorEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    X_API_KEY: 'synthetic-app-key',
    X_API_SECRET: 'synthetic-app-secret',
    X_URL: 'https://app.example.test',
  });
  delete process.env.DISABLE_X_ANALYTICS;
  delete process.env.STRIP_LINKS_FROM_X_POSTS;
});
afterEach(() => {
  for (const key of envKeys) {
    if (priorEnv[key] === undefined) delete process.env[key];
    else process.env[key] = priorEnv[key];
  }
});
const providerOf = (run) => new (run.load().XProvider)();
const tokenOptions = {
  appKey: 'synthetic-app-key',
  appSecret: 'synthetic-app-secret',
  accessToken: 'synthetic-access',
  accessSecret: 'synthetic-secret',
};
const ownedIntegration = {
  token: 'synthetic-access:synthetic-secret',
  internalId: 'synthetic-user',
  profile: 'synthetic-handle',
};
const details = [
  {
    id: 'synthetic-local-post',
    message: 'Synthetic post',
    media: [],
    settings: {},
  },
];
const cases = [
  [
    'autoRepostPost',
    (p) =>
      p.autoRepostPost(ownedIntegration, 'synthetic-post', {
        likesAmount: '2',
      }),
    ['tweetLikedBy', 'retweet'],
    tokenOptions,
  ],
  [
    'repostPostUsers',
    (p) => p.repostPostUsers(ownedIntegration, {}, 'synthetic-post', {}),
    ['me', 'retweet'],
    tokenOptions,
  ],
  [
    'autoPlugPost',
    (p) =>
      p.autoPlugPost(ownedIntegration, 'synthetic-post', {
        likesAmount: '2',
        post: '<p>Synthetic plug</p>',
      }),
    ['tweetLikedBy', 'tweet'],
    tokenOptions,
  ],
  [
    'generateAuthUrl',
    (p) => p.generateAuthUrl(),
    ['generateAuthLink'],
    { appKey: tokenOptions.appKey, appSecret: tokenOptions.appSecret },
  ],
  [
    'authenticate',
    (p) =>
      p.authenticate({
        code: 'synthetic-code',
        codeVerifier: 'synthetic-access:synthetic-secret',
      }),
    ['login', 'me'],
    tokenOptions,
  ],
  [
    'getClient',
    (p) => p.getClient('synthetic-access:synthetic-secret'),
    [],
    tokenOptions,
  ],
  [
    'analytics',
    (p) =>
      p.analytics('synthetic-user', 'synthetic-access:synthetic-secret', 7),
    ['userTimeline', 'tweets'],
    tokenOptions,
  ],
  [
    'postAnalytics',
    (p) =>
      p.postAnalytics(
        'synthetic-integration',
        'synthetic-access:synthetic-secret',
        'synthetic-post',
        7
      ),
    ['singleTweet'],
    tokenOptions,
  ],
  [
    'mention',
    (p) =>
      p.mention('synthetic-access:synthetic-secret', {
        query: 'synthetic-query',
      }),
    ['userByUsername'],
    tokenOptions,
  ],
];

test.each(cases)(
  'first-use %s keeps its original constructor arguments, request order and fresh client',
  async (method, invoke, operations, input) => {
    const run = harness();
    const provider = providerOf(run);
    expect(run.calls.loads).toBe(0);
    const result = await invoke(provider);
    expect(run.calls.loads).toBe(1);
    expect(run.calls.constructs).toEqual([input]);
    expect(run.calls.operations.map((one) => one.method)).toEqual(operations);
    expect(run.calls.events.slice(0, 2)).toEqual([
      ['load', 1],
      ['construct', 1],
    ]);
    const args = Object.fromEntries(
      run.calls.operations.map((one) => [one.method, one.args])
    );
    if (method === 'autoRepostPost') {
      expect(result).toBe(true);
      expect(args.tweetLikedBy).toEqual(['synthetic-post']);
      expect(args.retweet).toEqual(['synthetic-user', 'synthetic-post']);
      expect(run.calls.events).toContainEqual(['timer', 2000]);
    }
    if (method === 'repostPostUsers') {
      expect(result).toBeUndefined();
      expect(args.me).toEqual([]);
      expect(args.retweet).toEqual(['synthetic-user', 'synthetic-post']);
    }
    if (method === 'autoPlugPost') {
      expect(result).toBe(true);
      expect(args.tweet).toEqual([
        {
          text: 'Synthetic plug',
          reply: { in_reply_to_tweet_id: 'synthetic-post' },
        },
      ]);
    }
    if (method === 'generateAuthUrl') {
      expect(result).toEqual({
        url: 'https://example.test/auth',
        codeVerifier: 'synthetic-oauth:synthetic-oauth-secret',
        state: 'synthetic-oauth',
      });
      expect(args.generateAuthLink).toEqual([
        'https://app.example.test/integrations/social/x',
        {
          authAccessType: 'write',
          linkMode: 'authenticate',
          forceLogin: false,
        },
      ]);
    }
    if (method === 'authenticate') {
      expect(args.login).toEqual(['synthetic-code']);
      expect(args.me).toEqual([
        {
          'user.fields': [
            'username',
            'verified',
            'verified_type',
            'profile_image_url',
            'name',
          ],
        },
      ]);
      expect(result).toMatchObject({
        id: 'synthetic-user',
        accessToken: 'synthetic-access:synthetic-secret',
        name: 'Synthetic user',
        username: 'synthetic-handle',
        expiresIn: 999999999,
      });
    }
    if (method === 'getClient') expect(result).toBe(run.calls.clients[0]);
    if (method === 'analytics') {
      expect(args.userTimeline[0]).toBe('synthetic-user');
      expect(args.userTimeline[1]).toMatchObject({
        'tweet.fields': ['id'],
        exclude: ['replies', 'retweets'],
        max_results: 100,
      });
      expect(args.tweets).toEqual([
        ['synthetic-tweet-id'],
        { 'tweet.fields': ['public_metrics'] },
      ]);
      expect(result.map((one) => one.label)).toEqual([
        'IMPRESSION',
        'BOOKMARK',
        'LIKE',
        'QUOTE',
        'REPLY',
        'RETWEET',
      ]);
    }
    if (method === 'postAnalytics') {
      expect(args.singleTweet).toEqual([
        'synthetic-post',
        { 'tweet.fields': ['public_metrics', 'created_at'] },
      ]);
      expect(result.map((one) => one.label)).toEqual([
        'Impressions',
        'Likes',
        'Retweets',
        'Replies',
        'Quotes',
        'Bookmarks',
      ]);
    }
    if (method === 'mention') {
      expect(args.userByUsername).toEqual([
        'synthetic-query',
        { 'user.fields': ['username', 'name', 'profile_image_url'] },
      ]);
      expect(result).toEqual([
        {
          id: 'synthetic-handle',
          image: 'https://images.example.test/profile',
          label: 'Synthetic user',
        },
      ]);
    }
  }
);

test.each(cases)(
  '%s snapshots constructor env and tokens before awaiting public loading',
  async (_method, invoke, _operations, input) => {
    const run = harness();
    const provider = providerOf(run);
    const pending = invoke(provider);
    process.env.X_API_KEY = 'synthetic-new-key';
    process.env.X_API_SECRET = 'synthetic-new-secret';
    await pending;
    expect(run.calls.constructs).toEqual([input]);
  }
);

test('SDK-free metadata/refresh/disabled analytics and malformed tokens stay cold', async () => {
  const run = harness({ blockSdk: true });
  const provider = providerOf(run);
  expect(provider.mentionFormat('synthetic-handle', 'ignored')).toBe(
    '@synthetic-handle'
  );
  expect(provider.handleErrors('Service Unavailable').type).toBe('retry');
  expect(await provider.refreshToken()).toEqual({
    id: '',
    name: '',
    accessToken: '',
    refreshToken: '',
    expiresIn: 0,
    picture: '',
    username: '',
  });
  process.env.DISABLE_X_ANALYTICS = '1';
  expect(await provider.analytics('unused', null, 7)).toEqual([]);
  expect(await provider.postAnalytics('unused', null, 'unused', 7)).toEqual([]);
  delete process.env.DISABLE_X_ANALYTICS;
  await expect(provider.analytics('', null, 7)).rejects.toBeInstanceOf(
    TypeError
  );
  await expect(
    provider.mention(null, { query: 'ignored' })
  ).rejects.toBeInstanceOf(TypeError);
  await expect(
    provider.authenticate({ code: '', codeVerifier: null })
  ).rejects.toBeInstanceOf(TypeError);
  await expect(
    provider.autoRepostPost({ token: null }, '', {})
  ).rejects.toBeInstanceOf(TypeError);
  expect(run.calls.loads).toBe(0);
  expect(run.calls.constructs).toEqual([]);
});

test('successful class initialization is shared across concurrent calls and instances; clients/tokens/options/request makers are fresh', async () => {
  const run = harness();
  const { XProvider } = run.load();
  const one = new XProvider();
  const two = new XProvider();
  const clients = await Promise.all([
    one.getClient('one:secret-one'),
    two.getClient('two:secret-two'),
    one.getClient('three:secret-three'),
  ]);
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(3);
  expect(new Set(clients).size).toBe(3);
  expect(new Set(clients.map((c) => c.requestMaker)).size).toBe(3);
  expect(new Set(clients.map((c) => c.input)).size).toBe(3);
  expect(
    run.calls.constructs.map((c) => [c.accessToken, c.accessSecret])
  ).toEqual([
    ['one', 'secret-one'],
    ['two', 'secret-two'],
    ['three', 'secret-three'],
  ]);
  process.env.X_API_KEY = 'synthetic-future-key';
  await two.getClient('four:secret-four');
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs[3]).toMatchObject({
    appKey: 'synthetic-future-key',
    accessToken: 'four',
    accessSecret: 'secret-four',
  });
});

test('failed public load rejects all concurrent callers once; only a future explicit operation loads again', async () => {
  const run = harness({ failLoad: true });
  const provider = providerOf(run);
  const outcomes = await Promise.allSettled([
    provider.getClient('one:secret-one'),
    provider.getClient('two:secret-two'),
  ]);
  expect(outcomes.map((o) => o.status)).toEqual(['rejected', 'rejected']);
  expect(outcomes.every((o) => o.reason === run.loadError)).toBe(true);
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toEqual([]);
  expect(run.calls.operations).toEqual([]);
  await new Promise((resolve) => setImmediate(resolve));
  expect(run.calls.loads).toBe(1);
  await provider.getClient('later:later-secret');
  expect(run.calls.loads).toBe(2);
  expect(run.calls.constructs).toEqual([
    {
      appKey: tokenOptions.appKey,
      appSecret: tokenOptions.appSecret,
      accessToken: 'later',
      accessSecret: 'later-secret',
    },
  ]);
});

test('per-call constructor failure does not replay operation or invalidate a successfully loaded class', async () => {
  const run = harness({ failConstructor: true });
  const provider = providerOf(run);
  await expect(
    provider.mention('first:secret', { query: 'ignored' })
  ).rejects.toBe(run.constructorError);
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(1);
  expect(run.calls.operations).toEqual([]);
  await provider.mention('later:later-secret', { query: 'synthetic-query' });
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(2);
  expect(run.calls.operations).toHaveLength(1);
});

test.each(cases)(
  '%s SDK failure stays outside original request catches and never replays',
  async (_method, invoke) => {
    const run = harness({ blockSdk: true });
    const provider = providerOf(run);
    await expect(invoke(provider)).rejects.toBe(run.loadError);
    expect(run.calls.loads).toBe(1);
    expect(run.calls.constructs).toEqual([]);
    expect(run.calls.operations).toEqual([]);
  }
);

test.each([
  ['analytics', 'userTimeline'],
  ['postAnalytics', 'singleTweet'],
  ['mention', 'userByUsername'],
  ['repostPostUsers', 'retweet'],
])(
  '%s preserves existing caught request failure without reload/replay',
  async (method, failMethod) => {
    const run = harness({ failMethod });
    const provider = providerOf(run);
    const invoke = cases.find((one) => one[0] === method)[1];
    const result = await invoke(provider);
    expect(result).toEqual(method === 'repostPostUsers' ? undefined : []);
    expect(run.calls.loads).toBe(1);
    expect(run.calls.constructs).toHaveLength(1);
    expect(
      run.calls.operations.filter((one) => one.method === failMethod)
    ).toHaveLength(1);
  }
);

test('synthetic public cached settings/custom logger and mutations during await are never overwritten', async () => {
  const originalLogger = { log: () => 'original' };
  const customLogger = { log: () => 'custom' };
  const settings = {
    logger: originalLogger,
    debug: false,
    deprecationWarnings: true,
  };
  const sdkFixture = {
    TwitterApi: class {
      constructor(input) {
        this.input = input;
        this.settings = settings;
      }
    },
    TwitterApiV2Settings: settings,
  };
  const run = harness({ sdk: sdkFixture });
  const provider = providerOf(run);
  const pending = provider.getClient('one:secret-one');
  // Mutations of this test-owned synthetic fixture only; no installed shared
  // SDK settings or global logger are changed by this test or product source.
  settings.logger = customLogger;
  settings.debug = true;
  settings.deprecationWarnings = false;
  const client = await pending;
  expect(client).toBeInstanceOf(sdkFixture.TwitterApi);
  expect(client.settings).toBe(settings);
  expect(settings.logger).toBe(customLogger);
  expect(settings.debug).toBe(true);
  expect(settings.deprecationWarnings).toBe(false);
  const later = await provider.getClient('two:secret-two');
  expect(later).not.toBe(client);
  expect(later.settings).toBe(settings);
  expect(run.calls.loads).toBe(1);
});

test.each([
  ['post', undefined],
  ['comment', 'synthetic-parent'],
])(
  '%s still uses new client then original media/request path with synthetic transport',
  async (method, parent) => {
    const run = harness();
    const provider = providerOf(run);
    const posts = [
      {
        ...details[0],
        media: [
          { path: 'https://media.example.test/video.mp4' },
          { path: 'https://media.example.test/image.gif' },
        ],
      },
    ];
    const response =
      method === 'post'
        ? await provider.post(
            'synthetic-user',
            'synthetic-access:synthetic-secret',
            posts,
            ownedIntegration
          )
        : await provider.comment(
            'synthetic-user',
            'synthetic-post',
            parent,
            'synthetic-access:synthetic-secret',
            posts,
            ownedIntegration
          );
    expect(run.calls.loads).toBe(1);
    expect(run.calls.constructs).toEqual([tokenOptions]);
    const uploads = run.calls.operations.filter(
      (o) => o.method === 'uploadMedia'
    );
    expect(uploads).toHaveLength(2);
    expect(uploads.map((o) => o.args[1])).toEqual([
      { media_type: 'video/mp4' },
      { media_type: 'image/gif' },
    ]);
    expect(uploads.map((o) => o.args[0].toString())).toEqual([
      'synthetic-media',
      'synthetic-converted',
    ]);
    const request = run.calls.operations.find((o) => o.method === 'fetch');
    expect(request.args[0]).toBe('https://api.x.com/2/tweets');
    const body = JSON.parse(request.args[1].body);
    expect(body).toMatchObject({
      text: 'Synthetic post',
      media: { media_ids: ['synthetic-media-id', 'synthetic-media-id'] },
    });
    if (method === 'comment')
      expect(body.reply).toEqual({ in_reply_to_tweet_id: parent });
    expect(response).toEqual([
      {
        postId: 'synthetic-published-id',
        id: 'synthetic-local-post',
        releaseURL:
          'https://twitter.com/synthetic-handle/status/synthetic-published-id',
        status: 'posted',
      },
    ]);
  }
);

test.each(cases)(
  '%s constructor failure keeps original uncaught boundary',
  async (_method, invoke) => {
    const run = harness({ failConstructor: true });
    const provider = providerOf(run);
    await expect(invoke(provider)).rejects.toBe(run.constructorError);
    expect(run.calls.loads).toBe(1);
    expect(run.calls.constructs).toHaveLength(1);
    expect(run.calls.operations).toEqual([]);
  }
);

test.each([
  ['authenticate', 'login'],
  ['generateAuthUrl', 'generateAuthLink'],
  ['autoRepostPost', 'tweetLikedBy'],
])(
  '%s still propagates its uncaught request failure without retry',
  async (method, failMethod) => {
    const run = harness({ failMethod });
    const provider = providerOf(run);
    await expect(
      cases.find((one) => one[0] === method)[1](provider)
    ).rejects.toBe(run.operationsError);
    expect(run.calls.loads).toBe(1);
    expect(run.calls.constructs).toHaveLength(1);
    expect(run.calls.operations).toHaveLength(1);
  }
);

test.each(['autoRepostPost', 'autoPlugPost'])(
  '%s below threshold keeps false/no timer/no followup request',
  async (method) => {
    const run = harness({ likes: 0 });
    const provider = providerOf(run);
    expect(await cases.find((one) => one[0] === method)[1](provider)).toBe(
      false
    );
    expect(run.calls.operations.map((o) => o.method)).toEqual(['tweetLikedBy']);
    expect(run.calls.events.filter((e) => e[0] === 'timer')).toEqual([]);
  }
);

test('analytics pagination keeps sequential token loop and one fresh client', async () => {
  const run = harness({
    timeline: (_id, args) =>
      args.pagination_token
        ? { data: { data: [{ id: 'last-page' }] }, meta: {} }
        : {
            data: {
              data: Array.from({ length: 100 }, (_, i) => ({
                id: 'synthetic-' + i,
              })),
            },
            meta: { next_token: 'synthetic-next' },
          },
  });
  await providerOf(run).analytics(
    'synthetic-user',
    'synthetic-access:synthetic-secret',
    7
  );
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(1);
  const pages = run.calls.operations.filter((o) => o.method === 'userTimeline');
  expect(pages).toHaveLength(2);
  expect(pages[0].args[1].pagination_token).toBeUndefined();
  expect(pages[1].args[1].pagination_token).toBe('synthetic-next');
  expect(
    run.calls.operations.find((o) => o.method === 'tweets').args[0]
  ).toHaveLength(101);
});

test('token/code getter order stays ahead of public root initialization, including throwing getters', async () => {
  const run = harness();
  const provider = providerOf(run);
  await provider.authenticate({
    get code() {
      run.calls.events.push(['code']);
      return 'synthetic-code';
    },
    get codeVerifier() {
      run.calls.events.push(['codeVerifier']);
      return 'synthetic-access:synthetic-secret';
    },
  });
  expect(run.calls.events.slice(0, 4)).toEqual([
    ['code'],
    ['codeVerifier'],
    ['load', 1],
    ['construct', 1],
  ]);
  const blocked = harness({ blockSdk: true });
  const cold = providerOf(blocked);
  const failure = new Error('synthetic token getter');
  await expect(
    cold.autoPlugPost(
      {
        get token() {
          throw failure;
        },
      },
      'unused',
      {}
    )
  ).rejects.toBe(failure);
  expect(blocked.calls.loads).toBe(0);
  expect(blocked.calls.constructs).toEqual([]);
});
