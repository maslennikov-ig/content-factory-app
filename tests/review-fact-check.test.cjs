'use strict';
/**
 * Проверка фактов по утверждениям, честные режимы проверки и выделение,
 * пережившее правку (`content-factory-next-97dq.3`, восьмой заход 18.09.2026).
 *
 * Всё платное здесь записано: ответы модели заданы строками, поиск — двойник.
 */
require('reflect-metadata');
const fs = require('node:fs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const root = 'libraries/nestjs-libraries/src/content-intelligence/pieces';

let calls = [];
let claimsAnswer;
let reviewAnswer;
let denied = false;

const isClaims = (body) =>
  String(body.messages?.[0]?.content ?? '').includes('piece-claims/v1');
const claimsCalls = () => calls.filter(({ body }) => isClaims(body));
const reviewCalls = () => calls.filter(({ body }) => !isClaims(body));

const clients = {
  getOpenAiClient: async () => ({
    chat: {
      completions: {
        create: async (body, options) => {
          calls.push({ body, options });
          const answer = isClaims(body) ? claimsAnswer : reviewAnswer;
          if (answer instanceof Error) throw answer;
          return {
            choices: [
              {
                message: {
                  content:
                    typeof answer === 'string' ? answer : JSON.stringify(answer),
                },
              },
            ],
          };
        },
      },
    },
  }),
  getModelForRole: async (_org, role) => `${role}-model`,
};

const mocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': clients,
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': {
    AgentGraphService: class {},
  },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': {
    IntegrationManager: class {},
  },
  './piece.repository': { PieceRepository: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
    AiUsageService: class {},
  },
  '../search/text-search.service': { TextSearchService: class {} },
};

const { PieceService } = loadWithMocks(`${root}/piece.service.ts`, mocks);
const {
  reviewPromptV5,
  catalogDelta,
  catalogFindingsOf,
  REVIEW_PROMPT_VERSION_V5,
} = loadWithMocks(`${root}/review-prompt.v5.ts`, mocks);
const { reviewOnceV3, reviewPromptV3, REVIEW_PROMPT_VERSION } = loadWithMocks(
  `${root}/review.v3.ts`,
  mocks
);
const {
  checkableClaims,
  claimQueries,
  REVIEW_CLAIM_QUERIES_MAX,
  REVIEW_CLAIM_TEXT_CHARS,
} = loadWithMocks(`${root}/review-claims.ts`, mocks);
const { reviewTextOf, strongToBold, postAsReviewText } = loadWithMocks(
  `${root}/review-input.ts`,
  mocks
);
const { editorHtml } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/brief/editor-html.ts',
  mocks
);

const stamp = new Date('2026-09-18T10:00:00Z');
const piece = {
  id: 'piece',
  kind: 'CORE',
  body: 'Суть: комиссия выросла.',
  brief: {
    brief: {
      facts: [{ statement: 'Комиссия 10%', verified: true, selected: true }],
    },
    personText: 'Мои слова.',
  },
};

/** Тело адаптации со звёздочками и пост, в точности из него собранный. */
const BODY = 'Комиссия выросла до 10%.\n\nЭто **важно** для продавцов.';
const draftFor = (body = BODY, content = editorHtml(body, 'html')) => ({
  id: 'adaptation',
  title: 'Комиссия',
  body,
  updatedAt: stamp,
  postId: 'post',
  post: {
    id: 'post',
    state: 'DRAFT',
    content,
    updatedAt: stamp,
    deletedAt: null,
    integration: { providerIdentifier: 'telegram' },
  },
});

let repository;
let usage;
let web;
let researchCalls;

const serviceWith = (webDouble) =>
  new PieceService(
    repository,
    {},
    { getSocialIntegration: () => ({ editor: 'html' }) },
    () => stamp,
    null,
    usage,
    undefined,
    null,
    null,
    webDouble
  );

beforeEach(() => {
  process.env.JWT_SECRET = 'test-review-signing-key';
  calls = [];
  denied = false;
  researchCalls = [];
  claimsAnswer = {
    claims: [
      { text: 'Комиссия 10%', hasNumber: true, searchQuery: 'комиссия 10% 2026' },
      {
        text: 'Продавцов стало больше',
        hasNumber: false,
        searchQuery: 'рост числа продавцов маркетплейсов',
      },
    ],
  };
  reviewAnswer = { changes: [], verdict: 'clean', summary: 'Всё сходится.' };
  repository = {
    getPiece: jest.fn(async () => piece),
    reviewDraft: jest.fn(async () => draftFor()),
    acceptReviewV2: jest.fn(async () => ({ accepted: true })),
  };
  usage = {
    executeAiOperation: jest.fn(async (_org, _operation, action) => {
      if (denied)
        throw Object.assign(new Error('quota'), {
          status: 429,
          code: 'AI_QUOTA_EXCEEDED',
        });
      return action();
    }),
  };
  web = {
    research: jest.fn(async (_org, subject, options) => {
      researchCalls.push({ subject, options });
      return {
        summary: 'сводка поиска',
        sources: [
          { url: 'https://example.com/a', title: 'Источник А' },
          { url: 'https://example.com/b', title: 'Источник Б' },
        ],
        facts: [
          { sourceUrl: 'https://example.com/a', text: 'Комиссия составляет 12%.' },
          { sourceUrl: 'https://example.com/b', text: 'Продавцов стало больше.' },
        ],
      };
    }),
  };
});

/* ---------------------------------------------------------------------------
 * 1. Поиск по утверждениям, а не по началу текста
 * ------------------------------------------------------------------------ */

