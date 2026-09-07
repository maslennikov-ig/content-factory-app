'use strict';

/**
 * Заготовка и адаптации, без единого платного вызова
 * (`content-factory-next-tu3k.9.3`).
 *
 * Подделаны модель, поиск, реестр источников, шлюз, память фактов, аватар,
 * репозитории и учёт расхода. Настоящими оставлены ровно те части, ради
 * которых набор и писался: промпт сути, проверка на штампы, вопросы под канал
 * и вся арифметика над строками.
 *
 * Что здесь судится, по решениям владельца 06.09.2026 (§11 карты раздела):
 *
 *  - **три канала дают ОДНУ заготовку и три адаптации**. Это и есть волна: до
 *    неё каждый канал заводил свой материал с HTML одного канала в теле;
 *  - суть — простой текст, без единого тега: её читает человек, а разметку
 *    несёт пост;
 *  - **дословная фраза человека доезжает до сути**, и её же видно в промпте;
 *  - **чужой текст в промпт сути не попадает ни одним полем**;
 *  - отказ модели на сути не валит вход: `writtenBy: 'fallback'`, черновики на
 *    месте;
 *  - интервью: не больше трёх вопросов, у каждого есть предложение или
 *    честный `null`, ответ хранится дословно — с опечаткой;
 *  - адаптация в Telegram сначала спрашивает про крючок, а с «пропустить»
 *    сразу пишет;
 *  - адаптацию опубликованного поста снять нельзя.
 */

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const INTAKE =
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts';
const PIECES =
  'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts';

const { usableHttpsUrl, WebSearchNotConfigured } = loadWithMocks(
  'libraries/nestjs-libraries/src/openai/web.research.service.ts'
);

const modelCalls = [];
let modelAnswers = [];

const chatModel = {
  getChatModel: async (organizationId, temperature, tokens, role) => ({
    withStructuredOutput: () => ({
      invoke: async (prompt) => {
        modelCalls.push({ organizationId, role, prompt });
        if (!modelAnswers.length) {
          throw new Error('the service asked the model one time too many');
        }
        const next = modelAnswers.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    }),
  }),
};

const { IntakeService } = loadWithMocks(INTAKE, {
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
    ...chatModel,
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
    { parseSourcePayload: () => ({ title: null, text: '' }) },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-access-policy':
    {
      assertDomainAllowed: () => undefined,
      assertRobotsAllowed: () => undefined,
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

const { PieceService } = loadWithMocks(PIECES, {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': {
    AgentGraphService: class {},
  },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': {
    IntegrationManager: class {},
  },
  './piece.repository': { PieceRepository: class {} },
});

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
    writingProfile: null,
  },
  {
    id: 'int-vk',
    name: 'Сообщество',
    providerIdentifier: 'vk',
    contentLanguage: 'ru',
    disabled: false,
    deletedAt: null,
    additionalSettings: null,
    writingProfile: null,
  },
  {
    id: 'int-site',
    name: 'Блог',
    providerIdentifier: 'wordpress',
    contentLanguage: 'ru',
    disabled: false,
    deletedAt: null,
    additionalSettings: null,
    writingProfile: null,
  },
];

const PROVIDERS = {
  telegram: {
    maxLength: () => 4_096,
    maxCaptionLength: () => 1_024,
    editor: 'html',
  },
  vk: { maxLength: () => 16_000, editor: 'normal' },
  wordpress: { maxLength: () => 100_000, editor: 'html' },
};

/** Слова человека, вместе с опечаткой: она и есть материал. */
const THOUGHT =
  'Из шести дедлайнов которые я ставил сам себе сдвинулись пять, а с клиентом ни один не сдивнулся.';

const foreignPost = [
  'Мы закрыли половину линейки и считаем это лучшим решением года.',
  'Выручка компании достигла 4,2 млрд рублей, и это на 37% больше, чем годом',
  'раньше. Присутствие осталось в 12 странах вместо девятнадцати. Я помню, как',
  'мы спорили об этом три недели подряд, и помню аргумент, который всё решил:',
  'широкая линейка не защищает от просадки, она размазывает её по кварталам.',
].join(' ');

const extractionAnswer = () => ({
  topic: 'отказ от половины продуктовой линейки',
  angle: 'рост случился из-за сокращения, а не из-за рынка',
  structure: ['решение', 'числа', 'спор', 'вывод'],
  claims: [
    { text: 'выручка компании достигла 4,2 млрд', hasNumber: true, searchQuery: null },
  ],
  voiceNotes: null,
});

