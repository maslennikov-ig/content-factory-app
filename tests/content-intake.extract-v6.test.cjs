'use strict';

/**
 * Названный вид материала не отдаётся модели на пересмотр
 * (`content-factory-next-97dq.21`, девятый заход 22.09.2026).
 *
 * Что случилось на бою. Владелец вставил чужой пост про комиссии
 * маркетплейсов и поставил галочку «Это чужой текст»: `inputKindExplicit` —
 * да, вид — `foreign_post`, и `settleKind` его удержал. Но промпт разбора
 * `intake-extract/v5` по-прежнему начинался со слов «сначала реши, что за
 * материал прислали», живая модель назвала пост мыслью, а «мысль» по тому же
 * промпту означает пустые `structure` и `claims`. Чужой текст в промпт сути не
 * идёт ни одним полем — и писать стало не из чего: `cnt-20 6206b6fc` вышел
 * ответом человека в 19 слов, `cnt-21 92fffda6` — тезисом с позицией
 * (`evidence/walk-2026-09-22/pieces/cnt-20-22.json`: `borrowed.claims` и
 * `borrowed.structure` пусты при непустых `topic` и `angle`).
 *
 * Отсюда четыре правила, и каждое судится здесь отдельно:
 *
 *  - вид назван — разбор спрашивают промптом `intake-extract/v6`, без шага
 *    классификации;
 *  - вид не назван — длинный текст по-прежнему разбирает классифицирующий v5;
 *  - утверждения и строение чужого поста доезжают до промпта сути;
 *  - пустой разбор при названном виде виден строкой в журнале, а не только
 *    своими последствиями. Утверждения за модель не придумываются: чужой текст
 *    — не то место, где можно дописать факт.
 *
 * Ни одного платного вызова: ответы модели записаны.
 */

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const SERVICE =
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts';

const { WebSearchNotConfigured, usableHttpsUrl } = loadWithMocks(
  'libraries/nestjs-libraries/src/openai/web.research.service.ts'
);

const { extractionPromptV6, EXTRACT_PROMPT_VERSION_V6 } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v6.ts'
);
const { EXTRACT_PROMPT_VERSION_V5, extractionPromptV5 } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v5.ts'
);
const { CORE_WRITE_BLOCK_TITLES_V3 } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/core-write-prompt.v3.ts'
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

/** `cnt-20 6206b6fc`: чужой пост, который эвристика зовёт мыслью. */
const MARKETPLACE_POST = [
  'Маркетплейсы снова подняли комиссии, и продавцы опять пишут, что работать стало невыгодно.',
  'Wildberries и Ozon объясняют это логистикой и скидками для покупателей, а по факту переписывают правила игры каждый квартал.',
  'Мне кажется, спорить с площадками бесполезно: они делают то, что выгодно им.',
  'Единственный выход для продавца — считать юнит-экономику заново после каждого письма от площадки и держать свой канал продаж рядом с маркетплейсом.',
].join('\n\n');

/* -------------------------------------------------------------------------
 * Записанные ответы модели
 * ---------------------------------------------------------------------- */

/** Ответ живой модели 22.09.2026: вид «мысль», строение и утверждения пусты. */
const emptyExtract = (overrides = {}) => ({
  materialKind: 'thought',
  topic: 'Комиссии маркетплейсов и экономика продавцов',
  angle: 'Продавцам стоит заново считать юнит-экономику и развивать свой канал',
  structure: [],
  claims: [],
  voiceNotes: null,
  ...overrides,
});

/** Каким разбор чужого поста быть обязан: строение и пересказанные утверждения. */
const richExtract = (overrides = {}) => ({
  materialKind: 'foreign_post',
  topic: 'Комиссии маркетплейсов и экономика продавцов',
  angle: 'Продавцам стоит заново считать юнит-экономику и развивать свой канал',
  structure: [
    'площадки подняли комиссии',
    'объяснение площадок про логистику',
    'вывод про свой канал продаж',
  ],
  claims: [
    { text: 'Площадки подняли комиссии для продавцов', hasNumber: false, searchQuery: null },
    { text: 'Правила работы площадок меняются каждый квартал', hasNumber: false, searchQuery: null },
    { text: 'Площадки объясняют повышение логистикой и скидками покупателям', hasNumber: false, searchQuery: null },
  ],
  voiceNotes: null,
  ...overrides,
});

/**
 * Живая модель 22.09.2026 одним ответом: на классифицирующий промпт она
 * называет этот пост мыслью и отдаёт пустоту, на промпт с названным видом —
 * разбирает. Ответ зависит от промпта, поэтому набор судит именно правило, а
 * не подложенный ответ.
 */
const liveExtract = (prompt) =>
  prompt.includes(`PROMPT VERSION: ${EXTRACT_PROMPT_VERSION_V6}`)
    ? richExtract()
    : emptyExtract();

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
  options: { thesis: null, position: null, disagreement: null, audience: null },
  questions: [],
  ...overrides,
});

/* -------------------------------------------------------------------------
 * Стенд
 * ---------------------------------------------------------------------- */

