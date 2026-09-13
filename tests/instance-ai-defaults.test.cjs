'use strict';

/**
 * `content-factory-next-75xn.16`: кто задаёт ключи по умолчанию.
 *
 * Правило владельца 13.09.2026: «настройка ключей по умолчанию доступна только
 * суперадминам, а для других можно выбрать использовать ключ по умолчанию или
 * использовать свой ключ». Вторая половина уже стояла на экране области;
 * первой не было вовсе — ключ, которым платит весь инстанс, жил только в
 * переменных окружения, и сменить его можно было лишь с доступом к серверу.
 *
 * Здесь держатся четыре обещания:
 *
 *  - ключ наружу не уезжает никогда, ни в одном ответе;
 *  - строка операторских настроек перекрывает окружение полем за полем, а не
 *    целиком — инстанс поднимают переменными, а потом кто-то меняет на экране
 *    одну модель, и ключ при этом не должен исчезнуть;
 *  - нечитаемая строка оставляет инстанс на переменных, а не роняет всех;
 *  - ни одна дверь `/admin` не остаётся без проверки суперадмина.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const CONFIG = 'libraries/nestjs-libraries/src/openai/ai.provider.config.ts';
const SERVICE = 'libraries/nestjs-libraries/src/openai/instance-ai-defaults.service.ts';

const loadConfig = (stored, instance) => {
  const config = loadTypeScriptModule(CONFIG, {
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        fixedDecryption: (value) => {
          if (value === 'broken') throw new Error('cannot decrypt');
          return `plain:${value}`;
        },
        fixedEncryption: (value) => `enc:${value}`,
      },
    },
  });
  config.setAiProviderSettingReader(async () => stored);
  config.setInstanceAiDefaultsReader(async () =>
    typeof instance === 'function' ? instance() : instance
  );
  return config;
};

const includedRow = {
  usageMode: 'included',
  searchEnabled: true,
  searchProvider: 'tavily',
  searchTopic: 'general',
  searchDepth: 'advanced',
};

/**
 * Число включённых операций экран показывает действующим, и считает его та же
 * функция, по которой инстанс выставляет счёт. Поэтому здесь она настоящая, а
 * не двойник: двойник разошёлся бы с биллингом молча.
 */
const loadUsage = () =>
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
    {
      '@prisma/client': { Prisma: {} },
      '@nestjs/common': {
        HttpException: class HttpException {
          constructor(response) {
            this.response = response;
          }
        },
        HttpStatus: { TOO_MANY_REQUESTS: 429, SERVICE_UNAVAILABLE: 503 },
        Injectable: () => (target) => target,
      },
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaService: class PrismaService {},
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        setAiProviderSettingReader: () => undefined,
        setInstanceAiDefaultsReader: () => undefined,
        INSTANCE_AI_DEFAULTS_ID: 'instance',
      },
      '@contentfactory/nestjs-libraries/openai/ai.roles': {
        modelFor: () => 'model',
        roleForOperation: () => 'draft',
      },
      '@contentfactory/nestjs-libraries/user/acting.user': {
        getActingUserId: () => null,
      },
    }
  );

const loadService = (rows) => {
  const state = { row: rows.row ?? null, written: [] };
  const prisma = {
    instanceAiDefaults: {
      findUnique: async () => state.row,
      upsert: async ({ create, update }) => {
        state.written.push({ create, update });
        state.row = { ...(state.row || {}), ...update };
        return state.row;
      },
      updateMany: async ({ data }) => {
        state.written.push({ update: data });
        state.row = { ...(state.row || {}), ...data };
        return { count: 1 };
      },
    },
  };
  const { InstanceAiDefaultsService } = loadTypeScriptModule(SERVICE, {
    '@nestjs/common': { Injectable: () => (target) => target },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: {
        fixedEncryption: (value) => `enc:${value}`,
        fixedDecryption: (value) => `plain:${value}`,
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class PrismaService {},
    },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      INSTANCE_AI_DEFAULTS_ID: 'instance',
      resetAiConfigCache: () => undefined,
    },
    '@contentfactory/nestjs-libraries/openai/ai.roles': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/openai/ai.roles.ts'
    ),
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': loadUsage(),
  });
  return { service: new InstanceAiDefaultsService(prisma), state };
};

