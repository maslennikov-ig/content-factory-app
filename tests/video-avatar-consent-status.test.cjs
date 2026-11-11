'use strict';
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const {loadSubscriptionModules, codeOf} = require('./helpers/video-subscription-provider-fixture.cjs');
const {loadRegistry, servicesFrom, executeTool, requestContextFor, IDENTITY, permissionsService} = require('./helpers/agent-capabilities.cjs');
const {AuthService} = load('libraries/helpers/src/auth/auth.service.ts');
const CONNECTION = '33333333-3333-4333-8333-333333333333';
const input = {connectionId: CONNECTION, avatarId: 'owned_look'};
const previousSecret = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'avatar-consent-test-only'; });
afterAll(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });

function fixture(status = {}) {
  const modules = loadSubscriptionModules();
  const flags = {member: true, role: 'EDITOR', grant: true, policy: true};
  const definition = provider => ({provider, issuer: `https://${provider}.invalid`, resource: `https://${provider}.invalid/mcp`,
    connectEnabled: true, enabled: false, ownedAssetReadProfile: 'heygen_private_catalog_v1'});
  const row = {id: CONNECTION, ownerId: 'actor', provider: 'heygen', issuer: definition('heygen').issuer, resource: definition('heygen').resource,
    state: 'discovery_required', walletDigest: 'unverified:fixture', generation: 3, tokenVersion: 2,
    encryptedTokens: AuthService.fixedEncryption(JSON.stringify({access_token: 'synthetic-private-token', refresh_token: 'synthetic-refresh-token'})),
    expiresAt: new Date('2030-01-01T01:00:00Z')};
  const forbidden = jest.fn(() => { throw new Error('Writes, refresh, API, quote and render are forbidden'); });
  const db = {userOrganization: {findFirst: async ({where}) => flags.member && where.organizationId === 'org' && ['actor', 'foreign'].includes(where.userId)
      ? {role: flags.role, user: {activated: true}} : null},
    videoSubscriptionConnection: {findFirst: async ({where}) => where.id === row.id && where.ownerId === row.ownerId ? {...row} : null, updateMany: forbidden},
    videoSubscriptionGrant: {findUnique: async ({where}) => flags.grant && where.connectionId_organizationId.organizationId === 'org' ? {enabled: true} : null},
    videoSubscriptionWorkspacePolicy: {findUnique: async () => ({enabled: flags.policy})}};
  const {VideoSubscriptionRepository} = load('libraries/nestjs-libraries/src/database/prisma/video-subscription/video-subscription.repository.ts', modules.mocks);
  const repository = new VideoSubscriptionRepository(db);
  const runtime = {definition, now: () => new Date('2030-01-01T00:00:00Z')};
  const connections = new modules.connection.VideoConnectionService(repository, runtime, {refresh: forbidden, metadata: forbidden});
  const result = {avatarId: input.avatarId, groupId: 'owned_group', name: 'Мой образ', avatarType: 'photo_avatar', groupName: 'Мой цифровой двойник',
    groupType: 'digital_twin', consentStatus: 'accepted', consentState: 'accepted', consentRequirement: 'required', readOnly: true, renderQualified: false, ...status};
  const heygen = {readOwnedAvatarGroup: jest.fn(async (_def, _token, _input, assertUsable) => {await assertUsable(); return result;}), prepare: forbidden, submit: forbidden};
  const {VideoAccessService} = modules.register('video-access.service', []);
  const access = new VideoAccessService(repository, {}, {preflight: forbidden, launch: forbidden}, connections, {heygen}, {});
  return {access, modules, flags, row, runtime, heygen, result, forbidden, VideoAccessService};
}

test.each([
  ['accepted', 'accepted', 'required', 'digital_twin'], ['pending', 'pending', 'required', 'digital_twin'],
  ['rejected', 'rejected', 'required', 'digital_twin'], [null, 'unknown', 'unknown', null],
  ['unknown', 'unknown', 'unknown', null], [null, 'not_applicable', 'not_required', 'photo'],
])('read preserves %s consent and group evidence without qualifying rendering', async (consentStatus, consentState, consentRequirement, groupType) => {
  const f = fixture({consentStatus, consentState, consentRequirement, groupType});
  const before = structuredClone(f.row);
  const result = await f.access.avatarConsentStatus('org', 'actor', input);
  expect(result).toEqual({...f.result, connectionId: CONNECTION, provider: 'heygen', accountGeneration: 3});
  expect(result).toMatchObject({readOnly: true, renderQualified: false});
  expect(f.heygen.readOwnedAvatarGroup).toHaveBeenCalledWith(f.runtime.definition('heygen'), 'synthetic-private-token', {avatarId: input.avatarId}, expect.any(Function));
  expect(f.row).toEqual(before); expect(f.forbidden).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toMatch(/synthetic-private-token|synthetic-refresh-token|walletDigest|encryptedTokens|https:/);
});

