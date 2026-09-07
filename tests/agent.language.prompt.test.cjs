const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

let promptTemplate = '';
let promptInput;
let modelResult;
class WebSearchNotConfigured extends Error {}

const { AgentGraphService } = loadWithMocks(
  'libraries/nestjs-libraries/src/agent/agent.graph.service.ts',
  {
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
    '@langchain/core/prompts': {
      ChatPromptTemplate: {
        fromTemplate(template) {
          promptTemplate = template;
          return {
            pipe() {
              return {
                async invoke(input) {
                  promptInput = input;
                  return modelResult;
                },
              };
            },
          };
        },
      },
    },
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
      getChatModel: async () => ({
        withStructuredOutput: () => ({}),
      }),
      getImageModel: async () => ({}),
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      executeAiStreamOperation: (_organizationId, _operation, factory) =>
        factory(),
    },
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
      WebSearchNotConfigured,
    },
  }
);

const russianState = {
  orgId: 'org',
  language: 'ru',
  format: 'one_long',
  tone: 'company',
  messages: [{ content: 'Расскажите о новых правилах рынка' }],
  fresearch: {
    summary: 'Связная справка',
    facts: [
      { text: 'Проверенный факт', sourceUrl: 'https://example.com/fact' },
    ],
    sources: [
      {
        title: 'Источник',
        url: 'https://example.com/fact',
        publishedAt: '2026-08-12',
      },
    ],
  },
  popularPosts: [{ hook: 'Существующий хук', content: 'Текст' }],
  hook: 'Новый хук',
};

describe('agent content language prompts', () => {
  beforeEach(() => {
    promptTemplate = '';
    promptInput = undefined;
  });

  test.each([
    ['generateHook', { hook: 'Хук' }],
    ['generateContent', { content: { content: 'Пост' } }],
  ])('%s explicitly requests Russian output', async (method, result) => {
    modelResult = result;
    const service = new AgentGraphService({}, {});

    await service[method](russianState);

    expect(promptTemplate).toContain(
      'Write every human-readable part of the post in Russian.'
    );
    expect(promptTemplate).not.toContain('Use simple english');
  });

  /**
   * Один каталог штампов на обе половины решения
   * (`content-factory-next-k879.1`, 07.09.2026).
   *
   * До этой волны список запрещённых оборотов доходил только до промпта сути,
   * то есть до текста, который никуда не публикуется. Адаптация под канал —
   * это как раз тот текст, который человек увидит, и промпт обязан запрещать
   * ровно то, что проверка ловит после.
   *
   * Список едет переменной шаблона, а не строкой в него: оборот с фигурной
   * скобкой стал бы для `ChatPromptTemplate` именем переменной.
   */
  test('the adaptation prompt forbids the turns of phrase the check catches', async () => {
    const { forbiddenPhrasesFor, forbiddenPhrasesRule } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/content-intelligence/text-quality/forbidden-phrases.ts'
    );
    modelResult = { content: { content: 'Пост' } };
    const service = new AgentGraphService({}, {});

    await service.generateContent(russianState);

    expect(promptTemplate).toContain('{forbidden}');
    expect(promptInput.forbidden).toBe(forbiddenPhrasesRule('ru'));
    expect(promptInput.forbidden).toContain('не используй обороты из списка:');
    for (const phrase of forbiddenPhrasesFor('ru').slice(0, 5)) {
      expect(promptInput.forbidden).toContain(phrase);
    }
  });

  test('Russian category classification uses a Russian vocabulary', async () => {
    modelResult = { category: 'Образовательный' };
    const service = new AgentGraphService(
      {
        findAllExistingCategories: async () => [
          { category: 'Educational' },
          { category: 'Образовательный' },
        ],
      },
      {}
    );

    await service.findCategories(russianState);

    expect(promptInput.categories).toContain('Образовательный');
    expect(promptInput.categories).not.toContain('Educational');
    expect(promptInput.text).toContain('Связная справка');
    expect(promptInput.text).toContain('https://example.com/fact');
    expect(promptInput.text).not.toContain('[object Object]');
  });

  test('Russian topic classification has useful defaults without history', async () => {
    modelResult = { topic: 'Бизнес' };
    const service = new AgentGraphService(
      {
        findAllExistingTopicsOfCategory: async () => [],
      },
      {}
    );

    await service.findTopic({ ...russianState, category: 'Образовательный' });

    expect(promptInput.topics).toContain('Бизнес');
  });

  test('continues without web search and warns prompts not to invent fresh data', async () => {
    const service = new AgentGraphService(
      { findAllExistingCategories: async () => [] },
      {},
      {
        research: async () => {
          throw new WebSearchNotConfigured();
        },
      }
    );

    const output = await service.research(russianState);

    expect(output.fresearch).toEqual({
      summary: '',
      facts: [],
      sources: [],
    });
    expect(output.researchAvailable).toBe(false);

    modelResult = { category: 'Образовательный' };
    await service.findCategories({ ...russianState, ...output });
    expect(promptInput.text).toContain('No web research was performed');
    expect(promptInput.text).toContain('Do not claim current or fresh data');
  });
});
