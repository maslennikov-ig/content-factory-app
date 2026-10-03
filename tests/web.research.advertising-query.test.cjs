'use strict';

// Synthetic classifier/provider ports exercise the real service. These rows
// are not the missing raw Tavily payload from the cb456 live request.
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { createFakeRedis } = require('./helpers/fake-redis.cjs');
const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');

const SUBJECT =
  'Что изменилось в правилах маркировки рекламы в Telegram-каналах в 2026 году: маркировка, ЕРИР, штрафы';
const DRIFTED_QUERY = 'Telegram 2026 штрафы';
const CORRECT_QUERY = 'Маркировка рекламы Telegram ЕРИР 2026 штрафы';
const IRRELEVANT_ROWS = Array.from({ length: 5 }, (_, index) => ({
  title: 'Telegram: штрафы за запрещённую информацию',
  url: `https://example.test/telegram/fines/${index + 1}`,
  content:
    'Telegram получил административный штраф за распространение запрещённой информации. В статье обсуждается порядок удаления сообщений и обязанности владельцев сервиса.',
}));
const ADVERTISING_ROWS = [
  {
    title: 'Маркировка рекламы в Telegram: передача данных в ЕРИР',
    url: 'https://example.test/advertising/rules',
    content:
      'Рекламодатель обязан передать сведения о размещённой интернет-рекламе в ЕРИР через оператора рекламных данных. Перед публикацией необходимо получить идентификатор ERID.',
  },
  ...IRRELEVANT_ROWS.slice(0, 4),
];

let classification;
let successfulQueries;
let calls;
const aiConfig = {
  usageMode: 'included',
  provider: 'openrouter',
  apiKey: 'synthetic-model-key',
  search: {
    enabled: true,
    provider: 'tavily',
    apiKey: 'synthetic-search-key',
    apiKeys: { tavily: 'synthetic-search-key', exa: 'synthetic-reserve-key' },
    keySources: { tavily: 'system', exa: 'system' },
    topic: 'general',
    depth: 'advanced',
  },
};
const aiUsage = {
  beginAiOperationWithConfig: async () => {
    const ledger = new chain.TextUsageLedger();
    return {
      run: (callback) => chain.runWithUsageLedger(ledger, callback),
      track: (callback) => chain.runWithUsageLedger(ledger, callback),
      finish: async (succeeded) => calls.completed.push(succeeded),
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
      { judgeDiscoveryRows: async () => new Map() },
    '@contentfactory/nestjs-libraries/content-intelligence/research/encyclopedic-reference':
      {
        lookupEncyclopedicReferences: async () => {
          calls.keyless += 1;
          throw new Error('No keyless network in this fixture');
        },
        lookupWikidataReferences: async () => {
          calls.keyless += 1;
          throw new Error('No keyless network in this fixture');
        },
        fetchEncyclopedicExtract: async () => {
          throw new Error('No extract network in this fixture');
        },
      },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      WEB_SEARCH_PRIMARY_TIMEOUT_MS: 12_000,
      WEB_SEARCH_FALLBACK_TIMEOUT_MS: 8_000,
      WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
      WEB_SEARCH_MAX_RESULT_CHARS: 32_000,
      getChatModel: async (_organizationId, _temperature, _maxTokens, role) => {
        calls.roles.push(role);
        return { withStructuredOutput: () => ({}) };
      },
      getWebSearchClient: async (_organizationId, provider, options) => ({
        invoke: async ({ query }) => {
          calls.search.push({ provider, query, options });
          return {
            answer: 'Фрагменты предоставленных источников.',
            usage: { credits: 2 },
            results: successfulQueries.has(query)
              ? ADVERTISING_ROWS
              : IRRELEVANT_ROWS,
          };
        },
      }),
    },
    '@langchain/core/prompts': {
      ChatPromptTemplate: {
        fromTemplate: (template) => ({
          pipe: () => ({
            invoke: async (input) =>
              template.includes('Classify the research subject')
                ? classification
                : input.reviewRequest
                ? require('./helpers/reader-source-review.cjs').syntheticReaderReview(
                    input.reviewRequest,
                    { summary: 'Фрагменты предоставленных источников.' }
                  )
                : { summary: 'Фрагменты предоставленных источников.' },
          }),
        }),
      },
    },
  }
);

beforeEach(() => {
  classification = {
    scope: 'local',
    subjectLanguage: 'ru',
    englishQuery: 'Telegram advertising labeling ERIR 2026 fines',
    subjectLanguageQuery: DRIFTED_QUERY,
    freshnessRequired: false,
  };
  successfulQueries = new Set([SUBJECT, CORRECT_QUERY]);
  calls = { search: [], roles: [], completed: [], keyless: 0 };
});

const search = (subject = SUBJECT, options = {}) =>
  new WebResearchService(aiUsage).research('synthetic-own-workspace', subject, {
    language: 'ru',
    readerResponse: true,
    ...options,
  });

test('a classifier dropping explicit advertising intent uses the bounded original subject in the same single request', async () => {
  const result = await search();

  expect(calls.search).toHaveLength(1);
  expect(calls.search[0]).toMatchObject({
    provider: 'tavily',
    query: SUBJECT,
    options: { freshnessRequired: false },
  });
  expect(calls.roles).toEqual(['classify', 'classify']);
  expect(calls.completed).toEqual([true]);
  expect(calls.keyless).toBe(0);
  expect(result.sources).toHaveLength(5);
  expect(result.facts).toHaveLength(1);
  expect(result.admissionDiagnostics).toMatchObject({
    needsAdvertisingContext: true,
    provider: { rowsVisited: 5, advertisingContextRejected: 4 },
    candidateSourceCount: 5,
    admittedFactCount: 1,
  });
});

