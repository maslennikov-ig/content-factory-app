/**
 * `content-factory-next-ia7s` (D15 of the W2 live walk, 27.09.2026): the
 * `web_research` usage row carried neither tokens nor cost, so search spend was
 * invisible. The row now carries what is honestly known:
 *
 * - the tokens and cost of the model calls made inside the search (subject
 *   classification, summary restatement), billed to the primary search row;
 * - the cost the search engine itself reported — Exa's `costDollars.total` in
 *   `costUsd`; Tavily's credits, which are not dollars, only in the summary;
 * - the request count per engine, in the free-text `serviceTier` column,
 *   because the schema has no column for it and is not changed for this.
 *
 * No network, no paid call: engines, the classifier and the transport are
 * doubles that report what a real one would.
 */
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { createFakeRedis } = require('./helpers/fake-redis.cjs');

const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');

describe('search usage in the ledger', () => {
  test('a search-only operation names the engine, its reported dollars and its requests', () => {
    const ledger = new chain.TextUsageLedger();
    ledger.recordSearch({ engine: 'exa', costUsd: 0.007 });
    ledger.recordSearch({ engine: 'exa', costUsd: 0.005 });

    const columns = ledger.columns();
    expect(columns).toEqual({
      model: 'exa',
      serviceTier: 'search exa requests=2',
      costUsd: expect.any(Number),
    });
    expect(columns.costUsd).toBeCloseTo(0.012, 10);
  });

  test('Tavily credits are counted, never converted into dollars', () => {
    const ledger = new chain.TextUsageLedger();
    ledger.recordSearch({ engine: 'tavily', credits: 2 });
    ledger.recordSearch({ engine: 'tavily', credits: 2 });

    expect(ledger.columns()).toEqual({
      model: 'tavily',
      serviceTier: 'search tavily requests=2 credits=4',
      costUsd: null,
    });
  });

  test('model calls keep their columns and the search is added beside them', () => {
    const ledger = new chain.TextUsageLedger();
    ledger.record({
      attempt: 1,
      model: 'classify-model',
      serviceTier: 'flex',
      promptTokens: 100,
      completionTokens: 20,
      costUsd: 0.0001,
    });
    ledger.recordSearch({ engine: 'tavily', failed: true, possiblyBilled: false });
    ledger.recordSearch({ engine: 'exa', costUsd: 0.007 });

    const columns = ledger.columns();
    expect(columns).toMatchObject({
      model: 'classify-model',
      attempt: 1,
      promptTokens: 100,
      completionTokens: 20,
      serviceTier: 'flex; search tavily requests=1 failed=1; exa requests=1',
      possiblyBilled: false,
    });
    expect(columns.costUsd).toBeCloseTo(0.0071, 10);
  });

  test('a search abandoned at its deadline marks the row as possibly billed', () => {
    const ledger = new chain.TextUsageLedger();
    ledger.recordSearch({ engine: 'tavily', failed: true, possiblyBilled: true });

    expect(ledger.columns()).toEqual({
      possiblyBilled: true,
      serviceTier: 'search tavily requests=1 failed=1',
      costUsd: null,
    });
  });

  test('a ledger without searches reads exactly as before', () => {
    const ledger = new chain.TextUsageLedger();
    expect(ledger.columns()).toBeUndefined();
    ledger.record({ attempt: 1, model: 'm', promptTokens: 5 });
    expect(ledger.columns()).toEqual({
      model: 'm',
      serviceTier: null,
      attempt: 1,
      promptTokens: 5,
      completionTokens: null,
      reasoningTokens: null,
      cachedTokens: null,
      costUsd: null,
    });
  });
});

describe('search adapters report what the engine reported', () => {
  const builtTavily = [];
  class TavilySearch {
    constructor(params) {
      builtTavily.push(params);
    }
  }
  const clients = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.clients.ts',
    {
      openai: { __esModule: true, default: class {} },
      '@langchain/openai': { ChatOpenAI: class {}, DallEAPIWrapper: class {} },
      '@ai-sdk/openai': { createOpenAI: () => ({}) },
      '@langchain/tavily': { TavilySearch },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        requireActiveAiConfig: async () => ({
          usageMode: 'workspace_key',
          provider: 'openrouter',
          apiKey: 'model-key',
          search: {
            enabled: true,
            provider: 'tavily',
            apiKey: 'ia7s-tavily-key',
            apiKeys: { tavily: 'ia7s-tavily-key' },
            topic: 'general',
            depth: 'advanced',
          },
        }),
        getActiveAiRole: () => undefined,
        OPENROUTER_BASE_URL: 'https://openrouter.example/api/v1',
      },
      '@contentfactory/nestjs-libraries/openai/ai.roles': loadTypeScriptModule(
        'libraries/nestjs-libraries/src/openai/ai.roles.ts'
      ),
    }
  );

  const exaFetch = (body) => async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  test('Exa costDollars.total becomes usage.costUsd', async () => {
    const exa = new clients.ExaWebSearch(
      'exa-key',
      exaFetch({
        results: [{ url: 'https://example.com/a', text: 'Page' }],
        costDollars: { total: 0.007, search: { neural: 0.007 } },
      })
    );
    const response = await exa.invoke({ query: 'q' });
    expect(response.usage).toEqual({ costUsd: 0.007 });
  });

  test('Exa without costDollars reports no usage rather than zero', async () => {
    const exa = new clients.ExaWebSearch(
      'exa-key',
      exaFetch({ results: [{ url: 'https://example.com/a', text: 'Page' }] })
    );
    const response = await exa.invoke({ query: 'q' });
    expect(response).not.toHaveProperty('usage');
  });

  test('Tavily usage.credits becomes usage.credits', async () => {
    const tavily = new clients.TavilyWebSearch({
      invoke: async () => ({
        results: [{ url: 'https://example.com/t', content: 'Snippet' }],
        usage: { credits: 2 },
      }),
    });
    const response = await tavily.invoke({ query: 'q' });
    expect(response.usage).toEqual({ credits: 2 });
  });

  test('the Tavily client asks the engine to report its credits', async () => {
    await clients.getWebSearchClient('organization-ia7s', 'tavily');
    expect(builtTavily.at(-1)).toMatchObject({ includeUsage: true });
  });
});

