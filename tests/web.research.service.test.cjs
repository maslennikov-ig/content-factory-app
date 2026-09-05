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
const aiUsage = {
  executeAiOperation: async (_organizationId, _operation, callback) =>
    callback(),
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
        Logger,
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        requireActiveAiConfig: async () => aiConfig,
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
        AiUsageService: class {},
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

describe('shared web research service', () => {
  beforeEach(() => {
    classifierInputs.length = 0;
    clientFactoryCalls.length = 0;
    invocations.length = 0;
    logEntries.length = 0;
    classification = {
      scope: 'international',
      subjectLanguage: 'en',
      englishQuery: 'current topic',
      localQuery: null,
      freshnessRequired: false,
    };
    aiConfig = {
      provider: 'openrouter',
      apiKey: 'tenant-model-key',
      search: {
        enabled: true,
        provider: 'tavily',
        apiKey: 'tenant-search-key',
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

  test('uses Tavily as primary and records the answering provider', async () => {
    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'Current topic'
    );

    expect(clientFactoryCalls).toEqual([
      {
        organizationId: 'organization-a',
        provider: 'tavily',
        options: { country: undefined, freshnessRequired: false },
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

  test('derives the Tavily country from a local Russian classification', async () => {
    classification = {
      scope: 'local',
      subjectLanguage: 'ru',
      englishQuery: 'Moscow transport changes',
      localQuery: 'изменения транспорта Москвы',
      freshnessRequired: false,
    };

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'Что изменилось в транспорте Москвы?'
    );

    expect(clientFactoryCalls[0]).toMatchObject({
      provider: 'tavily',
      options: { country: 'russia', freshnessRequired: false },
    });
    expect(invocations.map(({ input }) => input.query)).toEqual([
      'Moscow transport changes',
      'изменения транспорта Москвы',
    ]);
    expect(result.facts).toHaveLength(2);
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
    'falls back to OpenRouter for Tavily status %s',
    async (status) => {
      implementations.tavily = async () => {
        throw statusError(status);
      };

      const result = await new WebResearchService(aiUsage).research(
        'organization-a',
        'topic'
      );

      expect(invocations.map(({ provider }) => provider)).toEqual([
        'tavily',
        'openrouter',
      ]);
      expect(result.provider).toBe('openrouter');
      expect(result.sources[0]).toMatchObject({ provider: 'openrouter' });
      expect(result.sources[0].title).toBe('Source for current topic');
      expect(logEntries).toContainEqual({
        level: 'log',
        message: 'Web research answered via openrouter.',
      });
      expect(
        logEntries.some(({ message }) => message.includes(String(status)))
      ).toBe(true);
    }
  );

  test('falls back when Tavily returns no results', async () => {
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
      'openrouter',
    ]);
    expect(result.provider).toBe('openrouter');
  });

  test('the Tavily deadline fires and uses only the remaining fallback budget', async () => {
    jest.useFakeTimers();
    implementations.tavily = () => new Promise(() => undefined);

    const research = new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );
    const completed = expect(research).resolves.toMatchObject({
      provider: 'openrouter',
    });

    await jest.advanceTimersByTimeAsync(WEB_SEARCH_PRIMARY_TIMEOUT_MS);
    await completed;
    expect(invocations.map(({ provider }) => provider)).toEqual([
      'tavily',
      'openrouter',
    ]);
    expect(WEB_SEARCH_PRIMARY_TIMEOUT_MS + WEB_SEARCH_FALLBACK_TIMEOUT_MS).toBe(
      WEB_SEARCH_TIMEOUT_MS
    );
  });

  test('falls back when Tavily reports its own transport timeout', async () => {
    implementations.tavily = async () => {
      throw Object.assign(new Error('Tavily request timed out'), {
        code: 'ETIMEDOUT',
      });
    };

    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'topic')
    ).resolves.toMatchObject({ provider: 'openrouter' });
    expect(invocations.map(({ provider }) => provider)).toEqual([
      'tavily',
      'openrouter',
    ]);
  });

  test('does not pay for fallback when the error only mentions a three-digit number', async () => {
    implementations.tavily = async () => {
      throw new Error('maxResults must be below 500');
    };

    await expect(
      new WebResearchService(aiUsage).research('organization-a', 'topic')
    ).rejects.toThrow('maxResults must be below 500');
    expect(invocations.map(({ provider }) => provider)).toEqual(['tavily']);
  });

  test('keeps the Tavily error when the OpenRouter fallback also fails', async () => {
    const primaryError = statusError(429);
    const fallbackError = new Error('OpenRouter unavailable');
    implementations.tavily = async () => {
      throw primaryError;
    };
    implementations.openrouter = async () => {
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
    factoryImplementations.tavily = (client) =>
      new Promise((resolve) =>
        setTimeout(() => resolve(client), WEB_SEARCH_PRIMARY_TIMEOUT_MS + 1)
      );

    const research = new WebResearchService(aiUsage).research(
      'organization-a',
      'topic'
    );

    await jest.advanceTimersByTimeAsync(WEB_SEARCH_PRIMARY_TIMEOUT_MS + 1);
    await expect(research).resolves.toMatchObject({ provider: 'openrouter' });
    expect(invocations.map(({ provider }) => provider)).toEqual(['openrouter']);
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
});
