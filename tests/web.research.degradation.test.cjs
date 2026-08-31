const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
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

class WebSearchNotConfigured extends Error {}

const contentLanguage = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content.language.ts'
);
const agentCategories = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/agent.categories.ts'
);
const agentTopics = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/agent.topics.ts'
);

const voiceDirectives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/voice-directives.ts',
  {}
);

/** Настоящий, а не заглушка: проверка длины арифметическая и модель не зовёт. */
const postLength = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/post-length.ts',
  {}
);

/**
 * Тоже настоящий: правила отбора черновиков — чистая арифметика, а заглушка
 * здесь означала бы, что этот набор проходит и на сломанном правиле.
 */
const draftPick = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/draft-pick.ts',
  {}
);

/**
 * Эти два — общим загрузчиком, а не местным.
 *
 * Местный не разбирает относительные импорты, а `draft-gaps` читает соседей
 * (`./post-habits`, `./segment`). Подменять их заглушками нельзя: узел графа
 * обязан считать привычку тем же кодом, что и продукт, иначе набор проверит
 * согласие двух заглушек между собой.
 */
const { loadTypeScriptModule: loadReal } = require('./helpers/load-tsx.cjs');
const BRAND_VOICE =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const draftGaps = loadReal(`${BRAND_VOICE}/draft-gaps.ts`);
const localePack = loadReal(`${BRAND_VOICE}/locale-pack.ts`);

const { AgentGraphService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/agent.graph.service.ts',
  {
    '@contentfactory/nestjs-libraries/agent/voice-directives': voiceDirectives,
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/post-length':
      postLength,
    /**
     * Предложение после черновика и словарь, по которому оно считается.
     *
     * Настоящие, а не заглушки: узел только читает их и должен читать то же,
     * что продукт. Заглушка здесь спрятала бы ровно то, ради чего этот набор
     * существует, — что граф берёт голос из одного источника.
     */
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/draft-gaps':
      draftGaps,
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/locale-pack':
      localePack,
    '@contentfactory/nestjs-libraries/agent/draft-pick': draftPick,
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Inject: () => () => {},
      Optional: () => () => {},
      Logger: class {
        warn() {}
      },
    },
    '@langchain/core/messages': {
      BaseMessage: class {},
      HumanMessage: class {},
      ToolMessage: class {},
    },
    '@langchain/langgraph': {
      END: 'END',
      START: 'START',
      StateGraph: class {},
    },
    '@langchain/openai': {
      ChatOpenAI: class {},
      DallEAPIWrapper: class {},
    },
    '@langchain/tavily': { TavilySearch: class {} },
    '@langchain/langgraph/prebuilt': { ToolNode: class {} },
    '@langchain/core/prompts': { ChatPromptTemplate: { fromTemplate: () => ({}) } },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/media/media.service': {
      MediaService: class {},
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: { createStorage: () => ({}) },
    },
    '@contentfactory/nestjs-libraries/dtos/generator/generator.dto': {
      GeneratorDto: class {},
    },
    '@contentfactory/nestjs-libraries/openai/generation.error': {
      generationError: (error) => error,
    },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      getChatModel: async () => ({ withStructuredOutput: () => ({}) }),
      getImageModel: async () => ({}),
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      executeAiStreamOperation: (_organizationId, _operation, factory) =>
        factory(),
    },
    '@contentfactory/nestjs-libraries/dtos/content.language': contentLanguage,
    '@contentfactory/nestjs-libraries/agent/agent.categories': agentCategories,
    '@contentfactory/nestjs-libraries/agent/agent.topics': agentTopics,
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
      WebSearchNotConfigured,
    },
  }
);

const emptyResearch = { summary: '', facts: [], sources: [] };

describe('generation survives a failing search provider', () => {
  test('a rate-limited provider degrades instead of killing the generator', async () => {
    const rateLimited = Object.assign(new Error('429 Too Many Requests'), {
      status: 429,
    });
    const service = new AgentGraphService({}, {}, {
      research: async () => {
        throw rateLimited;
      },
    });

    await expect(
      service.research({ orgId: 'org', question: 'Subject', messages: [] })
    ).resolves.toEqual({
      fresearch: emptyResearch,
      researchAvailable: false,
    });
  });

  test('a disabled search still reads as unavailable rather than as fresh data', async () => {
    const service = new AgentGraphService({}, {}, {
      research: async () => {
        throw new WebSearchNotConfigured();
      },
    });

    await expect(
      service.research({ orgId: 'org', question: 'Subject', messages: [] })
    ).resolves.toEqual({
      fresearch: emptyResearch,
      researchAvailable: false,
    });
  });
});
