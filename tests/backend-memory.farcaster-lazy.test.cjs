'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const SOURCE =
  'libraries/nestjs-libraries/src/integrations/social/farcaster.provider.ts';
const REGISTRY =
  'libraries/nestjs-libraries/src/integrations/integration.manager.ts';
const REQUEST =
  '@contentfactory/nestjs-libraries/integrations/social/farcaster.provider';
const ROOT = '@neynar/nodejs-sdk';
const postDetails = (message = 'Synthetic text', extra = {}) => [
  { id: 'synthetic-post', message, media: [], ...extra },
];

function harness(options = {}) {
  const calls = { loads: 0, constructs: [], operations: [], events: [] };
  const loadError = new Error('synthetic Neynar load failure');
  const constructorError = new Error('synthetic Neynar constructor failure');
  class NeynarAPIClient {
    constructor(config) {
      calls.constructs.push({ ...config });
      calls.events.push(['construct', calls.constructs.length]);
      if (options.failConstructor && calls.constructs.length === 1)
        throw constructorError;
    }
    async publishCast(input) {
      calls.operations.push({ method: 'publishCast', input });
      calls.events.push([
        'publish',
        input.text,
        input.channelId ?? input.parent,
      ]);
      const ordinal = calls.operations.length;
      await options.publish?.(input, ordinal);
      return {
        cast: {
          author: { username: 'synthetic-author' },
          hash: `synthetic-hash-${ordinal}`,
        },
      };
    }
    async searchChannels(input) {
      calls.operations.push({ method: 'searchChannels', input });
      calls.events.push(['search', input.q]);
      if (options.searchError) throw options.searchError;
      return {
        channels: [{ name: 'Synthetic channel', id: 'synthetic-channel' }],
      };
    }
  }
  const mocks = {
    '@contentfactory/nestjs-libraries/integrations/social.abstract': {
      SocialAbstract: class {},
    },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: (length) => 's'.repeat(length),
    },
  };
  const resolve = (request) => {
    if (request.startsWith(ROOT + '/'))
      throw new Error('unsupported Neynar deep import');
    if (request !== ROOT) return undefined;
    calls.loads++;
    calls.events.push(['load', calls.loads]);
    if (options.blockSdk || (options.failLoad && calls.loads === 1))
      throw loadError;
    return { NeynarAPIClient };
  };
  const load = (file = SOURCE, extra = {}) =>
    loadTypeScriptModule(
      file,
      { ...mocks, ...extra },
      { sources: { [REQUEST]: SOURCE }, resolve }
    );
  return { calls, loadError, constructorError, load };
}