test('fact check extracts claims, buys one query per claim and hands their sources to the review', async () => {
  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );

  expect(claimsCalls()).toHaveLength(1);
  expect(claimsCalls()[0].body.model).toBe('extract-model');
  expect(web.research).toHaveBeenCalledTimes(1);
  expect(researchCalls[0].options).toEqual({
    level: 'standard',
    task: 'facts',
    language: 'ru',
    queries: ['комиссия 10% 2026', 'рост числа продавцов маркетплейсов'],
  });
  expect(result.factCheck).toEqual({
    claims: 2,
    queries: ['комиссия 10% 2026', 'рост числа продавцов маркетплейсов'],
    searched: true,
    extracted: 2,
    unphrased: 0,
  });
  expect(result.sources.map(({ url }) => url)).toEqual([
    'https://example.com/a',
    'https://example.com/b',
  ]);
  // Проверяющая модель получает выдержки источников, а не сводку поиска.
  const sent = JSON.parse(reviewCalls()[0].body.messages[1].content);
  expect(sent.sources).toHaveLength(2);
  expect(JSON.stringify(reviewCalls()[0].body.messages)).not.toContain(
    'сводка поиска'
  );
});

test('the whole draft reaches claim extraction, not its first five thousand characters', async () => {
  const long = `${'я'.repeat(9_000)}\nКомиссия выросла до 10%.`;
  repository.reviewDraft.mockResolvedValue(draftFor(long));

  await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );

  const asked = JSON.parse(claimsCalls()[0].body.messages[1].content).text;
  expect(asked).toHaveLength(long.length);
  expect(asked).toContain('Комиссия выросла до 10%.');
  expect(REVIEW_CLAIM_TEXT_CHARS).toBe(20_000);
});

test('more claims than the budget still buy at most the bounded number of queries', async () => {
  claimsAnswer = {
    claims: Array.from({ length: 12 }, (_, index) => ({
      text: `Утверждение ${index}`,
      hasNumber: true,
      searchQuery: `запрос ${index}`,
    })),
  };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );

  expect(REVIEW_CLAIM_QUERIES_MAX).toBe(6);
  expect(result.factCheck.queries).toHaveLength(REVIEW_CLAIM_QUERIES_MAX);
  expect(researchCalls[0].options.queries).toHaveLength(REVIEW_CLAIM_QUERIES_MAX);
});

test('two claims phrased into one query are searched once', async () => {
  claimsAnswer = {
    claims: [
      { text: 'Комиссия 10%', hasNumber: true, searchQuery: 'комиссия 10%' },
      { text: 'Та же комиссия', hasNumber: true, searchQuery: ' Комиссия 10% ' },
      { text: 'Мнение автора', hasNumber: false, searchQuery: null },
    ],
  };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );

  expect(result.factCheck.queries).toEqual(['комиссия 10%']);
  expect(claimQueries([{ searchQuery: 'a' }, { searchQuery: 'a' }])).toEqual(['a']);
});

test('nothing checkable is a quiet successful result: no search, no review call, no error', async () => {
  claimsAnswer = { claims: [] };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );

  expect(web.research).not.toHaveBeenCalled();
  expect(reviewCalls()).toHaveLength(0);
  expect(result.verdict).toBe('clean');
  expect(result.changes).toEqual([]);
  expect(result.factCheck).toEqual({
    claims: 0,
    queries: [],
    searched: false,
    extracted: 0,
    unphrased: 0,
  });
  expect(result.summary).toBe(
    'Проверять нечего: в тексте нет утверждений, которые можно сверить с источниками.'
  );
  expect(result.text).toBe(result.originalText);
  expect(typeof result.token).toBe('string');
  // Один платный вызов на всю проверку — разбор утверждений.
  expect(usage.executeAiOperation).toHaveBeenCalledTimes(1);
});

/**
 * P2-9. «Нашли, но не смогли спросить» — это наш пробел, а не свойство текста,
 * и одним словом с «проверять нечего» они называться не должны.
 */
test('claims found but none phrasable says so, and never calls it nothing to check', async () => {
  claimsAnswer = {
    claims: [
      { text: 'Комиссия выросла', hasNumber: true, searchQuery: null },
      { text: 'Продавцов больше', hasNumber: true },
      { text: 'Оборот вырос', hasNumber: true, searchQuery: '   ' },
    ],
  };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );

  expect(web.research).not.toHaveBeenCalled();
  expect(reviewCalls()).toHaveLength(0);
  expect(result.verdict).toBe('clean');
  expect(result.summary).toBe(
    'Нашли 3 утверждения, но не смогли составить по ним поисковый запрос. Поиск не запускали.'
  );
  expect(result.summary).not.toContain('Проверять нечего');
  expect(result.factCheck).toEqual({
    claims: 0,
    queries: [],
    searched: false,
    extracted: 3,
    unphrased: 3,
  });
});

test.each([
  [1, 'Нашли 1 утверждение, но не смогли'],
  [2, 'Нашли 2 утверждения, но не смогли'],
  [5, 'Нашли 5 утверждений, но не смогли'],
])('%i unphrased claims are counted in readable Russian', async (count, said) => {
  claimsAnswer = {
    claims: Array.from({ length: count }, (_, index) => ({
      text: `Утверждение ${index}`,
      hasNumber: true,
      searchQuery: null,
    })),
  };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );
  expect(result.summary.startsWith(said)).toBe(true);
});

/**
 * P2-8. Один негодный пункт не отменяет проверку, за которую человек заплатил.
 */
test('an oversized or malformed claim is dropped alone, not with its valid siblings', async () => {
  claimsAnswer = {
    claims: [
      null,
      { text: 'я'.repeat(601), hasNumber: true, searchQuery: 'слишком длинное' },
      { text: '', hasNumber: true, searchQuery: 'пустой текст' },
      { text: 'Комиссия 10%', hasNumber: true, searchQuery: 'комиссия 10%' },
      { text: 'Оборот', hasNumber: true, searchQuery: 'ы'.repeat(241) },
    ],
  };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );

  expect(result.factCheck.queries).toEqual(['комиссия 10%']);
  expect(result.factCheck.extracted).toBe(1);
  expect(web.research).toHaveBeenCalledTimes(1);
});

test('forty-one claims are read to the cap instead of refusing the whole check', async () => {
  claimsAnswer = {
    claims: Array.from({ length: 41 }, (_, index) => ({
      text: `Утверждение ${index}`,
      hasNumber: true,
      searchQuery: `запрос ${index}`,
    })),
  };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );

  expect(result.factCheck.extracted).toBe(40);
  expect(result.factCheck.queries).toHaveLength(REVIEW_CLAIM_QUERIES_MAX);
});

