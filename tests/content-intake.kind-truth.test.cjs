'use strict';

/**
 * Чей это текст — решается один раз и не пересматривается моделью
 * (`content-factory-next-97dq.1`, девятая волна по восьмому заходу 18.09.2026).
 *
 * Что случилось на бою. Заготовка `cnt-19 760615d5`: человек вставил чужой
 * пост про комиссии Wildberries и Ozon, разбор звали ДВАЖДЫ, оба раза модель
 * ответила «мысль», `brief.inputKind` остался `thought`, происхождение позиции
 * — `input`, `questions.items` — пусто. Блока уточнения позиции человек не
 * увидел, и адаптация встала на позицию чужого автора как на его собственную.
 *
 * Отсюда четыре правила, и каждое здесь судится отдельно:
 *
 *  - галочка «Это чужой текст» сильнее ответа модели и не перепроверяется;
 *  - без галочки модель может только ПОВЫСИТЬ догадку «мысль» → «чужой пост»;
 *  - второй проход берёт вид материала из снимка, а не считает его заново;
 *  - у чужого поста позиция, которую человек не называл, — предположение
 *    модели, каким бы происхождением её ни подписали.
 *
 * Тексты взяты из живого захода: `pieces/cnt-19-C1-D1-F2-foreign-post-*.json`
 * (`personText`) и `pieces/B1-iceland-research-*.json`. Ответы модели —
 * записанные, ни одного платного вызова.
 */

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const SERVICE =
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts';
const PROMPTS =
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v5.ts';

const { WebSearchNotConfigured, usableHttpsUrl } = loadWithMocks(
  'libraries/nestjs-libraries/src/openai/web.research.service.ts'
);

const { extractionPromptV5, extractionSchemaV5 } =
  loadWithMocks(PROMPTS);
const { extractionPromptV4 } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v4.ts'
);
/** Разбор при названном виде (`97dq.21`): промпт без шага классификации. */
const { EXTRACT_PROMPT_VERSION_V6 } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v6.ts'
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

/* -------------------------------------------------------------------------
 * Тексты живого захода
 * ---------------------------------------------------------------------- */

/** `cnt-19 760615d5`, `personText`: чужой пост, который эвристика зовёт мыслью. */
const MARKETPLACE_POST = [
  'Маркетплейсы снова подняли комиссии, и продавцы опять пишут, что работать стало невыгодно.',
  'Wildberries и Ozon объясняют это логистикой и скидками для покупателей, а по факту переписывают правила игры каждый квартал.',
  'Мне кажется, спорить с площадками бесполезно: они делают то, что выгодно им.',
  'Единственный выход для продавца — считать юнит-экономику заново после каждого письма от площадки и держать свой канал продаж рядом с маркетплейсом.',
].join('\n\n');

/** Девятьсот знаков от первого лица с тремя числами: эвристика зовёт это чужим постом. */
const LONG_FOREIGN_POST = [
  'Мы закрыли половину продуктовой линейки в марте и до сих пор считаем это',
  'лучшим решением года. Выручка компании достигла 4,2 млрд рублей, и это на',
  '37% больше, чем годом раньше. Присутствие осталось в 12 странах вместо',
  'девятнадцати. Я помню, как мы спорили об этом три недели подряд, и помню',
  'аргумент, который всё решил: широкая линейка не защищает от просадки, она',
  'просто размазывает её по кварталам. Наша команда переехала на новую',
  'платформу за шесть недель, без единого простоя. Мне до сих пор пишут',
  'бывшие клиенты закрытых продуктов, и я каждому отвечаю сам. Это',
  'неприятная часть работы, и её нельзя делегировать. Если бы мы начинали',
  'заново, я резал бы ещё жёстче и ещё раньше, потому что боль от',
  'отказа короче боли от растянутого умирания продукта, который никому',
  'не нужен.',
].join(' ');

/** `B1 8cc5a492`: одно предложение автора с тремя числами. */
const ICELAND_SENTENCE =
  'Исландский эксперимент с четырёхдневкой охватил 25 тысяч человек, испытание шло с 2014 по 2019 год, а производительность выросла на 40%.';

/* -------------------------------------------------------------------------
 * Записанные ответы модели
 * ---------------------------------------------------------------------- */

