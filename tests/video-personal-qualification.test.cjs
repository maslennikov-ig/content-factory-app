const { createProviderFixture, codeOf } = require('./helpers/video-subscription-provider-fixture.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const lib = 'libraries/nestjs-libraries/src/';
const { AuthService } = loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
const previousSecret = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'personal-qualification-test-only'; });
afterAll(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });

/** Actual SDK/HTTP and scope/token services; only the provider and database reads are synthetic. */
async function withFixture(run, provider = 'heygen') {
  const f = await createProviderFixture({now: '2026-02-01T00:00:00Z'});
  try {
    const definition = f.runtime.definition.bind(f.runtime);
    f.runtime.definition = name => ({...definition(name), connectEnabled: true, enabled: false, identityEndpoint: undefined, schemaDigests: []});
    const def = f.runtime.definition(provider), tokens = f.issueTokens(provider);
    const row = {id: 'connection', ownerId: 'actor', provider, issuer: def.issuer, resource: def.resource,
      state: 'discovery_required', walletDigest: 'unverified:synthetic-not-a-wallet', generation: 3, tokenVersion: 2,
      encryptedTokens: AuthService.fixedEncryption(JSON.stringify(tokens)), expiresAt: new Date('2026-02-01T01:00:00Z')};
    const flags = {role: 'ADMIN', member: true, grant: true, policy: true};
    const db = {
      userOrganization: {findFirst: async ({where}) => flags.member && ['actor', 'foreign'].includes(where.userId) && where.organizationId === 'org'
        ? {role: flags.role, user: {activated: true}} : null},
      videoSubscriptionConnection: {findFirst: async ({where}) => where.id === row.id && where.ownerId === row.ownerId ? {...row} : null,
        updateMany: jest.fn(() => {throw new Error('Qualification must not mutate credentials or connection');})},
      videoSubscriptionGrant: {findUnique: async ({where}) => flags.grant && where.connectionId_organizationId.organizationId === 'org' ? {enabled: true} : null},
      videoSubscriptionWorkspacePolicy: {findUnique: async () => ({enabled: flags.policy})},
    };
    const {VideoSubscriptionRepository} = loadTypeScriptModule(lib + 'database/prisma/video-subscription/video-subscription.repository.ts', f.modules.mocks);
    const repository = new VideoSubscriptionRepository(db);
    const connections = new f.modules.connection.VideoConnectionService(repository, f.runtime, f.oauth);
    const {VideoAccessService} = f.modules.register('video-access.service', []);
    const access = new VideoAccessService(repository, {}, {}, connections, {mcp: f.mcp, heygen: f.heygen}, {});
    return await run({...f, access, connections, row, flags, db, tokens, VideoAccessService});
  } finally {await f.close();}
}
const rejects = async (promise, code) => {
  let error; try {await promise;} catch (e) {error = e;}
  expect(codeOf(error)).toBe(code);
};

test.each(['heygen', 'higgsfield'])('%s operator export retains full unfamiliar raw schemas without qualifying or executing a tool', provider => withFixture(async f => {
  f.state.tools[provider].push({name: 'unfamiliar_read_or_write_tool', inputSchema: {type: 'object', properties: {example: {type: 'string', description: 'UNTRUSTED provider schema'}}},
    outputSchema: {type: 'object', properties: {value: {type: 'number'}}}});
  const before = {...f.row};
  const result = await f.access.personalQualification('org', 'actor', f.row.id);
  expect(result).toMatchObject({version: 1, purpose: 'schema_qualification', connectionId: f.row.id, provider,
    resource: f.runtime.definition(provider).resource, accountGeneration: 3, walletVerified: false,
    capturedAt: '2026-02-01T00:00:00.000Z', schema: {reviewed: false, complete: true, truncated: false,
      provenance: 'authenticated_mcp_tools_list', untrusted: true}});
  const canonical = structuredClone(f.state.tools[provider]).sort((a, b) => a.name.localeCompare(b.name));
  expect(result.schema.inventory).toEqual(canonical);
  expect(result.schema.digest).toBe(f.modules.registry.subscriptionHash(canonical));
  expect(JSON.stringify(result)).not.toContain(f.tokens.access_token);
  expect(JSON.stringify(result)).not.toContain(f.tokens.refresh_token);
  expect(result).not.toHaveProperty('walletDigest'); expect(result).not.toHaveProperty('encryptedTokens');
  expect(f.row).toEqual(before); expect(f.db.videoSubscriptionConnection.updateMany).not.toHaveBeenCalled();
  expect(f.state.rpc.some(r => r.method === 'tools/list')).toBe(true);
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
  expect(f.state.identities).toHaveLength(0); expect(f.state.refreshes).toHaveLength(0);
  expect(f.state.quotes).toHaveLength(0); expect(f.state.submits).toHaveLength(0);
  await rejects(f.connections.token('org', 'actor', f.row.id), 'VIDEO_REAUTH_REQUIRED');
}, provider));

