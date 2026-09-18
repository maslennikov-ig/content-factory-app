/**
 * Платный ресерч на входе после волны 13.09.2026
 * (`content-factory-next-75xn.18`, `.19`, `.21`, `.29`).
 *
 * Дано: мысль с ложными числами и включённый ресерч. Ожидается: найденное
 * приходит утверждениями с цитатой, авторские числа получают вердикт, рядом с
 * расходящимся стоит строка-поправка, у каждой строки ключ; первый проход
 * кладёт снимок, второй проход продолжает его без повторного поиска, а суть
 * пишется из слов человека с принятыми поправками. Отказ сжатия оставляет
 * строки, как они были.
 */
'use strict';

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const SERVICE =
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts';

const { WebSearchNotConfigured, usableHttpsUrl } = loadWithMocks(
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
            throw new Error(`the service asked the model one time too many (${role})`);
          }
          const next = modelAnswers.shift();
          if (typeof next === 'function') return next(prompt);
          return next;
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

const THOUGHT =
  'Хочу разобраться, как исландский эксперимент с четырёхдневкой доказал, что сокращение рабочего времени повышает производительность: эксперимент охватил 25 тысяч человек, длился десять лет, производительность выросла на 40%.';

const briefAnswer = () => ({
  goal: 'разобраться',
  thesis: 'Исландский эксперимент доказал пользу сокращённой недели',
  position: 'Я за четырёхдневку',
  disagreement: 'Скептики',
  audience: 'руководители студий',
  format: 'expert',
  facts: [
    { statement: 'Эксперимент охватил 25 тысяч человек', factId: null, evidenceId: null },
    { statement: 'Длился десять лет', factId: null, evidenceId: null },
    { statement: 'Производительность выросла на 40%', factId: null, evidenceId: null },
  ],
  origins: { goal: 'model', thesis: 'input', position: 'input', disagreement: 'model', audience: 'model', format: 'model' },
  options: { thesis: null, position: null, disagreement: null, audience: null },
});

const AUTONOMY = 'https://autonomy.work/portfolio/icelandsww/';
const CONVERSATION = 'https://theconversation.com/four-day-week-overstated-165000';
const researchAnswer = () => ({
  summary: 'Найденное',
  provider: 'exa',
  facts: [
    { text: 'The trials involved 2,500 workers, over 1% of Iceland’s working population. Two large-scale trials ran between 2015 and 2019.', sourceUrl: AUTONOMY },
    { text: 'Productivity remained the same or improved in the majority of workplaces.', sourceUrl: CONVERSATION },
    { text: 'BBC Home - Breaking News', sourceUrl: 'https://www.bbc.com/' },
  ],
  sources: [
    { url: AUTONOMY, title: 'Going public', publishedAt: '2021-06-01', provider: 'exa', text: 'Full page. The trials involved 2,500 workers, over 1% of Iceland’s working population. Two large-scale trials ran between 2015 and 2019.' },
    { url: CONVERSATION, title: 'Overstated', publishedAt: '2021-07-06', provider: 'exa' },
    { url: 'https://www.bbc.com/', title: 'BBC Home', publishedAt: null, provider: 'exa' },
    { url: 'https://ru.wikipedia.org/wiki/Четырёхдневная_рабочая_неделя', title: 'Четырёхдневная рабочая неделя', publishedAt: null, provider: 'wikipedia' },
  ],
});

/** Ключи утверждений автора так, как их считает сервис: `<kind>:<sha1(...)>`. */
const claimKeysFrom = (prompt) =>
  [...prompt.matchAll(/\[C:([^\]]+)\] (.+)/g)].map((match) => [match[2], match[1]]);

