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

let agentConfiguration;
class Agent {
  constructor(configuration) {
    agentConfiguration = configuration;
  }
}

const contentLanguage = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content.language.ts'
);
const requireActiveAiConfig = jest.fn();
const getAiSdkProvider = jest.fn();
const serializedContentContext = JSON.stringify({
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'context-1',
  generationPolicy: 'ALLOW_GROUNDED',
  profile: {
    mode: 'resolved',
    versionId: 'profile-version-1',
    contentDigest: 'digest-1',
  },
  facts: [],
  evidence: [],
});
const serializedBrandProfile = JSON.stringify({
  applied: {
    mode: 'profile',
    versionId: 'profile-version-1',
    contentDigest: 'digest-1',
  },
  effectiveVoice: { tone: 'precise' },
});

const { LoadToolsService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/load.tools.service.ts',
  {
    '@mastra/core/agent': { Agent },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      requireActiveAiConfig,
    },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      getAiSdkProvider,
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      AiUsageService: class {},
    },
    '@mastra/memory': { Memory: class {} },
    '@contentfactory/nestjs-libraries/chat/mastra.store': { pStore: {} },
    '@nestjs/core': { ModuleRef: class {} },
    '@contentfactory/nestjs-libraries/chat/tools/tool.list': { toolList: [] },
    '@contentfactory/nestjs-libraries/dtos/content.language': contentLanguage,
  }
);

describe('chat agent content language', () => {
  test('writes in the explicit Russian language from request context', async () => {
    const service = new LoadToolsService({});
    service.loadTools = async () => ({});
    await service.agent();
    const requestContext = {
      get(key) {
        return {
          ui: 'true',
          contentLanguage: 'ru',
          contentIntelligenceMode: 'content-intelligence/v1',
          contentContext: serializedContentContext,
          brandProfileContext: serializedBrandProfile,
        }[key];
      },
    };

    const instructions = agentConfiguration.instructions({ requestContext });

    expect(instructions).toContain(
      'Write every human-readable part of the post in Russian.'
    );
    expect(instructions).toContain('"tone":"precise"');
  });

  test('wraps real Mastra model execution instead of closing usage at model construction', async () => {
    const providerModel = {
      specificationVersion: 'v2',
      doGenerate: jest.fn(),
      doStream: jest.fn(),
    };
    const wrappedModel = { wrapped: true };
    const usage = {
      prepareModelExecution: jest.fn(
        async (_organizationId, _operation, factory) => {
          expect(await factory()).toBe(providerModel);
          return wrappedModel;
        }
      ),
    };
    const service = new LoadToolsService({}, usage);
    service.loadTools = async () => ({});
    await service.agent();
    const requestContext = {
      get(key) {
        return key === 'organization'
          ? JSON.stringify({ id: 'organization-a' })
          : undefined;
      },
    };
    requireActiveAiConfig.mockResolvedValue({ textModel: 'managed-text' });
    getAiSdkProvider.mockResolvedValue(() => providerModel);

    await expect(agentConfiguration.model({ requestContext })).resolves.toBe(
      wrappedModel
    );
    expect(usage.prepareModelExecution).toHaveBeenCalledWith(
      'organization-a',
      'copilot_chat',
      expect.any(Function)
    );
  });

  test('keeps generic agent instructions free of content-intelligence restrictions', async () => {
    const service = new LoadToolsService({});
    service.loadTools = async () => ({});
    await service.agent();
    const requestContext = {
      get(key) {
        return key === 'contentLanguage' ? 'en' : undefined;
      },
    };

    const instructions = agentConfiguration.instructions({ requestContext });

    expect(instructions).not.toContain('server content context');
    expect(instructions).not.toContain('creates drafts only');
  });

  test('rejects a missing server context before model admission', async () => {
    getAiSdkProvider.mockClear();
    const usage = { prepareModelExecution: jest.fn() };
    const service = new LoadToolsService({}, usage);
    service.loadTools = async () => ({});
    await service.agent();
    const requestContext = {
      get(key) {
        return key === 'organization'
          ? JSON.stringify({ id: 'organization-a' })
          : key === 'contentIntelligenceMode'
          ? 'content-intelligence/v1'
          : undefined;
      },
    };

    await expect(agentConfiguration.model({ requestContext })).rejects.toThrow(
      'server-issued content context'
    );
    expect(usage.prepareModelExecution).not.toHaveBeenCalled();
    expect(getAiSdkProvider).not.toHaveBeenCalled();
  });
});