const withEnvironment = async (values, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe('the operator row stands in front of the environment', () => {
  test('a stored key is what an included workspace spends', async () => {
    await withEnvironment({ AI_INCLUDED_API_KEY: 'from-server' }, async () => {
      const { loadAiConfig } = loadConfig(includedRow, {
        apiKey: 'typed-on-the-screen',
      });

      const config = await loadAiConfig('organization-a');

      expect(config.apiKey).toBe('plain:typed-on-the-screen');
      expect(config.includedAvailable).toBe(true);
    });
  });

  test('an empty column reads as «ask the operator», field by field', async () => {
    await withEnvironment(
      {
        AI_INCLUDED_API_KEY: 'from-server',
        AI_PROVIDER: 'openrouter',
        AI_TEXT_MODEL: 'server/text',
        AI_IMAGE_MODEL: 'server/image',
      },
      async () => {
        // Кто-то открыл экран суперадмина и поменял одну модель. Ключ при этом
        // не трогали — и он не должен исчезнуть.
        const { loadAiConfig } = loadConfig(includedRow, {
          textModel: 'screen/text',
        });

        const config = await loadAiConfig('organization-a');

        expect(config.textModel).toBe('screen/text');
        expect(config.imageModel).toBe('server/image');
        expect(config.provider).toBe('openrouter');
        expect(config.apiKey).toBe('from-server');
      }
    );
  });

  test('a stored search key stands in front of its variable, engine by engine', async () => {
    await withEnvironment(
      {
        AI_INCLUDED_API_KEY: 'from-server',
        AI_INCLUDED_SEARCH_API_KEY_TAVILY: 'server-tavily',
        AI_INCLUDED_SEARCH_API_KEY_EXA: 'server-exa',
      },
      async () => {
        const { loadAiConfig } = loadConfig(includedRow, {
          searchApiKeys: { exa: 'screen-exa' },
        });

        const config = await loadAiConfig('organization-a');

        expect(config.search.apiKeys).toEqual({
          tavily: 'server-tavily',
          exa: 'plain:screen-exa',
        });
      }
    );
  });

  test('an unreadable row leaves the instance on its variables', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    await withEnvironment({ AI_INCLUDED_API_KEY: 'from-server' }, async () => {
      const { loadAiConfig } = loadConfig(includedRow, { apiKey: 'broken' });

      const config = await loadAiConfig('organization-a');

      // Одна нечитаемая строка не должна закрыть включённый режим всем.
      expect(config.apiKey).toBe('from-server');
    });
    consoleError.mockRestore();
  });

  test('a reader that throws does not take a workspace on its own key down', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { loadAiConfig } = loadConfig(
      {
        usageMode: 'workspace_key',
        apiKey: 'own-key',
        searchEnabled: false,
        searchProvider: 'tavily',
      },
      () => {
        throw new Error('operator table unavailable');
      }
    );

    const config = await loadAiConfig('organization-a');

    expect(config.apiKey).toBe('plain:own-key');
    consoleError.mockRestore();
  });
});

