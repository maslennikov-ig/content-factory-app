const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createFakeRedis } = require('./helpers/fake-redis.cjs');

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

const WEB_SEARCH_TIMEOUT_MS = 20_000;
const WEB_SEARCH_PRIMARY_TIMEOUT_MS = 12_000;
const WEB_SEARCH_FALLBACK_TIMEOUT_MS = 8_000;
const WEB_SEARCH_MAX_SOURCE_CHARS = 8_000;
const WEB_SEARCH_MAX_RESULT_CHARS = 32_000;

let classification;
let aiConfig;
let factoryImplementations;
let implementations;
const classifierInputs = [];
const clientFactoryCalls = [];
const invocations = [];
const logEntries = [];
const usageAdmissions = [];
const aiUsage = {
  executeAiOperation: async (_organizationId, _operation, callback) =>
    callback(),
  beginAiOperationWithConfig: async (_organizationId, operation, config) => {
    const admission = {
      operation,
      usageMode: config.usageMode,
      apiKey: config.apiKey,
      finished: null,
    };
    usageAdmissions.push(admission);
    return {
      run: (callback) => callback(),
      finish: async (succeeded) => {
        admission.finished = succeeded;
      },
    };
  },
};

const responseFor = (query, provider) => ({
  answer: `${provider} summary for ${query}`,
  results: [
    {
      title: `Source for ${query}`,
      url: `https://example.com/${provider}/${encodeURIComponent(query)}`,
      content: `Fact for ${query}`,
      published_date: '2026-08-12',
    },
  ],
});

const prompt = {
  pipe: () => ({
    invoke: async (input) => {
      classifierInputs.push(input);
      return classification;
    },
  }),
};

class Logger {
  log(message) {
    logEntries.push({ level: 'log', message });
  }

  warn(message) {
    logEntries.push({ level: 'warn', message });
  }
}

const { WebResearchService, WebSearchFallbackError, WebSearchNotConfigured } =
  loadTypeScriptModule(
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
      '@contentfactory/nestjs-libraries/redis/redis.service': {
        ioRedis: createFakeRedis(),
      },
      // Сводка приходит на языке читателя с 05.09.2026
      // (`content-factory-next-fn33.133`): сервис знает список языков контента.
      '@contentfactory/nestjs-libraries/dtos/content.language':
        loadTypeScriptModule(
          'libraries/nestjs-libraries/src/dtos/content.language.ts'
        ),
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        WEB_SEARCH_TIMEOUT_MS,
        WEB_SEARCH_PRIMARY_TIMEOUT_MS,
        WEB_SEARCH_FALLBACK_TIMEOUT_MS,
        WEB_SEARCH_MAX_SOURCE_CHARS,
        WEB_SEARCH_MAX_RESULT_CHARS,
        getChatModel: async () => ({ withStructuredOutput: () => ({}) }),
        getWebSearchClient: async (organizationId, provider, options) => {
          clientFactoryCalls.push({ organizationId, provider, options });
          const client = {
            invoke: async (input, config) => {
              invocations.push({ provider, input, config });
              const implementation = implementations[provider];
              return implementation
                ? implementation(input)
                : responseFor(input.query, provider);
            },
          };
          return factoryImplementations[provider]
            ? factoryImplementations[provider](client)
            : client;
        },
      },
      '@langchain/core/prompts': {
        ChatPromptTemplate: { fromTemplate: () => prompt },
      },
    }
  );

const statusError = (status) =>
  Object.assign(new Error(`Search failed with status ${status}`), { status });

/**
 * Откат по сбою идёт на второй движок с поисковым ключом и никогда на
 * OpenRouter (`content-factory-next-75xn.32`, решение владельца 13.09.2026):
 * OpenRouter отвечает ключом генерации, и сбой поиска превращался в расход
 * модели. В этих тестах вторым ключом лежит Exa.
 */
const withExaReserve = () => {
  aiConfig.search.apiKeys = {
    tavily: aiConfig.search.apiKey,
    exa: 'tenant-exa-key',
  };
  aiConfig.search.keySources = { tavily: 'system', exa: 'system' };
};

