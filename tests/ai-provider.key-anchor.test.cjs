'use strict';

/**
 * A stored AI key keeps the provider it was saved for (review W3-20 F1, F2;
 * the owner's rule: a key never reaches another engine's endpoint, and no
 * mutable field re-anchors one — bd memory
 * `content-factory-next-search-key-mutable-anchor`).
 *
 * On «Ключи системы» the settings answer the operator's provider. The screen's
 * mode switch and the chat's `ai.mode` sent it back when the workspace
 * returned to «Свой ключ», and the workspace's OpenAI key went to OpenRouter.
 * The fix is in the one step both doors save through, `updateSettings`: the
 * provider changes only together with a new key, or while none is stored; a
 * key whose prefix names another provider is refused. `getSettings` names
 * the workspace's own provider (`workspaceProvider`) in either mode.
 */
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const secretShapes = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/secret-shapes.ts');
const aiRoles = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.roles.ts');

/** The real config module, reading the row the test holds. */
const configWith = (row) => {
  const config = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.provider.config.ts', {
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { fixedDecryption: (value) => `decrypted:${value}` },
    },
    '@contentfactory/nestjs-libraries/openai/ai.roles': aiRoles,
  });
  config.setAiProviderSettingReader(async () => row.current);
  return config;
};

const serviceWith = (stored, env = {}) => {
  const row = { current: stored };
  const saved = [];
  const config = configWith(row);
  const { AiProviderService } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.provider.service.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaService: class {} },
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: { fixedEncryption: (value) => `encrypted:${value}` },
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': config,
      '@contentfactory/nestjs-libraries/openai/ai.roles': aiRoles,
      '@contentfactory/nestjs-libraries/chat/conductor/secret-shapes': secretShapes,
    },
    {
      sources: {
        '@contentfactory/nestjs-libraries/openai/ai.usage.service':
          'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
        '@contentfactory/nestjs-libraries/openai/ai.search-tasks':
          'libraries/nestjs-libraries/src/openai/ai.search-tasks.ts',
      },
    }
  );
  const service = new AiProviderService({
    aiProviderSetting: {
      findUnique: async () => row.current,
      upsert: async ({ update }) => {
        saved.push(update);
        row.current = { ...row.current, ...update };
      },
    },
    aiUsageRecord: { count: async () => 0, groupBy: async () => [] },
  });
  const previous = { ...process.env };
  Object.assign(process.env, { AI_PROVIDER: 'openrouter', AI_INCLUDED_API_KEY: 'operator-key', ...env });
  return { service, saved, row, restore: () => (process.env = previous) };
};

/** A workspace that saved an OpenAI key and then moved to «Ключи системы». */
const OPENAI_ON_SYSTEM_KEYS = {
  usageMode: 'included',
  provider: 'openai',
  apiKey: 'sk-proj-stored',
  textModel: 'gpt-5-mini',
  imageModel: null,
  roleModels: { draft: 'gpt-5' },
  searchEnabled: false,
  searchProvider: 'tavily',
  searchApiKeys: {},
};

