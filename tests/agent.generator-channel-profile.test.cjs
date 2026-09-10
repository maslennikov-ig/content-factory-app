'use strict';

/**
 * The generator has two callers that can know the destination channel:
 * adaptation supplies the internal `intake` hints, while the ordinary post
 * window supplies only the tenant-scoped `integrationId`. Both must produce
 * the same channel directive block before the graph reaches a model.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const SERVICE =
  'libraries/nestjs-libraries/src/agent/agent.graph.service.ts';
const FRONTEND =
  'apps/frontend/src/components/launches/generator/generator.tsx';

const { channelInstructionLines } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/channel-directives.ts'
);
const { defaultWritingProfileFor } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
);

const { AgentGraphService } = loadWithMocks(SERVICE, {
  '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
    PostsService: class {},
  },
  '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': {
    IntegrationService: class {},
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
    getChatModel: async () => {
      throw new Error('no model call belongs in this suite');
    },
    getImageModel: async () => {
      throw new Error('no model call belongs in this suite');
    },
  },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
    AiUsageService: class {},
  },
  '@contentfactory/nestjs-libraries/openai/web.research.service': {
    WebResearchService: class {},
    WebSearchNotConfigured: class extends Error {},
  },
  '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service':
    { ContentContextService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
    { BrandProfileContextService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
    { ContentSourceRegistryService: class {} },
});

const profile = {
  ...defaultWritingProfileFor('telegram', 'ru'),
  lengthPolicy: { idealMin: 600, idealMax: 900, hardMax: 1200 },
  emojiLevel: 'many',
  linkPolicy: 'inline',
  hashtagPolicy: 'free',
  ctaKind: 'reply',
  formatPreference: 'case',
  notes: 'Показывать цену решения.',
};

const provider = {
  identifier: 'telegram',
  name: 'Telegram',
  maxLength: 4096,
  maxCaptionLength: 1024,
  editor: 'html',
};

const channelResponse = {
  integrationId: 'channel-1',
  providerIdentifier: 'telegram',
  provider: {
    name: 'Telegram',
    maxLength: 4096,
    maxCaptionLength: 1024,
    editor: 'html',
  },
  profile,
  stored: true,
};

const envelope = {
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'context-1',
  status: 'READY',
  generationPolicy: 'ALLOW_USER_ONLY',
  profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
  facts: [],
  evidence: [],
  rejected: [],
  errorCode: null,
  renderedCharacterCount: 0,
  selectionHash: 'selection-1',
};

const baseBody = (overrides = {}) => ({
  research: 'Показать цену решения читателю',
  isPicture: false,
  format: 'one_long',
  tone: 'company',
  language: 'ru',
  sourceIds: ['source-1'],
  ...overrides,
});

const intake = {
  version: 'intake-hints/v1',
  brief: {
    thesis: 'Тезис',
    position: 'Позиция',
    disagreement: 'Возражение',
    audience: 'Читатель',
  },
  formatHint: 'story',
  foreignShingles: ['чужие слова подряд'],
  channel: {
    integrationId: 'channel-1',
    providerIdentifier: 'telegram',
    maxLength: 4096,
    maxCaptionLength: 1024,
    editor: 'html',
    writingProfile: profile,
  },
};

const fakeGraph = (captured) => {
  const graph = {
    addNode: () => graph,
    addEdge: () => graph,
    addConditionalEdges: () => graph,
    compile: () => ({
      streamEvents: (input) => {
        captured.input = input;
        return (async function* emptyStream() {})();
      },
    }),
  };
  return graph;
};

const run = async ({ requestBody, integration }) => {
  const calls = [];
  const captured = {};
  const previousState = AgentGraphService.state;
  AgentGraphService.state = () => fakeGraph(captured);
  const service = new AgentGraphService(
    {},
    {},
    {
      research: async () => {
        throw new Error('web research must not run in this focused test');
      },
    },
    {
      executeAiStreamOperation: (_organizationId, _operation, factory) => {
        calls.push('model');
        factory();
        return (async function* emptyStream() {})();
      },
    },
    {
      build: async (organizationId, request) => {
        calls.push(['build', organizationId, request]);
        return envelope;
      },
    },
    { resolve: async () => ({ effectiveVoice: {} }) },
    null,
    { acceptSearchResult: async () => ({ evidenceId: 'evidence-1' }) },
    integration,
  );

  const events = [];
  try {
    for await (const event of service.start('org-a', requestBody)) {
      events.push(event);
    }
  } finally {
    AgentGraphService.state = previousState;
  }
  return { calls, captured, events };
};

describe('generator channel profile wiring', () => {
  test('ordinary generator looks up the selected channel in the tenant', async () => {
    const lookup = [];
    const result = await run({
      requestBody: baseBody({ integrationId: 'channel-1' }),
      integration: {
        getWritingProfile: async (...args) => {
          lookup.push(args);
          return channelResponse;
        },
      },
    });

    expect(lookup).toEqual([['org-a', 'channel-1']]);
    expect(result.calls[0]).toMatchObject([
      'build',
      'org-a',
      { provider: 'telegram' },
    ]);
    expect(result.captured.input.intake).toBeUndefined();
    expect(result.captured.input.channelLines).toEqual(
      channelInstructionLines(profile, provider, { withPicture: false })
    );
    expect(result.calls).toContain('model');
  });

  test('adaptation intake uses the same directive builder without a second lookup', async () => {
    const result = await run({
      requestBody: baseBody({ intake }),
      integration: {
        getWritingProfile: async () => {
          throw new Error('intake must already contain the channel');
        },
      },
    });

    expect(result.calls[0]).toMatchObject([
      'build',
      'org-a',
      { provider: 'telegram' },
    ]);
    expect(result.captured.input.channelLines).toEqual(
      channelInstructionLines(profile, provider, {
        withPicture: false,
        formatHint: 'story',
        foreignShingles: intake.foreignShingles,
      })
    );
  });

  test.each([
    ['missing', async () => null],
    [
      'foreign',
      async () => {
        throw { response: { code: 'INTEGRATION_NOT_FOUND' } };
      },
    ],
  ])('rejects a %s channel before building context or starting the model', async (_kind, getWritingProfile) => {
    const result = await run({
      requestBody: baseBody({ integrationId: 'channel-1' }),
      integration: { getWritingProfile },
    });

    expect(result.events).toEqual([
      {
        name: 'error',
        error: true,
        code: 'INTEGRATION_NOT_FOUND',
        message: 'The selected channel is unavailable.',
      },
    ]);
    expect(result.calls).toEqual([]);
    expect(result.captured.input).toBeUndefined();
  });
});

test('the normal generator caller forwards its selected calendar channel', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', FRONTEND),
    'utf8'
  );
  expect(source).toContain(
    'const { integrations, reloadCalendarView, integrationId } = useCalendar();'
  );
  expect(source).toContain(
    'const selectedIntegrationId = integrationId || integrations[0]?.id;'
  );
  expect(source).toContain('integrationId: selectedIntegrationId');
});
