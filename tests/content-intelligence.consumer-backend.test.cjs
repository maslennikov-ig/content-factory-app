const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = globalThis.test || require('node:test');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const context = (overrides = {}) => ({
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'context-1',
  status: 'READY',
  generationPolicy: 'ALLOW_GROUNDED',
  errorCode: null,
  builtAt: '2026-08-20T10:00:00.000Z',
  expiresAt: '2026-08-20T10:15:00.000Z',
  profile: {
    mode: 'resolved',
    versionId: 'profile-version-1',
    versionNumber: 3,
    contentDigest: 'digest-1',
  },
  facts: [
    {
      citationId: 'F1',
      factId: 'fact-1',
      statement: 'Stored verified fact',
      temporalKind: 'CURRENT',
      verifiedAt: '2026-08-20T09:00:00.000Z',
      freshUntil: '2026-08-21T09:00:00.000Z',
      evidenceCitationIds: ['E1'],
    },
  ],
  evidence: [
    {
      citationId: 'E1',
      evidenceId: 'evidence-1',
      sourceSnapshotId: 'source-snapshot-1',
      title: 'Stored source',
      excerpt: 'Stored excerpt',
      url: 'https://example.com/source',
      exposure: 'PUBLIC',
      publishedAt: '2026-08-20T08:00:00.000Z',
      retrievedAt: '2026-08-20T09:00:00.000Z',
    },
  ],
  rejected: [],
  renderedCharacterCount: 64,
  selectionHash: 'selection-1',
  ...overrides,
});

function loadSchedulePostTool() {
  const created = [];
  const integration = {
    id: 'integration-internal-1',
    providerIdentifier: 'linkedin',
  };
  const { IntegrationSchedulePostTool } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/chat/tools/integration.schedule.post.ts',
    {
      '@contentfactory/nestjs-libraries/chat/agent.tool.interface': {},
      '@mastra/core/tools': { createTool: (configuration) => configuration },
      '@nestjs/common': { Injectable: () => (target) => target },
      '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
        { IntegrationService: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
        PostsService: class {},
      },
      '@contentfactory/nestjs-libraries/services/make.is': {
        makeId: () => 'server-id',
      },
      '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/all.providers.settings':
        {},
      '@prisma/client': {},
      '@contentfactory/nestjs-libraries/chat/auth.context': {
        checkAuth: () => undefined,
      },
      '@contentfactory/helpers/utils/valid.url.path': {
        ValidUrlExtension: class {
          validate() {
            return true;
          }
          defaultMessage() {
            return 'invalid extension';
          }
        },
        ValidUrlPath: class {
          validate() {
            return true;
          }
          defaultMessage() {
            return 'invalid path';
          }
        },
      },
    }
  );
  const tool = new IntegrationSchedulePostTool(
    {
      validatePosts: async () => [
        {
          name: 'LinkedIn',
          emptyContent: false,
          valid: true,
          errors: true,
          tooLong: false,
          maximumCharacters: 3000,
        },
      ],
      createPost: async (organizationId, body, creationMethod) => {
        created.push({ organizationId, body, creationMethod });
        return [{ postId: 'post-1', integration: 'linkedin' }];
      },
    },
    { getIntegrationById: async () => integration }
  ).run();
  return { tool, created };
}

const schedulePostInput = (type, citationIds) => ({
  socialPost: [
    {
      integrationId: 'integration-public-1',
      isPremium: false,
      date: '2026-08-20T12:00:00.000Z',
      shortLink: false,
      type,
      postsAndComments: [
        {
          content: '<p>Grounded draft</p>',
          attachments: [],
          ...(citationIds ? { citationIds } : {}),
        },
      ],
      settings: [],
    },
  ],
});

const toolRequestContext = (values) => ({
  get(key) {
    return {
      organization: JSON.stringify({ id: 'org-a' }),
      ...values,
    }[key];
  },
});

test('generic schedule tool keeps schedule/now behavior without a content context', async () => {
  const { tool, created } = loadSchedulePostTool();
  const input = tool.inputSchema.parse(schedulePostInput('schedule'));

  const result = await tool.execute(input, {
    requestContext: toolRequestContext({}),
  });

  assert.deepEqual(result, {
    output: [{ postId: 'post-1', integration: 'linkedin' }],
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].body.type, 'schedule');
  assert.equal(
    Object.hasOwn(created[0].body.posts[0], 'contentContextSnapshotId'),
    false
  );
  assert.equal(
    Object.hasOwn(created[0].body.posts[0].value[0], 'usedCitationIds'),
    false
  );
});

