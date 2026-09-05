'use strict';

/**
 * `content-factory-next-fn33.28.6`: одна квота — одно число.
 *
 * Рецензия волны 04.09 нашла два предиката там, где смысл один. Дверь
 * участника (`GET /settings/ai/allowance`) считала строки предикатом допуска —
 * тем же, что решает, пропустить ли следующее нажатие. Экран настроек у
 * администратора считал ВСЕ строки периода, включая брошенные сутки назад
 * `admitted`, которые сам допуск уже не берёт в счёт.
 *
 * Два экрана одного пространства показывали разное «осталось», и объяснить
 * разницу человеку было нечем: слов «число следующего нажатия» и «число книги
 * учёта» в интерфейсе нет, они были только в комментариях кода.
 *
 * Здесь проверяется не арифметика, а то, что предикат ровно один: оба чтения
 * приходят в базу с одним и тем же `where`, и остаток у них сходится.
 */

const { AsyncLocalStorage } = require('node:async_hooks');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const active = new AsyncLocalStorage();

const ORGANIZATION = 'organization-a';
const SUBSCRIPTION = {
  includedAiMonthlyOperations: 10,
  createdAt: new Date('2026-01-04T09:00:00.000Z'),
};
const ORGANIZATION_ROW = { createdAt: new Date('2026-01-04T09:00:00.000Z') };

/** Одна и та же подменённая база для обоих чтений: расхождение будет только в `where`. */
const makePrisma = (counted) => {
  const wheres = [];
  return {
    wheres,
    client: {
      subscription: { findUnique: async () => SUBSCRIPTION },
      organization: { findUnique: async () => ORGANIZATION_ROW },
      aiUsageRecord: {
        count: async (query) => {
          wheres.push(query.where);
          return counted;
        },
        groupBy: async () => [],
      },
      user: { findMany: async () => [] },
      aiProviderSetting: { findUnique: async () => null },
    },
  };
};

const AI_CONFIG = {
  usageMode: 'included',
  provider: 'openai',
  textModel: 'gpt-x',
  imageModel: 'img-x',
  apiKey: 'k',
  workspaceKeyConfigured: false,
  workspaceSearchKeyConfigured: false,
  includedAvailable: true,
  search: {
    enabled: false,
    provider: 'tavily',
    apiKey: '',
    topic: 'general',
    depth: 'advanced',
  },
};

const providerConfigMock = {
  AiProviderNotConfigured: class extends Error {},
  loadAiConfig: async () => AI_CONFIG,
  resetAiConfigCache: () => undefined,
  getActiveAiConfig: (organizationId) =>
    active.getStore()?.organizationId === organizationId
      ? active.getStore().config
      : undefined,
  getActiveAiOrganizationId: () => active.getStore()?.organizationId,
  withActiveAiConfig: (organizationId, config, callback) =>
    active.run({ organizationId, config }, callback),
  setAiProviderSettingReader: () => undefined,
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
};

const usageModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
  {
    '@prisma/client': {
      Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config':
      providerConfigMock,
    '@contentfactory/nestjs-libraries/user/acting.user': {
      getActingUserId: () => undefined,
    },
  }
);

/**
 * Экран администратора получает НАСТОЯЩИЙ `includedUsageFilter` из модуля
 * учёта. Если он снова начнёт собирать свой `where` руками, подставленная
 * функция просто останется незваной и `where` разойдутся — что проверка ниже и
 * поймает.
 */
const providerModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/ai.provider.service.ts',
  {
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { fixedEncryption: (v) => v, fixedDecryption: (v) => v },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config':
      providerConfigMock,
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      aiBillingPeriodStart: usageModule.aiBillingPeriodStart,
      includedUsageFilter: usageModule.includedUsageFilter,
    },
  }
);

/**
 * Предикат несёт окно активного допуска — `Date.now()` минус сутки, — поэтому
 * два чтения, разошедшиеся на миллисекунду, дали бы две разные даты и
 * сравнение развалилось бы не по делу. Часы остановлены на всё время набора.
 */
beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
  jest.setSystemTime(new Date('2026-09-04T12:00:00.000Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

describe('the member line and the administrator screen count one allowance', () => {
  test('both readings reach the ledger with the same predicate', async () => {
    const memberSide = makePrisma(4);
    const adminSide = makePrisma(4);

    await new usageModule.AiUsageService(memberSide.client).readAllowance(
      ORGANIZATION
    );
    await new providerModule.AiProviderService(adminSide.client).getSettings(
      ORGANIZATION
    );

    expect(memberSide.wheres).toHaveLength(1);
    expect(adminSide.wheres).toHaveLength(1);
    expect(adminSide.wheres[0]).toEqual(memberSide.wheres[0]);
  });

  test('the predicate is the admission one, so a stale admission is dropped by both', async () => {
    const adminSide = makePrisma(4);
    await new providerModule.AiProviderService(adminSide.client).getSettings(
      ORGANIZATION
    );

    // Именно эта ветка `OR` и была разницей: экран администратора её не имел и
    // потому считал брошенные сутки назад `admitted` наравне с настоящими.
    const [staleStatus, activeWindow] = adminSide.wheres[0].OR;
    expect(staleStatus).toEqual({ status: { not: 'admitted' } });
    // Не `expect.any(Date)`: под фейковыми таймерами Jest `Date` в тесте — это
    // `ClockDate`, а под сдвинутым календарём (`test:time-travel`) — ещё один
    // класс поверх него. Модуль под тестом строит момент своим `Date`, и
    // сравнение классов расходится там, где само значение верно. Проверяем
    // форму: это дата, и она не «Invalid Date».
    expect(Object.prototype.toString.call(activeWindow.createdAt.gte)).toBe(
      '[object Date]'
    );
    expect(Number.isNaN(activeWindow.createdAt.gte.getTime())).toBe(false);
  });

  test('and therefore the two screens print the same remainder', async () => {
    const memberSide = makePrisma(4);
    const adminSide = makePrisma(4);

    const allowance = await new usageModule.AiUsageService(
      memberSide.client
    ).readAllowance(ORGANIZATION);
    const settings = await new providerModule.AiProviderService(
      adminSide.client
    ).getSettings(ORGANIZATION);

    expect(settings.includedUsedOperations).toBe(allowance.used);
    expect(settings.includedRemainingOperations).toBe(allowance.remaining);
    expect(settings.includedMonthlyOperations).toBe(allowance.limit);
  });

  test('the predicate is exported once and shared, not copied', () => {
    expect(typeof usageModule.includedUsageFilter).toBe('function');

    const source = require('node:fs').readFileSync(
      require('node:path').resolve(
        __dirname,
        '../libraries/nestjs-libraries/src/openai/ai.provider.service.ts'
      ),
      'utf8'
    );
    expect(source).toMatch(/includedUsageFilter\(organizationId, periodStart\)/);
    // Собранный руками `where` со всеми тремя полями — ровно та копия, которую
    // рецензия и нашла; вернуться она может только молча.
    expect(source).not.toMatch(/usageMode:\s*'included'/);
  });
});
