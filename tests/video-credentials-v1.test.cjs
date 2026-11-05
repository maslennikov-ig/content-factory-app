const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { validateSync } = require('class-validator');

const base = 'libraries/nestjs-libraries/src/';
const auth = {
  fixedEncryption: (value) => `encrypted:${value}`,
  fixedDecryption: (value) => {
    if (!value.startsWith('encrypted:')) throw new Error('must not expose failing secret');
    return value.slice('encrypted:'.length);
  },
};
const policy = { enabled: true, maxCostUsd: 2, monthlyBudgetUsd: 10 };
const setup = (workspace, instance) => {
  const state = { workspace, instance, writes: [], integrations: [], sourceReads: [] };
  const prisma = {
    aiProviderSetting: {
      findUnique: async ({ where }) => state.workspace?.organizationId === where.organizationId ? state.workspace : null,
      upsert: async ({ where, create, update }) => {
        state.writes.push({ where, create, update });
        state.workspace = state.workspace ? { ...state.workspace, ...update } : create;
      },
    },
    instanceAiDefaults: { findUnique: async () => state.instance },
    thirdParty: { findFirst: async ({where}) => { state.sourceReads.push(where); return state.integrations.find(row => row.id === where.id && row.organizationId === where.organizationId && row.deletedAt === null) ?? null; } },
  };
  prisma.$transaction = async run => run(prisma);
  const mocks = {
    '@contentfactory/helpers/auth/auth.service': { AuthService: auth },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaService: class {}, PrismaRepository: class { constructor(model) { this.model = model; } } },
  };
  const loaded = loadTypeScriptModule(`${base}videos/video-credentials.service.ts`, mocks);
  return { ...loaded, service: new loaded.VideoCredentialsService(prisma), state, mocks, prisma };
};
const workspace = () => ({
  organizationId: 'org-a', usageMode: 'workspace_key',
  videoApiKeys: { higgsfield: 'encrypted:workspace-video' },
  videoSpendPolicy: { higgsfield: { ...policy } },
});
const instance = () => ({
  videoApiKeys: { higgsfield: 'encrypted:operator-video', heygen: 'encrypted:operator-presenter' },
  videoSpendPolicy: { higgsfield: { ...policy }, heygen: { ...policy } },
});
const code = (expected) => expect.objectContaining({ response: expect.objectContaining({ code: expected }) });

test('video resolves only the selected payer/provider without a text key or environment fallback', async () => {
  const { service, state } = setup(workspace(), instance());
  const own = await service.resolve('org-a', 'higgsfield');
  expect(own).toMatchObject({ provider: 'higgsfield', payer: 'workspace_key', apiKey: 'workspace-video', maxCostUsd: 2, monthlyBudgetUsd: 10 });
  await expect(service.resolve('org-a', 'heygen')).rejects.toMatchObject(code('VIDEO_KEY_NOT_CONFIGURED'));
  state.workspace.usageMode = 'included';
  const included = await service.resolve('org-a', 'higgsfield');
  expect(included.apiKey).toBe('operator-video');
  await expect(service.resolve('org-a', 'higgsfield', 'workspace_key')).rejects.toMatchObject(code('VIDEO_PAYER_CHANGED'));
});

test('included video remains disabled with credentials but no explicit monetary policy', async () => {
  const { service, state } = setup({ organizationId: 'org-a', usageMode: 'included' }, { videoApiKeys: instance().videoApiKeys });
  await expect(service.resolve('org-a', 'higgsfield')).rejects.toMatchObject(code('VIDEO_SPEND_POLICY_UNAVAILABLE'));
  state.instance.videoSpendPolicy = { higgsfield: { ...policy, monthlyBudgetUsd: 0 } };
  await expect(service.resolve('org-a', 'higgsfield')).rejects.toMatchObject(code('VIDEO_SPEND_POLICY_UNAVAILABLE'));
  state.instance.videoSpendPolicy = { higgsfield: { ...policy, enabled: false } };
  await expect(service.resolve('org-a', 'higgsfield')).rejects.toMatchObject(code('VIDEO_SPEND_POLICY_UNAVAILABLE'));
});

test('saving the first workspace video key preserves inherited included payer mode', async () => {
  const {service, state} = setup(null, instance());
  const settings = await service.saveWorkspace('org-a', {videoApiKeys: {heygen: 'synthetic-presenter-key'}, videoSpendPolicy: {heygen: policy}});
  expect(state.workspace.usageMode).toBe('included');
  expect(settings.usageMode).toBe('included');
  expect((await service.resolve('org-a', 'heygen')).apiKey).toBe('operator-presenter');
});

