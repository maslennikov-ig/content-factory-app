'use strict';

/**
 * Живой прогон владельца 05.09.2026, две дыры на одном пути «Бриф → Найти».
 *
 * `content-factory-next-fn33.133`: интерфейс на русском, а «Коротко о
 * найденном» приходит по-английски. Сводку пишет не наша модель, а поисковик:
 * это поле `answer` у Tavily, и оно идёт на языке запроса, а запрос всегда
 * английский. Значит язык читателя должен доходить до сервиса поиска и до
 * промпта, который приводит сводку к этому языку.
 *
 * `content-factory-next-fn33.139`: когда оба поисковика не ответили,
 * `WebSearchFallbackError` вылетает наружу и становится 500 без кода. Отказ
 * настройки (`CONTENT_SEARCH_NOT_CONFIGURED`) экран умеет объяснить, а
 * временный сбой — нет, хотя именно он лечится повтором.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(root, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const contentLanguage = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content.language.ts'
);

// --- Section A: язык доходит до сводки (fn33.133) ---------------------------

let classification;
let aiConfig;
let searchAnswer;
let summaryResult;
const templates = [];
const promptInputs = [];
const chatModelCalls = [];

const promptFor = (template) => ({
  pipe: () => ({
    invoke: async (input) => {
      promptInputs.push({ template, input });
      return template.includes('Classify the research subject')
        ? classification
        : summaryResult;
    },
  }),
});

const { WebResearchService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/web.research.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        log() {}
        warn() {}
      },
    },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      requireActiveAiConfig: async () => aiConfig,
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      AiUsageService: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/content.language': contentLanguage,
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      WEB_SEARCH_TIMEOUT_MS: 20_000,
      WEB_SEARCH_PRIMARY_TIMEOUT_MS: 12_000,
      WEB_SEARCH_FALLBACK_TIMEOUT_MS: 8_000,
      WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
      WEB_SEARCH_MAX_RESULT_CHARS: 32_000,
      getChatModel: async (organizationId, temperature, maxTokens, role) => {
        chatModelCalls.push({ organizationId, temperature, role });
        return { withStructuredOutput: () => ({}) };
      },
      getWebSearchClient: async () => ({
        invoke: async () => searchAnswer,
      }),
    },
    '@langchain/core/prompts': {
      ChatPromptTemplate: {
        fromTemplate: (template) => {
          templates.push(template);
          return promptFor(template);
        },
      },
    },
  }
);

const aiUsage = {
  executeAiOperation: async (_organizationId, _operation, callback) =>
    callback(),
};

describe('сводка веб-поиска говорит на языке читателя', () => {
  beforeEach(() => {
    templates.length = 0;
    promptInputs.length = 0;
    chatModelCalls.length = 0;
    classification = {
      scope: 'international',
      subjectLanguage: 'ru',
      englishQuery: 'key interest rate Russia',
      localQuery: null,
      freshnessRequired: false,
    };
    aiConfig = {
      provider: 'openrouter',
      apiKey: 'model-key',
      search: {
        enabled: true,
        provider: 'tavily',
        apiKey: 'search-key',
        topic: 'general',
        depth: 'advanced',
      },
    };
    searchAnswer = {
      answer:
        "The Bank of Russia's key interest rate in September 2026 is set at 14% per annum.",
      results: [
        {
          title: 'Rate decision',
          url: 'https://example.org/rate',
          content: 'Rate stays at 14%.',
          published_date: 'Wed, 02 Sep 2026 15:54:46 GMT',
        },
      ],
    };
    summaryResult = {
      summary: 'Ключевая ставка Банка России в сентябре 2026 года — 14% годовых.',
    };
  });

  test('промпт сводки несёт язык, и сводка возвращается на нём', async () => {
    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru' }
    );

    const summaryPrompt = promptInputs.find(
      ({ template }) => !template.includes('Classify the research subject')
    );
    assert.ok(summaryPrompt, 'сводка должна проходить через свой промпт');
    assert.match(summaryPrompt.template, /\{language\}|Russian/);
    assert.equal(
      JSON.stringify(summaryPrompt.input).includes('Russian') ||
        summaryPrompt.input.language === 'Russian',
      true,
      'в промпт сводки должен приходить язык читателя'
    );
    assert.equal(
      result.summary,
      'Ключевая ставка Банка России в сентябре 2026 года — 14% годовых.'
    );
    // Дешёвая роль: сводка не стоит модели, которая пишет черновики.
    assert.equal(
      chatModelCalls.every(({ role }) => role === 'classify'),
      true
    );
  });

  test('сводка уже на нужном языке не тратит второй вызов модели', async () => {
    searchAnswer.answer = 'Ключевая ставка — 14% годовых.';

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru' }
    );

    assert.equal(result.summary, 'Ключевая ставка — 14% годовых.');
    assert.equal(chatModelCalls.length, 1);
  });

  test('без языка поведение прежнее: сводка идёт как пришла', async () => {
    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'key rate'
    );

    assert.equal(result.summary, searchAnswer.answer);
    assert.equal(chatModelCalls.length, 1);
  });

  test('сорванный перевод сводки не срывает поиск', async () => {
    summaryResult = null;

    const result = await new WebResearchService(aiUsage).research(
      'organization-a',
      'ключевая ставка',
      { language: 'ru' }
    );

    assert.equal(result.summary, searchAnswer.answer);
    assert.equal(result.sources.length, 1);
  });
});

// --- Section B: отказ поиска называет себя (fn33.139) -----------------------

const dtoModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content-intelligence/content-source.dto.ts',
  { '../content.language': contentLanguage }
);
const permissionEnums = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permission.exception.class.ts'
);
const permissionDecorators = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permissions.ability.ts',
  { './permission.exception.class': permissionEnums }
);
const { ContentSourceController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/content-source.controller.ts',
  {
    '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
      { ContentSourceRegistryService: class {} },
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-source.dto':
      dtoModule,
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => undefined,
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability':
      permissionDecorators,
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      permissionEnums,
  }
);

const controllerWithResearch = (research) =>
  new ContentSourceController({}, research);

describe('отказ поиска приходит с кодом', () => {
  test('оба поисковика молчат — предметный код, а не 500', async () => {
    const fallback = Object.assign(
      new Error(
        'Tavily and OpenRouter web research both failed: Web search returned no results. | Web search did not answer within 8000ms.'
      ),
      { name: 'WebSearchFallbackError' }
    );
    const controller = controllerWithResearch({
      research: async () => {
        throw fallback;
      },
    });

    const error = await controller
      .searchForEvidence({ id: 'org-a' }, { subject: 'переезд с 1С в облако' })
      .then(
        () => null,
        (thrown) => thrown
      );

    assert.ok(error, 'отказ должен долетать до клиента');
    const body = error.getResponse();
    assert.equal(body.code, 'CONTENT_SEARCH_UNAVAILABLE');
    assert.equal(error.getStatus(), 503);
    // Наружу не уходит ни имя поисковика, ни таймаут из лога.
    assert.equal(/Tavily|OpenRouter|8000/.test(body.message), false);
  });

  test('язык читателя доходит до сервиса поиска', async () => {
    const calls = [];
    const controller = controllerWithResearch({
      research: async (...args) => {
        calls.push(args);
        return { summary: '', provider: 'tavily', facts: [], sources: [] };
      },
    });

    await controller.searchForEvidence(
      { id: 'org-a' },
      { subject: 'ключевая ставка', language: 'ru' }
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][2], { language: 'ru' });
  });

  test('DTO принимает только известные языки', async () => {
    const { validate } = require('class-validator');
    const ok = Object.assign(new dtoModule.SearchForEvidenceDto(), {
      subject: 'ключевая ставка',
      language: 'ru',
    });
    const without = Object.assign(new dtoModule.SearchForEvidenceDto(), {
      subject: 'ключевая ставка',
    });
    const wrong = Object.assign(new dtoModule.SearchForEvidenceDto(), {
      subject: 'ключевая ставка',
      language: 'klingon',
    });

    assert.deepEqual(await validate(ok), []);
    assert.deepEqual(await validate(without), []);
    assert.equal((await validate(wrong)).length > 0, true);
  });
});
