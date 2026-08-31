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
  const evaluate = new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  );
  evaluate(
    loaded.exports,
    localRequire,
    loaded,
    filename,
    path.dirname(filename)
  );
  return loaded.exports;
}

const contentLanguage = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content.language.ts'
);
const safeUrlValidator = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/webhooks/webhook.url.validator.ts'
);
const ssrfSafeDispatcher = {};
const fetchSafePublicHttpsUrl = async () => {
  throw new Error('Unexpected URL fetch');
};

let promptTemplate = '';
let promptInput;

const voiceDirectives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/voice-directives.ts'
);
const { AutopostService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts',
  {
    '@contentfactory/nestjs-libraries/agent/voice-directives': voiceDirectives,
    '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.repository': {
      AutopostRepository: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/autopost/autopost.dto': {
      AutopostDto: class {},
    },
    '@langchain/langgraph': {
      END: 'END',
      START: 'START',
      StateGraph: class {},
    },
    '@langchain/core/messages': { BaseMessage: class {} },
    '@langchain/openai': {
      ChatOpenAI: class {},
      DallEAPIWrapper: class {},
    },
    '@langchain/core/prompts': {
      ChatPromptTemplate: {
        fromTemplate(template) {
          promptTemplate = template;
          return {
            pipe() {
              return {
                async invoke(input) {
                  promptInput = input;
                  return { socialMediaPostContent: 'Полный пост' };
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
    'rss-parser': {
      __esModule: true,
      default: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': {
      IntegrationService: class {},
    },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'id',
    },
    'nestjs-temporal-core': { TemporalService: class {} },
    '@temporalio/common': { TypedSearchAttributes: class {} },
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': {
      organizationId: 'organizationId',
    },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      getChatModel: async () => ({
        withStructuredOutput: () => ({}),
      }),
      getImageModel: async () => ({}),
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      executeAiOperation: async (_organizationId, _operation, callback) =>
        callback(),
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/content.language': contentLanguage,
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
      WebSearchNotConfigured: class extends Error {},
    },
    '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator':
      safeUrlValidator,
    '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher': {
      ssrfSafeDispatcher,
    },
    '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.fetch': {
      fetchSafePublicHttpsUrl,
    },
  }
);

const telegramManager = {
  getSocialIntegration: (identifier) =>
    identifier === 'telegram'
      ? { maxLength: () => 4096, maxCaptionLength: () => 1024 }
      : undefined,
};

const sourceUrl = 'https://example.com/article';
const suffixLength = ('\n\n' + sourceUrl).length;

const generateFor = async (body) => {
  const service = new AutopostService({}, {}, {}, {}, telegramManager);
  return service.generateDescription({
    integrations: [{ providerIdentifier: 'telegram', additionalSettings: '[]' }],
    body: { organizationId: 'org', generateContent: true, ...body },
    load: { description: 'Исходный материал', url: sourceUrl },
  });
};

describe('autopost generation contract', () => {
  test('uses Telegram length and the explicitly selected Russian language', async () => {
    const integrationManager = {
      getSocialIntegration: (identifier) => {
        if (identifier !== 'telegram') {
          throw new Error('Unexpected provider');
        }
        return { maxLength: () => 4096 };
      },
    };
    const service = new AutopostService(
      {},
      {},
      {},
      {},
      integrationManager
    );

    await service.generateDescription({
      integrations: [
        {
          providerIdentifier: 'telegram',
          additionalSettings: '[]',
        },
      ],
      body: {
        organizationId: 'org',
        generateContent: true,
        language: 'ru',
      },
      load: {
        description: 'Исходный материал',
        url: 'https://example.com/article',
      },
    });

    expect(promptTemplate).toContain(
      'Final post maximum: 4096 characters including the source URL'
    );
    expect(promptTemplate).toContain(
      'Write every human-readable part of the post in Russian.'
    );
    expect(promptTemplate).not.toMatch(/Maximum 1(?:00|20) chars/);
    expect(promptInput).toEqual({ content: 'Исходный материал' });
  });

  test('spends the whole message budget when the post carries no picture', async () => {
    await generateFor({ language: 'en' });

    expect(promptTemplate).toContain(
      'Final post maximum: 4096 characters including the source URL'
    );
    expect(promptTemplate).toContain(
      `Generated content maximum: ${4096 - suffixLength} characters`
    );
  });

  test('drops to the caption budget when the post carries a picture', async () => {
    await generateFor({ language: 'en', addPicture: true });

    expect(promptTemplate).toContain(
      'Final post maximum: 1024 characters including the source URL'
    );
    expect(promptTemplate).toContain(
      `Generated content maximum: ${1024 - suffixLength} characters`
    );
  });

  test('asks for paragraph breaks that survive scheduling unchanged', async () => {
    await generateFor({ language: 'en' });
    expect(promptTemplate).toContain('\\n\\n');
    expect(promptTemplate).not.toContain('between sentences (\\n)');

    const createPost = jest.fn().mockResolvedValue({});
    const service = new AutopostService(
      {},
      {},
      {},
      {
        findFreeDateTime: async () => '2026-08-13T10:00:00',
        createPost,
      },
      telegramManager
    );
    const description = 'Первый абзац.\n\nВторой абзац.';

    await service.schedulePost({
      description,
      load: { url: sourceUrl },
      image: '',
      integrations: [
        {
          id: 'integration-a',
          organizationId: 'org',
          providerIdentifier: 'telegram',
        },
      ],
      body: {},
    });

    const [[, post]] = createPost.mock.calls;
    const content = post.posts[0].value[0].content;
    expect(content).toBe(`${description}\n\n${sourceUrl}`);
    expect(content.length).toBe(description.length + suffixLength);
  });

  test('ignores a channel whose provider is unknown instead of crashing', async () => {
    const service = new AutopostService({}, {}, {}, {}, telegramManager);

    await expect(
      service.generateDescription({
        integrations: [
          { providerIdentifier: 'telegram', additionalSettings: '[]' },
          { providerIdentifier: 'retired-network', additionalSettings: '[]' },
        ],
        body: { organizationId: 'org', generateContent: true, language: 'en' },
        load: { description: 'Исходный материал', url: sourceUrl },
      })
    ).resolves.toMatchObject({ description: 'Полный пост' });

    expect(promptTemplate).toContain(
      'Final post maximum: 4096 characters including the source URL'
    );
  });
});
