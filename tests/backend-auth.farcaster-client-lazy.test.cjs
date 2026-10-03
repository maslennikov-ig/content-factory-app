'use strict';

require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const AUTH_PROVIDER_REQUEST =
  '@contentfactory/backend/services/auth/providers.interface';
const AUTH_PROVIDER_SOURCE =
  'apps/backend/src/services/auth/providers.interface.ts';
const NEYNAR_REQUEST = '@neynar/nodejs-sdk';
const FARCASTER_PROVIDER_SOURCE =
  'apps/backend/src/services/auth/providers/farcaster.provider.ts';

function harness(options = {}) {
  const calls = { loads: 0, constructs: [], lookups: [] };
  const loadError = new Error('synthetic Neynar module-load failure');
  const constructorError = new Error('synthetic Neynar constructor failure');

  class NeynarAPIClient {
    constructor(config) {
      calls.constructs.push(config);
      if (options.failFirstConstructor && calls.constructs.length === 1) {
        throw constructorError;
      }
    }

    async lookupSigner({ signerUuid }) {
      calls.lookups.push(signerUuid);
      if (options.lookupError) throw options.lookupError;
      return options.results?.[signerUuid] ?? { status: 'pending' };
    }
  }

  const mocks = {
    '@nestjs/common': { Injectable: () => (target) => target },
  };

  return {
    calls,
    loadError,
    constructorError,
    load() {
      return loadTypeScriptModule(FARCASTER_PROVIDER_SOURCE, mocks, {
        sources: { [AUTH_PROVIDER_REQUEST]: AUTH_PROVIDER_SOURCE },
        resolve(request) {
          if (request !== NEYNAR_REQUEST) return undefined;
          calls.loads += 1;
          if (options.failFirstLoad && calls.loads === 1) throw loadError;
          return { NeynarAPIClient };
        },
      });
    },
  };
}

async function withSecretKey(value, run) {
  const previous = process.env.NEYNAR_SECRET_KEY;
  if (value === undefined) delete process.env.NEYNAR_SECRET_KEY;
  else process.env.NEYNAR_SECRET_KEY = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.NEYNAR_SECRET_KEY;
    else process.env.NEYNAR_SECRET_KEY = previous;
  }
}

test('provider registration and construction leave the Neynar SDK unloaded', async () => {
  await withSecretKey('synthetic-auth-key', () => {
    const run = harness();
    const { FarcasterProvider } = run.load();
    const AuthProviderAbstract = Object.getPrototypeOf(
      FarcasterProvider.prototype
    ).constructor;

    expect(run.calls.loads).toBe(0);
    expect(run.calls.constructs).toEqual([]);
    expect(new FarcasterProvider().generateLink()).toBe('');
    expect(run.calls.loads).toBe(0);
    expect(run.calls.constructs).toEqual([]);
    expect(
      Reflect.getMetadata('auth-provider', AuthProviderAbstract).filter(
        (entry) => entry.target === FarcasterProvider
      )
    ).toEqual([{ target: FarcasterProvider, provider: 'FARCASTER' }]);
  });
});

test('parallel auth operations share one client and preserve the captured key and approved results', async () => {
  const previous = process.env.NEYNAR_SECRET_KEY;
  process.env.NEYNAR_SECRET_KEY = 'synthetic-key-at-import';
  try {
    const run = harness({
      results: {
        'signer-from-code': { status: 'approved', fid: 21 },
        'signer-token': { status: 'approved', fid: 42 },
      },
    });
    const { FarcasterProvider } = run.load();
    process.env.NEYNAR_SECRET_KEY = 'synthetic-key-after-import';
    const provider = new FarcasterProvider();
    const code = Buffer.from(
      JSON.stringify({ signer_uuid: 'signer-from-code' })
    ).toString('base64');

    expect(run.calls.loads).toBe(0);
    expect(run.calls.constructs).toEqual([]);
    await expect(
      Promise.all([provider.getToken(code), provider.getUser('signer-token')])
    ).resolves.toEqual([
      'signer-from-code',
      { id: 'farcaster_42', email: 'farcaster_42' },
    ]);
    expect(run.calls.loads).toBe(1);
    expect(run.calls.constructs).toEqual([
      { apiKey: 'synthetic-key-at-import' },
    ]);
    expect(run.calls.lookups).toEqual(['signer-from-code', 'signer-token']);
  } finally {
    if (previous === undefined) delete process.env.NEYNAR_SECRET_KEY;
    else process.env.NEYNAR_SECRET_KEY = previous;
  }
});

test('fallback key and non-approved signer results keep the existing output shapes', async () => {
  await withSecretKey(undefined, async () => {
    const run = harness();
    const { FarcasterProvider } = run.load();
    const provider = new FarcasterProvider();

    await expect(
      provider.getToken(
        Buffer.from(JSON.stringify({ signer_uuid: 'pending-token' })).toString(
          'base64'
        )
      )
    ).resolves.toBe('');
    await expect(provider.getUser('pending-user')).resolves.toEqual({
      id: '',
      email: '',
    });
    expect(run.calls.constructs).toEqual([
      { apiKey: '00000000-000-0000-000-000000000000' },
    ]);
  });
});

test('malformed auth payloads reject before loading the SDK', async () => {
  const run = harness();
  const { FarcasterProvider } = run.load();
  const provider = new FarcasterProvider();

  await expect(
    provider.getToken(Buffer.from('{').toString('base64'))
  ).rejects.toBeInstanceOf(SyntaxError);
  expect(run.calls.loads).toBe(0);
  expect(run.calls.constructs).toEqual([]);
});

test('SDK loading and construction failures propagate and allow a later initialization retry', async () => {
  const loadRun = harness({ failFirstLoad: true });
  const { FarcasterProvider: LoadProvider } = loadRun.load();
  const loadProvider = new LoadProvider();
  await expect(loadProvider.getUser('retry-token')).rejects.toBe(
    loadRun.loadError
  );
  await expect(loadProvider.getUser('retry-token')).resolves.toEqual({
    id: '',
    email: '',
  });
  expect(loadRun.calls.loads).toBe(2);
  expect(loadRun.calls.constructs).toHaveLength(1);

  const constructorRun = harness({ failFirstConstructor: true });
  const { FarcasterProvider: ConstructorProvider } = constructorRun.load();
  const constructorProvider = new ConstructorProvider();
  await expect(constructorProvider.getUser('retry-token')).rejects.toBe(
    constructorRun.constructorError
  );
  await expect(constructorProvider.getUser('retry-token')).resolves.toEqual({
    id: '',
    email: '',
  });
  expect(constructorRun.calls.loads).toBe(2);
  expect(constructorRun.calls.constructs).toHaveLength(2);
});

test('lookup failures propagate without changing the provider contract', async () => {
  const lookupError = new Error('synthetic signer lookup failure');
  const run = harness({ lookupError });
  const { FarcasterProvider } = run.load();
  const provider = new FarcasterProvider();

  await expect(provider.getUser('failing-token')).rejects.toBe(lookupError);
  expect(run.calls.loads).toBe(1);
  expect(run.calls.constructs).toHaveLength(1);
  expect(run.calls.lookups).toEqual(['failing-token']);
});