test.each(['EDITOR', 'USER'])('non-operator role %s cannot export schemas or send an RPC', role => withFixture(async f => {
  f.flags.role = role;
  await rejects(f.access.personalQualification('org', 'actor', f.row.id), 'VIDEO_ACCESS_DENIED');
  expect(f.state.egress).toHaveLength(0);
}));

test.each(['actor', 'workspace', 'grant', 'revoked', 'expired', 'member', 'impersonated'])('qualification preserves the existing %s refusal before any provider request', boundary => withFixture(async f => {
  let org = 'org', actor = 'actor';
  if (boundary === 'actor') actor = 'foreign';
  if (boundary === 'workspace') org = 'foreign';
  if (boundary === 'grant') f.flags.grant = false;
  if (boundary === 'revoked') f.row.state = 'disconnected';
  if (boundary === 'expired') f.row.expiresAt = new Date('2026-01-01T00:00:00Z');
  if (boundary === 'member') f.flags.member = false;
  const call = () => f.access.personalQualification(org, actor, f.row.id);
  const result = boundary === 'impersonated' ? f.modules.authenticatedSession.withAuthenticatedSession('foreign', 'synthetic-session', call) : call();
  await rejects(result, ['workspace', 'member', 'impersonated'].includes(boundary) ? 'VIDEO_ACCESS_DENIED' : 'VIDEO_REAUTH_REQUIRED');
  expect(f.state.egress).toHaveLength(0);
}));

test.each(['generation', 'tokenVersion'])('a changed %s during discovery cannot yield a stale export', field => withFixture(async f => {
  const fetch = f.runtime.fetch.bind(f.runtime);
  f.runtime.fetch = async (...args) => {
    const response = await fetch(...args);
    if (typeof args[2]?.body === 'string' && JSON.parse(args[2].body).method === 'tools/list') f.row[field]++;
    return response;
  };
  await rejects(f.access.personalQualification('org', 'actor', f.row.id), field === 'generation' ? 'VIDEO_CONNECTION_CHANGED' : 'VIDEO_REAUTH_REQUIRED');
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
}));

test('existing GET readiness and POST discover stay sanitized and do not promote provisional credentials', () => withFixture(async f => {
  const rawMarker = 'UNTRUSTED RAW SCHEMA MUST NOT ENTER CHAT';
  f.state.tools.heygen.push({name: 'unknown_tool', inputSchema: {type: 'object', description: rawMarker}});
  for (const method of ['personalReadiness', 'discoverPersonal']) {
    const result = await f.access[method]('org', 'actor', f.row.id);
    expect(result.schema).not.toHaveProperty('inventory'); expect(JSON.stringify(result)).not.toContain(rawMarker);
    expect(result.walletVerified).toBe(false); expect(result.operations.every(o => !o.ready)).toBe(true);
    expect(result.operations.every(o => o.blockers.includes('VIDEO_WALLET_IDENTITY_UNVERIFIED'))).toBe(true);
  }
  expect(f.row.state).toBe('discovery_required'); expect(f.state.identities).toHaveLength(0);
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
  expect(f.db.videoSubscriptionConnection.updateMany).not.toHaveBeenCalled();
}));

test('revocation during tools/list prevents exporting a stale snapshot', () => withFixture(async f => {
  const fetch = f.runtime.fetch.bind(f.runtime);
  f.runtime.fetch = async (...args) => {
    const response = await fetch(...args);
    if (typeof args[2]?.body === 'string' && JSON.parse(args[2].body).method === 'tools/list') f.flags.grant = false;
    return response;
  };
  await rejects(f.access.personalQualification('org', 'actor', f.row.id), 'VIDEO_REAUTH_REQUIRED');
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
}));

test('operator role loss between initialization and discovery fences the next RPC', () => withFixture(async f => {
  const fetch = f.runtime.fetch.bind(f.runtime);
  f.runtime.fetch = async (...args) => {
    const response = await fetch(...args);
    if (typeof args[2]?.body === 'string' && JSON.parse(args[2].body).method === 'initialize') f.flags.role = 'EDITOR';
    return response;
  };
  await rejects(f.access.personalQualification('org', 'actor', f.row.id), 'VIDEO_ACCESS_DENIED');
  expect(f.state.rpc.filter(r => r.method === 'tools/list')).toHaveLength(0);
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
}));