const extractAnswer = (overrides = {}) => ({
  materialKind: 'foreign_post',
  topic: 'рост комиссий Wildberries и Ozon',
  angle: 'продавцу нужно пересчитывать экономику и строить свой канал',
  structure: ['повышение', 'объяснение площадок', 'вывод'],
  claims: [],
  voiceNotes: null,
  ...overrides,
});

const briefAnswer = (overrides = {}) => ({
  goal: 'показать продавцам, как реагировать на повышение комиссий',
  thesis: 'Спорить с площадками бесполезно, считайте экономику заново',
  position: 'Спорить с площадками бесполезно: они делают то, что выгодно им',
  disagreement: 'Те, кто верит в коллективные жалобы',
  audience: 'продавцы на Wildberries и Ozon',
  format: 'expert',
  facts: [],
  origins: {
    goal: 'model',
    thesis: 'input',
    position: 'input',
    disagreement: 'model',
    audience: 'avatar',
    format: 'model',
  },
  options: {
    thesis: null,
    position: [
      'Я считаю, что продавцам нужно строить свой канал продаж',
      'Я считаю, что с площадками всё же стоит спорить',
    ],
    disagreement: null,
    audience: null,
  },
  questions: [],
  ...overrides,
});

const fakeSnapshotStore = () => {
  const rows = new Map();
  return {
    rows,
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => {
      rows.set(key, value);
    },
    del: async (key) => {
      rows.delete(key);
    },
  };
};

const build = (options = {}) => {
  const calls = { research: [], recordCore: [], usage: [] };
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
          project: { audiences: [{ name: 'продавцы на маркетплейсах', need: 'ведут канал сами' }] },
          guardrails: { prohibitedClaims: [] },
        },
      }),
    },
    {
      recordCore: async (organizationId, input) => {
        calls.recordCore.push([organizationId, input]);
        return { id: `piece-${calls.recordCore.length}`, code: 'cnt-19' };
      },
    },
    { getIntegrationsList: async () => [] },
    { getSocialIntegration: () => undefined },
    {
      executeAiOperation: async (organizationId, operation, callback, role) => {
        calls.usage.push([organizationId, operation, role]);
        return callback();
      },
    },
    () => new Date('2026-09-18T09:00:00.000Z'),
    () => ({ title: null, text: '' }),
    null,
    null,
    undefined,
    options.snapshots ?? null
  );
  return { service, calls };
};

const drain = async (service, plan, actorUserId = 'user-1') => {
  const events = [];
  for await (const event of service.run('org-a', plan, actorUserId)) events.push(event);
  return events;
};
const named = (events, name) => events.filter((event) => event.name === name);
/** Сколько раз спрошен разбор материала — по строке версии в промпте. */
const extractPrompts = () =>
  modelCalls.filter((call) => call.prompt.includes('PROMPT VERSION: intake-extract/'));
const request = (overrides = {}) => ({
  input: MARKETPLACE_POST,
  language: 'ru',
  ...overrides,
});

/* -------------------------------------------------------------------------
 * Правила
 * ---------------------------------------------------------------------- */

