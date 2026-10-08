'use strict';

require('reflect-metadata');

const { BadRequestException } = require('@nestjs/common');
const dayjs = require('dayjs');
const { RunnableLambda } = require('@langchain/core/runnables');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const {
  loadIntegrationService,
} = require('./helpers/integration-service.module.cjs');

const BASE = '@contentfactory/nestjs-libraries/';
const NOW = new Date('2026-10-02T10:10:30.000Z');
const MAX_DAY = 366;
const emptyClass = class {};
const prismaPorts = {
  [`${BASE}database/prisma/prisma.service`]: {
    PrismaRepository: emptyClass,
    PrismaTransaction: emptyClass,
  },
  [`${BASE}redis/redis.service`]: { ioRedis: {} },
  bcrypt: {
    hashSync: () => {
      throw new Error('No authentication belongs in this fixture');
    },
  },
};
const noStorage = { UploadFactory: { createStorage: () => ({}) } };
const loadSafeGraph = (chatModel) =>
  loadWithMocks('libraries/nestjs-libraries/src/agent/agent.graph.service.ts', {
    ...prismaPorts,
    [`${BASE}database/prisma/posts/posts.service`]: {
      PostsService: emptyClass,
    },
    [`${BASE}database/prisma/integrations/integration.service`]: {
      IntegrationService: emptyClass,
    },
    [`${BASE}database/prisma/media/media.service`]: {
      MediaService: emptyClass,
    },
    [`${BASE}upload/upload.factory`]: noStorage,
    [`${BASE}openai/ai.clients`]: {
      getChatModel: async () => chatModel,
      getImageModel: () => {
        throw new Error('No image call is allowed');
      },
    },
    [`${BASE}openai/generation.error`]: { generationError: (error) => error },
    [`${BASE}openai/ai.usage.service`]: { AiUsageService: emptyClass },
    [`${BASE}openai/web.research.service`]: {
      WebResearchService: emptyClass,
      WebSearchNotConfigured: class extends Error {},
    },
    [`${BASE}content-intelligence/context/content-context.service`]: {
      ContentContextService: emptyClass,
    },
    [`${BASE}content-intelligence/brand-profile/brand-profile.context.service`]:
      { BrandProfileContextService: emptyClass },
    [`${BASE}content-intelligence/source-registry/source-registry.service`]: {
      ContentSourceRegistryService: emptyClass,
    },
  });

const { PostsService } = loadWithMocks(
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts',
  {
    [`${BASE}database/prisma/posts/posts.repository`]: {
      PostsRepository: emptyClass,
    },
    [`${BASE}database/prisma/integrations/integration.service`]: {
      IntegrationService: emptyClass,
    },
    [`${BASE}integrations/integration.manager`]: {
      IntegrationManager: emptyClass,
    },
    [`${BASE}database/prisma/media/media.service`]: {
      MediaService: emptyClass,
    },
    [`${BASE}short-linking/short.link.service`]: {
      ShortLinkService: emptyClass,
    },
    [`${BASE}openai/openai.service`]: { OpenaiService: emptyClass },
    [`${BASE}dtos/posts/create.post.dto`]: {
      CreatePostDto: emptyClass,
      Post: emptyClass,
    },
    '@contentfactory/helpers/utils/strip.html.validation': {
      stripHtmlValidation: () => {
        throw new Error('Unrelated editor validation is outside this fixture');
      },
    },
    '@contentfactory/helpers/utils/count.length': {
      weightedLength: (value) => value.length,
    },
    [`${BASE}upload/upload.factory`]: noStorage,
    [`${BASE}redis/redis.service`]: { ioRedis: {} },
    [`${BASE}integrations/refresh.integration.service`]: {
      RefreshIntegrationService: emptyClass,
    },
    [`${BASE}integrations/telegram.updates.service`]: {
      TelegramUpdatesService: emptyClass,
    },
    '@sentry/nestjs': { captureException: () => undefined },
    'nestjs-temporal-core': { TemporalService: emptyClass },
    sharp: () => undefined,
    axios: {},
  }
);
const { PostsRepository } = loadWithMocks(
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
  prismaPorts
);
const { IntegrationRepository } = loadWithMocks(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
  { ...prismaPorts, [`${BASE}upload/upload.factory`]: noStorage }
);
const { IntegrationService } = loadIntegrationService({
  [`${BASE}database/prisma/integrations/integration.repository`]: {
    IntegrationRepository: emptyClass,
  },
});