let oldEnvironment;
beforeEach(() => {
  oldEnvironment = {
    key: process.env.NEYNAR_SECRET_KEY,
    client: process.env.NEYNAR_CLIENT_ID,
  };
  process.env.NEYNAR_SECRET_KEY = 'synthetic-app-key-before';
  process.env.NEYNAR_CLIENT_ID = 'synthetic-client-id';
});
afterEach(() => {
  for (const [name, value] of [
    ['NEYNAR_SECRET_KEY', oldEnvironment.key],
    ['NEYNAR_CLIENT_ID', oldEnvironment.client],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

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
  // Import order differs from list order, so use actual list constructor names.
  const listOrder = [...source.matchAll(/  new (\w+)\(\),/g)].map(
    (match) => match[1]
  );
  return { ...loaded, listOrder };
}

test('real registry, Farcaster rules/tools and synchronous lookup do not load the public SDK', async () => {
  const run = harness({ blockSdk: true });
  const { socialIntegrationList, IntegrationManager, listOrder } =
    registry(run);
  const manager = new IntegrationManager();
  const provider = manager.getSocialIntegration('wrapcast');
  expect(socialIntegrationList.map((p) => p.constructor.name)).toEqual(
    listOrder
  );
  expect(provider).toMatchObject({
    identifier: 'wrapcast',
    name: 'Farcaster',
    isWeb3: true,
    isBetweenSteps: false,
    maxConcurrentJob: 3,
    editor: 'normal',
    scopes: [],
  });
  expect(provider.maxLength()).toBe(800);
  expect(provider.dto.name).toBe('FarcasterDto');
  expect(manager.getAllRulesDescription().wrapcast).toBe(
    'Farcaster/Warpcast can only accept pictures'
  );
  expect(manager.getAllTools().wrapcast).toEqual([
    {
      methodName: 'subreddits',
      description: 'Search channels',
      dataSchema: [{ key: 'word', type: 'string', description: 'Search word' }],
    },
  ]);
  expect(
    (await manager.getAllIntegrations()).social.find(
      (p) => p.identifier === 'wrapcast'
    )
  ).toMatchObject({ name: 'Farcaster', isWeb3: true, editor: 'normal' });
  expect(run.calls.loads).toBe(0);
  expect(run.calls.constructs).toEqual([]);
});

test('constructor, validation, refresh and both auth methods remain SDK-cold, including malformed auth', async () => {
  const run = harness({ blockSdk: true });
  const { FarcasterProvider } = run.load();
  const provider = new FarcasterProvider();
  await expect(provider.checkValidity([])).resolves.toBe(true);
  await expect(provider.checkValidity([[{ path: 'video.mp4' }]])).resolves.toBe(
    'Can only accept images'
  );
  await expect(provider.checkValidity([[{ path: 'image.jpg' }]])).resolves.toBe(
    true
  );
  await expect(provider.refreshToken('synthetic-unused')).resolves.toEqual({
    refreshToken: '',
    expiresIn: 0,
    accessToken: '',
    id: '',
    name: '',
    picture: '',
    username: '',
  });
  await expect(provider.generateAuthUrl()).resolves.toEqual({
    url: 'synthetic-client-id||' + 's'.repeat(17),
    codeVerifier: 's'.repeat(10),
    state: 's'.repeat(17),
  });
  const auth = {
    fid: 12,
    display_name: 'Synthetic',
    signer_uuid: 'synthetic-signer',
    username: 'synthetic-user',
  };
  await expect(
    provider.authenticate({
      code: Buffer.from(JSON.stringify(auth)).toString('base64'),
      codeVerifier: '',
    })
  ).resolves.toMatchObject({
    id: '12',
    name: 'Synthetic',
    accessToken: 'synthetic-signer',
    refreshToken: '',
    picture: '',
    username: 'synthetic-user',
  });
  await expect(
    provider.authenticate({
      code: Buffer.from('{').toString('base64'),
      codeVerifier: '',
    })
  ).rejects.toBeInstanceOf(SyntaxError);
  expect(run.calls.loads).toBe(0);
  expect(run.calls.constructs).toEqual([]);
});

const providerOf = (run) => new (run.load().FarcasterProvider)();
const tick = () => new Promise((resolve) => setImmediate(resolve));

// The actual client constructor never runs; the public-root resolution hook
// supplies only the fake above. No real transport, signer or SDK is used.
test('first two-channel post keeps exact params, sequential order and output with one successful client', async () => {
  let release;
  const first = new Promise((resolve) => {
    release = resolve;
  });
  const run = harness({
    publish: async (_input, ordinal) => {
      if (ordinal === 1) await first;
    },
  });
  const provider = providerOf(run);
  const promise = provider.post(
    'synthetic-account',
    'synthetic-signer-a',
    postDetails('Synthetic post', {
      media: [{ path: 'https://images.example.test/a.jpg' }],
      settings: {
        subreddit: [
          { value: { id: 'channel-a' } },
          { value: { id: 'channel-b' } },
        ],
      },
    })
  );
  await tick();
  expect(run.calls.operations).toHaveLength(1);
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toEqual([
    { apiKey: 'synthetic-app-key-before' },
  ]);
  release();
  await expect(promise).resolves.toEqual([
    {
      id: 'synthetic-post',
      postId: 'synthetic-hash-1,synthetic-hash-2',
      releaseURL:
        'https://warpcast.com/synthetic-author/synthetic-hash-1,https://warpcast.com/synthetic-author/synthetic-hash-2',
      status: 'published',
    },
  ]);
  expect(run.calls.operations).toEqual(
    ['channel-a', 'channel-b'].map((channelId) => ({
      method: 'publishCast',
      input: {
        embeds: [{ url: 'https://images.example.test/a.jpg' }],
        signerUuid: 'synthetic-signer-a',
        text: 'Synthetic post',
        channelId,
      },
    }))
  );
});

test.each([undefined, []])(
  'post without configured channels publishes once with no channelId (%s)',
  async (subreddit) => {
    const run = harness();
    await providerOf(run).post(
      'synthetic-account',
      'synthetic-signer',
      postDetails('Synthetic unchannelled', { settings: { subreddit } })
    );
    expect(run.calls.operations).toEqual([
      {
        method: 'publishCast',
        input: {
          embeds: [],
          signerUuid: 'synthetic-signer',
          text: 'Synthetic unchannelled',
        },
      },
    ]);
  }
);

test('post, comment and channel search reuse one app client across instances without caching signers', async () => {
  const run = harness();
  const { FarcasterProvider } = run.load();
  const one = new FarcasterProvider();
  const two = new FarcasterProvider();
  await one.post(
    'synthetic-account-a',
    'synthetic-signer-a',
    postDetails('Synthetic first')
  );
  const response = await two.comment(
    'synthetic-account-b',
    'ignored-post-1,ignored-post-2',
    'parent-a,parent-b',
    'synthetic-signer-b',
    postDetails('Synthetic reply', {
      media: [{ path: 'https://images.example.test/reply.jpg' }],
    }),
    {}
  );
  expect(response).toEqual([
    {
      id: 'synthetic-post',
      postId: 'synthetic-hash-2,synthetic-hash-3',
      releaseURL:
        'https://warpcast.com/synthetic-author/synthetic-hash-2,https://warpcast.com/synthetic-author/synthetic-hash-3',
      status: 'published',
    },
  ]);
  await expect(
    one.subreddits(
      'synthetic-unused-token',
      { word: 'Synthetic query' },
      'synthetic-account',
      {}
    )
  ).resolves.toEqual([
    {
      title: 'Synthetic channel',
      name: 'Synthetic channel',
      id: 'synthetic-channel',
    },
  ]);
  expect(run.calls.operations).toEqual([
    {
      method: 'publishCast',
      input: {
        embeds: [],
        signerUuid: 'synthetic-signer-a',
        text: 'Synthetic first',
      },
    },
    ...['parent-a', 'parent-b'].map((parent) => ({
      method: 'publishCast',
      input: {
        embeds: [{ url: 'https://images.example.test/reply.jpg' }],
        signerUuid: 'synthetic-signer-b',
        text: 'Synthetic reply',
        parent,
      },
    })),
    { method: 'searchChannels', input: { q: 'Synthetic query', limit: 10 } },
  ]);
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toEqual([
    { apiKey: 'synthetic-app-key-before' },
  ]);
});

test('comment first-use takes parent hashes from postId when lastCommentId is absent', async () => {
  const run = harness();
  await providerOf(run).comment(
    'synthetic-account',
    'original-a,original-b',
    undefined,
    'synthetic-signer',
    postDetails('Synthetic reply'),
    {}
  );
  expect(run.calls.operations.map((o) => o.input.parent)).toEqual([
    'original-a',
    'original-b',
  ]);
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(1);
});

test('search-only first-use loads one client and preserves result mapping', async () => {
  const run = harness();
  await expect(
    providerOf(run).subreddits(
      'synthetic-unused',
      { word: 'Synthetic query' },
      'synthetic-account',
      {}
    )
  ).resolves.toEqual([
    {
      title: 'Synthetic channel',
      name: 'Synthetic channel',
      id: 'synthetic-channel',
    },
  ]);
  expect(run.calls.operations).toEqual([
    { method: 'searchChannels', input: { q: 'Synthetic query', limit: 10 } },
  ]);
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(1);
});

test('concurrent first calls across provider instances share initialization but keep each invocation params', async () => {
  const run = harness();
  const { FarcasterProvider } = run.load();
  await Promise.all([
    new FarcasterProvider().post(
      'synthetic-alpha',
      'synthetic-signer-alpha',
      postDetails('Synthetic alpha')
    ),
    new FarcasterProvider().post(
      'synthetic-beta',
      'synthetic-signer-beta',
      postDetails('Synthetic beta')
    ),
    new FarcasterProvider().subreddits(
      'synthetic-unused',
      { word: 'Synthetic concurrent' },
      'synthetic-gamma',
      {}
    ),
  ]);
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(1);
  expect(run.calls.operations).toEqual([
    {
      method: 'publishCast',
      input: {
        embeds: [],
        signerUuid: 'synthetic-signer-alpha',
        text: 'Synthetic alpha',
      },
    },
    {
      method: 'publishCast',
      input: {
        embeds: [],
        signerUuid: 'synthetic-signer-beta',
        text: 'Synthetic beta',
      },
    },
    {
      method: 'searchChannels',
      input: { q: 'Synthetic concurrent', limit: 10 },
    },
  ]);
});

test('app API key remains captured at module evaluation when the environment changes before first use', async () => {
  const run = harness();
  const provider = providerOf(run);
  process.env.NEYNAR_SECRET_KEY = 'synthetic-app-key-after';
  expect(run.calls.constructs).toEqual([]);
  await provider.post('synthetic-account', 'synthetic-signer', postDetails());
  expect(run.calls.constructs).toEqual([
    { apiKey: 'synthetic-app-key-before' },
  ]);
});

test.each([undefined, ''])(
  'existing fallback is captured for missing/empty app key (%s)',
  async (key) => {
    if (key === undefined) delete process.env.NEYNAR_SECRET_KEY;
    else process.env.NEYNAR_SECRET_KEY = key;
    const run = harness();
    const provider = providerOf(run);
    process.env.NEYNAR_SECRET_KEY = 'synthetic-app-key-after';
    await provider.post('synthetic-account', 'synthetic-signer', postDetails());
    expect(run.calls.constructs).toEqual([
      { apiKey: '00000000-000-0000-000-000000000000' },
    ]);
  }
);

test.each([
  ['missing post', (p) => p.post('', '', [])],
  [
    'bad media map',
    (p) => p.post('', '', postDetails('Synthetic', { media: {} })),
  ],
  ['missing comment', (p) => p.comment('', 'parent', undefined, '', [], {})],
  [
    'bad parent split',
    (p) => p.comment('', null, undefined, '', postDetails(), {}),
  ],
  ['absent channel data', (p) => p.subreddits('', undefined, '', {})],
])('%s fails before any first-use SDK load', async (_label, invoke) => {
  const run = harness({ blockSdk: true });
  const provider = providerOf(run);
  await expect(invoke(provider)).rejects.toBeInstanceOf(TypeError);
  expect(run.calls.loads).toBe(0);
  expect(run.calls.constructs).toEqual([]);
  expect(run.calls.operations).toEqual([]);
});

test('argument getters keep media/path/message/channel evaluation before first-load and publish', async () => {
  const run = harness();
  const provider = providerOf(run);
  const media = {
    get path() {
      run.calls.events.push(['path']);
      return 'https://images.example.test/a.jpg';
    },
  };
  const channel = {
    value: {
      get id() {
        run.calls.events.push(['channel-id']);
        return 'synthetic-channel';
      },
    },
  };
  const detail = {
    id: 'synthetic-post',
    settings: { subreddit: [channel] },
    get media() {
      run.calls.events.push(['media']);
      return [media];
    },
    get message() {
      run.calls.events.push(['message']);
      return 'Synthetic';
    },
  };
  await provider.post('', 'synthetic-signer', [detail]);
  expect(run.calls.events).toEqual([
    ['media'],
    ['path'],
    ['message'],
    ['channel-id'],
    ['channel-id'],
    ['load', 1],
    ['construct', 1],
    ['publish', 'Synthetic', 'synthetic-channel'],
  ]);
});

test.each(['post', 'comment', 'subreddits'])(
  'throwing %s argument getter fails before any first load',
  async (method) => {
    const failure = new Error('synthetic argument evaluation');
    const run = harness({ blockSdk: true });
    const provider = providerOf(run);
    const detail = {
      id: 'synthetic-post',
      media: [],
      get message() {
        throw failure;
      },
    };
    const promise =
      method === 'post'
        ? provider.post('', '', [detail])
        : method === 'comment'
        ? provider.comment('', 'parent', undefined, '', [detail], {})
        : provider.subreddits(
            '',
            {
              get word() {
                throw failure;
              },
            },
            '',
            {}
          );
    await expect(promise).rejects.toBe(failure);
    expect(run.calls.loads).toBe(0);
    expect(run.calls.operations).toEqual([]);
  }
);

test('absent message remains an undefined SDK argument rather than adding a new validator', async () => {
  const run = harness();
  const provider = providerOf(run);
  await provider.post('', 'synthetic-signer', [
    { id: 'synthetic-post', media: [] },
  ]);
  expect(run.calls.operations[0].input).toEqual({
    embeds: [],
    signerUuid: 'synthetic-signer',
    text: undefined,
  });
});

test('an empty existing channel iterable stays cold and preserves the empty joined response', async () => {
  const run = harness({ blockSdk: true });
  const provider = providerOf(run);
  const empty = { *[Symbol.iterator]() {} };
  await expect(
    provider.post(
      '',
      '',
      postDetails('Synthetic', { settings: { subreddit: empty } })
    )
  ).resolves.toEqual([
    { id: 'synthetic-post', postId: '', releaseURL: '', status: 'published' },
  ]);
  expect(run.calls.loads).toBe(0);
  expect(run.calls.operations).toEqual([]);
});

test.each(['load', 'constructor'])(
  '%s failure rejects concurrent current operations once; only a later independent call may initialize again',
  async (phase) => {
    const run = harness({
      failLoad: phase === 'load',
      failConstructor: phase === 'constructor',
    });
    const provider = providerOf(run);
    const failure = phase === 'load' ? run.loadError : run.constructorError;
    const failed = await Promise.allSettled([
      provider.post(
        '',
        'synthetic-old-alpha',
        postDetails('Synthetic old alpha')
      ),
      provider.comment(
        '',
        'parent',
        undefined,
        'synthetic-old-beta',
        postDetails('Synthetic old beta'),
        {}
      ),
    ]);
    expect(failed).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ]);
    expect(run.calls.loads).toBe(1);
    expect(run.calls.constructs).toHaveLength(phase === 'load' ? 0 : 1);
    expect(run.calls.operations).toEqual([]);
    await tick();
    expect(run.calls.loads).toBe(1);
    expect(run.calls.operations).toEqual([]);
    await provider.post(
      '',
      'synthetic-new-signer',
      postDetails('Synthetic new operation')
    );
    expect(run.calls.loads).toBe(2);
    expect(run.calls.constructs).toHaveLength(phase === 'load' ? 1 : 2);
    expect(run.calls.operations).toEqual([
      {
        method: 'publishCast',
        input: {
          embeds: [],
          signerUuid: 'synthetic-new-signer',
          text: 'Synthetic new operation',
        },
      },
    ]);
  }
);

test('publication error stops the loop, propagates unchanged and never replays or resets a successful client', async () => {
  const failure = new Error('synthetic publication failure');
  const run = harness({
    publish: async (_input, ordinal) => {
      if (ordinal === 1) throw failure;
    },
  });
  const provider = providerOf(run);
  await expect(
    provider.post(
      '',
      'synthetic-old',
      postDetails('Synthetic old', {
        settings: {
          subreddit: [{ value: { id: 'first' } }, { value: { id: 'never' } }],
        },
      })
    )
  ).rejects.toBe(failure);
  await tick();
  expect(run.calls.operations).toHaveLength(1);
  await provider.post(
    '',
    'synthetic-new',
    postDetails('Synthetic independent')
  );
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(1);
  expect(run.calls.operations.map((o) => o.input.text)).toEqual([
    'Synthetic old',
    'Synthetic independent',
  ]);
  expect(run.calls.operations[0].input.channelId).toBe('first');
});

test('search error propagates unchanged without initializing again for a later post', async () => {
  const failure = new Error('synthetic search failure');
  const run = harness({ searchError: failure });
  const provider = providerOf(run);
  await expect(
    provider.subreddits('', { word: 'Synthetic' }, '', {})
  ).rejects.toBe(failure);
  await tick();
  expect(run.calls.operations).toHaveLength(1);
  await provider.post('', 'synthetic-signer', postDetails());
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(1);
});
