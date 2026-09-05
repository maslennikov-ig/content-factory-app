const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
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

const built = {
  openai: [],
  chatCompletions: [],
  chat: [],
  dalle: [],
  aiSdk: [],
  tavily: [],
  tavilyInvocations: [],
};
let tavilyImplementation;

class OpenAI {
  constructor(config) {
    this.config = config;
    this.chat = {
      completions: {
        create: async (request) => {
          built.chatCompletions.push({ config, request });
          return {
            choices: [
              {
                message: {
                  content: `Summary for ${request.messages[0].content}`,
                  annotations: [
                    {
                      type: 'url_citation',
                      url_citation: {
                        title: 'OpenRouter source',
                        url: 'https://example.com/openrouter',
                        content: 'Excerpt supplied by Parallel',
                        start_index: 0,
                        end_index: 20,
                      },
                    },
                  ],
                },
              },
            ],
          };
        },
      },
    };
    built.openai.push(config);
  }
}
class ChatOpenAI {
  constructor(config) {
    this.config = config;
    built.chat.push(config);
  }
}
class DallEAPIWrapper {
  constructor(config) {
    this.config = config;
    built.dalle.push(config);
  }
}
class TavilySearch {
  constructor(config) {
    this.config = config;
    built.tavily.push(config);
  }

  async invoke(input, config) {
    built.tavilyInvocations.push({ input, config });
    if (tavilyImplementation) return tavilyImplementation(input);
    return {
      answer: `Tavily answer for ${input.query}`,
      results: [
        {
          title: 'Tavily source',
          url: 'https://example.com/tavily',
          content: 'Short Tavily snippet',
          raw_content: 'Full Tavily page\n\nSecond paragraph',
          published_date: '2026-08-14',
        },
      ],
    };
  }
}

let configs = {};

/**
 * The real role vocabulary rather than a double: it is an importless module,
 * and a stubbed one would let this suite keep passing while the model a role
 * resolves to changed underneath it (`content-factory-next-x63z`).
 */
const aiRoles = require('./helpers/load-ts-module.cjs').loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/ai.roles.ts'
);

/** The role of the operation the client is being built inside. */
let activeRole;

const clients = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/ai.clients.ts',
  {
    openai: { __esModule: true, default: OpenAI },
    '@langchain/openai': { ChatOpenAI, DallEAPIWrapper },
    '@ai-sdk/openai': {
      createOpenAI: (config) => {
        built.aiSdk.push(config);
        return { config };
      },
    },
    '@langchain/tavily': { TavilySearch },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      requireActiveAiConfig: async (organizationId) => {
        const config = configs[organizationId];
        if (!config?.apiKey) throw new Error('AI provider is not configured');
        return config;
      },
      getActiveAiRole: () => activeRole,
      OPENROUTER_BASE_URL: 'https://openrouter.example/api/v1',
    },
    '@contentfactory/nestjs-libraries/openai/ai.roles': aiRoles,
  }
);

const openrouter = {
  usageMode: 'workspace_key',
  provider: 'openrouter',
  apiKey: 'key-a',
  baseUrl: 'https://openrouter.example/api/v1',
  textModel: 'openai/gpt-5.6-luna',
  imageModel: 'openai/gpt-5-image',
  search: {
    enabled: true,
    provider: 'tavily',
    apiKey: 'search-a',
    topic: 'news',
    depth: 'advanced',
  },
};

const plainOpenAi = {
  usageMode: 'workspace_key',
  provider: 'openai',
  apiKey: 'key-b',
  textModel: 'gpt-4.1',
  imageModel: 'chatgpt-image-latest',
  search: {
    enabled: false,
    provider: 'tavily',
    apiKey: '',
    topic: 'general',
    depth: 'advanced',
  },
};

const openrouterFallback = {
  ...openrouter,
  search: {
    ...openrouter.search,
    provider: 'openrouter',
    apiKey: '',
  },
};

/**
 * The memo lives for the life of the process and is keyed by the resolved
 * configuration, so every test registers an organization with its own key;
 * reusing one would mean asserting against a client another test built.
 */
let organizationCounter = 0;
const register = (config) => {
  const id = `organization-${(organizationCounter += 1)}`;
  configs[id] = {
    ...config,
    apiKey: config.apiKey ? `${config.apiKey}-${id}` : '',
    search: {
      ...config.search,
      apiKey: config.search.apiKey ? `${config.search.apiKey}-${id}` : '',
    },
  };
  return id;
};