const briefAnswer = (overrides = {}) => ({
  goal: 'показать, что срок держится не дисциплиной',
  thesis: 'Дедлайн, о котором знает другой, держится лучше назначенного себе',
  position: 'Ставлю себе срок только вместе с клиентом',
  disagreement: 'Те, кому самодисциплины достаточно',
  audience: 'владельцы небольших студий, которые ведут канал сами',
  format: 'opinion',
  facts: [
    {
      statement: 'из шести дедлайнов сдвинулись пять',
      factId: 'fact-1',
      evidenceId: null,
    },
  ],
  origins: {
    goal: 'model',
    thesis: 'input',
    position: 'person',
    disagreement: 'model',
    audience: 'avatar',
    format: 'model',
  },
  options: { thesis: null, position: null, disagreement: null, audience: null },
  ...overrides,
});

/** Суть модели: дословная фраза человека внутри, и ни одного тега. */
const CORE_TEXT = [
  'Из шести дедлайнов которые я ставил сам себе сдвинулись пять, а с клиентом ни один не сдивнулся.',
  '',
  'Срок держится, когда о нём знает кто-то ещё.',
].join('\n');

const generatorOutput = (content) => ({
  contentContextSnapshotId: 'ctx-1',
  brandProfileVersionId: 'bpv-1',
  brandProfileSelection: { mode: 'resolved', versionId: 'bpv-1' },
  contentContextStatus: 'READY',
  generationPolicy: 'ALLOW_GROUNDED',
  selectionHash: 'hash-1',
  date: '2026-09-06T10:00:00',
  draftGaps: [],
  content: [{ content, usedCitationIds: [] }],
});

/* -------------------------------------------------------------------------
 * Стенд входа
 * ---------------------------------------------------------------------- */