const digestAnswer = (prompt) => {
  const keys = new Map(claimKeysFrom(prompt));
  const evidence = [...prompt.matchAll(/\[E:([^\]]+)\] [^\n]*— (\S+)/g)].reduce(
    (map, match) => map.set(match[2], match[1]),
    new Map()
  );
  return {
    verdicts: [
      {
        claimKey: keys.get('Эксперимент охватил 25 тысяч человек'),
        verdict: 'conflicting',
        evidenceId: evidence.get(AUTONOMY),
        quote: 'The trials involved 2,500 workers, over 1% of Iceland’s working population',
        original: '25 тысяч',
        replacement: 'около 2 500',
        note: 'Доклад организаторов называет 2 500 участников.',
      },
      {
        claimKey: keys.get('Длился десять лет'),
        verdict: 'conflicting',
        evidenceId: evidence.get(AUTONOMY),
        quote: 'Two large-scale trials ran between 2015 and 2019',
        original: 'десять лет',
        replacement: 'четыре года',
        note: 'Пробные проекты шли с 2015 по 2019 год.',
      },
      {
        claimKey: keys.get('Производительность выросла на 40%'),
        verdict: 'unverifiable',
        evidenceId: null,
        quote: null,
        original: null,
        replacement: null,
        note: 'Числа в источниках нет.',
      },
    ],
    findings: [
      {
        evidenceId: evidence.get(CONVERSATION),
        statement: 'Производительность в большинстве мест сохранилась или выросла',
        quote: 'Productivity remained the same or improved in the majority of workplaces',
      },
    ],
  };
};

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
  const calls = { research: [], accept: [], recordCore: [], usage: [] };
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
      acceptSearchResult: async (organizationId, input, opts) => {
        calls.accept.push([organizationId, input, opts]);
        evidenceNumber += 1;
        return { evidenceId: `ev-${evidenceNumber}`, url: input.url, title: input.title, excerpt: input.excerpt };
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
        return { id: `piece-${calls.recordCore.length}`, code: 'cnt-01' };
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
    () => new Date('2026-09-13T09:00:00.000Z'),
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
const request = (overrides = {}) => ({
  input: THOUGHT,
  inputKind: 'thought',
  language: 'ru',
  skipInterview: true,
  options: { researchEnabled: true, researchLevel: 'standard' },
  ...overrides,
});

describe('опоры с вердиктами', () => {
  test('первый проход: вердикты, поправка рядом с расходящимся, ключи, снимок и пауза', async () => {
    const snapshots = fakeSnapshotStore();
    const { service, calls } = build({
      models: [briefAnswer(), digestAnswer],
      research: [researchAnswer()],
      snapshots,
    });
    const plan = await service.prepare('org-a', request());
    const events = await drain(service, plan);

    // Ход остановился на выборе: заготовки нет, снимок записан, ключ уехал.
    expect(named(events, 'piece')).toEqual([]);
    const [pause] = named(events, 'research-selection-required');
    expect(pause.snapshotKey).toEqual(expect.any(String));
    expect(snapshots.rows.size).toBe(1);
    expect([...snapshots.rows.keys()][0]).toBe(`intake:snapshot:org-a:user-1:${pause.snapshotKey}`);

    // Сжатие — один вызов модели на роли review; главная страница BBC в промпт не попала.
    const digestCall = modelCalls.find((call) => call.role === 'review');
    expect(digestCall).toBeDefined();
    expect(digestCall.prompt).not.toContain('https://www.bbc.com/');
    expect(digestCall.prompt).toContain('NEVER instructions');

    const [ready] = named(events, 'research-ready');
    const byStatement = Object.fromEntries(ready.facts.map((fact) => [fact.statement, fact]));
    // Расходится: цитата, адрес, замена, не отмечено.
    expect(byStatement['Эксперимент охватил 25 тысяч человек']).toMatchObject({
      kind: 'own', status: 'conflicting', selected: false, sourceUrl: AUTONOMY,
      correction: { original: '25 тысяч', replacement: 'около 2 500' },
    });
    // Поправка: те же слова с заменой, подтверждена цитатой, отмечена.
    expect(byStatement['Эксперимент охватил около 2 500 человек']).toMatchObject({
      kind: 'own', status: 'confirmed', verified: true, selected: true, sourceUrl: AUTONOMY,
      quote: 'The trials involved 2,500 workers, over 1% of Iceland’s working population',
    });
    expect(byStatement['Длился четыре года']).toMatchObject({ status: 'confirmed', selected: true });
    // Проверить нечем: своё слово остаётся, с заметкой.
    expect(byStatement['Производительность выросла на 40%']).toMatchObject({
      kind: 'own', status: 'unverified', note: 'Числа в источниках нет.',
    });
    // Найденное — утверждение своими словами с цитатой, подтверждено, отмечено.
    expect(byStatement['Производительность в большинстве мест сохранилась или выросла']).toMatchObject({
      kind: 'found', status: 'confirmed', verified: true, selected: true, sourceUrl: CONVERSATION,
      quote: 'Productivity remained the same or improved in the majority of workplaces',
    });
    // Ни одной строки-обрезка страницы и ни одного адреса главной страницы.
    expect(ready.facts.some((fact) => fact.sourceUrl === 'https://www.bbc.com/')).toBe(false);
    expect(ready.facts.every((fact) => typeof fact.factKey === 'string' && fact.factKey.length > 0)).toBe(true);

    expect(ready.corrections).toEqual([
      expect.objectContaining({ original: '25 тысяч', replacement: 'около 2 500', accepted: true, sourceUrl: AUTONOMY }),
      expect.objectContaining({ original: 'десять лет', replacement: 'четыре года', accepted: true }),
    ]);
    expect(ready.summary).toEqual({ confirmed: 0, conflicting: 2, unverified: 1, found: 1, sources: 4, encyclopedic: 1 });
    // Источников принято столько, сколько нашлось с выдержкой, а не восемь.
    expect(calls.accept).toHaveLength(3);
  });

  test('второй проход по снимку: без поиска и без сжатия, суть из слов с поправками', async () => {
    const snapshots = fakeSnapshotStore();
    const first = build({ models: [briefAnswer(), digestAnswer], research: [researchAnswer()], snapshots });
    const plan = await first.service.prepare('org-a', request());
    const [pause] = named(await drain(first.service, plan), 'research-selection-required');
    const keysOf = (predicate) => pause.facts.filter(predicate).map((fact) => fact.factKey);

    // Человек принял поправки и найденное как есть: ключи всех отмеченных строк.
    const second = build({ models: [{ text: 'Суть.' }], snapshots });
    const resumed = await second.service.prepare('org-a', request({
      researchSelections: keysOf((fact) => fact.selected === true),
      snapshotKey: pause.snapshotKey,
    }));
    const events = await drain(second.service, resumed);

    expect(second.calls.research).toEqual([]);
    expect(modelCalls.map((call) => call.role)).toEqual(['draft']);
    expect(named(events, 'piece')).toHaveLength(1);
    const [, stored] = second.calls.recordCore[0];
    // Слова человека в сути — с принятыми поправками, старых чисел в промпте нет.
    const draftPrompt = modelCalls[0].prompt;
    expect(draftPrompt).toContain('около 2 500 человек');
    expect(draftPrompt).toContain('четыре года');
    expect(draftPrompt).not.toContain('25 тысяч');
    expect(stored.brief.brief.facts.some((fact) => fact.statement === 'Эксперимент охватил около 2 500 человек' && fact.selected === true)).toBe(true);
  });

  test('«Оставить мои числа»: своё расходящееся выбрано ключом, поправка снята, мысль не тронута', async () => {
    const snapshots = fakeSnapshotStore();
    const first = build({ models: [briefAnswer(), digestAnswer], research: [researchAnswer()], snapshots });
    const plan = await first.service.prepare('org-a', request());
    const [pause] = named(await drain(first.service, plan), 'research-selection-required');
    const own = pause.facts.filter((fact) => fact.status === 'conflicting').map((fact) => fact.factKey);
    const found = pause.facts.filter((fact) => fact.kind === 'found').map((fact) => fact.factKey);

    const second = build({ models: [{ text: 'Суть.' }], snapshots });
    const resumed = await second.service.prepare('org-a', request({
      researchSelections: [...own, ...found],
      snapshotKey: pause.snapshotKey,
    }));
    const events = await drain(second.service, resumed);
    const [ready] = named(events, 'research-ready');
    expect(ready.corrections.every((correction) => correction.accepted === false)).toBe(true);
    expect(modelCalls[0].prompt).toContain('25 тысяч');
    expect(modelCalls[0].prompt).not.toContain('около 2 500');
  });

  test('старая вкладка шлёт текст строк и без снимка: повтор со сверкой по тексту', async () => {
    const first = build({ models: [briefAnswer(), digestAnswer], research: [researchAnswer()] });
    const plan = await first.service.prepare('org-a', request());
    const [pause] = named(await drain(first.service, plan), 'research-selection-required');
    expect(pause.snapshotKey).toBeNull();

    const statements = pause.facts.filter((fact) => fact.kind === 'found').map((fact) => fact.statement);
    const second = build({ models: [briefAnswer(), digestAnswer, { text: 'Суть.' }], research: [researchAnswer()] });
    const resumed = await second.service.prepare('org-a', request({ researchSelections: statements }));
    const events = await drain(second.service, resumed);

    expect(second.calls.research).toHaveLength(1);
    const [ready] = named(events, 'research-ready');
    expect(ready.facts.filter((fact) => fact.kind === 'found').every((fact) => fact.selected === true)).toBe(true);
    // Пара «своё ↔ поправка» без названного ключа остаётся на умолчании: поправка принята.
    expect(ready.corrections.every((correction) => correction.accepted === true)).toBe(true);
    expect(named(events, 'piece')).toHaveLength(1);
  });

  /*
    `content-factory-next-97dq.14`, P3. Вкладка, открытая до этой волны, помнит
    строку вместе с припиской «Автор утверждает, что…»: тогда её печатали так.
    С волны `97dq.1` приписка снимается, и сверка сырых строк на честном повторе
    (снимка нет) не находила ничего — выбор человека «Оставить мои числа» молча
    возвращался к умолчанию, то есть к принятой поправке. Числа в сути при этом
    заменялись на те, которых он не выбирал.
  */
  test('старая вкладка шлёт строку с припиской: галочка человека не сбрасывается', async () => {
    const first = build({ models: [briefAnswer(), digestAnswer], research: [researchAnswer()] });
    const plan = await first.service.prepare('org-a', request());
    const [pause] = named(await drain(first.service, plan), 'research-selection-required');
    expect(pause.snapshotKey).toBeNull();
    // Так эту же строку печатал выпуск до волны — с рамкой пересказа впереди.
    const own = pause.facts.find((fact) => fact.status === 'conflicting' && fact.correction?.original === '25 тысяч');
    expect(own.statement).toBe('Эксперимент охватил 25 тысяч человек');
    const asOldTabRemembers = `Автор утверждает, что ${own.statement[0].toLowerCase()}${own.statement.slice(1)}`;

    const second = build({ models: [briefAnswer(), digestAnswer, { text: 'Суть.' }], research: [researchAnswer()] });
    const resumed = await second.service.prepare('org-a', request({
      researchSelections: [asOldTabRemembers],
    }));
    const events = await drain(second.service, resumed);
    const [ready] = named(events, 'research-ready');

    const byStatement = Object.fromEntries(ready.facts.map((fact) => [fact.statement, fact]));
    expect(byStatement['Эксперимент охватил 25 тысяч человек'].selected).toBe(true);
    expect(byStatement['Эксперимент охватил около 2 500 человек'].selected).toBe(false);
    expect(ready.corrections.find((correction) => correction.original === '25 тысяч').accepted).toBe(false);
    // Не названная пара осталась на умолчании: там поправка по-прежнему принята.
    expect(ready.corrections.find((correction) => correction.original === 'десять лет').accepted).toBe(true);
    // И суть написана числом человека, а не заменой.
    expect(modelCalls[modelCalls.length - 1].prompt).toContain('25 тысяч');
    expect(modelCalls[modelCalls.length - 1].prompt).not.toContain('около 2 500');
  });

  /*
    Восьмой заход, `B1 8cc5a492` (`97dq.1`). Разбор до этой волны отдавал одно
    утверждение с тремя числами, источник опроверг одно из них, и строка с
    принятой поправкой уехала в суть как «подтверждено» — вместе с охватом и
    ростом, которых источник не подтверждал. С волны `97dq.1` утверждения
    атомарны, но старая строка с тремя числами обязана обрабатываться честно.
  */
  describe('поправка на старом утверждении с тремя числами', () => {
    /*
      Строка, которую детерминированный разбор `own-facts` не разложил: ни
      запятой, ни союза — одно предложение с тремя числами. Разложимую он
      теперь делит сам (`97dq.1`, набор `content-intake.own-facts`), и честность
      поправки остаётся последней защитой ровно для таких неразложимых строк.
    */
    const THREE_NUMBERS =
      'Исландский эксперимент охватил 25 тысяч человек за десять лет при росте производительности на 40%';
    const legacyBrief = () => ({
      ...briefAnswer(),
      facts: [{ statement: THREE_NUMBERS, factId: null, evidenceId: null }],
    });
    const legacyDigest = (prompt) => {
      const keys = new Map(claimKeysFrom(prompt));
      const evidence = [...prompt.matchAll(/\[E:([^\]]+)\] [^\n]*— (\S+)/g)].reduce(
        (map, match) => map.set(match[2], match[1]),
        new Map()
      );
      return {
        verdicts: [
          {
            claimKey: keys.get(THREE_NUMBERS),
            verdict: 'conflicting',
            evidenceId: evidence.get(AUTONOMY),
            quote: 'Two large-scale trials ran between 2015 and 2019',
            original: 'за десять лет',
            replacement: 'за 2015–2019 годы',
            note: 'Источник говорит о двух испытаниях 2015–2019 годов и не подтверждает охват 25 тысяч человек или рост на 40%.',
          },
        ],
        findings: [],
      };
    };

    test('поправленная строка не подтверждена целиком, а её числа остаются без опоры', async () => {
      const { service } = build({
        models: [legacyBrief(), legacyDigest],
        research: [researchAnswer()],
      });
      const plan = await service.prepare('org-a', request());
      const events = await drain(service, plan);
      const [ready] = named(events, 'research-ready');
      const corrected = ready.facts.find(
        (fact) => fact.statement.includes('за 2015–2019 годы')
      );

      // Замена приложена, заметка на месте, строка по-прежнему отмечена —
      // и при этом честно «не проверено»: два числа никто не подтверждал.
      expect(corrected).toMatchObject({
        status: 'unverified',
        verified: false,
        selected: true,
        sourceUrl: AUTONOMY,
        correction: { original: 'за десять лет', replacement: 'за 2015–2019 годы' },
      });
      expect(corrected.statement).toContain('25 тысяч');
      expect(corrected.statement).toContain('40%');

      // Поправка сама по себе остаётся принятой: свой отрезок она подтверждает.
      expect(ready.corrections).toEqual([
        expect.objectContaining({
          original: 'за десять лет',
          replacement: 'за 2015–2019 годы',
          accepted: true,
        }),
      ]);

      // Квитанция говорит это словами уже на паузе: строка без опоры видна.
      const [filled] = named(events, 'brief-filled');
      expect(filled.brief.ungrounded).toContain(corrected.statement);
      // Исходная строка не выбрана и в «без опоры» не дублируется.
      expect(filled.brief.ungrounded).not.toContain(THREE_NUMBERS);
    });

    test('атомарное утверждение с одним числом поправка подтверждает целиком', async () => {
      const single = 'Эксперимент охватил 25 тысяч человек';
      const { service } = build({
        models: [
          { ...briefAnswer(), facts: [{ statement: single, factId: null, evidenceId: null }] },
          (prompt) => {
            const keys = new Map(claimKeysFrom(prompt));
            const evidence = [...prompt.matchAll(/\[E:([^\]]+)\] [^\n]*— (\S+)/g)].reduce(
              (map, match) => map.set(match[2], match[1]),
              new Map()
            );
            return {
              verdicts: [
                {
                  claimKey: keys.get(single),
                  verdict: 'conflicting',
                  evidenceId: evidence.get(AUTONOMY),
                  quote: 'The trials involved 2,500 workers, over 1% of Iceland’s working population',
                  original: '25 тысяч',
                  replacement: 'около 2 500',
                  note: 'Доклад организаторов называет 2 500 участников.',
                },
              ],
              findings: [],
            };
          },
        ],
        research: [researchAnswer()],
      });
      const plan = await service.prepare('org-a', request());
      const events = await drain(service, plan);
      const [ready] = named(events, 'research-ready');

      expect(
        ready.facts.find((fact) => fact.statement === 'Эксперимент охватил около 2 500 человек')
      ).toMatchObject({ status: 'confirmed', verified: true, selected: true });
    });
  });

  test('отказ сжатия оставляет строки, как до 13.09: выдержки, «не проверено», не отмечено', async () => {
    const { service } = build({
      models: [briefAnswer(), () => { throw new Error('model down'); }],
      research: [researchAnswer()],
    });
    const plan = await service.prepare('org-a', request());
    const events = await drain(service, plan);
    const [ready] = named(events, 'research-ready');
    const found = ready.facts.filter((fact) => fact.kind === 'found');
    expect(found).toHaveLength(3);
    expect(found.every((fact) => fact.status === 'unverified' && fact.selected === false)).toBe(true);
    expect(ready.corrections).toEqual([]);
    expect(ready.summary).toMatchObject({ found: 3, conflicting: 0 });
    expect(named(events, 'research-selection-required')).toHaveLength(1);
  });
});
