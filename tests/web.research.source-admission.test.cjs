'use strict';

// Public result-only recordings, not a live-provider or model-quality proof.
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { createFakeRedis } = require('./helpers/fake-redis.cjs');
const telegram = require('./fixtures/recorded-search/telegram-labeling-2026-10-01.json');
const cloud = require('./fixtures/recorded-search/1c-cloud-2026-10-01.json');
const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');

let aiConfig;
let classification;
let responses;
let summaryOutput;
let summaryError;
const calls = {
  search: [],
  model: [],
  prompts: [],
  rows: [],
  modelLedgers: [],
};

const aiUsage = {
  beginAiOperationWithConfig: async (_organizationId, operation, config) => {
    const ledger = new chain.TextUsageLedger();
    const row = { operation, usageMode: config.usageMode, ledger };
    calls.rows.push(row);
    return {
      run: (callback) => chain.runWithUsageLedger(ledger, callback),
      track: (callback) => chain.runWithUsageLedger(ledger, callback),
      finish: async (succeeded) => {
        row.succeeded = succeeded;
        row.columns = ledger.columns();
      },
    };
  },
};

const { WebResearchService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/web.research.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Optional: () => () => {},
      Inject: () => () => {},
      Logger: class {
        log() {}
        warn() {}
        debug() {}
      },
    },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      getActiveAiConfig: () => aiConfig,
      loadAiConfig: async () => aiConfig,
      requireActiveAiConfig: async () => aiConfig,
      withActiveAiConfig: (_organizationId, _config, callback) => callback(),
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      AiUsageService: class {},
    },
    '@contentfactory/nestjs-libraries/openai/ai.text-chain': chain,
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: createFakeRedis(),
    },
    '@contentfactory/nestjs-libraries/content-intelligence/leads/lead-discovery-judge':
      {
        judgeDiscoveryRows: async () => new Map(),
      },
    '@contentfactory/nestjs-libraries/content-intelligence/research/encyclopedic-reference':
      {
        lookupEncyclopedicReferences: async () => [],
        lookupWikidataReferences: async () => [],
        fetchEncyclopedicExtract: async () => {
          throw new Error('No encyclopedic network in this fixture');
        },
      },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      WEB_SEARCH_PRIMARY_TIMEOUT_MS: 12_000,
      WEB_SEARCH_FALLBACK_TIMEOUT_MS: 8_000,
      WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
      WEB_SEARCH_MAX_RESULT_CHARS: 32_000,
      getChatModel: async (organizationId, temperature, maxTokens, role) => {
        calls.model.push({ organizationId, temperature, maxTokens, role });
        return { withStructuredOutput: () => ({}) };
      },
      getWebSearchClient: async (_organizationId, provider) => ({
        invoke: async (input) => {
          calls.search.push({ provider, input });
          const response = responses[provider];
          if (response instanceof Error) throw response;
          return typeof response === 'function' ? response(input) : response;
        },
      }),
    },
    '@langchain/core/prompts': {
      ChatPromptTemplate: {
        fromTemplate: (template) => ({
          pipe: () => ({
            invoke: async (input) => {
              calls.prompts.push({ template, input });
              const isClassifier = template.includes(
                'Classify the research subject'
              );
              const ledger = chain.currentUsageLedger();
              calls.modelLedgers.push(ledger);
              ledger?.record({
                attempt: 1,
                model: 'fixture-classify-model',
                promptTokens: isClassifier ? 120 : 80,
                completionTokens: isClassifier ? 30 : 25,
                costUsd: isClassifier ? 0.0002 : 0.0001,
              });
              if (isClassifier) return classification;
              if (summaryError) throw summaryError;
              return summaryOutput;
            },
          }),
        }),
      },
    },
  }
);

const snippets = (fixture) => ({
  answer: fixture.answer,
  usage: { credits: 2 },
  results: fixture.sources.map((source) => ({
    title: source.title,
    url: source.url,
    content: source.excerpt,
    published_date: source.publishedAt,
  })),
});

// Exa emits rawContent and usage, with no invented top-level answer.
const exaPages = () => ({
  usage: { costUsd: 0.007 },
  results: cloud.sources.map((source) => ({
    title: source.title,
    url: source.url,
    rawContent: source.excerpt,
    publishedAt: source.publishedAt,
  })),
});

const summaryPrompts = () =>
  calls.prompts.filter(
    ({ template }) => !template.includes('Classify the research subject')
  );
