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

const researchModule = loadTypeScriptModule(
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
              if (input.reviewRequest && !summaryOutput?.sources)
                return require('./helpers/reader-source-review.cjs').syntheticReaderReview(
                  input.reviewRequest,
                  summaryOutput
                );
              return summaryOutput;
            },
          }),
        }),
      },
    },
  }
);

const { WebResearchService } = researchModule;

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

const emptyProvider = () => ({
  rowsVisited: 0,
  invalidUrl: 0,
  duplicateWithFact: 0,
  sourceCapStops: 0,
  noUsableExcerpt: 0,
  contentExhausted: 0,
  advertisingContextRejected: 0,
  truncationEmpty: 0,
});
const emptyKeyless = () => ({
  urlRowsChecked: 0,
  rowsVisited: 0,
  invalidUrl: 0,
  existingSourceSkipped: 0,
  sourceCapStops: 0,
  noUsableExcerpt: 0,
  contentExhausted: 0,
  advertisingContextRejected: 0,
  truncationEmpty: 0,
});
const advertised = (
  url,
  content = 'Креативу присваивается идентификатор ERID.'
) => ({
  url,
  title: 'Закон о маркировке рекламы',
  content,
});
const { ContentSourceController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/content-source.controller.ts',
  {
    '@contentfactory/nestjs-libraries/openai/web.research.service':
      researchModule,
    '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
      {
        ContentSourceRegistryService: class {},
      },
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => () => {},
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => {},
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: () => () => {},
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      {
        AuthorizationActions: {
          Create: 'create',
          Update: 'update',
          Delete: 'delete',
        },
        Sections: { AI: 'ai', EDITOR: 'editor' },
      },
  }
);

