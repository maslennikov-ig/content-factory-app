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

const safeUrlValidator = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/webhooks/webhook.url.validator.ts'
);
const ssrfSafeDispatcher = {};
const { fetchSafePublicHttpsUrl } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/webhooks/ssrf.safe.fetch.ts',
  {
    './webhook.url.validator': safeUrlValidator,
    './ssrf.safe.dispatcher': { ssrfSafeDispatcher },
  }
);

const { ExtractContentService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/extract.content.service.ts',
  {
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

// `parseURL` is what `loadXML` used to call. rss-parser fetches through Node's
// own http.get/https.get, so nothing the repository validates would ever see
// that request — the mock records the call so a test can prove it is gone.
const rssParserCalls = { parseURL: [], parseString: [] };
class RssParserMock {
  async parseURL(url) {
    rssParserCalls.parseURL.push(url);
    return { items: [] };
  }
  async parseString(xml) {
    rssParserCalls.parseString.push(xml);
    const match = /<link>([^<]*)<\/link>/.exec(xml);
    return {
      items: [
        {
          pubDate: '2026-08-16T10:00:00.000Z',
          link: match ? match[1] : '',
          description: '<p>feed item</p>',
        },
      ],
    };
  }
}

// Настоящий модуль правил: блок голоса берёт из него два потолка (сколько
// выученных правил уходит в промпт и какой длины каждое).
const voiceLearning = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-learning.ts',
  {}
);
const voiceDirectives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/voice-directives.ts',
  {
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-learning':
      voiceLearning,
  }
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
    '@langchain/core/prompts': { ChatPromptTemplate: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class {},
    },
    'rss-parser': {
      __esModule: true,
      default: RssParserMock,
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
      getChatModel: async () => ({}),
      getImageModel: async () => ({}),
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      executeAiOperation: async (_organizationId, _operation, callback) =>
        callback(),
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/content.language': {
      ContentLanguage: {},
      contentLanguageInstruction: () => '',
    },
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

const LOOPBACK_HTTPS_URL = 'https://127.0.0.1/private';
const PUBLIC_HTTPS_URL = 'https://8.8.8.8/article';

function textResponse(html, status = 200, location = null) {
  return {
    status,
    headers: {
      get: (name) => (name.toLowerCase() === 'location' ? location : null),
    },
    text: async () => html,
  };
}

function feedResponse(link, status = 200, location = null) {
  return textResponse(
    `<rss><channel><item><link>${link}</link></item></channel></rss>`,
    status,
    location
  );
}

describe('server-side URL SSRF boundary', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    rssParserCalls.parseURL.length = 0;
    rssParserCalls.parseString.length = 0;
  });

  test('AutopostService.loadUrl blocks a loopback HTTPS URL before fetch', async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls++;
      return textResponse('<body>private metadata</body>');
    };

    const service = new AutopostService({}, {}, {}, {}, {}, {});

    await expect(service.loadUrl(LOOPBACK_HTTPS_URL)).resolves.toBe('');
    expect(fetchCalls).toBe(0);
  });

  test('AutopostService.loadXML blocks a loopback HTTPS feed before fetch', async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls++;
      return feedResponse('https://169.254.169.254/latest/meta-data/');
    };

    const service = new AutopostService({}, {}, {}, {}, {}, {});

    await expect(service.loadXML(LOOPBACK_HTTPS_URL)).resolves.toEqual({
      success: false,
    });
    expect(fetchCalls).toBe(0);
    expect(rssParserCalls.parseURL).toEqual([]);
    expect(rssParserCalls.parseString).toEqual([]);
  });

  test('AutopostService.loadXML blocks a feed redirect into the private range', async () => {
    const fetchedRequests = [];
    global.fetch = async (url, options) => {
      fetchedRequests.push({ url, options });
      return feedResponse('', 302, 'http://169.254.169.254/latest/meta-data/');
    };

    const service = new AutopostService({}, {}, {}, {}, {}, {});

    // The blocked feed fails exactly the way an unreachable one already did:
    // `loadXML` swallows it and reports `{ success: false }`.
    await expect(service.loadXML(PUBLIC_HTTPS_URL)).resolves.toEqual({
      success: false,
    });
    expect(fetchedRequests).toEqual([
      {
        url: PUBLIC_HTTPS_URL,
        options: { dispatcher: ssrfSafeDispatcher, redirect: 'manual' },
      },
    ]);
    expect(rssParserCalls.parseURL).toEqual([]);
  });

  test('AutopostService.loadXML parses an allowed feed from the guarded body', async () => {
    const fetchedRequests = [];
    global.fetch = async (url, options) => {
      fetchedRequests.push({ url, options });
      return feedResponse('https://8.8.8.8/article');
    };

    const service = new AutopostService({}, {}, {}, {}, {}, {});

    await expect(service.loadXML(PUBLIC_HTTPS_URL)).resolves.toMatchObject({
      success: true,
      url: 'https://8.8.8.8/article',
      description: 'feed item',
    });
    expect(fetchedRequests).toEqual([
      {
        url: PUBLIC_HTTPS_URL,
        options: { dispatcher: ssrfSafeDispatcher, redirect: 'manual' },
      },
    ]);
    expect(rssParserCalls.parseURL).toEqual([]);
    expect(rssParserCalls.parseString).toHaveLength(1);
  });

  test('ExtractContentService blocks a loopback HTTPS URL before fetch', async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls++;
      return textResponse('<body><h1>private metadata</h1></body>');
    };

    const service = new ExtractContentService();

    await expect(service.extractContent(LOOPBACK_HTTPS_URL)).rejects.toThrow(
      'Unsafe URL'
    );
    expect(fetchCalls).toBe(0);
  });

  test('AutopostService.loadUrl blocks an HTTP redirect before the second fetch', async () => {
    const fetchedRequests = [];
    global.fetch = async (url, options) => {
      fetchedRequests.push({ url, options });
      return textResponse('<body>redirect</body>', 302, 'http://8.8.8.8/plaintext');
    };

    const service = new AutopostService({}, {}, {}, {}, {}, {});

    await expect(service.loadUrl(PUBLIC_HTTPS_URL)).resolves.toBe('');
    expect(fetchedRequests).toEqual([
      {
        url: PUBLIC_HTTPS_URL,
        options: { dispatcher: ssrfSafeDispatcher, redirect: 'manual' },
      },
    ]);
  });

  test('ExtractContentService blocks a loopback redirect before the second fetch', async () => {
    const fetchedRequests = [];
    global.fetch = async (url, options) => {
      fetchedRequests.push({ url, options });
      return textResponse('<body>redirect</body>', 302, 'https://127.0.0.1/private');
    };

    const service = new ExtractContentService();

    await expect(service.extractContent(PUBLIC_HTTPS_URL)).rejects.toThrow(
      'Unsafe URL'
    );
    expect(fetchedRequests).toEqual([
      {
        url: PUBLIC_HTTPS_URL,
        options: { dispatcher: ssrfSafeDispatcher, redirect: 'manual' },
      },
    ]);
  });

  test('both services follow allowed relative and public HTTPS redirects', async () => {
    const fetchedRequests = [];
    const responses = [
      textResponse('<body>redirect</body>', 302, '/autopost-next'),
      textResponse('<body><h1>Autopost article</h1></body>'),
      textResponse(
        '<body>redirect</body>',
        302,
        'https://8.8.8.8/extract-next'
      ),
      textResponse('<body><h1>Extract article</h1></body>'),
    ];
    global.fetch = async (url, options) => {
      fetchedRequests.push({ url, options });
      return responses.shift();
    };

    const autopost = new AutopostService({}, {}, {}, {}, {}, {});
    const extractContent = new ExtractContentService();

    await expect(autopost.loadUrl(PUBLIC_HTTPS_URL)).resolves.toContain(
      'Autopost article'
    );
    await expect(extractContent.extractContent(PUBLIC_HTTPS_URL)).resolves.toContain(
      'Extract article'
    );
    expect(fetchedRequests).toEqual([
      {
        url: PUBLIC_HTTPS_URL,
        options: { dispatcher: ssrfSafeDispatcher, redirect: 'manual' },
      },
      {
        url: 'https://8.8.8.8/autopost-next',
        options: { dispatcher: ssrfSafeDispatcher, redirect: 'manual' },
      },
      {
        url: PUBLIC_HTTPS_URL,
        options: { dispatcher: ssrfSafeDispatcher, redirect: 'manual' },
      },
      {
        url: 'https://8.8.8.8/extract-next',
        options: { dispatcher: ssrfSafeDispatcher, redirect: 'manual' },
      },
    ]);
  });

  test('AutopostService.loadUrl stops after five redirects', async () => {
    const fetchedRequests = [];
    global.fetch = async (url, options) => {
      fetchedRequests.push({ url, options });
      return textResponse('<body>redirect</body>', 302, '/next');
    };

    const service = new AutopostService({}, {}, {}, {}, {}, {});

    await expect(service.loadUrl(PUBLIC_HTTPS_URL)).resolves.toBe('');
    expect(fetchedRequests).toHaveLength(6);
    expect(fetchedRequests.every(({ options }) => options.redirect === 'manual')).toBe(
      true
    );
  });

  test.each([
    ['missing', null, 'Redirect without Location'],
    ['invalid', 'https://[', 'Invalid redirect URL'],
  ])(
    'ExtractContentService rejects a %s redirect Location',
    async (_label, location, expectedError) => {
      const fetchedRequests = [];
      global.fetch = async (url, options) => {
        fetchedRequests.push({ url, options });
        return textResponse('<body>redirect</body>', 302, location);
      };

      const service = new ExtractContentService();

      await expect(service.extractContent(PUBLIC_HTTPS_URL)).rejects.toThrow(
        expectedError
      );
      expect(fetchedRequests).toEqual([
        {
          url: PUBLIC_HTTPS_URL,
          options: { dispatcher: ssrfSafeDispatcher, redirect: 'manual' },
        },
      ]);
    }
  );
});