const search = (
  subject = telegram.subject,
  options = { language: 'ru', readerResponse: true }
) =>
  new WebResearchService(aiUsage).research(
    'fixture-organization',
    subject,
    options
  );
const expectedSources = (fixture) =>
  fixture.sources.map((source) => ({
    url: source.url,
    title: source.title,
    publishedAt: source.publishedAt,
    provider: fixture.provider,
  }));

beforeEach(() => {
  for (const values of Object.values(calls)) values.length = 0;
  classification = {
    scope: 'local',
    subjectLanguage: 'ru',
    englishQuery: 'Telegram advertising labeling regulation 2026',
    subjectLanguageQuery: 'Маркировка рекламы Telegram ЕРИР 2026 штрафы',
    freshnessRequired: true,
  };
  aiConfig = {
    usageMode: 'included',
    provider: 'openrouter',
    apiKey: 'fixture-model-key',
    search: {
      enabled: true,
      provider: 'tavily',
      apiKey: 'fixture-search-key',
      apiKeys: { tavily: 'fixture-search-key', exa: 'fixture-exa-key' },
      keySources: { tavily: 'system', exa: 'system' },
      topic: 'general',
      depth: 'advanced',
    },
  };
  responses = { tavily: snippets(telegram), exa: exaPages() };
  summaryError = undefined;
  summaryOutput = {
    summary:
      'Для переезда 1С в облако проверьте перенос базы, лицензии и стоимость.',
  };
});