describe('reader-only admission decision counts', () => {
  test('real service distinguishes URL, no excerpt, duplicate fact, context rejection and empty truncation', async () => {
    const valid = advertised('https://example.com/ads');
    responses.tavily = {
      answer: telegram.answer,
      results: [
        advertised('http://example.com/invalid'),
        { url: 'https://example.com/empty', title: 'Empty', content: 'Menu' },
        valid,
        valid,
        {
          url: 'https://example.com/news',
          title: 'Дайджест',
          content: 'Сводка новых публикаций.',
        },
        advertised(
          'https://example.com/truncated',
          '\n\n' + 'Реклама '.repeat(2000)
        ),
      ],
    };
    const before = structuredClone(responses.tavily);
    const reader = await search();
    expect(reader.admissionDiagnostics).toEqual({
      needsAdvertisingContext: true,
      provider: {
        ...emptyProvider(),
        rowsVisited: 6,
        invalidUrl: 1,
        duplicateWithFact: 1,
        noUsableExcerpt: 1,
        advertisingContextRejected: 1,
        truncationEmpty: 1,
      },
      keyless: emptyKeyless(),
      candidateSourceCount: 4,
      admittedFactCount: 1,
    });
    expect(reader.facts).toHaveLength(1);
    expect(reader.sources).toHaveLength(4);
    expect(responses.tavily).toEqual(before);
    expect(calls.search).toHaveLength(1);
    expect(calls.model.map(({ role }) => role)).toEqual([
      'classify',
      'classify',
    ]);
    const diagnostics = JSON.stringify(reader.admissionDiagnostics);
    for (const privatePart of [
      'example.com',
      'ERID',
      'fixture-organization',
      'fixture-search-key',
      'Реклама',
    ]) {
      expect(diagnostics).not.toContain(privatePart);
    }
  });

  test('source-cap stop counts the encountered stop, never unread upstream rows', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      url: `https://example.com/empty-${i}`,
      title: 'Empty',
      content: 'Menu',
    }));
    rows.push({
      get url() {
        throw new Error('The tail must stay unvisited');
      },
    });
    responses.tavily = { answer: telegram.answer, results: rows };
    const result = await search();
    expect(result.admissionDiagnostics.provider).toEqual({
      ...emptyProvider(),
      rowsVisited: 21,
      sourceCapStops: 1,
      noUsableExcerpt: 20,
    });
    expect(result.admissionDiagnostics.candidateSourceCount).toBe(20);
    expect(result.admissionDiagnostics.admittedFactCount).toBe(0);
    expect(calls.search).toHaveLength(1);
  });

  test('exhausted content is separate from absent excerpt and preserves actual admitted facts', async () => {
    responses.tavily = {
      answer: telegram.answer,
      results: Array.from({ length: 5 }, (_, i) =>
        advertised(`https://example.com/long-${i}`, 'А'.repeat(8000))
      ),
    };
    const result = await search('Облачные системы', {
      language: 'ru',
      readerResponse: true,
    });
    expect(result.admissionDiagnostics.needsAdvertisingContext).toBe(false);
    expect(result.admissionDiagnostics.provider).toEqual({
      ...emptyProvider(),
      rowsVisited: 5,
      contentExhausted: 1,
    });
    expect(result.facts).toHaveLength(4);
    expect(result.admissionDiagnostics.admittedFactCount).toBe(4);
    expect(result.admissionDiagnostics.candidateSourceCount).toBe(5);
  });

  test.each([undefined, false, 'true'])(
    'internal opt-in %p leaves diagnostics absent and transport budgets unchanged',
    async (flag) => {
      const result = await search(telegram.subject, {
        language: 'ru',
        readerResponse: flag,
      });
      expect(Object.hasOwn(result, 'admissionDiagnostics')).toBe(false);
      expect(calls.search).toHaveLength(1);
      expect(calls.model.map(({ role }) => role)).toEqual(['classify']);
      expect(result.facts).toHaveLength(5);
    }
  );

  test('cached reader keeps its original traversal snapshot with no new calls', async () => {
    const service = new WebResearchService(aiUsage);
    const options = { language: 'ru', readerResponse: true };
    const first = await service.research(
      'fixture-organization',
      telegram.subject,
      options
    );
    const cached = await service.research(
      'fixture-organization',
      telegram.subject,
      options
    );
    expect(cached.fromCache).toBe(true);
    expect(cached.admissionDiagnostics).toEqual(first.admissionDiagnostics);
    expect(calls.search).toHaveLength(1);
    expect(calls.model.map(({ role }) => role)).toEqual([
      'classify',
      'classify',
    ]);
    const internal = await service.research(
      'fixture-organization',
      telegram.subject,
      { language: 'ru' }
    );
    expect(Object.hasOwn(internal, 'admissionDiagnostics')).toBe(false);
    expect(internal.facts).toHaveLength(5);
    expect(first.facts).toHaveLength(2);
    const cachedInternal = await service.research(
      'fixture-organization',
      telegram.subject,
      { language: 'ru', readerResponse: false }
    );
    expect(cachedInternal.fromCache).toBe(true);
    expect(Object.hasOwn(cachedInternal, 'admissionDiagnostics')).toBe(false);
    expect(calls.search).toHaveLength(2);
    expect(first.admissionDiagnostics).toEqual(cached.admissionDiagnostics);
  });

  test('historical reader cache without counters stays absent without another traversal', async () => {
    const service = new WebResearchService(aiUsage);
    const options = { language: 'ru', readerResponse: true };
    const first = await service.research(
      'fixture-organization',
      telegram.subject,
      options
    );
    const { admissionDiagnostics, ...historical } = first;
    const key = service.cache.journal()[0].key;
    service.cache.set(key, historical);
    const cached = await service.research(
      'fixture-organization',
      telegram.subject,
      options
    );
    expect(cached.fromCache).toBe(true);
    expect(Object.hasOwn(cached, 'admissionDiagnostics')).toBe(false);
    expect(cached.facts).toEqual(first.facts);
    expect(first.admissionDiagnostics).toEqual(admissionDiagnostics);
    expect(calls.search).toHaveLength(1);
  });

  test('keyless filter and admission traversal are counted separately from provider decisions', async () => {
    const service = new WebResearchService(aiUsage);
    responses.tavily = {
      answer: telegram.answer,
      results: [advertised('https://example.com/provider')],
    };
    responses.exa = responses.tavily; // Explicit level uses the existing research-task Exa route.
    service.encyclopedicRows = async () => [
      { url: 'http://example.com/invalid', provider: 'wikipedia' },
      { url: 'https://example.com/provider', provider: 'wikipedia' },
      {
        url: 'https://example.com/keyless-empty',
        title: 'Empty',
        provider: 'wikipedia',
      },
      {
        url: 'https://example.com/keyless-rejected',
        title: 'Дайджест',
        extract: 'Сводка публикаций.',
        provider: 'wikipedia',
      },
      {
        url: 'https://example.com/keyless-truncated',
        title: 'Закон о маркировке рекламы',
        extract: '\n\n' + 'Реклама '.repeat(2000),
        provider: 'wikipedia',
      },
      {
        url: 'https://example.com/keyless-admitted',
        title: 'Закон о маркировке рекламы',
        extract: 'Креативу присваивается идентификатор ERID.',
        provider: 'wikipedia',
      },
    ];
    const result = await service.research(
      'fixture-organization',
      telegram.subject,
      {
        language: 'ru',
        readerResponse: true,
        level: 'standard',
      }
    );
    expect(result.admissionDiagnostics.provider).toEqual({
      ...emptyProvider(),
      rowsVisited: 1,
    });
    expect(result.admissionDiagnostics.keyless).toEqual({
      ...emptyKeyless(),
      urlRowsChecked: 6,
      rowsVisited: 5,
      invalidUrl: 1,
      existingSourceSkipped: 1,
      noUsableExcerpt: 1,
      advertisingContextRejected: 1,
      truncationEmpty: 1,
    });
    expect(result.admissionDiagnostics.candidateSourceCount).toBe(5);
    expect(result.admissionDiagnostics.admittedFactCount).toBe(2);
    expect(calls.search).toHaveLength(1);
    expect(calls.model.map(({ role }) => role)).toEqual([
      'classify',
      'classify',
    ]);
  });

  test('discovery receives no diagnostics without the explicit reader marker', async () => {
    const result = await search(telegram.subject, {
      language: 'ru',
      task: 'discovery',
    });
    expect(Object.hasOwn(result, 'admissionDiagnostics')).toBe(false);
    expect(calls.search).toHaveLength(1);
  });

  test('actual controller opts in, projects numbers only, and keeps old shape when property is absent', async () => {
    const controller = new ContentSourceController(
      {},
      new WebResearchService(aiUsage)
    );
    const projected = await controller.searchForEvidence(
      { id: 'fixture-organization' },
      {
        subject: telegram.subject,
        language: 'ru',
      }
    );
    expect(projected.admissionDiagnostics.admittedFactCount).toBe(
      projected.results.length
    );
    expect(projected.admissionDiagnostics.needsAdvertisingContext).toBe(true);
    expect(calls.search).toHaveLength(1);
    const old = {
      summary: 'fixed',
      provider: 'tavily',
      facts: [],
      sources: [],
    };
    const legacy = new ContentSourceController(
      {},
      { research: async () => old }
    );
    expect(
      await legacy.searchForEvidence(
        { id: 'fixture-organization' },
        { subject: 'fixed', language: 'ru' }
      )
    ).toEqual({ summary: 'fixed', provider: 'tavily', results: [] });
    const unsafe = {
      ...old,
      admissionDiagnostics: {
        needsAdvertisingContext: 'true',
        provider: {
          ...emptyProvider(),
          rowsVisited: Number.MAX_SAFE_INTEGER + 1,
          invalidUrl: NaN,
          duplicateWithFact: Infinity,
          noUsableExcerpt: -3,
          title: 'must never cross projection',
        },
        keyless: {
          ...emptyKeyless(),
          rowsVisited: 2.9,
          secret: 'must never cross projection',
        },
        candidateSourceCount: 4.9,
        admittedFactCount: Infinity,
        prompt: 'must never cross projection',
      },
    };
    const guarded = new ContentSourceController(
      {},
      { research: async () => unsafe }
    );
    const safe = (
      await guarded.searchForEvidence(
        { id: 'fixture-organization' },
        { subject: 'fixed' }
      )
    ).admissionDiagnostics;
    expect(safe.needsAdvertisingContext).toBe(false);
    expect(safe.provider.rowsVisited).toBe(1_000_000);
    expect(safe.provider.invalidUrl).toBe(0);
    expect(safe.provider.duplicateWithFact).toBe(0);
    expect(safe.provider.noUsableExcerpt).toBe(0);
    expect(safe.keyless.rowsVisited).toBe(2);
    expect(safe.candidateSourceCount).toBe(4);
    expect(safe.admittedFactCount).toBe(0);
    expect(JSON.stringify(safe)).not.toContain('must never cross projection');
  });
});
