const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const rows = {
  'organization-a': {
    provider: 'openrouter',
    apiKey: 'ai-a',
    textModel: 'text-a',
    imageModel: 'image-a',
    searchEnabled: true,
    searchProvider: 'tavily',
    searchApiKey: 'search-a',
    searchTopic: 'news',
    searchDepth: 'advanced',
  },
  'organization-b': {
    provider: 'openai',
    apiKey: 'ai-b',
    textModel: 'text-b',
    imageModel: 'image-b',
    searchEnabled: false,
    searchProvider: 'tavily',
    searchApiKey: 'search-b',
    searchTopic: 'general',
    searchDepth: 'basic',
  },
};

const loadConfigModule = (
  findUnique = async ({ where }) => rows[where.organizationId]
) => {
  const config = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.provider.config.ts',
    {
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: {
          fixedDecryption: (value) => `decrypted:${value}`,
        },
      },
    }
  );
  // The module holds no client of its own; the application lends it one.
  config.setAiProviderSettingReader((organizationId) =>
    findUnique({ where: { organizationId } })
  );
  return config;
};

const { loadAiConfig, resetAiConfigCache } = loadConfigModule();

describe('organization web-search configuration', () => {
  beforeEach(() => resetAiConfigCache());

  test('keeps each organization search engine and key isolated', async () => {
    const [first, second, firstAgain] = await Promise.all([
      loadAiConfig('organization-a'),
      loadAiConfig('organization-b'),
      loadAiConfig('organization-a'),
    ]);

    expect(first.search).toEqual({
      enabled: true,
      provider: 'tavily',
      apiKey: 'decrypted:search-a',
      topic: 'news',
      depth: 'advanced',
    });
    expect(second.search).toEqual({
      enabled: false,
      provider: 'tavily',
      apiKey: 'decrypted:search-b',
      topic: 'general',
      depth: 'basic',
    });
    expect(firstAgain.search.apiKey).toBe('decrypted:search-a');
  });

  test('a database outage is not remembered as "no key"', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    let available = false;
    const findUnique = jest.fn(async ({ where }) => {
      if (!available) throw new Error('database unavailable');
      return rows[where.organizationId];
    });
    const { loadAiConfig: load } = loadConfigModule(findUnique);

    expect((await load('organization-a')).apiKey).toBe('');

    available = true;
    expect((await load('organization-a')).apiKey).toBe('decrypted:ai-a');
    expect(findUnique).toHaveBeenCalledTimes(2);

    consoleError.mockRestore();
  });

  test('a changed setting is picked up by the next resolve without a restart', async () => {
    const stored = { ...rows['organization-a'] };
    const findUnique = jest.fn(async () => stored);
    const { loadAiConfig: load } = loadConfigModule(findUnique);

    expect((await load('organization-a')).textModel).toBe('text-a');

    stored.textModel = 'text-rotated';
    expect((await load('organization-a')).textModel).toBe('text-rotated');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

const resetCacheSpy = jest.fn();

const { AiProviderService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/ai.provider.service.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        fixedEncryption: (value) => `encrypted:${value}`,
      },
    },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      loadAiConfig: async () => ({
        usageMode: 'included',
        provider: 'openrouter',
        apiKey: 'private-ai-key',
        textModel: 'text-model',
        imageModel: 'image-model',
        workspaceKeyConfigured: true,
        includedAvailable: true,
        search: {
          enabled: true,
          provider: 'tavily',
          apiKey: 'private-search-key',
          topic: 'news',
          depth: 'advanced',
        },
      }),
      resetAiConfigCache: resetCacheSpy,
      OPENROUTER_BASE_URL: 'https://openrouter.example',
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      aiBillingPeriodStart: () => new Date('2026-08-01T00:00:00.000Z'),
    },
  }
);

test('settings response exposes key presence without returning either secret', async () => {
  const settings = await new AiProviderService({
    aiUsageRecord: { count: async () => 0, groupBy: async () => [] },
  }).getSettings('organization-a');

  expect(settings).toMatchObject({
    usageMode: 'included',
    hasKey: true,
    workspaceKeyConfigured: true,
    includedAvailable: true,
    hasSearchKey: true,
    searchFallbackAvailable: true,
  });
  expect(settings).not.toHaveProperty('apiKey');
  expect(settings).not.toHaveProperty('searchApiKey');
  expect(JSON.stringify(settings)).not.toContain('private-');
});