describe('вид материала: сказанное человеком сильнее ответа модели', () => {
  test('галочка «Это чужой текст» держится, даже когда модель отвечает «мысль»', async () => {
    const { service, calls } = build({
      models: [extractAnswer({ materialKind: 'thought' }), briefAnswer()],
    });
    const plan = await service.prepare('org-a', request({ inputKind: 'foreign_post' }));

    expect(plan.inputKind).toBe('foreign_post');
    expect(plan.inputKindExplicit).toBe(true);

    const events = await drain(service, plan);
    const [filled] = named(events, 'brief-filled');
    const [questions] = named(events, 'questions');

    // Модель сказала «мысль» — и это ничего не изменило.
    expect(filled.brief.inputKind).toBe('foreign_post');
    expect(named(events, 'intake-started')[0].inputKind).toBe('foreign_post');
    // Позиция, которую человек не называл, — предположение модели, и о ней
    // спрашивают: это и есть тот блок уточнения, которого не было на бою.
    expect(filled.brief.origins.position).toBe('model');
    expect(questions.questions.map((row) => row.field)).toContain('position');
    // Разбор спрошен один раз, а не дважды (на бою было два вызова).
    expect(extractPrompts()).toHaveLength(1);
    /*
      И спрошен промптом без классификации (`97dq.21`, заход 22.09.2026):
      названный вид не пересматривают, а записанный ответ «мысль» здесь стоит
      как доказательство, что его никто не читает. Про сам промпт судит
      `content-intake.extract-v6.test.cjs`.
    */
    expect(modelCalls[0].prompt).toContain(`PROMPT VERSION: ${EXTRACT_PROMPT_VERSION_V6}`);
    expect(calls.research).toEqual([]);
  });

  test('названная «мысль» не отдаётся на пересмотр: разбор не зовут вовсе', async () => {
    const { service } = build({
      models: [briefAnswer({ questions: [] }), { text: 'Суть из своей мысли.' }],
    });
    const plan = await service.prepare(
      'org-a',
      request({ input: LONG_FOREIGN_POST, inputKind: 'thought', skipInterview: true })
    );
    const events = await drain(service, plan);

    expect(plan.inputKindExplicit).toBe(true);
    expect(named(events, 'brief-filled')[0].brief.inputKind).toBe('thought');
    // Ни одного разбора материала: за классификацию сказанного не платят.
    expect(extractPrompts()).toEqual([]);
  });

  test('без галочки догадку «чужой пост» модель не понижает до «мысли»', async () => {
    const { service } = build({
      models: [extractAnswer({ materialKind: 'thought' }), briefAnswer()],
    });
    const plan = await service.prepare('org-a', request({ input: LONG_FOREIGN_POST }));

    // Эвристика узнала перепечатанный пост сама.
    expect(plan.inputKind).toBe('foreign_post');
    expect(plan.inputKindExplicit).toBe(false);

    const events = await drain(service, plan);
    expect(named(events, 'brief-filled')[0].brief.inputKind).toBe('foreign_post');
    expect(named(events, 'questions')[0].questions.map((row) => row.field)).toContain('position');
  });

  test('без галочки догадку «мысль» модель повышает до чужого поста', async () => {
    const { service } = build({ models: [extractAnswer(), briefAnswer()] });
    const plan = await service.prepare('org-a', request());

    expect(plan.inputKind).toBe('thought');
    const events = await drain(service, plan);

    expect(named(events, 'brief-filled')[0].brief.inputKind).toBe('foreign_post');
    expect(named(events, 'claims')).toHaveLength(1);
  });
});

describe('позиция чужого поста принадлежит человеку, а не подписи модели', () => {
  test.each(['input', 'avatar', 'memory', 'search'])(
    'происхождение «%s» становится «model», и вопрос о позиции задаётся',
    async (claimed) => {
      const { service } = build({
        models: [
          extractAnswer(),
          briefAnswer({
            origins: { ...briefAnswer().origins, position: claimed },
          }),
        ],
      });
      const plan = await service.prepare('org-a', request({ inputKind: 'foreign_post' }));
      const events = await drain(service, plan);
      const [filled] = named(events, 'brief-filled');

      expect(filled.brief.origins.position).toBe('model');
      const [questions] = named(events, 'questions');
      expect(questions.questions.map((row) => row.field)).toContain('position');
      const position = questions.questions.find((row) => row.field === 'position');
      expect(position.options.every((option) => option.startsWith('Я '))).toBe(true);
    }
  );

  test('ответ человека остаётся его словом, и второй раз о позиции не спрашивают', async () => {
    const answer = 'Я считаю, что продавцам нужно развивать свой канал продаж';
    const { service } = build({
      models: [extractAnswer(), briefAnswer(), { text: 'Суть с позицией человека.' }],
    });
    const plan = await service.prepare(
      'org-a',
      request({ inputKind: 'foreign_post', answers: [{ field: 'position', text: answer }] })
    );
    const events = await drain(service, plan);
    const [filled] = named(events, 'brief-filled');

    expect(filled.brief.position).toBe(answer);
    expect(filled.brief.origins.position).toBe('person');
    expect(named(events, 'questions')).toEqual([]);
  });
});