test('content-intelligence schedule tool explicitly rejects non-draft actions', async () => {
  const { tool, created } = loadSchedulePostTool();
  const input = tool.inputSchema.parse(schedulePostInput('schedule'));

  const result = await tool.execute(input, {
    requestContext: toolRequestContext({
      contentIntelligenceMode: 'content-intelligence/v1',
      contentContext: JSON.stringify(context()),
    }),
  });

  assert.deepEqual(result, {
    errors: 'Content-intelligence mode only supports draft output.',
  });
  assert.equal(created.length, 0);
});

test('content-intelligence schedule tool persists only server context ids and allowed per-item citations', async () => {
  const { tool, created } = loadSchedulePostTool();
  const requestContext = toolRequestContext({
    contentIntelligenceMode: 'content-intelligence/v1',
    contentContext: JSON.stringify(context()),
  });

  const forged = await tool.execute(schedulePostInput('draft', ['OTHER']), {
    requestContext,
  });
  assert.deepEqual(forged, {
    errors: 'Unknown content-context citation id.',
  });
  assert.equal(created.length, 0);

  await tool.execute(schedulePostInput('draft', ['F1', 'E1', 'F1']), {
    requestContext,
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].body.type, 'draft');
  assert.equal(created[0].body.posts[0].contentContextSnapshotId, 'context-1');
  assert.equal(
    created[0].body.posts[0].brandProfileVersionId,
    'profile-version-1'
  );
  assert.deepEqual(created[0].body.posts[0].value[0].usedCitationIds, [
    'F1',
    'E1',
  ]);
});