test('an unusable claim answer refuses instead of claiming there was nothing to check', async () => {
  claimsAnswer = 'не json';

  await expect(
    serviceWith(web).reviewV2(
      'org',
      'piece',
      'adaptation',
      { mode: 'web', confirmWebSpend: true },
      'ru'
    )
  ).rejects.toMatchObject({ code: 'REVIEW_CLAIMS_INVALID', status: 502 });
  expect(web.research).not.toHaveBeenCalled();
  expect(claimsCalls()).toHaveLength(1);
});

test('a claim extraction denied by quota spends nothing and never reaches search', async () => {
  denied = true;

  await expect(
    serviceWith(web).reviewV2(
      'org',
      'piece',
      'adaptation',
      { mode: 'web', confirmWebSpend: true },
      'ru'
    )
  ).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED' });
  expect(calls).toHaveLength(0);
  expect(web.research).not.toHaveBeenCalled();
});

test('claim extraction is one admission on the extract role, not a review call', async () => {
  const found = await checkableClaims(
    'org',
    { text: 'Комиссия 10%.', language: 'ru' },
    usage
  );
  expect(usage.executeAiOperation).toHaveBeenCalledWith(
    'org',
    'content_classification',
    expect.any(Function),
    'extract'
  );
  expect(calls[0].options).toEqual({ maxRetries: 0, timeout: 60_000 });
  expect(found).toEqual({
    claims: [
      { text: 'Комиссия 10%', searchQuery: 'комиссия 10% 2026' },
      {
        text: 'Продавцов стало больше',
        searchQuery: 'рост числа продавцов маркетплейсов',
      },
    ],
    extracted: 2,
    unphrased: 0,
  });
});

/* ---------------------------------------------------------------------------
 * 2. Ready queries inside the research service: budget, cache, one reservation
 * ------------------------------------------------------------------------ */

