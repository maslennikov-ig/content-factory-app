require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/';
const { thirdPartyHubV1 } = loadTypeScriptModule(base + '3rdparties/thirdparty-hub.v1.ts');
const { VIDEO_PROVIDERS_V1 } = loadTypeScriptModule(base + 'videos/video-settings.v1.ts');
const { videoHubReturnPathV1, videoIntegrationHubHrefV1 } = loadTypeScriptModule('apps/frontend/src/components/videos/video-integration-hub.v1.ts');
const catalog = [{identifier: 'heygen', title: 'HeyGen', description: 'Existing avatar integration'}, {identifier: 'reelfarm', title: 'ReelFarm', description: 'Existing integration'}];
const choices = () => ({workspaceEnabled: true, providers: VIDEO_PROVIDERS_V1.map(provider => ({provider, enabled: false, connectReady: true, generationReady: false, blockers: ['VIDEO_SCHEMA_UNSUPPORTED'], trial: provider === 'heygen'})), connections: []});

test.each(['api', 'personal', 'both'])('one logical HeyGen identity with %s connection data and retained other providers', kind => {
  const personal = choices();
  if (kind !== 'api') personal.connections.push({id: 'personal', provider: 'heygen', state: 'discovery_required', generation: 1, unit: 'heygen_credit', perJob: null, perMonth: null, walletVerified: false, workspaceGranted: true, balance: null});
  const saved = kind === 'personal' ? [] : [{id: 'api', name: 'Existing API account', identifier: 'heygen'}];
  const hub = thirdPartyHubV1(catalog, saved, personal, VIDEO_PROVIDERS_V1);
  expect(hub.providers.map(p => p.identifier).sort()).toEqual(['heygen', 'higgsfield', 'reelfarm']);
  expect(hub.providers.filter(p => p.identifier === 'heygen')).toHaveLength(1);
  expect(hub.providers.find(p => p.identifier === 'heygen')).toMatchObject({title: 'HeyGen', personal: true, api: {legacyAvailable: true, videoAvailable: true}});
  expect(hub.providers.find(p => p.identifier === 'reelfarm')).toMatchObject({personal: false, api: {legacyAvailable: true, videoAvailable: false}});
  expect(hub.providers.find(p => p.identifier === 'higgsfield')).toMatchObject({personal: true, api: {legacyAvailable: false, videoAvailable: true}});
});

test('inventory projection strips all credential, raw account and future secret fields', () => {
  const personal = choices(); personal.encryptedClient = 'SECRET'; personal.providers[0].apiKey = 'SECRET';
  personal.connections.push({id: 'safe-id', provider: 'heygen', state: 'connected', generation: 2, unit: 'heygen_credit', perJob: '1', perMonth: '2', walletVerified: true, workspaceGranted: true, balance: null, encryptedToken: 'SECRET', ownerId: 'PRIVATE-OWNER', walletDigest: 'SECRET'});
  const hub = thirdPartyHubV1(catalog.map(p => ({...p, apiKey: 'SECRET'})), [{id: 'legacy', name: 'Display name', identifier: 'heygen', apiKey: 'SECRET', internalId: 'PRIVATE-ACCOUNT'}], personal, VIDEO_PROVIDERS_V1);
  for (const secret of ['SECRET', 'PRIVATE-OWNER', 'PRIVATE-ACCOUNT', 'apiKey', 'encryptedToken', 'walletDigest']) expect(JSON.stringify(hub)).not.toContain(secret);
  expect(hub.providers[0].api.connections).toEqual([{id: 'legacy', name: 'Display name'}]);
});

test('existing manager facade reads stored rows without constructing a provider or changing stores', async () => {
  const { ThirdPartyManager } = loadTypeScriptModule(base + '3rdparties/thirdparty.manager.ts', {
    '@contentfactory/nestjs-libraries/database/prisma/third-party/third-party.service': {ThirdPartyService: class {}},
  });
  const get = jest.fn(() => {throw Error('Provider access forbidden');});
  const read = jest.fn(async () => [{id: 'existing', name: 'Retained', identifier: 'heygen'}]);
  const manager = new ThirdPartyManager({get}, {getAllThirdPartiesByOrganization: read});
  manager.getAllThirdParties = () => catalog;
  const hub = await manager.integrationHub('org', choices());
  expect(read).toHaveBeenCalledWith('org'); expect(get).not.toHaveBeenCalled();
  expect(hub.providers[0].api.connections[0].id).toBe('existing');
});

const permission = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.ability.ts');
const permissionTypes = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permission.exception.class.ts');
const { ThirdPartyController } = loadTypeScriptModule('apps/backend/src/api/routes/third-party.controller.ts', {
  '@contentfactory/nestjs-libraries/3rdparties/thirdparty.manager': {ThirdPartyManager: class {}},
  '@contentfactory/nestjs-libraries/database/prisma/media/media.service': {MediaService: class {}},
  '@contentfactory/nestjs-libraries/videos/video-access.service': {VideoAccessService: class {}},
  '@contentfactory/nestjs-libraries/upload/upload.factory': {UploadFactory: {createStorage: () => ({})}},
  '@contentfactory/helpers/auth/auth.service': {AuthService: {}},
  '@contentfactory/backend/services/auth/permissions/permissions.ability': permission,
  '@contentfactory/backend/services/auth/permissions/permission.exception.class': permissionTypes,
});
test('hub controller preserves exact actor/workspace and refuses unauthorized inventory before store reads', async () => {
  const lookup = jest.fn(async () => choices()); const inventory = jest.fn(async () => 'safe-inventory');
  const controller = new ThirdPartyController({integrationHub: inventory}, {}, {choices: lookup});
  expect(await controller.getIntegrationHub({id: 'org'}, {id: 'actor'})).toBe('safe-inventory');
  expect(lookup).toHaveBeenCalledWith('org', 'actor'); expect(inventory).toHaveBeenCalledWith('org', choices());
  inventory.mockClear(); lookup.mockRejectedValue(new Error('VIDEO_ACCESS_DENIED'));
  await expect(controller.getIntegrationHub({id: 'foreign-org'}, {id: 'actor'})).rejects.toThrow('VIDEO_ACCESS_DENIED');
  expect(inventory).not.toHaveBeenCalled();
});
test('API credential setup and removal require the existing administrator policy', () => {
  const expected = [[permissionTypes.AuthorizationActions.Update, permissionTypes.Sections.ADMIN]];
  for (const method of ['addApiKey', 'deleteById']) expect(Reflect.getMetadata(permission.CHECK_POLICIES_KEY, ThirdPartyController.prototype[method])).toEqual(expected);
});

test('hub links preserve exact saved chat/draft/piece/job and use no generic redirect parameter', () => {
  const path = '/agents/owned-thread?videoDraftId=owned-draft&pieceId=owned-piece&videoJobId=owned-job';
  const href = videoIntegrationHubHrefV1(path); expect(href).toBe('/third-party?videoReturn=' + encodeURIComponent(path));
  expect(videoHubReturnPathV1(new URL(href, 'https://cf.example').searchParams.get('videoReturn'))).toBe(path);
  expect(videoIntegrationHubHrefV1('/third-party')).toBe('/third-party');
  for (const invalid of ['//evil.example', 'https://evil.example', '/third-party?next=evil', '/agents/thread?videoDraftId=x&videoDraftId=y', '/media?video=1&jobId=x&jobId=y', '/agents/t?videoDraftId=d#evil']) expect(videoIntegrationHubHrefV1(invalid)).toBeNull();
});
