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

class WebSearchNotConfigured extends Error {}
const research = jest.fn();

const { WebResearchTool } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/tools/web.research.tool.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        warn() {}
      },
    },
    '@mastra/core/tools': { createTool: (specification) => specification },
    '@contentfactory/nestjs-libraries/chat/auth.context': {
      checkAuth: jest.fn(),
    },
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
      WebSearchNotConfigured,
    },
  }
);

const context = {
  requestContext: {
    get: () => JSON.stringify({ id: 'organization-a' }),
  },
};

describe('chat web research tool', () => {
  beforeEach(() => research.mockReset());

  test('returns cited research for the authenticated organization', async () => {
    research.mockResolvedValue({
      summary: 'Summary',
      facts: [{ text: 'Fact', sourceUrl: 'https://example.com' }],
      sources: [
        {
          title: 'Source',
          url: 'https://example.com',
          publishedAt: '2026-08-12',
        },
      ],
    });
    const tool = new WebResearchTool({ research }).run();

    await expect(
      tool.execute({ subject: 'Local transport changes' }, context)
    ).resolves.toMatchObject({ available: true, summary: 'Summary' });
    expect(research).toHaveBeenCalledWith(
      'organization-a',
      'Local transport changes'
    );
  });

  test('reports disabled search without promising current information', async () => {
    research.mockRejectedValue(new WebSearchNotConfigured());
    const tool = new WebResearchTool({ research }).run();

    const result = await tool.execute({ subject: 'Topic' }, context);

    expect(result.available).toBe(false);
    expect(result.error).toContain('disabled');
    expect(result.error).toContain('current information');
  });

  test('a failing search provider is reported, not thrown at the chat', async () => {
    research.mockRejectedValue(
      Object.assign(new Error('429 Too Many Requests'), { status: 429 })
    );
    const tool = new WebResearchTool({ research }).run();

    const result = await tool.execute({ subject: 'Topic' }, context);

    expect(result.available).toBe(false);
    expect(result.error).toContain('current information');
    expect(result.error).not.toContain('disabled');
  });
});