describe('caller-supplied queries', () => {
  let aiConfig;
  let providerAnswer;
  let WebResearchService;
  let RESEARCH_CLASSIFY_PROMPT;
  let RESEARCH_LEVEL_PRESETS;

  /**
   * Записи каждого прогона — свои массивы, а не общие.
   *
   * `beforeEach` их обнуляет, но обнуления мало: двойники замыкаются на
   * ПЕРЕМЕННУЮ, поэтому брошенная работа упавшего по сроку теста дописывала
   * строку в массив уже следующего, и падал следующий. Здесь двойники
   * замыкаются на массивы своего прогона: опоздавшая запись уходит в мёртвый
   * массив, и соседний тест её не видит.
   */
  let admissions;
  let invoked;
  let classifierCalls;
  let reserved;
  let chatModelRoles;
  let encyclopedicCalls;
  /** Массивы текущего прогона, на которые замкнуты двойники. */
  let record;

  const load = () => {
    const runAdmissions = (admissions = []);
    const runInvoked = (invoked = []);
    const runClassifierCalls = (classifierCalls = []);
    const runReserved = (reserved = []);
    const runChatModelRoles = (chatModelRoles = []);
    const runEncyclopedicCalls = (encyclopedicCalls = []);
    record = {
      admissions: runAdmissions,
      invoked: runInvoked,
      classifierCalls: runClassifierCalls,
      reserved: runReserved,
      chatModelRoles: runChatModelRoles,
      encyclopedicCalls: runEncyclopedicCalls,
    };
    const loaded = loadWithMocks(
      'libraries/nestjs-libraries/src/openai/web.research.service.ts',
      {
        ...mocks,
        '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
          getActiveAiConfig: () => aiConfig,
          loadAiConfig: async () => aiConfig,
          requireActiveAiConfig: async () => aiConfig,
          withActiveAiConfig: (_org, _config, action) => action(),
        },
        '@contentfactory/nestjs-libraries/openai/ai.clients': {
          ...clients,
          WEB_SEARCH_TIMEOUT_MS: 20_000,
          WEB_SEARCH_PRIMARY_TIMEOUT_MS: 12_000,
          WEB_SEARCH_FALLBACK_TIMEOUT_MS: 8_000,
          WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
          WEB_SEARCH_MAX_RESULT_CHARS: 32_000,
          getChatModel: async (_org, _t, _max, role) => {
            runChatModelRoles.push(role);
            return { withStructuredOutput: () => ({}) };
          },
          getWebSearchClient: async () => ({
            invoke: async ({ query }) => {
              runInvoked.push(query);
              return {
                answer: providerAnswer,
                results: [
                  {
                    title: `Источник для ${query}`,
                    url: `https://example.com/${encodeURIComponent(query)}`,
                    content: `Факт про ${query}`,
                  },
                ],
              };
            },
          }),
        },
        '@langchain/core/prompts': {
          ChatPromptTemplate: {
            fromTemplate: (template) => ({
              pipe: () => ({
                invoke: async (input) => {
                  // Пересказ сводки идёт тем же швом; считаем только классификацию.
                  if (template.startsWith('Classify the research subject'))
                    runClassifierCalls.push({ template, input });
                  return {
                    scope: 'global',
                    subjectLanguage: 'ru',
                    englishQuery: 'iceland four day week',
                    subjectLanguageQuery: 'Исландия четырёхдневка',
                    freshnessRequired: false,
                  };
                },
              }),
            }),
          },
        },
      }
    );
    WebResearchService = loaded.WebResearchService;
    RESEARCH_CLASSIFY_PROMPT = loaded.RESEARCH_CLASSIFY_PROMPT;
    RESEARCH_LEVEL_PRESETS = loaded.RESEARCH_LEVEL_PRESETS;
  };

  beforeEach(() => {
    // Английский ответ поисковика на русский черновик: ровно тот случай, ради
    // которого раньше поднимался ещё один вызов модели (P2-7).
    providerAnswer = 'The commission is 12% for marketplace sellers.';
    aiConfig = {
      usageMode: 'included',
      provider: 'openrouter',
      apiKey: 'system-model-key',
      search: {
        enabled: true,
        provider: 'tavily',
        apiKey: 'system-search-key',
        apiKeys: { tavily: 'system-search-key' },
        keySources: { tavily: 'system' },
        topic: 'general',
        depth: 'advanced',
      },
    };
    // Массивы записей заводит `load()`, и заводит новые на каждый прогон —
    // здесь единственное место, откуда он зовётся.
    load();
  });

  /**
   * Бесключевая полоса энциклопедии ходит своим `fetchImpl`, и шов для него —
   * третий параметр службы. Без двойника она берёт настоящий `fetch`: каждый
   * `research` уходил в сеть за Wikipedia и Wikidata, набор ждал ответа или
   * отказа DNS, и один тест стоил секунды вместо миллисекунд. Под полным
   * прогоном это давало «Exceeded timeout of 5000 ms», а брошенный запрос
   * дописывал строку в `invoked` уже следующему тесту.
   */
  const encyclopedicDouble = (calls) => async (url) => {
    const address = String(url);
    calls.push(address);
    if (address.includes('/w/rest.php/v1/search/page'))
      return { ok: true, async json() { return { pages: [] }; } };
    if (address.includes('/api/rest_v1/page/summary/'))
      return { ok: true, async json() { return {}; } };
    return { ok: true, async json() { return { search: [] }; } };
  };

  const serviceDouble = () => {
    const usageDouble = {
      executeAiOperation: async (_org, _operation, action) => action(),
      beginAiOperationWithConfig: async (_org, operation, config) => {
        record.admissions.push({ operation, usageMode: config.usageMode });
        return { run: (action) => action(), finish: async () => undefined };
      },
    };
    const service = new WebResearchService(usageDouble, undefined, {
      fetchImpl: encyclopedicDouble(record.encyclopedicCalls),
    });
    service.quota = {
      reserve: async (_org, level) => {
        record.reserved.push(level);
      },
    };
    return service;
  };

  test('ready queries replace the classifier and are searched one by one', async () => {
    await serviceDouble().research('org', 'длинный черновик', {
      level: 'standard',
      task: 'facts',
      language: 'ru',
      queries: ['комиссия 10%', 'рост числа продавцов'],
    });

    expect(classifierCalls).toHaveLength(0);
    expect(invoked).toEqual(['комиссия 10%', 'рост числа продавцов']);
    // Одно исследование — одна бронь квоты и одно допущение расхода.
    expect(reserved).toEqual(['standard']);
    expect(admissions).toEqual([
      { operation: 'web_research', usageMode: 'included' },
    ]);
  });

  /**
   * P2-7. Сводку переписывают на язык читателя для того, кто её прочитает.
   * Проверка фактов её выбрасывает (`webReviewSources` берёт выдержки), а
   * платила за перевод английского ответа на русский черновик всё равно.
   */
  test('an English answer to a Russian fact check buys no restatement at all', async () => {
    const service = serviceDouble();
    let restated = 0;
    const original = service.summaryInLanguage.bind(service);
    service.summaryInLanguage = async (...args) => {
      restated += 1;
      return original(...args);
    };

    const result = await service.research('org', 'русский черновик', {
      level: 'standard',
      task: 'facts',
      language: 'ru',
      queries: ['комиссия 10%'],
    });

    expect(restated).toBe(0);
    expect(classifierCalls).toHaveLength(0);
    // Ни классификации, ни пересказа: роль `classify` не звали ни разу.
    expect(chatModelRoles).toEqual([]);
    expect(invoked).toEqual(['комиссия 10%']);
    // Сводка возвращается как есть — её всё равно никто на этой полосе не читает.
    expect(result.summary).toBe(providerAnswer);
  });

  /**
   * То же, что P2-7, но в задержке: полоса энциклопедии ищет имена сущностей, а
   * утверждение — это предложение. Круг запросов на каждое утверждение, до
   * восьми секунд ожидания и до двух мест из шести у проверяющей модели —
   * за статью, найденную не по делу.
   */
  test('caller queries open no encyclopedic lane: a claim is a sentence, not an entity', async () => {
    await serviceDouble().research('org', 'черновик', {
      level: 'standard',
      task: 'facts',
      language: 'ru',
      queries: ['комиссия Wildberries 10% для продавцов 2026', 'рост продавцов'],
    });
    expect(encyclopedicCalls).toEqual([]);
  });

  test('research without caller queries still opens the lane on the classifier entity', async () => {
    await serviceDouble().research('org', 'Ада Лавлейс', { level: 'standard' });
    expect(encyclopedicCalls.length).toBeGreaterThan(0);
    expect(encyclopedicCalls.every((url) => url.startsWith('https://'))).toBe(
      true
    );
  });

  test('a search without ready queries still restates an English summary for a Russian reader', async () => {
    const service = serviceDouble();
    await service.research('org', 'русский предмет', {
      level: 'standard',
      language: 'ru',
    });
    // Классификация плюс пересказ — обе на дешёвой роли.
    expect(chatModelRoles).toEqual(['classify', 'classify']);
  });

  test('a search that returned no summary buys no translation of the empty string', async () => {
    providerAnswer = undefined;
    const service = serviceDouble();
    await service.research('org', 'русский предмет', {
      level: 'standard',
      language: 'ru',
    });
    expect(chatModelRoles).toEqual(['classify']);
  });

  test('ready queries are trimmed, deduplicated and cut to the level budget', async () => {
    const many = Array.from({ length: 30 }, (_, index) => `запрос ${index}`);
    await serviceDouble().research('org', 'черновик', {
      level: 'quick',
      task: 'facts',
      queries: [' запрос 0 ', 'запрос 0', '', ...many],
    });

    expect(invoked).toHaveLength(RESEARCH_LEVEL_PRESETS.quick.maxSearchQueries);
    expect(invoked[0]).toBe('запрос 0');
    expect(new Set(invoked).size).toBe(invoked.length);
  });

  /**
   * P3. Пустой разделитель склеивал ["ab","c"] и ["a","bc"] в один ключ, и
   * вторая проверка получала источники первой.
   */
  test('two query lists that concatenate alike are still two different searches', async () => {
    const service = serviceDouble();
    await service.research('org', 'черновик', {
      level: 'standard',
      task: 'facts',
      queries: ['ab', 'c'],
    });
    await service.research('org', 'черновик', {
      level: 'standard',
      task: 'facts',
      queries: ['a', 'bc'],
    });
    expect(invoked).toEqual(['ab', 'c', 'a', 'bc']);
  });

  test('the same subject with different queries is two searches, the same queries one cached answer', async () => {
    const service = serviceDouble();
    await service.research('org', 'черновик', {
      level: 'standard',
      task: 'facts',
      queries: ['первый'],
    });
    await service.research('org', 'черновик', {
      level: 'standard',
      task: 'facts',
      queries: ['второй'],
    });
    expect(invoked).toEqual(['первый', 'второй']);

    await service.research('org', 'черновик', {
      level: 'standard',
      task: 'facts',
      queries: ['второй'],
    });
    expect(invoked).toEqual(['первый', 'второй']);
    expect(reserved).toEqual(['standard', 'standard']);
  });

  test('without queries the classifier still runs and still writes both language queries', async () => {
    await serviceDouble().research('org', 'Исландия и четырёхдневка', {
      level: 'standard',
      language: 'ru',
    });
    expect(classifierCalls).toHaveLength(1);
    expect(invoked).toEqual(['Исландия четырёхдневка', 'iceland four day week']);
  });

  /* 4. Язык предмета — язык его слов, а не страны, о которой он говорит. */
  test('the classifier prompt says the discussed country never changes subjectLanguage', () => {
    expect(RESEARCH_CLASSIFY_PROMPT).toContain(
      'Return subjectLanguage as a lowercase ISO 639-1 code: the language the subject itself is written in. The country the subject discusses never changes it — a Russian sentence about Iceland, Japan or Brazil has subjectLanguage "ru".'
    );
    expect(RESEARCH_CLASSIFY_PROMPT).toContain(
      'Only when scope is "local" may subjectLanguage be the language of that country instead, because a local subject is about the reader\'s own country.'
    );
    // Прежняя формулировка, из-за которой боевой лог написал `subjectLanguage=is`
    // на русском тексте про Исландию, ушла целиком.
    expect(RESEARCH_CLASSIFY_PROMPT).not.toContain(
      'or the language of the country whose rules, market or institutions it is about'
    );
    // У промпта не было версии — она добавлена, и прежний текст остаётся v1.
    expect(RESEARCH_CLASSIFY_PROMPT).toContain(
      'PROMPT VERSION: research-classify/v2'
    );
    expect(RESEARCH_CLASSIFY_PROMPT).toBe(
      fs
        .readFileSync(
          'libraries/nestjs-libraries/src/openai/web.research.service.ts',
          'utf8'
        )
        .match(/export const RESEARCH_CLASSIFY_PROMPT = `([\s\S]*?)`;/)[1]
        .replace(
          '${RESEARCH_CLASSIFY_PROMPT_VERSION}',
          'research-classify/v2'
        )
    );
  });

  test('a recorded Russian subject about Iceland searches in Russian and English', async () => {
    await serviceDouble().research(
      'org',
      'Исландия и четырёхдневка как идея для российских компаний',
      { level: 'standard', language: 'ru' }
    );

    expect(classifierCalls[0].template).toContain(
      'The country the subject discusses never changes it'
    );
    expect(invoked).toEqual(['Исландия четырёхдневка', 'iceland four day week']);
  });
});