describe('the superadmin screen never sees a key', () => {
  test('reading returns presence and where it came from, never a value', async () => {
    await withEnvironment(
      {
        AI_INCLUDED_API_KEY: 'from-server',
        AI_INCLUDED_SEARCH_API_KEY_TAVILY: 'server-tavily',
        AI_INCLUDED_SEARCH_API_KEY_EXA: undefined,
        AI_INCLUDED_SEARCH_API_KEY: undefined,
      },
      async () => {
        const { service } = loadService({
          row: {
            apiKey: 'enc:secret-model-key',
            searchApiKeys: { exa: 'enc:secret-exa-key' },
            textModel: 'openai/some-model',
            monthlyOperations: 50,
          },
        });

        const view = await service.read();

        expect(view.hasKey).toBe(true);
        expect(view.searchKeys).toMatchObject({ exa: true, tavily: false });
        expect(view.monthlyOperations).toBe(50);
        // «Задано на сервере» — третье состояние. Без него суперадмин видит
        // пустое поле на работающем инстансе и вставляет второй ключ.
        expect(view.fromEnvironment.apiKey).toBe(true);
        expect(view.fromEnvironment.searchKeys.tavily).toBe(true);
        expect(JSON.stringify(view)).not.toContain('secret-model-key');
        expect(JSON.stringify(view)).not.toContain('secret-exa-key');
      }
    );
  });

  /**
   * `content-factory-next-75xn.25`, `.27`. Записи владельца 13.09.2026: «у нас
   * вроде должен быть OpenRouter, но почему-то по умолчанию выбран OpenAI» и
   * «почему бы там не показывать текущее по умолчанию установленное число?».
   * Экран не мог показать ни того, ни другого: ответ говорил только, задано ли
   * значение переменной окружения, но не какое оно. Форма подставляла своё
   * начальное `openai` — провайдера, которым инстанс ни разу не работал.
   */
  test('reading says what the instance actually runs on, field by field', async () => {
    await withEnvironment(
      {
        AI_PROVIDER: 'openrouter',
        AI_TEXT_MODEL: 'openai/gpt-5.6-luna',
        AI_IMAGE_MODEL: undefined,
        AI_INCLUDED_MONTHLY_OPERATIONS: '50',
      },
      async () => {
        const { service } = loadService({ row: null });

        const view = await service.read();

        // Строка пуста, и это та самая ловушка: «не задано здесь» — не «не
        // задано». Действующее значение приходит рядом, отдельным полем.
        expect(view.provider).toBeNull();
        expect(view.monthlyOperations).toBeNull();
        expect(view.effective).toEqual({
          provider: 'openrouter',
          textModel: 'openai/gpt-5.6-luna',
          imageModel: null,
          monthlyOperations: 50,
        });
      }
    );
  });

  test('what is set on this screen is what the screen shows', async () => {
    await withEnvironment(
      {
        AI_PROVIDER: 'openrouter',
        AI_TEXT_MODEL: 'openai/gpt-5.6-luna',
        AI_INCLUDED_MONTHLY_OPERATIONS: '50',
      },
      async () => {
        const { service } = loadService({
          row: {
            provider: 'openai',
            textModel: 'gpt-4.1',
            monthlyOperations: 0,
          },
        });

        const view = await service.read();

        // Модель из переменной окружения принадлежит её провайдеру: на
        // OpenAI-строке `openai/gpt-5.6-luna` не предлагается, потому что
        // сервер её в этом случае тоже не читает.
        expect(view.effective).toEqual({
          provider: 'openai',
          textModel: 'gpt-4.1',
          imageModel: null,
          monthlyOperations: 0,
        });
      }
    );
  });

  test('nothing anywhere reads as nothing, not as a number nobody typed', async () => {
    await withEnvironment(
      {
        AI_PROVIDER: undefined,
        AI_TEXT_MODEL: undefined,
        AI_IMAGE_MODEL: undefined,
        AI_INCLUDED_MONTHLY_OPERATIONS: undefined,
      },
      async () => {
        const { service } = loadService({ row: null });

        const view = await service.read();

        expect(view.effective).toEqual({
          provider: 'openai',
          textModel: null,
          imageModel: null,
          monthlyOperations: null,
        });
      }
    );
  });

  test('saving merges rather than replaces, so a key survives an unrelated edit', async () => {
    const { service, state } = loadService({
      row: { searchApiKeys: { tavily: 'enc:kept-tavily' }, apiKey: 'enc:kept' },
    });

    await service.update('user-1', { monthlyOperations: 120 });

    const [{ update }] = state.written;
    expect(update).toMatchObject({
      monthlyOperations: 120,
      updatedByUserId: 'user-1',
    });
    expect(update).not.toHaveProperty('apiKey');
    expect(update).not.toHaveProperty('searchApiKeys');
  });

  test('a typed key is encrypted and filed under the engine it was typed for', async () => {
    const { service, state } = loadService({
      row: { searchApiKeys: { tavily: 'enc:kept-tavily' } },
    });

    await service.update('user-1', { searchApiKeys: { exa: 'new-exa' } });

    const [{ update }] = state.written;
    expect(update.searchApiKeys).toEqual({
      tavily: 'enc:kept-tavily',
      exa: 'enc:new-exa',
    });
  });

  test('an empty key field leaves the stored one alone', async () => {
    const { service, state } = loadService({ row: { apiKey: 'enc:kept' } });

    await service.update('user-1', { apiKey: '', textModel: 'x/y' });

    const [{ update }] = state.written;
    expect(update).not.toHaveProperty('apiKey');
    expect(update.textModel).toBe('x/y');
  });

  test('removing one engine key leaves the others', async () => {
    const { service, state } = loadService({
      row: { searchApiKeys: { tavily: 'enc:t', exa: 'enc:e' } },
    });

    await service.clearSearchKey('user-1', 'exa');

    const [{ update }] = state.written;
    expect(update.searchApiKeys).toEqual({ tavily: 'enc:t' });
  });

  test('zero is an obeyable answer, not «ask somebody else»', () => {
    const usage = loadUsage();

    process.env.AI_INCLUDED_MONTHLY_OPERATIONS = '50';
    try {
      // Подписка сильнее всех. Потом строка суперадмина, где ноль — это отказ,
      // набранный нарочно. Потом переменная окружения.
      expect(
        usage.includedMonthlyOperations({ includedAiMonthlyOperations: 7 }, {
          monthlyOperations: 0,
        })
      ).toBe(7);
      expect(usage.includedMonthlyOperations(null, { monthlyOperations: 0 })).toBe(0);
      expect(usage.includedMonthlyOperations(null, { monthlyOperations: 120 })).toBe(120);
      expect(usage.includedMonthlyOperations(null, null)).toBe(50);
    } finally {
      delete process.env.AI_INCLUDED_MONTHLY_OPERATIONS;
    }
  });
});

