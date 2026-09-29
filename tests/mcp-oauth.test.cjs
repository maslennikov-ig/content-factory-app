'use strict';

/**
 * The MCP authorization server (`content-factory-next-kcxz.26`, spec §4.10):
 * metadata shapes, dynamic registration, PKCE, the `resource` binding, refresh
 * rotation with replay detection, and the bearer check `/mcp` runs on every
 * request. The service runs for real over the in-memory repository; the
 * end-to-end walk with the MCP SDK client is `mcp.e2e.test.cjs`.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const {
  createMemoryMcpOAuthRepository,
  standardPeople,
} = require('./helpers/mcp-oauth-memory.cjs');

const RULES = 'libraries/nestjs-libraries/src/database/prisma/oauth/mcp-oauth.rules.ts';
const rules = loadTypeScriptModule(RULES);
const { McpOAuthService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/oauth/mcp-oauth.service.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.repository': {
      McpOAuthRepository: class McpOAuthRepository {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.rules': rules,
  }
);

const ENV = {
  NEXT_PUBLIC_BACKEND_URL: 'https://factory.example/api',
  FRONTEND_URL: 'https://factory.example',
};
const urls = rules.mcpUrls(ENV);
const VERIFIER = 'v'.repeat(20) + '-._~' + 'A1'.repeat(12);
const CHALLENGE = rules.pkceChallengeOf(VERIFIER);
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

const setup = () => {
  const memory = createMemoryMcpOAuthRepository(standardPeople());
  const service = new McpOAuthService(memory.repository);
  let now = new Date('2026-09-29T10:00:00.000Z');
  service.useClock(() => now);
  memory.repository.useClock(() => now);
  return {
    memory,
    service,
    advance: (ms) => void (now = new Date(now.getTime() + ms)),
  };
};

const connect = async (service, { userId = 'user-1', redirect = REDIRECT } = {}) => {
  const client = await service.register({
    client_name: 'Claude',
    redirect_uris: [REDIRECT, 'http://localhost:33418/callback'],
    token_endpoint_auth_method: 'none',
  });
  const checked = await service.checkAuthorization(
    {
      client_id: client.client_id,
      redirect_uri: redirect,
      response_type: 'code',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      resource: urls.resource,
      scope: 'mcp offline_access',
      state: 's1',
    },
    urls
  );
  const code = await service.approve(checked, { userId, organizationId: 'org-1' }, urls);
  return { client, checked, code, redirect };
};

const exchange = (service, { client, code, redirect }, extra = {}) =>
  service.token(
    {
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code,
      code_verifier: VERIFIER,
      redirect_uri: redirect,
      resource: urls.resource,
      ...extra,
    },
    urls
  );

const refusalOf = async (promise) => {
  try {
    await promise;
    return 'accepted';
  } catch (error) {
    return error.error ?? String(error);
  }
};

describe('MCP OAuth metadata (RFC 9728, RFC 8414)', () => {
  test('the URLs come from the envs the app has; nothing is guessed', () => {
    expect(urls).toEqual({
      issuer: 'https://factory.example/api',
      resource: 'https://factory.example/api/mcp',
      resourceMetadata: 'https://factory.example/api/.well-known/oauth-protected-resource/mcp',
      authorizationEndpoint: 'https://factory.example/oauth/authorize',
      tokenEndpoint: 'https://factory.example/api/oauth/mcp/token',
      registrationEndpoint: 'https://factory.example/api/oauth/mcp/register',
    });
    expect(rules.mcpUrls({ ...ENV, MCP_URL: 'https://mcp.example/' }).resource).toBe(
      'https://mcp.example/mcp'
    );
    expect(rules.mcpUrls({ FRONTEND_URL: 'https://factory.example' })).toBeNull();
    expect(rules.mcpUrls({ NEXT_PUBLIC_BACKEND_URL: 'https://factory.example/api' })).toBeNull();
  });

  test('protected-resource metadata names the exact MCP URL and this issuer', () => {
    expect(rules.protectedResourceMetadata(urls)).toEqual({
      resource: 'https://factory.example/api/mcp',
      authorization_servers: ['https://factory.example/api'],
      scopes_supported: ['mcp', 'offline_access'],
      bearer_methods_supported: ['header'],
      resource_name: 'Content Factory',
    });
  });

  test('authorization-server metadata: public clients, PKCE S256, code + refresh, iss', () => {
    expect(rules.authorizationServerMetadata(urls)).toEqual({
      issuer: 'https://factory.example/api',
      authorization_endpoint: 'https://factory.example/oauth/authorize',
      token_endpoint: 'https://factory.example/api/oauth/mcp/token',
      registration_endpoint: 'https://factory.example/api/oauth/mcp/register',
      scopes_supported: ['mcp', 'offline_access'],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    });
  });

  test('the 401 challenge points at the metadata', () => {
    expect(rules.bearerChallenge(urls)).toBe(
      'Bearer resource_metadata="https://factory.example/api/.well-known/oauth-protected-resource/mcp", scope="mcp"'
    );
    expect(rules.bearerChallenge(urls, 'invalid_token')).toMatch(/^Bearer error="invalid_token", resource_metadata=/);
  });
});

describe('dynamic client registration (RFC 7591)', () => {
  test('a public client with https or loopback redirects is registered', async () => {
    const { service } = setup();
    const client = await service.register({
      client_name: '  Claude\n  ',
      redirect_uris: [REDIRECT, 'http://127.0.0.1:5555/callback', 'http://localhost/cb'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
    expect(client).toMatchObject({
      client_name: 'Claude',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: [REDIRECT, 'http://127.0.0.1:5555/callback', 'http://localhost/cb'],
    });
    expect(client.client_id).toMatch(/^mcp_[A-Za-z0-9_-]{24}$/);
    expect(client).not.toHaveProperty('client_secret');
  });

  test.each([
    ['no redirects', { redirect_uris: [] }, 'invalid_redirect_uri'],
    ['a string', { redirect_uris: REDIRECT }, 'invalid_redirect_uri'],
    ['plain http off loopback', { redirect_uris: ['http://evil.example/cb'] }, 'invalid_redirect_uri'],
    ['a fragment', { redirect_uris: ['https://claude.ai/cb#x'] }, 'invalid_redirect_uri'],
    ['credentials', { redirect_uris: ['https://a:b@claude.ai/cb'] }, 'invalid_redirect_uri'],
    ['another scheme', { redirect_uris: ['javascript:alert(1)'] }, 'invalid_redirect_uri'],
    ['six redirects', { redirect_uris: Array.from({ length: 6 }, (_, i) => `https://a.example/${i}`) }, 'invalid_redirect_uri'],
    ['a redirect over 512 characters', { redirect_uris: [`https://a.example/${'x'.repeat(500)}`] }, 'invalid_redirect_uri'],
    ['metadata over 4 KB', { redirect_uris: [REDIRECT], logo_uri: `https://a.example/${'x'.repeat(4096)}` }, 'invalid_client_metadata'],
    ['a confidential client', { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_post' }, 'invalid_client_metadata'],
    ['client_credentials', { redirect_uris: [REDIRECT], grant_types: ['client_credentials'] }, 'invalid_client_metadata'],
    ['an implicit response', { redirect_uris: [REDIRECT], response_types: ['token'] }, 'invalid_client_metadata'],
  ])('refused: %s', async (_name, body, error) => {
    const { service, memory } = setup();
    expect(await refusalOf(service.register(body))).toBe(error);
    expect(memory.clients).toEqual([]);
  });

  test('a registration sweeps clients left without a grant, after 24 h (F3, R1; walk review F3)', async () => {
    const { service, memory, advance } = setup();
    const idle = await service.register({ redirect_uris: [REDIRECT] });
    const pending = await connect(service); // a consent, code never exchanged
    const disconnected = await connect(service);
    await exchange(service, disconnected);
    await service.revokeConnection('user-1', memory.grants[1].id);
    advance(24 * 60 * 60 * 1000 + 1);
    await service.register({ redirect_uris: [REDIRECT] });
    const ids = memory.clients.map((client) => client.clientId);
    expect(ids).not.toContain(idle.client_id);
    // A consent never exchanged is swept after 24 h, and its client with it.
    expect(ids).not.toContain(pending.client.client_id);
    expect(memory.grants).toHaveLength(1); // only the disconnected one is left
    // A disconnect is kept for 30 days: the client stays.
    expect(ids).toContain(disconnected.client.client_id);
    // The disconnected assistant reconnects with the client_id it kept.
    const again = await service.checkAuthorization(
      {
        client_id: disconnected.client.client_id,
        redirect_uri: REDIRECT,
        response_type: 'code',
        code_challenge: CHALLENGE,
        code_challenge_method: 'S256',
      },
      urls
    );
    expect(again.client.clientId).toBe(disconnected.client.client_id);
  });

  test('a revoked grant goes 30 days after it was revoked, then its client (walk review F3)', async () => {
    const { service, memory, advance } = setup();
    const live = await connect(service);
    await exchange(service, live);
    const disconnected = await connect(service);
    await exchange(service, disconnected);
    const revoked = memory.grants[1];
    await service.revokeConnection('user-1', revoked.id);
    advance(30 * 24 * 60 * 60 * 1000 - 60_000);
    await service.register({ redirect_uris: [REDIRECT] });
    expect(memory.grants.map((grant) => grant.id)).toContain(revoked.id);
    advance(2 * 60_000);
    await service.register({ redirect_uris: [REDIRECT] });
    expect(memory.grants.map((grant) => grant.id)).not.toContain(revoked.id);
    const ids = memory.clients.map((client) => client.clientId);
    expect(ids).not.toContain(disconnected.client.client_id);
    // The live connection's refresh (30 days, not rotated here) expired at the
    // same time; it is kept for another 30 days after that.
    expect(ids).toContain(live.client.client_id);
  });

  test('the sweep comment says what goes (walk review F3)', () => {
    const rules = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'libraries/nestjs-libraries/src/database/prisma/oauth/mcp-oauth.rules.ts'),
      'utf8'
    );
    expect(rules).not.toContain('a grant never exchanged or revoked, go after this');
    expect(rules).toContain('MCP_DEAD_GRANT_TTL_MS');
  });

  test('a client swept between the check and the decision is a clear refusal, not a 500 (R1)', async () => {
    const { service, memory } = setup();
    const client = await service.register({ redirect_uris: [REDIRECT] });
    const checked = await service.checkAuthorization(
      { client_id: client.client_id, redirect_uri: REDIRECT, response_type: 'code', code_challenge: CHALLENGE, code_challenge_method: 'S256' },
      urls
    );
    memory.clients.length = 0;
    expect(await refusalOf(service.approve(checked, { userId: 'user-1', organizationId: 'org-1' }, urls))).toBe(
      'invalid_client'
    );
  });

  test('a loopback redirect matches with any port; https only exactly', () => {
    const registered = ['http://localhost:33418/callback', REDIRECT];
    expect(rules.redirectMatches(registered, 'http://localhost:61234/callback')).toBe(true);
    expect(rules.redirectMatches(registered, 'http://localhost:61234/other')).toBe(false);
    expect(rules.redirectMatches(registered, 'http://127.0.0.1:61234/callback')).toBe(false);
    expect(rules.redirectMatches(registered, REDIRECT)).toBe(true);
    expect(rules.redirectMatches(registered, `${REDIRECT}/x`)).toBe(false);
    expect(rules.redirectMatches(registered, 'https://claude.ai:8443/api/mcp/auth_callback')).toBe(false);
  });
});

describe('authorization request', () => {
  test('an unknown client or an unregistered redirect is refused before anything goes back', async () => {
    const { service } = setup();
    const { client } = await connect(service);
    const base = {
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      response_type: 'code',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
    };
    expect(await refusalOf(service.checkAuthorization({ ...base, client_id: 'mcp_nobody' }, urls))).toBe('invalid_client');
    // A third-party app's id is not an MCP client.
    expect(await refusalOf(service.checkAuthorization({ ...base, client_id: 'pca_x' }, urls))).toBe('invalid_client');
    expect(
      await refusalOf(service.checkAuthorization({ ...base, redirect_uri: 'https://evil.example/cb' }, urls))
    ).toBe('invalid_request');
  });

  test('without PKCE S256, or for another resource, the refusal goes back on the redirect', async () => {
    const { service } = setup();
    const { client } = await connect(service);
    const base = {
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      response_type: 'code',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      state: 'st',
    };
    for (const [change, error] of [
      [{ code_challenge_method: 'plain' }, 'invalid_request'],
      [{ code_challenge: undefined }, 'invalid_request'],
      [{ code_challenge: 'short' }, 'invalid_request'],
      [{ resource: 'https://other.example/mcp' }, 'invalid_target'],
      [{ response_type: 'token' }, 'unsupported_response_type'],
    ]) {
      const checked = await service.checkAuthorization({ ...base, ...change }, urls);
      expect(checked.refused).toMatchObject({ redirectUri: REDIRECT, state: 'st', error });
    }
  });

  test('the code goes back with state and iss (RFC 9207)', async () => {
    const { service } = setup();
    const { code } = await connect(service);
    const redirect = new URL(service.redirectWith(REDIRECT, { code, state: 's1' }, urls));
    expect(redirect.origin + redirect.pathname).toBe(REDIRECT);
    expect(Object.fromEntries(redirect.searchParams)).toEqual({
      code,
      state: 's1',
      iss: 'https://factory.example/api',
    });
  });
});

describe('token endpoint', () => {
  test('code + right verifier: a 1-hour access token and a refresh token, hashes stored only', async () => {
    const { service, memory } = setup();
    const flow = await connect(service);
    const tokens = await exchange(service, flow);
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'mcp offline_access' });
    expect(tokens.access_token).toMatch(/^mcpa_/);
    expect(tokens.refresh_token).toMatch(/^mcpr_/);
    const stored = JSON.stringify(memory.grants);
    for (const secret of [tokens.access_token, tokens.refresh_token, flow.code]) {
      expect(stored).not.toContain(secret);
    }
    expect(memory.grants[0].accessTokenHash).toBe(rules.hashSecret(tokens.access_token));
    expect(memory.grants[0].accessExpiresAt.toISOString()).toBe('2026-09-29T11:00:00.000Z');
    expect(memory.grants[0].refreshExpiresAt.toISOString()).toBe('2026-10-29T10:00:00.000Z');
  });

  test('a wrong verifier, a used or expired code, another client or redirect: invalid_grant', async () => {
    const { service, advance } = setup();
    const wrong = await connect(service);
    expect(await refusalOf(exchange(service, wrong, { code_verifier: 'x'.repeat(43) }))).toBe('invalid_grant');
    expect(await refusalOf(exchange(service, wrong, { code_verifier: undefined }))).toBe('invalid_grant');

    const used = await connect(service);
    const issued = await exchange(service, used);
    expect(await refusalOf(exchange(service, used))).toBe('invalid_grant');
    // A code exchanged twice leaked: what it produced is revoked (review W5-26 F6).
    expect((await service.authenticate(issued.access_token, urls)).identity).toBeUndefined();
    expect(
      await refusalOf(
        service.token({ grant_type: 'refresh_token', client_id: used.client.client_id, refresh_token: issued.refresh_token }, urls)
      )
    ).toBe('invalid_grant');

    const redirect = await connect(service);
    expect(
      await refusalOf(exchange(service, redirect, { redirect_uri: 'http://localhost:33418/callback' }))
    ).toBe('invalid_grant');

    const other = await connect(service);
    const stranger = await service.register({ redirect_uris: [REDIRECT] });
    expect(await refusalOf(exchange(service, other, { client_id: stranger.client_id }))).toBe('invalid_grant');
    expect(await refusalOf(exchange(service, other, { client_id: 'mcp_nobody' }))).toBe('invalid_client');

    const late = await connect(service);
    advance(10 * 60 * 1000 + 1);
    expect(await refusalOf(exchange(service, late))).toBe('invalid_grant');
  });

  test('only a live, verified replay revokes; the loser of two parallel exchanges revokes too (R3)', async () => {
    const { service, advance, memory } = setup();
    const leaked = await connect(service);
    const issued = await exchange(service, leaked);
    // The code and client id alone (browser history), without the verifier: refused, nothing revoked.
    expect(await refusalOf(exchange(service, leaked, { code_verifier: 'x'.repeat(43) }))).toBe('invalid_grant');
    expect((await service.authenticate(issued.access_token, urls)).identity).toBeDefined();

    const late = await connect(service);
    const lateTokens = await exchange(service, late);
    advance(10 * 60 * 1000 + 1);
    // After the code's ten minutes, a replay with the verifier revokes nothing either.
    expect(await refusalOf(exchange(service, late))).toBe('invalid_grant');
    expect((await service.authenticate(lateTokens.access_token, urls)).identity).toBeDefined();

    const parallel = await connect(service);
    const outcomes = await Promise.all([
      refusalOf(exchange(service, parallel)),
      refusalOf(exchange(service, parallel)),
    ]);
    // Never two live exchanges of one code: the loser revokes the grant.
    expect(outcomes).toContain('invalid_grant');
    expect(memory.grants.find((grant) => grant.clientId === memory.clients.at(-1).id).revokedAt).toBeInstanceOf(Date);
  });

  test('the resource is bound: another one at the token step is invalid_target', async () => {
    const { service } = setup();
    const flow = await connect(service);
    expect(await refusalOf(exchange(service, flow, { resource: 'https://evil.example/mcp' }))).toBe('invalid_target');
    // Naming none takes the bound one.
    const unnamed = await connect(service);
    expect(await refusalOf(exchange(service, unnamed, { resource: undefined }))).toBe('accepted');
  });

  test('a loopback client may come back on another port', async () => {
    const { service } = setup();
    const flow = await connect(service, { redirect: 'http://localhost:40001/callback' });
    expect(await refusalOf(exchange(service, flow))).toBe('accepted');
  });

  test('refresh rotates; the old refresh token then revokes the whole connection', async () => {
    const { service, memory } = setup();
    const flow = await connect(service);
    const first = await exchange(service, flow);
    const refresh = (token) =>
      service.token({ grant_type: 'refresh_token', client_id: flow.client.client_id, refresh_token: token }, urls);

    const second = await refresh(first.refresh_token);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(second.access_token).not.toBe(first.access_token);
    expect((await service.authenticate(first.access_token, urls)).refused).toBe('unknown');
    expect((await service.authenticate(second.access_token, urls)).identity).toBeDefined();

    // Replay of the rotated-away token: refused, and the live pair dies too.
    expect(await refusalOf(refresh(first.refresh_token))).toBe('invalid_grant');
    expect(memory.grants[0].revokedAt).toBeInstanceOf(Date);
    expect(await refusalOf(refresh(second.refresh_token))).toBe('invalid_grant');
    expect((await service.authenticate(second.access_token, urls)).refused).toBe('unknown');
  });

  test('a refresh after 30 days, by another client, or for a person who lost access is refused', async () => {
    const { service, memory, advance } = setup();
    const flow = await connect(service);
    const tokens = await exchange(service, flow);
    const refresh = (clientId = flow.client.client_id) =>
      service.token({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token }, urls);
    const stranger = await service.register({ redirect_uris: [REDIRECT] });
    expect(await refusalOf(refresh(stranger.client_id))).toBe('invalid_grant');

    memory.memberships['user-1:org-1'].disabled = true;
    expect(await refusalOf(refresh())).toBe('invalid_grant');
    memory.memberships['user-1:org-1'].disabled = false;

    advance(30 * 24 * 60 * 60 * 1000 + 1);
    expect(await refusalOf(refresh())).toBe('invalid_grant');
  });

  test('other grants are unsupported', async () => {
    const { service } = setup();
    for (const grant of ['client_credentials', 'password', undefined]) {
      expect(await refusalOf(service.token({ grant_type: grant }, urls))).toBe('unsupported_grant_type');
    }
  });
});

describe('the bearer check behind /mcp', () => {
  const issued = async (options) => {
    const context = setup();
    const flow = await connect(context.service, options);
    const tokens = await exchange(context.service, flow);
    return { ...context, tokens };
  };

  test('a live token for this resource: the person, the workspace and the role now', async () => {
    const { service, tokens } = await issued();
    const { identity } = await service.authenticate(tokens.access_token, urls);
    expect(identity).toEqual({
      grantId: 'grant-2',
      clientId: expect.stringMatching(/^mcp_/),
      scopes: ['mcp', 'offline_access'],
      expiresAt: Date.parse('2026-09-29T11:00:00.000Z') / 1000,
      organizationId: 'org-1',
      organizationCreatedAt: '2026-01-01T00:00:00.000Z',
      userId: 'user-1',
      role: 'EDITOR',
      userLanguage: 'ru',
      userTimezone: 180,
    });
  });

  test('the organization API key and a third-party pos_ token never open MCP (X3)', async () => {
    const { service } = await issued();
    for (const credential of ['0f3c9a1b2c3d4e5f', 'pos_abcdefghijklmnop', 'mcpr_refresh-is-not-access']) {
      const result = await service.authenticate(credential, urls);
      expect(result.identity).toBeUndefined();
    }
    expect((await service.authenticate('0f3c9a1b2c3d4e5f', urls)).refused).toBe('not_mcp_token');
    expect((await service.authenticate(undefined, urls)).refused).toBe('missing');
  });

  test('expired, revoked or for another audience: refused', async () => {
    const { service, tokens, memory, advance } = await issued();
    const other = rules.mcpUrls({ ...ENV, MCP_URL: 'https://elsewhere.example' });
    expect((await service.authenticate(tokens.access_token, other)).refused).toBe('wrong_audience');

    advance(60 * 60 * 1000);
    expect((await service.authenticate(tokens.access_token, urls)).refused).toBe('expired');

    const again = await issued();
    await again.service.revokeConnection('user-1', again.memory.grants[0].id);
    expect((await again.service.authenticate(again.tokens.access_token, urls)).refused).toBe('unknown');
    expect(memory.grants).toHaveLength(1);
  });

  test('a demoted member is re-read on the next request; a disabled or blocked one is refused', async () => {
    const { service, tokens, memory } = await issued();
    memory.memberships['user-1:org-1'].role = 'USER';
    expect((await service.authenticate(tokens.access_token, urls)).identity.role).toBe('USER');

    memory.memberships['user-1:org-1'].disabled = true;
    expect((await service.authenticate(tokens.access_token, urls)).refused).toBe('not_member');
    memory.memberships['user-1:org-1'].disabled = false;

    delete memory.memberships['user-1:org-1'];
    expect((await service.authenticate(tokens.access_token, urls)).refused).toBe('not_member');
    memory.memberships['user-1:org-1'] = { role: 'EDITOR', disabled: false };

    memory.users['user-1'].blockedAt = new Date();
    expect((await service.authenticate(tokens.access_token, urls)).refused).toBe('inactive_user');
    memory.users['user-1'].blockedAt = null;
    memory.users['user-1'].activated = false;
    expect((await service.authenticate(tokens.access_token, urls)).refused).toBe('inactive_user');
  });
});

describe('approved apps: the person sees and revokes their MCP connections', () => {
  test('listed in the approved-apps shape, revoked only by their owner', async () => {
    const { service, memory } = setup();
    const flow = await connect(service);
    await exchange(service, flow);
    const [row] = await service.approvedConnections('user-1');
    expect(row).toEqual({
      id: `mcp:${memory.grants[0].id}`,
      kind: 'mcp',
      createdAt: memory.grants[0].createdAt,
      oauthApp: { name: 'Claude', description: 'MCP · Stand kcxz', picture: null },
    });
    expect(await service.approvedConnections('user-2')).toEqual([]);
    expect(await service.revokeConnection('user-2', memory.grants[0].id)).toBe(false);
    expect(await service.revokeConnection('user-1', memory.grants[0].id)).toBe(true);
    expect(await service.approvedConnections('user-1')).toEqual([]);
  });
});