function loadAgent({ build, admit }) {
  class StateGraph {
    addNode() {
      return this;
    }
    addEdge() {
      return this;
    }
    addConditionalEdges() {
      return this;
    }
    compile() {
      return {
        async *streamEvents(input) {
          yield { name: 'post-time', data: { output: input } };
        },
      };
    }
  }
  return loadTypeScriptModule(
    'libraries/nestjs-libraries/src/agent/agent.graph.service.ts',
    {
      '@langchain/core/messages': {
        BaseMessage: class {},
        HumanMessage: class {
          constructor(content) {
            this.content = content;
          }
        },
      },
      '@langchain/langgraph': { END: 'END', START: 'START', StateGraph },
      '@langchain/core/prompts': { ChatPromptTemplate: {} },
      '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
        PostsService: class {},
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
        getChatModel: () => {
          throw new Error('model must not run');
        },
        getImageModel: () => {
          throw new Error('image must not run');
        },
      },
      '@contentfactory/nestjs-libraries/dtos/content.language': {
        contentLanguageInstruction: () => '',
        localizedVocabulary: () => [],
      },
      '@contentfactory/nestjs-libraries/agent/agent.categories': {
        agentCategoriesByLanguage: { en: [], ru: [] },
      },
      '@contentfactory/nestjs-libraries/agent/agent.topics': {
        agentTopicsByLanguage: { en: [], ru: [] },
      },
      '@contentfactory/nestjs-libraries/openai/web.research.service': {
        WebResearchService: class {},
        WebSearchNotConfigured: class extends Error {},
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
        AiUsageService: class {},
      },
      '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service':
        { ContentContextService: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.types':
        {},
      '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
        { BrandProfileContextService: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/contracts': {},
    },
    {
      /**
       * Loaded for real rather than stubbed. Every module here is pure — no
       * database, no network, no model — and together they are what turns a
       * resolved profile into the lines the generator is given. A stub would
       * make the provenance assertions below agree with the stub instead of
       * with the product.
       *
       * The relative entries are the loader's requirement, not a choice: it
       * does not follow relative imports, so a file reached through `sources`
       * has to bring its own neighbours. These six are the closure of
       * `draft-gaps` and `locale-pack`, and none of them imports anything but
       * a sibling or a type.
       */
      sources: {
        '@contentfactory/nestjs-libraries/agent/voice-directives':
          'libraries/nestjs-libraries/src/agent/voice-directives.ts',
        '@contentfactory/nestjs-libraries/agent/draft-pick':
          'libraries/nestjs-libraries/src/agent/draft-pick.ts',
        '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/post-length':
          'libraries/nestjs-libraries/src/content-intelligence/brand-voice/post-length.ts',
        '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/draft-gaps':
          'libraries/nestjs-libraries/src/content-intelligence/brand-voice/draft-gaps.ts',
        '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/locale-pack':
          'libraries/nestjs-libraries/src/content-intelligence/brand-voice/locale-pack.ts',
        './post-habits':
          'libraries/nestjs-libraries/src/content-intelligence/brand-voice/post-habits.ts',
        './segment':
          'libraries/nestjs-libraries/src/content-intelligence/brand-voice/segment.ts',
        './locale-pack':
          'libraries/nestjs-libraries/src/content-intelligence/brand-voice/locale-pack.ts',
        './locale-pack.ru':
          'libraries/nestjs-libraries/src/content-intelligence/brand-voice/locale-pack.ru.ts',
        './locale-pack.en':
          'libraries/nestjs-libraries/src/content-intelligence/brand-voice/locale-pack.en.ts',
      },
    }
  ).AgentGraphService;
}

test('generator builds one tenant context before AI admission and streams exact server provenance', async () => {
  let builds = 0;
  let admissions = 0;
  const AgentGraphService = loadAgent({});
  const service = new AgentGraphService(
    {},
    {},
    {
      research: () => {
        throw new Error('legacy research must not run');
      },
    },
    {
      async *executeAiStreamOperation(_org, _operation, factory) {
        admissions += 1;
        yield* await factory();
      },
    },
    {
      build: async () => {
        builds += 1;
        return context();
      },
    },
    { resolve: async () => ({ effectiveVoice: { tone: 'precise' } }) }
  );
  const iterator = service.start('org-a', {
    research: 'A grounded request',
    isPicture: false,
    format: 'one_short',
    tone: 'company',
    language: 'en',
  });

  const first = await iterator.next();
  assert.equal(builds, 1);
  assert.equal(admissions, 0);
  assert.deepEqual(first.value, {
    name: 'content-context',
    data: {
      output: {
        contentContextSnapshotId: 'context-1',
        brandProfileVersionId: 'profile-version-1',
        brandProfileSelection: context().profile,
        contentContextStatus: 'READY',
        generationPolicy: 'ALLOW_GROUNDED',
        selectionHash: 'selection-1',
      },
    },
  });
  const second = await iterator.next();
  assert.equal(builds, 1);
  assert.equal(admissions, 1);

  /**
   * The voice the model works from is the server's, and the caller's `tone`
   * does not become it.
   *
   * This used to read the voice out of `contextText` as serialized JSON. That
   * stopped being where it lives on 2026-08-25, when the voice became
   * instruction lines built from `resolvedBrandProfile` instead of a blob
   * pasted into the context block — `agent.voice-directives`,
   * `agent.persona-block` and `generator.voice-single-source` cover that
   * rendering. The regex went on matching nothing and reported it as a
   * mismatch, so this line asserted an old shape rather than the invariant.
   *
   * The invariant is the same one, at the seam this suite owns: the resolver's
   * answer reaches the graph whole, and the client's `tone: 'company'` sits
   * beside it without replacing it. `deepEqual` rather than a substring, so an
   * extra field cannot slip through unnoticed.
   */
  assert.deepEqual(second.value.data.output.resolvedBrandProfile, {
    effectiveVoice: { tone: 'precise' },
  });
  assert.equal(second.value.data.output.tone, 'company');

  // And the built context is what reached the prompt, not a re-fetch.
  assert.match(second.value.data.output.contextText, /\[F1\] FACT \(CURRENT/);
});

test('generator current-required failure makes zero AI and WebResearch calls', async () => {
  let admissions = 0;
  let researchCalls = 0;
  const AgentGraphService = loadAgent({});
  const service = new AgentGraphService(
    {},
    {},
    {
      research: async () => {
        researchCalls += 1;
      },
    },
    {
      executeAiStreamOperation: () => {
        admissions += 1;
      },
    },
    {
      build: async () =>
        context({
          status: 'BLOCKED_STALE',
          generationPolicy: 'EVIDENCE_REQUIRED',
          errorCode: 'CONTENT_EVIDENCE_REQUIRED',
        }),
    },
    {
      resolve: async () => {
        throw new Error('profile must not resolve');
      },
    }
  );
  const blocked = await service
    .start('org-a', {
      research: 'Current data',
      isPicture: false,
      format: 'one_short',
      tone: 'company',
      language: 'en',
      freshnessMode: 'REQUIRE_CURRENT',
    })
    .next();
  assert.equal(blocked.value.name, 'error');
  assert.equal(blocked.value.code, 'CONTENT_EVIDENCE_REQUIRED');
  assert.equal(admissions, 0);
  assert.equal(researchCalls, 0);
});

test('Post group read is tenant-scoped and returns safe immutable provenance metadata', async () => {
  let query;
  const { PostsRepository } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaRepository: class {},
        PrismaTransaction: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': {
        Post: class {},
      },
      '@prisma/client': {
        APPROVED_SUBMIT_FOR_ORDER: { NO: 'NO' },
        CreationMethod: {},
        State: {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': {
        GetPostsDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': {
        GetPostsListDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': {
        CreateTagDto: class {},
      },
      '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload':
        { safeErrorLedgerPayload: () => ({}) },
    },
    {
      sources: {
        '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize':
          'libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts',
        './content-context.errors':
          'libraries/nestjs-libraries/src/content-intelligence/context/content-context.errors.ts',
      },
    }
  );
  const repository = new PostsRepository(
    {
      model: {
        post: {
          findMany: async (value) => {
            query = value;
            return [
              {
                id: 'post-1',
                organizationId: 'org-a',
                contentOutputContexts: [
                  {
                    contentContextSnapshotId: 'context-1',
                    brandProfileVersionId: 'profile-1',
                    usedCitationIds: ['F1'],
                    validationStatus: 'VALID',
                    snapshot: {
                      id: 'context-1',
                      status: 'READY',
                      builtAt: new Date(0),
                      expiresAt: new Date(1),
                    },
                    brandProfileVersion: {
                      id: 'profile-1',
                      label: 'Voice',
                      versionNumber: 2,
                      lifecycle: 'PUBLISHED',
                    },
                  },
                ],
              },
            ];
          },
        },
      },
    },
    {},
    {},
    {},
    {},
    {},
    {}
  );
  const [post] = await repository.getPostsByGroup('org-a', 'group-a');
  assert.equal(query.where.organizationId, 'org-a');
  assert.equal(
    query.include.contentOutputContexts.where.organizationId,
    'org-a'
  );
  assert.equal(post.contentOutputContext.contentContextSnapshotId, 'context-1');
  assert.deepEqual(post.contentOutputContext.usedCitationIds, ['F1']);
  assert.equal(post.contentOutputContext.context.status, 'READY');
  assert.equal(post.contentOutputContext.profile.lifecycle, 'PUBLISHED');
  assert.equal('contentOutputContexts' in post, false);
});