describe('Russian advertising-labeling reader admission', () => {
  test('recorded five candidates retain all provenance but only two article-context facts', async () => {
    const baseline = await search(telegram.subject, {
      language: 'ru',
      readerResponse: true,
      queries: ['literal fixture query'],
    });
    expect(baseline.facts).toHaveLength(5);
    for (const values of Object.values(calls)) values.length = 0;

    const result = await search();

    expect(result.sources).toEqual(expectedSources(telegram));
    expect(result.sources).toEqual(baseline.sources);
    expect(result.facts).toEqual([baseline.facts[0], baseline.facts[3]]);
    expect(calls.search).toHaveLength(1);
    expect(calls.search[0].input.query).toBe(
      classification.subjectLanguageQuery
    );
    expect(calls.model.map(({ role }) => role)).toEqual(['classify']);
    expect(calls.rows).toHaveLength(1);
    expect(calls.rows[0]).toMatchObject({
      operation: 'web_research',
      succeeded: true,
    });
    expect(summaryPrompts()).toHaveLength(0);
    expect(result.summary).toBe(telegram.answer);
  });

  test.each([
    [
      'generic FAQ main prose',
      'Частые вопросы',
      '/faq',
      'При размещении интернет-рекламы рекламодатель обязан передать сведения о креативе в ЕРИР через оператора рекламных данных. Перед публикацией рекламы необходимо получить идентификатор ERID и добавить его вместе с пометкой «реклама». За непереданные сведения предусмотрена ответственность по КоАП.',
      true,
    ],
    [
      'advertising-law title with a short excerpt',
      'Что требует закон о маркировке рекламы',
      '/notes/12',
      'Креативу присваивается идентификатор ERID.',
      true,
    ],
    [
      'semantic transliterated article path',
      'Памятка для бизнеса',
      '/articles/markirovka-reklamy-v-internete',
      'Креативу присваивается идентификатор ERID.',
      true,
    ],
    [
      'semantic encoded article path',
      'Памятка',
      '/articles/%D0%BC%D0%B0%D1%80%D0%BA%D0%B8%D1%80%D0%BE%D0%B2%D0%BA%D0%B0-%D1%80%D0%B5%D0%BA%D0%BB%D0%B0%D0%BC%D1%8B',
      'Передайте сведения через ОРД.',
      true,
    ],
    [
      'commodity labeling',
      'Маркировка товаров: новые правила',
      '/catalog/codes',
      'Честный ЗНАК: обязательная маркировка товаров и сертификация. Оформим документы под ключ. Реклама наших услуг.',
      false,
    ],
    [
      'unrelated news list',
      'Новости: НДС, погода и маркировка',
      '/news/digest',
      'Принят новый закон о маркировке товаров. Изменилась ставка НДС. Реклама: маркировка рекламы под ключ, ЕРИР и ОРД без штрафов.',
      false,
    ],
    [
      'fishing prose with an embedded advertisement',
      'Прогноз клёва и рыбалка',
      '/fishing/forecast',
      'На реке рыба хорошо клюёт утром. Маркировка рекламы под ключ: ОРД, ЕРИР, ERID. По закону, без штрафов, без VPN. Подпишитесь на Telegram-канал.',
      false,
    ],
    [
      'query keywords are not article identity',
      'Погода на выходные',
      '/forecast?topic=markirovka-reklamy#reklamnoe-pravo',
      'Ожидается тёплая погода. Маркировка рекламы под ключ: ЕРИР, ERID.',
      false,
    ],
    [
      'regulator acronym keyword stuffing',
      'Справочник',
      '/reference',
      'Маркировка рекламы ЕРИР ОРД ERID закон штрафы. Маркировка рекламы без штрафов под ключ.',
      false,
    ],
  ])('%s', async (_name, title, pathname, content, admitted) => {
    const url = `https://arbitrary-source.example${pathname}`;
    responses.tavily = {
      answer: 'Русский ответ движка.',
      results: [
        { title, url, content, score: 0.71, published_date: '2026-09-30' },
      ],
    };
    const result = await search();
    expect(result.sources).toEqual([
      {
        url,
        title,
        score: 0.71,
        publishedAt: '2026-09-30',
        provider: 'tavily',
      },
    ]);
    expect(result.facts).toEqual(
      admitted ? [{ text: content, sourceUrl: url }] : []
    );
    expect(calls.search).toHaveLength(1);
    expect(calls.model).toHaveLength(1);
  });

  test.each([
    [
      'other Russian topic',
      'Маркировка товаров Честный ЗНАК и сертификация',
      { language: 'ru', readerResponse: true },
    ],
    [
      'English original subject',
      'Advertising labeling rules for Telegram channels in 2026',
      { language: 'ru', readerResponse: true },
    ],
    [
      'supplied fact-check queries',
      telegram.subject,
      { language: 'ru', readerResponse: true, queries: ['advertising laws'] },
    ],
    [
      'reader marker without language',
      telegram.subject,
      { readerResponse: true },
    ],
    [
      'automatic generator language-only options',
      telegram.subject,
      { language: 'ru' },
    ],
    [
      'intake language/level options',
      telegram.subject,
      { language: 'ru', level: 'standard' },
    ],
    [
      'false reader marker',
      telegram.subject,
      { language: 'ru', readerResponse: false },
    ],
    [
      'discovery judge owns discovery eligibility',
      telegram.subject,
      { language: 'ru', readerResponse: true, task: 'discovery' },
    ],
  ])('%s preserves the former five facts', async (_name, subject, options) => {
    // A one-engine workspace legitimately routes explicit intake research to
    // Tavily; the keyless ports above are offline in this entire suite.
    if (options.level) delete aiConfig.search.apiKeys.exa;
    const result = await search(subject, options);
    expect(result.facts).toHaveLength(5);
    expect(result.sources).toEqual(expectedSources(telegram));
    expect(calls.search).toHaveLength(1);
  });

  test('article context beyond the bounded excerpt does not promote an unknown source', async () => {
    responses.tavily = {
      answer: 'Русский ответ.',
      results: [
        {
          title: 'Справочник',
          url: 'https://arbitrary-source.example/reference',
          content:
            'Нейтральный справочный текст. '.repeat(400) +
            'Для маркировки интернет-рекламы рекламодатель обязан передать данные в ЕРИР и получить ERID перед публикацией рекламы.',
        },
      ],
    };
    const result = await search();
    expect(result.sources).toHaveLength(1);
    expect(result.facts).toEqual([]);
  });
});