describe('второй проход помнит, чей это был текст', () => {
  /** Первый проход с ресерчем: пауза, снимок, ключ. */
  const firstPass = async (snapshots) => {
    const first = build({
      models: [extractAnswer(), briefAnswer()],
      research: [{ summary: 'Ничего', provider: 'exa', facts: [], sources: [] }],
      snapshots,
    });
    const plan = await first.service.prepare(
      'org-a',
      request({
        inputKind: 'foreign_post',
        options: { researchEnabled: true, researchLevel: 'standard' },
      })
    );
    const events = await drain(first.service, plan);
    return named(events, 'research-selection-required')[0];
  };

  test('снимок возвращает вид материала, и вопрос о позиции доживает до заготовки', async () => {
    const snapshots = fakeSnapshotStore();
    const pause = await firstPass(snapshots);
    expect(pause.snapshotKey).toEqual(expect.any(String));

    // Второй запрос приходит без `inputKind` — ровно так, как на бою.
    const second = build({ snapshots });
    const resumed = await second.service.prepare(
      'org-a',
      request({ researchSelections: [], snapshotKey: pause.snapshotKey })
    );
    expect(resumed.inputKind).toBe('thought');

    const events = await drain(second.service, resumed);
    expect(named(events, 'intake-started')[0].inputKind).toBe('foreign_post');

    const [, stored] = second.calls.recordCore[0];
    expect(stored.brief.brief.inputKind).toBe('foreign_post');
    expect(stored.brief.questions.items.map((row) => row.field)).toContain('position');
    // Чужой текст в суть не идёт ни одним полем.
    expect(stored.brief.personText).toBe('');
    expect(stored.brief.brief.inputSources).toEqual([{ kind: 'foreign_post' }]);
    // …но хранится дословно для страницы заготовки: вопрос о позиции задан по
    // нему, и он должен стоять перед глазами (`97dq.25`).
    expect(stored.brief.sourceText).toBe(MARKETPLACE_POST.trim());
    // «Что вы прислали» (`97dq.41`) — то же самое, дословно.
    expect(stored.brief.inputText).toBe(MARKETPLACE_POST.trim());
  });

  test('своя мысль хранит свои слова, а чужого текста у неё нет', async () => {
    const { service, calls } = build({
      models: [briefAnswer({ questions: [] }), { text: 'Суть из своей мысли.' }],
    });
    const plan = await service.prepare(
      'org-a',
      request({ input: 'Мы сократили неделю до четырёх дней.', inputKind: 'thought' })
    );
    await drain(service, plan);
    const [, stored] = calls.recordCore[0];
    expect(stored.brief.personText).toBe('Мы сократили неделю до четырёх дней.');
    expect(stored.brief.sourceText).toBeUndefined();
    expect(stored.brief.inputText).toBe('Мы сократили неделю до четырёх дней.');
  });

  /** Снимок, записанный до этой волны: полей вида материала в нём нет. */
  const agedSnapshot = (snapshots, alsoDropBriefKind = false) => {
    for (const [key, raw] of snapshots.rows) {
      const parsed = JSON.parse(raw);
      delete parsed.state.inputKind;
      delete parsed.state.inputKindExplicit;
      if (alsoDropBriefKind) delete parsed.state.filled.brief.inputKind;
      snapshots.rows.set(key, JSON.stringify(parsed));
    }
  };

  test('снимок старого образца отдаёт вид материала своим брифом', async () => {
    /*
      Ход, поставленный на паузу до выпуска и продолженный после него (час
      TTL). Полей волны в снимке нет, но `brief.inputKind` в нём стоял с
      первого прохода — и он же решение первого прохода. Раньше здесь стояло
      понижение до «мысли», и вопрос о позиции не задавался.
    */
    const snapshots = fakeSnapshotStore();
    const pause = await firstPass(snapshots);
    agedSnapshot(snapshots);

    const second = build({ snapshots });
    const resumed = await second.service.prepare(
      'org-a',
      request({ researchSelections: [], snapshotKey: pause.snapshotKey })
    );
    const events = await drain(second.service, resumed);

    expect(named(events, 'intake-started')[0].inputKind).toBe('foreign_post');
    const [, stored] = second.calls.recordCore[0];
    expect(stored.brief.questions.items.map((row) => row.field)).toContain('position');
    expect(stored.brief.personText).toBe('');
  });

  test('снимок вовсе без вида материала оставляет прежнее поведение', async () => {
    const snapshots = fakeSnapshotStore();
    const pause = await firstPass(snapshots);
    agedSnapshot(snapshots, true);

    const second = build({ models: [{ text: 'Суть.' }], snapshots });
    const resumed = await second.service.prepare(
      'org-a',
      request({ researchSelections: [], snapshotKey: pause.snapshotKey })
    );
    const events = await drain(second.service, resumed);

    expect(named(events, 'intake-started')[0].inputKind).toBe('thought');
    expect(second.calls.recordCore).toHaveLength(1);
  });
});