function loadAutopostService({ generated, modelCalls }) {
  const contentLanguage = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/dtos/content.language.ts'
  );
  return loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.repository':
        { AutopostRepository: class {} },
      '@contentfactory/nestjs-libraries/dtos/autopost/autopost.dto': {
        AutopostDto: class {},
        AutopostDraftV2Dto: class {},
      },
      '@langchain/langgraph': {
        END: 'END',
        START: 'START',
        StateGraph: class {},
      },
      '@langchain/core/messages': { BaseMessage: class {} },
      '@langchain/openai': { ChatOpenAI: class {}, DallEAPIWrapper: class {} },
      '@langchain/core/prompts': {
        ChatPromptTemplate: {
          fromTemplate: () => ({
            pipe: () => ({ invoke: async () => generated }),
          }),
        },
      },
      '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
        PostsService: class {},
      },
      'rss-parser': { __esModule: true, default: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
        { IntegrationService: class {} },
      '@contentfactory/nestjs-libraries/services/make.is': {
        makeId: () => 'id',
      },
      'nestjs-temporal-core': { TemporalService: class {} },
      '@temporalio/common': { TypedSearchAttributes: class {} },
      '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': {
        organizationId: 'organizationId',
      },
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        getChatModel: async () => {
          modelCalls.count += 1;
          return { withStructuredOutput: () => ({}) };
        },
        getImageModel: async () => {
          throw new Error('image model must not run');
        },
      },
      '@contentfactory/nestjs-libraries/integrations/integration.manager': {
        IntegrationManager: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/content.language': contentLanguage,
      '@contentfactory/nestjs-libraries/openai/web.research.service': {
        WebResearchService: class {},
        WebSearchNotConfigured: class extends Error {},
      },
      '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.fetch': {
        fetchSafePublicHttpsUrl: async () => {
          throw new Error('network must not run');
        },
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
        AiUsageService: class {},
      },
      '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service':
        { ContentContextService: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.types':
        {},
      '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository':
        { BrandProfileRepository: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
        { BrandProfileContextService: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/contracts': {},
      '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository':
        { PostsRepository: class {} },
    },
    {
      // Same reason as in `loadAgentGraphService`: the real, pure module.
      sources: {
        '@contentfactory/nestjs-libraries/agent/voice-directives':
          'libraries/nestjs-libraries/src/agent/voice-directives.ts',
      },
    }
  ).AutopostService;
}

function v2Record() {
  return {
    id: 'autopost-1',
    organizationId: 'org-a',
    title: 'News',
    content: '',
    language: 'en',
    active: true,
    requiresAttention: false,
    generateContent: true,
    brandProfileVersionId: 'profile-version-1',
    integrations: JSON.stringify([{ id: 'channel-1' }]),
    lastUrl: '',
    contentSource: {
      id: 'source-1',
      organizationId: 'org-a',
      desiredState: 'ACTIVE',
      currentSnapshotId: 'source-snapshot-1',
      archivedAt: null,
      purgedAt: null,
    },
  };
}

test('AutoPost V2 configuration retry upserts one deterministic tenant/source row', async () => {
  const { AutopostRepository } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.repository.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaRepository: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/autopost/autopost.dto': {
        AutopostDto: class {},
        AutopostDraftV2Dto: class {},
      },
    }
  );
  const writes = [];
  const client = {
    contentSource: { findFirst: async () => ({ id: 'source-1' }) },
    autoPost: {
      upsert: async (input) => {
        writes.push(input);
        return { id: input.where.organizationId_id.id };
      },
    },
  };
  const repository = new AutopostRepository({});
  const body = {
    contentSourceId: 'source-1',
    brandProfileVersionId: 'profile-1',
    url: 'https://example.com/feed',
    title: 'Feed',
    integrations: [],
    active: true,
    content: '',
    generateContent: true,
    language: 'en',
    addPicture: false,
    syncLast: false,
    onSlot: true,
  };
  const first = await repository.createAutopostDraftV2(client, 'org-a', body);
  const second = await repository.createAutopostDraftV2(client, 'org-a', {
    ...body,
    brandProfileVersionId: 'profile-2',
  });
  assert.equal(first.id, second.id);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].update.brandProfileVersionId, 'profile-2');
  assert.equal(writes[1].update.requiresAttention, false);
});

