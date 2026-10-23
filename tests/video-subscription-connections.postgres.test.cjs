const fixture = require('./helpers/video-subscription-domain.fixture.cjs');
const { randomUUID } = require('node:crypto');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { codeOf } = require('./helpers/video-subscription-provider-fixture.cjs');
const databaseUrl = process.env.CF_VIDEO_DATABASE_URL;
if (databaseUrl) fixture.assertDisposableDatabaseV1(databaseUrl);
const domain = databaseUrl ? describe : describe.skip;
const withFixture = async run => { const f = await fixture.create(databaseUrl); try { return await run(f); } finally { await f.close(); } };
const rejectsCode = async (promise, code) => { let error; try { await promise; } catch (e) { error = e; } expect(codeOf(error)).toBe(code); };

domain('personal subscriptions with actual Prisma and rotating loopback OAuth', () => {
  jest.setTimeout(30000);

  test('browser OAuth callbacks use the public backend base, preserving its path and normalizing its slash', () => withFixture(async f => {
    process.env.BACKEND_INTERNAL_URL = 'http://backend:3000';
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://content.example.invalid/api/';
    const start = await f.connections.start(f.org.id, f.user.id, 'higgsfield');
    const expected = 'https://content.example.invalid/api/media/video-connections/higgsfield/callback';
    expect(new URL(start.authorizationUrl).searchParams.get('redirect_uri')).toBe(expected);
    const attempt = await f.db.videoSubscriptionOAuthAttempt.findFirstOrThrow({where: {organizationId: f.org.id}});
    expect(attempt.redirectUri).toBe(expected);
    expect(f.provider.state.registrations[0].redirect_uris).toEqual([expected]);
  }));

  test('actual impersonation middleware retains the original principal and rejects personal wallet writes', () => withFixture(async f => {
    const ready = await f.readySubscription();
    const {AuthMiddleware} = loadTypeScriptModule('apps/backend/src/services/auth/auth.middleware.ts', {
      '@contentfactory/helpers/auth/auth.service': {AuthService: {verifySessionJWT: () => ({id: f.otherUser.id})}},
      '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': {OrganizationService: class {}},
      '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {UsersService: class {}},
      '@contentfactory/nestjs-libraries/chat/mastra.service': {MastraService: class {}},
      '@contentfactory/nestjs-libraries/services/exception.filter': {HttpForbiddenException: class extends Error {}},
      '@contentfactory/nestjs-libraries/user/authenticated.session': f.authenticatedSession,
    });
    const middleware = new AuthMiddleware({getUserOrg: async () => ({user: {...f.user}, organization: {...f.org, users: [{userId: f.user.id}]}})},
      {getUserById: async () => ({...f.otherUser, isSuperAdmin: true})});
    const request = {headers: {auth: 'synthetic-admin-session', impersonate: f.user.id}, cookies: {}};
    let operations, session;
    await middleware.use(request, {}, () => {
      session = f.authenticatedSession.authenticatedSession();
      operations = Promise.allSettled([
        f.connections.start(f.org.id, request.user.id, 'heygen'),
        f.connections.limits(f.org.id, request.user.id, ready.connectionId, '1', '2'),
        f.connections.token(f.org.id, request.user.id, ready.connectionId),
        f.access.launch(f.org.id, request.user.id, ready.launch),
      ]);
    });
    const results = await operations;
    expect(session?.actorId).toBe(f.otherUser.id);
    expect(results.map(result => result.status === 'rejected' ? codeOf(result.reason) : 'allowed')).toEqual(Array(4).fill('VIDEO_ACCESS_DENIED'));
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(0);
    expect(f.provider.state.submits).toHaveLength(0);
    expect(f.authenticatedSession.authenticatedSession()).toBeUndefined();
  }));

  test.each(['assets', 'preflight'])('%s stops new MCP requests after disconnect or member removal during an earlier request', operation => withFixture(async f => {
    const connection = await f.connect('heygen');
    const draft = await f.service.prepare(f.org.id, f.user.id, {pieceId: f.pieceId, settings: f.presenterSettings, intent: 'Проверить доступ'});
    const originalFetch = f.provider.runtime.fetch.bind(f.provider.runtime);
    let revoked = false, requestsAtRevocation;
    f.provider.runtime.fetch = async (def, url, init) => {
      const result = await originalFetch(def, url, init);
      const rpc = typeof init?.body === 'string' && String(url).endsWith('/mcp') ? JSON.parse(init.body) : null;
      if (!revoked && rpc?.method === (operation === 'assets' ? 'tools/list' : 'initialize')) {
        revoked = true;
        if (operation === 'assets') await f.connections.disconnect(f.org.id, f.user.id, connection.id);
        else await f.db.userOrganization.updateMany({where: {organizationId: f.org.id, userId: f.user.id}, data: {disabled: true}});
        requestsAtRevocation = f.provider.state.rpc.length;
      }
      return result;
    };
    const result = await Promise.allSettled([operation === 'assets'
      ? f.access.assets(f.org.id, f.user.id, connection.id)
      : f.access.preflight(f.org.id, f.user.id, {draftId: draft.id, version: draft.version, access: {kind: 'subscription', connectionId: connection.id}})]);
    expect(revoked).toBe(true);
    expect(result[0].status).toBe('rejected');
    expect(f.provider.state.rpc).toHaveLength(requestsAtRevocation);
    expect(f.provider.state.quotes).toHaveLength(0); expect(f.provider.state.submits).toHaveLength(0);
  }));

  test('one-use actor/workspace/session-bound callback survives concurrent replay with one exchange', () => withFixture(async f => {
    const ambient = f.authenticatedSession.withAuthenticatedSession;
    const start = await ambient(f.user.id, 'fixture-browser-session-A', () => f.connections.start(f.org.id, f.user.id, 'higgsfield'));
    const callback = await f.provider.authorize(start.authorizationUrl); const query = Object.fromEntries(callback.searchParams);
    await rejectsCode(ambient(f.user.id, 'fixture-browser-session-B', () => f.connections.callback(f.org.id, f.user.id, 'higgsfield', query)), 'VIDEO_OAUTH_ATTEMPT_INVALID');
    await rejectsCode(f.connections.callback(f.org.id, f.otherUser.id, 'higgsfield', query), 'VIDEO_OAUTH_ATTEMPT_INVALID');
    await rejectsCode(f.connections.callback(f.otherOrg.id, f.user.id, 'higgsfield', query), 'VIDEO_OAUTH_ATTEMPT_INVALID');
    const outcomes = await Promise.allSettled([0, 1].map(() => ambient(f.user.id, 'fixture-browser-session-A', () => f.connections.callback(f.org.id, f.user.id, 'higgsfield', query))));
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x => x.status === 'rejected').map(x => codeOf(x.reason))).toEqual(['VIDEO_OAUTH_ATTEMPT_INVALID']);
    expect(f.provider.state.exchanges).toHaveLength(1);
    const attempt = await f.db.videoSubscriptionOAuthAttempt.findFirstOrThrow({where: {organizationId: f.org.id}});
    expect(attempt.consumedAt).not.toBeNull(); expect(attempt.encryptedVerifier).not.toContain('fixture-browser-session');
    expect(attempt.stateHash).not.toBe(query.state); expect(attempt.sessionDigest).toMatch(/^[a-f0-9]{64}$/);
  }));

  test('foreign issuer and expired attempts submit no token exchange', () => withFixture(async f => {
    const start = await f.connections.start(f.org.id, f.user.id, 'higgsfield');
    const query = Object.fromEntries((await f.provider.authorize(start.authorizationUrl)).searchParams);
    await rejectsCode(f.connections.callback(f.org.id, f.user.id, 'higgsfield', {...query, iss: 'https://foreign.invalid'}), 'VIDEO_OAUTH_ISSUER_INVALID');
    const next = await f.connections.start(f.org.id, f.user.id, 'higgsfield');
    const nextQuery = Object.fromEntries((await f.provider.authorize(next.authorizationUrl)).searchParams);
    f.provider.advance(600001);
    await rejectsCode(f.connections.callback(f.org.id, f.user.id, 'higgsfield', nextQuery), 'VIDEO_OAUTH_ATTEMPT_INVALID');
    expect(f.provider.state.exchanges).toHaveLength(0);
  }));

  test('new limits are unset, safe views have no tokens, and wallets deduplicate across explicit workspace grants', () => withFixture(async f => {
    const first = await f.connect('higgsfield', {limits: false});
    const safe = await f.connections.list(f.org.id, f.user.id);
    expect(safe.connections).toMatchObject([{id: first.id, perJob: null, perMonth: null, unit: 'higgsfield_credit', balance: null}]);
    expect(JSON.stringify(safe)).not.toMatch(/encrypted|walletDigest|access_token|refresh_token|issuer/);
    expect((await f.connections.list(f.org.id, f.otherUser.id)).connections).toEqual([]);
    const reconnected = await f.connect('higgsfield', {org: f.otherOrg.id, limits: false});
    expect(reconnected.id).toBe(first.id);
    expect(await f.db.videoSubscriptionConnection.count({where: {ownerId: f.user.id}})).toBe(1);
    expect(await f.db.videoSubscriptionGrant.count({where: {connectionId: first.id, enabled: true}})).toBe(2);
    await rejectsCode(f.connect('higgsfield', {actor: f.otherUser.id, limits: false}), 'VIDEO_WALLET_UNAVAILABLE');
    expect(f.provider.state.registrations).toHaveLength(1);
  }));

  test('readers, foreign actors, removed members and impersonated principals cannot use the owner wallet', () => withFixture(async f => {
    const connection = await f.connect();
    await rejectsCode(f.connections.token(f.org.id, f.otherUser.id, connection.id), 'VIDEO_REAUTH_REQUIRED');
    await rejectsCode(f.connections.limits(f.org.id, f.otherUser.id, connection.id, '1', '2'), 'VIDEO_REAUTH_REQUIRED');
    await rejectsCode(f.connections.workspacePolicy(f.org.id, f.otherUser.id, false), 'VIDEO_ACCESS_DENIED');
    await rejectsCode(f.authenticatedSession.withAuthenticatedSession(f.otherUser.id, 'admin-impersonation', () => f.connections.token(f.org.id, f.user.id, connection.id)), 'VIDEO_ACCESS_DENIED');
    await f.db.userOrganization.updateMany({where: {organizationId: f.org.id, userId: f.otherUser.id}, data: {role: 'USER'}});
    await rejectsCode(f.connections.start(f.org.id, f.otherUser.id, 'heygen'), 'VIDEO_ACCESS_DENIED');
    await f.db.userOrganization.updateMany({where: {organizationId: f.org.id, userId: f.user.id}, data: {disabled: true}});
    await rejectsCode(f.connections.token(f.org.id, f.user.id, connection.id), 'VIDEO_ACCESS_DENIED');
    expect(f.provider.state.submits).toHaveLength(0);
  }));

  test('concurrent token consumers rotate once and all observe the newest persisted token', () => withFixture(async f => {
    const connection = await f.connect(); f.provider.advance(280000);
    const gate = f.provider.gateRefresh();
    const first = f.connections.token(f.org.id, f.user.id, connection.id);
    await gate.entered;
    const second = f.connections.token(f.org.id, f.user.id, connection.id);
    gate.release();
    const tokens = await Promise.all([first, second]);
    expect(tokens[0].token).toBe(tokens[1].token); expect(f.provider.state.refreshes).toHaveLength(1);
    expect((await f.db.videoSubscriptionConnection.findUniqueOrThrow({where: {id: connection.id}})).tokenVersion).toBe(2);
    expect((await f.connections.token(f.org.id, f.user.id, connection.id)).token).toBe(tokens[0].token);
  }));

  test('disconnect fences an in-flight refresh and never resurrects credentials or grants', () => withFixture(async f => {
    const connection = await f.connect(); await f.connections.grant(f.otherOrg.id, f.user.id, connection.id); f.provider.advance(280000);
    const gate = f.provider.gateRefresh();
    const pending = f.connections.token(f.org.id, f.user.id, connection.id).then(value => ({value}), error => ({error}));
    await gate.entered;
    await f.connections.disconnect(f.org.id, f.user.id, connection.id); gate.release();
    expect(codeOf((await pending).error)).toBe('VIDEO_REAUTH_REQUIRED');
    const row = await f.db.videoSubscriptionConnection.findUniqueOrThrow({where: {id: connection.id}});
    expect(row.state).toBe('disconnected'); expect(row.encryptedTokens).toBeNull(); expect(row.refreshOwner).toBeNull();
    expect(await f.db.videoSubscriptionGrant.count({where: {connectionId: connection.id, enabled: true}})).toBe(0);
    expect(f.provider.state.revocations).toHaveLength(1);
  }));

  test('deactivated owner cannot resolve a retained audit connection', () => withFixture(async f => {
    const connection = await f.connect();
    await f.db.user.update({where: {id: f.user.id}, data: {activated: false}});
    await rejectsCode(f.connections.token(f.org.id, f.user.id, connection.id), 'VIDEO_ACCESS_DENIED');
    expect(await f.db.videoSubscriptionConnection.count({where: {id: connection.id}})).toBe(1);
    expect(f.provider.state.submits).toHaveLength(0);
  }));

  test('actual account deletion revokes personal secrets/grants while preserving job, wallet audit and owned Media', () => withFixture(async f => {
    const owner = await f.db.user.create({data: {id: randomUUID(), email: `subscription-delete-${randomUUID()}@example.invalid`, providerName: 'LOCAL', timezone: 0}});
    f.users.push(owner.id);
    await f.db.userOrganization.create({data: {organizationId: f.org.id, userId: owner.id, role: 'EDITOR'}});
    f.provider.state.subject = `synthetic-deletable-wallet-${owner.id}`;
    const connection = await f.connect('higgsfield', {actor: owner.id});
    const r = await f.readySubscription({actor: owner.id, connectionId: connection.id});
    const job = await f.access.launch(r.org, owner.id, r.launch);
    const completed = await f.runSubscriptionToTerminal(job.id, {actor: owner.id});
    await f.connections.start(r.org, owner.id, 'heygen'); // Pending verifier must also be destroyed.
    const { UsersRepository } = loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts', f.provider.modules.mocks);
    await new UsersRepository({model: f.db}, {model: f.db}).deleteAccount(owner.id);
    expect(await f.db.user.findUnique({where: {id: owner.id}})).toBeNull();
    const retained = await f.db.videoSubscriptionConnection.findUniqueOrThrow({where: {id: connection.id}});
    expect(retained.state).toBe('owner_deleted'); expect(retained.encryptedTokens).toBeNull();
    expect(retained.refreshOwner).toBeNull(); expect(retained.walletDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(await f.db.videoSubscriptionGrant.count({where: {connectionId: connection.id, enabled: true}})).toBe(0);
    const attempts = await f.db.videoSubscriptionOAuthAttempt.findMany({where: {actorId: owner.id}});
    expect(attempts.length).toBeGreaterThan(0); expect(attempts.every(row => row.encryptedVerifier === '' && row.consumedAt)).toBe(true);
    expect(await f.db.videoSubscriptionJob.count({where: {id: job.id, actorId: owner.id}})).toBe(1);
    expect(await f.db.media.count({where: {id: completed.result.id, organizationId: f.org.id}})).toBe(1);
    expect((await f.access.download(f.org.id, f.user.id, job.id)).bytes.equals(f.mp4)).toBe(true);
    await rejectsCode(f.connections.token(f.org.id, owner.id, connection.id), 'VIDEO_ACCESS_DENIED');
    expect(f.provider.state.submits).toHaveLength(1);
  }));
});
