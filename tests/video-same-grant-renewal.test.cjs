const {loadSubscriptionModules, createProviderFixture} = require('./helpers/video-subscription-provider-fixture.cjs');

function fixture(failRefresh = false, options = {}) {
  const m = loadSubscriptionModules({'@contentfactory/helpers/auth/auth.service': {AuthService: {
    fixedEncryption: value => value, fixedDecryption: value => value,
  }}});
  const def = {provider: 'higgsfield', issuer: 'https://issuer.invalid', resource: 'https://provider.invalid/mcp'};
  const redirect = 'https://app.invalid/callback';
  const registrationId = m.registry.subscriptionHash([def.issuer, redirect]);
  const connection = {id: 'connection', ownerId: 'actor', provider: 'higgsfield', state: 'discovery_required',
    generation: 1, tokenVersion: 1, issuer: def.issuer, resource: def.resource, walletDigest: 'unverified:test',
    encryptedTokens: JSON.stringify({access_token: 'old-access', ...(options.noRefresh ? {} : {refresh_token: 'old-refresh'}), ...(options.originalScope ? {scope: options.originalScope} : {})}), refreshOwner: null, refreshUntil: null};
  const receipts = new Map(); let refreshCalls = 0;
  const db = {
    videoSubscriptionJob: {findFirst: async () => options.activeJob ? {id: 'active'} : null},
    videoSubscriptionRegistration: {findUnique: async ({where}) => where.id === registrationId ? {issuer: def.issuer, redirectUri: redirect, encryptedClient: JSON.stringify({client_id: 'client'})} : null},
    videoAccessPreflight: {
      findUnique: async ({where}) => receipts.get(where.id) ?? null,
      create: async ({data}) => {receipts.set(data.id, data); return data;},
      update: async ({where, data}) => {Object.assign(receipts.get(where.id), data); return receipts.get(where.id);},
    },
    videoSubscriptionConnection: {updateMany: async ({where, data}) => {
      if (where.generation !== connection.generation || where.tokenVersion !== connection.tokenVersion || (where.refreshOwner && where.refreshOwner !== connection.refreshOwner)) return {count: 0};
      for (const [key, value] of Object.entries(data)) connection[key] = value && typeof value === 'object' && 'increment' in value ? connection[key] + value.increment : value;
      return {count: 1};
    }},
  };
  const repository = {db, transaction: async run => run(db), connection: async (org, actor, id) => {
    if (org !== 'org' || actor !== 'actor' || id !== connection.id) throw Error('wrong owner'); return connection;
  }};
  const oauth = {metadata: async () => {if(options.failMetadata) throw Error('metadata unavailable'); return {};}, refresh: async () => {refreshCalls++; if (options.onRefresh) await options.onRefresh(); if (failRefresh) throw Error('lost response'); return {access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 300, ...(options.freshScope !== undefined ? {scope: options.freshScope} : {})};}};
  const service = new m.connection.VideoConnectionService(repository, {now: () => new Date('2026-01-01T00:00:00Z')}, oauth);
  service.connectable = async () => def; service.redirect = () => redirect;
  const input = {connectionId: connection.id, accountGeneration: 1, tokenVersion: 1, pilotId: 'pilot', parentRevision: 1};
  const renew = () => m.authenticatedSession.withAuthenticatedSession('actor', 'session', () => service.renewOwnedGrantV1('org', 'actor', input, async () => {}));
  return {connection, receipts, renew, calls: () => refreshCalls};
}

test('same-grant renewal rotates once and adopts the completed receipt', async () => {
  const f = fixture(); const first = await f.renew(); const second = await f.renew();
  expect(first).toEqual(second); expect(f.calls()).toBe(1);
  expect(f.connection).toMatchObject({id: 'connection', generation: 1, tokenVersion: 2, state: 'discovery_required', walletDigest: 'unverified:test'});
  expect(JSON.stringify([...f.receipts.values()])).not.toMatch(/old-refresh|new-refresh|new-access/);
});

