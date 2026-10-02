'use strict';

/**
 * Живой прогон владельца 05.09.2026, две дыры на одном пути «Бриф → Найти».
 *
 * `content-factory-next-fn33.133`: интерфейс на русском, а «Коротко о
 * найденном» приходит по-английски. Сводку пишет не наша модель, а поисковик:
 * это поле `answer` у Tavily, и оно идёт на языке запроса, а запрос всегда
 * английский. Значит язык читателя должен доходить до сервиса поиска и до
 * промпта, который приводит сводку к этому языку.
 *
 * `content-factory-next-fn33.139`: когда оба поисковика не ответили,
 * `WebSearchFallbackError` вылетает наружу и становится 500 без кода. Отказ
 * настройки (`CONTENT_SEARCH_NOT_CONFIGURED`) экран умеет объяснить, а
 * временный сбой — нет, хотя именно он лечится повтором.
 *
 * `content-factory-next-ec48.7`: два ответа нужно свести в один, отделив
 * текущую ставку от прогноза и сохранив названия из самих источников.
 * Ниже используются офлайн-примеры в форме ответов поисковика; они проверяют
 * данные и ограничения вызова, а не качество живой модели.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(root, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
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

const contentLanguage = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content.language.ts'
);

// --- Section A: язык доходит до сводки (fn33.133) ---------------------------

let classification;
let aiConfig;
let searchAnswer;
let summaryResult;
let summaryError;
const templates = [];
const promptInputs = [];
const chatModelCalls = [];
const searchCalls = [];

const promptFor = (template) => ({
  pipe: () => ({
    invoke: async (input) => {
      promptInputs.push({ template, input });
      if (template.includes('Classify the research subject'))
        return classification;
      if (summaryError) throw summaryError;
      return summaryResult;
    },
  }),
});

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
    '@contentfactory/nestjs-libraries/dtos/content.language': contentLanguage,
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      WEB_SEARCH_TIMEOUT_MS: 20_000,
      WEB_SEARCH_PRIMARY_TIMEOUT_MS: 12_000,
      WEB_SEARCH_FALLBACK_TIMEOUT_MS: 8_000,
      WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
      WEB_SEARCH_MAX_RESULT_CHARS: 32_000,
      getChatModel: async (organizationId, temperature, maxTokens, role) => {
        chatModelCalls.push({ organizationId, temperature, maxTokens, role });
        return { withStructuredOutput: () => ({}) };
      },
      getWebSearchClient: async () => ({
        invoke: async ({ query }) => {
          searchCalls.push(query);
          return typeof searchAnswer === 'function'
            ? searchAnswer(query)
            : searchAnswer;
        },
      }),
    },
    '@langchain/core/prompts': {
      ChatPromptTemplate: {
        fromTemplate: (template) => {
          templates.push(template);
          return promptFor(template);
        },
      },
    },
  }
);

const aiUsage = {
  executeAiOperation: async (_organizationId, _operation, callback) =>
    callback(),
};

const summaryCalls = () =>
  promptInputs.filter(
    ({ template }) => !template.includes('Classify the research subject')
  );

// Форма Tavily: answer, results с title/content и датой публикации. Цифры и
// формулировки воспроизводят расхождение из ec48.7, а адреса учебные.
const rateResponses = [
  {
    answer:
      'Ожидается, что ключевая ставка Банка России в сентябре 2026 года останется высокой: большинство экспертов прогнозируют ее на уровне около 13,5–13,75%.',
    results: [
      {
        title: 'Ключевую ставку, скорее всего, сохранят на 14%',
        url: 'https://example.org/rate-forecast',
        content:
          'На 4 сентября 2026 года ключевая ставка Банка России составляет 14% годовых. Эксперты ожидают сохранения ставки на следующем заседании; прогноз 13,5–13,75% относится к возможному будущему снижению.',
        published_date: '2026-09-04',
      },
    ],
  },
  {
    answer:
      'As of 4 September 2026, the Bank of Russia key interest rate is 14% per annum.',
    results: [
      {
        title: 'Bank of Russia key rate decision',
        url: 'https://example.org/rate-decision',
        content:
          'The key rate is 14% per annum as of 4 September 2026. A later cut is a forecast, not an announced decision.',
        published_date: '2026-09-04',
      },
    ],
  },
];

const bankResponses = [
  {
    answer: 'ВТБ увеличил объём выданных кредитов на 70% год к году.',
    results: [
      {
        title: 'ВТБ сообщил о росте кредитования',
        url: 'https://example.org/bank-ru',
        content:
          'ВТБ: объём кредитов, выданных банком, увеличился на 70% год к году по состоянию на август 2026 года.',
        published_date: '2026-09-04',
      },
    ],
  },
  {
    answer: 'Loans issued by VTBS increased by 70% year on year.',
    results: [
      {
        title: 'Russian bank lending in August',
        url: 'https://example.org/bank-en',
        content:
          'The Russian report describes a 70% year-on-year increase in loans issued in August 2026.',
        published_date: '2026-09-04',
      },
    ],
  },
];

function useTwoResponses(responses) {
  classification = {
    scope: 'global',
    subjectLanguage: 'ru',
    englishQuery: 'Bank of Russia key rate September 2026',
    subjectLanguageQuery: 'ключевая ставка Банка России сентябрь 2026',
    freshnessRequired: true,
  };
  searchAnswer = (query) =>
    responses[query === classification.englishQuery ? 1 : 0];
}

describe('сводка веб-поиска говорит на языке читателя', () => {
  beforeEach(() => {
    templates.length = 0;
    promptInputs.length = 0;
    chatModelCalls.length = 0;
    searchCalls.length = 0;
    summaryError = undefined;
    classification = {
      scope: 'global',
      subjectLanguage: 'ru',
      englishQuery: 'key interest rate Russia',
      subjectLanguageQuery: null,
      freshnessRequired: false,
    };
    aiConfig = {
      provider: 'openrouter',
      apiKey: 'model-key',
      search: {
        enabled: true,
        provider: 'tavily',
        apiKey: 'search-key',
        topic: 'general',
        depth: 'advanced',
      },
    };
    searchAnswer = {
      answer:
        "The Bank of Russia's key interest rate in September 2026 is set at 14% per annum.",
      results: [
        {
          title: 'Rate decision',
          url: 'https://example.org/rate',
          content: 'Rate stays at 14%.',
          published_date: 'Wed, 02 Sep 2026 15:54:46 GMT',
        },
      ],
    };
    summaryResult = {
      summary: 'Ключевая ставка Банка России в сентябре 2026 года — 14% годовых.',
    };
  });

  test('промпт сводки несёт язык, и сводка возвращается на нём', async () => {
    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru' }
    );

    const summaryPrompt = promptInputs.find(
      ({ template }) => !template.includes('Classify the research subject')
    );
    assert.ok(summaryPrompt, 'сводка должна проходить через свой промпт');
    assert.match(summaryPrompt.template, /\{language\}|Russian/);
    assert.equal(
      JSON.stringify(summaryPrompt.input).includes('Russian') ||
        summaryPrompt.input.language === 'Russian',
      true,
      'в промпт сводки должен приходить язык читателя'
    );
    assert.equal(
      result.summary,
      'Ключевая ставка Банка России в сентябре 2026 года — 14% годовых.'
    );
    // Дешёвая роль: сводка не стоит модели, которая пишет черновики.
    assert.equal(
      chatModelCalls.every(({ role }) => role === 'classify'),
      true
    );
  });

  test('сводка уже на нужном языке не тратит второй вызов модели', async () => {
    searchAnswer.answer = 'Ключевая ставка — 14% годовых.';

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru' }
    );

    assert.equal(result.summary, 'Ключевая ставка — 14% годовых.');
    assert.equal(chatModelCalls.length, 1);
  });

  test('один английский ответ для английского читателя тоже не покупает сводку', async () => {
    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'key rate',
      { language: 'en' }
    );

    assert.equal(result.summary, searchAnswer.answer);
    assert.equal(summaryCalls().length, 0);
    assert.equal(chatModelCalls.length, 1);
  });

  test('без языка поведение прежнее: сводка идёт как пришла', async () => {
    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'key rate'
    );

    assert.equal(result.summary, searchAnswer.answer);
    assert.equal(chatModelCalls.length, 1);
  });

  // Saved public27 answer, 1C cloud search. This pins language/call behavior,
  // not the factual accuracy of the provider's prices or migration advice.
  const recorded1cSummary =
    'The sources indicate that migrating 1С:Предприятие from a local server to the cloud in Russia involves several key considerations. The process includes a preliminary audit of the current 1С configuration, data volume, and network architecture, followed by selecting an optimal cloud provider and tariff plan based on performance, budget, and Service Level Agreement (SLA). The cost of migration and cloud rental varies; for instance, renting 1С for 10 or more users is around 13,000 rubles per month, while renting per user ranges from 1,300 to 2,100 rubles monthly depending on the configuration. The sources also highlight the benefits of cloud migration, such as avoiding the need for capital expenditures on new hardware, scalability, and centralized updates and maintenance by the cloud provider. However, the sources do not provide a definitive answer on the exact cost of migrating multiple databases or the specific licensing requirements for 1С in the cloud.';

  const russianTechnicalSummary =
    'Переезд в облако сохраняет работу приложения с PostgreSQL и Microsoft Azure. REST API и SLA описывают доступ к данным и требования к доступности сервиса.';

  test.each([
    ['public27 English with 1С names → ru', recorded1cSummary, 'ru', true],
    ['public27 English with 1С names → en', recorded1cSummary, 'en', false],
    ['Russian with technical names → ru', russianTechnicalSummary, 'ru', false],
    ['Russian with technical names → en', russianTechnicalSummary, 'en', true],
    ['short English → ru', 'Cloud migration.', 'ru', true],
    ['short English → en', 'Cloud migration.', 'en', false],
    ['uppercase English → ru', 'CLOUD MIGRATION', 'ru', true],
    ['other-script fallback → ru', 'Μεταφορά στο νέφος.', 'ru', true],
    ['other-script fallback → en', 'Μεταφορά στο νέφος.', 'en', false],
    ['short Russian → ru', 'Переезд завершён.', 'ru', false],
    ['short Russian → en', 'Переезд завершён.', 'en', true],
    [
      'numeric/acronym-only → ru',
      '2026: 13,000 ₽ / 1С / SLA / API',
      'ru',
      false,
    ],
    [
      'numeric/acronym-only → en',
      '2026: 13,000 ₽ / 1С / SLA / API',
      'en',
      false,
    ],
    ['numeric-only → ru', '2026: 13,000 ₽ — 14%', 'ru', false],
    ['numeric-only → en', '2026: 13,000 ₽ — 14%', 'en', false],
    ['empty → ru', '   ', 'ru', false],
    ['empty → en', '   ', 'en', false],
    [
      'balanced bilingual → ru',
      'Cloud migration reduces hardware costs. Переезд в облако снижает расходы.',
      'ru',
      false,
    ],
    [
      'balanced bilingual → en',
      'Cloud migration reduces hardware costs. Переезд в облако снижает расходы.',
      'en',
      false,
    ],
    ['short mixed names → ru', 'Cloud Предприятие', 'ru', false],
    ['short mixed names → en', 'Cloud Предприятие', 'en', false],
  ])(
    '%s uses at most the existing one correction',
    async (_label, answer, language, rewrite) => {
      searchAnswer.answer = answer;
      const originalSources = searchAnswer.results.map((row) => ({ ...row }));
      summaryResult = {
        summary: 'Mocked existing reader-language correction.',
      };

      const result = await new WebResearchService(aiUsage).research(
        'organization-a',
        'переезд с 1С в облако',
        { language, readerResponse: !!answer.trim() }
      );

      assert.equal(
        result.summary,
        rewrite ? summaryResult.summary : answer.trim() ? answer : ''
      );
      assert.equal(summaryCalls().length, rewrite ? 1 : 0);
      assert.equal(chatModelCalls.length, rewrite ? 2 : 1);
      assert.equal(
        chatModelCalls.every(({ role }) => role === 'classify'),
        true
      );
      assert.deepEqual(searchAnswer.results, originalSources);
      assert.equal(result.facts.length, 1);
      assert.equal(result.sources.length, 1);
      assert.equal(result.facts[0].sourceUrl, originalSources[0].url);
      assert.equal(result.sources[0].url, originalSources[0].url);
      if (rewrite) {
        const { input } = summaryCalls()[0];
        assert.equal(input.language, language === 'ru' ? 'Russian' : 'English');
        assert.deepEqual(JSON.parse(input.evidence).answers, [answer]);
      }
    }
  );

  test('supplied 1С queries do not buy a language correction', async () => {
    searchAnswer.answer = recorded1cSummary;
    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'переезд с 1С в облако',
      { language: 'ru', readerResponse: true, queries: ['1C cloud migration'] }
    );

    assert.equal(result.summary, recorded1cSummary);
    assert.equal(summaryCalls().length, 0);
    assert.equal(chatModelCalls.length, 0);
    assert.equal(result.facts.length, 1);
    assert.equal(result.sources.length, 1);
  });

  test.each([
    {
      label: 'English prefix ignores a huge Russian tail for ru',
      prefix: 'Cloud migration reduces hardware costs. '.repeat(110).slice(0, 4_000),
      tail: 'Переезд в облако снижает расходы. '.repeat(40_000),
      language: 'ru',
      rewrite: true,
    },
    {
      label: 'English prefix ignores a huge Russian tail for en',
      prefix: 'Cloud migration reduces hardware costs. '.repeat(110).slice(0, 4_000),
      tail: 'Переезд в облако снижает расходы. '.repeat(40_000),
      language: 'en',
      rewrite: false,
    },
    {
      label: 'Russian prefix ignores a huge English tail for ru',
      prefix: 'Переезд в облако снижает расходы. '.repeat(130).slice(0, 4_000),
      tail: 'Cloud migration reduces hardware costs. '.repeat(40_000),
      language: 'ru',
      rewrite: false,
    },
    {
      label: 'Russian prefix ignores a huge English tail for en',
      prefix: 'Переезд в облако снижает расходы. '.repeat(130).slice(0, 4_000),
      tail: 'Cloud migration reduces hardware costs. '.repeat(40_000),
      language: 'en',
      rewrite: true,
    },
    {
      label: 'a letter at the last sampled character still uses the old fallback',
      prefix: `${' '.repeat(3_999)}α`,
      tail: 'Cloud migration reduces hardware costs. '.repeat(40_000),
      language: 'ru',
      rewrite: true,
    },
    {
      label: 'whitespace-only prefix does not inspect the first excluded letter',
      prefix: ' '.repeat(4_000),
      tail: 'Cloud migration reduces hardware costs. '.repeat(40_000),
      language: 'ru',
      rewrite: false,
    },
  ])('$label', async ({ prefix, tail, language, rewrite }) => {
    assert.equal(prefix.length, 4_000);
    assert.ok(tail.length > 1_000_000);
    const answer = prefix + tail;
    searchAnswer.answer = answer;
    summaryResult = { summary: 'Mocked bounded reader correction.' };
    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'переезд с 1С в облако',
      { language, readerResponse: true }
    );

    assert.equal(summaryCalls().length, rewrite ? 1 : 0);
    assert.equal(chatModelCalls.length, rewrite ? 2 : 1);
    assert.equal(result.summary, rewrite ? summaryResult.summary : answer);
    assert.equal(searchAnswer.answer, answer);
    assert.equal(result.facts.length, 1);
    assert.equal(result.sources.length, 1);
    assert.equal(result.facts[0].text, searchAnswer.results[0].content);
    assert.equal(result.facts[0].sourceUrl, searchAnswer.results[0].url);
    assert.equal(result.sources[0].url, searchAnswer.results[0].url);
    if (rewrite) {
      assert.deepEqual(JSON.parse(summaryCalls()[0].input.evidence).answers, [prefix]);
    }
  });

  test('сорванный перевод сводки не срывает поиск', async () => {
    summaryResult = null;

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru' }
    );

    assert.equal(result.summary, searchAnswer.answer);
    assert.equal(result.sources.length, 1);
  });

  test('текущая ставка и прогноз входят в одну сводку через один общий вызов', async () => {
    useTwoResponses(rateResponses);
    summaryResult = {
      summary:
        'На 4 сентября 2026 года ключевая ставка Банка России составляет 14% годовых. 13,5–13,75% — прогноз возможного будущего снижения, а не текущая ставка; источники также допускают сохранение 14%.',
    };

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка Банка России в сентябре 2026 года',
      { language: 'ru' }
    );

    assert.equal(summaryCalls().length, 1, 'объединение и перевод — один вызов');
    assert.equal(chatModelCalls.length, 2, 'классификация и одна сводка');
    assert.equal(chatModelCalls.every(({ role }) => role === 'classify'), true);
    assert.equal(chatModelCalls[1].maxTokens > 0, true);
    assert.equal(chatModelCalls[1].maxTokens <= 1_200, true);
    const { template, input } = summaryCalls()[0];
    const evidence = JSON.parse(input.evidence);
    assert.deepEqual(evidence.answers, rateResponses.map(({ answer }) => answer));
    assert.equal(
      evidence.subject,
      'ключевая ставка Банка России в сентябре 2026 года'
    );
    assert.deepEqual(
      evidence.sources.map(({ title, excerpt, publishedAt }) => ({
        title,
        excerpt,
        publishedAt,
      })),
      rateResponses.map(({ results: [source] }) => ({
        title: source.title,
        excerpt: source.content,
        publishedAt: source.published_date,
      }))
    );
    assert.equal(input.language, 'Russian');
    assert.match(template, /one coherent/i);
    assert.match(template, /current.*forecast|forecast.*current/is);
    assert.match(template, /as.of|dated/i);
    assert.match(template, /conflict/i);
    assert.match(template, /untrusted/i);
    assert.match(template, /instructions.*data|data.*instructions/is);
    assert.equal(result.summary, summaryResult.summary);
    assert.notEqual(
      result.summary,
      rateResponses.map(({ answer }) => answer).join('\n\n')
    );
    assert.equal(result.facts.length, 2);
    assert.equal(result.sources.length, 2);
  });

  test.each([
    {
      label: 'два русских ответа',
      language: 'ru',
      answers: ['Текущая ставка — 14%.', 'Прогноз будущей ставки — 13,5–13,75%.'],
      combined: 'Текущая ставка — 14%; 13,5–13,75% — прогноз будущего снижения.',
    },
    {
      label: 'два английских ответа',
      language: 'en',
      answers: [
        'The current rate is 14%.',
        'A later rate cut to 13.5–13.75% is forecast.',
      ],
      combined:
        'The current rate is 14%; a later cut to 13.5–13.75% is a forecast.',
    },
    {
      label: 'два ответа без языка читателя',
      language: undefined,
      answers: [
        'The current rate is 14%.',
        'A later rate cut to 13.5–13.75% is forecast.',
      ],
      combined: 'Текущая ставка — 14%; 13,5–13,75% — прогноз будущего снижения.',
    },
  ])(
    '$label тоже сводятся одним вызовом',
    async ({ language, answers, combined }) => {
      useTwoResponses(
        rateResponses.map((response, index) => ({
          ...response,
          answer: answers[index],
        }))
      );
      summaryResult = { summary: combined };

      const result = await new WebResearchService(aiUsage).research(
        'organization-a',
        'ключевая ставка',
        language ? { language } : {}
      );

      assert.equal(summaryCalls().length, 1);
      assert.deepEqual(JSON.parse(summaryCalls()[0].input.evidence).answers, answers);
      assert.equal(
        summaryCalls()[0].input.language,
        language === 'en' ? 'English' : 'Russian'
      );
      assert.equal(chatModelCalls.length, 2);
      assert.equal(result.summary, combined);
    }
  );

  test('без явного языка русская тема выбирает русский даже при первом английском ответе', async () => {
    useTwoResponses([rateResponses[1], rateResponses[0]]);
    summaryResult = {
      summary:
        'На 4 сентября 2026 года ставка — 14%; 13,5–13,75% — прогноз возможного будущего снижения.',
    };

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка Банка России в сентябре 2026 года'
    );

    const { input } = summaryCalls()[0];
    assert.deepEqual(
      JSON.parse(input.evidence).answers,
      [rateResponses[1].answer, rateResponses[0].answer]
    );
    assert.equal(input.language, 'Russian');
    assert.equal(result.summary, summaryResult.summary);
    assert.equal(summaryCalls().length, 1);
    assert.equal(chatModelCalls.length, 2);
  });

  test('название из русской выдержки имеет приоритет над VTBS в ответе движка', async () => {
    useTwoResponses(bankResponses);
    summaryResult = {
      summary:
        'ВТБ сообщил о росте объёма выданных кредитов на 70% год к году в августе 2026 года.',
    };

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'рост кредитования ВТБ',
      { language: 'ru' }
    );

    const { template, input } = summaryCalls()[0];
    const evidence = JSON.parse(input.evidence);
    assert.deepEqual(evidence.answers, bankResponses.map(({ answer }) => answer));
    assert.equal(evidence.sources[0].title, bankResponses[0].results[0].title);
    assert.equal(evidence.sources[0].excerpt, bankResponses[0].results[0].content);
    assert.match(template, /original.*names|names.*original/is);
    assert.match(
      template,
      /source.*(?:priority|precedence|outrank)|(?:priority|precedence|outrank).*source/is
    );
    assert.match(template, /number/i);
    assert.equal(summaryCalls().length, 1);
    assert.equal(result.summary, summaryResult.summary);
    assert.equal(result.summary.includes('VTBS'), false);
    assert.equal(result.summary.includes('70%'), true);
  });

  test('перевод единственного ответа тоже получает исходное название из выдержки', async () => {
    searchAnswer = {
      answer: bankResponses[1].answer,
      results: bankResponses[0].results,
    };
    summaryResult = {
      summary: 'ВТБ увеличил объём выданных кредитов на 70% год к году.',
    };

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'рост кредитования ВТБ',
      { language: 'ru' }
    );

    const evidence = JSON.parse(summaryCalls()[0].input.evidence);
    assert.deepEqual(evidence.answers, [bankResponses[1].answer]);
    assert.equal(evidence.sources[0].excerpt, bankResponses[0].results[0].content);
    assert.equal(summaryCalls().length, 1);
    assert.equal(result.summary, summaryResult.summary);
  });

  test('два одинаковых ответа не покупают объединение', async () => {
    const answer = 'Ключевая ставка — 14% годовых.';
    useTwoResponses(
      rateResponses.map((response, index) => ({
        ...response,
        answer: index ? `  ${answer}  ` : answer,
      }))
    );

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru' }
    );

    assert.equal(searchCalls.length, 2);
    assert.equal(summaryCalls().length, 0);
    assert.equal(chatModelCalls.length, 1);
    assert.equal(result.summary, answer);
    assert.equal(result.sources.length, 2);
  });

  test.each([
    { label: 'сбой модели', error: new Error('summary model is unavailable') },
    { label: 'пустой текст', written: { summary: '   ' } },
    { label: 'пустой ответ', written: null },
    { label: 'не строка', written: { summary: 14 } },
    { label: 'не поле сводки', written: { answer: '14%' } },
  ])(
    '$label сохраняет первый ответ и источники без повторного перевода',
    async ({ error, written }) => {
      useTwoResponses(rateResponses);
      summaryError = error;
      summaryResult = written;

      const result = await new WebResearchService(aiUsage).research(
        'organization-a',
        'ключевая ставка',
        { language: 'en' }
      );

      assert.equal(result.summary, rateResponses[0].answer);
      assert.equal(result.facts.length, 2);
      assert.equal(result.sources.length, 2);
      assert.equal(summaryCalls().length, 1);
      assert.equal(chatModelCalls.length, 2);
    }
  );

  test('пустая первая половина не становится запасной сводкой при сбое перевода', async () => {
    useTwoResponses([
      { ...rateResponses[0], answer: '   ' },
      rateResponses[1],
    ]);
    summaryError = new Error('summary model is unavailable');

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru' }
    );

    assert.equal(result.summary, rateResponses[1].answer);
    assert.equal(summaryCalls().length, 1);
    assert.equal(chatModelCalls.length, 2);
    assert.equal(result.sources.length, 2);
  });

  test('готовые запросы проверки фактов не покупают ни классификацию, ни сводку', async () => {
    useTwoResponses(rateResponses);

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'проверить две цифры в черновике',
      {
        language: 'ru',
        task: 'facts',
        queries: [
          classification.subjectLanguageQuery,
          classification.englishQuery,
        ],
      }
    );

    assert.equal(searchCalls.length, 2);
    assert.equal(promptInputs.length, 0);
    assert.equal(chatModelCalls.length, 0);
    assert.equal(result.facts.length, 2);
    assert.equal(result.sources.length, 2);
  });

  test('пустой ответ с цитируемыми фактами покупает одну сводку для читателя', async () => {
    searchAnswer.answer = '  ';

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru', readerResponse: true }
    );

    assert.equal(result.summary, summaryResult.summary);
    assert.equal(summaryCalls().length, 1);
    assert.equal(chatModelCalls.length, 2);
    assert.equal(result.sources.length, 1);
    assert.equal(result.facts.length, 1);
  });

  test('пустой ответ без цитируемых фактов не вызывает модель сводки', async () => {
    searchAnswer.answer = '  ';
    delete searchAnswer.results[0].content;

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru', readerResponse: true }
    );

    assert.equal(result.summary, '');
    assert.equal(summaryCalls().length, 0);
    assert.equal(chatModelCalls.length, 1);
    assert.equal(result.sources.length, 1);
    assert.equal(result.facts.length, 0);
  });

  test('общий промпт ограничивает тему, каждый ответ и источник, не меняя поисковые выдержки', async () => {
    const sources = Array.from({ length: 20 }, (_, index) => ({
      title: `Источник ${index} ${'название '.repeat(150)}`,
      url: `https://example.org/long-source-${index}`,
      content: `ВТБ сохранил исходное имя. Источник ${index}. ${'Длинная выдержка с фактами. '.repeat(300)}`,
      published_date: '2026-09-04',
    }));
    const responses = [
      { answer: `Первый ответ: ${'прогноз '.repeat(2_000)}`, results: sources },
      { answer: `Второй ответ: ${'текущий факт '.repeat(2_000)}`, results: [] },
    ];
    // Каждый успешный ответ поисковика должен иметь хотя бы один результат.
    responses[1].results = [sources[0]];
    useTwoResponses(responses);
    summaryResult = { summary: 'ВТБ: текущий факт и прогноз указаны отдельно.' };

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      `Тема: ${'данные '.repeat(4_000)}`,
      { language: 'ru' }
    );

    const { template, input } = summaryCalls()[0];
    const evidence = JSON.parse(input.evidence);
    assert.equal(evidence.answers.length, 2);
    assert.equal(evidence.answers.every((answer) => answer.length <= 4_000), true);
    assert.equal(evidence.subject.length <= 2_000, true);
    assert.equal(evidence.sources.length <= 8, true);
    assert.equal(evidence.sources.every(({ title }) => title.length <= 300), true);
    assert.equal(
      evidence.sources.every(({ excerpt }) => excerpt.length <= 1_000),
      true
    );
    assert.equal(input.evidence.length < 30_000, true);
    assert.match(template, /untrusted/i);
    assert.equal(result.facts[0].text.length > 1_000, true);
    assert.equal(result.sources.length, 20);
    assert.equal(chatModelCalls.length, 2);
  });
});

// --- Section B: отказ поиска называет себя (fn33.139) -----------------------

const dtoModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content-intelligence/content-source.dto.ts',
  { '../content.language': contentLanguage }
);
const permissionEnums = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permission.exception.class.ts'
);
const permissionDecorators = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permissions.ability.ts',
  { './permission.exception.class': permissionEnums }
);
const { ContentSourceController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/content-source.controller.ts',
  {
    '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
      { ContentSourceRegistryService: class {} },
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-source.dto':
      dtoModule,
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => undefined,
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability':
      permissionDecorators,
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      permissionEnums,
  }
);

const controllerWithResearch = (research) =>
  new ContentSourceController({}, research);

describe('отказ поиска приходит с кодом', () => {
  test('оба поисковика молчат — предметный код, а не 500', async () => {
    const fallback = Object.assign(
      new Error(
        'Tavily and OpenRouter web research both failed: Web search returned no results. | Web search did not answer within 8000ms.'
      ),
      { name: 'WebSearchFallbackError' }
    );
    const controller = controllerWithResearch({
      research: async () => {
        throw fallback;
      },
    });

    const error = await controller
      .searchForEvidence({ id: 'org-a' }, { subject: 'переезд с 1С в облако' })
      .then(
        () => null,
        (thrown) => thrown
      );

    assert.ok(error, 'отказ должен долетать до клиента');
    const body = error.getResponse();
    assert.equal(body.code, 'CONTENT_SEARCH_UNAVAILABLE');
    assert.equal(error.getStatus(), 503);
    // Наружу не уходит ни имя поисковика, ни таймаут из лога.
    assert.equal(/Tavily|OpenRouter|8000/.test(body.message), false);
  });

  test('маршрут задаёт язык и внутренний признак читателя, не принимая его из body', async () => {
    const calls = [];
    const controller = controllerWithResearch({
      research: async (...args) => {
        calls.push(args);
        return { summary: '', provider: 'tavily', facts: [], sources: [] };
      },
    });

    await controller.searchForEvidence(
      { id: 'org-a' },
      { subject: 'ключевая ставка', language: 'ru', readerResponse: false }
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][2], { language: 'ru', readerResponse: true });
  });

  test('DTO принимает только известные языки', async () => {
    const { validate } = require('class-validator');
    const ok = Object.assign(new dtoModule.SearchForEvidenceDto(), {
      subject: 'ключевая ставка',
      language: 'ru',
    });
    const without = Object.assign(new dtoModule.SearchForEvidenceDto(), {
      subject: 'ключевая ставка',
    });
    const wrong = Object.assign(new dtoModule.SearchForEvidenceDto(), {
      subject: 'ключевая ставка',
      language: 'klingon',
    });

    assert.deepEqual(await validate(ok), []);
    assert.deepEqual(await validate(without), []);
    assert.equal((await validate(wrong)).length > 0, true);
  });
});