describe('source-only reader summary and spend', () => {
  const useExa = () => {
    aiConfig.search.provider = 'exa';
    aiConfig.search.apiKey = 'fixture-exa-key';
    aiConfig.search.taskProviders = { facts: 'exa', discovery: 'exa' };
    classification.subjectLanguageQuery =
      'Переезд 1С в облако стоимость лицензии';
    classification.englishQuery = '1C cloud migration cost licenses';
  };

  test('recorded five Exa sources produce one bounded accounted summary, retaining facts', async () => {
    useExa();
    const baseline = await search(cloud.subject, {
      language: 'ru',
      readerResponse: true,
      queries: ['1С в облако'],
    });
    expect(baseline.summary).toBe('');
    expect(baseline.facts).toHaveLength(5);
    for (const values of Object.values(calls)) values.length = 0;

    const result = await search(cloud.subject);

    expect(result.summary).toBe(summaryOutput.summary);
    expect(result.provider).toBe('exa');
    expect(result.sources).toEqual(expectedSources(cloud));
    expect(result.sources).toEqual(baseline.sources);
    expect(result.facts).toEqual(baseline.facts);
    expect(calls.search.map(({ provider }) => provider)).toEqual(['exa']);
    expect(calls.model.map(({ role }) => role)).toEqual([
      'classify',
      'classify',
    ]);
    expect(calls.model[1].maxTokens).toBe(1_200);
    expect(summaryPrompts()).toHaveLength(1);
    const { input, template } = summaryPrompts()[0];
    const evidence = JSON.parse(input.evidence);
    expect(input.language).toBe('Russian');
    expect(evidence.answers).toEqual([]);
    expect(evidence.sources).toHaveLength(5);
    expect(
      evidence.sources.every(
        ({ excerpt }) => excerpt.length > 0 && excerpt.length <= 1_000
      )
    ).toBe(true);
    expect(input.evidence.length).toBeLessThan(30_000);
    expect(template).toMatch(/untrusted/i);
    expect(calls.rows).toHaveLength(1);
    expect(calls.rows[0]).toMatchObject({
      operation: 'web_research',
      usageMode: 'included',
      succeeded: true,
    });
    expect(calls.modelLedgers).toEqual([
      calls.rows[0].ledger,
      calls.rows[0].ledger,
    ]);
    expect(calls.rows[0].columns).toMatchObject({
      promptTokens: 200,
      completionTokens: 55,
      serviceTier: 'search exa requests=1',
    });
    expect(calls.rows[0].columns.costUsd).toBeCloseTo(0.0073, 10);
  });

  test.each([
    ['empty output', { summary: '   ' }, undefined],
    ['malformed output', { summary: 123 }, undefined],
    ['unavailable model', undefined, new Error('fixture model unavailable')],
  ])(
    '%s keeps an empty fallback and all five results without retry',
    async (_name, output, error) => {
      useExa();
      summaryOutput = output;
      summaryError = error;
      const result = await search(cloud.subject);
      expect(result.summary).toBe('');
      expect(result.sources).toEqual(expectedSources(cloud));
      expect(result.facts).toHaveLength(5);
      expect(summaryPrompts()).toHaveLength(1);
      expect(calls.model).toHaveLength(2);
      expect(calls.search).toHaveLength(1);
      expect(calls.rows[0].succeeded).toBe(true);
    }
  );

  test('discovery-only findings do not buy a summary without citable facts', async () => {
    useExa();
    responses.exa = {
      results: [{ title: 'Only links', url: 'https://example.com/no-excerpt' }],
    };
    const result = await search(cloud.subject);
    expect(result.summary).toBe('');
    expect(result.sources).toHaveLength(1);
    expect(result.facts).toEqual([]);
    expect(summaryPrompts()).toHaveLength(0);
    expect(calls.model).toHaveLength(1);
    expect(calls.search).toHaveLength(1);
  });

  test('uncitable candidates cannot exhaust the source-only grounding cap', async () => {
    useExa();
    responses.exa = {
      results: [
        ...Array.from({ length: 8 }, (_, index) => ({
          title: `Finding ${index}`,
          url: `https://example.com/finding-${index}`,
        })),
        {
          title: 'Перенос 1С',
          url: 'https://example.com/citable-cloud',
          rawContent:
            'Перед переносом базы 1С в облако проверьте поддержку расширений и интеграций. Лицензии и обновления входят в договор только при явно согласованных условиях.',
        },
      ],
    };
    const result = await search(cloud.subject);
    expect(result.sources).toHaveLength(9);
    expect(result.facts).toHaveLength(1);
    const evidence = JSON.parse(summaryPrompts()[0].input.evidence);
    expect(evidence.sources).toHaveLength(1);
    expect(evidence.sources[0].url).toBe(result.facts[0].sourceUrl);
    expect(evidence.sources[0].excerpt).toBe(result.facts[0].text);
    expect(calls.search).toHaveLength(1);
    expect(calls.model).toHaveLength(2);
  });

  test.each([
    [
      'supplied queries',
      { language: 'ru', readerResponse: true, queries: ['1С в облако'] },
      0,
    ],
    ['reader marker without language', { readerResponse: true }, 1],
    ['automatic generator language-only options', { language: 'ru' }, 1],
    ['intake language/level options', { language: 'ru', level: 'standard' }, 1],
    ['false reader marker', { language: 'ru', readerResponse: false }, 1],
    [
      'discovery even with a reader marker',
      { language: 'ru', readerResponse: true, task: 'discovery' },
      1,
    ],
  ])(
    '%s keeps the source-only no-summary path',
    async (_name, options, expectedModels) => {
      useExa();
      const result = await search(cloud.subject, options);
      expect(result.summary).toBe('');
      expect(result.sources.map(({ text, ...source }) => source)).toEqual(
        expectedSources(cloud)
      );
      expect(result.facts).toHaveLength(5);
      expect(summaryPrompts()).toHaveLength(0);
      expect(calls.model).toHaveLength(expectedModels);
      expect(calls.search).toHaveLength(1);
      expect(calls.rows[0].columns.costUsd).toBeCloseTo(
        expectedModels ? 0.0072 : 0.007,
        10
      );
    }
  );

  test('Tavily failure and possible billing remain beside Exa spend and both cheap calls', async () => {
    // Exercise the service's real deadline class, rather than pretending that
    // a known HTTP refusal has the same billing uncertainty as abandonment.
    jest.useFakeTimers();
    responses.tavily = () => new Promise(() => {});
    let result;
    try {
      const pending = search(cloud.subject);
      await jest.advanceTimersByTimeAsync(12_001);
      result = await pending;
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
    expect(result.summary).toBe(summaryOutput.summary);
    expect(result.sources).toEqual(expectedSources(cloud));
    expect(calls.search.map(({ provider }) => provider)).toEqual([
      'tavily',
      'exa',
    ]);
    expect(calls.model).toHaveLength(2);
    expect(summaryPrompts()).toHaveLength(1);
    expect(calls.rows).toHaveLength(1);
    expect(calls.rows[0].columns).toMatchObject({
      possiblyBilled: true,
      serviceTier: 'search tavily requests=1 failed=1; exa requests=1',
      promptTokens: 200,
      completionTokens: 55,
    });
    expect(calls.rows[0].columns.costUsd).toBeCloseTo(0.0073, 10);
    expect(calls.rows[0].succeeded).toBe(true);
  });

  test('an English reader receives one source-only synthesis in the requested language', async () => {
    useExa();
    summaryOutput = {
      summary: 'Check licenses, migration and cloud hosting costs for 1C.',
    };
    const result = await search(cloud.subject, {
      language: 'en',
      readerResponse: true,
    });
    expect(result.summary).toBe(summaryOutput.summary);
    expect(summaryPrompts()[0].input.language).toBe('English');
    expect(calls.model).toHaveLength(2);
    expect(calls.search).toHaveLength(1);
  });

  test('own Exa search and included model synthesis keep distinct credential ledgers', async () => {
    useExa();
    aiConfig.search.keySources.exa = 'own';
    const generationLedger = new chain.TextUsageLedger();
    await chain.runWithUsageLedger(generationLedger, () =>
      search(cloud.subject)
    );
    expect(calls.rows).toHaveLength(1);
    expect(calls.rows[0]).toMatchObject({
      usageMode: 'workspace_key',
      succeeded: true,
    });
    expect(calls.rows[0].columns).toEqual({
      model: 'exa',
      serviceTier: 'search exa requests=1',
      costUsd: 0.007,
    });
    expect(calls.modelLedgers).toEqual([generationLedger, generationLedger]);
    expect(generationLedger.columns()).toMatchObject({
      promptTokens: 200,
      completionTokens: 55,
    });
    expect(generationLedger.columns().costUsd).toBeCloseTo(0.0003, 10);
  });
});

describe('reader and consumer cache identities', () => {
  test.each(['reader first', 'automatic first'])(
    '%s keeps distinct admission results and reuses each own cache entry',
    async (order) => {
      const service = new WebResearchService(aiUsage);
      const readerOptions = { language: 'ru', readerResponse: true };
      const consumerOptions = { language: 'ru' };
      const options =
        order === 'reader first'
          ? [readerOptions, consumerOptions]
          : [consumerOptions, readerOptions];
      const results = [];
      for (const option of options) {
        results.push(
          await service.research(
            'fixture-organization',
            telegram.subject,
            option
          )
        );
      }
      const readerIndex = order === 'reader first' ? 0 : 1;
      expect(results[readerIndex].facts).toHaveLength(2);
      expect(results[1 - readerIndex].facts).toHaveLength(5);
      expect(results.every(({ sources }) => sources.length === 5)).toBe(true);
      expect(calls.search).toHaveLength(2);
      for (const option of options) {
        const cached = await service.research(
          'fixture-organization',
          telegram.subject,
          option
        );
        expect(cached.fromCache).toBe(true);
        expect(cached.facts).toHaveLength(option.readerResponse ? 2 : 5);
      }
      expect(calls.search).toHaveLength(2);
      expect(calls.model).toHaveLength(2);
    }
  );
});