describe('разбор материала: одно число — одно утверждение', () => {
  test('промпт v5 требует по утверждению на число и свой запрос поиска', () => {
    const prompt = extractionPromptV5(ICELAND_SENTENCE, 'ru');

    expect(prompt).toContain('PROMPT VERSION: intake-extract/v5');
    expect(prompt).toContain('ONE claim carries ONE number');
    expect(prompt).toContain('three numbers becomes three claims');
    expect(prompt).toContain('its own short searchQuery');
    // Предшественник остался нетронутым и импортируемым.
    expect(extractionPromptV4(ICELAND_SENTENCE, 'ru')).toContain(
      'PROMPT VERSION: intake-extract/v4'
    );
  });

  test('три числа одного предложения приходят тремя утверждениями с опорой на схему', async () => {
    const atomic = {
      materialKind: 'foreign_post',
      topic: 'исландский эксперимент с четырёхдневкой',
      angle: 'сокращение недели не снизило результат',
      structure: ['охват', 'сроки', 'итог'],
      claims: [
        { text: 'Эксперимент охватил 25 тысяч человек', hasNumber: true, searchQuery: 'исландский эксперимент 25 тысяч участников' },
        { text: 'Испытание шло с 2014 по 2019 год', hasNumber: true, searchQuery: 'исландское испытание 2014 2019' },
        { text: 'Производительность выросла на 40%', hasNumber: true, searchQuery: 'исландия производительность рост 40%' },
      ],
      voiceNotes: null,
    };
    // Схема преемника принимает записанный ответ и оставляет запрос при каждом
    // числе: по ним проверка фактов ходит отдельным запросом на утверждение.
    const parsed = extractionSchemaV5.parse(atomic);
    expect(parsed.claims).toHaveLength(3);
    expect(parsed.claims.map((claim) => claim.searchQuery)).toEqual([
      'исландский эксперимент 25 тысяч участников',
      'исландское испытание 2014 2019',
      'исландия производительность рост 40%',
    ]);

    const { service } = build({
      models: [atomic, briefAnswer()],
      research: [],
    });
    const plan = await service.prepare(
      'org-a',
      request({ input: ICELAND_SENTENCE.repeat(4), inputKind: 'foreign_post' })
    );
    const events = await drain(service, plan);
    const [claims] = named(events, 'claims');

    expect(claims.claims.map((claim) => [claim.text, claim.hasNumber, claim.status])).toEqual([
      ['Эксперимент охватил 25 тысяч человек', true, 'skipped'],
      ['Испытание шло с 2014 по 2019 год', true, 'skipped'],
      ['Производительность выросла на 40%', true, 'skipped'],
    ]);
  });
});

/* -------------------------------------------------------------------------
 * Задание (`97dq.28`, `97dq.29`; `cnt-28` десятого захода 22.09.2026)
 * ---------------------------------------------------------------------- */

/** `cnt-28`: переписка со ссылками, своё задание и вопросы ведущего под ним. */
const RADIO_INSTRUCTION = [
  '[17.09.2026 5:13] Дарья: Игорь, добрый день! сможете репостнуть эфир с вами у себя в соцсетях, пожалуйста:',
  'https://vk.ru/radiosputnik_khv?w=wall-236404135_1466',
  '[17.09.2026 6:27] Дарья: https://max.ru/radiosputnik_khv/AaCtY6o4aXg',
  'https://t.me/radiosputnik_khv/20430',
  '',
  'Хочу написать у себя в ТГ-канале пост о том, что я выступил на радио. И здесь можно как раз посмотреть выступление.',
  'Для меня был на это новый любопытный опыт. Отвечал на вопросы. И вот здесь вот список вопросов, на которые я отвечал, ниже.',
  'Вот на основе этого хочу сформировать пост. И сохранить вот эти ссылки на эти соцсети.',
  '',
  'Вот сами вопросы:',
  '1. «ИИ украл идею» или «нашел закономерность»: где грань между обучением и воровством?',
  '2. Бизнес на ИИ: кто владеет результатом, если «автор» — нейросеть?',
  '3. Во сколько может обойтись «доверие» ИИ?',
  '4. Три шага, чтобы работать с ИИ и не потерять свои идеи.',
].join('\n');

const RADIO_LINKS = [
  'https://vk.ru/radiosputnik_khv?w=wall-236404135_1466',
  'https://max.ru/radiosputnik_khv/AaCtY6o4aXg',
  'https://t.me/radiosputnik_khv/20430',
];