test.each(['actor', 'workspace', 'grant', 'member', 'role', 'revoked', 'expired', 'policy', 'provider', 'impersonated'])('read refuses %s before provider access', async boundary => {
  const f = fixture(); let org = 'org', actor = 'actor';
  if (boundary === 'actor') actor = 'foreign';
  if (boundary === 'workspace') org = 'foreign';
  if (boundary === 'grant') f.flags.grant = false;
  if (boundary === 'member') f.flags.member = false;
  if (boundary === 'role') f.flags.role = 'USER';
  if (boundary === 'revoked') f.row.state = 'disconnected';
  if (boundary === 'expired') f.row.expiresAt = new Date('2029-01-01T00:00:00Z');
  if (boundary === 'policy') f.flags.policy = false;
  if (boundary === 'provider') Object.assign(f.row, {provider: 'higgsfield', issuer: f.runtime.definition('higgsfield').issuer, resource: f.runtime.definition('higgsfield').resource});
  const call = () => f.access.avatarConsentStatus(org, actor, input);
  let error; try { await (boundary === 'impersonated' ? f.modules.authenticatedSession.withAuthenticatedSession('foreign', 'fixture-session', call) : call()); } catch (value) {error = value;}
  expect(codeOf(error)).toMatch(/^VIDEO_(ACCESS_DENIED|REAUTH_REQUIRED|CONNECTION_UNAVAILABLE|PROVIDER_INVALID)$/);
  expect(f.heygen.readOwnedAvatarGroup).not.toHaveBeenCalled(); expect(f.forbidden).not.toHaveBeenCalled();
});

test.each(['generation', 'tokenVersion', 'grant'])('read rechecks %s after the provider read', async field => {
  const f = fixture();
  f.heygen.readOwnedAvatarGroup.mockImplementationOnce(async () => {if (field === 'grant') f.flags.grant = false; else f.row[field]++; return f.result;});
  await expect(f.access.avatarConsentStatus('org', 'actor', input)).rejects.toMatchObject({response: {code: field === 'generation' ? 'VIDEO_CONNECTION_CHANGED' : 'VIDEO_REAUTH_REQUIRED'}});
  expect(f.forbidden).not.toHaveBeenCalled();
});

test('read accepts only scoped private ids and the reviewed private-read profile', async () => {
  const f = fixture(), token = jest.spyOn(f.access.connections, 'token');
  for (const value of [{...input, avatarId: '../foreign'}, {...input, connectionId: 'not-a-uuid'}, {...input, token: 'not-accepted'}])
    await expect(f.access.avatarConsentStatus('org', 'actor', value)).rejects.toMatchObject({response: {code: 'VIDEO_INVALID_INPUT'}});
  expect(token).not.toHaveBeenCalled();
  const definition = f.runtime.definition;
  f.runtime.definition = provider => ({...definition(provider), ownedAssetReadProfile: undefined});
  await expect(f.access.avatarConsentStatus('org', 'actor', input)).rejects.toMatchObject({response: {code: 'VIDEO_SCHEMA_UNSUPPORTED'}});
  expect(f.heygen.readOwnedAvatarGroup).not.toHaveBeenCalled(); expect(f.forbidden).not.toHaveBeenCalled();
});

test('GET consent route preserves authenticated actor and exact group without creating consent', async () => {
  require('reflect-metadata');
  const {Test} = require('@nestjs/testing'), f = fixture();
  const policies = load('apps/backend/src/services/auth/permissions/permissions.ability.ts');
  const exceptions = load('apps/backend/src/services/auth/permissions/permission.exception.class.ts');
  const {VideoAccessController} = load('apps/backend/src/api/routes/video-access.controller.ts', {
    '@contentfactory/nestjs-libraries/videos/video-access.service': {VideoAccessService: f.VideoAccessService},
    '@contentfactory/backend/services/auth/permissions/permissions.ability': policies,
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': exceptions,
  });
  expect(Reflect.getMetadata(policies.CHECK_POLICIES_KEY, VideoAccessController.prototype.avatarConsentStatus))
    .toEqual([[exceptions.AuthorizationActions.Create, exceptions.Sections.EDITOR]]);
  const context = await Test.createTestingModule({controllers: [VideoAccessController], providers: [{provide: f.VideoAccessService, useValue: f.access}]}).compile();
  const app = context.createNestApplication({logger: false});
  app.use((req, res, next) => {
    if (req.headers.authorization !== 'Bearer synthetic-session') return res.status(401).json({code: 'UNAUTHENTICATED'});
    req.org = {id: 'org'}; req.user = {id: req.headers['x-actor'] || 'actor'}; next();
  });
  await app.listen(0, '127.0.0.1');
  const request = (method = 'GET', actor = 'actor', authenticated = true) => new Promise((resolve, reject) => {
    const req = require('node:http').request({host: '127.0.0.1', port: app.getHttpServer().address().port,
      path: `/media/video-v2/connections/${CONNECTION}/avatars/${input.avatarId}/consent-status?groupId=owned_group`, method,
      headers: {...(authenticated ? {authorization: 'Bearer synthetic-session'} : {}), 'x-actor': actor}}, res => {
        let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: JSON.parse(body)}));
      });
    req.on('error', reject); req.end();
  });
  try {
    expect((await request('GET', 'actor', false)).status).toBe(401);
    expect((await request('POST')).status).toBe(404);
    expect((await request('GET', 'foreign')).status).toBe(409);
    expect(f.heygen.readOwnedAvatarGroup).not.toHaveBeenCalled();
    const result = await request();
    expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.body).toMatchObject({consentStatus: 'accepted', readOnly: true, renderQualified: false});
    expect(f.heygen.readOwnedAvatarGroup.mock.calls[0][2]).toEqual({avatarId: input.avatarId, groupId: 'owned_group'});
    expect(f.forbidden).not.toHaveBeenCalled();
  } finally {await app.close();}
});

