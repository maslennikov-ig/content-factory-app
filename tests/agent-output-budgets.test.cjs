'use strict';

const { RunnableLambda } = require('@langchain/core/runnables');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

function graphFor(response) {
  const requests = [];
  const model = {
    withStructuredOutput: () => RunnableLambda.from(async () => response),
  };
  const { AgentGraphService } = loadWithMocks(
    'libraries/nestjs-libraries/src/agent/agent.graph.service.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': { PostsService: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/media/media.service': { MediaService: class {} },
      '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        getChatModel: async (organizationId, temperature, maxOutputTokens, role) => {
          requests.push({ organizationId, temperature, maxOutputTokens, role });
          return model;
        },
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
      '@contentfactory/nestjs-libraries/openai/web.research.service': { WebResearchService: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service': { ContentContextService: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service': { BrandProfileContextService: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service': { ContentSourceRegistryService: class {} },
    }
  );
  const posts = {
    findAllExistingCategories: jest.fn(async () => [{ category: 'Technology' }]),
    findAllExistingTopicsOfCategory: jest.fn(async () => [{ topic: 'Updates' }]),
  };
  return { service: new AgentGraphService(posts, {}, {}, {}, {}, {}, null, null), requests, posts };
}

const state = () => ({
  orgId: 'organization-a', language: 'en', format: 'one_long', tone: 'personal',
  category: 'Technology', messages: [{ content: 'Prepare a Telegram roundup of the supplied updates.' }],
  popularPosts: [], researchAvailable: false,
});

describe('graph service operations request explicit output budgets at the actual model factory', () => {
  test.each([
    ['findCategories', { category: 'Technology' }, 512, 'classify'],
    ['findTopic', { topic: 'Updates' }, 512, 'classify'],
    ['generateHook', { hook: 'What changed this week' }, 2048, 'adapt'],
  ])('%s requests its semantic model role and explicit output budget', async (method, response, expectedTokens, expectedRole) => {
    const { service, requests } = graphFor(response);
    expect(await service[method](state())).toEqual(response);
    expect(requests).toEqual([{
      organizationId: 'organization-a', temperature: 0.7,
      maxOutputTokens: expectedTokens, role: expectedRole,
    }]);
  });

  test('the complete-post budget still follows core size and the actual hard cap, independently of helper caps', async () => {
    const response = { content: { content: 'The complete roundup.' } };
    const { service, requests } = graphFor(response);
    const source = state();
    source.resolvedBrandProfile = { effectiveVoice: { postLength: { low: 40, median: 60, high: 80 } } };
    source.intake = {
      version: 'intake-hints/v3', core: 'A substantive supported update. '.repeat(200), material: [],
      brief: { thesis: 'Weekly updates', position: null, disagreement: null, audience: 'Readers', goal: 'Explain the updates' },
      channel: { providerIdentifier: 'telegram', integrationId: 'channel-a', maxLength: 4096,
        writingProfile: { lengthPolicy: { idealMin: 2000, idealMax: 3500, hardMax: 4000 } } },
    };
    expect(source.intake.core.length).toBeGreaterThan(4000);
    await service.generateContent(source);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ organizationId: 'organization-a', maxOutputTokens: 5256 });
  });
});