test('an expired connected token cannot trigger OAuth refresh from the operator export', () => withFixture(async f => {
  f.row.state = 'connected'; f.row.walletDigest = 'synthetic-verified-wallet'; f.row.expiresAt = new Date('2026-01-01T00:00:00Z');
  await rejects(f.access.personalQualification('org', 'actor', f.row.id), 'VIDEO_REAUTH_REQUIRED');
  expect(f.state.egress).toHaveLength(0); expect(f.state.refreshes).toHaveLength(0);
  expect(f.db.videoSubscriptionConnection.updateMany).not.toHaveBeenCalled();
}));

test('paginated inventory is refused without a partial export, cursor following or replay', () => withFixture(async f => {
  const fetch = f.runtime.fetch.bind(f.runtime);
  f.runtime.fetch = async (...args) => {
    const response = await fetch(...args);
    if (typeof args[2]?.body !== 'string' || JSON.parse(args[2].body).method !== 'tools/list') return response;
    const body = await response.json(); body.result.nextCursor = 'repeated-provider-cursor';
    return new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}});
  };
  await rejects(f.access.personalQualification('org', 'actor', f.row.id), 'VIDEO_SCHEMA_UNSUPPORTED');
  expect(f.state.rpc.filter(r => r.method === 'tools/list')).toHaveLength(1);
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
}));

test('inventories above the existing 200-tool limit are refused', () => withFixture(async f => {
  f.state.tools.heygen = Array.from({length: 201}, (_, i) => ({name: `unfamiliar_${i}`, inputSchema: {type: 'object'}}));
  await rejects(f.access.personalQualification('org', 'actor', f.row.id), 'VIDEO_SCHEMA_UNSUPPORTED');
  expect(f.state.rpc.filter(r => r.method === 'tools/list')).toHaveLength(1);
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
}));

test('qualification accepts a complete streamed schema above 1 MiB while ordinary discovery retains its old cap', () => withFixture(async f => {
  f.state.tools.heygen = [{name: 'oversized', inputSchema: {type: 'object', description: 'x'.repeat(1024 * 1024)}}];
  f.state.respondMcp = ({res, rpc, result}) => {
    if (rpc.method !== 'tools/list') return false;
    const body = JSON.stringify({jsonrpc: '2.0', id: rpc.id, result});
    res.writeHead(200, {'content-type': 'application/json'});
    for (let i = 0; i < body.length; i += 32 * 1024) res.write(body.slice(i, i + 32 * 1024));
    res.end(); return true;
  };
  const result = await f.access.personalQualification('org', 'actor', f.row.id);
  expect(result.schema.inventory).toEqual(f.state.tools.heygen); expect(result.schema.complete).toBe(true);
  expect(result.schema.digest).toBe(f.modules.registry.subscriptionHash(result.schema.inventory));
  await rejects(f.mcp.discover(f.runtime.definition('heygen'), f.tokens.access_token), 'VIDEO_RESPONSE_TOO_LARGE');
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
  expect(f.state.egress.filter(r => r.method === 'GET')).toHaveLength(1); // Ordinary SDK discovery only.
}));

test.each(['initialize', 'tools/list'])('qualification refuses >8 MiB with only safe %s phase details and no partial export', phase => withFixture(async f => {
  let closed; const canceled = new Promise(resolve => {closed = resolve;});
  f.state.respondMcp = ({res, rpc, result}) => {
    if (rpc.method !== phase) return false;
    res.on('close', closed);
    const body = JSON.stringify({jsonrpc: '2.0', id: rpc.id, result, untrusted: 'private-provider-text'.repeat(500_000)});
    res.writeHead(200, {'content-type': 'application/json'}); res.write(body); return true;
  };
  let error; try {await f.access.personalQualification('org', 'actor', f.row.id);} catch (e) {error = e;}
  expect(error.getResponse()).toMatchObject({code: 'VIDEO_RESPONSE_TOO_LARGE', qualification: {phase, maximumBytes: 8 * 1024 * 1024}});
  expect(error.getResponse().qualification.observedBytes).toBeGreaterThan(8 * 1024 * 1024);
  expect(JSON.stringify(error.getResponse())).not.toMatch(/private-provider-text|fixture_access|fixture_refresh/);
  await canceled;
  expect(f.state.rpc.filter(r => r.method === phase)).toHaveLength(1);
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
}));