test('settings expose presence/policy only; encryption and removal remain tenant-scoped and provider-specific', async () => {
  const { service, state } = setup(workspace(), instance());
  const output = await service.saveWorkspace('org-a', {
    videoApiKeys: { heygen: 'new-presenter-key' },
    videoSpendPolicy: { heygen: { ...policy } },
  });
  expect(state.workspace.videoApiKeys).toEqual({ higgsfield: 'encrypted:workspace-video', heygen: 'encrypted:new-presenter-key' });
  expect(state.instance).toEqual(instance());
  expect(JSON.stringify(output)).not.toMatch(/operator-video|workspace-video|new-presenter-key|encrypted:/);
  expect(output.workspace.heygen).toEqual({ hasKey: true, ...policy, available: true });
  await service.saveWorkspace('org-a', { videoApiKeys: { higgsfield: null } });
  expect(state.workspace.videoApiKeys).toEqual({ heygen: 'encrypted:new-presenter-key' });
  expect(state.writes.every(({ where }) => where.organizationId === 'org-a')).toBe(true);
});

test('video settings conflict retries stop after three attempts without changing keys or policy', async () => {
  const { service, prisma, state } = setup(workspace(), instance());
  const before = structuredClone(state.workspace);
  prisma.$transaction = jest.fn(async () => { throw Object.assign(new Error('synthetic write conflict'), { code: 'P2034' }); });
  await expect(service.saveWorkspace('org-a', {
    videoApiKeys: { higgsfield: null },
    videoSpendPolicy: { higgsfield: { ...policy, enabled: false } },
  })).rejects.toMatchObject({ status: 503 });
  expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  expect(state.workspace).toEqual(before);
  expect(state.writes).toEqual([]);
});

test('pinned recovery never silently rotates a key, payer, provider or tenant', async () => {
  const { service, state } = setup(workspace(), instance());
  const credential = await service.resolve('org-a', 'higgsfield');
  expect(credential.reference).toMatch(/^[a-f0-9]{64}$/);
  await expect(service.resolvePinned('org-a', 'higgsfield', credential.payer, credential.reference)).resolves.toEqual(credential);
  state.workspace.videoApiKeys.higgsfield = 'encrypted:rotated';
  await expect(service.resolvePinned('org-a', 'higgsfield', credential.payer, credential.reference)).rejects.toMatchObject(code('VIDEO_CREDENTIAL_CHANGED'));
  state.workspace.videoApiKeys.higgsfield = 'encrypted:workspace-video';
  state.workspace.usageMode = 'included';
  state.workspace.videoSpendPolicy = {};
  await expect(service.resolvePinned('org-a', 'higgsfield', credential.payer, credential.reference)).resolves.toMatchObject({
    payer: 'workspace_key', apiKey: 'workspace-video', reference: credential.reference, maxCostUsd: 0, monthlyBudgetUsd: 0,
  });
  await expect(service.admissionConfig('org-a', credential)).rejects.toMatchObject(code('VIDEO_PAYER_CHANGED'));
  await expect(service.resolvePinned('org-b', 'higgsfield', 'included', credential.reference)).rejects.toMatchObject(code('VIDEO_CREDENTIAL_CHANGED'));
  await expect(service.resolvePinned('org-a', 'heygen', 'included', credential.reference)).rejects.toMatchObject(code('VIDEO_CREDENTIAL_CHANGED'));
});

test('unreadable stored credentials produce a sanitized refusal', async () => {
  const row = workspace(); row.videoApiKeys.higgsfield = 'broken-sensitive-cipher';
  const { service } = setup(row, instance());
  await expect(service.resolve('org-a', 'higgsfield')).rejects.toMatchObject(code('VIDEO_KEY_UNREADABLE'));
  try { await service.resolve('org-a', 'higgsfield'); } catch (error) {
    expect(JSON.stringify(error)).not.toMatch(/broken-sensitive|expose failing/);
  }
});