/* ---------------------------------------------------------------------------
 * 3. Честные режимы проверки
 * ------------------------------------------------------------------------ */

test('slop, facts and both no longer share one prompt', () => {
  const base = {
    text: 'Важно отметить, что комиссия выросла до 10%.',
    title: 'Комиссия',
    core: 'Комиссия выросла.',
    personText: 'Мои слова.',
    facts: [{ statement: 'Комиссия 10%' }],
    language: 'ru',
  };
  const slop = reviewPromptV5({ ...base, mode: 'slop' });
  const facts = reviewPromptV5({ ...base, mode: 'facts' });
  const both = reviewPromptV5({ ...base, mode: 'both' });

  expect(slop.system).not.toBe(facts.system);
  expect(slop.system).not.toBe(both.system);
  expect(facts.system).not.toBe(both.system);
  for (const prompt of [slop, facts, both])
    expect(prompt.system).toContain(
      `PROMPT VERSION: ${REVIEW_PROMPT_VERSION_V5}`
    );
  expect(REVIEW_PROMPT_VERSION_V5).toBe('adaptation-review-prompt/v5');
});

test('slop mode must address every catalog finding and may not touch facts', () => {
  const prompt = reviewPromptV5({
    text: 'Важно отметить, что комиссия выросла до 10%.',
    title: 'Комиссия',
    core: 'Комиссия выросла.',
    personText: 'Мои слова.',
    facts: [{ statement: 'Комиссия 10%' }],
    language: 'ru',
    mode: 'slop',
  });
  const sent = JSON.parse(prompt.user);

  expect(prompt.system).toContain('Address EVERY entry');
  expect(prompt.system).toContain(
    'Change no fact, number, date, name, quotation or the author position in this mode.'
  );
  expect(prompt.system).toContain('L52:');
  expect(sent.catalogFindings.length).toBeGreaterThan(0);
  // Суть и факты в этот режим не кладутся вовсе: нечего править — нечем и соблазнить.
  expect(sent).not.toHaveProperty('core');
  expect(sent).not.toHaveProperty('facts');
});

test('facts mode compares with the core and the selected facts and forbids style edits', () => {
  const prompt = reviewPromptV5({
    text: 'Важно отметить, что комиссия выросла до 10%.',
    title: 'Комиссия',
    core: 'Комиссия выросла.',
    personText: 'Мои слова.',
    facts: [{ statement: 'Комиссия 10%' }],
    language: 'ru',
    mode: 'facts',
  });
  const sent = JSON.parse(prompt.user);

  expect(prompt.system).toContain(
    'compare the text with the supplied core and facts ONLY'
  );
  expect(prompt.system).toContain('Change no style, cliche, tone');
  expect(sent.core).toBe('Комиссия выросла.');
  expect(sent.facts).toEqual([{ statement: 'Комиссия 10%' }]);
  expect(sent).not.toHaveProperty('catalogFindings');
});

