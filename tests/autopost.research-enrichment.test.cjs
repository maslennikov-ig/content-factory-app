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
const safeUrlValidator = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/webhooks/webhook.url.validator.ts'
);
const ssrfSafeDispatcher = {};
const fetchSafePublicHttpsUrl = async () => {
  throw new Error('Unexpected URL fetch');
};

let promptTemplate = '';
let promptInput;
const createPost = jest.fn();

class WebSearchNotConfigured extends Error {}

const voiceDirectives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/voice-directives.ts'
);
const { AutopostService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts',
  {
    '@contentfactory/nestjs-libraries/agent/voice-directives': voiceDirectives,
    '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.repository':
      {
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
                  return { socialMediaPostContent: 'Обогащённый пост' };
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
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      {
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
    '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service':
      {
        ContentContextService: class {},
      },
    '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository':
      {
        BrandProfileRepository: class {},
      },
    '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
      {
        BrandProfileContextService: class {},
      },
    '@contentfactory/nestjs-libraries/content-intelligence/contracts': {},
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository': {
      PostsRepository: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/content.language': contentLanguage,
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
      WebSearchNotConfigured,
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

const source = {
  title: 'Independent source',
  url: 'https://example.com/context',
  publishedAt: '2026-08-13',
};
const research = {
  summary: 'Independent summary',
  facts: [
    {
      text: 'Independent fact',
      sourceUrl: source.url,
    },
  ],
  sources: [source],
};

const state = (body = {}) => ({
  integrations: [
    {
      organizationId: 'organization-a',
      providerIdentifier: 'telegram',
      additionalSettings: '[]',
      id: 'telegram-a',
    },
  ],
  body: {
    organizationId: 'organization-a',
    generateContent: true,
    researchEnabled: true,
    language: 'ru',
    addPicture: false,
    ...body,
  },
  load: {
    description: 'Исходный элемент ленты',
    url: 'https://example.com/feed-item',
  },
  description: 'Обогащённый пост',
  image: '',
});

const createService = (researchImpl) => {
  const webResearch = { research: jest.fn(researchImpl) };
  const posts = {
    findFreeDateTime: jest.fn(async () => '2026-08-14T12:00:00'),
    createPost,
  };
  const integrationManager = {
    getSocialIntegration: () => ({ maxLength: () => 4096 }),
  };
  return {
    webResearch,
    service: new AutopostService(
      {},
      {},
      {},
      posts,
      integrationManager,
      webResearch
    ),
  };
};

describe('autopost research enrichment', () => {
  beforeEach(() => {
    promptTemplate = '';
    promptInput = undefined;
    createPost.mockReset();
  });

  test('feeds found context into rewriting and persists cited sources', async () => {
    const { service, webResearch } = createService(async () => research);
    const input = state();

    const enriched = await service.enrichWithResearch(input);
    await service.generateDescription({ ...input, ...enriched });
    await service.schedulePost({ ...input, ...enriched });

    expect(webResearch.research).toHaveBeenCalledWith(
      'organization-a',
      expect.stringContaining('Исходный элемент ленты')
    );
    expect(promptTemplate).toContain('BEGIN verified web research');
    expect(promptInput.research).toContain('Independent fact');
    expect(promptInput.research).toContain(source.url);
    expect(createPost.mock.calls[0][1].posts[0].researchSources).toEqual([
      source,
    ]);
  });

  test.each([
    ['the feature is off', { researchEnabled: false, generateContent: true }],
    [
      'the item is republished verbatim',
      { researchEnabled: true, generateContent: false },
    ],
  ])('does not search when %s', async (_label, body) => {
    const { service, webResearch } = createService(async () => research);

    const enriched = await service.enrichWithResearch(state(body));

    expect(enriched).toEqual({});
    expect(webResearch.research).not.toHaveBeenCalled();
  });

  test('keeps the normal rewrite path when configured search is unavailable', async () => {
    const { service } = createService(async () => {
      throw new WebSearchNotConfigured();
    });
    const input = state();

    const enriched = await service.enrichWithResearch(input);
    await service.generateDescription({ ...input, ...enriched });

    expect(enriched).toEqual({});
    expect(promptTemplate).not.toContain('BEGIN verified web research');
    expect(promptInput).toEqual({ content: 'Исходный элемент ленты' });
  });

  test('the persistent flag is backward-compatible and defaults to false', () => {
    const schema = fs.readFileSync(
      path.resolve(
        __dirname,
        '../libraries/nestjs-libraries/src/database/prisma/schema.prisma'
      ),
      'utf8'
    );
    expect(schema).toMatch(/researchEnabled\s+Boolean\s+@default\(false\)/);
  });
});