test('settings distinguish an exhausted included allowance from an available one', async () => {
  const service = new AiProviderService({
    subscription: {
      findUnique: async () => ({
        includedAiMonthlyOperations: 2,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    },
    aiUsageRecord: { count: async () => 2, groupBy: async () => [] },
  });

  await expect(service.getSettings('organization-a')).resolves.toMatchObject({
    includedMonthlyOperations: 2,
    includedUsedOperations: 2,
    includedRemainingOperations: 0,
    includedRestrictionReason: 'quota_exhausted',
  });
});

describe('saving the AI provider settings', () => {
  const createService = () => {
    const upsert = jest.fn().mockResolvedValue({});
    // `updateSettings` answers with the fresh settings, and reading them now
    // includes the per-member usage breakdown, so the double has to carry the
    // ledger as well as the setting it saves.
    const service = new AiProviderService({
      aiProviderSetting: { upsert },
      aiUsageRecord: { count: async () => 0, groupBy: async () => [] },
    });
    return { service, upsert };
  };

  test('a partial save leaves the models it did not mention alone', async () => {
    const { service, upsert } = createService();

    await service.updateSettings('organization-a', {
      provider: 'openrouter',
      usageMode: 'workspace_key',
      searchEnabled: true,
    });

    const [[query]] = upsert.mock.calls;
    expect(query.update).not.toHaveProperty('textModel');
    expect(query.update).not.toHaveProperty('imageModel');
    expect(query.update).not.toHaveProperty('searchDepth');
    expect(query.update).toMatchObject({
      provider: 'openrouter',
      usageMode: 'workspace_key',
      searchEnabled: true,
    });
    expect(query.create).toMatchObject({ searchDepth: 'advanced' });
  });

  test('an explicit model is written, and an emptied one is cleared', async () => {
    const { service, upsert } = createService();

    await service.updateSettings('organization-a', {
      provider: 'openai',
      textModel: 'gpt-next',
      imageModel: '',
    });

    const [[query]] = upsert.mock.calls;
    expect(query.update).toMatchObject({
      textModel: 'gpt-next',
      imageModel: null,
    });
  });

  test('included mode does not write workspace credentials or models', async () => {
    const { service, upsert } = createService();

    await service.updateSettings('organization-a', {
      usageMode: 'included',
      provider: 'openrouter',
      apiKey: 'must-not-be-stored',
      searchApiKey: 'must-not-be-stored',
      textModel: 'workspace-text',
      imageModel: 'workspace-image',
      searchEnabled: true,
    });

    const [[query]] = upsert.mock.calls;
    expect(query.update).toEqual({
      usageMode: 'included',
      searchEnabled: true,
    });
    expect(JSON.stringify(query)).not.toContain('must-not-be-stored');
  });

  test('the process that saved the setting drops its cached copy at once', async () => {
    const { service } = createService();

    await service.updateSettings('organization-a', { provider: 'openai' });

    expect(resetCacheSpy).toHaveBeenCalledWith('organization-a');
  });
});

test('the settings DTO rejects OpenRouter as a primary search provider', async () => {
  const { AiProviderDto } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts'
  );
  const { validate } = require('class-validator');
  const dto = Object.assign(new AiProviderDto(), {
    provider: 'openrouter',
    searchProvider: 'openrouter',
  });

  const errors = await validate(dto);

  expect(errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ property: 'searchProvider' }),
    ])
  );
});

test('the settings DTO accepts only the two explicit usage modes', async () => {
  const { AiProviderDto } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts'
  );
  const { validate } = require('class-validator');
  const invalid = Object.assign(new AiProviderDto(), {
    provider: 'openai',
    usageMode: 'automatic',
  });
  const valid = Object.assign(new AiProviderDto(), {
    provider: 'openai',
    usageMode: 'included',
  });

  expect(await validate(invalid)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ property: 'usageMode' }),
    ])
  );
  expect(await validate(valid)).toEqual([]);
});

test('new AI provider rows default to advanced search depth', () => {
  const schema = fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    ),
    'utf8'
  );

  expect(schema).toMatch(/searchDepth\s+String\s+@default\("advanced"\)/);
});