test('both mode carries the style half and the factual half at once', () => {
  const prompt = reviewPromptV5({
    text: 'Важно отметить, что комиссия выросла до 10%.',
    title: 'Комиссия',
    core: 'Комиссия выросла.',
    personText: 'Мои слова.',
    facts: [],
    language: 'ru',
    mode: 'both',
  });
  const sent = JSON.parse(prompt.user);

  expect(prompt.system).toContain('Address EVERY entry');
  expect(prompt.system).toContain(
    'compare the text with the supplied core and facts ONLY'
  );
  expect(sent).toHaveProperty('core');
  expect(sent.catalogFindings.length).toBeGreaterThan(0);
});

test('web mode stays evidence-only and carries no style catalog', () => {
  const prompt = reviewPromptV5({
    text: 'Важно отметить, что комиссия выросла до 10%.',
    title: 'Комиссия',
    core: 'Комиссия выросла.',
    personText: '',
    facts: [],
    language: 'ru',
    mode: 'web',
    sources: [{ url: 'https://example.com/a', excerpt: 'Комиссия 12%.' }],
  });
  const sent = JSON.parse(prompt.user);

  expect(prompt.system).toContain('correct only wording that contradicts');
  expect(prompt.system).not.toMatch(/L52:|A29:/);
  expect(sent).not.toHaveProperty('catalogFindings');
  expect(sent.sources).toHaveLength(1);
});

test('the v3 prompt stays frozen at v4 while the review sends v6', async () => {
  expect(REVIEW_PROMPT_VERSION).toBe('adaptation-review-prompt/v4');
  expect(
    reviewPromptV3({
      text: 'Текст.',
      title: 'Т',
      core: '',
      personText: '',
      facts: [],
      language: 'ru',
      mode: 'slop',
    }).system
  ).toContain('PROMPT VERSION: adaptation-review-prompt/v4');

  reviewAnswer = { changes: [], verdict: 'clean', summary: '' };
  await reviewOnceV3(
    'org',
    {
      text: 'Текст.',
      title: 'Т',
      core: '',
      personText: '',
      facts: [],
      language: 'ru',
      mode: 'slop',
    },
    usage
  );
  // С 22.09.2026 (`97dq.33`) проверка идёт преемником v6; v5 остаётся для
  // записанных ответов и проверяется наборами выше.
  expect(reviewCalls()[0].body.messages[0].content).toContain(
    'PROMPT VERSION: adaptation-review-prompt/v6'
  );
});

test('the review reports which catalog findings went and which stayed', async () => {
  const text =
    'Важно отметить, что комиссия выросла. В современном мире это не секрет.';
  reviewAnswer = {
    changes: [
      {
        id: 'stamp',
        excerpt: 'Важно отметить, что ',
        replacement: '',
        ruleId: 'A1',
        why: 'Штамп.',
        basket: 'show',
      },
    ],
    verdict: 'review',
    summary: 'Убран один штамп.',
  };

  const result = await reviewOnceV3(
    'org',
    {
      text,
      title: 'Комиссия',
      core: '',
      personText: '',
      facts: [],
      language: 'ru',
      mode: 'slop',
    },
    usage
  );

  expect(result.slopBefore).toBeGreaterThan(result.slopAfter);
  expect(result.catalog.removed.length).toBe(
    result.slopBefore - result.slopAfter
  );
  for (const finding of [...result.catalog.removed, ...result.catalog.remaining])
    expect(Object.keys(finding).sort()).toEqual(['excerpt', 'ruleId']);
  expect(
    result.catalog.removed.some(({ excerpt }) =>
      excerpt.includes('Важно отметить')
    )
  ).toBe(true);
  expect(
    result.catalog.remaining.some(({ excerpt }) =>
      excerpt.includes('В современном мире')
    )
  ).toBe(true);
});

test('the same stamp three times, two of them removed, reads as two gone and one left', () => {
  const finding = (excerpt) => ({ ruleId: 'A1', excerpt });
  const delta = catalogDelta(
    [finding('штамп'), finding('штамп'), finding('штамп')],
    [finding('штамп')]
  );
  expect(delta.removed).toHaveLength(2);
  expect(delta.remaining).toHaveLength(1);
});

test('a finding the review introduced is not counted as one that stayed', () => {
  const delta = catalogDelta(
    [{ ruleId: 'A1', excerpt: 'старое' }],
    [{ ruleId: 'A1', excerpt: 'новое' }]
  );
  expect(delta.removed).toEqual([{ ruleId: 'A1', excerpt: 'старое' }]);
  expect(delta.remaining).toEqual([]);
});

/* ---------------------------------------------------------------------------
 * 5. Отдельная негодная правка не отменяет всю проверку (xmfb.6)
 * ------------------------------------------------------------------------ */

test('two overlapping changes lose the later one, not the whole review', async () => {
  const text = 'Комиссия выросла до 10 процентов сегодня.';
  const warnings = [];
  reviewAnswer = {
    changes: [
      {
        id: 'first',
        excerpt: 'Комиссия выросла до 10 процентов',
        replacement: 'Комиссия выросла до 12 процентов',
        why: 'Число.',
        basket: 'show',
      },
      {
        id: 'second',
        excerpt: 'до 10 процентов сегодня',
        replacement: 'до 12 процентов вчера',
        why: 'Дата.',
        basket: 'show',
      },
    ],
    verdict: 'review',
    summary: 'Правки.',
  };

  const result = await reviewOnceV3(
    'org',
    {
      text,
      title: 'Комиссия',
      core: '',
      personText: '',
      facts: [],
      language: 'ru',
      mode: 'facts',
    },
    usage,
    (message) => warnings.push(message)
  );

  expect(result.changes.map(({ id }) => id)).toEqual(['first']);
  expect(result.text).toContain('12 процентов');
  expect(warnings).toContain(
    'Review validation discarded a change: REVIEW_CHANGE_OVERLAP'
  );
  expect(reviewCalls()).toHaveLength(1);
});