test('native consent read uses the server actor, selected private ids, honest untrusted result and editor door', async () => {
  const registry = loadRegistry(), catalogue = registry.CAPABILITY_CATALOGUE;
  const capability = catalogue.find(entry => entry.id === 'video.avatar_consent_status');
  expect(capability.risk).toBe('read');
  const status = fixture({consentStatus: null, consentState: 'unknown', consentRequirement: 'unknown', groupType: null}).result;
  const service = {avatarConsentStatus: jest.fn(async () => status)};
  const tool = registry.buildCapabilityTool(capability, {entrance: 'chat', language: 'ru', services: servicesFrom({VideoAccessService: service})});
  const output = await executeTool(tool, input, {requestContext: requestContextFor(registry)});
  expect(service.avatarConsentStatus).toHaveBeenCalledWith(IDENTITY.organizationId, IDENTITY.userId, input);
  expect(output.output.summary.untrustedData.value).toEqual(status); expect(output.parts).toEqual([]);
  expect(capability.input.safeParse({...input, actorId: 'foreign', token: 'not-accepted', payer: 'api'}).success).toBe(false);
  for (const role of ['USER', 'EDITOR', 'ADMIN']) expect(registry.activeCapabilityToolNames(catalogue, role).includes('video_avatar_consent_status')).toBe(role !== 'USER');
  const tools = registry.buildMcpCapabilityTools(catalogue, {services: servicesFrom({VideoAccessService: service}), gate: new registry.DoorPolicyGate(permissionsService()), role: 'EDITOR', language: 'en'});
  service.avatarConsentStatus.mockClear();
  const denied = await executeTool(tools.video_avatar_consent_status, input, {requestContext: requestContextFor(registry, {...IDENTITY, role: 'USER'})});
  expect(denied.output).toMatchObject({ok: false, code: 'PERMISSION_DENIED'}); expect(service.avatarConsentStatus).not.toHaveBeenCalled();
});

test('conductor distinguishes group consent from look type and does not issue repeat consent or rendering claims', () => {
  const {conductorInstructions} = load('libraries/nestjs-libraries/src/chat/conductor/conductor.instructions.ts');
  const prompt = conductorInstructions({language: 'ru', now: new Date('2030-01-01T00:00:00Z'), role: 'EDITOR', snapshot: null});
  const rule = prompt.split('\n').find(line => line.includes('For personal HeyGen consent'));
  expect(rule).toContain('first read video.personal_assets'); expect(rule).toContain('video.avatar_consent_status');
  expect(rule).toContain('ask the person if several groups remain plausible');
  expect(rule).toContain('pending means awaiting confirmation or review, never accepted');
  expect(rule).toContain('photo_avatar look does not prove a photo-origin group');
  expect(rule).toContain('never suggest repeat consent for accepted or unknown');
  expect(rule).toContain('Only an explicit original authored request');
  expect(rule).toContain('video.avatar_consent_request');
  expect(rule).toContain('Never fabricate links, consent, render readiness or an API fallback');
  expect(prompt).toContain('Local authorization or guard failures are not a provider denial');
  expect(prompt).toContain('the request to HeyGen has not been made');
  expect(prompt).toContain('state=ready AND an actual returned heygen-consent card');
  expect(prompt).toContain('uncertain/reserved/expired/unknown, or no returned card');
  expect(prompt).toContain('Не удалось подтвердить, что ссылка создана');
  expect(prompt).toContain('Never claim that the link was formed or its card opened, show the opaque handle, or automatically repeat the provider request');
  expect(prompt).toContain('call video.avatar_consent_request with reissue:false even if earlier chat history said uncertain');
});
