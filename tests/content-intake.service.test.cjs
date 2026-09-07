'use strict';

/**
 * Вход одной мыслью целиком, без единого платного вызова
 * (`content-factory-next-tu3k.1`).
 *
 * Подменены все десять сотрудников: модель, поиск, реестр источников, шлюз к
 * сети, память фактов, аватар, репозиторий брифа, каналы, реестр провайдеров и
 * учёт расхода. Настоящими оставлены ровно те части, ради которых набор и
 * писался: ворота брифа (`evaluateBrief`), разбор вида входа, сверка чисел и
 * сборка разметки черновика.
 *
 * Что здесь судится, по решениям владельца 06.09.2026:
 *
 *  - тонкий вход отвечает вопросами, а не текстом, и до генератора не доходит;
 *  - числа чужого поста входят в бриф только подтверждёнными, непроверенное
 *    видно отдельной строкой и в текст не идёт;
 *  - **сам чужой текст не попадает в аргументы `start()` ни одним полем** —
 *    это граница «берём угол, а не слова», и она проверяется явно;
 *  - ссылка становится доказательством с провайдером `user_link` и
 *    переиспользованием по адресу;
 *  - два канала — два черновика, две записи;
 *  - слово человека сильнее ответа модели;
 *  - выключенный поиск — это настройка, а не поломка.
 */

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const SERVICE =
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts';

/**
 * Настоящие, а не подделанные: `usableHttpsUrl` решает, что считать ссылкой, и
 * копия этого решения в наборе разошлась бы с продуктом; `WebSearchNotConfigured`
 * проверяется через `instanceof`, а два одноимённых класса — это два разных
 * класса. Ни одного платного вызова при этом не делается: модуль только
 * загружается.
 */