describe('задание: слова человека о посте — не материал, ссылки — сохраняются', () => {
  test('названное задание не читает ссылки, не зовёт разбор и не спрашивает о позиции', async () => {
    const { service, calls } = build({
      models: [
        (prompt) => {
          // Бриф по заданию заполняет промпт v7, и ссылки в нём — адреса, а не источники.
          expect(prompt).toContain('PROMPT VERSION: intake-brief-fill/v7');
          expect(prompt).toContain('person’s INSTRUCTION: they describe the post they want written');
          expect(prompt).toContain('Links the person told us to keep (addresses only, not sources):');
          for (const link of RADIO_LINKS) expect(prompt).toContain(`- ${link}`);
          return briefAnswer({
            thesis: 'Я выступил на радио и отвечал на вопросы о том, может ли ИИ украсть идею',
            position: null,
            origins: { goal: 'input', thesis: 'input', position: 'model', disagreement: 'model', audience: 'avatar', format: 'model' },
            options: { thesis: null, position: null, disagreement: null, audience: null },
            questions: [],
          });
        },
        (prompt) => {
          // Суть пишется по блокам задания, а не по «словам человека».
          expect(prompt).toContain('PROMPT VERSION: core-write/v10');
          expect(prompt).toContain('ЗАДАНИЕ (что человек хочет написать; описание поста, не его текст)');
          expect(prompt).toContain('ССЫЛКИ ИЗ ЗАДАНИЯ (переносятся в текст как есть)');
          for (const link of RADIO_LINKS) expect(prompt).toContain(link);
          expect(prompt).toContain('Отдельное правило о блоке «задание»');
          // Блок «слова человека» пуст: фразы задания — не материал.
          expect(prompt).not.toMatch(/СЛОВА ЧЕЛОВЕКА[^\n]*\n[^\n]*Хочу написать/u);
          return { text: `Я выступил на радио Sputnik Хабаровск. Посмотреть можно здесь: ${RADIO_LINKS[0]}` };
        },
      ],
    });
    const plan = await service.prepare(
      'org-a',
      request({ input: RADIO_INSTRUCTION, inputKind: 'instruction', skipInterview: true })
    );
    expect(plan.inputKind).toBe('instruction');
    expect(plan.inputKindExplicit).toBe(true);

    const events = await drain(service, plan);
    expect(named(events, 'intake-started')[0]).toEqual({ name: 'intake-started', inputKind: 'instruction', sources: ['instruction'] });
    // По ссылкам никто не ходил: в этом наборе fetch бросает, и события чтения нет.
    expect(named(events, 'link-fetched')).toEqual([]);
    expect(named(events, 'links-skipped')).toEqual([]);
    expect(extractPrompts()).toEqual([]);
    const [filled] = named(events, 'brief-filled');
    expect(filled.brief.inputKind).toBe('instruction');
    expect(filled.brief.inputSources).toEqual([{ kind: 'instruction' }]);
    // Вопрос «согласны ли вы с автором» — только у чужого поста.
    expect(named(events, 'questions').flatMap((row) => row.questions.map((q) => q.field))).not.toContain('position');

    const [, stored] = calls.recordCore[0];
    expect(stored.brief.personText).toBe('');
    expect(stored.brief.sourceText).toBeUndefined();
    expect(stored.brief.instructionText).toBe(RADIO_INSTRUCTION);
    // Весь ввод целиком, со ссылками и второй фразой (`97dq.41`, cnt-29).
    expect(stored.brief.inputText).toBe(RADIO_INSTRUCTION.trim());
    expect(stored.brief.keepLinks).toEqual(RADIO_LINKS);
    expect(stored.body).toContain(RADIO_LINKS[0]);
  });

  test('без названного вида собственная речь от первого лица больше не делает вход чужим постом', async () => {
    const { service } = build({
      models: [extractAnswer({ materialKind: 'thought' }), briefAnswer({ questions: [] }), { text: 'Суть.' }],
    });
    const plan = await service.prepare('org-a', request({ input: RADIO_INSTRUCTION, skipInterview: true }));
    // `cnt-28` на бою: «Хочу написать…», «Для меня был…», «Отвечал…» делали вход чужим постом.
    expect(plan.inputKind).toBe('thought');
    expect(plan.inputKindExplicit).toBe(false);
    const events = await drain(service, plan);
    expect(named(events, 'brief-filled')[0].brief.inputKind).toBe('thought');
  });
});