describe('web research writes its spend to its own row', () => {
  let aiConfig;
  let classification;
  let implementations;
  const rows = [];

  const aiUsage = {
    beginAiOperationWithConfig: async (_organizationId, operation, config) => {
      const ledger = new chain.TextUsageLedger();
      const row = { operation, usageMode: config.usageMode, columns: null };
      rows.push(row);
      return {
        run: (callback) => chain.runWithUsageLedger(ledger, callback),
        track: (callback) => chain.runWithUsageLedger(ledger, callback),
        finish: async (succeeded) => {
          row.succeeded = succeeded;
          row.columns = ledger.columns() ?? null;
        },
      };
    },
  };

  // The classifier stands in for the shared transport: a real model call is
  // recorded into whatever ledger is current when it runs.
  const prompt = {
    pipe: () => ({
      invoke: async () => {
        chain.currentUsageLedger()?.record({
          attempt: 1,
          model: 'classify-model',
          promptTokens: 120,
          completionTokens: 30,
          costUsd: 0.0002,
        });
        return classification;
      },
    }),
  };

  class Logger {
    log() {}
    warn() {}
    debug() {}
  }

  const { WebResearchService } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/web.research.service.ts',
    {
      '@nestjs/common': {
        Injectable: () => (target) => target,
        Optional: () => () => {},
        Inject: () => () => {},
        Logger,
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        requireActiveAiConfig: async () => aiConfig,
        getActiveAiConfig: () => undefined,
        loadAiConfig: async () => aiConfig,
        withActiveAiConfig: (_organizationId, _config, callback) => callback(),
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
        AiUsageService: class {},
      },
      '@contentfactory/nestjs-libraries/openai/ai.text-chain': chain,
      '@contentfactory/nestjs-libraries/redis/redis.service': {
        ioRedis: createFakeRedis(),
      },
      '@contentfactory/nestjs-libraries/dtos/content.language':
        loadTypeScriptModule(
          'libraries/nestjs-libraries/src/dtos/content.language.ts'
        ),
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        WEB_SEARCH_TIMEOUT_MS: 20_000,
        WEB_SEARCH_PRIMARY_TIMEOUT_MS: 12_000,
        WEB_SEARCH_FALLBACK_TIMEOUT_MS: 8_000,
        WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
        WEB_SEARCH_MAX_RESULT_CHARS: 32_000,
        getChatModel: async () => ({ withStructuredOutput: () => ({}) }),
        getWebSearchClient: async (_organizationId, provider) => ({
          invoke: async (input) => implementations[provider](input),
        }),
      },
      '@langchain/core/prompts': {
        ChatPromptTemplate: { fromTemplate: () => prompt },
      },
    }
  );

  const answer = (provider, usage) => ({
    answer: `${provider} summary`,
    results: [
      {
        title: `${provider} source`,
        url: `https://example.com/${provider}`,
        content: `Fact from ${provider}`,
        published_date: '2026-09-20',
      },
    ],
    ...(usage ? { usage } : {}),
  });

  beforeEach(() => {
    rows.length = 0;
    classification = {
      scope: 'global',
      subjectLanguage: 'en',
      englishQuery: 'current topic',
      subjectLanguageQuery: null,
      freshnessRequired: false,
    };
    aiConfig = {
      usageMode: 'included',
      provider: 'openrouter',
      apiKey: 'model-key',
      search: {
        enabled: true,
        provider: 'tavily',
        apiKey: 'tavily-key',
        apiKeys: { tavily: 'tavily-key' },
        keySources: { tavily: 'system' },
        topic: 'general',
        depth: 'advanced',
      },
    };
    implementations = {};
  });

  test('the classifier tokens and the Tavily credits land on the web_research row', async () => {
    implementations.tavily = () => answer('tavily', { credits: 2 });

    await new WebResearchService(aiUsage).research('organization-a', 'Subject ia7s-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ operation: 'web_research', succeeded: true });
    expect(rows[0].columns).toMatchObject({
      model: 'classify-model',
      promptTokens: 120,
      completionTokens: 30,
      costUsd: 0.0002,
      serviceTier: 'search tavily requests=1 credits=2',
    });
  });

  test('a fallback counts the failed request and adds the dollars Exa reported', async () => {
    aiConfig.search.apiKeys = { tavily: 'tavily-key', exa: 'exa-key' };
    aiConfig.search.keySources = { tavily: 'system', exa: 'system' };
    implementations.tavily = () => {
      throw Object.assign(new Error('Tavily 503'), { status: 503 });
    };
    implementations.exa = () => answer('exa', { costUsd: 0.007 });

    await new WebResearchService(aiUsage).research('organization-a', 'Subject ia7s-2');

    expect(rows).toHaveLength(1);
    const { columns } = rows[0];
    expect(columns).toMatchObject({
      model: 'classify-model',
      promptTokens: 120,
      possiblyBilled: false,
      serviceTier: 'search tavily requests=1 failed=1; exa requests=1',
    });
    expect(columns.costUsd).toBeCloseTo(0.0072, 10);
  });

  test('with caller queries and no model call the row names the engine that answered', async () => {
    aiConfig.search.provider = 'exa';
    aiConfig.search.apiKey = 'exa-key';
    aiConfig.search.apiKeys = { exa: 'exa-key' };
    aiConfig.search.keySources = { exa: 'own' };
    implementations.exa = () => answer('exa', { costUsd: 0.005 });

    await new WebResearchService(aiUsage).research('organization-a', 'Subject ia7s-3', {
      queries: ['supplied query'],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].usageMode).toBe('workspace_key');
    expect(rows[0].columns).toEqual({
      model: 'exa',
      serviceTier: 'search exa requests=1',
      costUsd: 0.005,
    });
  });

  /*
   * content-factory-next-kcxz.38 (P2-3): the row's usageMode is the search
   * credential's, so model tokens join it only when the generation key comes
   * from the same source. Otherwise they stay on the ledger of the operation
   * that asked for the search, and Exa dollars are never added to model
   * dollars under one credential.
   */
  const researchInside = async (subject) => {
    const outer = new chain.TextUsageLedger();
    await chain.runWithUsageLedger(outer, () =>
      new WebResearchService(aiUsage).research('organization-a', subject)
    );
    return outer.columns() ?? null;
  };

  test('own search key and own model key: the tokens join the workspace_key row', async () => {
    aiConfig.usageMode = 'workspace_key';
    aiConfig.search.provider = 'exa';
    aiConfig.search.apiKey = 'exa-key';
    aiConfig.search.apiKeys = { exa: 'exa-key' };
    aiConfig.search.keySources = { exa: 'own' };
    implementations.exa = () => answer('exa', { costUsd: 0.007 });

    const outer = await researchInside('Subject kcxz38-1');

    expect(rows).toHaveLength(1);
    expect(rows[0].usageMode).toBe('workspace_key');
    expect(rows[0].columns).toMatchObject({
      model: 'classify-model',
      promptTokens: 120,
      serviceTier: 'search exa requests=1',
    });
    expect(rows[0].columns.costUsd).toBeCloseTo(0.0072, 10);
    expect(outer).toBeNull();
  });

  test('own search key with the included model key: the tokens stay on the caller row', async () => {
    aiConfig.usageMode = 'included';
    aiConfig.search.provider = 'exa';
    aiConfig.search.apiKey = 'exa-key';
    aiConfig.search.apiKeys = { exa: 'exa-key' };
    aiConfig.search.keySources = { exa: 'own' };
    implementations.exa = () => answer('exa', { costUsd: 0.007 });

    const outer = await researchInside('Subject kcxz38-2');

    expect(rows).toHaveLength(1);
    expect(rows[0].usageMode).toBe('workspace_key');
    // The search row holds the engine and its dollars and nothing else.
    expect(rows[0].columns).toEqual({
      model: 'exa',
      serviceTier: 'search exa requests=1',
      costUsd: 0.007,
    });
    expect(outer).toMatchObject({
      model: 'classify-model',
      promptTokens: 120,
      completionTokens: 30,
      costUsd: 0.0002,
      serviceTier: null,
    });
  });

  test('system search key with the workspace model key: the included row gets no model spend', async () => {
    aiConfig.usageMode = 'workspace_key';
    implementations.tavily = () => answer('tavily', { credits: 2 });

    const outer = await researchInside('Subject kcxz38-3');

    expect(rows).toHaveLength(1);
    expect(rows[0].usageMode).toBe('included');
    expect(rows[0].columns).toEqual({
      model: 'tavily',
      serviceTier: 'search tavily requests=1 credits=2',
      costUsd: null,
    });
    expect(outer).toMatchObject({
      model: 'classify-model',
      promptTokens: 120,
      costUsd: 0.0002,
    });
  });

  test('an engine that reports nothing still leaves its request count', async () => {
    implementations.tavily = () => answer('tavily');

    await new WebResearchService(aiUsage).research('organization-a', 'Subject ia7s-4');

    expect(rows[0].columns).toMatchObject({
      costUsd: 0.0002,
      serviceTier: 'search tavily requests=1',
    });
  });
});