test('DTO and service reject unknown providers, zero/missing caps and invalid key maps', async () => {
  const { service, state, mocks } = setup(workspace(), instance());
  const { VideoProviderSettingsDto } = loadTypeScriptModule(`${base}dtos/settings/ai.provider.dto.ts`, mocks);
  for (const body of [
    { videoApiKeys: { openai: 'key' } },
    { videoApiKeys: { higgsfield: ' key ' } },
    { videoApiKeys: { heygen: 'key\nline' } },
    { videoSpendPolicy: { higgsfield: { enabled: true, maxCostUsd: 1 } } },
    { videoSpendPolicy: { higgsfield: { ...policy, maxCostUsd: 0 } } },
    { videoSpendPolicy: { higgsfield: { ...policy, monthlyBudgetUsd: -1 } } },
    { videoSpendPolicy: { higgsfield: { ...policy, enabled: 'yes' } } },
    { videoSpendPolicy: { higgsfield: { ...policy, monthlyBudgetUsd: 1 } } },
  ]) {
    expect(validateSync(Object.assign(new VideoProviderSettingsDto(), body)).length).toBeGreaterThan(0);
    await expect(service.saveWorkspace('org-a', body)).rejects.toMatchObject(code('VIDEO_SETTINGS_INVALID'));
  }
  expect(state.writes).toHaveLength(0);
  expect(validateSync(Object.assign(new VideoProviderSettingsDto(), {
    videoApiKeys: { heygen: null }, videoSpendPolicy: { heygen: policy },
  }))).toEqual([]);
});

test('video admission uses the video provider/key without altering active text configuration', async () => {
  const { service, prisma, mocks } = setup(workspace(), instance());
  const credential = await service.resolve('org-a', 'higgsfield');
  const config = await service.admissionConfig('org-a', credential, 'wan-v3');
  expect(config).toMatchObject({ provider: 'higgsfield', usageMode: 'workspace_key', apiKey: 'workspace-video', textModel: 'wan-v3' });
  const admitted = [];
  const textContext = jest.fn((org, cfg, callback) => callback());
  const { AiUsageService } = loadTypeScriptModule(`${base}openai/ai.usage.service.ts`, {
    ...mocks,
    '@prisma/client': { Prisma: {} },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      INSTANCE_AI_DEFAULTS_ID: 'instance', setAiProviderSettingReader() {}, setInstanceAiDefaultsReader() {},
      getActiveAiOrganizationId: () => 'org-a', withActiveAiConfig: textContext,
    },
    '@contentfactory/nestjs-libraries/user/acting.user': { getActingUserId: () => 'user-a' },
  });
  const usage = new AiUsageService({ ...prisma, aiUsageRecord: { create: async ({ data }) => { admitted.push(data); return { id: 'usage-a' }; } } });
  const operation = await usage.beginAiOperationWithConfig('org-a', 'video_generation', config);
  expect(operation.id).toBe('usage-a');
  expect(operation.run(() => 'provider-result')).toBe('provider-result');
  expect(textContext).not.toHaveBeenCalled();
  expect(admitted).toEqual([expect.objectContaining({ provider: 'higgsfield', model: 'wan-v3', operation: 'video_generation', role: 'draft', usageMode: 'workspace_key' })]);
});

const thirdPartySource = id => ({kind: 'third_party', integrationId: id});
const sourceWorkspace = () => ({...workspace(), videoApiKeys: {...workspace().videoApiKeys, heygen: 'encrypted:unused-inline'},
  videoSpendPolicy: {...workspace().videoSpendPolicy, heygen: {...policy, credentialSource: thirdPartySource('legacy-heygen')}}});
const savedSource = (overrides = {}) => ({id: 'legacy-heygen', organizationId: 'org-a', identifier: 'heygen', name: 'Saved presenter API', apiKey: 'encrypted:legacy-secret', deletedAt: null, ...overrides});

test('explicit saved API source resolves only the owned HeyGen row and returns secret-free settings', async () => {
  const {service,state}=setup(sourceWorkspace(),instance()); state.integrations.push(savedSource());
  const credential=await service.resolve('org-a','heygen','workspace_key');
  expect(credential).toMatchObject({provider:'heygen',payer:'workspace_key',apiKey:'legacy-secret',maxCostUsd:2,monthlyBudgetUsd:10});
  expect(credential.reference).toMatch(/^[a-f0-9]{64}$/);
  expect(await service.admissionConfig('org-a',credential,'heygen-avatar')).toMatchObject({provider:'heygen',usageMode:'workspace_key',apiKey:'legacy-secret',workspaceKeyConfigured:true});
  const settings=await service.getSettings('org-a');
  expect(settings.workspace.heygen).toMatchObject({hasKey:true,available:true,credentialSource:{kind:'third_party',integrationId:'legacy-heygen',name:'Saved presenter API',status:'configured'}});
  expect(JSON.stringify(settings)).not.toMatch(/encrypted:|legacy-secret|unused-inline/);
  expect(state.sourceReads.every(where=>where.organizationId==='org-a'&&where.id==='legacy-heygen'&&where.deletedAt===null)).toBe(true);
  await expect(service.resolvePinned('org-a','heygen','workspace_key',credential.reference)).resolves.toEqual(credential);
});