describe('shared web research service', () => {
  beforeEach(() => {
    classifierInputs.length = 0;
    clientFactoryCalls.length = 0;
    invocations.length = 0;
    logEntries.length = 0;
    usageAdmissions.length = 0;
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
      apiKey: 'tenant-model-key',
      search: {
        enabled: true,
        provider: 'tavily',
        apiKey: 'tenant-search-key',
        apiKeys: { tavily: 'tenant-search-key' },
        keySources: { tavily: 'system' },
        topic: 'general',
        depth: 'advanced',
      },
    };
    factoryImplementations = {};
    implementations = {};
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * `content-factory-next-75xn.2`. Задачу почти никто не называет: уровень уже
   * различает два обычных случая, и на том же различии стоит квота. Поэтому
   * маршрут выводится из него, а не переписывается по семи точкам входа.
   */
  test('an explicit level routes the search as research, and its absence as facts', async () => {
    aiConfig.search = {
      ...aiConfig.search,
      apiKeys: { tavily: 'tenant-search-key', exa: 'tenant-exa-key' },
      taskProviders: { research: 'exa' },
    };

    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Subject',
      {
        level: 'deep',
      }
    );
    expect(clientFactoryCalls[0].provider).toBe('exa');

    clientFactoryCalls.length = 0;
    // Поиск, который продукт начал сам по ходу письма: уровня нет, квота не
    // тратится, и движок остаётся тем, что выбран областью.
    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Other subject'
    );
    expect(clientFactoryCalls[0].provider).toBe('tavily');
  });

  test('a named task overrides what the level would have implied', async () => {
    aiConfig.search = {
      ...aiConfig.search,
      apiKeys: { tavily: 'tenant-search-key', exa: 'tenant-exa-key' },
      taskProviders: { research: 'exa', facts: 'tavily' },
    };

    // «Проверить факты поиском» передаёт уровень тоже, поэтому называет задачу.
    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Subject',
      {
        level: 'standard',
        task: 'facts',
      }
    );

    expect(clientFactoryCalls[0].provider).toBe('tavily');
  });

  test('a route to an engine with no key searches instead of failing', async () => {
    aiConfig.search = {
      ...aiConfig.search,
      apiKeys: { tavily: 'tenant-search-key' },
      taskProviders: { research: 'exa' },
    };

    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Subject',
      {
        level: 'quick',
      }
    );

    expect(clientFactoryCalls[0].provider).toBe('tavily');
  });

  test('a discovery window is handed to the engine', async () => {
    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Subject',
      {
        task: 'discovery',
        windowDays: 30,
      }
    );

    expect(clientFactoryCalls[0].options).toMatchObject({ windowDays: 30 });
  });

  test('two tasks on one subject are two searches, not one cached answer', async () => {
    const service = new WebResearchService(aiUsage);

    await service.research('organization-a', 'Subject', { task: 'facts' });
    await service.research('organization-a', 'Subject', {
      task: 'discovery',
      windowDays: 30,
    });

    // Проверка фактов — один запрос; поводы — новостной индекс и, раз он дал
    // меньше трёх адресов, второй проход по общему (`75xn.23`).
    expect(clientFactoryCalls.map(({ options }) => options.topic)).toEqual([
      undefined,
      'news',
      'general',
    ]);
  });

  test('a discovery sweep with enough news never buys the general pass', async () => {
    implementations.tavily = async ({ query }) => ({
      results: [1, 2, 3].map((n) => ({
        title: `News ${n} for ${query}`,
        url: `https://example.com/news/${n}`,
        content: `Fact ${n} for ${query}`,
        published_date: '2026-09-01',
        score: 0.9,
      })),
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'Subject',
      { task: 'discovery', windowDays: 30 }
    );

    expect(clientFactoryCalls.map(({ options }) => options.topic)).toEqual([
      'news',
    ]);
    expect(result.sources.map((source) => source.score)).toEqual([
      0.9, 0.9, 0.9,
    ]);
  });

  test('a cached answer expires after the research cache TTL (75xn.31)', async () => {
    const { ResearchQueryCache, RESEARCH_CACHE_TTL_MS } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/openai/web.research.service.ts',
      {
        '@nestjs/common': {
          Injectable: () => (target) => target,
          Optional: () => () => {},
          Inject: () => () => {},
          Logger,
        },
        '@contentfactory/nestjs-libraries/openai/ai.provider.config': {},
        '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
          AiUsageService: class {},
        },
        '@contentfactory/nestjs-libraries/openai/ai.clients': {},
        '@contentfactory/nestjs-libraries/dtos/content.language': {
          contentLanguageNames: {},
        },
        '@langchain/core/prompts': {
          ChatPromptTemplate: { fromTemplate: () => prompt },
        },
      }
    );
    const cache = new ResearchQueryCache();
    const storedAt = new Date('2026-09-13T10:00:00Z');
    cache.set('k', { answer: 1 }, storedAt);

    expect(
      cache.get('k', new Date(storedAt.getTime() + RESEARCH_CACHE_TTL_MS - 1))
    ).toEqual({ answer: 1 });
    expect(
      cache.get('k', new Date(storedAt.getTime() + RESEARCH_CACHE_TTL_MS))
    ).toBeUndefined();
    expect(RESEARCH_CACHE_TTL_MS).toBe(30 * 60 * 1000);
  });

  test('uses Tavily as primary and records the answering provider', async () => {
    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'Current topic'
    );

    expect(clientFactoryCalls).toEqual([
      {
        organizationId: 'organization-a',
        provider: 'tavily',
        options: {
          scope: 'global',
          country: undefined,
          freshnessRequired: false,
        },
      },
    ]);
    expect(invocations).toEqual([
      {
        provider: 'tavily',
        input: { query: 'current topic' },
        config: undefined,
      },
    ]);
    expect(result).toMatchObject({
      provider: 'tavily',
      sources: [
        {
          provider: 'tavily',
          url: 'https://example.com/tavily/current%20topic',
          title: 'Source for current topic',
          publishedAt: '2026-08-12',
        },
      ],
    });
    expect(logEntries).toContainEqual({
      level: 'log',
      message: 'Web research answered via tavily.',
    });
  });

  test('reserves quota only for an explicitly selected research level', async () => {
    const quota = { reserve: jest.fn(async () => ({ used: 1, limit: 20 })) };
    await new WebResearchService(aiUsage, quota).research(
      'organization-a',
      'implicit topic'
    );
    expect(quota.reserve).not.toHaveBeenCalled();

    await new WebResearchService(aiUsage, quota).research(
      'organization-a',
      'explicit topic',
      { level: 'quick' }
    );
    expect(quota.reserve).toHaveBeenCalledWith('organization-a', 'quick');
  });

  test('an own engine key bypasses included and deep-search quota in included generation mode', async () => {
    aiConfig.search.apiKey = 'own-tavily';
    aiConfig.search.apiKeys = { tavily: 'own-tavily' };
    aiConfig.search.keySources = { tavily: 'own' };
    const quota = { reserve: jest.fn() };

    await new WebResearchService(aiUsage, quota).research(
      'organization-a',
      'own-key topic',
      { level: 'deep', task: 'facts' }
    );

    expect(quota.reserve).not.toHaveBeenCalled();
    expect(usageAdmissions).toEqual([
      expect.objectContaining({
        operation: 'web_research',
        usageMode: 'workspace_key',
        apiKey: 'own-tavily',
        finished: true,
      }),
    ]);
  });

  test('an own-to-system fallback admits and reserves the actual fallback source', async () => {
    aiConfig.search.apiKeys = {
      exa: 'own-exa',
      tavily: 'system-tavily',
    };
    aiConfig.search.keySources = { exa: 'own', tavily: 'system' };
    aiConfig.search.apiKey = 'system-tavily';
    implementations.exa = async () => {
      throw statusError(503);
    };
    const quota = { reserve: jest.fn(async () => ({ used: 1, limit: 20 })) };

    await expect(
      new WebResearchService(aiUsage, quota).research(
        'organization-a',
        'fallback topic',
        { level: 'standard', task: 'research' }
      )
    ).resolves.toMatchObject({ provider: 'tavily' });

    expect(invocations.map(({ provider }) => provider)).toEqual([
      'exa',
      'tavily',
    ]);
    expect(quota.reserve).toHaveBeenCalledTimes(1);
    expect(
      usageAdmissions.map(({ usageMode, apiKey, finished }) => ({
        usageMode,
        apiKey,
        finished,
      }))
    ).toEqual([
      { usageMode: 'workspace_key', apiKey: 'own-exa', finished: false },
      { usageMode: 'included', apiKey: 'system-tavily', finished: true },
    ]);
  });

  test('parallel own-to-system fallbacks share one admission per source', async () => {
    classification = {
      scope: 'global',
      subjectLanguage: 'ru',
      englishQuery: 'english query',
      subjectLanguageQuery: 'русский запрос',
      freshnessRequired: false,
    };
    aiConfig.search.apiKeys = {
      exa: 'own-exa',
      tavily: 'system-tavily',
    };
    aiConfig.search.keySources = { exa: 'own', tavily: 'system' };
    aiConfig.search.apiKey = 'system-tavily';
    implementations.exa = async () => {
      throw statusError(503);
    };
    const admissions = [];
    const concurrentUsage = {
      beginAiOperationWithConfig: jest.fn(
        async (_organizationId, operation, config) => {
          // Keep creation pending long enough for both fallback attempts to
          // request the same source.
          await Promise.resolve();
          const admission = {
            operation,
            usageMode: config.usageMode,
            apiKey: config.apiKey,
            finishes: 0,
          };
          admissions.push(admission);
          return {
            run: (callback) => callback(),
            finish: async () => {
              admission.finishes += 1;
            },
          };
        }
      ),
    };
    const quota = { reserve: jest.fn(async () => ({ used: 1, limit: 20 })) };

    await expect(
      new WebResearchService(concurrentUsage, quota).research(
        'organization-a',
        'parallel fallback topic',
        { level: 'standard', task: 'research' }
      )
    ).resolves.toMatchObject({ provider: 'tavily' });

    expect(invocations.map(({ provider }) => provider)).toEqual([
      'exa',
      'exa',
      'tavily',
      'tavily',
    ]);
    expect(quota.reserve).toHaveBeenCalledTimes(1);
    expect(concurrentUsage.beginAiOperationWithConfig).toHaveBeenCalledTimes(2);
    expect(
      admissions.map(({ usageMode, apiKey, finishes }) => ({
        usageMode,
        apiKey,
        finishes,
      }))
    ).toEqual([
      { usageMode: 'workspace_key', apiKey: 'own-exa', finishes: 1 },
      { usageMode: 'included', apiKey: 'system-tavily', finishes: 1 },
    ]);
  });

  test('waits for the reservation before paying for the search', async () => {
    const exhausted = Object.assign(new Error('quota spent'), { status: 429 });
    const quota = {
      reserve: jest.fn(async () => {
        throw exhausted;
      }),
    };
    await expect(
      new WebResearchService(aiUsage, quota).research(
        'organization-a',
        'explicit topic',
        { level: 'deep' }
      )
    ).rejects.toBe(exhausted);
    expect(clientFactoryCalls).toHaveLength(0);
  });

  test('passes the declared deep source cap to the provider', async () => {
    await new WebResearchService(aiUsage).research(
      'organization-a',
      'deep topic',
      { level: 'deep' }
    );
    expect(clientFactoryCalls[0]).toMatchObject({
      options: { maxResults: 50 },
    });
  });

  test('applies the provider kill switch before constructing a client', async () => {
    process.env.RESEARCH_PROVIDER_KILL_SWITCHES = 'tavily';
    try {
      await expect(
        new WebResearchService(aiUsage).research('organization-a', 'blocked')
      ).rejects.toMatchObject({
        code: 'RESEARCH_EGRESS_PROVIDER_KILL_SWITCH',
      });
      expect(clientFactoryCalls).toEqual([]);
      expect(invocations).toEqual([]);
    } finally {
      delete process.env.RESEARCH_PROVIDER_KILL_SWITCHES;
    }
  });

  /**
   * A global subject written in Russian uses both the author's language and
   * English, while neither query inherits a Russia-only ranking hint.
   */
  test('recorded Iceland classification searches in both languages without a country bias and logs the decision', async () => {
    classification = {
      scope: 'global',
      subjectLanguage: 'ru',
      englishQuery: 'Iceland four day workweek experiment results',
      subjectLanguageQuery: 'Исландия эксперимент четырёхдневная рабочая неделя',
      freshnessRequired: false,
    };

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'Исландия и четырёхдневка\nкак идея для российских компаний'
    );

    expect(clientFactoryCalls[0]).toMatchObject({
      provider: 'tavily',
      options: {
        scope: 'global',
        country: undefined,
        freshnessRequired: false,
      },
    });
    expect(invocations.map(({ input }) => input.query)).toEqual([
      'Исландия эксперимент четырёхдневная рабочая неделя',
      'Iceland four day workweek experiment results',
    ]);
    expect(result.facts).toHaveLength(2);
    expect(logEntries).toContainEqual({
      level: 'log',
      message: 'Web research classification: subject="Исландия и четырёхдневка как идея для российских компаний" scope=global subjectLanguage=ru country=none queries=2 source=classifier.',
    });
  });

  test('recorded local classification searches only in the subject language with country ranking', async () => {
    classification = {
      scope: 'local',
      subjectLanguage: 'ru',
      englishQuery: 'Wildberries Ozon seller commissions Russia',
      subjectLanguageQuery: 'комиссии Wildberries Ozon для продавцов',
      freshnessRequired: false,
    };

    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Комиссии Wildberries и Ozon'
    );

    expect(clientFactoryCalls[0]).toMatchObject({
      provider: 'tavily',
      options: { scope: 'local', country: 'russia', freshnessRequired: false },
    });
    expect(invocations.map(({ input }) => input.query)).toEqual([
      'комиссии Wildberries Ozon для продавцов',
    ]);
    expect(logEntries).toContainEqual({
      level: 'log',
      message: 'Web research classification: subject="Комиссии Wildberries и Ozon" scope=local subjectLanguage=ru country=russia queries=1 source=classifier.',
    });
  });

  test('classification log keeps a short topic but redacts pasted addresses and credentials', async () => {
    const rawUrl = 'https://workspace.example.test/private/path';
    const rawEmail = 'owner@example.test';
    const rawToken = 'sk-proj-1234567890abcdefghijklmnop';
    const rawBearer = 'Bearer eyJhbGciOiJIUzI1NiJ9.private.signature';
    const longTail = 'длинное продолжение '.repeat(30);

    await new WebResearchService(aiUsage).research(
      'organization-a',
      `Комиссии маркетплейсов\n${rawUrl} ${rawEmail} apiKey=${rawToken} Authorization=${rawBearer} ${longTail}`
    );

    const entry = logEntries.find(({ message }) =>
      message.startsWith('Web research classification:')
    );
    expect(entry).toBeDefined();
    expect(entry.message).toContain(
      'subject="Комиссии маркетплейсов [url] [email] apiKey=[redacted]'
    );
    expect(entry.message).toContain(
      'scope=global subjectLanguage=en country=none queries=1 source=classifier.'
    );
    expect(entry.message).not.toContain('\n');
    expect(entry.message).not.toContain(rawUrl);
    expect(entry.message).not.toContain(rawEmail);
    expect(entry.message).not.toContain(rawToken);
    expect(entry.message).not.toContain(rawBearer);
    expect(entry.message.length).toBeLessThan(380);
  });

  test('one failed query does not throw away the other answer (ec48.3)', async () => {
    classification = {
      scope: 'global',
      subjectLanguage: 'ru',
      englishQuery: 'Bank of Russia key rate September 2026',
      subjectLanguageQuery: 'ключевая ставка Банка России сентябрь 2026',
      freshnessRequired: true,
    };
    implementations.tavily = async (input) => {
      if (input.query === 'Bank of Russia key rate September 2026') {
        const error = new Error('timed out');
        error.name = 'TimeoutError';
        throw error;
      }
      return responseFor(input.query, 'tavily');
    };

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка'
    );

    expect(result.facts).toEqual([
      {
        text: 'Fact for ключевая ставка Банка России сентябрь 2026',
        sourceUrl:
          'https://example.com/tavily/%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%B2%D0%B0%D1%8F%20%D1%81%D1%82%D0%B0%D0%B2%D0%BA%D0%B0%20%D0%91%D0%B0%D0%BD%D0%BA%D0%B0%20%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D0%B8%20%D1%81%D0%B5%D0%BD%D1%82%D1%8F%D0%B1%D1%80%D1%8C%202026',
      },
    ]);
    expect(
      logEntries.some(
        ({ level, message }) =>
          level === 'warn' &&
          /One of 2 web research queries failed/.test(message)
      )
    ).toBe(true);
  });

  test('when every query fails, the first failure is the answer (ec48.3)', async () => {
    classification = {
      scope: 'local',
      subjectLanguage: 'ru',
      englishQuery: 'Bank of Russia key rate September 2026',
      subjectLanguageQuery: 'ключевая ставка Банка России сентябрь 2026',
      freshnessRequired: true,
    };
    implementations.tavily = async () => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    };

    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'ставка')
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  test('a subscription footer is chrome even when it has enough letters (fn33.134)', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Reuters',
          url: 'https://example.com/reuters/amp',
          content:
            'Subscribers get fewer ads. Learn more about subscriptions, opens new tab. Terms & Conditions Privacy. Report AdImage 27 Image 28Image 29',
        },
        {
          title: 'Reuters again',
          url: 'https://example.com/reuters?outputType=amp',
          content:
            'Банк России сохранил ставку 14% годовых. Следующее заседание 11 сентября.',
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ставка'
    );

    expect(result.facts).toEqual([
      {
        text: 'Банк России сохранил ставку 14% годовых. Следующее заседание 11 сентября.',
        sourceUrl: 'https://example.com/reuters',
      },
    ]);
    // AMP-копия и обычная страница схлопнулись в один адрес (ec48.4).
    expect(result.sources.map((source) => source.url)).toEqual([
      'https://example.com/reuters',
    ]);
  });

  test('asks once when the subject itself is English', async () => {
    classification.subjectLanguageQuery = 'current topic in English again';

    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Current topic'
    );

    expect(invocations.map(({ input }) => input.query)).toEqual([
      'current topic',
    ]);
    expect(clientFactoryCalls[0].options.country).toBeUndefined();
  });

  test('does not pay twice when both queries came back the same', async () => {
    classification = {
      scope: 'global',
      subjectLanguage: 'de',
      englishQuery: 'Bundesbank',
      subjectLanguageQuery: '  Bundesbank  ',
      freshnessRequired: false,
    };

    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Bundesbank'
    );

    expect(invocations.map(({ input }) => input.query)).toEqual(['Bundesbank']);
  });

  test('leaves a non-Russian subject language unboosted', async () => {
    classification = {
      scope: 'global',
      subjectLanguage: 'de',
      englishQuery: 'German rental law',
      subjectLanguageQuery: 'Mietrecht Deutschland',
      freshnessRequired: false,
    };

    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Mietrecht'
    );

    expect(clientFactoryCalls[0].options.country).toBeUndefined();
    expect(invocations.map(({ input }) => input.query)).toEqual([
      'Mietrecht Deutschland',
      'German rental law',
    ]);
  });

  test('marks freshness for a Tavily news query', async () => {
    classification.freshnessRequired = true;

    await new WebResearchService(aiUsage).research(
      'organization-a',
      'Latest topic'
    );

    expect(clientFactoryCalls[0]).toMatchObject({
      provider: 'tavily',
      options: { freshnessRequired: true },
    });
  });

  test.each(['tavily', 'openrouter'])(
    'fails before constructing a client when search is disabled (stored provider %s)',
    async (storedProvider) => {
      aiConfig.search.provider = storedProvider;
      aiConfig.search.enabled = false;

      await expect(
        new WebResearchService(aiUsage).research('organization-a', 'topic')
      ).rejects.toBeInstanceOf(WebSearchNotConfigured);
      expect(clientFactoryCalls).toEqual([]);
    }
  );

  test('a missing Tavily key never spends the model key through fallback', async () => {
    aiConfig.search.apiKey = '';
    aiConfig.search.apiKeys = {};
    aiConfig.search.keySources = {};

    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'topic')
    ).rejects.toBeInstanceOf(WebSearchNotConfigured);
    expect(clientFactoryCalls).toEqual([]);
    expect(invocations).toEqual([]);
  });

  test('bounds an oversized subject and does not hand deadlines to tools', async () => {
    const wholePage = 'a'.repeat(40_000);

    await new WebResearchService(aiUsage).research('organization-a', wholePage);

    expect(classifierInputs[0].subject.length).toBeLessThanOrEqual(5_000);
    expect(wholePage.startsWith(classifierInputs[0].subject)).toBe(true);
    expect(invocations[0].config).toBeUndefined();
  });

  test.each([402, 403, 429, 500, 599])(
    'falls back to the other keyed engine for Tavily status %s',
    async (status) => {
      withExaReserve();
      implementations.tavily = async () => {
        throw statusError(status);
      };

      const result = await new WebResearchService(aiUsage).research(
        'organization-a',
        'topic'
      );

      expect(invocations.map(({ provider }) => provider)).toEqual([
        'tavily',
        'exa',
      ]);
      expect(result.provider).toBe('exa');
      expect(result.sources[0]).toMatchObject({ provider: 'exa' });
      expect(result.sources[0].title).toBe('Source for current topic');
      expect(logEntries).toContainEqual({
        level: 'log',
        message: 'Web research answered via exa.',
      });
      expect(
        logEntries.some(({ message }) => message.includes(String(status)))
      ).toBe(true);
    }
  );

  test('falls back when Tavily returns no results', async () => {
    withExaReserve();
    implementations.tavily = async () => ({
      answer: 'No sources',
      results: [],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    expect(invocations.map(({ provider }) => provider)).toEqual([
      'tavily',
      'exa',
    ]);
    expect(result.provider).toBe('exa');
  });

  test('without a second keyed engine a Tavily outage is the answer and OpenRouter is never asked (75xn.32)', async () => {
    implementations.tavily = async () => {
      throw statusError(503);
    };

    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'topic')
    ).rejects.toMatchObject({ status: 503 });
    expect(clientFactoryCalls.map(({ provider }) => provider)).toEqual([
      'tavily',
    ]);
  });

  test('the Tavily deadline fires and uses only the remaining fallback budget', async () => {
    jest.useFakeTimers();
    withExaReserve();
    implementations.tavily = () => new Promise(() => undefined);

    const research = new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );
    const completed = expect(research).resolves.toMatchObject({
      provider: 'exa',
    });

    await jest.advanceTimersByTimeAsync(WEB_SEARCH_PRIMARY_TIMEOUT_MS);
    await completed;
    expect(invocations.map(({ provider }) => provider)).toEqual([
      'tavily',
      'exa',
    ]);
    expect(WEB_SEARCH_PRIMARY_TIMEOUT_MS + WEB_SEARCH_FALLBACK_TIMEOUT_MS).toBe(
      WEB_SEARCH_TIMEOUT_MS
    );
  });

  test('falls back when Tavily reports its own transport timeout', async () => {
    withExaReserve();
    implementations.tavily = async () => {
      throw Object.assign(new Error('Tavily request timed out'), {
        code: 'ETIMEDOUT',
      });
    };

    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'topic')
    ).resolves.toMatchObject({ provider: 'exa' });
    expect(invocations.map(({ provider }) => provider)).toEqual([
      'tavily',
      'exa',
    ]);
  });

  test('does not pay for fallback when the error only mentions a three-digit number', async () => {
    withExaReserve();
    implementations.tavily = async () => {
      throw new Error('maxResults must be below 500');
    };

    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'topic')
    ).rejects.toThrow('maxResults must be below 500');
    expect(invocations.map(({ provider }) => provider)).toEqual(['tavily']);
  });

  test('keeps the Tavily error when the Exa fallback also fails', async () => {
    withExaReserve();
    const primaryError = statusError(429);
    const fallbackError = new Error('Exa unavailable');
    implementations.tavily = async () => {
      throw primaryError;
    };
    implementations.exa = async () => {
      throw fallbackError;
    };

    let caught;
    try {
      await new WebResearchService(aiUsage).research('organization-a', 'topic');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WebSearchFallbackError);
    expect(caught.errors).toEqual([primaryError, fallbackError]);
  });

  test('includes client construction in the primary deadline', async () => {
    jest.useFakeTimers();
    withExaReserve();
    factoryImplementations.tavily = (client) =>
      new Promise((resolve) =>
        setTimeout(() => resolve(client), WEB_SEARCH_PRIMARY_TIMEOUT_MS + 1)
      );

    const research = new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    await jest.advanceTimersByTimeAsync(WEB_SEARCH_PRIMARY_TIMEOUT_MS + 1);
    await expect(research).resolves.toMatchObject({ provider: 'exa' });
    expect(invocations.map(({ provider }) => provider)).toEqual(['exa']);
  });

  test('fires the deadline without fallback for an OpenAI organization', async () => {
    jest.useFakeTimers();
    aiConfig.provider = 'openai';
    implementations.tavily = () => new Promise(() => undefined);

    const research = new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );
    const rejected = expect(research).rejects.toThrow(
      `Web search did not answer within ${WEB_SEARCH_PRIMARY_TIMEOUT_MS}ms.`
    );

    await jest.advanceTimersByTimeAsync(WEB_SEARCH_PRIMARY_TIMEOUT_MS);
    await rejected;
    expect(clientFactoryCalls.map(({ provider }) => provider)).toEqual([
      'tavily',
    ]);
  });

  test('does not expose fallback to an organization on OpenAI', async () => {
    aiConfig.provider = 'openai';
    // Откат зависит от второго ПОИСКОВОГО ключа, а не от провайдера модели:
    // здесь его нет, и OpenRouter не подставляется ни под каким провайдером.
    implementations.tavily = async () => {
      throw statusError(429);
    };

    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'topic')
    ).rejects.toMatchObject({ status: 429 });
    expect(clientFactoryCalls.map(({ provider }) => provider)).toEqual([
      'tavily',
    ]);
  });

  test('does not fall back for a non-outage error or a quality judgment', async () => {
    implementations.tavily = async () => {
      throw statusError(400);
    };

    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'topic')
    ).rejects.toMatchObject({ status: 400 });
    expect(invocations.map(({ provider }) => provider)).toEqual(['tavily']);

    invocations.length = 0;
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Sparse but valid result',
          url: 'https://example.com/sparse',
        },
      ],
    });
    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'topic')
    ).resolves.toMatchObject({ provider: 'tavily', facts: [] });
    expect(invocations.map(({ provider }) => provider)).toEqual(['tavily']);
  });

  test('truncates raw text at a paragraph boundary per source', async () => {
    const firstParagraph = 'a'.repeat(3_900);
    const secondParagraph = 'b'.repeat(3_900);
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Large source',
          url: 'https://example.com/large',
          content: `${firstParagraph}\n\n${secondParagraph}\n\n${'c'.repeat(
            2_000
          )}`,
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    expect(result.facts[0].text).toBe(
      `${firstParagraph}\n\n${secondParagraph}`
    );
    expect(result.facts[0].text.length).toBeLessThanOrEqual(
      WEB_SEARCH_MAX_SOURCE_CHARS
    );
  });

  test('cuts a long first paragraph instead of discarding the source', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Long first paragraph',
          url: 'https://example.com/long-first-paragraph',
          content: `${'a'.repeat(10_000)}\n\nsecond paragraph`,
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].text).toBe('a'.repeat(WEB_SEARCH_MAX_SOURCE_CHARS));
  });

  test('accepts a paragraph boundary at the start of the source', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Leading separator',
          url: 'https://example.com/leading-separator',
          content: `\n\n${'a'.repeat(10_000)}`,
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    expect(result.facts).toEqual([]);
  });

  test('caps all source text across the complete research result', async () => {
    const content = [
      'a'.repeat(2_498),
      'b'.repeat(2_498),
      'c'.repeat(2_498),
      'TAIL'.repeat(700),
    ].join('\n\n');
    implementations.tavily = async () => ({
      results: Array.from({ length: 5 }, (_, index) => ({
        title: `Large source ${index}`,
        url: `https://example.com/large-${index}`,
        content,
      })),
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );
    const total = result.facts.reduce((sum, fact) => sum + fact.text.length, 0);

    expect(total).toBe(WEB_SEARCH_MAX_RESULT_CHARS);
    expect(result.facts).toHaveLength(5);
    expect(
      result.facts
        .slice(0, 4)
        .every(
          ({ text }) =>
            text ===
            ['a'.repeat(2_498), 'b'.repeat(2_498), 'c'.repeat(2_498)].join(
              '\n\n'
            )
        )
    ).toBe(true);
    expect(result.facts[4].text).toBe('a'.repeat(2_008));
    expect(result.facts.every(({ text }) => !text.includes('TAIL'))).toBe(true);
  });
  /**
   * `content-factory-next-fn33.134`: the excerpt has to be an assertion.
   * Tavily's `content` is the extract it chose for the query; its
   * `raw_content` is the whole page, and a page opens with its menu.
   */
  test('prefers the provider snippet over the whole page', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Central bank',
          url: 'https://example.com/rate',
          content:
            'Совет директоров сохранил ключевую ставку на уровне 14% годовых.',
          rawContent: [
            '[Skip to main content](https://example.com/rate#main)',
            '* [Главная](/)',
            '',
            'Совет директоров сохранил ключевую ставку на уровне 14% годовых. Заседание прошло 11 сентября.',
          ].join('\n'),
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ставка'
    );

    expect(result.facts).toEqual([
      {
        text: 'Совет директоров сохранил ключевую ставку на уровне 14% годовых.',
        sourceUrl: 'https://example.com/rate',
      },
    ]);
  });

  test('a one-line snippet that cites its source stays a claim (review P1-3)', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'ФАС',
          url: 'https://example.com/fas',
          content:
            'ФАС оштрафовала «Азбуку вкуса» на 300 000 ₽ за рекламу без пометки. Источник: https://fas.gov.ru/news/123',
        },
        {
          title: 'ЕРИР',
          url: 'https://example.com/erir',
          content:
            'По данным [ЕРИР](/erir), в 2026 году зарегистрировано 12 млн креативов — Москва / РИА Новости.',
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'маркировка'
    );

    expect(result.facts.map((fact) => fact.text)).toEqual([
      'ФАС оштрафовала «Азбуку вкуса» на 300 000 ₽ за рекламу без пометки. Источник:',
      'По данным ЕРИР, в 2026 году зарегистрировано 12 млн креативов — Москва / РИА Новости.',
    ]);
  });

  test('cleans the page of navigation when the provider sent no snippet', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Central bank',
          url: 'https://example.com/rate',
          rawContent: [
            '[Skip to main content](https://example.com/rate#main)',
            '* [Главная](/)',
            '* [Архив](/archive)',
            '![cbr](https://example.com/common/images/logo.svg)',
            'Image: Image 2: cbr',
            '',
            'Совет директоров Банка России сохранил ключевую ставку на уровне 14% годовых. Решение объясняется устойчивым инфляционным давлением.',
            '',
            '* [Контакты](/contacts)',
            '© Банк России',
          ].join('\n'),
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ставка'
    );

    expect(result.facts).toEqual([
      {
        text: 'Совет директоров Банка России сохранил ключевую ставку на уровне 14% годовых. Решение объясняется устойчивым инфляционным давлением.',
        sourceUrl: 'https://example.com/rate',
      },
    ]);
  });

  test('a page that is only a menu stays a source and is never offered as a claim', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Global Investigations Review',
          url: 'https://example.com/menu',
          content: '[Skip to main content](https://example.com/menu#main)',
          rawContent: [
            '* [GIR Alerts](/account/register)',
            '* [Magazine](/Magazine)',
            '* [Archive](/archive)',
            '![Image 2](blob:http://localhost/8f0e-ad)',
            'Report Ad',
          ].join('\n'),
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    expect(result.facts).toEqual([]);
    expect(result.sources).toEqual([
      {
        url: 'https://example.com/menu',
        title: 'Global Investigations Review',
        publishedAt: null,
        provider: 'tavily',
      },
    ]);
  });

  test('a menu that lost its markup is still a menu', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Global Investigations Review',
          url: 'https://example.com/flat-menu',
          rawContent:
            '* GIR Alerts /account/register * Magazine /Magazine * [Archive](/archive)',
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    expect(result.facts).toEqual([]);
    expect(result.sources).toHaveLength(1);
  });

  test('a page label is too short to stand as an excerpt', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'Overview',
          url: 'https://example.com/label',
          rawContent: 'Overview',
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    expect(result.facts).toEqual([]);
    expect(result.sources).toHaveLength(1);
  });

  /**
   * `content-factory-next-fn33.132`: the same OFSI page came back twice, once
   * over `http` and once over `https`, and the panel showed two rows for one
   * address. Keeping only `https` collapses the pair and refuses the addresses
   * a server-side fetch must never follow.
   */
  test('keeps https names only and collapses an http twin onto its https address', async () => {
    implementations.tavily = async () => ({
      results: [
        {
          title: 'OFSI penalty (plain)',
          url: 'http://example.com/ofsi',
          content: 'The Treasury imposed a penalty for a sanctions breach.',
        },
        {
          title: 'OFSI penalty',
          url: 'https://example.com/ofsi',
          content: 'The Treasury imposed a penalty for a sanctions breach.',
        },
        {
          title: 'Metadata service',
          url: 'https://169.254.169.254/latest/meta-data',
          content: 'The Treasury imposed a penalty for a sanctions breach.',
        },
        {
          title: 'Odd port',
          url: 'https://example.com:8443/ofsi',
          content: 'The Treasury imposed a penalty for a sanctions breach.',
        },
        {
          title: 'Not a name',
          url: 'https://localhost/ofsi',
          content: 'The Treasury imposed a penalty for a sanctions breach.',
        },
      ],
    });

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    expect(result.sources).toEqual([
      {
        url: 'https://example.com/ofsi',
        title: 'OFSI penalty',
        publishedAt: null,
        provider: 'tavily',
      },
    ]);
    expect(result.facts).toEqual([
      {
        text: 'The Treasury imposed a penalty for a sanctions breach.',
        sourceUrl: 'https://example.com/ofsi',
      },
    ]);
  });

  /**
   * Бесключевая полоса Wikipedia/Wikidata (`content-factory-next-m0iy.8`).
   *
   * Ответы записаны: `fetchImpl` передаётся через тот же шов, который в
   * приложении не зарегистрирован, поэтому сеть здесь не трогается и DNS не
   * выполняется.
   */
  const encyclopedicRecording = (calls) => async (url) => {
    const address = String(url);
    calls.push(address);
    if (address.includes('/w/rest.php/v1/search/page')) {
      return {
        ok: true,
        async json() {
          return {
            pages: [
              {
                key: 'Ada_Lovelace',
                title: 'Ada Lovelace',
                description: 'mathematician',
              },
            ],
          };
        },
      };
    }
    if (address.includes('/api/rest_v1/page/summary/')) {
      return {
        ok: true,
        async json() {
          return {
            type: 'standard',
            title: 'Ada Lovelace',
            extract: 'Ada Lovelace was an English mathematician.',
            content_urls: {
              desktop: { page: 'https://en.wikipedia.org/wiki/Ada_Lovelace' },
            },
          };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return {
          search: [
            {
              id: 'Q7259',
              label: 'Ada Lovelace',
              description: 'mathematician',
            },
          ],
        };
      },
    };
  };

  test('an explicit level adds keyless encyclopedic sources and a citable fact', async () => {
    const calls = [];
    const result = await new WebResearchService(aiUsage, undefined, {
      fetchImpl: encyclopedicRecording(calls),
    }).research('organization-a', 'Ada Lovelace', { level: 'quick' });

    expect(calls).toEqual([
      'https://en.wikipedia.org/w/rest.php/v1/search/page?q=current%20topic&limit=1',
      'https://en.wikipedia.org/api/rest_v1/page/summary/Ada_Lovelace',
      'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=current%20topic&language=en&format=json&limit=1',
    ]);
    // Провайдер отвечает первым, полоса идёт следом; с 13.09 за ней держатся
    // два места из потолка (`75xn.22`), и статья несёт свой текст (`75xn.29`).
    expect(result.sources).toEqual([
      {
        url: 'https://example.com/tavily/current%20topic',
        title: 'Source for current topic',
        publishedAt: '2026-08-12',
        provider: 'tavily',
      },
      {
        url: 'https://en.wikipedia.org/wiki/Ada_Lovelace',
        title: 'Ada Lovelace',
        publishedAt: null,
        provider: 'wikipedia',
        text: 'Ada Lovelace was an English mathematician.',
      },
      {
        url: 'https://www.wikidata.org/wiki/Q7259',
        title: 'Ada Lovelace',
        publishedAt: null,
        provider: 'wikidata',
      },
    ]);
    expect(result.facts).toEqual([
      {
        text: 'Fact for current topic',
        sourceUrl: 'https://example.com/tavily/current%20topic',
      },
      {
        text: 'Ada Lovelace was an English mathematician.',
        sourceUrl: 'https://en.wikipedia.org/wiki/Ada_Lovelace',
      },
    ]);
  });

  test('a call without a level never opens the encyclopedic lane', async () => {
    const calls = [];
    const result = await new WebResearchService(aiUsage, undefined, {
      fetchImpl: encyclopedicRecording(calls),
    }).research('organization-a', 'Ada Lovelace without a level');

    expect(calls).toEqual([]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].provider).toBe('tavily');
  });

  test('a failing encyclopedic lane leaves the provider answer untouched', async () => {
    const result = await new WebResearchService(aiUsage, undefined, {
      fetchImpl: async () => {
        throw new Error('wikipedia is unreachable');
      },
    }).research('organization-a', 'Ada Lovelace with a broken lane', {
      level: 'quick',
    });

    expect(result.sources).toEqual([
      {
        url: 'https://example.com/tavily/current%20topic',
        title: 'Source for current topic',
        publishedAt: '2026-08-12',
        provider: 'tavily',
      },
    ]);
    expect(result.facts).toEqual([
      {
        text: 'Fact for current topic',
        sourceUrl: 'https://example.com/tavily/current%20topic',
      },
    ]);
    expect(
      logEntries.some(
        ({ level, message }) =>
          level === 'warn' && /Wikidata lookup failed/.test(message)
      )
    ).toBe(true);
  });
});