test.each(['initialize', 'tools/list'])('qualification body timeout includes safe %s phase and cancels the real HTTP stream', phase => withFixture(async f => {
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  const deadline = jest.spyOn(AbortSignal, 'timeout').mockImplementation(ms => originalTimeout(ms === 20_000 ? 40 : ms));
  let closed; const canceled = new Promise(resolve => {closed = resolve;});
  f.state.respondMcp = ({res, rpc}) => {
    if (rpc.method !== phase) return false;
    res.on('close', closed); res.writeHead(200, {'content-type': 'application/json'}); res.write('{'); return true;
  };
  try {
    let error; try {await f.access.personalQualification('org', 'actor', f.row.id);} catch (e) {error = e;}
    expect(error.getResponse()).toEqual({code: 'VIDEO_RESPONSE_TIMEOUT', qualification: {phase, maximumBytes: 8 * 1024 * 1024, observedBytes: 1}});
    expect(deadline).toHaveBeenCalledWith(20_000);
    await canceled;
    expect(f.state.rpc.filter(r => r.method === phase)).toHaveLength(1);
    expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
  } finally {deadline.mockRestore();}
}));

test('qualification refuses schemas nested beyond its fixed depth bound before canonical hashing', () => withFixture(async f => {
  let nested = {type: 'string'}; for (let i = 0; i < 65; i++) nested = {items: nested};
  f.state.tools.heygen = [{name: 'too_deep', inputSchema: {type: 'object', properties: {nested}}}];
  await rejects(f.access.personalQualification('org', 'actor', f.row.id), 'VIDEO_SCHEMA_UNSUPPORTED');
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
}));

test('duplicate names cannot be labelled a complete qualification inventory', () => withFixture(async f => {
  f.state.tools.heygen.push(structuredClone(f.state.tools.heygen[0]));
  await rejects(f.access.personalQualification('org', 'actor', f.row.id), 'VIDEO_SCHEMA_UNSUPPORTED');
  expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
}));

test('Nest operator route uses the existing admin policy and never exposes a GET or anonymous download', () => withFixture(async f => {
  require('reflect-metadata');
  const {Test} = require('@nestjs/testing');
  const policies = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.ability.ts');
  const exceptions = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permission.exception.class.ts');
  const {VideoAccessController} = loadTypeScriptModule('apps/backend/src/api/routes/video-access.controller.ts', {
    '@contentfactory/nestjs-libraries/videos/video-access.service': {VideoAccessService: f.VideoAccessService},
    '@contentfactory/backend/services/auth/permissions/permissions.ability': policies,
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': exceptions,
  });
  expect(Reflect.getMetadata(policies.CHECK_POLICIES_KEY, VideoAccessController.prototype.qualification))
    .toEqual([[exceptions.AuthorizationActions.Create, exceptions.Sections.ADMIN]]);
  const context = await Test.createTestingModule({controllers: [VideoAccessController], providers: [{provide: f.VideoAccessService, useValue: f.access}]}).compile();
  const app = context.createNestApplication({logger: false});
  // Owned test session transport. Production auth middleware is unchanged and is not claimed here.
  app.use((req, res, next) => {
    if (req.headers.authorization !== 'Bearer local-test-session') return res.status(401).json({code: 'UNAUTHENTICATED'});
    req.org = {id: 'org'}; req.user = {id: req.headers['x-actor'] || 'actor'}; next();
  });
  await app.listen(0, '127.0.0.1');
  const request = (method, authenticated = true, actor = 'actor') => new Promise((resolve, reject) => {
    const req = require('node:http').request({host: '127.0.0.1', port: app.getHttpServer().address().port,
      path: `/media/video-v2/connections/${f.row.id}/qualification`, method,
      headers: {...(authenticated ? {authorization: 'Bearer local-test-session'} : {}), 'x-actor': actor}}, res => {
        let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: JSON.parse(body)}));
      });
    req.on('error', reject); req.end();
  });
  try {
    expect((await request('POST', false)).status).toBe(401);
    expect((await request('GET')).status).toBe(404);
    expect((await request('POST', true, 'foreign')).status).toBe(409);
    f.flags.role = 'EDITOR'; expect((await request('POST')).status).toBe(403); f.flags.role = 'ADMIN';
    expect(f.state.egress).toHaveLength(0);
    const result = await request('POST');
    expect(result.status).toBe(200);
    expect(result.headers).toMatchObject({'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff', 'content-disposition': 'attachment; filename="video-provider-schema.json"'});
    expect(result.headers['content-type']).toContain('application/json');
    expect(result.body.schema.complete).toBe(true); expect(result.body.walletVerified).toBe(false);
    expect(f.state.rpc.filter(r => r.method === 'tools/call')).toHaveLength(0);
  } finally {await app.close();}
}));