test('AutoPost V2 blocked current evidence marks attention before AI admission', async () => {
  const modelCalls = { count: 0 };
  const AutopostService = loadAutopostService({ generated: {}, modelCalls });
  let admissions = 0;
  let marked = 0;
  const service = new AutopostService(
    {
      getAutopostDraftV2: async () => v2Record(),
      markDraftV2RequiresAttention: async () => {
        marked += 1;
      },
    },
    {},
    {},
    {},
    {},
    {
      research: async () => {
        throw new Error('legacy research must not run');
      },
    },
    {
      executeAiOperation: async () => {
        admissions += 1;
      },
    },
    {
      build: async () =>
        context({
          status: 'BLOCKED_STALE',
          generationPolicy: 'EVIDENCE_REQUIRED',
          errorCode: 'CONTENT_EVIDENCE_REQUIRED',
        }),
    },
    {},
    {},
    {
      createAutopostV2DraftAtomic: async () => {
        throw new Error('draft must not run');
      },
    }
  );
  const result = await service.startAutopostDraftV2('org-a', 'autopost-1');
  assert.equal(result.errorCode, 'CONTENT_EVIDENCE_REQUIRED');
  assert.equal(marked, 1);
  assert.equal(admissions, 0);
  assert.equal(modelCalls.count, 0);
});

