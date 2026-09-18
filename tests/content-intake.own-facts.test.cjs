'use strict';

/**
 * Числа человека становятся строками опор, что бы ни вернула модель
 * (`content-factory-next-97dq.1`, живые прогоны 18.09.2026).
 *
 * Один и тот же вход в 170 знаков — «Исландский эксперимент с четырёхдневкой
 * охватил 25 тысяч человек и длился десять лет, а производительность выросла
 * на 40%. Хочу написать об этом пост как о доказанном факте.» — трижды прошёл
 * через настоящую модель и дал три разные формы ответа:
 *
 *  - **A** (без ресерча): три атомарные строки — так и надо;
 *  - **B** (с ресерчем): НИ ОДНОЙ своей строки. Проверять было нечего, сжатие
 *    выдумало четыре вердикта по несуществующим ключам, все четыре отброшены,
 *    и «25 тысяч», «десять лет», «40%» доехали до сути непроверенными при
 *    пустом `ungrounded`;
 *  - **C** (с ресерчем): ОДНА склеенная строка с припиской «Автор утверждает,
 *    что…» — поправка заменила весь отрезок разом, и приписка уехала бы в
 *    текст как слова человека.
 *
 * Вход короткий, и разбор чужого текста до него не доходит вовсе (порог
 * `FOREIGN_POST_MIN_CHARS`): форму строк здесь решает заполнение брифа, и
 * правило «одно число — одна строка» живёт в промпте `intake-brief-fill/v5` и
 * в детерминированной сетке `own-facts.ts` за ним.
 */

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const SERVICE =
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts';

const { WebSearchNotConfigured, usableHttpsUrl } = loadWithMocks(
  'libraries/nestjs-libraries/src/openai/web.research.service.ts'
);

const {
  settleOwnFacts,
  splitOwnStatement,
  stripAuthorAttribution,
} = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/own-facts.ts',
  {
    // Суть здесь не пишется: нужен только её детектор авторских чисел.
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      getChatModel: async () => {
        throw new Error('no model belongs in this suite');
      },
    },
  }
);

const { researchDigestPrompt, settleResearchDigest, digestSourcesFor } =
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.ts',
    {
      '@contentfactory/nestjs-libraries/dtos/content.language': {
        contentLanguageNames: { ru: 'Russian', en: 'English' },
      },
    }
  );

const { briefFillPromptV5, BRIEF_FILL_PROMPT_VERSION_V5 } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v5.ts'
);

const modelCalls = [];
let modelAnswers = [];

