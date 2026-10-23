'use strict';

const { randomUUID } = require('node:crypto');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { assertDisposableDatabaseV1 } = require('./helpers/video-domain-v1.fixture.cjs');

const databaseUrl = process.env.CF_VIDEO_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseV1(databaseUrl);
const integration = databaseUrl ? describe : describe.skip;
const LIB = 'libraries/nestjs-libraries/src/';
const policy = { enabled: true, maxCostUsd: 2, monthlyBudgetUsd: 10 };
const auth = {
  fixedEncryption: value => `encrypted:${value}`,
  fixedDecryption: value => value.slice('encrypted:'.length),
};

/** Hold both initial reads open, including inside actual Prisma transactions. */
function concurrentReads(prisma, model) {
  let reads = 0;
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  const wrap = client => new Proxy(client, {
    get(target, property) {
      if (property === '$transaction') return (run, options) =>
        prisma.$transaction(tx => run(wrap(tx)), options);
      const value = target[property];
      if (property !== model) return typeof value === 'function' ? value.bind(target) : value;
      return new Proxy(value, {
        get(delegate, method) {
          if (method === 'findUnique') return async args => {
            const row = await delegate.findUnique(args);
            if (++reads <= 2) {
              if (reads === 2) release();
              await ready;
            }
            return row;
          };
          const operation = delegate[method];
          return typeof operation === 'function' ? operation.bind(delegate) : operation;
        },
      });
    },
  });
  return wrap(prisma);
}

function services(prisma, instanceId) {
  const mocks = {
    '@contentfactory/helpers/auth/auth.service': { AuthService: auth },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaService: class {} },
  };
  const config = loadTypeScriptModule(`${LIB}openai/ai.provider.config.ts`, mocks);
  // Isolate operator tests from the shared singleton, and all reads from any
  // environment database fallback. No provider HTTP is needed for settings.
  config.setAiProviderSettingReader(organizationId => prisma.aiProviderSetting.findUnique({ where: { organizationId } }));
  config.setInstanceAiDefaultsReader(() => prisma.instanceAiDefaults.findUnique({ where: { id: instanceId } }));
  mocks['@contentfactory/nestjs-libraries/openai/ai.provider.config'] = { ...config, INSTANCE_AI_DEFAULTS_ID: instanceId };
  const credentials = loadTypeScriptModule(`${LIB}videos/video-credentials.service.ts`, mocks);
  mocks['@contentfactory/nestjs-libraries/videos/video-credentials.service'] = credentials;
  const { AiProviderService } = loadTypeScriptModule(`${LIB}openai/ai.provider.service.ts`, mocks);
  const { InstanceAiDefaultsService } = loadTypeScriptModule(`${LIB}openai/instance-ai-defaults.service.ts`, mocks);
  return {
    dedicated: new credentials.VideoCredentialsService(prisma),
    common: new AiProviderService(prisma),
    instance: new InstanceAiDefaultsService(prisma),
  };
}

integration('video settings writers preserve concurrent provider edits (disposable Prisma)', () => {
  jest.setTimeout(20_000);
  let prisma;
  const organizations = [];
  const instances = [];
  beforeAll(() => {
    prisma = new (require('@prisma/client').PrismaClient)({ datasources: { db: { url: databaseUrl } } });
  });
  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizations.splice(0) } } });
    await prisma.instanceAiDefaults.deleteMany({ where: { id: { in: instances.splice(0) } } });
  });
  afterAll(async () => { await prisma.$disconnect(); });
  const createOrganization = async () => {
    const organizationId = randomUUID();
    organizations.push(organizationId);
    await prisma.organization.create({ data: { id: organizationId, name: 'Isolated video settings regression' } });
    return organizationId;
  };
  const instanceId = () => {
    const id = `video-settings-${randomUUID()}`;
    instances.push(id);
    return id;
  };

  test.each([
    ['dedicated', 'dedicated'],
    ['common', 'common'],
    ['dedicated', 'common'],
    ['instance', 'instance'],
  ])('%s / %s retain provider disable, key removal and an unrelated new key', async (first, second) => {
    const organizationId = await createOrganization();
    const id = instanceId();
    const operator = first === 'instance';
    const initial = {
      apiKey: auth.fixedEncryption('synthetic-text-key'),
      searchApiKeys: { exa: auth.fixedEncryption('synthetic-search-key') },
      videoApiKeys: { higgsfield: auth.fixedEncryption('synthetic-old-video-key') },
      videoSpendPolicy: { higgsfield: policy, heygen: policy },
    };
    if (operator) await prisma.instanceAiDefaults.create({ data: { id, ...initial } });
    else await prisma.aiProviderSetting.create({ data: { organizationId, usageMode: 'workspace_key', ...initial } });
    const client = concurrentReads(prisma, operator ? 'instanceAiDefaults' : 'aiProviderSetting');
    const writers = services(client, id);
    const save = (writer, patch) => writer === 'dedicated'
      ? writers.dedicated.saveWorkspace(organizationId, patch)
      : writer === 'common'
      ? writers.common.updateSettings(organizationId, patch)
      : writers.instance.update('synthetic-operator', patch);
    const outputs = await Promise.all([
      save(first, { videoApiKeys: { higgsfield: null }, videoSpendPolicy: { higgsfield: { ...policy, enabled: false } } }),
      save(second, { videoApiKeys: { heygen: 'synthetic-new-video-key' }, videoSpendPolicy: { heygen: { ...policy, maxCostUsd: 3 } } }),
    ]);
    const row = operator
      ? await prisma.instanceAiDefaults.findUnique({ where: { id } })
      : await prisma.aiProviderSetting.findUnique({ where: { organizationId } });
    expect(row.videoSpendPolicy).toEqual({ higgsfield: { ...policy, enabled: false }, heygen: { ...policy, maxCostUsd: 3 } });
    expect(row.videoApiKeys).toEqual({ heygen: auth.fixedEncryption('synthetic-new-video-key') });
    expect(row.apiKey).toBe(initial.apiKey);
    expect(row.searchApiKeys).toEqual(initial.searchApiKeys);
    if (!operator) expect(row.usageMode).toBe('workspace_key');
    expect(JSON.stringify(outputs)).not.toMatch(/synthetic-(?:text|search|old-video|new-video)-key|encrypted:/);
  });

  test.each([
    [undefined, 'included'],
    ['included', 'included'],
    ['workspace_key', 'workspace_key'],
  ])('first common video-only save with mode %s persists %s', async (requestedMode, expectedMode) => {
    const organizationId = await createOrganization();
    const writers = services(prisma, instanceId());
    const output = await writers.common.updateSettings(organizationId, {
      ...(requestedMode ? { usageMode: requestedMode } : {}),
      videoApiKeys: { heygen: 'synthetic-first-video-key' },
      videoSpendPolicy: { heygen: policy },
    });
    const row = await prisma.aiProviderSetting.findUnique({ where: { organizationId } });
    expect(row.usageMode).toBe(expectedMode);
    expect(output.usageMode).toBe(expectedMode);
    expect(output.video.workspace.heygen).toEqual({ hasKey: true, ...policy, available: true });
    expect(JSON.stringify(output)).not.toMatch(/synthetic-first-video-key|encrypted:/);
  });
});