test('AutoPost V2 builds once from the tenant source and atomically writes exact draft provenance before marker', async () => {
  const modelCalls = { count: 0 };
  const AutopostService = loadAutopostService({
    generated: { content: 'Grounded draft', usedCitationIds: ['F1', 'E1'] },
    modelCalls,
  });
  let buildInput;
  let atomicInput;
  let admissions = 0;
  const service = new AutopostService(
    {
      getAutopostDraftV2: async () => v2Record(),
      markDraftV2RequiresAttention: async () => {
        throw new Error('must not mark');
      },
    },
    {},
    {
      getIntegrationsList: async () => [
        { id: 'channel-1', providerIdentifier: 'telegram' },
      ],
    },
    { findFreeDateTime: async () => '2026-08-20T12:00:00' },
    {},
    {},
    {
      executeAiOperation: async (_org, _operation, callback) => {
        admissions += 1;
        return callback();
      },
    },
    {
      build: async (org, input) => {
        buildInput = { org, input };
        return context();
      },
    },
    { resolve: async () => ({ effectiveVoice: { tone: 'precise' } }) },
    {},
    {
      createAutopostV2DraftAtomic: async (input) => {
        atomicInput = input;
        return { created: true, posts: [{ id: 'post-1' }] };
      },
    }
  );
  const result = await service.startAutopostDraftV2('org-a', 'autopost-1');
  assert.equal(result.type, 'draft');
  assert.equal(result.created, true);
  assert.equal(buildInput.org, 'org-a');
  assert.deepEqual(buildInput.input.sourceIds, ['source-1']);
  assert.deepEqual(buildInput.input.brandProfileSelection, {
    mode: 'version',
    versionId: 'profile-version-1',
  });
  assert.equal(buildInput.input.freshnessMode, 'REQUIRE_CURRENT');
  assert.equal(admissions, 1);
  assert.equal(modelCalls.count, 1);
  assert.equal(atomicInput.sourceSnapshotId, 'source-snapshot-1');
  assert.equal(atomicInput.posts[0].contentContextSnapshotId, 'context-1');
  assert.equal(atomicInput.posts[0].brandProfileVersionId, 'profile-version-1');
  assert.deepEqual(atomicInput.posts[0].value[0].usedCitationIds, ['F1', 'E1']);
});

test('AutoPost V2 creation uses the shared serializable profile pin before starting its versioned workflow', async () => {
  const modelCalls = { count: 0 };
  const AutopostService = loadAutopostService({ generated: {}, modelCalls });
  const transactionClient = { token: 'tx' };
  const order = [];
  const service = new AutopostService(
    {
      createAutopostDraftV2: async (client, org, body) => {
        order.push(['write', client, org, body.brandProfileVersionId]);
        return { id: 'autopost-1' };
      },
    },
    {
      client: {
        getRawClient: () => ({
          workflow: {
            start: async (name) => {
              order.push(['workflow', name]);
            },
          },
        }),
      },
    },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {
      withPinnedPublishedVersionWrite: async (org, version, write) => {
        order.push(['pin', org, version]);
        return write(transactionClient);
      },
    },
    {}
  );
  await service.createAutopostDraftV2('org-a', {
    brandProfileVersionId: 'profile-version-1',
    contentSourceId: 'source-1',
    active: true,
  });
  assert.deepEqual(order[0], ['pin', 'org-a', 'profile-version-1']);
  assert.deepEqual(order[1].slice(0, 3), ['write', transactionClient, 'org-a']);
  assert.deepEqual(order[2], ['workflow', 'autoPostDraftV2Workflow']);
});

test('AutoPost V2 workflow-start failure leaves a visible requires-attention row', async () => {
  const modelCalls = { count: 0 };
  const AutopostService = loadAutopostService({ generated: {}, modelCalls });
  let marked = 0;
  const service = new AutopostService(
    {
      createAutopostDraftV2: async () => ({ id: 'autopost-1' }),
      markDraftV2RequiresAttention: async () => {
        marked += 1;
      },
    },
    { client: { getRawClient: () => undefined } },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {
      withPinnedPublishedVersionWrite: async (_org, _version, write) =>
        write({}),
    },
    {}
  );

  await assert.rejects(
    service.createAutopostDraftV2('org-a', {
      brandProfileVersionId: 'profile-version-1',
      contentSourceId: 'source-1',
      active: true,
    }),
    (error) =>
      error.code === 'AUTOPOST_V2_WORKFLOW_UNAVAILABLE' && error.status === 503
  );
  assert.equal(marked, 1);
});

test('AutoPost V1 stays byte-untouched while V2 names a separate draft-only workflow and pin protocol', () => {
  const root = path.resolve(__dirname, '..');
  const workflow = fs.readFileSync(
    path.join(
      root,
      'apps/orchestrator/src/workflows/autopost-draft-v2.workflow.ts'
    ),
    'utf8'
  );
  const activity = fs.readFileSync(
    path.join(
      root,
      'apps/orchestrator/src/activities/autopost-draft-v2.activity.ts'
    ),
    'utf8'
  );
  const service = fs.readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts'
    ),
    'utf8'
  );
  assert.match(workflow, /autoPostDraftV2Workflow/);
  assert.match(activity, /class AutopostDraftV2Activity/);
  assert.match(activity, /startAutopostDraftV2/);
  assert.match(service, /withPinnedPublishedVersionWrite/);
  assert.match(service, /type:\s*'draft'/);
  assert.match(service, /CONTENT_EVIDENCE_REQUIRED/);
});
