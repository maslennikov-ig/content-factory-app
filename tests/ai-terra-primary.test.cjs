const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');
const configFile = 'libraries/nestjs-libraries/src/openai/ai.provider.config.ts';
const roles = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.roles.ts');
const load = () => loadTypeScriptModule(configFile, {
  '@contentfactory/helpers/auth/auth.service': { AuthService: { fixedDecryption: value => value } },
});
const envKeys = ['AI_PROVIDER', 'AI_TEXT_MODEL', 'AI_ROLE_MODELS', 'AI_INCLUDED_API_KEY'];
let previous;
beforeEach(() => {
  previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
});
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test.each([
  ['openai', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6.1-terra'],
  ['openrouter', 'google/gemini-4-argon', 'google/gemini-3.8-flash', 'google/gemini-3.8-flash'],
])('stored provider %s chooses its unpinned primary and review defaults even when the environment provider differs', async (provider, primary, classify, review) => {
  process.env.AI_PROVIDER = provider === 'openai' ? 'openrouter' : 'openai';
  const config = await load().loadAiConfig('tenant', async () => ({ usageMode: 'included' }),
    async () => ({ provider, apiKey: 'test-only' }));
  expect(config.textModel).toBe(primary);
  expect(config.modelRouting.advancedModel).toBe(config.textModel);
  for (const role of ['agent', 'extract', 'research', 'draft', 'adapt']) {
    expect(roles.modelFor(role, config)).toBe(config.textModel);
  }
  expect(roles.modelFor('classify', config)).toBe(classify);
  for (const role of ['judge', 'review']) expect(roles.modelFor(role, config)).toBe(review);
});

test('persisted instance and own-key selections survive the default change', async () => {
  process.env.AI_PROVIDER = 'openrouter';
  process.env.AI_ROLE_MODELS = JSON.stringify({ classify: 'operator/classifier' });
  const module = load();
  const instance = { provider: 'openrouter', apiKey: 'test-only', textModel: 'operator/primary',
    roleModels: { agent: 'operator/agent', __modelRouting: { advancedModel: 'operator/advanced', advancedFlex: false } } };
  const included = await module.loadAiConfig('tenant', async () => ({ usageMode: 'included' }), async () => instance);
  expect(included.textModel).toBe('operator/primary');
  expect(included.roleModels).toEqual({ agent: 'operator/agent' });
  expect(included.modelRouting.advancedModel).toBe('operator/advanced');
  const own = await module.loadAiConfig('tenant', async () => ({ usageMode: 'workspace_key', provider: 'openrouter',
    apiKey: 'test-own', textModel: 'workspace/primary', roleModels: { classify: 'workspace/classifier' } }), async () => instance);
  expect(own.textModel).toBe('workspace/primary');
  expect(own.roleModels).toEqual({ classify: 'workspace/classifier' });
});

test.each(['openai', 'openrouter'])('%s transport uses medium Terra and low Luna, preserving explicit reasoning', async provider => {
  const prefix = provider === 'openrouter' ? 'openai/' : '';
  const bodies = [];
  const transport = chain.createTextChainFetch({ provider, usageMode: 'workspace_key', singleModelAttempt: true,
    textChain: { flex: false, fallbackModel: '' } }, async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ output: [], choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    });
  for (const model of ['gpt-6.1-terra', 'gpt-6-luna']) {
    await transport(provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: prefix + model, stream: false }),
    });
  }
  expect(bodies.map(body => body.reasoning)).toEqual([{ effort: 'medium' }, { effort: 'low' }]);
  const explicit = chain.buildAttemptBody({ reasoning: { effort: 'high' } }, { model: prefix + 'gpt-6.1-terra', flex: false }, undefined, provider);
  expect(explicit.reasoning).toEqual({ effort: 'high' });
  expect(explicit.reasoning_effort).toBeUndefined();
});