test.each([
  {organizationId:'foreign'}, {identifier:'higgsfield'}, {deletedAt:new Date('2030-01-01T00:00:00Z')}, {apiKey:''},
])('a foreign, wrong-provider, deleted or empty selected source never falls back to an inline key: %j', async overrides=>{
  const {service,state}=setup(sourceWorkspace(),instance());state.integrations.push(savedSource(overrides));
  await expect(service.resolve('org-a','heygen')).rejects.toMatchObject(code('VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE'));
  const settings=await service.getSettings('org-a');expect(settings.workspace.heygen).toMatchObject({hasKey:false,available:false,credentialSource:{status:'unavailable'}});
});

test('source rotation, deletion, explicit revoke and source replacement invalidate pinned recovery without changing history',async()=>{
  for(const change of ['rotate','delete','revoke','replace']){
    const {service,state}=setup(sourceWorkspace(),instance());state.integrations.push(savedSource());
    const accepted=await service.resolve('org-a','heygen');const preserved=structuredClone(accepted);
    if(change==='rotate')state.integrations[0].apiKey='encrypted:new-secret';
    if(change==='delete')state.integrations[0].deletedAt=new Date('2030-01-01T00:00:00Z');
    if(change==='revoke')state.workspace.videoSpendPolicy.heygen={...policy,enabled:false,credentialSource:null};
    if(change==='replace'){state.integrations.push(savedSource({id:'replacement'}));state.workspace.videoSpendPolicy.heygen.credentialSource=thirdPartySource('replacement');}
    await expect(service.resolvePinned('org-a','heygen','workspace_key',accepted.reference)).rejects.toMatchObject(expect.objectContaining({response:expect.objectContaining({code:expect.stringMatching(/^VIDEO_(CREDENTIAL_CHANGED|CREDENTIAL_SOURCE_UNAVAILABLE)$/)})}));
    expect(accepted).toEqual(preserved);expect(state.writes).toHaveLength(0);
  }
});

test('included payer never reads workspace API integrations, and an instance source is rejected without reading it',async()=>{
  const own=sourceWorkspace();own.usageMode='included';const operator=instance();
  const {service,state}=setup(own,operator);state.integrations.push(savedSource());
  expect((await service.resolve('org-a','heygen')).apiKey).toBe('operator-presenter');
  await service.getSettings('org-a');expect(state.sourceReads).toEqual([]);
  state.instance.videoSpendPolicy.heygen.credentialSource=thirdPartySource('legacy-heygen');
  await expect(service.resolve('org-a','heygen')).rejects.toMatchObject(code('VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE'));
  await expect(service.resolvePinned('org-a','heygen','included','opaque')).rejects.toMatchObject(code('VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE'));
  expect(state.sourceReads).toEqual([]);
});

test('budget-only saves retain the source, explicit null selects inline, and disabled policy still allows pinned reads',async()=>{
  const {service,state,videoSettingsUpdateV1}=setup(sourceWorkspace(),instance());state.integrations.push(savedSource());
  expect(videoSettingsUpdateV1(state.workspace,{videoSpendPolicy:{heygen:policy}}).videoSpendPolicy.heygen.credentialSource).toEqual(thirdPartySource('legacy-heygen'));
  const old=await service.resolve('org-a','heygen');
  await service.saveWorkspace('org-a',{videoSpendPolicy:{heygen:{...policy,maxCostUsd:3,enabled:false}}});
  expect(state.workspace.videoSpendPolicy.heygen.credentialSource).toEqual(thirdPartySource('legacy-heygen'));
  await expect(service.resolve('org-a','heygen')).rejects.toMatchObject(code('VIDEO_SPEND_POLICY_UNAVAILABLE'));
  await expect(service.resolvePinned('org-a','heygen','workspace_key',old.reference)).resolves.toMatchObject({apiKey:'legacy-secret',reference:old.reference});
  await service.saveWorkspace('org-a',{videoSpendPolicy:{heygen:{...policy,credentialSource:null}}});
  expect((await service.resolve('org-a','heygen')).apiKey).toBe('unused-inline');
  expect(state.integrations[0].apiKey).toBe('encrypted:legacy-secret');
});

