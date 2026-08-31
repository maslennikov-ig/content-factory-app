const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks) {
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
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return require(request);
  };
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

const noOpDecorator = () => () => undefined;
const hasAiProvider = jest.fn();
const requireActiveAiConfig = jest.fn();
class AiProviderNotConfigured extends require('@nestjs/common')
  .ServiceUnavailableException {
  constructor() {
    super({
      statusCode: 503,
      code: 'AI_SELECTED_CREDENTIAL_UNAVAILABLE',
      message:
        'AI is unavailable for the selected mode. Ask the operator to configure included credentials, or have a workspace administrator configure workspace_key credentials.',
    });
  }
}
const getOpenAiClient = jest.fn();
let capturedAgentOptions;
let capturedAdapterOptions;
const webResearch = jest.fn();
const contentContext = {
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'context-1',
  status: 'READY',
  generationPolicy: 'ALLOW_GROUNDED',
  profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
  facts: [],
  evidence: [],
  rejected: [],
  selectionHash: 'selection-1',
};
const contexts = { build: jest.fn(async () => contentContext) };
const brands = { resolve: jest.fn() };
const aiUsage = {
  executeAiOperation: jest.fn(async (_organizationId, _operation, callback) =>
    callback()
  ),
};
const getLocalAgents = jest.fn((options) => {
  capturedAgentOptions = options;
  return {};
});
class RequestContext {
  constructor() {
    this.values = new Map();
  }
  set(key, value) {
    this.values.set(key, value);
  }
  get(key) {
    return this.values.get(key);
  }
}

const { CopilotController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/copilot.controller.ts',
  {
    '@copilotkit/runtime': {
      CopilotRuntime: class {},
      OpenAIAdapter: class {
        constructor(options) {
          capturedAdapterOptions = options;
        }
      },
      copilotRuntimeNodeHttpEndpoint: jest.fn(() => jest.fn(() => 'handled')),
      copilotRuntimeNextJSAppRouterEndpoint: jest.fn(() => ({
        handleRequest: jest.fn(() => 'handled'),
      })),
    },
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: noOpDecorator,
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service':
      { SubscriptionService: class {} },
    '@ag-ui/mastra': { MastraAgent: { getLocalAgents } },
    '@contentfactory/nestjs-libraries/chat/mastra.service': {
      MastraService: class {},
    },
    '@mastra/core/di': { RequestContext },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: noOpDecorator,
    },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      hasAiProvider,
      AiProviderNotConfigured,
      requireActiveAiConfig,
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      AiUsageService: class {},
    },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      getOpenAiClient,
    },
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
    },
    '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service':
      {
        ContentContextService: class {},
      },
    '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
      {
        BrandProfileContextService: class {},
      },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      {
        AuthorizationActions: { Create: 'Create' },
        Sections: { AI: 'AI' },
      },
  }
);

describe('CopilotController provider availability', () => {
  beforeEach(() => {
    hasAiProvider.mockResolvedValue(false);
    requireActiveAiConfig.mockResolvedValue({ textModel: 'text-model' });
    getOpenAiClient.mockResolvedValue({
      chat: { completions: { stream: jest.fn() } },
      beta: {},
    });
    capturedAgentOptions = undefined;
    capturedAdapterOptions = undefined;
    contexts.build.mockClear();
    aiUsage.executeAiOperation.mockClear();
  });

  test.each([
    ['chatAgent', {}],
    ['agent', { body: { variables: { properties: {} } } }],
  ])(
    '%s returns a clear service-unavailable error instead of an empty response',
    async (method, request) => {
      const controller = new CopilotController(
        {},
        {},
        undefined,
        aiUsage,
        contexts,
        brands
      );
      const organization = { id: 'org-without-ai-key' };

      await expect(
        controller[method](request, {}, organization)
      ).rejects.toMatchObject({
        status: 503,
        response: {
          statusCode: 503,
          code: 'AI_SELECTED_CREDENTIAL_UNAVAILABLE',
          message:
            'AI is unavailable for the selected mode. Ask the operator to configure included credentials, or have a workspace administrator configure workspace_key credentials.',
        },
      });
    }
  );

  test('passes the explicitly selected content language to the chat agent', async () => {
    hasAiProvider.mockResolvedValue(true);
    const controller = new CopilotController(
      {},
      { mastra: async () => ({}) },
      undefined,
      aiUsage,
      contexts,
      brands
    );

    await controller.agent(
      {
        body: {
          variables: {
            properties: {
              integrations: [],
              contentLanguage: 'ru',
            },
          },
        },
      },
      {},
      { id: 'org' }
    );

    expect(capturedAgentOptions.requestContext.get('contentLanguage')).toBe(
      'ru'
    );
    expect(
      JSON.parse(capturedAgentOptions.requestContext.get('contentContext'))
        .contentContextSnapshotId
    ).toBe('context-1');
    expect(
      capturedAgentOptions.requestContext.get('contentIntelligenceMode')
    ).toBe('content-intelligence/v1');
    expect(contexts.build).toHaveBeenCalledTimes(1);
  });

  test('blocks current-required agent work before AI admission', async () => {
    hasAiProvider.mockClear();
    contexts.build.mockResolvedValueOnce({
      ...contentContext,
      status: 'BLOCKED_STALE',
      generationPolicy: 'EVIDENCE_REQUIRED',
      errorCode: 'CONTENT_EVIDENCE_REQUIRED',
    });
    const controller = new CopilotController(
      {},
      {},
      undefined,
      aiUsage,
      contexts,
      brands
    );

    await expect(
      controller.agent(
        {
          body: {
            variables: {
              properties: {
                contentIntelligence: {
                  query: 'Current material',
                  freshnessMode: 'REQUIRE_CURRENT',
                },
              },
            },
          },
        },
        {},
        { id: 'org-a' }
      )
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'CONTENT_EVIDENCE_REQUIRED' },
    });
    expect(hasAiProvider).not.toHaveBeenCalled();
    expect(aiUsage.executeAiOperation).not.toHaveBeenCalled();
  });

  test('bridges the stable OpenAI chat API into the namespace CopilotKit 1.10 streams', async () => {
    hasAiProvider.mockResolvedValue(true);
    const stableChat = { completions: { stream: jest.fn() } };
    getOpenAiClient.mockResolvedValue({ chat: stableChat, beta: {} });
    const controller = new CopilotController(
      {},
      {},
      undefined,
      aiUsage,
      contexts,
      brands
    );

    await expect(
      controller.chatAgent({}, {}, { id: 'organization-a' })
    ).resolves.toBe('handled');
    expect(capturedAdapterOptions.openai.beta.chat).toBe(stableChat);
  });

  test('returns cited web research to the editor for the current organization', async () => {
    webResearch.mockResolvedValue({
      summary: 'Summary',
      facts: [],
      sources: [
        {
          title: 'Source',
          url: 'https://example.com',
          publishedAt: '2026-08-12',
        },
      ],
    });
    const controller = new CopilotController(
      {},
      {},
      { research: webResearch },
      aiUsage,
      contexts,
      brands
    );

    await expect(
      controller.research({ subject: 'Topic' }, { id: 'organization-a' }, 'ru')
    ).resolves.toMatchObject({
      contentContextSnapshotId: 'context-1',
      brandProfileVersionId: null,
    });
    expect(contexts.build).toHaveBeenCalledWith(
      'organization-a',
      expect.objectContaining({ consumer: 'EDITOR', language: 'ru' })
    );
    expect(webResearch).not.toHaveBeenCalled();
  });
});