test('a correct classifier query is sent without modification', async () => {
  classification.subjectLanguageQuery = CORRECT_QUERY;

  const result = await search();

  expect(calls.search.map(({ query }) => query)).toEqual([CORRECT_QUERY]);
  expect(result.facts).toHaveLength(1);
  expect(calls.roles).toEqual(['classify', 'classify']);
});

test.each([
  ['register', 'Маркировка рекламы Telegram 2026 штрафы'],
  ['labeling', 'Правила рекламы Telegram ЕРИР 2026 штрафы'],
  ['advertising', 'Маркировка Telegram ЕРИР 2026 штрафы'],
])('a classifier dropping the explicit %s uses the original subject once', async (_missing, query) => {
  classification.subjectLanguageQuery = query;

  const result = await search();

  expect(calls.search.map(({ query: sent }) => sent)).toEqual([SUBJECT]);
  expect(result.facts).toHaveLength(1);
  expect(result.admissionDiagnostics.provider.advertisingContextRejected).toBe(4);
});

test('an equivalent Russian word order retains the classifier query', async () => {
  classification.subjectLanguageQuery = 'Рекламная маркировка Telegram ЕРИР 2026';
  successfulQueries.add(classification.subjectLanguageQuery);

  await search();

  expect(calls.search.map(({ query }) => query)).toEqual([
    classification.subjectLanguageQuery,
  ]);
});

test('a subject without an explicit register does not invent one', async () => {
  const subject = 'Правила маркировки рекламы в Telegram в 2026 году';
  classification.subjectLanguageQuery = 'Маркировка рекламы Telegram 2026';

  await search(subject);

  expect(calls.search.map(({ query }) => query)).toEqual([
    classification.subjectLanguageQuery,
  ]);
  expect(calls.search[0].query).not.toContain('ЕРИР');
});

test('the original subject fallback uses the existing classifier character bound', async () => {
  const subject = `${SUBJECT} ${'дополнительный синтетический контекст '.repeat(300)}`;
  const boundedSubject = subject.slice(0, 5_000).trim();
  successfulQueries.add(boundedSubject);

  const result = await search(subject);

  expect(calls.search.map(({ query }) => query)).toEqual([boundedSubject]);
  expect(calls.search[0].query.length).toBeLessThanOrEqual(5_000);
  expect(result.facts).toHaveLength(0);
  expect(result.readerAssessment.status).toBe('review_unavailable');
  expect(calls.roles).toEqual(['classify']);
});

test('an English original subject keeps its classifier query and admission boundary', async () => {
  classification.subjectLanguage = 'en';
  classification.subjectLanguageQuery = null;
  classification.englishQuery = 'Telegram advertising labels ERIR 2026';

  const result = await search('Telegram advertising labeling rules in 2026', {
    language: 'en',
  });

  expect(calls.search.map(({ query }) => query)).toEqual([
    classification.englishQuery,
  ]);
  expect(result.admissionDiagnostics.needsAdvertisingContext).toBe(false);
});

test('a Russian subject misclassified as English does not gain an extra query slot', async () => {
  classification.scope = 'global';
  classification.subjectLanguage = 'en';
  classification.subjectLanguageQuery = null;
  classification.englishQuery = 'Telegram 2026 fines';

  const result = await search(SUBJECT, {
    level: 'deep',
    levelWasExplicit: true,
  });

  expect(calls.search.map(({ query }) => query)).toEqual([SUBJECT]);
  expect(calls.roles).toEqual(['classify', 'classify']);
  expect(result.facts).toHaveLength(1);
});

test('a global two-query level keeps its existing English secondary query', async () => {
  classification.scope = 'global';

  await search(SUBJECT, { level: 'deep', levelWasExplicit: true });

  expect(calls.search.map(({ query }) => query)).toEqual([
    SUBJECT,
    classification.englishQuery,
  ]);
});

test('a nonadvertising subject keeps the classifier query', async () => {
  const result = await search('Штрафы Telegram за запрещённые сообщения в 2026 году');

  expect(calls.search.map(({ query }) => query)).toEqual([DRIFTED_QUERY]);
  expect(result.admissionDiagnostics.needsAdvertisingContext).toBe(false);
});

test('explicit caller queries are unchanged and skip classification', async () => {
  const result = await search(SUBJECT, { queries: [DRIFTED_QUERY] });

  expect(calls.search.map(({ query }) => query)).toEqual([DRIFTED_QUERY]);
  expect(calls.roles).toEqual([]);
  expect(result.admissionDiagnostics.needsAdvertisingContext).toBe(false);
});

test('a repaired query still rejects every irrelevant provider row without a second request', async () => {
  successfulQueries.clear();

  const result = await search();

  expect(calls.search.map(({ query }) => query)).toEqual([SUBJECT]);
  expect(result.facts).toHaveLength(0);
  expect(result.sources).toHaveLength(5);
  expect(result.admissionDiagnostics).toMatchObject({
    needsAdvertisingContext: true,
    provider: { rowsVisited: 5, advertisingContextRejected: 5 },
    candidateSourceCount: 5,
    admittedFactCount: 0,
  });
  expect(calls.keyless).toBe(0);
});

test('a dated subject with general classification does not alter provider freshness options', async () => {
  classification.subjectLanguageQuery = CORRECT_QUERY;
  classification.freshnessRequired = false;

  await search();

  expect(calls.search).toHaveLength(1);
  expect(calls.search[0].options).toEqual({
    scope: 'local',
    country: 'russia',
    freshnessRequired: false,
  });
});