describe('per-organization AI clients', () => {
  beforeEach(() => {
    for (const list of Object.values(built)) list.length = 0;
    tavilyImplementation = undefined;
  });

  test('every SDK is redirected in the form it understands', async () => {
    const organization = register(openrouter);

    await clients.getOpenAiClient(organization);
    await clients.getChatModel(organization);
    await clients.getImageModel(organization);
    await clients.getAiSdkProvider(organization);

    const apiKey = configs[organization].apiKey;
    expect(built.openai[0]).toMatchObject({
      apiKey,
      baseURL: 'https://openrouter.example/api/v1',
    });
    expect(built.chat[0]).toMatchObject({
      apiKey,
      model: 'openai/gpt-5.6-luna',
      configuration: { baseURL: 'https://openrouter.example/api/v1' },
    });
    expect(built.dalle[0]).toMatchObject({
      apiKey,
      model: 'openai/gpt-5-image',
      baseUrl: 'https://openrouter.example/api/v1',
    });
    expect(built.aiSdk[0]).toMatchObject({
      apiKey,
      baseURL: 'https://openrouter.example/api/v1',
    });
  });

  test('a provider without a base URL is left pointing at its own API', async () => {
    const organization = register(plainOpenAi);

    await clients.getOpenAiClient(organization);
    await clients.getChatModel(organization);
    await clients.getImageModel(organization);

    expect(built.openai[0]).not.toHaveProperty('baseURL');
    expect(built.chat[0]).not.toHaveProperty('configuration');
    expect(built.dalle[0]).not.toHaveProperty('baseUrl');
    expect(built.chat[0].model).toBe('gpt-4.1');
  });

  test('a model call is given a deadline and a bounded number of retries', async () => {
    await clients.getChatModel(register(openrouter));

    expect(built.chat[0].timeout).toBeGreaterThan(0);
    expect(built.chat[0].maxRetries).toBeLessThanOrEqual(3);
    expect(clients.WEB_SEARCH_TIMEOUT_MS).toBeGreaterThan(0);
  });

  test('the same configuration is reused, a changed one is not', async () => {
    const organization = register(openrouter);
    const neighbour = register(plainOpenAi);

    const first = await clients.getChatModel(organization);
    const again = await clients.getChatModel(organization);
    expect(again).toBe(first);
    expect(built.chat).toHaveLength(1);

    // A different temperature is a different client.
    await clients.getChatModel(organization, 0);
    expect(built.chat).toHaveLength(2);

    // A rotated key must never be answered from the entry built with the old
    // one, even though the organization is the same.
    configs[organization] = { ...openrouter, apiKey: 'key-rotated' };
    const rotated = await clients.getChatModel(organization);
    expect(rotated).not.toBe(first);
    expect(built.chat[2]).toMatchObject({ apiKey: 'key-rotated' });

    // A key belongs to one organization, so a different one never shares an
    // entry with this one.
    const other = await clients.getChatModel(neighbour);
    expect(other).not.toBe(rotated);
  });

  test('keeps Tavily and OpenRouter credentials isolated between organizations', async () => {
    const tavilyOrganization = register(openrouter);
    const openrouterOrganization = register(openrouterFallback);

    const tavily = await clients.getWebSearchClient(
      tavilyOrganization,
      'tavily',
      { country: 'russia', freshnessRequired: false }
    );
    const openrouterClient = await clients.getWebSearchClient(
      openrouterOrganization,
      'openrouter'
    );

    expect(built.tavily[0]).toMatchObject({
      tavilyApiKey: `search-a-${tavilyOrganization}`,
      topic: 'news',
      searchDepth: 'advanced',
      includeRawContent: true,
    });
    expect(built.tavily[0]).not.toHaveProperty('country');
    expect(built.openai[0]).toMatchObject({
      apiKey: `key-a-${openrouterOrganization}`,
      baseURL: 'https://openrouter.example/api/v1',
    });

    const result = await openrouterClient.invoke({ query: 'current topic' });
    expect(built.chatCompletions[0].request).toMatchObject({
      model: 'openai/gpt-5.6-luna',
      messages: [{ role: 'user', content: 'current topic' }],
      plugins: [
        {
          id: 'web',
          engine: 'parallel',
          mode: 'advanced',
          max_results: 5,
        },
      ],
    });
    expect(result).toEqual({
      answer: 'Summary for current topic',
      results: [
        {
          title: 'OpenRouter source',
          url: 'https://example.com/openrouter',
          content: 'Excerpt supplied by Parallel',
        },
      ],
    });
    expect(built.tavily).toHaveLength(1);
  });

  test('configures Tavily for full advanced pages and normalizes raw content', async () => {
    const organization = register({
      ...openrouter,
      search: {
        ...openrouter.search,
        topic: 'general',
        depth: 'basic',
      },
    });

    const tavily = await clients.getWebSearchClient(organization, 'tavily', {
      country: 'russia',
      freshnessRequired: false,
    });
    const result = await tavily.invoke({ query: 'local subject' });

    expect(built.tavily[0]).toMatchObject({
      tavilyApiKey: `search-a-${organization}`,
      topic: 'general',
      searchDepth: 'basic',
      includeRawContent: true,
      country: 'russia',
    });
    expect(built.tavilyInvocations[0]).toEqual({
      input: { query: 'local subject' },
      config: undefined,
    });
    // `content-factory-next-fn33.134`: the snippet and the page reach the
    // research port under their own names, and the service chooses.
    expect(result.results[0]).toMatchObject({
      content: 'Short Tavily snippet',
      rawContent: 'Full Tavily page\n\nSecond paragraph',
    });
  });

  test('pins news freshness without sending an unsupported country filter', async () => {
    const organization = register({
      ...openrouter,
      search: { ...openrouter.search, topic: 'general' },
    });

    await clients.getWebSearchClient(organization, 'tavily', {
      country: 'russia',
      freshnessRequired: true,
    });

    expect(built.tavily[0]).toMatchObject({
      topic: 'news',
      timeRange: 'week',
      searchDepth: 'advanced',
    });
    expect(built.tavily[0]).not.toHaveProperty('country');
  });

  test("normalizes Tavily's empty-result error for fallback detection", async () => {
    const organization = register(openrouter);
    tavilyImplementation = async () => ({
      error: "No search results found for 'rare query'.",
    });

    const tavily = await clients.getWebSearchClient(organization, 'tavily');

    await expect(tavily.invoke({ query: 'rare query' })).resolves.toEqual({
      results: [],
    });
  });

  test('does not invent an HTTP status from digits in Tavily error text', async () => {
    const organization = register(openrouter);
    tavilyImplementation = async () => ({
      error: 'maxResults must be below 500',
    });

    const tavily = await clients.getWebSearchClient(organization, 'tavily');
    let caught;
    try {
      await tavily.invoke({ query: 'invalid request' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toMatchObject({
      message: 'maxResults must be below 500',
    });
    expect(caught.status).toBeUndefined();
    expect(caught.code).toBeUndefined();
  });

  test.each([
    ['Error 429: usage limit exceeded', 429],
    ['Error 403: plan quota exhausted', 403],
    ['Error 502: bad gateway', 502],
    ['Error 400: invalid request', 400],
  ])(
    'recovers the transport status the Tavily adapter flattened into %s',
    async (message, status) => {
      const organization = register(openrouter);
      tavilyImplementation = async () => ({ error: message });

      const tavily = await clients.getWebSearchClient(organization, 'tavily');

      await expect(
        tavily.invoke({ query: 'limited request' })
      ).rejects.toMatchObject({ message, status });
    }
  );

  test('preserves explicit Tavily status and code fields', async () => {
    const organization = register(openrouter);
    tavilyImplementation = async () => ({
      error: 'quota exhausted',
      status: 429,
      code: 'TAVILY_RATE_LIMIT',
    });

    const tavily = await clients.getWebSearchClient(organization, 'tavily');

    await expect(
      tavily.invoke({ query: 'limited request' })
    ).rejects.toMatchObject({
      message: 'quota exhausted',
      status: 429,
      code: 'TAVILY_RATE_LIMIT',
    });
  });

  test('uses the resolved organization base URL for OpenRouter web search', async () => {
    const organization = register({
      ...openrouterFallback,
      baseUrl: 'https://tenant-router.example/v1',
    });

    await clients.getWebSearchClient(organization, 'openrouter');

    expect(built.openai[0]).toMatchObject({
      baseURL: 'https://tenant-router.example/v1',
    });
  });

  test('requires a separate key only for Tavily', async () => {
    const tavilyWithoutKey = register({
      ...openrouter,
      search: { ...openrouter.search, apiKey: '' },
    });
    const openrouterWithoutSearchKey = register(openrouterFallback);

    await expect(
      clients.getWebSearchClient(tavilyWithoutKey, 'tavily')
    ).rejects.toThrow('Web search is not configured');
    await expect(
      clients.getWebSearchClient(openrouterWithoutSearchKey, 'openrouter')
    ).resolves.toBeDefined();
  });

  test('never constructs an OpenRouter fallback from an OpenAI organization key', async () => {
    const organization = register({
      ...plainOpenAi,
      search: {
        ...plainOpenAi.search,
        enabled: true,
        apiKey: 'tavily-key',
      },
    });

    await expect(
      clients.getWebSearchClient(organization, 'openrouter')
    ).rejects.toThrow('OpenRouter fallback is unavailable');
    expect(built.openai).toHaveLength(0);
  });

  test('requires the organization model key for the OpenRouter branch', async () => {
    const organization = register({ ...openrouterFallback, apiKey: '' });

    await expect(
      clients.getWebSearchClient(organization, 'openrouter')
    ).rejects.toThrow('AI provider is not configured');
    expect(built.openai).toHaveLength(0);
  });

  test.each(['tavily', 'openrouter'])(
    'refuses to construct a %s client while search is disabled',
    async (provider) => {
      const organization = register({
        ...openrouterFallback,
        search: {
          ...openrouterFallback.search,
          provider,
          enabled: false,
          apiKey: provider === 'tavily' ? 'disabled-key' : '',
        },
      });

      await expect(
        clients.getWebSearchClient(organization, provider)
      ).rejects.toThrow('Web search is not configured');
    }
  );
});