test('a failed review spends its admission once and never retries a paid provider', async () => {
  denied = true;
  await expect(
    reviewOnceV3(
      'org',
      {
        text: 'Текст.',
        title: 'Т',
        core: '',
        personText: '',
        facts: [],
        language: 'ru',
        mode: 'slop',
      },
      usage
    )
  ).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED' });
  expect(calls).toHaveLength(0);
});

/* ---------------------------------------------------------------------------
 * 3 (передача от S2). Выделение переживает проверку и перегенерацию
 * ------------------------------------------------------------------------ */

test('bold survives the round trip: review reads ** and acceptance writes <strong>', async () => {
  reviewAnswer = {
    changes: [
      {
        id: 'edit',
        excerpt: 'Комиссия выросла до 10%.',
        replacement: 'Комиссия выросла до 12%.',
        why: 'Число.',
        basket: 'show',
      },
    ],
    verdict: 'review',
    summary: 'Число уточнено.',
  };

  const service = serviceWith(web);
  const result = await service.reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'facts' },
    'ru'
  );

  // Проверка читает каноническое тело со звёздочками, а не пост без тегов.
  expect(result.originalText).toBe(BODY);
  expect(JSON.parse(reviewCalls()[0].body.messages[1].content).currentText).toBe(
    BODY
  );
  expect(result.text).toContain('**важно**');

  await service.acceptReviewV2('org', 'piece', 'adaptation', {
    token: result.token,
    selectedIds: ['edit'],
  });
  const [, , , , savedBody, savedContent] =
    repository.acceptReviewV2.mock.calls[0];
  expect(savedBody).toContain('**важно**');
  expect(savedContent).toContain('<strong>важно</strong>');
  expect(savedContent).not.toContain('**');
  expect(savedContent).toBe(editorHtml(savedBody, 'html'));
});

test('a post edited by hand wins over the stored body, and its <strong> comes back as **', async () => {
  repository.reviewDraft.mockResolvedValue(
    draftFor(BODY, '<p>Новый ручной текст с <strong>выделением</strong>.</p>')
  );
  reviewAnswer = { changes: [], verdict: 'clean', summary: '' };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'slop' },
    'ru'
  );

  expect(result.originalText).toBe('Новый ручной текст с **выделением**.');
  expect(editorHtml(result.originalText, 'html')).toBe(
    '<p>Новый ручной текст с <strong>выделением</strong>.</p>'
  );
});

test('the review input helper prefers the canonical body only while the post derives from it', () => {
  const derived = draftFor();
  expect(reviewTextOf(derived, 'html')).toBe(BODY);
  expect(reviewTextOf(draftFor(BODY, '<p>Другое</p>'), 'html')).toBe('Другое');
  // Редактор без разметки: тело всё равно каноническое, пока пост из него выводится.
  const plain = draftFor(BODY, editorHtml(BODY, 'normal'));
  expect(reviewTextOf(plain, 'normal')).toBe(BODY);
  // Пустое тело старых адаптаций читается из поста.
  expect(reviewTextOf(draftFor('', '<p>Только пост</p>'), 'html')).toBe(
    'Только пост'
  );
});

test('only a single-line non-empty span becomes a ** pair again', () => {
  expect(strongToBold('<p>а <strong>б</strong> в</p>')).toBe('<p>а **б** в</p>');
  expect(strongToBold('<b>жирно</b>')).toBe('**жирно**');
  expect(strongToBold('<strong> </strong>')).toBe('<strong> </strong>');
  expect(strongToBold('<strong>две\nстроки</strong>')).toBe(
    '<strong>две\nстроки</strong>'
  );
  expect(strongToBold('<strong>уже **есть**</strong>')).toBe(
    '<strong>уже **есть**</strong>'
  );
});

/**
 * P2-14. Редактор пишет `<strong>жирно </strong>` от одного лишнего движения
 * мышью, а `editorHtml` парой с пробелом у края не считает и снимает обе
 * звёздочки. Пробел выносится наружу маркеров, и круг замыкается.
 */
test.each([
  ['<p>Есть <strong>жирно </strong>ещё.</p>', '<p>Есть **жирно** ещё.</p>'],
  ['<p><strong> жирно</strong> ещё.</p>', '<p> **жирно** ещё.</p>'],
  ['<p><b>  жирно  </b>.</p>', '<p>  **жирно**  .</p>'],
])('a span padded with spaces round-trips: %s', (html, expected) => {
  expect(strongToBold(html)).toBe(expected);
});

test('bold with a trailing space inside the tag survives a full post round trip', () => {
  const html = '<p>Есть <strong>жирно </strong>ещё.</p>';
  const text = postAsReviewText(html, 'html');
  expect(text).toBe('Есть **жирно** ещё.');
  expect(editorHtml(text, 'html')).toBe('<p>Есть <strong>жирно</strong> ещё.</p>');
  // Раньше маркеры на этом шаге пропадали вместе с выделением.
  expect(editorHtml(text, 'html')).toContain('<strong>');
});

/*
  `content-factory-next-97dq.77` (review-97dq75 P3-15): a post edited outside
  the adaptation editor was read by `htmlToPlainText`, and its links lost
  their addresses; an accepted edit then wrote the post back without them.
*/
test('a hand-edited post keeps its links in the review text and back in the post', () => {
  const html =
    '<p>См. <a href="https://example.com/r?a=1&amp;b=2">отчёт [PDF]</a>, <a href="https://x.com">https://x.com</a> и <a href="javascript:alert(1)">клик</a>.</p><p><a href="https://y.com/p"><strong>жирная</strong> ссылка</a></p>';
  const text = postAsReviewText(html, 'html');
  expect(text).toBe(
    'См. [отчёт \\[PDF\\]](https://example.com/r?a=1&b=2), https://x.com и клик.\n\n[**жирная** ссылка](https://y.com/p)'
  );
  const back = editorHtml(text, 'html');
  expect(back).toContain('<a href="https://example.com/r?a=1&amp;b=2">отчёт [PDF]</a>');
  expect(back).toContain('<a href="https://y.com/p"><strong>жирная</strong> ссылка</a>');
  expect(back).not.toContain('javascript:');
});