/** Actual integration/service/repository reads; only the ORM methods are ports. */
const scheduleFixture = ({
  raw = '[{"time":1080}]',
  taken = [],
  maxReads = 2,
  slots,
} = {}) => {
  const calls = { integrations: [], posts: [] };
  const integrationRepository = Object.create(IntegrationRepository.prototype);
  integrationRepository._integration = {
    model: {
      integration: {
        findMany: async (query) => {
          calls.integrations.push(query);
          expect(query.where).toMatchObject({
            organizationId: 'org-a',
            disabled: false,
            deletedAt: null,
          });
          if (query.where.id && query.where.id !== 'channel-a') return [];
          return [{ postingTimes: raw }];
        },
      },
    },
  };
  const integrations = new IntegrationService(
    integrationRepository,
    {},
    {},
    {},
    {},
    {},
    {}
  );
  if (slots !== undefined) integrations.findFreeDateTime = async () => slots;
  const repository = Object.create(PostsRepository.prototype);
  repository._post = {
    model: {
      post: {
        findMany: async (query) => {
          calls.posts.push(query);
          if (calls.posts.length > maxReads) {
            throw new Error(
              'Bounded RED sentinel: slot scan did not terminate'
            );
          }
          expect(query.where).toMatchObject({
            organizationId: 'org-a',
            deletedAt: null,
          });
          return taken.filter((row) =>
            query.where.publishDate.in.some(
              (at) => at.getTime() === row.publishDate.getTime()
            )
          );
        },
      },
    },
  };
  repository.findAllExistingCategories = async () => [];
  repository.findAllExistingTopicsOfCategory = async () => [];
  repository.findPopularPosts = async () => [];
  const service = new PostsService(
    repository,
    {},
    integrations,
    {},
    {},
    {},
    {},
    {},
    {}
  );
  return { service, calls, integrations };
};

const validationFailure = async (promise) => {
  const error = await promise.then(
    () => null,
    (failure) => failure
  );
  expect(error).toBeInstanceOf(BadRequestException);
  expect(error.getStatus()).toBe(400);
  return error;
};

