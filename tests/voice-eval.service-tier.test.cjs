'use strict';

/**
 * За какую ёмкость платит прогон.
 *
 * Flex — та же модель из свободной ёмкости за половину цены, и стенд ровно то
 * место, ради которого этот тариф существует: ответа никто не ждёт, а счёт
 * растёт с числом вопросов, которые задаёт эпик. Замер на ключе пространства
 * 27.08.2026: те же 14/6 токенов, $0.00000495 против $0.0000099.
 *
 * Проверяется здесь не цена, а три вещи, ошибка в каждой из которых стоит
 * денег и молчит.
 *
 * 1. `service_tier` уходит в тело запроса. У LangChain нет своего поля под
 *    него, он едет через `modelKwargs`; опечатка в имени не вызовет отказа —
 *    OpenRouter просто выставит счёт по полному тарифу.
 * 2. Тариф по умолчанию не сдвинулся. Все прогоны до 27.08.2026 сняты на
 *    `default`, и если флаг незаметно станет включённым по умолчанию, прежние
 *    числа окажутся несравнимы с новыми, а понять это будет не по чему.
 * 3. Незнакомое имя тарифа отвергается до первого вызова. `--tier flexx`
 *    иначе уехал бы в тело запроса, был бы отвергнут или проигнорирован
 *    провайдером — и прогон либо упал бы на середине, либо тихо стоил вдвое.
 */

const path = require('node:path');

const constructed = [];

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(options) {
      constructed.push(options);
    }
  },
}));

// Ключ в базе лежит зашифрованным, и расшифровка тянет за собой TypeScript и
// `JWT_SECRET`. Ни то ни другое к тарифу отношения не имеет.
jest.mock('../tests/helpers/load-tsx.cjs', () => ({
  loadTypeScriptModule: () => ({
    decrypt_legacy_using_IV: (hex) => `расшифровано:${hex}`,
  }),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'тест';

const { buildChatModel } = require('../scripts/evidence/voice-eval/model.cjs');

const SETTING = {
  usageMode: 'workspace_key',
  provider: 'openrouter',
  apiKey: 'зашифрованный-ключ',
  textModel: 'openai/gpt-5.6-luna',
};

beforeEach(() => {
  constructed.length = 0;
});

describe('тариф обслуживания', () => {
  it('кладёт service_tier в тело запроса', () => {
    const built = buildChatModel(SETTING, 0.7, { serviceTier: 'flex' });

    expect(constructed).toHaveLength(1);
    expect(constructed[0].modelKwargs).toEqual({ service_tier: 'flex' });
    expect(built.serviceTier).toBe('flex');
  });

  it('даёт flex время, которого просит провайдер', () => {
    buildChatModel(SETTING, 0.7, { serviceTier: 'flex' });

    // Минута — потолок продукта; flex отвечает медленнее по устройству, и
    // прогон, обрывающийся по своему же таймауту, платит за оборванное.
    expect(constructed[0].timeout).toBeGreaterThanOrEqual(15 * 60_000);
    expect(constructed[0].maxRetries).toBeGreaterThan(2);
  });

  it('по умолчанию тариф прежний и в теле запроса ничего лишнего', () => {
    const built = buildChatModel(SETTING);

    expect(constructed[0].modelKwargs).toBeUndefined();
    expect(constructed[0].timeout).toBe(60_000);
    expect(constructed[0].maxRetries).toBe(2);
    expect(built.serviceTier).toBeNull();
  });

  it('отвергает незнакомый тариф до первого вызова', () => {
    expect(() => buildChatModel(SETTING, 0.7, { serviceTier: 'flexx' })).toThrow(
      /unknown service tier "flexx"/
    );
    expect(constructed).toHaveLength(0);
  });

  it('не трогает ни модель, ни ключ, ни температуру', () => {
    buildChatModel(SETTING, 0.3, { serviceTier: 'flex' });

    expect(constructed[0].model).toBe('openai/gpt-5.6-luna');
    expect(constructed[0].temperature).toBe(0.3);
    expect(constructed[0].apiKey).toBe('расшифровано:зашифрованный-ключ');
    expect(constructed[0].configuration.baseURL).toBe(
      'https://openrouter.ai/api/v1'
    );
  });
});

void path;