describe('a stored AI key keeps its provider (review W3-20 F1)', () => {
  let env;
  afterEach(() => env?.restore());

  test('on «Ключи системы» the settings name the operator’s provider and the workspace’s own', async () => {
    env = serviceWith(OPENAI_ON_SYSTEM_KEYS);
    const settings = await env.service.getSettings('org-1');
    expect(settings).toMatchObject({ usageMode: 'included', provider: 'openrouter', workspaceProvider: 'openai' });
  });

  test('the old screen body — the mode with the operator’s provider and models — leaves the key’s provider and models', async () => {
    env = serviceWith(OPENAI_ON_SYSTEM_KEYS);
    const after = await env.service.updateSettings('org-1', {
      usageMode: 'workspace_key',
      provider: 'openrouter',
      textModel: 'openai/gpt-5-mini',
      roleModels: {},
    });
    expect(env.saved[0]).toEqual({ usageMode: 'workspace_key' });
    expect(env.row.current).toMatchObject({ provider: 'openai', textModel: 'gpt-5-mini', roleModels: { draft: 'gpt-5' } });
    expect(after).toMatchObject({ usageMode: 'workspace_key', provider: 'openai', workspaceProvider: 'openai' });
  });

  test('the mode alone (`ai.mode`, the screen’s switch) writes the mode alone', async () => {
    env = serviceWith(OPENAI_ON_SYSTEM_KEYS);
    await env.service.updateSettings('org-1', { usageMode: 'workspace_key' });
    expect(env.saved[0]).toEqual({ usageMode: 'workspace_key' });
    expect(env.row.current.provider).toBe('openai');
  });

  test('a provider change without a new key leaves the stored one on «Свой ключ» too', async () => {
    env = serviceWith({ ...OPENAI_ON_SYSTEM_KEYS, usageMode: 'workspace_key' });
    await env.service.updateSettings('org-1', { provider: 'openrouter', textModel: '', imageModel: '', roleModels: {} });
    expect(env.row.current).toMatchObject({ provider: 'openai', textModel: 'gpt-5-mini' });
  });

  test('a new key moves the provider, and the old provider’s models go', async () => {
    env = serviceWith(OPENAI_ON_SYSTEM_KEYS);
    await env.service.updateSettings('org-1', {
      usageMode: 'workspace_key',
      provider: 'openrouter',
      apiKey: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKE0000',
    });
    expect(env.row.current).toMatchObject({
      provider: 'openrouter',
      apiKey: 'encrypted:sk-or-v1-FAKEFAKEFAKEFAKEFAKE0000',
      textModel: null,
      imageModel: null,
      roleModels: {},
    });
  });

  test('with no key stored the provider follows the request', async () => {
    env = serviceWith({ ...OPENAI_ON_SYSTEM_KEYS, apiKey: null });
    await env.service.updateSettings('org-1', { usageMode: 'workspace_key', provider: 'openrouter' });
    expect(env.row.current.provider).toBe('openrouter');
  });

  test('a key whose prefix names another provider or engine is refused, nothing saved (F2)', async () => {
    env = serviceWith(OPENAI_ON_SYSTEM_KEYS);
    await expect(
      env.service.updateSettings('org-1', {
        usageMode: 'workspace_key',
        provider: 'openai',
        apiKey: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKE0000',
      })
    ).rejects.toMatchObject({ status: 400, response: { code: 'AI_KEY_PROVIDER_MISMATCH' } });
    await expect(
      env.service.updateSettings('org-1', { searchApiKeys: { exa: 'tvly-dev-FAKEFAKEFAKEFAKE0000' } })
    ).rejects.toMatchObject({ status: 400 });
    expect(env.saved).toEqual([]);
  });
});

describe('the door takes a body without a provider (F1, F3)', () => {
  const { AiProviderDto } = loadTypeScriptModule('libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts', {
    '@contentfactory/nestjs-libraries/openai/ai.roles': aiRoles,
    '@contentfactory/nestjs-libraries/openai/ai.search-tasks': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/openai/ai.search-tasks.ts'
    ),
  });
  const { validateSync } = require('class-validator');
  const { plainToInstance } = require('class-transformer');
  test.each([
    [{ usageMode: 'workspace_key' }],
    [{ searchApiKeys: { exa: 'exa-fake-key' } }],
    [{ usageMode: 'workspace_key', provider: 'openrouter', apiKey: 'sk-or-v1-FAKE' }],
  ])('%j is valid', (body) => {
    expect(validateSync(plainToInstance(AiProviderDto, body))).toEqual([]);
  });
  test('an unknown provider is still refused', () => {
    expect(validateSync(plainToInstance(AiProviderDto, { provider: 'anthropic' })).length).toBeGreaterThan(0);
  });
});
