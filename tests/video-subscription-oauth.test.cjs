const { createProviderFixture, codeOf } = require('./helpers/video-subscription-provider-fixture.cjs');

const withProvider = async run => { const f = await createProviderFixture(); try { return await run(f); } finally { await f.close(); } };

describe('subscription OAuth and MCP use real SDK over owned loopback HTTP', () => {
  jest.setTimeout(15000);

  test.each(['higgsfield', 'heygen'])('S256/resource/client/issuer exchange establishes authenticated wallet identity: %s', provider => withProvider(async f => {
    const def = f.runtime.definition(provider);
    const metadata = await f.oauth.metadata(def);
    const redirect = 'http://127.0.0.1:43118/media/callback';
    const client = await f.oauth.registration(def, metadata, redirect);
    const auth = await f.oauth.authorize(def, metadata, client, redirect, 'synthetic-state');
    const callback = await f.authorize(auth.authorizationUrl.href);
    expect(callback.searchParams.get('iss')).toBe(def.issuer);
    expect(callback.searchParams.get('state')).toBe('synthetic-state');
    const tokens = await f.oauth.exchange(def, metadata, client, redirect, callback.searchParams.get('code'), auth.codeVerifier);
    expect(await f.oauth.identity(def, tokens.access_token)).toBe('synthetic-wallet-owner');
    expect(f.state.exchanges).toEqual([{provider, resource: def.resource, pkceVerified: true}]);
    expect(f.state.registrations[0]).toMatchObject({client_name: 'Content Factory', token_endpoint_auth_method: 'none'});
    expect(JSON.stringify(f.state.requests)).not.toContain(tokens.access_token);
    expect(f.state.egress.every(r => new URL(r.url).origin === f.origin)).toBe(true);
    expect(f.state.submits).toHaveLength(0);
  }));

  test('wrong PKCE verifier and reused code are refused by HTTP token server', () => withProvider(async f => {
    const d = f.runtime.definition('higgsfield'), metadata = await f.oauth.metadata(d);
    const redirect = 'http://127.0.0.1:43118/media/callback';
    const client = await f.oauth.registration(d, metadata, redirect);
    const auth = await f.oauth.authorize(d, metadata, client, redirect, 'test-state');
    const callback = await f.authorize(auth.authorizationUrl.href), code = callback.searchParams.get('code');
    await expect(f.oauth.exchange(d, metadata, client, redirect, code, 'wrong-verifier')).rejects.toThrow();
    await expect(f.oauth.exchange(d, metadata, client, redirect, code, auth.codeVerifier)).rejects.toThrow();
    expect(f.state.exchanges).toHaveLength(0);
  }));

  test('resource, issuer, S256 and registered endpoint validation fail closed', () => withProvider(async f => {
    const d = f.runtime.definition('higgsfield');
    for (const resourceOverrides of [{resource: 'https://foreign.invalid/mcp'}, {authorization_servers: ['https://foreign.invalid']}]) {
      f.state.resourceOverrides = resourceOverrides;
      await expect(f.oauth.metadata(d)).rejects.toMatchObject({});
    }
    f.state.resourceOverrides = {};
    for (const metadataOverrides of [{issuer: `${f.origin}/heygen`}, {code_challenge_methods_supported: ['plain']}, {token_endpoint: 'https://foreign.invalid/token'}]) {
      f.state.metadataOverrides = metadataOverrides;
      await expect(f.oauth.metadata(d)).rejects.toThrow();
    }
    expect(f.state.egress.every(r => new URL(r.url).origin === f.origin)).toBe(true);
  }));

  test('email, decoded claims and foreign issuer cannot stand in for authenticated wallet identity', () => withProvider(async f => {
    const d = f.runtime.definition('heygen'), token = f.issueTokens('heygen').access_token;
    for (const identity of [{iss: d.issuer, email: 'owner@example.invalid'}, {iss: 'https://foreign.invalid', sub: 'same-owner'}, {iss: d.issuer, sub: ''}]) {
      f.state.identityOverride = identity;
      await expect(f.oauth.identity(d, token)).rejects.toThrow();
    }
  }));

  test('runtime and MCP refuse arbitrary endpoints/tools and redirects without provider egress', () => withProvider(async f => {
    const d = f.runtime.definition('higgsfield'), t = f.issueTokens('higgsfield').access_token;
    const before = f.state.egress.length;
    for (const url of ['http://localhost:1/a', 'http://127.0.0.1:1/a', 'https://mcp.higgsfield.ai/mcp', `${f.origin}/heygen/mcp`, `${f.origin}/higgsfield/mcp#fragment`, `${f.origin.replace('http://', 'http://user:pass@')}/higgsfield/mcp`]) await expect(f.runtime.fetch(d, url)).rejects.toThrow();
    await expect(f.mcp.call(d, t, 'create_video_agent', {})).rejects.toThrow();
    expect(f.state.egress).toHaveLength(before);
    await expect(f.modules.registry.boundedSubscriptionResponse(new Response(null, {status: 303, headers: {location: 'https://foreign.invalid'}}))).rejects.toThrow();
    await expect(f.modules.registry.boundedSubscriptionResponse(new Response('x'.repeat(1024 * 1024 + 1)))).rejects.toThrow();
  }));

  test('production defaults remain disabled with no reviewed schema or private-network bypass', () => withProvider(async f => {
    const runtime = new f.modules.registry.VideoSubscriptionRuntime();
    for (const provider of ['higgsfield', 'heygen']) {
      const d = runtime.definition(provider);
      expect(d.enabled).toBe(false); expect(d.schemaDigests).toEqual([]);
      await expect(runtime.validateUrl(d, `${f.origin}/${provider}/mcp`)).rejects.toThrow();
    }
    expect(codeOf({getResponse: () => ({code: 'VIDEO_EXAMPLE'})})).toBe('VIDEO_EXAMPLE');
  }));
});