test('review F5: link words with a raw newline and an unquoted href keep the link', () => {
  const html =
    '<p>См. <a href="https://example.com/r">годовой\nотчёт</a> и <a href=https://x.com/p>тут</a>.</p>';
  const text = postAsReviewText(html, 'html');
  expect(text).toBe('См. [годовой отчёт](https://example.com/r) и [тут](https://x.com/p).');
  const back = editorHtml(text, 'html');
  expect(back).toContain('<a href="https://example.com/r">годовой отчёт</a>');
  expect(back).toContain('<a href="https://x.com/p">тут</a>');
});

test('a nested tag inside a span keeps its words even though the bold is lost', () => {
  const html = '<p><strong>очень <em>важно</em></strong>.</p>';
  expect(postAsReviewText(html, 'html')).toBe('очень важно.');
});

test('the v5 prompt tells the model the ** markers are part of the text', () => {
  const prompt = reviewPromptV5({
    text: BODY,
    title: 'Комиссия',
    core: '',
    personText: '',
    facts: [],
    language: 'ru',
    mode: 'slop',
  });
  expect(prompt.system).toContain('Bold is written as **text**');
});

/* ---------------------------------------------------------------------------
 * P2-17. Каталог считается порогами площадки, а не порогами «по умолчанию»
 * ------------------------------------------------------------------------ */

/** Три вопроса: телеграм это ловит (потолок 2), суть и `default` — нет. */
const THREE_QUESTIONS =
  'Что это значит? Почему так вышло? И кому это выгодно? Комиссия выросла до 10%.';

test('the catalog is counted by the platform thresholds, not by the defaults', () => {
  expect(catalogFindingsOf(THREE_QUESTIONS, 'ru', 'telegram')).toHaveLength(1);
  expect(catalogFindingsOf(THREE_QUESTIONS, 'ru', 'core')).toHaveLength(0);
});

test('an adaptation review counts its own channel, so the page line and «было N» agree', async () => {
  repository.reviewDraft.mockResolvedValue(draftFor(THREE_QUESTIONS));
  reviewAnswer = { changes: [], verdict: 'clean', summary: '' };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'slop' },
    'ru'
  );

  // Площадка черновика — telegram, и число то же, что даст страница.
  expect(result.slopBefore).toBe(
    catalogFindingsOf(THREE_QUESTIONS, 'ru', 'telegram').length
  );
  expect(result.slopBefore).toBe(1);
  expect(result.catalog.remaining).toEqual([
    { ruleId: 'rhetorical-questions', excerpt: expect.any(String) },
  ]);
  // И та же площадка уехала в промпт, а не «default».
  const sent = JSON.parse(reviewCalls()[0].body.messages[1].content);
  expect(sent.catalogFindings).toHaveLength(1);
});

test('a core review counts by the core thresholds the acceptance also uses', async () => {
  repository.getPiece.mockResolvedValue({ ...piece, body: THREE_QUESTIONS });
  reviewAnswer = { changes: [], verdict: 'clean', summary: '' };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    undefined,
    { mode: 'slop' },
    'ru'
  );

  expect(result.slopBefore).toBe(0);
});

test('the quiet fact-check result counts its catalog by the same platform', async () => {
  repository.reviewDraft.mockResolvedValue(draftFor(THREE_QUESTIONS));
  claimsAnswer = { claims: [] };

  const result = await serviceWith(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );

  expect(result.slopBefore).toBe(1);
  expect(result.catalog.remaining).toHaveLength(1);
});

/* ---------------------------------------------------------------------------
 * P2-19. Непустое тело никогда не превращается в пустой пост
 * ------------------------------------------------------------------------ */

// One bold grammar (`libraries/helpers/src/utils/bold-markers.ts`, 97dq.2) took
// the reachable case away: `****` is no longer a pair with nothing inside, it
// is four asterisks, and it reaches the post as itself. The guard in
// `renderedPost` stays as the backstop for a future grammar; what is pinned
// here is the behaviour a person can actually meet.
/*
  Through the live accept door (`97dq.18`): a signed review whose one change
  turns `excerpt` into `replacement`, accepted by id.
*/
const acceptThrough = async (excerpt, replacement) => {
  reviewAnswer = {
    changes: [{ id: 'edit', excerpt, replacement, why: 'Правка.', basket: 'show' }],
    verdict: 'review',
    summary: '',
  };
  const service = serviceWith(web);
  const result = await service.reviewV2('org', 'piece', 'adaptation', { mode: 'slop' }, 'ru');
  await service.acceptReviewV2('org', 'piece', 'adaptation', {
    token: result.token,
    selectedIds: ['edit'],
  });
};

test('a markup-only edit is written as the characters it is, not as an empty post', async () => {
  repository.reviewDraft.mockResolvedValue(draftFor('Текст.'));
  expect(editorHtml('****', 'html')).toBe('<p>****</p>');

  await acceptThrough('Текст.', '****');
  expect(repository.acceptReviewV2.mock.calls[0][5]).toBe('<p>****</p>');
});

test('no non-empty text renders to an empty post under the shared grammar', () => {
  for (const text of ['****', '**', '** **', '*** ***', '**\n**', '** x', 'x **']) {
    for (const editor of ['html', 'markdown', 'normal', 'none']) {
      expect(editorHtml(text, editor).trim()).not.toBe('');
    }
  }
});

test('an ordinary edit still renders and is written', async () => {
  repository.reviewDraft.mockResolvedValue(draftFor('Текст.'));
  await acceptThrough('Текст.', 'Новый **текст**.');
  expect(repository.acceptReviewV2.mock.calls[0][5]).toBe(
    '<p>Новый <strong>текст</strong>.</p>'
  );
});
