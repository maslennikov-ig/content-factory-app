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
      subjectLanguage: 'en',
      englishQuery: 'current topic',
      subjectLanguageQuery: null,
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

  /**
   * `content-factory-next-fn33.132`: Tavily has no language parameter — the
   * language of a query is the language of its words — so a Russian subject
   * that the classifier does not call «local» must still be asked in Russian,
   * and the Russian query goes first because both queries share one excerpt
   * budget.
   */
  test('asks in the subject language and boosts the country without a local classification', async () => {
    classification = {
      subjectLanguage: 'ru',
      englishQuery: 'Telegram advertising labelling rules 2026',
      subjectLanguageQuery: 'маркировка рекламы в Telegram ЕРИР штрафы 2026',
      freshnessRequired: false,
    };

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'Что изменилось в правилах маркировки рекламы в Telegram-каналах?'
    );

    expect(clientFactoryCalls[0]).toMatchObject({
      provider: 'tavily',
      options: { country: 'russia', freshnessRequired: false },
    });
    expect(invocations.map(({ input }) => input.query)).toEqual([
      'маркировка рекламы в Telegram ЕРИР штрафы 2026',
      'Telegram advertising labelling rules 2026',
    ]);
    expect(result.facts).toHaveLength(2);
  });

  test('one failed query does not throw away the other answer (ec48.3)', async () => {
    classification = {
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
          level === 'warn' && /One of 2 web research queries failed/.test(message)
      )
    ).toBe(true);
  });

  test('when every query fails, the first failure is the answer (ec48.3)', async () => {
    classification = {
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
          content: 'Банк России сохранил ставку 14% годовых. Следующее заседание 11 сентября.',
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
});