const buildIntake = (options = {}) => {
  const calls = {
    start: [],
    createDraft: [],
    recordCore: [],
    recordAdaptation: [],
    recordPiece: [],
    usage: [],
    research: [],
  };
  modelCalls.length = 0;
  modelAnswers = [...(options.models || [])];

  const service = new IntakeService(
    {
      start: async function* (organizationId, body) {
        calls.start.push([organizationId, body]);
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
        throw new WebSearchNotConfigured();
      },
    },
    { acceptSearchResult: async () => ({ evidenceId: 'ev-1', url: '', title: null, excerpt: '' }) },
    { fetch: async () => ({ status: 200, finalUrl: '', body: Buffer.from(''), contentType: 'text/html' }) },
    {
      listFacts: async () => [
        {
          id: 'fact-1',
          status: 'ACCEPTED',
          statement: 'из шести дедлайнов сдвинулись пять',
        },
      ],
    },
    {
      resolve: async () => ({
        effectiveVoice: {
          persona: { portrait: 'Ведёт студию, пишет сам.' },
          project: { audiences: [{ name: 'владельцы студий', need: 'ведут канал сами' }] },
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
        return `legacy-${calls.recordPiece.length}`;
      },
      recordCore: async (organizationId, input) => {
        calls.recordCore.push([organizationId, input]);
        return { id: `piece-${calls.recordCore.length}`, code: 'cnt-07' };
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
    () => new Date('2026-09-06T09:00:00.000Z')
  );

  return { service, calls };
};

const drain = async (generator) => {
  const events = [];
  for await (const event of generator) events.push(event);
  return events;
};

const named = (events, name) => events.filter((event) => event.name === name);

const request = (overrides = {}) => ({
  input: THOUGHT,
  integrationIds: ['int-tg'],
  language: 'ru',
  options: { searchEnrichment: false },
  skipInterview: true,
  ...overrides,
});

/* -------------------------------------------------------------------------
 * Одна заготовка на три канала
 * ---------------------------------------------------------------------- */

describe('три канала дают одну заготовку и три адаптации', () => {
  const threeChannels = async () => {
    const { service, calls } = buildIntake({
      models: [briefAnswer(), { text: CORE_TEXT }],
    });
    const plan = await service.prepare(
      'org-a',
      request({ integrationIds: ['int-tg', 'int-vk', 'int-site'] })
    );
    const events = await drain(service.run('org-a', plan, 'user-1'));
    return { calls, events };
  };

  test('заготовка записана один раз, адаптация — на каждый канал', async () => {
    const { calls } = await threeChannels();

    expect(calls.recordCore).toHaveLength(1);
    expect(calls.recordAdaptation).toHaveLength(3);
    expect(calls.recordAdaptation.map(([, input]) => input.platform)).toEqual([
      'telegram',
      'vk',
      'wordpress',
    ]);
    // Вид спрашивается у площадки: сайт берёт статью, а не пост.
    expect(calls.recordAdaptation.map(([, input]) => input.kind)).toEqual([
      'post',
      'post',
      'article',
    ]);
    // Все три ссылаются на одну и ту же заготовку.
    expect([
      ...new Set(calls.recordAdaptation.map(([, input]) => input.pieceId)),
    ]).toEqual(['piece-1']);
    // Старая запись «материал на канал» со входа больше не зовётся.
    expect(calls.recordPiece).toEqual([]);
  });

  test('суть — простой текст, без единого тега', async () => {
    const { calls, events } = await threeChannels();
    const [, core] = calls.recordCore[0];

    expect(core.body).toBe(CORE_TEXT);
    expect(core.body).not.toMatch(/<[a-z]/i);
    // А пост несёт разметку — это разные вещи и разные колонки.
    expect(calls.createDraft[0][1].content).toContain('<p>');

    const [piece] = named(events, 'piece');
    expect(piece.pieceId).toBe('piece-1');
    expect(piece.code).toBe('cnt-07');
    expect(piece.core.writtenBy).toBe('model');
    expect(piece.core.text).toBe(CORE_TEXT);
  });

  test('черновик знает свою адаптацию и свою заготовку', async () => {
    const { events } = await threeChannels();
    const drafts = named(events, 'draft');

    expect(drafts).toHaveLength(3);
    expect(drafts.map((draft) => draft.adaptationId)).toEqual([
      'adaptation-1',
      'adaptation-2',
      'adaptation-3',
    ]);
    expect([...new Set(drafts.map((draft) => draft.pieceId))]).toEqual([
      'piece-1',
    ]);
  });

  test('суть стоит одним вызовом роли draft, и он один на три канала', async () => {
    const { calls } = await threeChannels();

    // Заполнение брифа — `extract`, суть — `draft`, и всё: генерации
    // учитываются своей операцией внутри графа.
    expect(calls.usage).toEqual([
      ['org-a', 'intake', 'extract'],
      ['org-a', 'intake', 'draft'],
    ]);
    expect(modelCalls.filter((call) => call.role === 'draft')).toHaveLength(1);
  });

  test('суть доезжает до генератора подсказкой, а не запросом', async () => {
    const { calls } = await threeChannels();

    expect(calls.start).toHaveLength(3);
    for (const [, body] of calls.start) {
      expect(body.intake.core).toBe(CORE_TEXT);
    }
  });
});

/* -------------------------------------------------------------------------
 * Слова человека и чужой текст
 * ---------------------------------------------------------------------- */

describe('дословность и граница чужого текста', () => {
  test('фраза человека есть в промпте сути и доезжает до неё', async () => {
    const { service, calls } = buildIntake({
      models: [briefAnswer(), { text: CORE_TEXT }],
    });
    const plan = await service.prepare('org-a', request());
    await drain(service.run('org-a', plan, 'user-1'));

    const corePrompt = modelCalls.find((call) => call.role === 'draft').prompt;
    expect(corePrompt).toContain('СЛОВА ЧЕЛОВЕКА (дословно)');
    expect(corePrompt).toContain('сдивнулся');
    // Правило переноса сказано модели, а не подразумевается.
    expect(corePrompt).toContain('ДОСЛОВНО');
    // И запреты взяты из каталога штампов, а не написаны рядом второй раз.
    expect(corePrompt).toContain('в конечном счёте');

    const [, core] = calls.recordCore[0];
    expect(core.body).toContain('сдивнулся');
  });

  test('чужой текст в промпт сути не попадает ни одним полем', async () => {
    const { service } = buildIntake({
      models: [extractionAnswer(), briefAnswer(), { text: CORE_TEXT }],
    });
    const plan = await service.prepare(
      'org-a',
      request({
        input: foreignPost,
        // Вид назван клиентом: набор судит границу чужого текста, а не разбор
        // длины, у которого есть свой набор.
        inputKind: 'foreign_post',
        options: { searchEnrichment: false },
      })
    );
    await drain(service.run('org-a', plan, 'user-1'));

    const corePrompt = modelCalls.find((call) => call.role === 'draft').prompt;
    expect(corePrompt).not.toContain(foreignPost);
    expect(corePrompt).not.toContain('Мы закрыли половину линейки');
    expect(corePrompt).not.toContain('размазывает её по кварталам');
    // Едут тема, угол и пересказ утверждений — то, что владелец разрешил брать.
    expect(corePrompt).toContain('отказ от половины продуктовой линейки');
  });

  test('отказ модели на сути не валит вход', async () => {
    const { service, calls } = buildIntake({
      models: [briefAnswer(), new Error('the model refused')],
    });
    const plan = await service.prepare('org-a', request());
    const events = await drain(service.run('org-a', plan, 'user-1'));

    const [piece] = named(events, 'piece');
    expect(piece.core.writtenBy).toBe('fallback');
    // Собрана из уже сказанного: тезис, факт, позиция — и ничего сверх.
    expect(piece.core.text).toContain(
      'Дедлайн, о котором знает другой, держится лучше'
    );
    // Черновик человек всё равно получил.
    expect(named(events, 'draft')).toHaveLength(1);
    expect(calls.createDraft).toHaveLength(1);
    expect(named(events, 'error')).toEqual([]);
  });

  test('отчёт о штампах снят по сути и сохранён в брифе', async () => {
    const { service, calls } = buildIntake({
      models: [
        briefAnswer(),
        {
          text: 'В современном мире важно отметить, что таким образом дедлайн играет ключевую роль.',
        },
      ],
    });
    const plan = await service.prepare('org-a', request());
    const events = await drain(service.run('org-a', plan, 'user-1'));

    const [, stored] = calls.recordCore[0];
    expect(stored.brief.slop.version).toBe('slop-check/1.0.0');
    // Дежурный зачин, шаблонный переход и раздутая значимость — три находки в
    // одной фразе, и все три названы по своим правилам.
    expect(stored.brief.slop.findings.map((row) => row.ruleId)).toEqual(
      expect.arrayContaining([
        'stock-opening',
        'template-transition',
        'inflated-significance',
      ])
    );
    expect(['clean', 'review', 'rewrite']).toContain(stored.brief.slop.verdict);
    // В колонке `brief` лежит всё, кроме текста: текст — это `body`.
    expect(stored.brief.text).toBeUndefined();
    expect(named(events, 'piece')[0].core.slop.verdict).toBe(
      stored.brief.slop.verdict
    );
  });

  test('своё число автора отмечено по его словам, а не по тексту сути', async () => {
    const { service, calls } = buildIntake({
      models: [briefAnswer(), { text: CORE_TEXT }],
    });
    const plan = await service.prepare(
      'org-a',
      request({ input: 'Срок держится, когда о нём знает кто-то ещё, и это правда' })
    );
    await drain(service.run('org-a', plan, 'user-1'));

    expect(calls.recordCore[0][1].brief.authorNumbers).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * Интервью при создании
 * ---------------------------------------------------------------------- */

describe('интервью заготовки', () => {
  /*
    Бриф, который ворота пропускают, а интервью — нет.
    Разделение труда здесь и есть смысл двух шагов: пустое поле — работа ворот
    («без тезиса и факта дальше не идут»), предположение модели — работа
    интервью («я думаю, вот так — так?»). Поэтому все поля заполнены, но тезис
    и позицию модель придумала сама, а своего факта у человека нет: факт
    пришёл из памяти области.
  */
  const guessedBrief = () =>
    briefAnswer({
      origins: {
        goal: 'model',
        thesis: 'model',
        position: 'model',
        disagreement: 'model',
        audience: 'avatar',
        format: 'model',
      },
    });

  test('не больше трёх вопросов, у каждого предложение или честный null', async () => {
    const { service, calls } = buildIntake({ models: [guessedBrief()] });
    const plan = await service.prepare(
      'org-a',
      request({ skipInterview: false })
    );
    const events = await drain(service.run('org-a', plan, 'user-1'));

    const [asked] = named(events, 'piece-questions');
    expect(asked.round).toBe(1);
    expect(asked.questions.length).toBeLessThanOrEqual(3);
    expect(asked.questions.map((row) => row.key)).toEqual([
      'key_idea',
      'personal_detail',
      'position',
    ]);
    for (const question of asked.questions) {
      expect(question).toHaveProperty('suggested');
      expect(question.question.length).toBeGreaterThan(0);
    }
    // Модель предлагает первой там, где ей есть что предложить.
    expect(asked.questions[0].suggested).toBe(
      'Дедлайн, о котором знает другой, держится лучше назначенного себе'
    );
    // А личную деталь она честно не выдумывает.
    expect(asked.questions[1].suggested).toBeNull();
    // Вопрос терминален: ни сути, ни черновика на этом ходу нет.
    expect(calls.recordCore).toEqual([]);
    expect(calls.start).toEqual([]);
  });

  test('ответ хранится дословно, с опечаткой, и попадает в бриф как слово человека', async () => {
    const { service, calls } = buildIntake({
      models: [briefAnswer(), { text: CORE_TEXT }],
    });
    const plan = await service.prepare(
      'org-a',
      request({
        skipInterview: false,
        interview: [
          {
            key: 'personal_detail',
            text: 'у меня из шести дедлайнов сдивнулись пять, я считал',
            origin: 'person',
          },
          { key: 'position', text: 'режу срок вместе с клиентом', origin: 'person' },
        ],
      })
    );
    const events = await drain(service.run('org-a', plan, 'user-1'));

    const [, stored] = calls.recordCore[0];
    const answer = stored.brief.answers.find(
      (row) => row.key === 'personal_detail'
    );
    expect(answer.text).toBe('у меня из шести дедлайнов сдивнулись пять, я считал');
    expect(answer.origin).toBe('person');
    expect(answer.step).toBe('core');
    // Поле брифа стало словом человека.
    const [filled] = named(events, 'brief-filled');
    expect(filled.brief.position).toBe('режу срок вместе с клиентом');
    expect(filled.brief.origins.position).toBe('person');
    // Ответ приехал в промпт сути парой «вопрос → ответ», тоже дословно.
    const corePrompt = modelCalls.find((call) => call.role === 'draft').prompt;
    expect(corePrompt).toContain('ОТВЕТЫ НА ВОПРОСЫ (дословно)');
    expect(corePrompt).toContain('сдивнулись пять');
  });

  test('«Реши сама» не повторяет вопрос', async () => {
    const { service } = buildIntake({
      models: [guessedBrief(), { text: CORE_TEXT }],
    });
    const plan = await service.prepare(
      'org-a',
      request({
        skipInterview: false,
        decideKeys: ['key_idea', 'personal_detail', 'position'],
      })
    );
    const events = await drain(service.run('org-a', plan, 'user-1'));

    expect(named(events, 'piece-questions')).toEqual([]);
    expect(named(events, 'piece')).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------
 * Заготовка без каналов и событие поиска
 * ---------------------------------------------------------------------- */

describe('каналы необязательны', () => {
  test('без каналов получается заготовка и ни одного черновика', async () => {
    const { service, calls } = buildIntake({
      models: [briefAnswer(), { text: CORE_TEXT }],
    });
    const plan = await service.prepare('org-a', request({ integrationIds: [] }));
    const events = await drain(service.run('org-a', plan, 'user-1'));

    expect(calls.recordCore).toHaveLength(1);
    expect(calls.recordAdaptation).toEqual([]);
    expect(calls.start).toEqual([]);
    expect(named(events, 'done')[0].postIds).toEqual([]);
  });

  test('о поиске опоры говорится до него, а не после', async () => {
    const { service } = buildIntake({
      models: [briefAnswer({ facts: [] }), { text: CORE_TEXT }],
    });
    const plan = await service.prepare(
      'org-a',
      request({ options: { searchEnrichment: true } })
    );
    const events = await drain(service.run('org-a', plan, 'user-1'));
    const names = events.map((event) => event.name);

    expect(names).toContain('search-started');
    expect(names.indexOf('search-started')).toBeLessThan(
      names.indexOf('brief-filled')
    );
    expect(named(events, 'search-started')[0].reason).toBe('facts');
  });
});

/* -------------------------------------------------------------------------
 * Стенд заготовок
 * ---------------------------------------------------------------------- */

const CORE_BRIEF = {
  brief: {
    inputKind: 'thought',
    goal: null,
    thesis: 'Дедлайн, о котором знает другой, держится лучше',
    position: 'Ставлю себе срок только вместе с клиентом',
    disagreement: null,
    audience: 'владельцы студий',
    format: 'auto',
    facts: [],
    origins: { thesis: 'input' },
    ungrounded: [],
  },
  answers: [],
  slop: null,
  writtenBy: 'model',
  authorNumbers: true,
};

const pieceRow = (overrides = {}) => ({
  id: 'piece-12',
  title: 'Дедлайн, назначенный себе',
  kind: 'CORE',
  body: CORE_TEXT,
  brief: CORE_BRIEF,
  language: 'ru',
  tags: null,
  archivedAt: null,
  createdAt: new Date('2026-09-06T09:40:00.000Z'),
  brandProfileVersion: { versionNumber: 3, label: null },
  ...overrides,
});

const buildPieces = (options = {}) => {
  const calls = {
    start: [],
    createDraft: [],
    createAdaptation: [],
    deleted: [],
    search: [],
  };
  // `piece: null` — это «заготовки нет», а не «умолчание»: `??` съел бы её и
  // отказ `PIECE_NOT_FOUND` никогда бы не проверился.
  const piece = 'piece' in options ? options.piece : pieceRow();
  const repository = {
    listPieces: async () => options.pieces || [pieceRow()],
    listPieceIds: async () =>
      (options.pieces || [pieceRow()]).map((row) => ({ id: row.id })),
    getPiece: async () => piece,
    listIntegrations: async () => options.integrations ?? CHANNELS,
    adaptationsByPiece: async () => options.adaptations || [],
    searchPieceIds: async (...args) => {
      calls.search.push(args);
      return options.matched ?? null;
    },
    createDraft: async (organizationId, input) => {
      calls.createDraft.push([organizationId, input]);
      return 'post-9';
    },
    createAdaptation: async (organizationId, input) => {
      calls.createAdaptation.push([organizationId, input]);
      return {
        id: 'adaptation-9',
        createdAt: new Date('2026-09-06T10:00:00.000Z'),
      };
    },
    findAdaptation: async () => options.adaptation ?? null,
    deleteAdaptation: async (organizationId, pieceId, adaptationId) => {
      calls.deleted.push([organizationId, pieceId, adaptationId]);
      return { count: 1 };
    },
    archive: async () => ({ count: 1 }),
  };

  const service = new PieceService(
    repository,
    {
      start: async function* (organizationId, body) {
        calls.start.push([organizationId, body]);
        yield { data: { output: generatorOutput('Пять из шести сроков я сорвал сам себе.') } };
      },
    },
    { getSocialIntegration: (identifier) => PROVIDERS[identifier] },
    () => new Date('2026-09-06T11:00:00.000Z')
  );

  return { service, calls };
};

describe('адаптация под канал', () => {
  test('Telegram сначала спрашивает про крючок', async () => {
    const { service, calls } = buildPieces();
    const plan = await service.prepareAdapt(
      'org-a',
      'piece-12',
      { integrationId: 'int-tg' },
      'ru'
    );
    const events = await drain(service.adapt('org-a', plan));

    expect(plan.kind).toBe('post');
    expect(events.map((event) => event.name)).toEqual([
      'adapt-started',
      'questions',
    ]);
    const [asked] = named(events, 'questions');
    expect(asked.questions[0].key).toBe('hook');
    expect(asked.questions[0].why).toContain('80–180');
    // Крючок предложен первой фразой сути, а не выдуман заново.
    expect(asked.questions[0].suggested).toContain('Из шести дедлайнов');
    expect(asked.questions.map((row) => row.key)).toContain('cta');
    expect(asked.questions.length).toBeLessThanOrEqual(3);
    // Ни генерации, ни черновика на круге вопросов.
    expect(calls.start).toEqual([]);
    expect(calls.createDraft).toEqual([]);
  });

  test('с «пропустить» приходит адаптация и done', async () => {
    const { service, calls } = buildPieces();
    const plan = await service.prepareAdapt(
      'org-a',
      'piece-12',
      { integrationId: 'int-tg', skipInterview: true },
      'ru'
    );
    const events = await drain(service.adapt('org-a', plan));

    expect(events.map((event) => event.name)).toEqual([
      'adapt-started',
      'generator',
      'adaptation',
      'done',
    ]);
    const [written] = named(events, 'adaptation');
    expect(written.adaptation.platform).toBe('telegram');
    expect(written.adaptation.integrationName).toBe('Мой канал');
    expect(written.adaptation.state).toBe('draft');
    expect(written.adaptation.body).toBe('Пять из шести сроков я сорвал сам себе.');
    expect(named(events, 'done')[0].postId).toBe('post-9');
    // Суть доехала до генератора, аватар применяется здесь и только здесь.
    expect(calls.start[0][1].intake.core).toBe(CORE_TEXT);
    // Одна генерация, один черновик, одна строка.
    expect(calls.start).toHaveLength(1);
    expect(calls.createDraft).toHaveLength(1);
    expect(calls.createAdaptation).toHaveLength(1);
  });

  test('ответы под канал хранятся дословно и едут в подсказки', async () => {
    const { service, calls } = buildPieces();
    const plan = await service.prepareAdapt(
      'org-a',
      'piece-12',
      {
        integrationId: 'int-tg',
        answers: [
          { key: 'hook', text: 'пять из шести сроков я сорвал сам сибе', origin: 'person' },
        ],
      },
      'ru'
    );
    const events = await drain(service.adapt('org-a', plan));

    const [written] = named(events, 'adaptation');
    expect(written.adaptation.answers[0].text).toBe(
      'пять из шести сроков я сорвал сам сибе'
    );
    expect(written.adaptation.answers[0].step).toBe('adaptation');
    expect(written.adaptation.answers[0].platform).toBe('telegram');
    expect(calls.start[0][1].intake.answers).toEqual([
      'hook: пять из шести сроков я сорвал сам сибе',
    ]);
  });

  test.each([
    ['нет заготовки', { piece: null }, { integrationId: 'int-tg' }, 'PIECE_NOT_FOUND'],
    [
      'заготовка в архиве',
      { piece: pieceRow({ archivedAt: new Date('2026-09-05T00:00:00.000Z') }) },
      { integrationId: 'int-tg' },
      'PIECE_ARCHIVED',
    ],
    ['без канала', {}, {}, 'PIECE_CHANNEL_REQUIRED'],
    ['чужой канал', {}, { integrationId: 'int-nope' }, 'PIECE_CHANNEL_UNKNOWN'],
    [
      'видео — позже',
      {},
      { integrationId: 'int-tg', kind: 'video' },
      'ADAPTATION_KIND_UNSUPPORTED',
    ],
  ])('отказ до первого байта: %s', async (_label, stand, body, code) => {
    const { service } = buildPieces(stand);
    try {
      await service.prepareAdapt('org-a', 'piece-12', body, 'ru');
      throw new Error('the door should have refused');
    } catch (error) {
      expect(error.code).toBe(code);
      expect(typeof error.status).toBe('number');
    }
  });
});

describe('снятие адаптации и архив', () => {
  test('опубликованный пост своего происхождения не отдаёт', async () => {
    const { service, calls } = buildPieces({
      adaptation: {
        id: 'adaptation-9',
        postId: 'post-9',
        post: { state: 'PUBLISHED', deletedAt: null },
      },
    });

    await expect(
      service.deleteAdaptation('org-a', 'piece-12', 'adaptation-9')
    ).rejects.toMatchObject({ code: 'ADAPTATION_PUBLISHED', status: 409 });
    expect(calls.deleted).toEqual([]);
  });

  test('черновик снимается, а пост остаётся', async () => {
    const { service, calls } = buildPieces({
      adaptation: {
        id: 'adaptation-9',
        postId: 'post-9',
        post: { state: 'DRAFT', deletedAt: null },
      },
    });

    await service.deleteAdaptation('org-a', 'piece-12', 'adaptation-9');
    expect(calls.deleted).toEqual([['org-a', 'piece-12', 'adaptation-9']]);
  });

  test('несуществующая адаптация — свой код, а не молчание', async () => {
    const { service } = buildPieces({ adaptation: null });
    await expect(
      service.deleteAdaptation('org-a', 'piece-12', 'adaptation-nope')
    ).rejects.toMatchObject({ code: 'ADAPTATION_NOT_FOUND', status: 404 });
  });

  test('архив несуществующей заготовки отказывает своим кодом', async () => {
    const { service } = buildPieces({ piece: null });
    await expect(service.archive('org-a', 'piece-12', true)).rejects.toMatchObject(
      { code: 'PIECE_NOT_FOUND', status: 404 }
    );
  });
});

describe('список и страница', () => {
  test('строка несёт код, выдержку и клетку на каждую колонку', async () => {
    const { service } = buildPieces({
      adaptations: [
        {
          id: 'adaptation-12-tg',
          contentPieceId: 'piece-12',
          postId: 'post-412',
          integrationId: 'int-tg',
          platform: 'telegram',
          format: 'короткий',
          kind: 'post',
          title: null,
          body: 'Пять из шести сроков.',
          mediaId: null,
          brandProfileVersionId: null,
          createdAt: new Date('2026-09-06T09:41:00.000Z'),
          post: {
            state: 'PUBLISHED',
            releaseURL: 'https://t.me/example/412',
            publishDate: new Date('2026-09-06T10:00:00.000Z'),
            deletedAt: null,
            integration: {
              id: 'int-tg',
              name: 'Мой канал',
              providerIdentifier: 'telegram',
            },
          },
        },
      ],
    });

    const answer = await service.list('org-a', {}, 'ru');
    const [row] = answer.pieces;

    expect(row.code).toBe('cnt-01');
    expect(row.coreExtracted).toBe(true);
    expect(row.origin).toBe('thought');
    expect(row.excerpt[0]).toContain('Из шести дедлайнов');
    expect(row.excerpt.length).toBeLessThanOrEqual(3);
    expect(answer.columns.map((column) => column.platform)).toEqual([
      'telegram',
      'vk',
      'wordpress',
    ]);
    expect(row.cells.map((cell) => cell.state)).toEqual([
      'published',
      'none',
      'none',
    ]);
    expect(row.cells[0].url).toBe('https://t.me/example/412');
  });

  test('фильтр «ещё нет в …» убирает то, куда уже писали', async () => {
    const { service } = buildPieces({
      adaptations: [
        {
          id: 'a-1',
          contentPieceId: 'piece-12',
          postId: null,
          integrationId: 'int-tg',
          platform: 'telegram',
          format: 'короткий',
          kind: 'post',
          title: null,
          body: 'текст',
          mediaId: null,
          brandProfileVersionId: null,
          createdAt: new Date('2026-09-06T09:41:00.000Z'),
          post: null,
        },
      ],
    });

    expect(
      (await service.list('org-a', { missingOn: 'telegram' }, 'ru')).pieces
    ).toEqual([]);
    expect(
      (await service.list('org-a', { missingOn: 'vk' }, 'ru')).pieces
    ).toHaveLength(1);
  });

  test('поиск по словам видит архив ровно тогда, когда список его показывает', async () => {
    const archived = pieceRow({
      id: 'piece-old',
      archivedAt: new Date('2026-09-05T00:00:00.000Z'),
    });
    const { service, calls } = buildPieces({
      pieces: [archived],
      matched: new Set(['piece-old']),
    });

    expect((await service.list('org-a', { q: 'дедлайн' }, 'ru')).pieces).toEqual(
      []
    );
    expect(calls.search[0]).toEqual(['org-a', 'дедлайн', false]);

    const shown = await service.list(
      'org-a',
      { q: 'дедлайн', includeArchived: true },
      'ru'
    );
    expect(shown.pieces.map((row) => row.id)).toEqual(['piece-old']);
    expect(calls.search[1]).toEqual(['org-a', 'дедлайн', true]);
  });

  test('страница отдаёт суть, цели и строку «позже»', async () => {
    const { service } = buildPieces();
    const detail = await service.detail('org-a', 'piece-12', 'ru');

    expect(detail.core.text).toBe(CORE_TEXT);
    expect(detail.core.brief.thesis).toBe(
      'Дедлайн, о котором знает другой, держится лучше'
    );
    expect(detail.legacyBody).toBeNull();
    expect(detail.later).toEqual(['video', 'audio']);
    expect(
      detail.targets.map((target) => [target.platform, target.available])
    ).toEqual([
      ['telegram', true],
      ['vk', true],
      ['wordpress', true],
    ]);
    expect(detail.targets[2].kinds).toEqual(['article']);
  });

  test('материал до волны показывает тело, а не выдуманную суть', async () => {
    const { service } = buildPieces({
      piece: pieceRow({ kind: null, brief: null, body: '<p>Старый текст</p>' }),
      pieces: [pieceRow({ kind: null, brief: null, body: '<p>Старый текст</p>' })],
    });

    const detail = await service.detail('org-a', 'piece-12', 'ru');
    expect(detail.core).toBeNull();
    expect(detail.legacyBody).toBe('<p>Старый текст</p>');
    expect(detail.piece.coreExtracted).toBe(false);
    expect(detail.piece.excerpt).toEqual([]);
    expect(detail.piece.origin).toBe('legacy');
  });
});