test('lost refresh response remains pending and cannot trigger another dispatch', async () => {
  const f = fixture(true);
  await expect(f.renew()).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_UNCONFIRMED'}});
  await expect(f.renew()).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_UNCONFIRMED'}});
  expect(f.calls()).toBe(1); expect([...f.receipts.values()][0].snapshot.state).toBe('pending');
  expect(f.connection.tokenVersion).toBe(1);
});

test('metadata failure happens before the durable dispatch claim', async () => {
  const options = {failMetadata: true}; const f = fixture(false, options);
  await expect(f.renew()).rejects.toThrow('metadata unavailable');
  expect(f.receipts.size).toBe(0); expect(f.calls()).toBe(0);
  options.failMetadata = false; await f.renew(); expect(f.calls()).toBe(1);
});

test.each([{freshScope: 'write read', expected: 'write read'}, {freshScope: undefined, expected: 'read write'}])('retains equivalent scope regardless of order or omission', async ({freshScope, expected}) => {
  const f = fixture(false, {originalScope: 'read write', freshScope});
  await f.renew(); expect(JSON.parse(f.connection.encryptedTokens).scope).toBe(expected);
});

test('scope narrowing stores rotated credentials but refuses a usable renewal receipt', async () => {
  const f = fixture(false, {originalScope: 'read write', freshScope: 'read'});
  await expect(f.renew()).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_UNCONFIRMED'}});
  expect(f.connection.tokenVersion).toBe(2); expect([...f.receipts.values()][0].snapshot.state).toBe('scope_changed');
  await expect(f.renew()).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_UNCONFIRMED'}}); expect(f.calls()).toBe(1);
});

test('explicit empty scope is a narrowing, not an omitted scope', async () => {
  const f = fixture(false, {originalScope: 'read write', freshScope: ''});
  await expect(f.renew()).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_UNCONFIRMED'}});
  expect(f.connection.tokenVersion).toBe(2); expect(JSON.parse(f.connection.encryptedTokens).scope).toBe('');
  expect([...f.receipts.values()][0].snapshot.state).toBe('scope_changed');
  await expect(f.renew()).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_UNCONFIRMED'}}); expect(f.calls()).toBe(1);
});

test.each([{activeJob: true}, {noRefresh: true}])('missing grant or active job cannot dispatch a renewal: %j', async options => {
  const f = fixture(false, options); await expect(f.renew()).rejects.toBeDefined();
  expect(f.calls()).toBe(0); expect(f.receipts.size).toBe(0); expect(f.connection.tokenVersion).toBe(1);
});

test('a concurrent call observes pending and cannot dispatch another refresh', async () => {
  let release, started; const atRefresh = new Promise(resolve => {started = resolve;});
  const f = fixture(false, {onRefresh: () => new Promise(resolve => {release = resolve; started();})});
  const first = f.renew(); await atRefresh;
  await expect(f.renew()).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_UNCONFIRMED'}});
  expect(f.calls()).toBe(1); release(); await first;
  expect(f.connection.tokenVersion).toBe(2);
});

test('installed OAuth SDK refreshes and rotates the original grant through a loopback provider', async () => {
  const f = await createProviderFixture();
  try {
    const def = f.runtime.definition('higgsfield'), metadata = await f.oauth.metadata(def);
    const client = await f.oauth.registration(def, metadata, 'http://127.0.0.1:43118/media/callback');
    const original = f.issueTokens('higgsfield');
    const rotated = await f.oauth.refresh(def, metadata, client, original.refresh_token);
    expect(rotated.access_token).toBeTruthy(); expect(rotated.refresh_token).not.toBe(original.refresh_token);
    expect(f.state.refreshes).toHaveLength(1);
    await expect(f.oauth.refresh(def, metadata, client, original.refresh_token)).rejects.toThrow();
    expect(f.state.refreshes).toHaveLength(1);
    expect(f.state.egress.every(request => new URL(request.url).origin === f.origin)).toBe(true);
  } finally { await f.close(); }
});