/**
 * `/admin` защищён не гардом, а вызовом `assertSuperAdmin` в каждом хендлере.
 * Такой порядок держится только тем, что кто-то его помнит, — поэтому здесь он
 * записан: новая дверь без проверки роняет этот набор, а не уезжает на боевой.
 */
test('every admin door asserts the superadmin', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/backend/src/api/routes/admin.controller.ts'),
    'utf8'
  );

  const handlers = [
    ...source.matchAll(
      /@(?:Get|Post|Put|Patch|Delete)\([^)]*\)\s*(?:@[\w.]+\([^)]*\)\s*)*async\s+(\w+)\s*\(([\s\S]*?)\n  \}/g
    ),
  ];

  expect(handlers.length).toBeGreaterThanOrEqual(17);
  const unguarded = handlers
    .filter(([body]) => !body.includes('this.assertSuperAdmin(user)'))
    .map(([, name]) => name);

  expect(unguarded).toEqual([]);
});

test('every admin mutation proves the request came from our own screen', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/backend/src/api/routes/admin.controller.ts'),
    'utf8'
  );

  const mutations = [
    ...source.matchAll(
      /@(?:Post|Put|Patch|Delete)\([^)]*\)\s*(?:@[\w.]+\([^)]*\)\s*)*async\s+(\w+)\s*\(([\s\S]*?)\n  \}/g
    ),
  ];

  expect(mutations.length).toBeGreaterThanOrEqual(8);
  const unchecked = mutations
    .filter(([body]) => !/this\.assert\w*Request\(user\.id, req\)/.test(body))
    .map(([, name]) => name);

  /**
   * Список был `['connectTelegram']` один день: дверь предшествовала стражу и
   * получила проверку источника волной 13.09 (`content-factory-next-75xn.17`).
   * Теперь он пуст, и новая дверь без проверки роняет набор.
   */
  expect(unchecked).toEqual([]);
});