const { usableHttpsUrl, WebSearchNotConfigured } = loadWithMocks(
  'libraries/nestjs-libraries/src/openai/web.research.service.ts'
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
            throw new Error('the service asked the model one time too many');
          }
          return modelAnswers.shift();
        },
      }),
    }),
  },
  '@contentfactory/nestjs-libraries/openai/web.research.service': {
    WebResearchService: class {},
    WebSearchNotConfigured,
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
    {
      parseSourcePayload: () => {
        throw new Error('the suite hands its own parser to the service');
      },
    },
  // Политика доступа подменена наблюдателем: набор судит вход, а не саму
  // политику, но обязан видеть, что она вызвана.
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-access-policy':
    {
      assertDomainAllowed: (url) => policyCalls.domain.push(url),
      assertRobotsAllowed: (body, url) => policyCalls.robots.push(url),
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

const policyCalls = { domain: [], robots: [] };

/* -------------------------------------------------------------------------
 * Заготовки
 * ---------------------------------------------------------------------- */

const CHANNELS = [
  {
    id: 'int-tg',
    name: 'Мой канал',
    providerIdentifier: 'telegram',
    contentLanguage: 'ru',
    disabled: false,
    deletedAt: null,
    additionalSettings: null,
  },
  {
    id: 'int-vk',
    name: 'Сообщество',
    providerIdentifier: 'vk',
    contentLanguage: 'ru',
    disabled: false,
    deletedAt: null,
    additionalSettings: null,
  },
  {
    id: 'int-off',
    name: 'Выключенный',
    providerIdentifier: 'telegram',
    contentLanguage: 'ru',
    disabled: true,
    deletedAt: null,
    additionalSettings: null,
  },
];

const PROVIDERS = {
  telegram: { maxLength: () => 4_096, maxCaptionLength: () => 1_024, editor: 'html' },
  vk: { maxLength: () => 16_000, editor: 'normal' },
};

const foreignPost = [
  'Мы закрыли половину линейки и считаем это лучшим решением года.',
  'Выручка компании достигла 4,2 млрд рублей, и это на 37% больше, чем годом',
  'раньше. Присутствие осталось в 12 странах вместо девятнадцати. Я помню, как',
  'мы спорили об этом три недели подряд, и помню аргумент, который всё решил:',
  'широкая линейка не защищает от просадки, она размазывает её по кварталам.',
  'Наша команда переехала на новую платформу за шесть недель. Мне до сих пор',
  'пишут бывшие клиенты закрытых продуктов, и я каждому отвечаю сам. Если бы',
  'мы начинали заново, я резал бы ещё жёстче и ещё раньше, потому что боль от',
  'отказа короче боли от растянутого умирания ненужного продукта.',
].join(' ');

const extractionAnswer = () => ({
  topic: 'отказ от половины продуктовой линейки',
  angle: 'рост случился из-за сокращения, а не из-за рынка',
  structure: ['решение', 'числа', 'спор', 'вывод'],
  claims: [
    {
      text: 'выручка компании достигла 4,2 млрд',
      hasNumber: true,
      searchQuery: 'выручка 4,2 млрд',
    },
    { text: 'рост на 37% за год', hasNumber: true, searchQuery: 'рост 37%' },
    {
      text: 'присутствие в 12 странах',
      hasNumber: true,
      searchQuery: 'присутствие в 12 странах',
    },
    {
      text: 'выход на новую платформу за шесть недель',
      hasNumber: true,
      searchQuery: 'платформа шесть недель',
    },
    { text: 'команда переехала на новую платформу', hasNumber: false, searchQuery: null },
  ],
  voiceNotes: null,
});

const fullBriefAnswer = (overrides = {}) => ({
  goal: 'показать, что рост даётся дисциплиной, а не рынком',
  thesis: 'Рост на 37% случился не из-за рынка, а из-за отказа от половины продуктов',
  position: 'Я бы на их месте резал ещё жёстче и ещё раньше',
  disagreement: 'Те, кто считает, что широкая линейка защищает от просадок',
  audience: 'владельцы небольших студий, которые ведут канал сами',
  format: 'expert',
  facts: [
    { statement: 'выручка достигла 4,2 млрд', factId: null, evidenceId: 'ev-1' },
    { statement: 'рост на 37% за год', factId: null, evidenceId: 'ev-2' },
    { statement: 'присутствие в 12 странах', factId: null, evidenceId: null },
    { statement: 'у нас так было в прошлом году', factId: 'fact-nope', evidenceId: null },
  ],
  origins: {
    goal: 'model',
    thesis: 'input',
    position: 'model',
    disagreement: 'model',
    audience: 'avatar',
    format: 'model',
  },
  options: { thesis: null, position: null, disagreement: null, audience: null },
  ...overrides,
});

const thinBriefAnswer = (overrides = {}) => ({
  goal: null,
  thesis: null,
  position: null,
  disagreement: null,
  audience: null,
  format: null,
  facts: [],
  origins: {},
  options: {
    thesis: [
      'Писать про ИИ надо чаще, потому что читатели ждут именно этого',
      'Про ИИ пишут все, и это повод писать реже, но точнее',
    ],
    position: ['Я пишу про ИИ только там, где сам что-то проверил'],
    disagreement: ['Те, кто считает, что тема выгорела'],
    audience: ['владельцы небольших студий'],
  },
  ...overrides,
});

/** Ответ поиска, в выдержке которого стоит нужное число. */
const searchAnswerWith = (number, url) => ({
  summary: 'Что нашлось',
  provider: 'tavily',
  facts: [{ text: `По отчёту компании, ${number}.`, sourceUrl: url }],
  sources: [
    { url, title: 'Отчёт', publishedAt: '2026-09-01T00:00:00.000Z', provider: 'tavily' },
  ],
});

const generatorOutput = (content, extra = {}) => ({
  contentContextSnapshotId: 'ctx-1',
  brandProfileVersionId: 'bpv-1',
  brandProfileSelection: { mode: 'resolved', versionId: 'bpv-1' },
  contentContextStatus: 'READY',
  generationPolicy: 'ALLOW_GROUNDED',
  selectionHash: 'hash-1',
  date: '2026-09-06T10:00:00',
  draftGaps: [],
  content: [{ content, usedCitationIds: ['E1'] }],
  ...extra,
});

/* -------------------------------------------------------------------------
 * Стенд
 * ---------------------------------------------------------------------- */

const build = (options = {}) => {
  const calls = {
    research: [],
    accept: [],
    start: [],
    createDraft: [],
    recordPiece: [],
    recordCore: [],
    recordAdaptation: [],
    usage: [],
    fetch: [],
  };
  policyCalls.domain = [];
  policyCalls.robots = [];
  modelCalls.length = 0;
  modelAnswers = [...(options.models || [])];

  let evidenceNumber = 0;
  const researchAnswers = [...(options.research || [])];

  const service = new IntakeService(
    {
      start: async function* (organizationId, body) {
        calls.start.push([organizationId, body]);
        yield {
          name: 'content-context',
          data: { output: { contentContextSnapshotId: 'ctx-1' } },
        };
        yield { event: 'on_chain_start', name: 'generate-hook', data: {} };
        yield {
          data: {
            output: generatorOutput(
              `Черновик для ${body.intake?.channel?.integrationId}.`
            ),
          },
        };
      },
    },
    {
      research: async (organizationId, subject, opts) => {
        calls.research.push([organizationId, subject, opts]);
        const next = researchAnswers.shift();
        if (typeof next === 'function') return next();
        if (!next) throw new WebSearchNotConfigured();
        return next;
      },
    },
    {
      acceptSearchResult: async (organizationId, input, opts) => {
        calls.accept.push([organizationId, input, opts]);
        evidenceNumber += 1;
        return {
          evidenceId: `ev-${evidenceNumber}`,
          url: input.url,
          title: input.title,
          excerpt: input.excerpt,
        };
      },
    },
    {
      fetch: async (url, kind) => {
        calls.fetch.push([url, kind]);
        return {
          status: 200,
          finalUrl: url,
          body: Buffer.from('page'),
          contentType: 'text/html',
          charset: 'utf-8',
        };
      },
    },
    { listFacts: async () => options.facts || [] },
    {
      resolve: async () => ({
        effectiveVoice: {
          persona: { portrait: 'Ведёт студию, пишет сам, не любит общих слов.' },
          project: {
            audiences: [
              {
                name: 'владельцы небольших студий',
                need: 'которые ведут канал сами',
              },
            ],
          },
          guardrails: { prohibitedClaims: [] },
        },
      }),
    },
    {
      createDraft: async (organizationId, input) => {
        calls.createDraft.push([organizationId, input]);
        return `post-${calls.createDraft.length}`;
      },
      recordPiece: async (organizationId, input) => {
        calls.recordPiece.push([organizationId, input]);
        return `piece-${calls.recordPiece.length}`;
      },
      // Заготовка и адаптация — две разные записи с волны
      // `content-factory-next-tu3k.9`: первая одна на вход, вторая на канал.
      recordCore: async (organizationId, input) => {
        calls.recordCore.push([organizationId, input]);
        return { id: `piece-${calls.recordCore.length}`, code: 'cnt-01' };
      },
      recordAdaptation: async (organizationId, input) => {
        calls.recordAdaptation.push([organizationId, input]);
        return {
          id: `adaptation-${calls.recordAdaptation.length}`,
          createdAt: new Date('2026-09-06T09:00:00.000Z'),
        };
      },
    },
    { getIntegrationsList: async () => CHANNELS },
    { getSocialIntegration: (identifier) => PROVIDERS[identifier] },
    {
      executeAiOperation: async (organizationId, operation, callback, role) => {
        calls.usage.push([organizationId, operation, role]);
        return callback();
      },
    },
    () => new Date('2026-09-06T09:00:00.000Z'),
    () => ({ title: 'Как мы отказались от половины продуктов', text: 'Текст страницы про отказ от половины линейки.' })
  );

  return { service, calls };
};

const drain = async (service, organizationId, plan, actorUserId = 'user-1') => {
  const events = [];
  for await (const event of service.run(organizationId, plan, actorUserId)) {
    events.push(event);
  }
  return events;
};

const named = (events, name) => events.filter((event) => event.name === name);

const request = (overrides = {}) => ({
  input: 'Надо больше писать про ИИ, но не так, как все',
  integrationIds: ['int-tg'],
  language: 'ru',
  options: { searchEnrichment: false },
  ...overrides,
});

/* -------------------------------------------------------------------------
 * Наборы
 * ---------------------------------------------------------------------- */

describe('тонкий вход отвечает вопросами, а не текстом', () => {
  test('два вопроса, тезис и факты, и генератор не тронут', async () => {
    const { service, calls } = build({ models: [thinBriefAnswer()] });
    const plan = await service.prepare('org-a', request());
    const events = await drain(service, 'org-a', plan);

    expect(events.map((event) => event.name)).toEqual([
      'intake-started',
      'brief-filled',
      'questions',
    ]);
    const [questions] = named(events, 'questions');
    expect(questions.questions.map((row) => row.field)).toEqual([
      'thesis',
      'facts',
    ]);
    // Варианты приходят от модели: человек отвечает нажатием, а не сочинением.
    expect(questions.questions[0].options).toHaveLength(2);
    expect(calls.start).toEqual([]);
    expect(calls.createDraft).toEqual([]);
    // Аватар знает, для кого пишет область, и об этом не спрашивают.
    const [filled] = named(events, 'brief-filled');
    expect(filled.brief.audience).toBe(
      'владельцы небольших студий — которые ведут канал сами'
    );
    expect(filled.brief.origins.audience).toBe('avatar');
  });

  test('расход — только собственная операция входа, генерации нет', async () => {
    const { service, calls } = build({ models: [thinBriefAnswer()] });
    const plan = await service.prepare('org-a', request());
    await drain(service, 'org-a', plan);

    expect(calls.usage).toEqual([['org-a', 'intake', 'extract']]);
  });

  test('поле, отданное модели, заполняется её же первым вариантом', async () => {
    const { service } = build({
      models: [
        thinBriefAnswer({
          thesis: 'Про ИИ надо писать реже, но проверять каждое число',
          facts: [],
        }),
      ],
    });
    const plan = await service.prepare(
      'org-a',
      request({ decide: ['position', 'disagreement'] })
    );
    const events = await drain(service, 'org-a', plan);
    const [filled] = named(events, 'brief-filled');

    expect(filled.brief.position).toBe(
      'Я пишу про ИИ только там, где сам что-то проверил'
    );
    expect(filled.brief.origins.position).toBe('model');
    expect(filled.brief.disagreement).toBe('Те, кто считает, что тема выгорела');
    // Про отданное не переспрашивают: остаётся один вопрос — про факты.
    expect(named(events, 'questions')[0].questions.map((row) => row.field)).toEqual(
      ['facts']
    );
  });
});

describe('чужой пост: числа входят только проверенными', () => {
  /*
    `skipInterview` стоит здесь с волны «заготовка и адаптации»
    (`content-factory-next-tu3k.9`): после брифа продукт задаёт до трёх
    вопросов о заготовке и это терминально, как и вопросы ворот. Сценарии ниже
    судят дорогу ДО черновика, а не интервью — его собственный набор
    `content-pieces.service.test.cjs`.
  */
  const foreignPlan = (service, overrides = {}) =>
    service.prepare(
      'org-a',
      request({
        input: foreignPost,
        options: { searchEnrichment: true },
        skipInterview: true,
        ...overrides,
      })
    );

  const foreignBuild = () =>
    build({
      models: [extractionAnswer(), fullBriefAnswer()],
      research: [
        searchAnswerWith('выручка достигла 4,2 млрд', 'https://example.test/report'),
        searchAnswerWith('рост составил 37% за год', 'https://example.test/press'),
        // Третье число не подтверждается: страница отвечает про другое.
        {
          summary: '',
          provider: 'tavily',
          facts: [
            { text: 'Компания работает в нескольких регионах.', sourceUrl: 'https://example.test/about' },
          ],
          sources: [],
        },
      ],
    });

  test('два подтверждённых, одно неподтверждённое, поиск не больше трёх раз', async () => {
    const { service, calls } = foreignBuild();
    const plan = await foreignPlan(service);
    const events = await drain(service, 'org-a', plan);

    expect(plan.inputKind).toBe('foreign_post');
    const [claims] = named(events, 'claims');
    expect(
      claims.claims.map((claim) => [claim.text, claim.status])
    ).toEqual([
      ['выручка компании достигла 4,2 млрд', 'verified'],
      ['рост на 37% за год', 'verified'],
      ['присутствие в 12 странах', 'unverified'],
      // Четвёртое число за пределом тройки: его не проверяли.
      ['выход на новую платформу за шесть недель', 'skipped'],
      ['команда переехала на новую платформу', 'skipped'],
    ]);
    expect(calls.research).toHaveLength(3);
    expect(claims.claims[0].evidenceId).toBe('ev-1');
    expect(claims.claims[0].sourceUrl).toBe('https://example.test/report');
  });

  test('в брифе два факта с опорой и одна строка без неё', async () => {
    const { service } = foreignBuild();
    const plan = await foreignPlan(service);
    const events = await drain(service, 'org-a', plan);
    const [filled] = named(events, 'brief-filled');

    expect(
      filled.brief.facts.map((fact) => [fact.statement, fact.verified, fact.origin])
    ).toEqual([
      ['выручка достигла 4,2 млрд', true, 'search'],
      ['рост на 37% за год', true, 'search'],
      ['присутствие в 12 странах', false, 'input'],
      ['у нас так было в прошлом году', false, 'input'],
    ]);
    expect(filled.brief.ungrounded).toEqual([
      'присутствие в 12 странах',
      'у нас так было в прошлом году',
    ]);
  });

  test('чужой идентификатор факта отбрасывается, а строка теряет опору', async () => {
    const { service } = foreignBuild();
    const plan = await foreignPlan(service);
    const events = await drain(service, 'org-a', plan);
    const [filled] = named(events, 'brief-filled');
    const borrowed = filled.brief.facts.find((fact) =>
      fact.statement.includes('в прошлом году')
    );

    // Модель сослалась на `fact-nope`, но такого факта в области нет.
    // Ссылка снимается, строка остаётся видимой и уходит в «не подтверждено»:
    // молча выброшенное утверждение человек не заметит, а чужая память,
    // выданная за свою, — худшее из возможных «подтверждено».
    expect(borrowed.factId).toBeNull();
    expect(borrowed.verified).toBe(false);
    expect(filled.brief.ungrounded).toContain('у нас так было в прошлом году');
  });

  test('чужой текст не доходит до генератора ни одним полем', async () => {
    const { service, calls } = foreignBuild();
    const plan = await foreignPlan(service);
    await drain(service, 'org-a', plan);

    expect(calls.start).toHaveLength(1);
    const [, body] = calls.start[0];
    const serialized = JSON.stringify(body);
    // Ни целиком, ни первым предложением: берётся угол, а не слова.
    expect(serialized).not.toContain(foreignPost);
    expect(serialized).not.toContain('Мы закрыли половину линейки');
    expect(body.research).toBe(
      'Рост на 37% случился не из-за рынка, а из-за отказа от половины продуктов'
    );
    expect(body.intake.foreignShingles.length).toBeGreaterThan(0);
    expect(body.intake.borrowed.topic).toBe(
      'отказ от половины продуктовой линейки'
    );
    expect(body.userMaterialEvidenceIds).toEqual(['ev-1', 'ev-2']);
    expect(body.factIds).toBeUndefined();
    expect(body.intake.channel).toEqual({
      integrationId: 'int-tg',
      providerIdentifier: 'telegram',
      maxLength: 4_096,
      maxCaptionLength: 1_024,
      editor: 'html',
      writingProfile: null,
    });
  });

  test('черновик сохраняется со снимком контекста и метками цитат', async () => {
    const { service, calls } = foreignBuild();
    const plan = await foreignPlan(service);
    const events = await drain(service, 'org-a', plan);

    expect(calls.createDraft).toHaveLength(1);
    const [, saved] = calls.createDraft[0];
    expect(saved).toEqual({
      channelId: 'int-tg',
      providerIdentifier: 'telegram',
      content: '<p>Черновик для int-tg.</p>',
      date: '2026-09-06T10:00:00',
      contentContextSnapshotId: 'ctx-1',
      brandProfileVersionId: 'bpv-1',
      usedCitationIds: ['E1'],
    });
    const [draft] = named(events, 'draft');
    expect(draft.postId).toBe('post-1');
    expect(draft.pieceId).toBe('piece-1');
    expect(draft.checks).toEqual({ antiCopy: null, slop: null });
    expect(named(events, 'done')[0].postIds).toEqual(['post-1']);
  });
});

describe('ссылка становится доказательством', () => {
  test('провайдер user_link и переиспользование по адресу', async () => {
    const { service, calls } = build({
      models: [extractionAnswer(), fullBriefAnswer()],
      research: [],
    });
    process.env.SOURCE_DIRECT_FETCH = 'true';
    const plan = await service.prepare(
      'org-a',
      request({ input: 'https://example.test/post', options: { searchEnrichment: false } })
    );
    const events = await drain(service, 'org-a', plan);

    expect(plan.inputKind).toBe('link');
    const [fetched] = named(events, 'link-fetched');
    expect(fetched).toEqual({
      name: 'link-fetched',
      url: 'https://example.test/post',
      title: 'Как мы отказались от половины продуктов',
      evidenceId: 'ev-1',
    });
    expect(calls.accept[0][1].provider).toBe('user_link');
    expect(calls.accept[0][2]).toEqual({ reuseBy: 'url' });
    // Политика доступа спрошена тем же путём, что и у реестра источников.
    expect(policyCalls.domain.length).toBeGreaterThan(0);
    expect(policyCalls.robots).toEqual(['https://example.test/post']);
    delete process.env.SOURCE_DIRECT_FETCH;
  });

  test('нечитаемая ссылка отвечает своим кодом и не роняет ход', async () => {
    const { service, calls } = build({ models: [] });
    delete process.env.SOURCE_DIRECT_FETCH;
    const plan = await service.prepare(
      'org-a',
      request({ input: 'https://example.test/post' })
    );
    const events = await drain(service, 'org-a', plan);

    expect(events.map((event) => event.name)).toEqual([
      'intake-started',
      'error',
    ]);
    expect(events[1].code).toBe('INTAKE_LINK_UNREACHABLE');
    expect(calls.start).toEqual([]);
  });
});

describe('два канала — два черновика', () => {
  test('по событию и по записи на каждый, с разными идентификаторами', async () => {
    // Чужой пост при выключенном поиске: разбор всё равно нужен, а проверка
    // чисел — нет, поэтому модель спрашивают ровно дважды.
    const { service, calls } = build({
      models: [
        extractionAnswer(),
        fullBriefAnswer({
          facts: [
            {
              statement: 'у меня из шести дедлайнов сдвинулись пять',
              factId: 'fact-9',
              evidenceId: null,
            },
          ],
        }),
      ],
      facts: [
        {
          id: 'fact-9',
          status: 'ACCEPTED',
          statement: 'из шести самоназначенных дедлайнов сдвинулись пять',
        },
      ],
      research: [],
    });
    const plan = await service.prepare(
      'org-a',
      request({
        input: foreignPost,
        integrationIds: ['int-tg', 'int-vk'],
        options: { searchEnrichment: false },
        skipInterview: true,
      })
    );
    const events = await drain(service, 'org-a', plan);

    const drafts = named(events, 'draft');
    expect(drafts.map((draft) => draft.integrationId)).toEqual([
      'int-tg',
      'int-vk',
    ]);
    expect(calls.createDraft.map(([, input]) => input.channelId)).toEqual([
      'int-tg',
      'int-vk',
    ]);
    expect(named(events, 'done')[0].postIds).toEqual(['post-1', 'post-2']);
    // Каждый канал получает свою карточку и свой предел знаков.
    expect(calls.start.map(([, body]) => body.intake.channel.maxLength)).toEqual([
      4_096, 16_000,
    ]);
  });
});

describe('слово человека и выключенный поиск', () => {
  test('ответ человека переписывает предложение модели', async () => {
    const { service } = build({
      models: [
        fullBriefAnswer({
          thesis: 'Тезис, который придумала модель и который никто не просил',
        }),
      ],
      facts: [],
    });
    const plan = await service.prepare(
      'org-a',
      request({
        answers: [
          {
            field: 'thesis',
            text: 'Дедлайн, назначенный себе, работает хуже назначенного клиенту',
          },
        ],
      })
    );
    const events = await drain(service, 'org-a', plan);
    const [filled] = named(events, 'brief-filled');

    expect(filled.brief.thesis).toBe(
      'Дедлайн, назначенный себе, работает хуже назначенного клиенту'
    );
    expect(filled.brief.origins.thesis).toBe('person');
  });

  test('ответ про факты с адресом внутри становится опорой', async () => {
    const { service } = build({
      models: [fullBriefAnswer({ facts: [] })],
    });
    const plan = await service.prepare(
      'org-a',
      request({
        answers: [
          {
            field: 'facts',
            text: 'Из шести дедлайнов сдвинулись пять https://example.test/notes',
          },
        ],
      })
    );
    const events = await drain(service, 'org-a', plan);
    const [filled] = named(events, 'brief-filled');
    const [fact] = filled.brief.facts;

    expect(fact.origin).toBe('person');
    expect(fact.verified).toBe(true);
    expect(fact.sourceUrl).toBe('https://example.test/notes');
    expect(named(events, 'questions')).toEqual([]);
  });

  test('поиск, не настроенный в области, не роняет ход', async () => {
    const { service, calls } = build({
      models: [extractionAnswer(), fullBriefAnswer()],
      // Ни одного заготовленного ответа: заглушка бросает
      // `WebSearchNotConfigured`, как настоящий сервис в области без ключа.
      research: [],
    });
    const plan = await service.prepare(
      'org-a',
      request({ input: foreignPost, options: { searchEnrichment: true } })
    );
    const events = await drain(service, 'org-a', plan);

    const [claims] = named(events, 'claims');
    // «Не проверяли», а не «проверили и не нашли»: выключенный поиск — это
    // настройка области, и ни одно число она виноватым не делает.
    expect(claims.claims.every((claim) => claim.status === 'skipped')).toBe(true);
    expect(named(events, 'error')).toEqual([]);
    expect(named(events, 'brief-filled')).toHaveLength(1);
    // Опоры не нашлось, поэтому ход честно кончается вопросом про факты, а не
    // черновиком, под которым нечего процитировать.
    expect(named(events, 'questions')[0].questions.map((row) => row.field)).toEqual(
      ['facts']
    );
    expect(calls.start).toEqual([]);
  });

  test('мысль без опоры ищет её сама, когда поиск включён', async () => {
    const { service, calls } = build({
      models: [
        fullBriefAnswer({ facts: [], origins: { thesis: 'input' } }),
      ],
      research: [
        searchAnswerWith('дедлайн с внешним обязательством держится в 4 раза чаще', 'https://example.test/study'),
      ],
    });
    const plan = await service.prepare(
      'org-a',
      request({ options: { searchEnrichment: true } })
    );
    const events = await drain(service, 'org-a', plan);
    const [filled] = named(events, 'brief-filled');

    expect(calls.research).toHaveLength(1);
    expect(filled.brief.facts[0].origin).toBe('search');
    expect(filled.brief.facts[0].sourceUrl).toBe('https://example.test/study');
    expect(named(events, 'questions')).toEqual([]);
  });
});

describe('каналы проверяются до первого байта', () => {
  const codeOf = async (body) => {
    const { service } = build({ models: [] });
    try {
      await service.prepare('org-a', request(body));
      return null;
    } catch (error) {
      return error.code;
    }
  };

  test.each([
    ['короткий вход', { input: 'ага' }, 'INTAKE_INPUT_TOO_SHORT'],
    // Пустой список каналов дверь больше не отвергает: с волны «заготовка и
    // адаптации» её результат — заготовка, а канал выбирают потом.
    ['без канала', { integrationIds: [] }, null],
    ['чужой канал', { integrationIds: ['int-nope'] }, 'INTAKE_CHANNEL_UNKNOWN'],
    ['выключенный канал', { integrationIds: ['int-off'] }, 'INTAKE_CHANNEL_UNKNOWN'],
    [
      'четыре канала',
      { integrationIds: ['int-tg', 'int-vk', 'int-off', 'int-4'] },
      'INTAKE_TOO_MANY_CHANNELS',
    ],
  ])('%s — %s', async (_label, body, code) => {
    expect(await codeOf(body)).toBe(code);
  });

  test('канал провайдера, которого продукт не знает', async () => {
    const { service } = build({ models: [] });
    CHANNELS.push({
      id: 'int-x',
      name: 'Неизвестный',
      providerIdentifier: 'nowhere',
      contentLanguage: 'ru',
      disabled: false,
      deletedAt: null,
      additionalSettings: null,
    });
    try {
      await service.prepare('org-a', request({ integrationIds: ['int-x'] }));
      throw new Error('the door should have refused');
    } catch (error) {
      expect(error.code).toBe('INTAKE_CHANNEL_UNSUPPORTED');
    } finally {
      CHANNELS.pop();
    }
  });
});
