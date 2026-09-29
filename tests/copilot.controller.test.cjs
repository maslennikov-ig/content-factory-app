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
const subscriptions = { checkCredits: jest.fn(async () => ({ credits: 7 })) };
const { CopilotController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/copilot.controller.ts',
  {
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: noOpDecorator,
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: noOpDecorator,
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service':
      { SubscriptionService: class {} },
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
        Sections: { AI: 'AI', EDITOR: 'EDITOR' },
      },
  }
);

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'apps/backend/src/api/routes/copilot.controller.ts'),
  'utf8'
);

describe('CopilotController', () => {
  beforeEach(() => {
    contexts.build.mockClear();
    subscriptions.checkCredits.mockClear();
  });

  /**
   * The old agent screen's doors went with it (`content-factory-next-kcxz.8`),
   * and the post editor's CopilotKit helper `POST /copilot/chat` with W6
   * (`content-factory-next-kcxz.28`). `/copilot` keeps the research door and
   * the media picker's credits (with a policy, D8).
   */
  test('only the credits and research doors are left on /copilot', () => {
    const routes = [...SOURCE.matchAll(/@(Get|Post|Put|Patch|Delete)\('([^']*)'\)/g)].map(
      ([, method, route]) => `${method.toUpperCase()} ${route}`
    );
    expect(routes.sort()).toEqual(['GET /credits', 'POST /research']);
    expect(SOURCE).not.toMatch(/@ag-ui\/mastra|MastraService|getLocalAgents/);
    expect(SOURCE).not.toMatch(/@copilotkit|copilotRuntime|beta\.chat|copilot_chat/);
  });

  test('the credits door still answers the media picker, for the caller’s organization', async () => {
    const controller = new CopilotController(undefined, contexts, subscriptions);
    const organization = { id: 'organization-a' };

    await expect(controller.calculateCredits(organization, 'ai_videos')).resolves.toEqual({
      credits: 7,
    });
    expect(subscriptions.checkCredits).toHaveBeenCalledWith(organization, 'ai_videos');

    await controller.calculateCredits(organization, undefined);
    expect(subscriptions.checkCredits).toHaveBeenLastCalledWith(organization, 'ai_images');
    // The picker's own request is unchanged (`ai.video.tsx`).
    const picker = fs.readFileSync(
      path.resolve(__dirname, '..', 'apps/frontend/src/components/launches/ai.video.tsx'),
      'utf8'
    );
    expect(picker).toMatch(/\/copilot\/credits\?type=ai_videos/);
    expect(SOURCE).toMatch(/@Get\('\/credits'\)\s*\n\s*@CheckPolicies\(\[AuthorizationActions\.Create, Sections\.AI\]\)/);
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
      contexts,
      subscriptions
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
