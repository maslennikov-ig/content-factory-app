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
  const state = { workspace, instance, writes: [] };
  const prisma = {
    aiProviderSetting: {
      findUnique: async ({ where }) => state.workspace?.organizationId === where.organizationId ? state.workspace : null,
      upsert: async ({ where, create, update }) => {
        state.writes.push({ where, create, update });
        state.workspace = state.workspace ? { ...state.workspace, ...update } : create;
      },
    },
    instanceAiDefaults: { findUnique: async () => state.instance },
  };
  prisma.$transaction = async run => run(prisma);
  const mocks = {
    '@contentfactory/helpers/auth/auth.service': { AuthService: auth },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaService: class {} },
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