const { IntakeService } = loadWithMocks(SERVICE, {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': {
    AgentGraphService: class {},
  },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
    WEB_SEARCH_MAX_RESULT_CHARS: 24_000,
    WEB_SEARCH_PRIMARY_TIMEOUT_MS: 1_000,
    WEB_SEARCH_FALLBACK_TIMEOUT_MS: 1_000,
    getWebSearchClient: () => {
      throw new Error('no web search client belongs in this suite');
    },
    getChatModel: async (organizationId, temperature, tokens, role) => ({
      withStructuredOutput: () => ({
        invoke: async (prompt) => {
          modelCalls.push({ organizationId, role, prompt });
          if (!modelAnswers.length) {
            throw new Error(`the service asked the model one time too many (${role})`);
          }
          const next = modelAnswers.shift();
          return typeof next === 'function' ? next(prompt) : next;
        },
      }),
    }),
  },
  '@contentfactory/nestjs-libraries/openai/web.research.service': {
    WebResearchService: class {},
    WebSearchNotConfigured,
    ResearchQuotaExceeded: class extends Error {},
    WebSearchFallbackError: class extends Error {},
    RESEARCH_LEVEL_PRESETS: {
      quick: { maxSearchQueries: 4, maxSources: 8 },
      standard: { maxSearchQueries: 10, maxSources: 20 },
      deep: { maxSearchQueries: 25, maxSources: 50 },
    },
    usableHttpsUrl,
  },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
    AiUsageService: class {},
  },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
    { ContentSourceRegistryService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-fetch.gateway':
    { SourceFetchGateway: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-parser':
    { parseSourcePayload: () => { throw new Error('no parser here'); } },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-access-policy':
    {
      assertDomainAllowed: () => {},
      assertRobotsAllowed: () => {},
      parseDeniedDomains: () => [],
      robotsUrlFor: (url) => `${new URL(url).origin}/robots.txt`,
    },
  '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.service':
    { ContentFactService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
    { BrandProfileContextService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
    { IntegrationService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': {
    IntegrationManager: class {},
  },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});

/* ------------------------------------------------------------------ фикстуры */

/** Вход живого прогона, слово в слово. */
const THOUGHT =
  'Исландский эксперимент с четырёхдневкой охватил 25 тысяч человек и длился десять лет, а производительность выросла на 40%. Хочу написать об этом пост как о доказанном факте.';

/** Три строки, которые прогон A вернул сам. */
const ATOMIC_RUN_A = [
  'Исландский эксперимент с четырёхдневной рабочей неделей охватил 25 тысяч человек.',
  'Эксперимент длился десять лет.',
  'Производительность в рамках эксперимента выросла на 40%.',
];

/** Одна склеенная строка прогона C, вместе с припиской. */
const GLUED_RUN_C =
  'Автор утверждает, что исландский эксперимент с четырёхдневной рабочей неделей охватил 25 тысяч человек, длился десять лет, а производительность выросла на 40%.';

/** Три строки, которые сетка собирает из слов человека. */
const REBUILT = [
  'Исландский эксперимент с четырёхдневкой охватил 25 тысяч человек.',
  'Длился десять лет.',
  'Производительность выросла на 40%.',
];

const briefFill = (overrides = {}) => ({
  goal: 'разобрать исландский эксперимент',
  thesis:
    'Исландский эксперимент с четырёхдневной рабочей неделей показывает, что сокращение рабочего времени может привести к значительному росту производительности.',
  position: 'Я считаю это доказанным фактом',
  disagreement: 'Скептики сокращения недели',
  audience: 'руководители студий',
  format: 'expert',
  facts: [],
  origins: { goal: 'model', thesis: 'input', position: 'input', disagreement: 'model', audience: 'model', format: 'model' },
  options: { thesis: null, position: null, disagreement: null, audience: null },
  questions: [],
  ...overrides,
});

const ownRow = (statement) => ({ statement, factId: null, evidenceId: null });

const build = (options = {}) => {
  const calls = { research: [], recordCore: [] };
  modelCalls.length = 0;
  modelAnswers = [...(options.models || [])];
  let evidenceNumber = 0;
  const researchAnswers = [...(options.research || [])];
  const service = new IntakeService(
    { start: async function* () {} },
    {
      research: async (organizationId, subject, opts) => {
        calls.research.push([organizationId, subject, opts]);
        const next = researchAnswers.shift();
        if (!next) throw new WebSearchNotConfigured();
        return next;
      },
    },
    {
      acceptSearchResult: async (organizationId, input) => {
        evidenceNumber += 1;
        return {
          evidenceId: `ev-${evidenceNumber}`,
          url: input.url,
          title: input.title,
          excerpt: input.excerpt,
        };
      },
    },
    { fetch: async () => { throw new Error('no fetch here'); } },
    { listFacts: async () => [] },
    {
      resolve: async () => ({
        effectiveVoice: {
          persona: { portrait: 'Ведёт студию, пишет сам.' },
          project: { audiences: [{ name: 'руководители студий', need: 'сами ведут канал' }] },
          guardrails: { prohibitedClaims: [] },
        },
      }),
    },
    {
      recordCore: async (organizationId, input) => {
        calls.recordCore.push([organizationId, input]);
        return { id: 'piece-1', code: 'cnt-20' };
      },
    },
    { getIntegrationsList: async () => [] },
    { getSocialIntegration: () => undefined },
    {
      executeAiOperation: async (organizationId, operation, callback) => callback(),
    },
    () => new Date('2026-09-18T09:00:00.000Z'),
    () => ({ title: null, text: '' })
  );
  return { service, calls };
};

const drain = async (service, plan) => {
  const events = [];
  for await (const event of service.run('org-a', plan, 'user-1')) events.push(event);
  return events;
};
const named = (events, name) => events.filter((event) => event.name === name);
const request = (overrides = {}) => ({
  input: THOUGHT,
  inputKind: 'thought',
  language: 'ru',
  skipInterview: true,
  ...overrides,
});
const ownStatements = (brief) =>
  brief.facts.filter((fact) => fact.kind === 'own').map((fact) => fact.statement);

/* -------------------------------------------------------------------- правила */

describe('строки опор из слов человека: приписка, склейка, пропуск', () => {
  test('приписка «Автор утверждает, что…» снимается, слова остаются', () => {
    expect(stripAuthorAttribution(GLUED_RUN_C)).toBe(
      'Исландский эксперимент с четырёхдневной рабочей неделей охватил 25 тысяч человек, длился десять лет, а производительность выросла на 40%.'
    );
    expect(stripAuthorAttribution('По словам автора, рост составил 40%.')).toBe(
      'Рост составил 40%.'
    );
    expect(stripAuthorAttribution('The author claims that growth was 40%.')).toBe(
      'Growth was 40%.'
    );
    // Своё слово без приписки не трогается вовсе, даже точкой.
    expect(stripAuthorAttribution('Рост составил 40%')).toBe('Рост составил 40%');
  });

  test('предложение делится по запятой и союзу; неделимое остаётся дословным', () => {
    expect(
      splitOwnStatement(
        'Исландский эксперимент с четырёхдневкой охватил 25 тысяч человек и длился десять лет, а производительность выросла на 40%.'
      )
    ).toEqual(REBUILT);
    const single = 'Эксперимент охватил 25 тысяч человек за десять лет при росте 40%';
    expect(splitOwnStatement(single)).toEqual([single]);
  });

  test('запятая внутри числа границей не является', () => {
    /*
      Обзор корректности, P1-3. «Конверсия выросла с 1» и «2% до 3%» — это два
      числа, которых человек не писал, и оба уезжали в платную проверку как его
      утверждения.
    */
    const decimal = 'Конверсия выросла с 1,2% до 3%';
    expect(splitOwnStatement(decimal)).toEqual([decimal]);
    expect(splitOwnStatement('Цена 1,5 млн, а скидка 15%')).toEqual([
      'Цена 1,5 млн.',
      'Скидка 15%.',
    ]);
    expect(splitOwnStatement('Выручка 4,2 млрд, и это рост 37%')).toEqual([
      'Выручка 4,2 млрд.',
      'Это рост 37%.',
    ]);
  });

  test('часть без числа не становится отдельной опорой', () => {
    /*
      Обзор корректности, P2-3: «Потом всё изменилось.» — утверждение, которого
      человек не выдвигал и проверить которое нельзя. Оно возвращается соседней
      части, а не живёт строкой.
    */
    expect(
      splitOwnStatement('Мы работали десять лет, потом всё изменилось, рост 40%')
    ).toEqual(['Мы работали десять лет, потом всё изменилось.', 'Рост 40%.']);
    // Всё слилось в одну часть — строка возвращается дословно, даже без точки:
    // разложить не вышло, а переписывать чужую формулировку не за что.
    expect(
      splitOwnStatement('Потом всё изменилось, выручка выросла на 40%, и мы этому рады')
    ).toEqual(['Потом всё изменилось, выручка выросла на 40%, и мы этому рады']);
  });

  test('список без точек в конце строк делится по строкам', () => {
    /*
      Обзор корректности, P3: переносы строк схлопывались раньше, чем по ним
      делили, и маркированная мысль становилась одной строкой опоры на весь
      список.
    */
    const bullets = [
      '- конверсия выросла на 12%',
      '- выручка 4,2 млрд',
      '- команда 25 человек',
    ].join('\n');
    expect(
      settleOwnFacts({ facts: [], personText: bullets }).map((fact) => fact.statement)
    ).toEqual([
      'Конверсия выросла на 12%.',
      'Выручка 4,2 млрд.',
      'Команда 25 человек.',
    ]);
  });

  test('число внутри адреса не выдаёт себя за число человека', () => {
    /*
      Обзор корректности, P3: строка модели с адресом, где внутри стоит «40»,
      закрывала собой ненаписанную опору про рост на 40%.
    */
    const rows = settleOwnFacts({
      facts: [
        {
          statement: 'Отчёт лежит на https://example.test/report-40-25',
          origin: 'input',
          kind: 'own',
          status: 'unverified',
          verified: false,
          sourceUrl: null,
          factId: null,
          evidenceId: null,
        },
      ],
      personText: 'Производительность выросла на 40%.',
    }).map((fact) => fact.statement);

    expect(rows).toContain('Производительность выросла на 40%.');
  });

  test('прогон A: три атомарные строки проходят нетронутыми', () => {
    const facts = ATOMIC_RUN_A.map((statement) => ({
      ...ownRow(statement),
      origin: 'input',
      kind: 'own',
      status: 'unverified',
      verified: false,
      sourceUrl: null,
    }));
    expect(
      settleOwnFacts({ facts, personText: THOUGHT }).map((fact) => fact.statement)
    ).toEqual(ATOMIC_RUN_A);
  });
});

describe('заполнение брифа: одно число — одна строка', () => {
  test('промпт v5 просит строку на число, без приписок и без пустого списка', () => {
    const prompt = briefFillPromptV5({
      language: 'ru',
      material: THOUGHT,
      materialKind: 'thought',
      fixed: [],
      avatar: [],
      channel: [],
      facts: [],
      evidence: [],
    });
    expect(prompt).toContain(`PROMPT VERSION: ${BRIEF_FILL_PROMPT_VERSION_V5}`);
    expect(prompt).toContain('one number per row');
    expect(prompt).toContain('«Автор утверждает, что»');
    expect(prompt).toContain('`facts` is never empty');
  });

  test('прогон B: ни одной строки от модели — три строки из слов человека', async () => {
    const { service } = build({
      models: [briefFill(), { text: 'Суть.' }],
    });
    const plan = await service.prepare('org-a', request());
    const events = await drain(service, plan);
    const [filled] = named(events, 'brief-filled');

    expect(ownStatements(filled.brief)).toEqual(REBUILT);
    // И они честно стоят без опоры: их никто не проверял.
    expect(filled.brief.ungrounded).toEqual(REBUILT);
    expect(
      filled.brief.facts.every(
        (fact) => fact.origin === 'input' && fact.status === 'unverified' && !fact.verified
      )
    ).toBe(true);
  });

  test('прогон C: склеенная строка с припиской становится тремя строками', async () => {
    const { service } = build({
      models: [briefFill({ facts: [ownRow(GLUED_RUN_C)] }), { text: 'Суть.' }],
    });
    const plan = await service.prepare('org-a', request());
    const events = await drain(service, plan);
    const [filled] = named(events, 'brief-filled');

    expect(ownStatements(filled.brief)).toEqual([
      'Исландский эксперимент с четырёхдневной рабочей неделей охватил 25 тысяч человек.',
      'Длился десять лет.',
      'Производительность выросла на 40%.',
    ]);
    expect(
      filled.brief.facts.some((fact) => /Автор утверждает/u.test(fact.statement))
    ).toBe(false);
  });

  test('прогон A: три атомарные строки модели остаются как есть', async () => {
    const { service } = build({
      models: [briefFill({ facts: ATOMIC_RUN_A.map(ownRow) }), { text: 'Суть.' }],
    });
    const plan = await service.prepare('org-a', request());
    const events = await drain(service, plan);

    expect(ownStatements(named(events, 'brief-filled')[0].brief)).toEqual(ATOMIC_RUN_A);
  });

  test('числа чужого поста своими не становятся', async () => {
    const foreign = `${THOUGHT} `.repeat(4);
    const { service } = build({
      models: [
        {
          materialKind: 'foreign_post',
          topic: 'исландский эксперимент',
          angle: 'сокращение недели не снизило результат',
          structure: [],
          claims: [],
          voiceNotes: null,
        },
        briefFill({ facts: [] }),
      ],
    });
    // Без галочки: вид решает разбор, и он отвечает «чужой пост».
    const plan = await service.prepare(
      'org-a',
      request({ input: foreign, inputKind: undefined })
    );
    const events = await drain(service, plan);
    const [filled] = named(events, 'brief-filled');

    expect(filled.brief.inputKind).toBe('foreign_post');
    expect(ownStatements(filled.brief)).toEqual([]);
    expect(filled.brief.facts).toEqual([]);
  });
});

describe('сжатие без утверждений автора не просит вердиктов', () => {
  const source = {
    evidenceId: 'ev-1',
    url: 'https://alda.is/report',
    title: 'Отчёт',
    excerpt: 'The Reykjavík City trial (2014–2019) covered more than 2,500 workers.',
    text: null,
  };

  test('промпт без утверждений: нет раздела вердиктов, есть прямой запрет выдумывать', () => {
    const empty = researchDigestPrompt(
      { language: 'ru', level: 'standard', subject: 'Четырёхдневка', claims: [], sources: [source] },
      digestSourcesFor([source], 'standard')
    );
    expect(empty).not.toContain('Author claims:');
    expect(empty).not.toContain('For every author claim return one verdict');
    expect(empty).toContain('Return `verdicts` as an empty array');
    expect(empty).toContain('Never invent a claim, a claim key or a verdict');

    // С утверждениями промпт прежний, слово в слово.
    const withClaims = researchDigestPrompt(
      {
        language: 'ru',
        level: 'standard',
        subject: 'Четырёхдневка',
        claims: [{ key: 'own:a', statement: 'Эксперимент охватил 25 тысяч человек', own: true }],
        sources: [source],
      },
      digestSourcesFor([source], 'standard')
    );
    expect(withClaims).toContain('For every author claim return one verdict');
    expect(withClaims).toContain('[C:own:a] Эксперимент охватил 25 тысяч человек');
  });

  test('вердикт, придуманный без утверждений, тихо не замечается', () => {
    const settled = settleResearchDigest(
      {
        verdicts: [
          {
            claimKey: 'own:made-up',
            verdict: 'confirmed',
            evidenceId: 'ev-1',
            quote: 'The Reykjavík City trial (2014–2019) covered more than 2,500 workers.',
            original: null,
            replacement: null,
            note: 'Выдумано.',
          },
        ],
        findings: [],
      },
      { claims: [], sources: [source], level: 'standard' }
    );

    expect(settled.verdicts).toEqual([]);
    expect(settled.rejected).toEqual({
      verdicts: 0,
      findings: 0,
      unknownClaims: 0,
      unknownSources: 0,
    });
  });

  test('с утверждениями неизвестный ключ по-прежнему считается отброшенным', () => {
    const settled = settleResearchDigest(
      {
        verdicts: [
          { claimKey: 'own:made-up', verdict: 'confirmed', evidenceId: 'ev-1', quote: null, original: null, replacement: null, note: null },
        ],
        findings: [],
      },
      {
        claims: [{ key: 'own:a', statement: 'Эксперимент охватил 25 тысяч человек', own: true }],
        sources: [source],
        level: 'standard',
      }
    );

    expect(settled.rejected.unknownClaims).toBe(1);
    expect(settled.verdicts.map((verdict) => verdict.status)).toEqual(['unverified']);
  });
});