test('source selection is validated before a write; only explicit existing workspace HeyGen sources can be bound',async()=>{
  const {service,state,mocks,videoSettingsUpdateV1}=setup(workspace(),instance());state.integrations.push(savedSource());
  const {VideoProviderSettingsDto}=loadTypeScriptModule(`${base}dtos/settings/ai.provider.dto.ts`,mocks);
  for(const source of [{kind:'third_party',integrationId:''},{kind:'third_party',integrationId:'legacy-heygen',apiKey:'secret'},{kind:'other',integrationId:'legacy-heygen'}]){
    const body={videoSpendPolicy:{heygen:{...policy,credentialSource:source}}};
    expect(validateSync(Object.assign(new VideoProviderSettingsDto(),body)).length).toBeGreaterThan(0);
    await expect(service.saveWorkspace('org-a',body)).rejects.toMatchObject(code('VIDEO_SETTINGS_INVALID'));
  }
  await expect(service.saveWorkspace('org-a',{videoSpendPolicy:{higgsfield:{...policy,credentialSource:thirdPartySource('legacy-heygen')}}})).rejects.toMatchObject(code('VIDEO_SETTINGS_INVALID'));
  await expect(service.saveWorkspace('org-a',{videoSpendPolicy:{heygen:{...policy,credentialSource:thirdPartySource('missing')}}})).rejects.toMatchObject(code('VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE'));
  expect(state.writes).toHaveLength(0);
  expect(()=>videoSettingsUpdateV1(null,{videoSpendPolicy:{heygen:{...policy,credentialSource:thirdPartySource('legacy-heygen')}}})).toThrow();
  const body={videoSpendPolicy:{heygen:{...policy,credentialSource:thirdPartySource('legacy-heygen')}}};
  expect(validateSync(Object.assign(new VideoProviderSettingsDto(),body))).toEqual([]);
  await service.saveWorkspace('org-a',body);
  expect(state.workspace.videoSpendPolicy.heygen.credentialSource).toEqual(thirdPartySource('legacy-heygen'));
  expect(state.workspace.videoApiKeys).toEqual(workspace().videoApiKeys);
});

test('malformed persisted source and unreadable selected ciphertext fail closed without inline recovery',async()=>{
  const {service,state}=setup(sourceWorkspace(),instance());state.integrations.push(savedSource({apiKey:'broken-secret'}));
  await expect(service.resolve('org-a','heygen')).rejects.toMatchObject(code('VIDEO_KEY_UNREADABLE'));
  state.workspace.videoSpendPolicy.heygen.credentialSource={kind:'unknown',integrationId:'legacy-heygen'};
  await expect(service.resolvePinned('org-a','heygen','workspace_key','opaque')).rejects.toMatchObject(code('VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE'));
});

test('existing inline credential reference bytes remain compatible',async()=>{
  const {service}=setup(workspace(),instance());const credential=await service.resolve('org-a','higgsfield');
  expect(credential.reference).toBe(require('node:crypto').createHash('sha256').update(JSON.stringify(['org-a','workspace_key','higgsfield','encrypted:workspace-video'])).digest('hex'));
});

test.each([{organizationId:'foreign'},{identifier:'higgsfield'},{deletedAt:new Date('2030-01-01T00:00:00Z')}])('invalid source cannot be saved before resolving credentials: %j',async overrides=>{
  const {service,state}=setup(workspace(),instance());state.integrations.push(savedSource(overrides));
  await expect(service.saveWorkspace('org-a',{videoSpendPolicy:{heygen:{...policy,credentialSource:thirdPartySource('legacy-heygen')}}})).rejects.toMatchObject(code('VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE'));
  expect(state.writes).toHaveLength(0);
});

test('saving the first explicit source retains included payer and never substitutes its workspace key for included use',async()=>{
  const {service,state}=setup(null,instance());state.integrations.push(savedSource());
  const result=await service.saveWorkspace('org-a',{videoSpendPolicy:{heygen:{...policy,credentialSource:thirdPartySource('legacy-heygen')}}});
  expect(state.workspace.usageMode).toBe('included');expect(result.usageMode).toBe('included');
  expect(result.workspace.heygen.credentialSource.status).toBe('inactive');
  state.sourceReads=[];
  expect((await service.resolve('org-a','heygen')).apiKey).toBe('operator-presenter');expect(state.sourceReads).toEqual([]);
});