describe('publication slot search terminates and retains UTC/tenant semantics', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => {
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  test.each([
    ['empty', '[]'],
    ['broken JSON', '{'],
    ['object instead of list', '{}'],
    ['null list', 'null'],
    ['null entry', '[null]'],
    ['missing minute', '[{}]'],
    ['null minute', '[{"time":null}]'],
    ['string minute', '[{"time":"1080"}]'],
    ['negative minute', '[{"time":-1}]'],
    ['minute beyond the UTC day', '[{"time":1440}]'],
    ['fractional minute', '[{"time":600.5}]'],
    ['mixed valid/invalid', '[{"time":1080},{"time":-1}]'],
  ])('%s schedule refuses before reading post dates', async (_name, raw) => {
    const { service, calls } = scheduleFixture({ raw });
    await validationFailure(service.findFreeDateTime('org-a', 'channel-a'));
    expect(calls.integrations).toHaveLength(1);
    expect(calls.posts).toHaveLength(0);
  });

  test.each([
    ['NaN', [NaN]],
    ['Infinity', [Infinity]],
    ['sparse list', new Array(1)],
  ])(
    '%s collaborator minute list also refuses promptly',
    async (_name, slots) => {
      const { service, calls } = scheduleFixture({ slots });
      await validationFailure(service.findFreeDateTime('org-a'));
      expect(calls.posts).toHaveLength(0);
    }
  );

  test('no accessible selected integration refuses without a foreign read', async () => {
    const { service, calls } = scheduleFixture();
    await validationFailure(
      service.findFreeDateTime('org-a', 'foreign-channel')
    );
    expect(calls.integrations[0].where.id).toBe('foreign-channel');
    expect(calls.posts).toHaveLength(0);
  });

  test('today: earliest future free minute, even with unsorted/duplicate times', async () => {
    const { service, calls } = scheduleFixture({
      raw: '[{"time":1080},{"time":540},{"time":720},{"time":720}]',
    });
    expect(await service.findFreeDateTime('org-a', 'channel-a')).toBe(
      '2026-10-02T12:00:00'
    );
    expect(calls.posts).toHaveLength(1);
    expect(
      calls.posts[0].where.publishDate.in.map((at) => at.toISOString())
    ).toEqual([
      '2026-10-02T18:00:00.000Z',
      '2026-10-02T09:00:00.000Z',
      '2026-10-02T12:00:00.000Z',
    ]);
  });

  test('all today slots past or occupied: next UTC day is searched unchanged', async () => {
    const { service, calls } = scheduleFixture({
      raw: '[{"time":540},{"time":720}]',
      taken: [{ publishDate: new Date('2026-10-02T12:00:00.000Z') }],
    });
    expect(await service.findFreeDateTime('org-a')).toBe('2026-10-03T09:00:00');
    expect(calls.posts).toHaveLength(2);
  });

  test('last minute of the UTC day remains valid', async () => {
    const { service } = scheduleFixture({ raw: '[{"time":1439}]' });
    expect(await service.findFreeDateTime('org-a')).toBe('2026-10-02T23:59:00');
  });

  test('minute zero is next UTC midnight once today has started', async () => {
    const { service, calls } = scheduleFixture({ raw: '[{"time":0}]' });
    expect(await service.findFreeDateTime('org-a')).toBe('2026-10-03T00:00:00');
    expect(calls.posts).toHaveLength(2);
  });

  const filled = (lastDay) =>
    Array.from({ length: lastDay + 1 }, (_unused, day) => ({
      publishDate: dayjs
        .utc(NOW)
        .startOf('day')
        .add(day, 'day')
        .add(1080, 'minutes')
        .toDate(),
    }));

  test('a free slot on final UTC day +366 is still accepted', async () => {
    const { service, calls } = scheduleFixture({
      taken: filled(MAX_DAY - 1),
      maxReads: MAX_DAY + 1,
    });
    expect(await service.findFreeDateTime('org-a')).toBe(
      dayjs
        .utc(NOW)
        .startOf('day')
        .add(MAX_DAY, 'day')
        .add(1080, 'minutes')
        .format('YYYY-MM-DDTHH:mm:00')
    );
    expect(calls.posts).toHaveLength(MAX_DAY + 1);
  });

  test('occupied horizon terminates at 367 daily reads with validation', async () => {
    const { service, calls } = scheduleFixture({
      taken: filled(MAX_DAY + 1),
      maxReads: MAX_DAY + 1,
    });
    await validationFailure(service.findFreeDateTime('org-a'));
    expect(calls.posts).toHaveLength(MAX_DAY + 1);
  });

  test('ordinary dependency errors retain their identity, without more reads', async () => {
    const { service, calls, integrations } = scheduleFixture();
    const failure = new Error('owned test database read failed');
    integrations.findFreeDateTime = async () => {
      throw failure;
    };
    await expect(service.findFreeDateTime('org-a')).rejects.toBe(failure);
    expect(calls.posts).toHaveLength(0);
  });
});

