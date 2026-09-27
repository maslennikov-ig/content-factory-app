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
const aiUsage = {
  executeAiOperation: jest.fn(async (_organizationId, _operation, callback) =>
    callback()
  ),
};
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
    capturedAdapterOptions = undefined;
    contexts.build.mockClear();
    aiUsage.executeAiOperation.mockClear();
  });

  test.each([['chatAgent', {}]])(
    '%s returns a clear service-unavailable error instead of an empty response',
    async (method, request) => {
      const controller = new CopilotController(undefined, aiUsage, contexts);
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

  /**
   * The old agent screen's doors went with it (`content-factory-next-kcxz.8`):
   * the agent chat is `/agent` now, and `/copilot` keeps the post editor's
   * helper, the research door and the media picker's credits (with a policy).
   */
  test('the old agent doors are gone from /copilot', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'apps/backend/src/api/routes/copilot.controller.ts'),
      'utf8'
    );
    const routes = [...source.matchAll(/@(Get|Post|Put|Patch|Delete)\('([^']*)'\)/g)].map(
      ([, method, route]) => `${method.toUpperCase()} ${route}`
    );
    expect(routes.sort()).toEqual(['GET /credits', 'POST /chat', 'POST /research']);
    expect(source).not.toMatch(/@ag-ui\/mastra|MastraService|getLocalAgents/);
  });

  test('bridges the stable OpenAI chat API into the namespace CopilotKit 1.10 streams', async () => {
    hasAiProvider.mockResolvedValue(true);
    const stableChat = { completions: { stream: jest.fn() } };
    getOpenAiClient.mockResolvedValue({ chat: stableChat, beta: {} });
    const controller = new CopilotController(undefined, aiUsage, contexts);

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
      { research: webResearch },
      aiUsage,
      contexts
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