const build = (options = {}) => {
  const calls = { recordCore: [], usage: [] };
  modelCalls.length = 0;
  modelAnswers = [...(options.models || [])];
  const service = new IntakeService(
    { start: async function* () {} },
    { research: async () => { throw new WebSearchNotConfigured(); } },
    { acceptSearchResult: async () => { throw new Error('no evidence here'); } },
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
        return { id: `piece-${calls.recordCore.length}`, code: 'cnt-20' };
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
    () => new Date('2026-09-22T09:00:00.000Z'),
    () => ({ title: null, text: '' })
  );
  return { service, calls };
};

const drain = async (service, plan, actorUserId = 'user-1') => {
  const events = [];
  for await (const event of service.run('org-a', plan, actorUserId)) events.push(event);
  return events;
};

const request = (overrides = {}) => ({
  input: MARKETPLACE_POST,
  language: 'ru',
  ...overrides,
});

/** Промпт разбора материала — тот, где стоит строка версии входа. */
const extractPrompt = () =>
  modelCalls.find((call) => call.prompt.includes('PROMPT VERSION: intake-extract/'))?.prompt || '';

/* -------------------------------------------------------------------------
 * Правила
 * ---------------------------------------------------------------------- */

describe('97dq.21: названный чужой текст разбирают, а не классифицируют', () => {
  test('галочка «Это чужой текст» ведёт разбор промптом v6 без шага «реши, что это»', async () => {
    const { service } = build({ models: [richExtract(), briefAnswer()] });
    const plan = await service.prepare('org-a', request({ inputKind: 'foreign_post' }));

    expect(plan.inputKindExplicit).toBe(true);
    await drain(service, plan);

    const prompt = extractPrompt();
    expect(prompt).toContain(`PROMPT VERSION: ${EXTRACT_PROMPT_VERSION_V6}`);
    // Ни шага классификации, ни ветки «для мысли верни пустое строение».
    expect(prompt).not.toContain('First decide what kind of material');
    expect(prompt).not.toContain('with empty structure and claims');
    expect(prompt).toContain('This is a publication somebody else wrote');
  });

  test('длинный неназванный текст по-прежнему разбирает классифицирующий v5', async () => {
    const { service } = build({ models: [richExtract(), briefAnswer()] });
    const plan = await service.prepare('org-a', request());

    // Эвристика видит одно первое лицо и ни одного числа.
    expect(plan.inputKind).toBe('thought');
    expect(plan.inputKindExplicit).toBe(false);
    await drain(service, plan);

    const prompt = extractPrompt();
    expect(prompt).toContain(`PROMPT VERSION: ${EXTRACT_PROMPT_VERSION_V5}`);
    expect(prompt).toContain('First decide what kind of material');
  });

  test('утверждения и строение чужого поста доезжают до промпта сути', async () => {
    const answer = 'Я считаю, что продавцам нужно развивать свой канал продаж';
    const { service, calls } = build({
      models: [
        liveExtract,
        briefAnswer(),
        { text: 'Своя позиция про зависимость от площадок и подстраховку каналом.' },
      ],
    });
    const plan = await service.prepare(
      'org-a',
      request({
        inputKind: 'foreign_post',
        answers: [{ field: 'position', text: answer }],
      })
    );
    await drain(service, plan);

    // Записанная заготовка несёт разобранное, а не пустые списки боя.
    const [, stored] = calls.recordCore[0];
    expect(stored.brief.borrowed.claims).toHaveLength(3);
    expect(stored.brief.borrowed.structure).toHaveLength(3);

    // И то же самое видит модель сути — блоками чужого материала.
    const words = CORE_WRITE_BLOCK_TITLES_V3.ru;
    const draft = modelCalls.find((call) => call.role === 'draft')?.prompt || '';
    expect(draft).toContain(`${words.structure}: площадки подняли комиссии`);
    expect(draft).toContain(
      `${words.claims}: Правила работы площадок меняются каждый квартал`
    );
    // Сам чужой текст в промпт сути не идёт ни одним полем.
    expect(draft).not.toContain('Единственный выход для продавца');
  });

  test('пустой разбор при названном виде оставляет строку в журнале', async () => {
    const { service } = build({ models: [emptyExtract(), briefAnswer()] });
    const warn = jest.spyOn(service.logger, 'warn').mockImplementation(() => {});
    const plan = await service.prepare('org-a', request({ inputKind: 'foreign_post' }));
    await drain(service, plan);

    const lines = warn.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('"field":"borrowed.empty"'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"operation":"intake-extract"');
    expect(lines[0]).toContain(`"promptVersion":"${EXTRACT_PROMPT_VERSION_V6}"`);
    // Чужого текста в журнале нет: считается только его длина.
    expect(lines[0]).not.toContain('Маркетплейсы');
    warn.mockRestore();
  });

  test('предшественник остался импортируемым и нетронутым', () => {
    // Строка версии — то, по чему квитанция узнаёт, какими правилами получен
    // записанный ответ, поэтому она закреплена буквой, а не только константой.
    expect(EXTRACT_PROMPT_VERSION_V6).toBe('intake-extract/v6');
    expect(extractionPromptV5(MARKETPLACE_POST, 'ru')).toContain(
      `PROMPT VERSION: ${EXTRACT_PROMPT_VERSION_V5}`
    );
    // Схема ответа не менялась: поле вида осталось ради записанных прогонов.
    expect(extractionPromptV6(MARKETPLACE_POST, 'ru')).toContain('materialKind');
  });
});