const { PieceService } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts',
  {
    ...prismaPorts,
    [`${BASE}agent/agent.graph.service`]: { AgentGraphService: emptyClass },
    [`${BASE}integrations/integration.manager`]: {
      IntegrationManager: emptyClass,
    },
    [`${BASE}openai/ai.clients`]: {
      WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
      getChatModel: () => {
        throw new Error('No extra Piece model call is allowed');
      },
    },
    './piece.repository': { PieceRepository: emptyClass },
    '../brief/content-brief.repository': { ContentBriefRepository: emptyClass },
    [`${BASE}openai/ai.usage.service`]: { AiUsageService: emptyClass },
    [`${BASE}openai/web.research.service`]: { WebResearchService: emptyClass },
    '../search/text-search.service': { TextSearchService: emptyClass },
    '../intake/intake.service': { IntakeService: emptyClass },
  }
);
const envelope = {
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'snapshot-a',
  status: 'READY',
  generationPolicy: 'ALLOW_USER_ONLY',
  profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
  facts: [],
  evidence: [],
  selectionHash: 'selection-a',
};
const { PostsController } = loadWithMocks(
  'apps/backend/src/api/routes/posts.controller.ts',
  {
    ...prismaPorts,
    [`${BASE}database/prisma/posts/posts.service`]: {
      PostsService: emptyClass,
    },
    [`${BASE}agent/agent.graph.service`]: { AgentGraphService: emptyClass },
    [`${BASE}short-linking/short.link.service`]: {
      ShortLinkService: emptyClass,
    },
    [`${BASE}user/org.from.request`]: {
      GetOrgFromRequest: () => () => undefined,
    },
    [`${BASE}user/user.from.request`]: {
      GetUserFromRequest: () => () => undefined,
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: () => () => undefined,
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      {
        AuthorizationActions: { Create: 'create', Read: 'read' },
        Sections: { POSTS_PER_MONTH: 'posts_per_month', EDITOR: 'editor' },
      },
  }
);
const channelFixture = ({
  mode = 'draft',
  ownMode,
  raw = '[]',
  onLock,
  draftFailure,
  adaptationFailure,
} = {}) => {
  const scheduler = scheduleFixture({ raw });
  const calls = {
    models: [],
    scopes: [],
    contexts: [],
    starts: [],
    modes: [],
    locks: [],
    draft: [],
    adaptation: [],
    plan: [],
    busy: [],
    state: [],
  };
  const posts = new Map();
  const variants = [];
  const channel = {
    id: 'channel-a',
    name: 'Owned channel',
    providerIdentifier: 'telegram',
    contentLanguage: 'ru',
    writingProfile: null,
    planMode: mode,
    postingTimes: raw,
  };
  const piece = {
    id: 'piece-a',
    title: 'Канбан',
    kind: 'CORE',
    body: 'Канбан визуализирует работу.',
    brief: {
      brief: {
        inputKind: 'thought',
        thesis: 'Канбан визуализирует работу',
        position: null,
        disagreement: null,
        audience: null,
        format: 'auto',
        facts: [],
        origins: {},
        ungrounded: [],
      },
      answers: [],
      slop: null,
      writtenBy: 'human',
      authorNumbers: false,
    },
    language: 'ru',
    tags: ownMode
      ? { postSettings: { 'channel-a': { planMode: ownMode } } }
      : null,
    archivedAt: null,
    createdAt: NOW,
    brandProfileVersion: null,
  };
  let inLock = false;
  const owned = (org, pieceId = 'piece-a', integrationId = 'channel-a') => {
    expect([org, pieceId, integrationId]).toEqual([
      'org-a',
      'piece-a',
      'channel-a',
    ]);
  };
  const repository = {
    getPiece: async (org, id) =>
      org === 'org-a' && id === piece.id ? piece : null,
    listIntegrations: async (org) => (org === 'org-a' ? [channel] : []),
    adaptationsByPiece: async () => [],
    pieceTags: async (org, id) => {
      owned(org, id);
      return piece.tags;
    },
    channelPlanMode: async (org, id) => {
      owned(org, 'piece-a', id);
      calls.modes.push([org, id, channel.planMode, inLock]);
      return channel.planMode;
    },
    withChannelLock: async (org, pieceId, id, work) => {
      owned(org, pieceId, id);
      calls.locks.push([org, pieceId, id]);
      if (onLock) onLock(channel, piece);
      inLock = true;
      try {
        return await work(repository);
      } finally {
        inLock = false;
      }
    },
    channelVariants: async (org, pieceId, id) => {
      owned(org, pieceId, id);
      return variants.map((row) => ({ ...row, post: posts.get(row.postId) }));
    },
    busySlots: async (org, id) => {
      owned(org, 'piece-a', id);
      expect(inLock).toBe(true);
      calls.busy.push([org, id]);
      return [];
    },
    setPlan: async (org, id, data) => {
      owned(org);
      expect(inLock).toBe(true);
      calls.plan.push(data);
      Object.assign(
        variants.find((row) => row.id === id),
        data
      );
      return { count: 1 };
    },
    setPostState: async (org, id, data) => {
      owned(org);
      expect(inLock).toBe(true);
      calls.state.push(data);
      Object.assign(posts.get(id), data);
      return posts.get(id);
    },
    createDraft: async (org, data) => {
      owned(org, piece.id, data.channelId);
      calls.draft.push(data);
      if (draftFailure) return null;
      posts.set('post-a', {
        id: 'post-a',
        state: 'DRAFT',
        publishDate: new Date(data.date),
        integrationId: data.channelId,
        deletedAt: null,
      });
      return 'post-a';
    },
    createAdaptation: async (org, data) => {
      owned(org, data.pieceId, data.integrationId);
      calls.adaptation.push(data);
      if (adaptationFailure) return null;
      const row = {
        id: 'adaptation-a',
        contentPieceId: data.pieceId,
        postId: data.postId,
        integrationId: data.integrationId,
        createdAt: NOW,
        plannedAt: null,
        plan: null,
      };
      variants.push(row);
      return row;
    },
  };
  const chatModel = {
    withStructuredOutput(schema) {
      return RunnableLambda.from(async () => {
        const shape = schema?.shape ?? {};
        if (shape.category) {
          calls.models.push('category');
          return { category: 'категория' };
        }
        if (shape.topic) {
          calls.models.push('topic');
          return { topic: 'тема' };
        }
        if (shape.hook) {
          calls.models.push('hook');
          return { hook: 'Канбан' };
        }
        calls.models.push('content');
        return {
          content: {
            content: 'Канбан визуализирует работу.',
            usedCitationIds: [],
          },
        };
      });
    },
    invoke: async () => {
      throw new Error('No unstructured/extra model call is allowed');
    },
  };
  const { AgentGraphService } = loadSafeGraph(chatModel);
  const graph = new AgentGraphService(
    scheduler.service,
    {},
    {},
    {
      executeAiStreamOperation: (org, operation, factory) => {
        calls.scopes.push([org, operation]);
        return factory();
      },
    },
    {
      build: async (org, request) => {
        calls.contexts.push([org, request]);
        return envelope;
      },
    },
    { resolve: async () => ({ effectiveVoice: {} }) },
    null,
    null
  );
  const realStart = graph.start.bind(graph);
  graph.start = (org, body, ...options) => {
    calls.starts.push([org, body, ...options]);
    return realStart(org, body, ...options);
  };
  const manager = {
    getSocialIntegration: () => ({
      identifier: 'telegram',
      maxLength: () => 4096,
      maxCaptionLength: () => 1024,
      editor: 'html',
    }),
  };
  const service = new PieceService(repository, graph, manager, () => NOW);
  return { service, graph, scheduler, calls, posts, variants, channel, piece };
};

const collect = async (stream) => {
  const events = [];
  let failure = null;
  try {
    for await (const event of stream) events.push(event);
  } catch (error) {
    failure = error;
  }
  return { events, failure };
};
const adapt = async (fixture, request = {}, afterPrepare) => {
  const prepared = await fixture.service.prepareAdapt(
    'org-a',
    'piece-a',
    {
      integrationId: 'channel-a',
      kind: 'post',
      skipInterview: true,
      options: { isPicture: false },
      ...request,
    },
    'ru'
  );
  if (afterPrepare) afterPrepare(fixture.channel, fixture.piece);
  return collect(fixture.service.adapt('org-a', prepared));
};
const assertSingleGeneration = (calls) => {
  expect(calls.models).toEqual(['category', 'topic', 'hook', 'content']);
  expect(calls.scopes).toEqual([['org-a', 'text_generation']]);
  expect(calls.contexts).toHaveLength(1);
};

describe('actual PieceService -> compiled graph -> owned draft save', () => {
  beforeEach(() =>
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
      ],
    })
  );
  afterEach(() => {
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  test('draft with postingTimes=[] bypasses scheduler and persists one DRAFT/plan=draft', async () => {
    const fixture = channelFixture();
    const { events, failure } = await adapt(fixture);
    expect(failure).toBeNull();
    expect(events.filter((event) => event.name === 'error')).toEqual([]);
    const done = events.filter((event) => event.name === 'adaptation');
    expect(done).toHaveLength(1);
    expect(done[0].adaptation).toMatchObject({
      state: 'draft',
      date: null,
      plan: { status: 'draft', date: null, autopilot: false },
    });
    expect(fixture.scheduler.calls).toEqual({ integrations: [], posts: [] });
    expect(fixture.calls.busy).toEqual([]);
    expect(fixture.calls.draft).toHaveLength(1);
    expect(fixture.calls.draft[0].date).toBe(NOW.toISOString());
    expect(fixture.posts.get('post-a').state).toBe('DRAFT');
    expect(fixture.variants[0].plan).toBe('draft');
    expect(fixture.calls.starts[0][2]).toEqual({ draftOnly: true });
    expect(
      events
        .filter((event) => event.event?.name === 'post-time')
        .every((event) => !event.event.data?.output?.date)
    ).toBe(true);
    assertSingleGeneration(fixture.calls);
  });

  test('own draft override wins over channel reserve, with no scheduler', async () => {
    const fixture = channelFixture({ mode: 'reserve', ownMode: 'draft' });
    const { events, failure } = await adapt(fixture);
    expect(failure).toBeNull();
    expect(
      events.find((event) => event.name === 'adaptation')?.adaptation.plan
        .status
    ).toBe('draft');
    expect(fixture.scheduler.calls.integrations).toHaveLength(0);
    expect(fixture.calls.starts[0][2]).toEqual({ draftOnly: true });
    assertSingleGeneration(fixture.calls);
  });

  test('draft with malformed stored schedule also never reads/parses it', async () => {
    const fixture = channelFixture({ raw: '{' });
    const { events, failure } = await adapt(fixture);
    expect(failure).toBeNull();
    expect(
      events.find((event) => event.name === 'adaptation')?.adaptation.plan
        .status
    ).toBe('draft');
    expect(fixture.scheduler.calls).toEqual({ integrations: [], posts: [] });
    expect(fixture.calls.draft).toHaveLength(1);
    assertSingleGeneration(fixture.calls);
  });

  test('mode is read again after prepare before generation', async () => {
    const fixture = channelFixture({ mode: 'reserve' });
    const { events } = await adapt(fixture, {}, (channel) => {
      channel.planMode = 'draft';
    });
    expect(
      events.find((event) => event.name === 'adaptation')?.adaptation.plan
        .status
    ).toBe('draft');
    expect(fixture.scheduler.calls.integrations).toHaveLength(0);
    expect(fixture.calls.modes).toContainEqual([
      'org-a',
      'channel-a',
      'draft',
      false,
    ]);
  });

  test('final locked re-read respects a draft -> reserve change', async () => {
    const fixture = channelFixture({
      raw: '[{"time":1080}]',
      onLock: (channel) => {
        channel.planMode = 'reserve';
      },
    });
    const { events, failure } = await adapt(fixture);
    expect(failure).toBeNull();
    expect(fixture.scheduler.calls.integrations).toHaveLength(0);
    expect(fixture.calls.modes).toContainEqual([
      'org-a',
      'channel-a',
      'reserve',
      true,
    ]);
    expect(fixture.calls.busy).toEqual([['org-a', 'channel-a']]);
    expect(
      events.find((event) => event.name === 'adaptation')?.adaptation.plan
        .status
    ).toBe('reserved');
    expect(fixture.posts.get('post-a').state).toBe('DRAFT');
    assertSingleGeneration(fixture.calls);
  });

  test.each(['reserve', 'autopilot'])(
    '%s with empty times preserves generated prose as an honest unscheduled draft',
    async (mode) => {
      const fixture = channelFixture({ mode });
      const { events, failure } = await adapt(fixture, {
        draftOnly: true,
        options: { isPicture: false, draftOnly: true },
      });
      expect(failure).toBeNull();
      expect(events.filter((event) => event.name === 'error')).toEqual([]);
      const saved = events.find((event) => event.name === 'adaptation')?.adaptation;
      expect(saved).toMatchObject({ state: 'draft', date: null, plan: {
        status: 'draft', date: null, autopilot: false,
      } });
      expect(saved.plan.note).toMatch(/время|расписани/);
      expect(fixture.calls.draft).toHaveLength(1);
      expect(fixture.calls.adaptation).toHaveLength(1);
      expect(fixture.posts.get('post-a').state).toBe('DRAFT');
      expect(fixture.variants[0].plan).toBe('draft');
      expect(fixture.calls.draft[0].content).toContain('Канбан');
      expect(fixture.scheduler.calls.integrations).toHaveLength(0);
      expect(fixture.scheduler.calls.posts).toHaveLength(0);
      expect(fixture.calls.starts[0][2]).toEqual({ draftOnly: true });
      assertSingleGeneration(fixture.calls);
    }
  );

  test.each(['reserve', 'autopilot'])(
    '%s with malformed times saves prose without claiming a reservation',
    async (mode) => {
      const fixture = channelFixture({ mode, raw: '{' });
      const { events, failure } = await adapt(fixture);
      expect(failure).toBeNull();
      expect(events.filter((event) => event.name === 'error')).toEqual([]);
      expect(events.find((event) => event.name === 'adaptation')?.adaptation.plan)
        .toMatchObject({ status: 'draft', date: null, autopilot: false });
      expect(fixture.calls.draft).toHaveLength(1);
      expect(fixture.posts.get('post-a').state).toBe('DRAFT');
      expect(fixture.variants[0].plan).toBe('draft');
      expect(fixture.scheduler.calls.integrations).toHaveLength(0);
      expect(fixture.scheduler.calls.posts).toHaveLength(0);
      assertSingleGeneration(fixture.calls);
    }
  );

  test('own reserve override on draft channel uses only the locked channel slot', async () => {
    const fixture = channelFixture({
      mode: 'draft',
      ownMode: 'reserve',
      raw: '[{"time":1080}]',
    });
    const { events, failure } = await adapt(fixture);
    expect(failure).toBeNull();
    expect(fixture.scheduler.calls.integrations).toHaveLength(0);
    expect(fixture.scheduler.calls.posts).toHaveLength(0);
    expect(
      events.find((event) => event.name === 'adaptation')?.adaptation.plan
        .status
    ).toBe('reserved');
    expect(fixture.calls.draft[0].date).toBeTruthy();
    assertSingleGeneration(fixture.calls);
  });

  test('failed draft save is a terminal error, without false adaptation', async () => {
    const fixture = channelFixture({ draftFailure: true });
    const { events, failure } = await adapt(fixture);
    expect(failure).toBeNull();
    expect(events.find((event) => event.name === 'error')?.code).toBe(
      'ADAPTATION_DRAFT_FAILED'
    );
    expect(events.find((event) => event.name === 'adaptation')).toBeUndefined();
    expect(fixture.calls.adaptation).toHaveLength(0);
    expect(fixture.posts.size).toBe(0);
    expect(fixture.scheduler.calls.integrations).toHaveLength(0);
  });

  test('failed adaptation save retains its existing draft but does not announce success', async () => {
    const fixture = channelFixture({ adaptationFailure: true });
    const { events } = await adapt(fixture);
    expect(events.find((event) => event.name === 'error')?.code).toBe(
      'ADAPTATION_DRAFT_FAILED'
    );
    expect(events.find((event) => event.name === 'adaptation')).toBeUndefined();
    expect(fixture.posts.size).toBe(1);
    expect(fixture.variants).toHaveLength(0);
    expect(fixture.calls.plan).toHaveLength(0);
  });

  test('foreign piece is refused by real prepare before graph/model/save', async () => {
    const fixture = channelFixture();
    await expect(
      fixture.service.prepareAdapt(
        'org-b',
        'piece-a',
        { integrationId: 'channel-a' },
        'ru'
      )
    ).rejects.toBeTruthy();
    expect(fixture.calls.starts).toHaveLength(0);
    expect(fixture.calls.models).toHaveLength(0);
    expect(fixture.calls.draft).toHaveLength(0);
  });

  test('foreign channel is refused by real prepare before graph/model/save', async () => {
    const fixture = channelFixture();
    await expect(
      fixture.service.prepareAdapt(
        'org-a',
        'piece-a',
        { integrationId: 'foreign-channel' },
        'ru'
      )
    ).rejects.toBeTruthy();
    expect(fixture.calls.starts).toHaveLength(0);
    expect(fixture.calls.models).toHaveLength(0);
    expect(fixture.calls.draft).toHaveLength(0);
  });

  test('mode-read failure finishes with an error before any model or save', async () => {
    const fixture = channelFixture();
    fixture.service.pieces.channelPlanMode = async () => {
      throw new Error('Owned test mode read failed');
    };
    const { events, failure } = await adapt(fixture);
    expect(failure).toBeNull();
    expect(events.find((event) => event.name === 'error')?.message).toBe(
      'Owned test mode read failed'
    );
    expect(events.find((event) => event.name === 'adaptation')).toBeUndefined();
    expect(fixture.calls.starts).toHaveLength(0);
    expect(fixture.calls.models).toHaveLength(0);
    expect(fixture.calls.draft).toHaveLength(0);
  });

  test('without the optional plan store legacy behavior remains the ordinary slot search', async () => {
    const fixture = channelFixture();
    delete fixture.service.pieces.busySlots;
    const { events, failure } = await adapt(fixture);
    expect(failure).toBeNull();
    expect(events.find((event) => event.name === 'error')?.message).toMatch(
      /posting/i
    );
    expect(fixture.scheduler.calls.integrations).toHaveLength(1);
    expect(fixture.calls.starts[0][2]).toEqual({ draftOnly: false });
    expect(fixture.calls.draft).toHaveLength(0);
  });

  test('body-supplied flags cannot bypass scheduling on a two-argument generator call', async () => {
    const fixture = channelFixture();
    const body = {
      research: 'Канбан визуализирует работу',
      materialPolicy: 'PIECE_ONLY',
      language: 'ru',
      format: 'one_long',
      isPicture: false,
      draftOnly: true,
      options: { draftOnly: true },
      schedulingOptions: { draftOnly: true },
    };
    const { failure } = await collect(fixture.graph.start('org-a', body));
    expect(failure).toBeInstanceOf(BadRequestException);
    expect(fixture.scheduler.calls.integrations).toHaveLength(1);
    expect(fixture.scheduler.calls.posts).toHaveLength(0);
    expect(fixture.calls.draft).toHaveLength(0);
    assertSingleGeneration(fixture.calls);
  });

  test('actual public controller never promotes body/options to a trusted third argument and ends the error stream', async () => {
    const fixture = channelFixture();
    const controller = new PostsController({}, fixture.graph, {});
    const writes = [];
    const response = {
      setHeader: jest.fn(),
      write: (line) => writes.push(JSON.parse(line)),
      end: jest.fn(),
    };
    await controller.generatePosts(
      { id: 'org-a' },
      {
        research: 'Канбан визуализирует работу',
        materialPolicy: 'PIECE_ONLY',
        language: 'ru',
        format: 'one_long',
        isPicture: false,
        draftOnly: true,
        options: { draftOnly: true },
        schedulingOptions: { draftOnly: true },
      },
      response
    );
    expect(fixture.calls.starts[0]).toHaveLength(2);
    expect(writes.at(-1)).toMatchObject({ name: 'error', error: true });
    expect(writes.at(-1).message).toMatch(/posting/i);
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(fixture.scheduler.calls.integrations).toHaveLength(1);
    expect(fixture.scheduler.calls.posts).toHaveLength(0);
    expect(fixture.calls.draft).toHaveLength(0);
    assertSingleGeneration(fixture.calls);
  });
});
