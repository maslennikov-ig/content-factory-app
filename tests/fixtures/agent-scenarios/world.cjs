'use strict';

/**
 * The workspace a recorded scenario plays in (`content-factory-next-kcxz.11`):
 * rows in memory and the services the capabilities reach, answering from and
 * writing to those rows the way the real services do for their doors.
 *
 * Every method checks the organization it was handed, so a capability that
 * passed anything but the server-built identity fails the scenario instead of
 * reading an empty workspace. Every write is logged in `world.writes`.
 *
 * The paid service (`IntakeService.run`) admits its own `intake` operation
 * through the real `AiUsageService` the scenario hands in, exactly as the
 * door's generator does; whether it is absorbed by the turn's `agent`
 * admission or writes its own ledger row is what the scenario then reads.
 */

const { loadTypeScriptModule } = require('../../helpers/load-ts-module.cjs');
const { HttpException } = require('@nestjs/common');

/**
 * The real count behind «С чего начать» and the agent's snapshot
 * (`kcxz.21`): `OnboardingRepository.progress` itself, asked over the world's
 * rows seen as the tables it reads (`progressTables` below). A step the chat
 * closes is then closed by the very rules the screens are ticked by.
 */
const { OnboardingRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/onboarding/onboarding.repository.ts',
  {
    '@nestjs/common': { Injectable: () => (target) => target },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
    },
  }
);

/**
 * The service reads a channel's plan mode through this function
 * (`IntegrationService.getPlanMode`): `NULL` is «Бронь». The fake applies the
 * same one, not a copy, so the snapshot a scenario sees is the one
 * production gives (review W3-21 P2-1).
 */
const { CHANNEL_MIN_IDEAL_LENGTH, defaultWritingProfileFor } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
);
const { planModeOf } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/adaptation-plan.ts'
);
/**
 * One analysis per avatar at a time (`kcxz.39`): the service's own claim,
 * over the store's in-process stand-in, so a scenario's second start is
 * refused by the rule production uses.
 */
const { claimVoiceAnalysis, inProcessAnalysisLockStore } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/analysis-lock.ts'
);

/**
 * «Откуда идеи» (`kcxz.23`) runs on the real code, not on a copy of it: the
 * real `ContentLeadService` (rate limit, kinds, the check, what it presents),
 * over the real `ContentLeadRepository` (organization scope, «only a new lead»,
 * the dismissal memory) asked over the world's rows seen as the Prisma tables
 * it reads (`leadTables` below), with the real `LeadTopicGateway` (window,
 * junk, date and judge rules) over a research service that admits its own
 * `web_research` operation. Only the network is fake: the feed reader and the
 * search engine answer from `rows.feedItems` and `rows.topicFound`.
 */
const LEAD_DIR = 'libraries/nestjs-libraries/src/content-intelligence/leads';
const nest = {
  Injectable: () => (target) => target,
  Optional: () => () => undefined,
  Logger: class {
    debug() {}
    log() {}
    warn() {}
    error() {}
  },
};
const leadModules = {
  '@nestjs/common': nest,
  'nestjs-temporal-core': { TemporalService: class {} },
  '@temporalio/common': { TypedSearchAttributes: class {} },
  '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': { organizationId: {} },
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class {},
    PrismaTransaction: class {},
  },
  // Constructor tokens only; the instances are handed in below.
  './lead-feed.gateway': { LeadFeedGateway: class {} },
  './lead-topic.gateway': { LeadTopicGateway: class {} },
};
const { ContentLeadService } = loadTypeScriptModule(`${LEAD_DIR}/content-lead.service.ts`, leadModules);
const { ContentLeadRepository } = loadTypeScriptModule(`${LEAD_DIR}/content-lead.repository.ts`, leadModules);
const { LeadTopicGateway } = loadTypeScriptModule(`${LEAD_DIR}/lead-topic.gateway.ts`, {
  '@nestjs/common': nest,
  '@contentfactory/nestjs-libraries/openai/web.research.service': {
    WebResearchService: class {},
    // Page chrome out of an excerpt; the world's excerpts carry none.
    cleanExcerpt: (value) => ({ text: String(value || ''), hasProseLine: true }),
  },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-fetch.gateway': {
    SourceFetchGateway: class {},
  },
  // The product's window, read from where the search clients keep it rather
  // than retyped (`ai.clients.ts` builds engine clients this world has none of).
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    DISCOVERY_WINDOW_DAYS: Number(
      /export const DISCOVERY_WINDOW_DAYS = (\d+);/.exec(
        require('node:fs').readFileSync(
          require('node:path').join(
            __dirname,
            '../../../libraries/nestjs-libraries/src/openai/ai.clients.ts'
          ),
          'utf8'
        )
      )[1]
    ),
  },
  './lead-feed.gateway': {},
});
/** The piece's source line from a lead: the intake service's own function. */
const { pieceLeadSource } = loadTypeScriptModule(`${LEAD_DIR}/lead-intake.ts`);

/**
 * Facts, own texts and analytics (`kcxz.24`) run on the real code too: the
 * real `ContentFactService` over the real `ContentFactRepository` (organization
 * scope, «ваше слово» verified at once, the dedupe key, «Снять», «Вернуть» and
 * its re-evaluation) asked over the world's `facts` as the Prisma table it
 * reads (`factTables` below); the real `ContentMaterialService.listRelated`
 * over the real `TextSearchService` (the index, its ranking and the «only
 * what a reader can open» rule), fed the world's rows by a loader that stands
 * for `TextSearchRepository`; the real `slopCheck` (the capability imports
 * it); «Производство» by the real `PostsService.getProductionAnalytics`
 * and a channel's audience by the real `IntegrationService.checkAnalytics`
 * (see below). Only the platform's audience answer is fake
 * (`rows.channelAnalytics`, `rows.channelAnalyticsFails`).
 */
const CONTEXT_DIR = 'libraries/nestjs-libraries/src/content-intelligence/context';
const SEARCH_DIR = 'libraries/nestjs-libraries/src/content-intelligence/search';
const contextModules = {
  '@nestjs/common': { ...nest, Inject: () => () => undefined },
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class {},
    PrismaTransaction: class {},
  },
};
const { ContentFactService } = loadTypeScriptModule(`${CONTEXT_DIR}/content-fact.service.ts`, contextModules);
const { ContentFactRepository } = loadTypeScriptModule(`${CONTEXT_DIR}/content-fact.repository.ts`, contextModules);
const { TextSearchService } = loadTypeScriptModule(`${SEARCH_DIR}/text-search.service.ts`, contextModules);
const { ContentMaterialService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/materials/content-material.service.ts',
  contextModules
);
/**
 * «Производство» and a channel's audience through the real steps (review
 * W4-24 F11): `PostsService.getProductionAnalytics` over a repository that
 * answers `getProductionAnalyticsPosts` from the world's rows, and
 * `IntegrationService.checkAnalytics` — the token check, the refresh, the
 * cache and the platform's refusals — with only the platform, the refresh,
 * Redis and the snapshot store standing in.
 */
const { PostsService: RealPostsService } = require('../../helpers/posts-service.module.cjs').loadPostsService();
/** The platform's «token expired, refresh me» (`social.abstract`). */
class PlatformRefreshToken extends Error {}
/** The analytics cache (`ioRedis`), emptied for every world. */
const analyticsCache = new Map();
const { IntegrationService: RealIntegrationService } = require('../../helpers/integration-service.module.cjs').loadIntegrationService({
  '@contentfactory/nestjs-libraries/redis/redis.service': {
    ioRedis: {
      get: async (key) => analyticsCache.get(key) ?? null,
      set: async (key, value) => {
        analyticsCache.set(key, value);
        return 'OK';
      },
    },
  },
  '@contentfactory/nestjs-libraries/integrations/social.abstract': { RefreshToken: PlatformRefreshToken },
  '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
});

/**
 * The media library and a generated picture (`kcxz.25`) run on the real code:
 * the real `MediaService` (the door's credits rule, `generateImageIntoLibrary`
 * — credit row, picture prompt, image, storage, library row), over the real
 * `MediaRepository` (organization scope, «not deleted», newest first) asked
 * over the world's `media` rows as the Prisma table, the real
 * `SubscriptionService.checkCredits` / `useCredit` over the real
 * `SubscriptionRepository` (the `credits` and `subscription` rows), and the
 * real `OpenaiService`, whose picture prompt and drawing run in one
 * `image_generation` admission (kcxz.44) through the `AiUsageService` the
 * scenario hands in. Only
 * the network is fake: the provider client (`getOpenAiClient`) and the file
 * storage (`UploadFactory.createStorage`), through `mediaNetwork`, which each
 * world points at its own rows.
 */
const MEDIA_DIR = 'libraries/nestjs-libraries/src/database/prisma/media';
const SUBSCRIPTION_DIR = 'libraries/nestjs-libraries/src/database/prisma/subscriptions';
const mediaNetwork = { client: null, storage: null };
const mediaModules = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class {},
    PrismaTransaction: class {},
  },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getOpenAiClient: async (organizationId) => mediaNetwork.client(organizationId),
    getModelForRole: async (_organizationId, role) => (role === 'image' ? 'image-model' : 'text-model'),
  },
  // A constructor token only; the scenario's real instance is handed in.
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  'openai/helpers/zod': { zodResponseFormat: () => ({ type: 'json_schema' }) },
  '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': {
    IntegrationService: class {},
  },
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': {
    OrganizationService: class {},
  },
  '@contentfactory/nestjs-libraries/videos/video.manager': { VideoManager: class {} },
  '@contentfactory/nestjs-libraries/upload/upload.factory': {
    UploadFactory: {
      createStorage: () => ({ uploadSimple: (data) => mediaNetwork.storage(data) }),
    },
  },
  '@contentfactory/backend/services/auth/permissions/permission.exception.class': {
    AuthorizationActions: {},
    Sections: {},
    SubscriptionException: class extends Error {},
  },
};
const { MediaService } = loadTypeScriptModule(`${MEDIA_DIR}/media.service.ts`, mediaModules);
const { MediaRepository } = loadTypeScriptModule(`${MEDIA_DIR}/media.repository.ts`, mediaModules);
const { OpenaiService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/openai.service.ts',
  mediaModules
);
// The adaptation edit resolves a picture with the real `findMedia` (review
// W4-25 F7): a later change to its filter is seen by the media scenarios.
const { PieceRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.repository.ts',
  {
    ...mediaModules,
    '../materials/content-material.repository': { ContentMaterialRepository: class {} },
    '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  }
);
const { SubscriptionService } = loadTypeScriptModule(`${SUBSCRIPTION_DIR}/subscription.service.ts`, mediaModules);
const { SubscriptionRepository } = loadTypeScriptModule(
  `${SUBSCRIPTION_DIR}/subscription.repository.ts`,
  mediaModules
);

const ORGANIZATION_ID = 'org-1';
/** The scenario clock (the runner's `now`): «сейчас» of «Опубликовать сейчас». */
const NOW = '2026-09-27T10:00:00.000Z';

/**
 * The lines an avatar is filled with by hand: six, as the service's
 * `activationBlocker` asks for them (`PROFILE_FIELDS_V2`, W3 walk P3-H).
 */
const MANUAL_LINES = ['WHO_SPEAKS', 'TONE', 'AUDIENCE', 'SENTENCE_LENGTH', 'NEVER_SAY', 'TOPICS'];
/** What the AI proposes when a scenario says nothing else. */
const DEFAULT_PROPOSAL = [
  { key: 'WHO_SPEAKS', text: '', status: 'UNDECIDED' },
  { key: 'TONE', text: 'Спокойно и по делу.', status: 'ACCEPTED' },
  { key: 'AUDIENCE', text: '', status: 'UNDECIDED' },
  { key: 'SENTENCE_LENGTH', text: 'Короткие фразы.', status: 'ACCEPTED' },
  { key: 'NEVER_SAY', text: 'Без канцелярита.', status: 'ACCEPTED' },
];

const baseRows = () => ({
  pieces: [
    {
      id: 'p1',
      code: 'cnt-1',
      title: 'Про созвоны',
      archivedAt: null,
      questions: [
        { field: 'audience', question: 'Для кого этот пост?', options: ['Руководители', 'Команда'] },
        { field: 'facts', key: 'ask-1', question: 'Какой случай был у вас?' },
      ],
      answers: [],
      body: 'Созвоны без повестки съедают день.',
      revisions: [
        { text: 'Первая суть.', writtenBy: 'model', replacedAt: '2026-09-20T10:00:00.000Z' },
      ],
      addedMaterial: [],
      materialPending: false,
    },
    { id: 'p0', code: 'cnt-0', title: 'Старое', archivedAt: '2026-09-01T00:00:00.000Z' },
  ],
  channels: [
    {
      id: 'c1',
      name: 'Канал про работу',
      providerIdentifier: 'telegram',
      disabled: false,
      refreshNeeded: false,
      planMode: 'reserve',
      posts: 2,
      profile: {
        version: 'channel-writing-profile/v2',
        lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
        emojiLevel: 'few',
        linkPolicy: 'end',
        hashtagPolicy: 'none',
        ctaKind: 'auto',
        formatPreference: 'auto',
        notes: 'Пишем коротко.',
        brandProfileId: 'a1',
      },
    },
  ],
  avatars: [
    { id: 'a1', name: 'Черновик голоса', isDefault: true, analysed: true, kind: 'PERSON', active: false },
  ],
  nextPiece: 9,
});

/** Applies a scenario's overrides to the base rows (shallow per table). */
const createWorld = (overrides = {}) => {
  analyticsCache.clear();
  const rows = { ...baseRows(), ...overrides };
  const writes = [];
  const reads = [];
  // What each door body looked like when it reached the service: the record
  // a scenario compares with what the screen sends.
  const requests = [];

  const scoped = (method, organizationId) => {
    if (organizationId !== ORGANIZATION_ID) {
      throw new Error(`${method} was called for organization ${organizationId}`);
    }
    reads.push(method);
  };
  const notFound = (what) =>
    Object.assign(new Error(`${what} not found`), { code: 'NOT_FOUND' });

  const pieceOf = (pieceId) => {
    const piece = rows.pieces.find((one) => one.id === pieceId);
    if (!piece) throw Object.assign(new Error('Заготовка не найдена.'), { code: 'PIECE_NOT_FOUND' });
    return piece;
  };
  /** The replaced core becomes the newest version, as `withRevision` keeps it. */
  const replaceCore = (piece, text, writtenBy) => {
    piece.revisions = [
      ...(piece.revisions ?? []),
      { text: piece.body ?? '', writtenBy: piece.writtenBy ?? 'model', replacedAt: '2026-09-27T10:00:00.000Z' },
    ];
    piece.body = text;
    piece.writtenBy = writtenBy;
  };

  const adaptationOf = (pieceId, adaptationId) => {
    const row = (rows.adaptations ?? []).find((one) => one.id === adaptationId && one.pieceId === pieceId);
    if (!row) throw Object.assign(new Error('Адаптации нет.'), { code: 'ADAPTATION_NOT_FOUND' });
    return row;
  };
  const channelOf = (integrationId) => {
    const channel = rows.channels.find((one) => one.id === integrationId);
    if (!channel) throw Object.assign(new Error('Канала нет.'), { code: 'PIECE_CHANNEL_UNKNOWN' });
    return channel;
  };
  /* ---- Avatars (kcxz.18) ---------------------------------------------- */
  let nextSample = 1;
  const analysisLocks = inProcessAnalysisLockStore();
  const voiceError = (code, message) => Object.assign(new Error(message), { name: 'VoiceError', code });
  /** The avatar a voice request is about: the one named, else the default. */
  const voiceAvatar = (actor) => {
    if (actor.avatarId) {
      const named = rows.avatars.find((one) => one.id === actor.avatarId);
      if (!named) throw voiceError('VOICE_AVATAR_NOT_FOUND', 'Такого аватара в пространстве нет.');
      return named;
    }
    return rows.avatars.find((one) => one.isDefault) ?? null;
  };
  /** Three texts and 1500 characters make a corpus the analysis reads. */
  const readinessOf = (avatar) => {
    const samples = avatar?.samples ?? [];
    const charCount = samples.reduce((sum, one) => sum + (one.charCount ?? 0), 0);
    return {
      ready: samples.length >= 3 && charCount >= 1500,
      charCount,
      sampleCount: samples.length,
      missingChars: Math.max(0, 1500 - charCount),
      missingSamples: Math.max(0, 3 - samples.length),
      requiredSamples: 3,
      confidence: 'NORMAL',
      confidenceReasons: [],
    };
  };
  /** A row of the avatars list, as `VoiceService.avatars` draws one. */
  const avatarRow = (avatar) => ({
    id: avatar.id,
    name: avatar.name ?? null,
    kind: avatar.kind ?? 'PERSON',
    isDefault: !!avatar.isDefault,
    analysed: !!avatar.analysed,
    // The fields the scenarios set and read back (kcxz.29 D12 reads `active`).
    ...(avatar.active !== undefined ? { active: avatar.active } : {}),
    ...(avatar.ready !== undefined ? { ready: avatar.ready } : {}),
    ...(avatar.run ? { sampleCount: avatar.run.corpus.length } : {}),
    createdAt: '27.09.26',
  });

  /* ---- AI settings (kcxz.20) ------------------------------------------ */
  /**
   * The workspace's AI settings row: the defaults below under what the
   * scenario names in `world.ai`. Made on first use, so the state of the
   * scenarios that never read it stays as it was.
   */
  let aiReady = false;
  const aiRow = () => {
    if (!aiReady) {
      aiReady = true;
      rows.ai = { ...aiDefaults(), ...(rows.ai ?? {}) };
    }
    return rows.ai;
  };
  const aiDefaults = () => ({
      usageMode: 'workspace_key',
      // The workspace's own provider (the stored row), and the operator's —
      // what «Ключи системы» run on (review W3-20 F1).
      provider: 'openrouter',
      operatorProvider: 'openrouter',
      apiKey: null,
      textModel: 'openai/gpt-5-mini',
      imageModel: null,
      roleModels: { agent: 'openai/gpt-5-mini' },
      searchEnabled: true,
      searchProvider: 'tavily',
      searchTaskProviders: {},
      ownSearchKeys: {},
      // The operator's keys behind «Ключи системы» and behind an empty field.
      systemSearchKeys: { tavily: true },
      includedAvailable: true,
      monthly: 300,
      used: 120,
      usageByMember: [
        { userId: 'user-1', email: 'owner@example.test', name: 'Анна Петрова', operations: 90 },
        { userId: 'user-2', email: 'editor@example.test', name: null, operations: 25 },
        { userId: null, email: null, name: null, operations: 5 },
      ],
      usageByRole: [
        { role: 'agent', operations: 70 },
        { role: 'writer', operations: 50 },
      ],
  });
  /** `AiProviderService.getSettings`: presence flags, never a key. */
  const aiSettingsOf = (row) => {
    const included = row.usageMode === 'included';
    const own = Object.fromEntries(
      ['tavily', 'exa'].map((engine) => [engine, !!row.ownSearchKeys?.[engine]])
    );
    return {
      usageMode: row.usageMode,
      // As the real service answers: on «Ключи системы» the provider in
      // effect is the operator's; the workspace's own is `workspaceProvider`.
      provider: included ? row.operatorProvider : row.provider,
      workspaceProvider: row.provider,
      textModel: row.textModel,
      imageModel: row.imageModel,
      roleModels: row.roleModels,
      hasKey: !!row.apiKey,
      workspaceKeyConfigured: !!row.apiKey,
      includedAvailable: row.includedAvailable,
      includedMonthlyOperations: row.monthly,
      includedUnlimited: false,
      includedUsedOperations: row.used,
      includedRemainingOperations: Math.max(0, row.monthly - row.used),
      includedRestrictionReason: row.includedAvailable ? null : 'managed_unavailable',
      usageByMember: row.usageByMember,
      usageByRole: row.usageByRole,
      searchEnabled: row.searchEnabled,
      searchProvider: row.searchProvider,
      searchTaskProviders: row.searchTaskProviders,
      hasSearchKey: true,
      // On «Ключи системы» only the operator's set; on its own key an empty
      // field falls back to it.
      searchKeys: {
        tavily: included ? !!row.systemSearchKeys.tavily : own.tavily || !!row.systemSearchKeys.tavily,
        exa: included ? !!row.systemSearchKeys.exa : own.exa || !!row.systemSearchKeys.exa,
        openrouter: false,
      },
      workspaceSearchKeys: { ...own, openrouter: false },
      searchFallbackAvailable: false,
    };
  };

  /** «Ко всем N»: the channel's written drafts whose plan the mode would change. */
  const toApply = (integrationId) => {
    const mode = channelOf(integrationId).planMode;
    const target = mode === 'autopilot' ? 'queued' : mode === 'reserve' ? 'reserved' : 'draft';
    return (rows.adaptations ?? []).filter(
      (row) => row.integrationId === integrationId && row.state === 'draft' && row.plan?.status !== target
    );
  };
  /** A post of the calendar, as `getPosts` answers the calendar. */
  const postOf = (row) => {
    const piece = pieceOf(row.pieceId);
    const channel = channelOf(row.integrationId);
    return {
      id: row.postId,
      content: row.body ?? '',
      publishDate: new Date(row.date),
      state: row.state === 'queued' ? 'QUEUE' : row.state === 'published' ? 'PUBLISHED' : 'DRAFT',
      group: `g-${row.postId}`,
      integration: { id: channel.id, providerIdentifier: channel.providerIdentifier, name: channel.name, picture: null },
      piece: { id: piece.id, code: piece.code, title: piece.title },
      plan: row.plan?.status === 'reserved' ? 'reserve' : row.plan?.autopilot ? 'autopilot' : null,
    };
  };

  /**
   * The world's rows as the tables `OnboardingRepository.progress` counts
   * (`kcxz.21`). Each query shape the repository sends is answered by the
   * rule the database would apply; any other shape fails the scenario, so a
   * changed count cannot pass here by accident.
   *
   * - `integration`: the channels (a deleted one has left `rows.channels` for
   *   `rows.deletedChannels`), not disabled; `planMode` as written — `null`
   *   is «never chosen».
   * - `projectBrandProfile`: avatars switched on (`active`), the active version.
   * - `brandVoiceSample`: the avatars' samples that still hold text.
   * - `contentPiece`: live pieces (every world piece is a `CORE` one).
   * - `contentDerivation`: adaptations of live pieces.
   * - `post`: an adaptation with a post (`postId`), by its state.
   */
  const progressTables = () => {
    const same = (where) => {
      if (where?.organizationId !== ORGANIZATION_ID) {
        throw new Error(`progress counted for organization ${where?.organizationId}`);
      }
    };
    const shape = (table, where, keys) => {
      const extra = Object.keys(where).filter((key) => !keys.includes(key));
      if (extra.length) throw new Error(`${table}: unexpected filter ${extra.join(', ')}`);
    };
    const livePieces = () =>
      rows.pieces.filter((piece) => !piece.archivedAt && (piece.kind ?? 'CORE') === 'CORE');
    const piecesWhere = (where) => {
      same(where);
      shape('contentPiece', where, ['organizationId', 'kind', 'archivedAt']);
      if (where.kind !== 'CORE' || where.archivedAt !== null) throw new Error('contentPiece: unexpected filter');
      return livePieces();
    };
    const postState = { draft: 'DRAFT', queued: 'QUEUE', published: 'PUBLISHED' };
    const posts = () =>
      (rows.adaptations ?? []).filter((row) => row.postId).map((row) => postState[row.state] ?? 'DRAFT');
    return {
      model: {
        integration: {
          count: async ({ where }) => {
            same(where);
            shape('integration', where, ['organizationId', 'deletedAt', 'disabled', 'planMode']);
            return rows.channels.filter(
              (channel) =>
                !channel.disabled && (!('planMode' in where) || (channel.planMode ?? null) !== null)
            ).length;
          },
        },
        brandVoiceSample: {
          count: async ({ where }) => {
            same(where);
            return rows.avatars.flatMap((avatar) => avatar.samples ?? []).filter(
              (sample) => (sample.charCount ?? 0) > 0
            ).length;
          },
        },
        projectBrandProfile: {
          count: async ({ where }) => {
            same(where);
            shape('projectBrandProfile', where, ['organizationId', 'deletedAt', 'activeVersionId']);
            return rows.avatars.filter((avatar) => avatar.active === true).length;
          },
        },
        contentFact: {
          count: async ({ where }) => {
            same(where);
            return (rows.facts ?? []).filter(
              (fact) =>
                (fact.organizationId ?? ORGANIZATION_ID) === where.organizationId &&
                !['TOMBSTONED', 'RETRACTED', 'SUPERSEDED'].includes(fact.status)
            ).length;
          },
        },
        contentPiece: {
          count: async ({ where }) => piecesWhere(where).length,
          findMany: async ({ where }) => piecesWhere(where).map((piece) => ({ brief: piece.brief ?? null })),
          // The piece touched last: the newest row stands for it here.
          findFirst: async ({ where }) => {
            const last = piecesWhere(where).at(-1);
            return last ? { id: last.id } : null;
          },
        },
        post: {
          count: async ({ where }) => {
            same(where);
            shape('post', where, ['organizationId', 'deletedAt', 'state']);
            const wanted = typeof where.state === 'string' ? [where.state] : where.state.in;
            return posts().filter((state) => wanted.includes(state)).length;
          },
        },
        contentDerivation: {
          count: async ({ where }) => {
            same(where);
            shape('contentDerivation', where, ['organizationId', 'piece']);
            const live = new Set(livePieces().map((piece) => piece.id));
            return (rows.adaptations ?? []).filter((row) => live.has(row.pieceId)).length;
          },
        },
      },
    };
  };

  /* ---- «Откуда идеи» (kcxz.23) ---------------------------------------- */
  /**
   * The world's subscriptions and leads as the Prisma tables
   * `ContentLeadRepository` reads. Every query must name the caller's
   * organization; a filter the database would not understand fails the
   * scenario. The unique indexes are the schema's: `(organizationId, kind,
   * canonicalUrl)` over every row, archived ones included, and
   * `(organizationId, subscriptionId, externalId)`.
   */
  const leadTables = () => {
    // Made on first use, so the rows of scenarios that never touch ideas stay
    // as they were.
    const table = (name) => (rows[name] = rows[name] ?? []);
    const stamp = (data) =>
      Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])
      );
    const matches = (row, where) =>
      Object.entries(where).every(([key, want]) => {
        const have = row[key] ?? null;
        if (want === null) return have === null;
        if (want && typeof want === 'object' && !(want instanceof Date)) {
          if (Array.isArray(want.in)) return want.in.includes(have);
          if (want.gte !== undefined) return have !== null && new Date(have) >= new Date(want.gte);
          if ('not' in want && want.not === null) return have !== null;
          throw new Error(`lead tables: unexpected filter ${key}`);
        }
        return have === (want instanceof Date ? want.toISOString() : want);
      });
    const inWorkspace = (name, where = {}) => {
      if (where.organizationId !== ORGANIZATION_ID) {
        throw new Error(`${name} read for organization ${where.organizationId}`);
      }
      return table(name).filter((row) => matches(row, where));
    };
    const withSubscription = (lead) => {
      const subscription = table('subscriptions').find((one) => one.id === lead.subscriptionId);
      return {
        ...lead,
        subscription: subscription
          ? { id: subscription.id, displayName: subscription.displayName, kind: subscription.kind }
          : null,
      };
    };
    return {
      model: {
        contentLeadSubscription: {
          create: async ({ data }) => {
            const taken = table('subscriptions').some(
              (one) =>
                one.organizationId === data.organizationId &&
                one.kind === data.kind &&
                one.canonicalUrl === data.canonicalUrl
            );
            if (taken) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
            const row = {
              id: `sub-${table('subscriptions').length + 1}`,
              state: 'ACTIVE',
              lastCheckedAt: null,
              lastErrorCode: null,
              createdAt: NOW,
              deletedAt: null,
              ...stamp(data),
            };
            table('subscriptions').push(row);
            writes.push(['idea.subscribed', row.id]);
            return { ...row };
          },
          count: async ({ where }) => inWorkspace('subscriptions', where).length,
          findMany: async ({ where }) =>
            inWorkspace('subscriptions', where)
              .slice()
              .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
              .map((row) => ({ ...row, linkedAutoPost: null })),
          findFirst: async ({ where }) => {
            const row = inWorkspace('subscriptions', where)[0];
            return row ? { ...row } : null;
          },
          updateMany: async ({ where, data }) => {
            const found = inWorkspace('subscriptions', where);
            for (const row of found) {
              Object.assign(row, stamp(data));
              writes.push(
                data.deletedAt
                  ? ['idea.unsubscribed', row.id]
                  : 'deletedAt' in data
                  ? ['idea.revived', row.id]
                  : ['idea.checked', row.id, data.lastErrorCode ?? 'ok']
              );
            }
            return { count: found.length };
          },
        },
        contentLead: {
          groupBy: async ({ where }) => {
            const counts = new Map();
            for (const lead of inWorkspace('leads', where)) {
              counts.set(lead.subscriptionId, (counts.get(lead.subscriptionId) ?? 0) + 1);
            }
            return [...counts].map(([subscriptionId, all]) => ({ subscriptionId, _count: { _all: all } }));
          },
          createMany: async ({ data }) => {
            let count = 0;
            for (const item of data) {
              const known = table('leads').some(
                (one) =>
                  one.organizationId === item.organizationId &&
                  one.subscriptionId === item.subscriptionId &&
                  one.externalId === item.externalId
              );
              if (known) continue;
              table('leads').push({
                id: `lead-${table('leads').length + 1}`,
                status: 'NEW',
                observedAt: NOW,
                dismissedAt: null,
                acceptedAt: null,
                ...stamp(item),
              });
              count += 1;
            }
            if (count) writes.push(['idea.leads', data[0].subscriptionId, count]);
            return { count };
          },
          findMany: async ({ where, take }) =>
            inWorkspace('leads', where)
              .slice()
              .reverse()
              .sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)))
              .slice(0, take)
              .map(withSubscription),
          findFirst: async ({ where }) => {
            const lead = inWorkspace('leads', where)[0];
            return lead ? withSubscription(lead) : null;
          },
          updateMany: async ({ where, data }) => {
            const found = inWorkspace('leads', where);
            for (const lead of found) {
              Object.assign(lead, stamp(data));
              writes.push([data.status === 'DISMISSED' ? 'idea.dismissed' : 'idea.taken', lead.id]);
            }
            return { count: found.length };
          },
        },
        autoPost: {
          findMany: async () => [],
          findFirst: async () => null,
        },
      },
    };
  };
  /**
   * `$transaction` over the lead tables (kcxz.45, the batch «Не надо»): the
   * work runs on the same tables, and a throw puts the lead rows and the
   * writes back as they were — Postgres's rollback.
   */
  const leadTransaction = (tables) => ({
    model: {
      $transaction: async (work) => {
        const leads = (rows.leads ?? []).map((row) => ({ ...row }));
        const written = writes.length;
        try {
          return await work(tables.model);
        } catch (error) {
          if (rows.leads) rows.leads.splice(0, rows.leads.length, ...leads);
          writes.length = written;
          throw error;
        }
      },
    },
  });
  const leadRepository = () => {
    const tables = leadTables();
    return new ContentLeadRepository(tables, leadTransaction(tables));
  };
  /**
   * The periodic check, as Temporal runs it (review W4-23 F5): one workflow
   * per live subscription, whose first iteration checks at once. A start
   * against a running id attaches to it (`USE_EXISTING`); archiving
   * terminates it. The first check runs here, inside the start, through the
   * same service the workflow's activity calls, outside the turn's admission
   * (`outsideTurn`), so it admits its own operation as on the worker; in
   * production it runs a moment later, not inside the call.
   * Every live subscription of the rows runs its check from the start.
   */
  const periodic = new Set(
    (rows.subscriptions ?? [])
      .filter((one) => one.organizationId === ORGANIZATION_ID && !one.deletedAt && !rows.periodicStopped?.includes(one.id))
      .map((one) => `content-lead-check-${one.id}`)
  );
  const temporalFor = (service, outsideTurn = (run) => run()) => ({
    client: {
      getRawClient: () => ({
        workflow: {
          start: async (name, { workflowId, args: [input], startDelay }) => {
            if (name !== 'contentLeadCheckWorkflow') throw new Error(`workflow ${name}`);
            if (periodic.has(workflowId)) return;
            periodic.add(workflowId);
            // Held for an interval (review W4-23 F11): the first check is not now.
            if (startDelay) {
              requests.push(['idea.periodic', input.subscriptionId, { startDelay }]);
              return;
            }
            requests.push(['idea.periodic', input.subscriptionId]);
            const first = await outsideTurn(() =>
              service().checkSubscription(input.organizationId, input.subscriptionId)
            );
            requests.push(['idea.periodic.first', input.subscriptionId, first.checked ? 'checked' : first.reason]);
          },
        },
      }),
    },
    terminateWorkflow: async (workflowId) => {
      periodic.delete(workflowId);
    },
  });
  /** The feed reader: what the address carries, from `rows.feedItems`. */
  const feedReader = () => ({
    get capabilityEnabled() {
      return rows.feedCheck !== false;
    },
    check: async (url, kind) => {
      requests.push(['idea.feed', url, kind]);
      return {
        disabled: false,
        items: (rows.feedItems?.[url] ?? []).map((item) => ({
          ...item,
          publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        })),
      };
    },
  });
  /**
   * The search behind a topic check: one `web_research` operation admitted
   * through the real `AiUsageService`, as `WebResearchService.research` opens
   * it, answering `rows.topicFound` as sources, facts and the judge's verdicts.
   */
  const topicSearch = (usage) => ({
    research: async (organizationId, subject, options) => {
      scoped('WebResearchService.research', organizationId);
      const found = rows.topicFound ?? [];
      // The research cache answered (review W4-23 F4): no search, no operation.
      if (rows.topicCached) {
        requests.push(['idea.research.cached', subject]);
        return {
          sources: found.map(({ url, title, publishedAt, score }) => ({ url, title, publishedAt, score: score ?? 0.8 })),
          facts: [],
          discovery: [],
          fromCache: true,
        };
      }
      requests.push(['idea.research', subject, { ...options }]);
      await usage.executeAiOperation(organizationId, 'web_research', async () => 'found');
      return {
        sources: found.map(({ url, title, publishedAt, score }) => ({ url, title, publishedAt, score: score ?? 0.8 })),
        facts: found.map((one) => ({ text: one.excerpt, sourceUrl: one.url })),
        discovery: found.map((one) => ({ url: one.url, relevant: true, reason: one.reason ?? null })),
      };
    },
  });

  /* ---- Facts, own texts, analytics (kcxz.24) --------------------------- */
  /**
   * The world's facts as the Prisma table `ContentFactRepository` reads. Every
   * query must name the caller's organization; a filter or a shape the
   * database would not understand fails the scenario. The unique index is the
   * schema's `(organizationId, dedupeKey)`. A fact has no evidence links here:
   * every one is the person's own word.
   */
  const factTables = () => {
    const table = () => (rows.facts = rows.facts ?? []);
    const stamp = (data) =>
      Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])
      );
    const matches = (row, where) =>
      Object.entries(where).every(([key, want]) => {
        const have = row[key] ?? null;
        if (want && typeof want === 'object' && !(want instanceof Date)) {
          if (want.not !== undefined) return have !== want.not;
          // `redateFact`: only a live row (walk review F1).
          if (Array.isArray(want.notIn)) return !want.notIn.includes(have);
          throw new Error(`fact table: unexpected filter ${key}`);
        }
        return have === want;
      });
    const inWorkspace = (where = {}) => {
      if (where.organizationId !== ORGANIZATION_ID) {
        throw new Error(`facts read for organization ${where.organizationId}`);
      }
      return table().filter((row) => matches(row, where));
    };
    const shown = (row) => ({ ...row, evidenceLinks: [] });
    const client = {
      contentFact: {
        findMany: async ({ where }) =>
          inWorkspace(where)
            .slice()
            .sort((a, b) => String(a.claimKey).localeCompare(String(b.claimKey)) || a.id.localeCompare(b.id))
            .slice(0, 100)
            .map(shown),
        findFirst: async ({ where }) => {
          const row = inWorkspace(where)[0];
          return row ? shown(row) : null;
        },
        upsert: async ({ where, create }) => {
          const key = where.organizationId_dedupeKey;
          const known = inWorkspace({ organizationId: key.organizationId }).find(
            (row) => row.dedupeKey === key.dedupeKey
          );
          if (known) return shown(known);
          const row = { id: `fact-${table().length + 1}`, createdAt: NOW, updatedAt: NOW, ...stamp(create) };
          table().push(row);
          writes.push(['fact.added', row.id]);
          return shown(row);
        },
        updateMany: async ({ where, data }) => {
          const found = inWorkspace(where);
          for (const row of found) {
            Object.assign(row, stamp(data));
            writes.push(['fact.status', row.id, row.status]);
          }
          return { count: found.length };
        },
      },
      user: {
        findMany: async ({ where }) =>
          (where.id?.in ?? []).includes('user-1') ? [{ id: 'user-1', name: 'Анна', lastName: null }] : [],
      },
    };
    return {
      repository: { model: client },
      transaction: { model: { $transaction: async (work) => work(client) } },
    };
  };
  /**
   * What `TextSearchRepository.load` reads for the index: this workspace's
   * pieces, facts and posts that went out with their address.
   */
  const searchRows = {
    load: async (organizationId) => {
      scoped('TextSearchRepository.load', organizationId);
      const mine = (row) => (row.organizationId ?? ORGANIZATION_ID) === organizationId;
      return {
        pieces: rows.pieces.filter(mine).map((piece) => ({
          id: piece.id,
          title: piece.title ?? null,
          body: piece.body ?? null,
          createdAt: new Date(NOW),
        })),
        derivations: [],
        posts: (rows.publishedPosts ?? [])
          .filter(mine)
          .filter((post) => post.releaseURL)
          .map((post) => ({
            id: post.id,
            content: post.content,
            releaseURL: post.releaseURL,
            publishDate: new Date(post.publishDate),
            integration: { providerIdentifier: post.platform },
          })),
        facts: (rows.facts ?? []).filter(mine).map((fact) => ({
          id: fact.id,
          statement: fact.statement ?? null,
          claimKey: fact.claimKey ?? null,
        })),
      };
    },
  };
  const textSearch = new TextSearchService(searchRows, () => Date.parse(NOW));
  const factService = () => {
    const tables = factTables();
    return new ContentFactService(new ContentFactRepository(tables.repository, tables.transaction), textSearch);
  };

  const leadService = (usage, outsideTurn) => {
    let service;
    service = new ContentLeadService(
      leadRepository(),
      feedReader(),
      temporalFor(() => service, outsideTurn),
      () => new Date(NOW),
      new LeadTopicGateway(topicSearch(usage), undefined, {
        enabled: rows.topicCheck !== false,
        now: () => new Date(NOW),
        deniedDomains: [],
      })
    );
    return service;
  };

  /**
   * `PostsRepository.getProductionAnalyticsPosts` over the world's rows: the
   * query's own filter (this organisation, not deleted, root posts, the
   * window, published or failed, the channel when named) and its shape.
   */
  const productionService = () =>
    new RealPostsService({
      getProductionAnalyticsPosts: async (organizationId, from, to, integrationId) => {
        scoped('PostsRepository.getProductionAnalyticsPosts', organizationId);
        return (rows.productionPosts ?? [])
          .filter((post) => (post.organizationId ?? ORGANIZATION_ID) === organizationId)
          .filter((post) => !post.deletedAt && !post.parentPostId)
          .filter((post) => !integrationId || post.integrationId === integrationId)
          .filter((post) => ['PUBLISHED', 'ERROR'].includes(post.state))
          .map((post) => ({
            state: post.state,
            creationMethod: post.creationMethod,
            createdAt: new Date(post.createdAt),
            publishDate: new Date(post.publishDate),
            error: post.error ?? null,
            errors: post.errors ?? [],
          }))
          .filter((post) => post.publishDate >= from && post.publishDate <= to);
      },
    });

  /**
   * The real `IntegrationService.checkAnalytics`. The channel is read by the
   * repository in the organisation it is asked for; its token lives until
   * `tokenExpiration` (far ahead unless the row says otherwise). The platform
   * answers `rows.channelAnalytics`, or fails as `rows.channelAnalyticsFails`
   * says (`refresh` — asks for a new token; any other word — an error). A
   * refresh, a disconnection and a notification are writes: the chat's read
   * must never make one.
   */
  const audienceService = () => {
    const platform = {
      analytics: async (internalId, token, days) => {
        requests.push(['analytics.platform', internalId, String(days)]);
        const failure = (rows.channelAnalyticsFails ?? {})[internalId];
        if (failure === 'refresh') throw new PlatformRefreshToken('token expired');
        if (failure) throw new Error(failure);
        return (rows.channelAnalytics ?? {})[internalId] ?? [];
      },
    };
    return new RealIntegrationService(
      {
        getIntegrationById: async (organizationId, id) => {
          scoped('IntegrationRepository.getIntegrationById', organizationId);
          const channel = rows.channels.find(
            (one) => one.id === id && (one.organizationId ?? ORGANIZATION_ID) === organizationId
          );
          return channel
            ? {
                type: 'social',
                internalId: channel.id,
                token: 'channel-token',
                tokenExpiration: '2099-01-01T00:00:00.000Z',
                ...channel,
              }
            : null;
        },
        disconnectChannel: async (organizationId, id) => {
          scoped('IntegrationRepository.disconnectChannel', organizationId);
          writes.push(['channel.refresh-needed', id]);
        },
      },
      {},
      { getSocialIntegration: () => platform },
      {
        inAppNotification: async (organizationId) => {
          scoped('NotificationService.inAppNotification', organizationId);
          writes.push(['notification', organizationId]);
        },
      },
      {
        refresh: async (integration) => {
          writes.push(['channel.token-refreshed', integration.id]);
          return false;
        },
      },
      {},
      { merge: async (id, days, live) => live }
    );
  };

  /* ---- Media (kcxz.25) ------------------------------------------------- */
  /** The `media` table: the world's rows, this workspace's unless named. */
  const mediaRows = () => (rows.media = rows.media ?? []);
  const mediaOrg = (row) => row.organizationId ?? ORGANIZATION_ID;
  const mediaMatches = (row, where = {}) =>
    Object.entries(where).every(([key, want]) => {
      if (key === 'organizationId') return mediaOrg(row) === want;
      if (key === 'organization') return mediaOrg(row) === want.id;
      if (key === 'deletedAt') return (row.deletedAt ?? null) === want;
      if (key === 'id' && want && typeof want === 'object') return want.in.includes(row.id);
      if (key === 'originalName' && want && typeof want === 'object') {
        return String(row.originalName ?? '').toLowerCase().includes(String(want.contains).toLowerCase());
      }
      if (want && typeof want === 'object') throw new Error(`media table: unexpected filter ${key}`);
      return row[key] === want;
    });
  const picked = (row, select) =>
    select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key] ?? null])) : { ...row };
  const mediaScoped = (where, method) => {
    const org = where?.organizationId ?? where?.organization?.id;
    scoped(`MediaRepository.${method}`, org);
  };
  const mediaTable = {
    model: {
      media: {
        count: async ({ where }) => {
          mediaScoped(where, 'count');
          return mediaRows().filter((row) => mediaMatches(row, where)).length;
        },
        findMany: async ({ where, orderBy, skip = 0, take, select }) => {
          mediaScoped(where, 'findMany');
          const found = mediaRows().filter((row) => mediaMatches(row, where));
          if (orderBy?.createdAt === 'desc') {
            found.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
          }
          return found.slice(skip, take === undefined ? undefined : skip + take).map((row) => picked(row, select));
        },
        findFirst: async ({ where }) => {
          mediaScoped(where, 'findFirst');
          const row = mediaRows().find((one) => mediaMatches(one, where));
          return row ? { ...row } : null;
        },
        create: async ({ data, select }) => {
          scoped('MediaRepository.saveFile', data.organization.connect.id);
          const row = {
            id: `00000000-0000-4000-8000-${String(mediaRows().length + 1).padStart(12, '0')}`,
            organizationId: data.organization.connect.id,
            name: data.name,
            originalName: data.originalName ?? null,
            path: data.path,
            thumbnail: null,
            alt: null,
            deletedAt: null,
            createdAt: `2026-09-27T10:00:${String(mediaRows().length).padStart(2, '0')}.000Z`,
          };
          mediaRows().push(row);
          writes.push(['media.saved', row.id]);
          return picked(row, select);
        },
      },
    },
  };
  /** The `credits` and `subscription` tables the credits rule reads. */
  const creditTable = {
    model: {
      credits: {
        create: async ({ data }) => {
          scoped('SubscriptionRepository.useCredit', data.organizationId);
          const row = { id: `credit-${(rows.credits ?? []).length + 1}`, createdAt: NOW, ...data };
          (rows.credits = rows.credits ?? []).push(row);
          writes.push(['credit.used', data.type]);
          return row;
        },
        delete: async ({ where }) => {
          rows.credits = (rows.credits ?? []).filter((row) => row.id !== where.id);
          writes.push(['credit.returned', where.id]);
          return {};
        },
        groupBy: async ({ where }) => {
          scoped('SubscriptionRepository.getCreditsFrom', where.organizationId);
          // The tier's monthly window: rows before its start do not count.
          const from = where.createdAt?.gte ? new Date(where.createdAt.gte).getTime() : -Infinity;
          const sum = (rows.credits ?? [])
            .filter((row) => row.organizationId === where.organizationId && row.type === where.type)
            .filter((row) => new Date(row.createdAt ?? NOW).getTime() >= from)
            .reduce((total, row) => total + row.credits, 0);
          return sum ? [{ _sum: { credits: sum } }] : [];
        },
      },
      subscription: {
        // As the web request's organization carries it (review W4-25 F8):
        // by the unique `organizationId`, the include's four fields.
        findUnique: async ({ where, select }) => {
          scoped('SubscriptionRepository.getSubscriptionAsOrganizationCarries', where.organizationId);
          return rows.subscription ? picked({ organizationId: where.organizationId, ...rows.subscription }, select) : null;
        },
      },
    },
  };
  const mediaService = (usage) => {
    let drawn = 0;
    // The provider's two answers and the storage: the only fakes.
    mediaNetwork.client = (organizationId) => ({
      chat: {
        completions: {
          parse: async ({ messages }) => {
            requests.push(['media.picture-prompt', organizationId, messages.at(-1).content]);
            // `promptFails`: the provider fails the picture-prompt call after
            // the operation was admitted (kcxz.44 review F6).
            if (rows.promptFails) {
              throw Object.assign(new Error('503 upstream unavailable'), { status: 503 });
            }
            return { choices: [{ message: { parsed: { prompt: 'A calm realistic photo of the post’s idea.' } } }] };
          },
        },
      },
      images: {
        generate: async ({ prompt, model, size }) => {
          if (rows.imageRefused) {
            throw Object.assign(new Error('400 Your request was rejected by the safety system'), { status: 400 });
          }
          requests.push(['media.image', organizationId, prompt, model, size]);
          drawn += 1;
          return { data: [{ b64_json: 'iVBORw0KGgo=' }] };
        },
      },
    });
    mediaNetwork.storage = async (data) => {
      requests.push(['media.stored', String(data).slice(0, 22)]);
      return `https://cdn.example/generated-${drawn}.png`;
    };
    // `subscription` and `credits`: the repository's two tables, one set.
    const subscriptions = new SubscriptionService(
      new SubscriptionRepository(creditTable, null, null, creditTable, null),
      null,
      null
    );
    // `pictureAdmission`: the picture's one admission (`image_generation`,
    // kcxz.44) answers this refusal — an allowance another tab spent, or a
    // busy ledger. The refusal is the admission's own shape (an
    // `HttpException` with its code), before its callback — the picture
    // prompt — runs; every other operation goes through the real service.
    const admitting = rows.pictureAdmission
      ? Object.assign(Object.create(usage), {
          executeAiOperation: (organizationId, operation, callback, role) => {
            if (operation !== 'image_generation') {
              return usage.executeAiOperation(organizationId, operation, callback, role);
            }
            const status = rows.pictureAdmission === 'AI_ADMISSION_CONTENDED' ? 503 : 429;
            requests.push(['media.admission-refused', organizationId, rows.pictureAdmission]);
            return Promise.reject(
              new HttpException({ statusCode: status, code: rows.pictureAdmission, message: 'Refused by the ledger.' }, status)
            );
          },
        })
      : usage;
    const real = new MediaService(new MediaRepository(mediaTable), new OpenaiService(admitting), subscriptions, null);
    // Billing configured (`STRIPE_PUBLISHABLE_KEY`) only while a world that
    // names it calls: the door's credits rule reads the environment.
    const billed = (call) => async (...args) => {
      const before = process.env.STRIPE_PUBLISHABLE_KEY;
      if (rows.billing) process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_world';
      try {
        return await call(...args);
      } finally {
        if (before === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
        else process.env.STRIPE_PUBLISHABLE_KEY = before;
      }
    };
    return {
      recentMedia: (...args) => real.recentMedia(...args),
      mediaInWorkspace: (...args) => real.mediaInWorkspace(...args),
      generateImageIntoLibraryFor: billed((...args) => real.generateImageIntoLibraryFor(...args)),
    };
  };
  const pieceRepository = new PieceRepository(mediaTable, null, null);

  const servicesFor = ({ usage, outsideTurn }) => ({
    ContentLeadService: leadService(usage, outsideTurn),
    MediaService: mediaService(usage),
    ContentFactService: factService(),
    // Only `listRelated` is reached; the library's own reads are not.
    ContentMaterialService: new ContentMaterialService({}, () => new Date(NOW), textSearch),
    OnboardingRepository: {
      progress: async (organizationId) => {
        scoped('OnboardingRepository.progress', organizationId);
        return new OnboardingRepository(progressTables()).progress(organizationId);
      },
    },
    PieceService: {
      // As the service answers the snapshot (every row) and the «Контент»
      // table (`q` over titles, archived only on request).
      list: async (organizationId, query = {}) => {
        scoped('PieceService.list', organizationId);
        requests.push(['piece.list', { ...query }]);
        const words = String(query.q ?? '').toLowerCase();
        const shown = rows.pieces.filter(
          (piece) =>
            (!query.q || piece.title.toLowerCase().includes(words)) &&
            (query.includeArchived || !piece.archivedAt)
        );
        return {
          state: rows.pieces.length ? 'default' : 'empty',
          columns: [],
          pieces: shown.map(({ questions, answers, body, ...piece }) => ({
            ...piece,
            date: '27.09.26',
          })),
        };
      },
      detail: async (organizationId, pieceId) => {
        scoped('PieceService.detail', organizationId);
        const piece = rows.pieces.find((one) => one.id === pieceId);
        if (!piece) {
          throw Object.assign(new Error('Заготовка не найдена.'), { code: 'PIECE_NOT_FOUND' });
        }
        return {
          state: 'default',
          piece: { id: piece.id, code: piece.code, title: piece.title, archivedAt: piece.archivedAt },
          core: {
            text: piece.body ?? 'Суть заготовки.',
            questions: { round: 0, items: piece.questions ?? [], answered: [] },
            revisions: piece.revisions ?? [],
            materialPending: piece.materialPending === true,
          },
          adaptations: (rows.adaptations ?? [])
            .filter((row) => row.pieceId === pieceId)
            .map((row) => ({ ...row })),
          // «Материала мало» under a channel's newest post (`materialAsks`:
          // questions by channel id), as the page's channel tabs carry it.
          channels: Object.entries(rows.materialAsks ?? {}).map(([integrationId, questions]) => {
            const mine = (rows.adaptations ?? []).filter(
              (row) => row.pieceId === pieceId && row.integrationId === integrationId
            );
            return {
              integrationId,
              materialAsk: mine.length
                ? {
                    adaptationId: mine.at(-1).id,
                    questions: questions.map((question, index) => ({ key: `ask-${index + 1}`, question })),
                  }
                : null,
            };
          }),
        };
      },
      archive: async (organizationId, pieceId, archived) => {
        scoped('PieceService.archive', organizationId);
        const piece = rows.pieces.find((one) => one.id === pieceId);
        if (!piece) throw notFound('piece');
        piece.archivedAt = archived ? '2026-09-27T10:00:00.000Z' : null;
        writes.push(['piece.archived', pieceId, archived]);
      },
      /* ---- The core (kcxz.13): the doors' services, over the same row ---- */
      editCore: async (organizationId, pieceId, input) => {
        scoped('PieceService.editCore', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.core.edit', pieceId, { ...input }]);
        if (input.expected !== piece.body) {
          throw Object.assign(new Error('Суть изменилась.'), { code: 'PIECE_CORE_CHANGED' });
        }
        replaceCore(piece, input.text, 'person');
        writes.push(['piece.core.edited', pieceId]);
        return { text: piece.body, savedAt: '2026-09-27T10:00:00.000Z', revisions: piece.revisions.length };
      },
      appendMaterial: async (organizationId, pieceId, input) => {
        scoped('PieceService.appendMaterial', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.material', pieceId, { ...input }]);
        piece.addedMaterial = [...(piece.addedMaterial ?? []), { text: input.text }];
        piece.materialPending = true;
        writes.push(['piece.material.added', pieceId]);
        return { addedMaterial: piece.addedMaterial, materialPending: true };
      },
      // `writeCore` over all the material: one `intake` operation.
      rebuildCore: async (organizationId, pieceId) => {
        scoped('PieceService.rebuildCore', organizationId);
        const piece = pieceOf(pieceId);
        await usage.executeAiOperation(organizationId, 'intake', async () => 'core');
        replaceCore(piece, `${piece.body} Пересобрано.`, 'model');
        piece.materialPending = false;
        writes.push(['piece.core.rebuilt', pieceId]);
        return { text: piece.body, revisions: piece.revisions.length };
      },
      restoreCore: async (organizationId, pieceId, input) => {
        scoped('PieceService.restoreCore', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.core.restore', pieceId, { ...input }]);
        const chosen = piece.revisions?.[input.index];
        if (input.expected !== piece.body || !chosen || chosen.replacedAt !== input.replacedAt) {
          throw Object.assign(new Error('Версии нет.'), { code: 'PIECE_CORE_CHANGED' });
        }
        replaceCore(piece, chosen.text, chosen.writtenBy);
        writes.push(['piece.core.restored', pieceId, input.index]);
        return { text: piece.body, revisions: piece.revisions.length };
      },
      // The search (`web_research`) and its digest (`intake`); the preview is
      // kept under a snapshot key for the accept door.
      researchCore: async (organizationId, pieceId, userId, input) => {
        scoped('PieceService.researchCore', organizationId);
        pieceOf(pieceId);
        requests.push(['piece.research', pieceId, userId, { ...input }]);
        if (input.confirmWebSpend !== true) {
          throw Object.assign(new Error('Подтвердите поиск.'), { code: 'PIECE_RESEARCH_CONFIRM' });
        }
        await usage.executeAiOperation(organizationId, 'web_research', async () => 'found');
        await usage.executeAiOperation(organizationId, 'intake', async () => 'digest');
        const facts = (rows.coreResearchFacts ?? []).map((fact) => ({ ...fact }));
        const snapshotKey = `core-snap-${Object.keys(rows.coreSnapshots ?? {}).length + 1}`;
        rows.coreSnapshots = { ...(rows.coreSnapshots ?? {}), [snapshotKey]: { pieceId, facts } };
        return {
          version: 'piece-research/v1',
          snapshotKey,
          level: input.level ?? 'standard',
          input: 'core',
          facts,
          corrections: [],
          summary: null,
        };
      },
      acceptCoreResearch: async (organizationId, pieceId, userId, input) => {
        scoped('PieceService.acceptCoreResearch', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.research.accept', pieceId, userId, JSON.parse(JSON.stringify(input))]);
        const saved = rows.coreSnapshots?.[input.snapshotKey];
        const allowed = new Set((saved?.facts ?? []).map((fact) => fact.factKey));
        if (!saved || saved.pieceId !== pieceId || input.selectedKeys.some((key) => !allowed.has(key))) {
          throw Object.assign(new Error('Выберите опоры.'), { code: 'PIECE_RESEARCH_SELECTION' });
        }
        await usage.executeAiOperation(organizationId, 'intake', async () => 'core');
        replaceCore(piece, `${piece.body} С опорами.`, 'model');
        piece.facts = input.selectedKeys.slice();
        writes.push(['piece.research.accepted', pieceId, input.selectedKeys.slice()]);
        return {};
      },
      // A check (claims, search, review) or a rewrite (review only); the
      // proposal comes back signed, as `reviewV2` answers the door.
      reviewV2: async (organizationId, pieceId, adaptationId, input) => {
        scoped('PieceService.reviewV2', organizationId);
        pieceOf(pieceId);
        requests.push(['piece.review', pieceId, adaptationId ?? null, { ...input }]);
        if (input.mode === 'web') {
          await usage.executeAiOperation(organizationId, 'content_classification', async () => 'claims');
          await usage.executeAiOperation(organizationId, 'web_research', async () => 'sources');
        }
        await usage.executeAiOperation(organizationId, 'text_generation', async () => 'review');
        const changes = (rows.reviewChanges ?? []).map((change) => ({ ...change }));
        const token = `token-${Object.keys(rows.proposals ?? {}).length + 1}`;
        // The text the proposal was made against: the accept door's
        // compare-and-swap refuses it once that text changed (kcxz.32, N2).
        const base = () =>
          adaptationId
            ? (rows.adaptations ?? []).find((one) => one.id === adaptationId)?.body
            : pieceOf(pieceId).body;
        rows.proposals = { ...(rows.proposals ?? {}), [token]: { pieceId, changes, base: base(), baseNow: base } };
        return {
          version: 'adaptation-review/v2',
          originalText: 'text',
          text: 'text',
          title: 'title',
          changes,
          verdict: changes.length ? 'review' : 'clean',
          summary: 'Сводка проверки.',
          token,
          slopBefore: 2,
          slopAfter: 0,
        };
      },
      acceptReviewV2: async (organizationId, pieceId, adaptationId, input) => {
        scoped('PieceService.acceptReviewV2', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.review.accept', pieceId, adaptationId ?? null, JSON.parse(JSON.stringify(input))]);
        const proposal = rows.proposals?.[input.token];
        const allowed = new Set((proposal?.changes ?? []).filter((c) => c.basket !== 'ask').map((c) => c.id));
        if (!proposal || proposal.pieceId !== pieceId || input.selectedIds.some((id) => !allowed.has(id))) {
          throw Object.assign(new Error('Выберите правки.'), { code: 'REVIEW_SELECTION' });
        }
        if (proposal.baseNow() !== proposal.base) {
          // `reviewConflict()`: nothing is written.
          throw Object.assign(
            new Error('Черновик изменился после проверки или уже не является черновиком. Откройте актуальный текст и повторите проверку.'),
            { code: 'ADAPTATION_REVIEW_STALE' }
          );
        }
        replaceCore(piece, `${piece.body} Поправлено.`, 'model');
        writes.push(['piece.review.accepted', pieceId, input.selectedIds.slice()]);
        return {};
      },
      /* ---- Adaptations (kcxz.14) ---------------------------------------- */
      // The effective mode a new variant is placed by (post's own, else the channel's).
      adaptPlanMode: async (organizationId, pieceId, integrationId) => {
        scoped('PieceService.adaptPlanMode', organizationId);
        const piece = pieceOf(pieceId);
        const channel = rows.channels.find((one) => one.id === integrationId);
        // The post's own mode first, as `planModeFor` (review W2 F16).
        const mode = piece.planModes?.[integrationId] ?? channel?.planMode ?? null;
        // Somebody switches the channel right after this read — between the
        // capability's check and the service's write (review W2 F2).
        if (rows.switchModeAfterRead && channel && channel.id === rows.switchModeAfterRead.channelId) {
          channel.planMode = rows.switchModeAfterRead.to;
          rows.switchModeAfterRead = undefined;
        }
        return mode;
      },
      prepareAdapt: async (organizationId, pieceId, request) => {
        scoped('PieceService.prepareAdapt', organizationId);
        pieceOf(pieceId);
        requests.push(['piece.adapt', pieceId, JSON.parse(JSON.stringify(request))]);
        const channel = rows.channels.find((one) => one.id === request.integrationId);
        if (!channel) {
          throw Object.assign(new Error('Канала нет.'), { code: 'INTEGRATION_NOT_FOUND' });
        }
        const firstOnChannel = !(rows.adaptations ?? []).some(
          (row) => row.pieceId === pieceId && row.integrationId === channel.id
        );
        return { pieceId, request, channel, firstOnChannel, kind: request.kind ?? 'post' };
      },
      // The door's generator: the interview asks first on a new channel
      // (`asksBeforeAdapting`), otherwise the text is written and saved as a
      // new row — a repeat is a new variant, the old one stays.
      adapt: async function* (organizationId, plan, _userId, consent = {}) {
        scoped('PieceService.adapt', organizationId);
        const { channel, request } = plan;
        yield {
          name: 'adapt-started',
          pieceId: plan.pieceId,
          kind: plan.kind,
          channel: { id: channel.id, name: channel.name, providerIdentifier: channel.providerIdentifier },
        };
        const asks =
          plan.firstOnChannel &&
          !(request.answers ?? []).length &&
          !request.skipInterview &&
          !(request.decideKeys ?? []).length;
        if (asks) {
          await usage.executeAiOperation(organizationId, 'intake', async () => 'questions');
          const questions = (rows.adaptQuestions ?? []).map((one) => ({ ...one }));
          if (questions.length) {
            yield { name: 'questions', questions, round: 1 };
            return;
          }
        }
        await usage.executeAiOperation(organizationId, 'text_generation', async () => 'post');
        const adaptations = (rows.adaptations = rows.adaptations ?? []);
        // The mode as the write reads it (under the channel lock), and the
        // queue only with the call's consent (review W2 F2).
        const autopilot = channel.planMode === 'autopilot';
        const queued = autopilot && consent.queueAllowed !== false;
        const row = {
          id: `a${adaptations.length + 1}`,
          pieceId: plan.pieceId,
          kind: plan.kind,
          platform: channel.providerIdentifier,
          integrationId: channel.id,
          integrationName: channel.name,
          body: 'Текст поста.',
          mediaId: null,
          state: queued ? 'queued' : 'draft',
          plan: queued
            ? { status: 'queued', autopilot: true, current: true }
            : autopilot
              ? { status: 'reserved', autopilot: false, current: true, note: 'consent-needed' }
              : null,
          answers: (request.answers ?? []).map((one) => ({ ...one })),
          decideKeys: (request.decideKeys ?? []).slice(),
          skipInterview: request.skipInterview === true,
        };
        adaptations.push(row);
        writes.push(['adaptation.created', row.id, channel.id]);
        yield { name: 'adaptation', adaptation: { ...row } };
        yield { name: 'done', adaptationId: row.id, postId: null };
      },
      editAdaptation: async (organizationId, pieceId, adaptationId, input) => {
        scoped('PieceService.editAdaptation', organizationId);
        const row = (rows.adaptations ?? []).find((one) => one.id === adaptationId && one.pieceId === pieceId);
        if (!row) throw Object.assign(new Error('Адаптации нет.'), { code: 'ADAPTATION_NOT_FOUND' });
        requests.push(['adaptation.edit', pieceId, adaptationId, JSON.parse(JSON.stringify(input))]);
        // The picture is a live library item of this workspace, read by the
        // real `PieceRepository.findMedia` — else nothing is written.
        if (input.image) {
          const media = await pieceRepository.findMedia(organizationId, String(input.image.id ?? ''));
          if (!media) {
            throw Object.assign(new Error('Такой картинки в медиатеке нет.'), { code: 'ADAPTATION_MEDIA_UNKNOWN' });
          }
        }
        if (typeof input.body === 'string') row.body = input.body;
        if (input.image !== undefined) row.mediaId = input.image ? input.image.id : null;
        writes.push(['adaptation.edited', adaptationId]);
        return { adaptation: { ...row } };
      },
      deleteAdaptation: async (organizationId, pieceId, adaptationId) => {
        scoped('PieceService.deleteAdaptation', organizationId);
        const before = (rows.adaptations ?? []).length;
        rows.adaptations = (rows.adaptations ?? []).filter(
          (one) => !(one.id === adaptationId && one.pieceId === pieceId)
        );
        if (rows.adaptations.length === before) {
          throw Object.assign(new Error('Адаптации нет.'), { code: 'ADAPTATION_NOT_FOUND' });
        }
        writes.push(['adaptation.deleted', adaptationId]);
      },
      /* ---- The plan (kcxz.15): the calendar doors' services -------------- */
      // The picker's rows: drafts and queued posts that can enter or move.
      readyAdaptations: async (organizationId, limit, integrationIds) => {
        scoped('PieceService.readyAdaptations', organizationId);
        requests.push(['plan.ready', limit, integrationIds ?? null]);
        return {
          version: 'ready-adaptations/v1',
          items: (rows.adaptations ?? [])
            .filter((row) => row.postId && ['draft', 'queued'].includes(row.state))
            .filter((row) => !integrationIds || integrationIds.includes(row.integrationId))
            .map((row) => ({
              adaptationId: row.id,
              pieceId: row.pieceId,
              pieceCode: pieceOf(row.pieceId).code,
              title: pieceOf(row.pieceId).title,
              firstLine: row.body ?? '',
              integrationId: row.integrationId,
              postId: row.postId,
              readyAt: '2026-09-27T10:00:00.000Z',
              slot: row.state === 'queued'
                ? { status: 'queued', date: row.date, autopilot: false }
                : row.plan?.status === 'reserved'
                  ? { status: 'reserved', date: row.date, autopilot: false }
                  : { status: 'free', date: null, autopilot: false },
            })),
        };
      },
      // «Поставить на ЧЧ:ММ»: by the channel's mode — a reserve, a draft with a
      // time, or on autopilot the queue; a queued post moves and stays queued.
      placeAdaptation: async (organizationId, pieceId, adaptationId, input, _language, consent = {}) => {
        scoped('PieceService.placeAdaptation', organizationId);
        requests.push(['plan.place', pieceId, adaptationId, { ...input }]);
        const row = adaptationOf(pieceId, adaptationId);
        // Read as the lock reads it: now, not when the capability checked —
        // the post's own mode first (`planModeFor`).
        const piece = pieceOf(pieceId);
        let mode = piece.planModes?.[row.integrationId] ?? channelOf(row.integrationId).planMode;
        if (consent.queueAllowed === false && (row.state === 'queued' || mode === 'autopilot')) {
          throw Object.assign(new Error('Поставить так значит отправить без подтверждения.'), {
            code: 'ADAPTATION_QUEUE_NEEDS_CONSENT',
            status: 409,
          });
        }
        // The chat's «поставь бронью» on a channel «Без плана»: this post's own
        // mode becomes «Бронь» under the lock (kcxz.31 D5). `noPostModes`: a
        // store without the tag columns, where the post stays a draft.
        if (consent.reserve === true && mode === 'draft' && row.state === 'draft' && !rows.noPostModes) {
          piece.planModes = { ...(piece.planModes ?? {}), [row.integrationId]: 'reserve' };
          writes.push(['post.mode', pieceId, row.integrationId, 'reserve']);
          mode = 'reserve';
        }
        let status;
        if (row.state === 'queued') status = 'queued';
        else if (mode === 'autopilot') {
          row.state = 'queued';
          status = 'queued';
        } else status = mode === 'draft' ? 'draft' : 'reserved';
        row.date = input.date;
        row.plan = { status, date: input.date, autopilot: mode === 'autopilot', current: true };
        writes.push(['plan.placed', adaptationId, status, input.date]);
        return {
          adaptation: { ...row },
          placement: { mode, status, date: input.date, autopilot: mode === 'autopilot', note: null },
        };
      },
      // «Запланировать» / «Опубликовать сейчас»: the draft joins the queue.
      scheduleAdaptation: async (organizationId, pieceId, adaptationId, input) => {
        scoped('PieceService.scheduleAdaptation', organizationId);
        requests.push(['plan.schedule', pieceId, adaptationId, { ...input }]);
        const row = adaptationOf(pieceId, adaptationId);
        if ((rows.queueBusy ?? []).includes(adaptationId)) {
          throw Object.assign(
            new Error('Другая версия этой заготовки уже выходит в этом канале. Дождитесь её выхода или выберите время позже.'),
            { code: 'ADAPTATION_QUEUE_BUSY', status: 409 }
          );
        }
        if (row.state !== 'draft') {
          throw Object.assign(
            new Error('Этот пост уже не черновик. Чтобы править его, сначала снимите его с расписания.'),
            { code: 'ADAPTATION_NOT_DRAFT', status: 409 }
          );
        }
        const date = input.now === true ? NOW : input.date;
        row.state = 'queued';
        row.date = date;
        row.plan = { status: 'queued', date, autopilot: false, current: true };
        writes.push(['plan.scheduled', adaptationId, input.now === true ? 'now' : date]);
        return { adaptation: { ...row } };
      },
      unscheduleAdaptation: async (organizationId, pieceId, adaptationId) => {
        scoped('PieceService.unscheduleAdaptation', organizationId);
        requests.push(['plan.unschedule', pieceId, adaptationId]);
        const row = adaptationOf(pieceId, adaptationId);
        if (row.state !== 'queued') {
          throw Object.assign(new Error('Этот пост не стоит в расписании: снимать нечего.'), {
            code: 'ADAPTATION_NOT_QUEUED',
            status: 409,
          });
        }
        row.state = 'draft';
        row.plan = { status: 'reserved', date: row.date, autopilot: false, current: true };
        writes.push(['plan.unscheduled', adaptationId]);
        return { adaptation: { ...row } };
      },
      // Written posts of the channel the mode would change.
      channelPlanImpact: async (organizationId, integrationId) => {
        scoped('PieceService.channelPlanImpact', organizationId);
        const channel = channelOf(integrationId);
        return { integrationId, planMode: channel.planMode, count: toApply(integrationId).length };
      },
      applyChannelPlanMode: async (organizationId, integrationId, expected) => {
        scoped('PieceService.applyChannelPlanMode', organizationId);
        requests.push(['plan.apply', integrationId, { planMode: expected }]);
        const channel = channelOf(integrationId);
        if (expected !== channel.planMode) {
          throw Object.assign(
            new Error('Режим канала уже сменился. Написанные посты не тронуты — выберите, к каким применить новый режим.'),
            { code: 'CHANNEL_PLAN_MODE_CHANGED', status: 409 }
          );
        }
        const changed = toApply(integrationId);
        for (const row of changed) {
          if (channel.planMode === 'autopilot') row.state = 'queued';
          row.plan = {
            status: channel.planMode === 'autopilot' ? 'queued' : channel.planMode === 'reserve' ? 'reserved' : 'draft',
            date: row.date ?? null,
            autopilot: channel.planMode === 'autopilot',
            current: true,
          };
        }
        writes.push(['plan.applied', integrationId, channel.planMode, changed.length]);
        return { integrationId, planMode: channel.planMode, count: changed.length, applied: changed.length };
      },
      prepareAnswer: async (organizationId, pieceId, request, language) => {
        scoped('PieceService.prepareAnswer', organizationId);
        const piece = rows.pieces.find((one) => one.id === pieceId);
        if (!piece) {
          throw Object.assign(new Error('Заготовка не найдена.'), { code: 'PIECE_NOT_FOUND' });
        }
        if (piece.archivedAt) {
          throw Object.assign(new Error('Заготовка в архиве.'), { code: 'PIECE_ARCHIVED' });
        }
        requests.push(['piece.answer', pieceId, JSON.parse(JSON.stringify(request))]);
        return {
          pieceId,
          language,
          request,
          core: { questions: { items: piece.questions ?? [] }, ...(piece.postLink ? { postLink: piece.postLink } : {}) },
        };
      },
      // The door's generator: at most one `draft` generation under `intake`,
      // every open question closed by an answer or by «Решите за меня».
      answer: async function* (organizationId, plan, userId) {
        scoped('PieceService.answer', organizationId);
        const piece = rows.pieces.find((one) => one.id === plan.pieceId);
        yield { name: 'answer-started', pieceId: plan.pieceId, round: 1 };
        // `writeCore`: operation `intake`; the `draft` role is the model's, not the row's.
        await usage.executeAiOperation(organizationId, 'intake', async () => 'rewritten');
        const given = plan.request.answers ?? [];
        piece.answers = (piece.questions ?? []).map((question) => {
          const answer = given.find((one) =>
            question.key ? one.key === question.key : !one.key && one.field === question.field
          );
          return answer
            ? { field: question.field, ...(question.key ? { key: question.key } : {}), text: answer.text, origin: 'person' }
            : { field: question.field, ...(question.key ? { key: question.key } : {}), text: '', origin: 'model' };
        });
        piece.questions = [];
        // kcxz.37 (F9): everything handed over closes an asked link question
        // as «Без ссылки»; a link the person gave stays.
        if (piece.linkQuestion && !piece.postLink && !given.length) {
          piece.postLink = { url: null, origin: 'author', answeredAt: '2026-09-27T12:00:00.000Z' };
        }
        writes.push(['piece.answered', piece.id, userId]);
        // The stored answers ride on the event, as `PieceService.answer` sends them.
        yield {
          name: 'piece',
          pieceId: piece.id,
          code: piece.code,
          core: {
            text: 'Новая суть.',
            questions: { answered: piece.answers },
            ...(piece.postLink ? { postLink: piece.postLink } : {}),
          },
        };
        yield { name: 'done', pieceId: piece.id };
      },
      updateTitle: async (organizationId, pieceId, title) => {
        scoped('PieceService.updateTitle', organizationId);
        const piece = rows.pieces.find((one) => one.id === pieceId);
        if (!piece) throw notFound('piece');
        piece.title = title;
        writes.push(['piece.title', pieceId, title]);
        return { ...piece };
      },
      approvalSubject: async (organizationId, pieceId) => {
        scoped('PieceService.approvalSubject', organizationId);
        const index = rows.pieces.findIndex((one) => one.id === pieceId);
        if (index === -1) return null;
        const piece = rows.pieces[index];
        return { id: piece.id, code: piece.code, title: piece.title };
      },
      delete: async (organizationId, pieceId) => {
        scoped('PieceService.delete', organizationId);
        const before = rows.pieces.length;
        rows.pieces = rows.pieces.filter((one) => one.id !== pieceId);
        if (rows.pieces.length === before) throw notFound('piece');
        writes.push(['piece.deleted', pieceId]);
      },
    },
    IntakeService: {
      prepare: async (organizationId, body) => {
        scoped('IntakeService.prepare', organizationId);
        requests.push(['intake', JSON.parse(JSON.stringify(body))]);
        return { planned: body };
      },
      run: async function* (organizationId, plan, userId) {
        scoped('IntakeService.run', organizationId);
        const body = plan.planned;
        const kind = body.inputKind ?? 'thought';
        // A second request with the kept rows continues the first one's
        // snapshot instead of repeating it (`75xn.19`).
        const resumed = Array.isArray(body.researchSelections)
          ? rows.snapshots?.[body.snapshotKey] ?? null
          : null;
        yield { name: 'intake-started', inputKind: kind, sources: [kind] };
        if (!resumed) {
          // The door's generator: its model step is an `intake` operation.
          await usage.executeAiOperation(organizationId, 'intake', async () => 'extracted');
          if (kind === 'foreign_post') {
            yield { name: 'claims', claims: [{ statement: 'Созвоны съедают день' }] };
          }
        }
        yield { name: 'brief-started' };
        const research = body.options?.researchEnabled === true;
        if (research && !resumed) {
          const level = body.options.researchLevel;
          yield { name: 'research-started', level, count: 3 };
          await usage.executeAiOperation(organizationId, 'web_research', async () => 'found');
          const facts = (rows.researchFacts ?? []).map((fact) => ({ ...fact }));
          if (!Array.isArray(body.researchSelections)) {
            const snapshotKey = `snap-${Object.keys(rows.snapshots ?? {}).length + 1}`;
            rows.snapshots = { ...(rows.snapshots ?? {}), [snapshotKey]: { facts, level } };
            yield { name: 'research-ready', level, facts, snapshotKey, corrections: [] };
            yield {
              name: 'research-selection-required',
              level,
              facts,
              snapshotKey,
              corrections: [],
            };
            yield { name: 'brief-filled', brief: { facts } };
            yield { name: 'done', pieceId: null };
            return;
          }
        }
        if (resumed) {
          yield { name: 'research-ready', level: resumed.level, facts: resumed.facts, snapshotKey: body.snapshotKey, corrections: [] };
        }
        yield { name: 'brief-filled', brief: {} };
        const number = rows.nextPiece++;
        const piece = {
          id: `p${number}`,
          code: `cnt-${number}`,
          title: String(body.input).slice(0, 40),
          archivedAt: null,
          body: body.input,
          inputKind: kind,
          language: body.language,
          research: body.options?.researchEnabled ?? null,
          ...(Array.isArray(body.researchSelections)
            ? { facts: body.researchSelections.slice() }
            : {}),
          createdBy: userId,
          questions: (
            rows.intakeQuestions ?? [
              { field: 'audience', question: 'Для кого?' },
              { field: 'facts', key: 'ask-1', question: 'Какой итог?' },
            ]
          ).map((question) => ({ ...question })),
          answers: [],
        };
        // The core is written now only when nothing is left to ask
        // (`finish`): `writeCore` admits its own `intake` operation.
        if (!piece.questions.length) {
          await usage.executeAiOperation(organizationId, 'intake', async () => 'core');
        }
        // The source line the intake keeps (`leadSourceOf`): the lead read
        // by id in this workspace, through the same function (kcxz.23).
        if (body.sourceLeadId) {
          const lead = await leadRepository().getLead(organizationId, body.sourceLeadId).catch(() => null);
          const source = pieceLeadSource(body.sourceLeadId, lead);
          if (source) piece.leadSource = source;
        }
        rows.pieces.push(piece);
        writes.push(['piece.created', piece.id]);
        yield { name: 'piece', pieceId: piece.id, code: piece.code, core: { body: piece.body } };
        // The event `IntakeService.run` yields after the piece (not the wire
        // contract's `piece-questions`, which the service never yields: the
        // fake used it and hid kcxz.29 D4).
        yield { name: 'questions', questions: piece.questions, round: 0 };
        yield { name: 'done', pieceId: piece.id };
      },
    },
    IntegrationService: {
      getIntegrationsForChannelList: async (organizationId) => {
        scoped('IntegrationService.getIntegrationsForChannelList', organizationId);
        // `times` are the stored slots (minutes after UTC midnight), as the
        // repository keeps them in `postingTimes` (kcxz.19).
        return rows.channels.map(({ posts, planMode, profile, times, ...channel }) => ({
          ...channel,
          postingTimes: JSON.stringify((times ?? []).map((time) => ({ time }))),
          _count: { posts },
        }));
      },
      getWritingProfile: async (organizationId, id) => {
        scoped('IntegrationService.getWritingProfile', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        // A card never saved reads as the platform's defaults, as
        // `resolveChannelWritingProfile` answers it — the real ones (a
        // Telegram card's 500–1000/1500 among them), so a scenario sees the
        // numbers the stand shows (final recheck F-2a).
        const defaults = defaultWritingProfileFor(channel.providerIdentifier, 'ru');
        return {
          integrationId: id,
          profile: JSON.parse(JSON.stringify(channel.profile ?? defaults)),
          stored: !!channel.profile,
          provider: { maxLength: 4096 },
        };
      },
      updateWritingProfile: async (organizationId, id, body) => {
        scoped('IntegrationService.updateWritingProfile', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        requests.push(['channel.writing-profile', id, JSON.parse(JSON.stringify(body))]);
        // The service's floor for a range (`CHANNEL_MIN_IDEAL_LENGTH`, the
        // real constant) and the platform's ceiling, as its own refusals
        // (`HttpException` with a code in the response).
        const refuse = (reason) =>
          Object.assign(new Error('Unprocessable'), {
            getResponse: () => ({ code: 'CHANNEL_WRITING_PROFILE_INVALID', reason }),
          });
        if (
          body.lengthPolicy === 'range' &&
          body.length?.idealMin != null &&
          body.length.idealMin < CHANNEL_MIN_IDEAL_LENGTH
        ) {
          throw refuse('IDEAL_MIN_TOO_SMALL');
        }
        if (body.lengthPolicy === 'range' && body.length?.idealMax < CHANNEL_MIN_IDEAL_LENGTH) {
          throw refuse('IDEAL_MAX_TOO_SMALL');
        }
        if (body.lengthPolicy === 'range' && body.length?.idealMax > 4096) {
          throw refuse('IDEAL_MAX_ABOVE_PROVIDER');
        }
        if (
          body.lengthPolicy === 'range' &&
          body.length?.hardMax != null &&
          body.length.hardMax < body.length.idealMax
        ) {
          throw refuse('HARD_MAX_BELOW_IDEAL_MAX');
        }
        const { length, lengthPolicy, ...rest } = body;
        channel.profile = {
          ...(channel.profile ?? {}),
          ...rest,
          lengthPolicy:
            lengthPolicy === 'range'
              ? { idealMin: length.idealMin ?? null, idealMax: length.idealMax, hardMax: length.hardMax ?? null }
              : lengthPolicy,
        };
        writes.push(['channel.profile.updated', id]);
        return { integrationId: id, profile: body };
      },
      getPlanMode: async (organizationId, id) => {
        scoped('IntegrationService.getPlanMode', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        return {
          integrationId: id,
          planMode: planModeOf(channel.planMode),
          chosen: channel.planMode != null,
        };
      },
      // `PUT /integrations/:id/plan-mode` (kcxz.19).
      updatePlanMode: async (organizationId, id, planMode) => {
        scoped('IntegrationService.updatePlanMode', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        requests.push(['channel.plan-mode', id, planMode]);
        channel.planMode = planMode;
        writes.push(['channel.plan-mode', id, planMode]);
        return { integrationId: id, planMode };
      },
      // `POST /integrations/:id/time`: the whole list, as the time table sends it.
      setTimes: async (organizationId, id, body) => {
        scoped('IntegrationService.setTimes', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        requests.push(['channel.time', id, JSON.parse(JSON.stringify(body))]);
        channel.times = body.time.map((slot) => slot.time);
        writes.push(['channel.times', id]);
        return {};
      },
      // `GET /integrations/:id/posts`: the channel page's recent posts.
      getChannelPosts: async (organizationId, id, limit) => {
        scoped('IntegrationService.getChannelPosts', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        const posts = (rows.channelPosts ?? []).filter((post) => post.integrationId === id);
        return {
          total: posts.length,
          posts: posts.slice(0, limit).map(({ integrationId, ...post }) => post),
        };
      },
      // `POST /integrations/:id/nickname`, the service step (kcxz.19).
      changeNameOnPlatform: async (organizationId, id, body) => {
        scoped('IntegrationService.changeNameOnPlatform', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        requests.push(['channel.nickname', id, JSON.parse(JSON.stringify(body))]);
        channel.name = body.name;
        writes.push(['channel.renamed', id, body.name]);
        return { id, name: body.name };
      },
      disableChannel: async (organizationId, id) => {
        scoped('IntegrationService.disableChannel', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (channel) channel.disabled = true;
        writes.push(['channel.disabled', id]);
      },
      // The steps `DELETE /integrations` takes (`delete-channel.ts`). A
      // deleted channel stays as a row with `deletedAt`, as in the database:
      // the list does not show it, the door's lookup by id still finds it.
      // The platform's audience answer (`/analytics/:integration`): the door
      // reads only the organisation's id; an id outside it is refused as the
      // service refuses it.
      checkAnalytics: async (org, id, date, forceRefresh, options) => {
        scoped('IntegrationService.checkAnalytics', org?.id);
        return audienceService().checkAnalytics(org, id, date, forceRefresh, options);
      },
      getIntegrationById: async (organizationId, id) => {
        scoped('IntegrationService.getIntegrationById', organizationId);
        return (
          rows.channels.find((one) => one.id === id) ??
          (rows.deletedChannels ?? []).find((one) => one.id === id) ??
          null
        );
      },
      deleteChannel: async (organizationId, id) => {
        scoped('IntegrationService.deleteChannel', organizationId);
        const channel =
          rows.channels.find((one) => one.id === id) ??
          (rows.deletedChannels ?? []).find((one) => one.id === id);
        rows.channels = rows.channels.filter((one) => one.id !== id);
        if (channel) rows.deletedChannels = [...(rows.deletedChannels ?? []).filter((one) => one.id !== id), channel];
        writes.push(['channel.deleted', id]);
        return channel;
      },
    },
    // The platforms as `GET /integrations` lists them for the add-channel
    // screen, with the flags it reads (kcxz.19).
    IntegrationManager: {
      getAllIntegrations: async () => ({
        social: [
          { identifier: 'telegram', name: 'Telegram', isWeb3: true, isExternal: false, isChromeExtension: false },
          { identifier: 'linkedin', name: 'LinkedIn', isWeb3: false, isExternal: false, isChromeExtension: false },
          { identifier: 'mastodon', name: 'Mastodon', isWeb3: false, isExternal: true, isChromeExtension: false },
          { identifier: 'discord', name: 'Discord', isWeb3: false, isExternal: false, isChromeExtension: false },
        ],
      }),
      getSocialIntegration: (identifier) =>
        // Discord renames its bot; Slack's `changeNickname` only echoes the name.
        identifier === 'discord' || identifier === 'slack' ? { changeNickname: async () => ({ name: '' }) } : {},
    },
    VoiceService: {
      avatars: async ({ organizationId }) => {
        scoped('VoiceService.avatars', organizationId);
        return {
          state: rows.avatars.length ? 'default' : 'empty',
          avatars: rows.avatars.map(avatarRow),
          defaultAvatarId: rows.avatars.find((avatar) => avatar.isDefault && avatar.analysed)?.id ?? null,
          limit: 8,
          canManage: true,
        };
      },
      // What the activation would refuse, asked before the consent card
      // (kcxz.29, D7). An avatar row with `ready: false` has empty lines;
      // the hand-written path also refuses while one of its five is empty.
      activationBlocker: async (actor, mode) => {
        scoped('VoiceService.activationBlocker', actor.organizationId);
        const avatar = actor.avatarId
          ? rows.avatars.find((one) => one.id === actor.avatarId)
          : rows.avatars.find((one) => one.isDefault);
        if (!avatar) {
          return Object.assign(new Error('Предложения голоса нет.'), {
            name: 'VoiceError',
            code: 'VOICE_PROFILE_NOT_FOUND',
          });
        }
        const manualGaps =
          mode === 'manual' && avatar.manual
            ? MANUAL_LINES.filter((key) => !String(avatar.manual[key] ?? '').trim()).length
            : 0;
        return avatar.ready === false || manualGaps
          ? Object.assign(
              new Error(`Голос нельзя включить (${mode}), пока пусто строк: ${manualGaps || 1}.`),
              { name: 'VoiceError', code: 'VOICE_FIELDS_INCOMPLETE' }
            )
          : null;
      },
      activateProposal: async (actor, body) => {
        scoped('VoiceService.activateProposal', actor.organizationId);
        const avatar = actor.avatarId
          ? rows.avatars.find((one) => one.id === actor.avatarId)
          : rows.avatars.find((one) => one.isDefault);
        if (!avatar) throw notFound('avatar');
        if (!actor.canManage || body.consentGiven !== true) {
          throw Object.assign(new Error('refused'), { code: 'VOICE_REFUSED' });
        }
        avatar.active = true;
        if (body.avatarName) avatar.name = body.avatarName;
        writes.push(['avatar.activated', avatar.id, body.mode ?? null]);
        return { state: {}, voice: { name: avatar.name } };
      },
      /* ---- The rest of the avatar screen's doors (kcxz.18) ------------------ */
      overview: async (actor) => {
        scoped('VoiceService.overview', actor.organizationId);
        const avatar = voiceAvatar(actor);
        return {
          hasVoice: avatar?.active === true,
          state: avatar?.active ? 'default' : 'empty',
          readiness: readinessOf(avatar),
        };
      },
      analysis: async (actor) => {
        scoped('VoiceService.analysis', actor.organizationId);
        const avatar = voiceAvatar(actor);
        const run = avatar?.run;
        if (!run) return { outcome: 'insufficient', readiness: readinessOf(avatar) };
        const now = (avatar.samples ?? []).map((one) => one.code).sort().join(',');
        return {
          outcome: 'ready',
          sampleCount: run.corpus.length,
          hasProposal: run.proposal === true,
          corpusChanged: now !== run.corpus.slice().sort().join(','),
          // `recent`: a run started a minute ago, still finishing on the server.
          measuredAt:
            run.measuredAt === 'recent'
              ? new Date(Date.now() - 60_000).toISOString()
              : run.measuredAt,
          // The run ended without its proposal (`kcxz.40`), as the service
          // reads `proposalFailedAt` off the row.
          ...(run.failed ? { proposalFailed: true } : {}),
        };
      },
      assertAnalysisAllowed: (actor) => {
        scoped('VoiceService.assertAnalysisAllowed', actor.organizationId);
        if (!actor.canManage) throw voiceError('VOICE_FORBIDDEN', 'Разбор — право редактора.');
      },
      // The streaming door's generator: the arithmetic is stored first, then
      // one `text_generation` operation per AI call, then the proposal.
      analysisStream: async function* (actor, body) {
        scoped('VoiceService.analysisStream', actor.organizationId);
        const avatar = voiceAvatar(actor);
        requests.push(['voice.analysis', avatar?.id ?? null, { ...body }]);
        yield { name: 'started', samples: 0, planned: 0 };
        // `runningElsewhere`: the avatar screen (or another tab) started this
        // avatar's analysis a moment ago and holds the claim.
        if (avatar?.runningElsewhere) {
          await claimVoiceAnalysis(analysisLocks, actor.organizationId, avatar.id);
        }
        const release = await claimVoiceAnalysis(analysisLocks, actor.organizationId, avatar?.id ?? null);
        if (!release) {
          throw voiceError('VOICE_ANALYSIS_RUNNING', 'Разбор этого аватара уже идёт — второй не запущен и ничего не потрачено.');
        }
        let measured = false;
        let finished = false;
        try {
          const readiness = readinessOf(avatar);
          if (!readiness.ready) {
            yield { name: 'done', analysis: { outcome: 'insufficient', readiness } };
            finished = true;
            return;
          }
          const corpus = avatar.samples.map((one) => one.code);
          yield { name: 'started', samples: corpus.length, planned: corpus.length };
          avatar.run = { corpus, proposal: false, measuredAt: new Date().toISOString() };
          measured = true;
          writes.push(['avatar.measured', avatar.id, corpus.length]);
          yield { name: 'measured', measurementId: `m-${avatar.id}`, sampleCount: corpus.length, charCount: readiness.charCount, wordCount: 0, sentenceCount: 0 };
          await usage.executeAiOperation(actor.organizationId, 'text_generation', async () => 'map');
          yield { name: 'call', stage: 'map', index: 1, total: 1, ok: true };
          if (rows.assistFails) {
            // A number fails that many runs; `true` fails every one.
            if (typeof rows.assistFails === 'number') rows.assistFails -= 1;
            throw voiceError('VOICE_ASSIST_UNAVAILABLE', 'Агентный слепок недоступен: ИИ не ответил. Числа разбора сохранены.');
          }
          avatar.run.proposal = true;
          avatar.fields = (rows.proposalFields ?? DEFAULT_PROPOSAL).map((one) => ({ ...one }));
          writes.push(['avatar.proposed', avatar.id]);
          yield { name: 'done', analysis: { outcome: 'ready', sampleCount: corpus.length } };
          finished = true;
        } finally {
          // The service marks the row of a run that saved and did not finish.
          if (measured && !finished) {
            avatar.run.failed = true;
            writes.push(['avatar.analysis-failed', avatar.id]);
          }
          await release();
        }
      },
      proposal: async (actor) => {
        scoped('VoiceService.proposal', actor.organizationId);
        const avatar = voiceAvatar(actor);
        if (!avatar?.run) return { outcome: 'insufficient', readiness: readinessOf(avatar) };
        return {
          outcome: 'ready',
          state: 'default',
          mode: 'assist',
          portrait: { text: 'Портрет.', status: 'ACCEPTED', observationRefs: [] },
          fields: (avatar.fields ?? []).map((one) => ({ ...one, observationRefs: [] })),
          observations: [{ ref: 'o1' }, { ref: 'o2' }],
        };
      },
      proposalField: async (actor, body) => {
        scoped('VoiceService.proposalField', actor.organizationId);
        const avatar = voiceAvatar(actor);
        requests.push(['voice.proposal.field', avatar?.id ?? null, { ...body }]);
        const field = (avatar?.fields ?? []).find((one) => one.key === body.key);
        if (!field) {
          if (body.action !== 'SAVE' || !body.text) throw voiceError('VOICE_PROFILE_NOT_FOUND', `Поле ${body.key} не предложено.`);
          avatar.fields.push({ key: body.key, text: body.text, status: 'ACCEPTED' });
        } else {
          if (body.action === 'SAVE' && body.text) field.text = body.text;
          field.status = 'ACCEPTED';
        }
        writes.push(['avatar.proposal.field', avatar.id, body.key, body.action]);
        return servicesFor({ usage }).VoiceService.proposal(actor);
      },
      manualProposal: async (actor) => {
        scoped('VoiceService.manualProposal', actor.organizationId);
        const avatar = voiceAvatar(actor);
        return {
          outcome: 'ready',
          state: 'default',
          mode: 'manual',
          fields: MANUAL_LINES.map((key) => ({
            key,
            text: String(avatar?.manual?.[key] ?? ''),
            status: avatar?.manual?.[key] ? 'ACCEPTED' : 'UNDECIDED',
          })),
          observations: [],
        };
      },
      manualField: async (actor, body) => {
        scoped('VoiceService.manualField', actor.organizationId);
        if (!actor.canManage) throw voiceError('VOICE_FORBIDDEN', 'Нет прав.');
        const avatar = voiceAvatar(actor);
        // A line the panel's form changed meanwhile (`manualFieldConflicts`):
        // the draft's revision check refuses it (correctness review F4).
        if ((rows.manualFieldConflicts ?? []).includes(body.key)) {
          throw voiceError('VOICE_REVISION_CONFLICT', 'Черновик изменился, пока строка сохранялась.');
        }
        requests.push(['voice.manual.field', avatar?.id ?? null, { ...body }]);
        avatar.manual = { ...(avatar.manual ?? {}), [body.key]: body.text };
        writes.push(['avatar.manual.field', avatar.id, body.key]);
        return servicesFor({ usage }).VoiceService.manualProposal(actor);
      },
      samples: async (actor) => {
        scoped('VoiceService.samples', actor.organizationId);
        const avatar = voiceAvatar(actor);
        return {
          state: avatar?.samples?.length ? 'default' : 'empty',
          samples: (avatar?.samples ?? []).map((one) => ({ ...one })),
          sources: [],
          readiness: readinessOf(avatar),
        };
      },
      intake: async (actor, body) => {
        scoped('VoiceService.intake', actor.organizationId);
        if (!actor.canManage) throw voiceError('VOICE_FORBIDDEN', 'Нет прав.');
        const avatar = voiceAvatar(actor);
        requests.push(['voice.intake', avatar?.id ?? null, JSON.parse(JSON.stringify(body))]);
        const accepted = [];
        const rejected = [];
        for (const item of body.items) {
          if (item.text.trim().length < 40) {
            rejected.push({ title: item.title, reason: 'TOO_SHORT' });
            continue;
          }
          const row = {
            id: `s-${nextSample}`,
            code: `smp-${String(nextSample++).padStart(2, '0')}`,
            title: item.title,
            origin: body.origin,
            usagePurpose: body.usagePurpose,
            charCount: item.text.length,
          };
          avatar.samples = [...(avatar.samples ?? []), row];
          accepted.push(row);
        }
        writes.push(['avatar.samples.added', avatar.id, accepted.length]);
        return { accepted, rejected, readiness: readinessOf(avatar) };
      },
      deleteSamples: async (actor, body) => {
        scoped('VoiceService.deleteSamples', actor.organizationId);
        const all = rows.avatars.flatMap((one) => one.samples ?? []);
        for (const code of body.codes) {
          if (!all.some((one) => one.code === code)) {
            throw voiceError('VOICE_SAMPLE_NOT_FOUND', `Образец ${code} не найден.`);
          }
        }
        for (const avatar of rows.avatars) {
          avatar.samples = (avatar.samples ?? []).filter((one) => !body.codes.includes(one.code));
        }
        writes.push(['avatar.samples.deleted', body.codes.slice()]);
        return servicesFor({ usage }).VoiceService.samples(actor);
      },
      createAvatar: async (actor, body) => {
        scoped('VoiceService.createAvatar', actor.organizationId);
        if (!actor.canManage) throw voiceError('VOICE_FORBIDDEN', 'Нет прав.');
        const id = `00000000-0000-4000-8000-${String(rows.avatars.length + 100).padStart(12, '0')}`;
        rows.avatars.push({
          id,
          name: body.name ?? null,
          kind: body.kind ?? 'PERSON',
          isDefault: !rows.avatars.length,
          analysed: false,
          active: false,
          samples: [],
        });
        writes.push(['avatar.created', id, body.kind ?? 'PERSON']);
        return { ...(await servicesFor({ usage }).VoiceService.avatars(actor)), createdAvatarId: id };
      },
      updateAvatar: async (actor, body) => {
        scoped('VoiceService.updateAvatar', actor.organizationId);
        const avatar = voiceAvatar({ ...actor, avatarId: body.avatarId });
        avatar.name = body.name;
        writes.push(['avatar.renamed', avatar.id, body.name]);
        return servicesFor({ usage }).VoiceService.avatars(actor);
      },
      setDefaultAvatar: async (actor, body) => {
        scoped('VoiceService.setDefaultAvatar', actor.organizationId);
        const avatar = voiceAvatar({ ...actor, avatarId: body.avatarId });
        if (!avatar.analysed) throw voiceError('VOICE_AVATAR_NOT_ANALYSED', 'Аватар ещё не пишет.');
        for (const one of rows.avatars) one.isDefault = one.id === avatar.id;
        writes.push(['avatar.default', avatar.id]);
        return servicesFor({ usage }).VoiceService.avatars(actor);
      },
      deleteAvatar: async (actor, body) => {
        scoped('VoiceService.deleteAvatar', actor.organizationId);
        const avatar = voiceAvatar({ ...actor, avatarId: body.avatarId });
        const successor = body.successorId
          ? voiceAvatar({ ...actor, avatarId: body.successorId })
          : null;
        if (avatar.isDefault && rows.avatars.length > 1 && !successor) {
          throw voiceError('VOICE_AVATAR_SUCCESSOR_REQUIRED', 'Назовите преемника.');
        }
        if (successor) {
          successor.samples = [...(successor.samples ?? []), ...(avatar.samples ?? [])];
          if (avatar.isDefault) successor.isDefault = true;
        }
        rows.avatars = rows.avatars.filter((one) => one.id !== avatar.id);
        writes.push(['avatar.deleted', avatar.id, successor?.id ?? null]);
        return servicesFor({ usage }).VoiceService.avatars(actor);
      },
      learning: async (actor) => {
        scoped('VoiceService.learning', actor.organizationId);
        const avatar = voiceAvatar(actor);
        return {
          pending: avatar?.edits ?? 0,
          rules: (avatar?.rules ?? []).map((one) => ({ ...one })),
          minPairs: 5,
          maxRules: 12,
          canLearn: actor.canManage,
          lastRunAt: avatar?.lastRunAt ?? null,
        };
      },
      learnFromEdits: async (actor) => {
        scoped('VoiceService.learnFromEdits', actor.organizationId);
        const avatar = voiceAvatar(actor);
        if ((avatar.edits ?? 0) < 5) {
          throw voiceError('VOICE_LEARN_NOT_ENOUGH', `Правок пока ${avatar.edits ?? 0} из 5.`);
        }
        await usage.executeAiOperation(actor.organizationId, 'text_generation', async () => 'rules');
        avatar.rules = [...(avatar.rules ?? []), { id: `r-${(avatar.rules ?? []).length + 1}`, text: 'Короче вступление.', pairs: avatar.edits, learnedAt: NOW }];
        avatar.edits = 0;
        avatar.lastRunAt = NOW;
        writes.push(['avatar.learned', avatar.id]);
        return servicesFor({ usage }).VoiceService.learning(actor);
      },
      forgetLearnedRule: async (actor, body) => {
        scoped('VoiceService.forgetLearnedRule', actor.organizationId);
        const avatar = voiceAvatar(actor);
        if (!(avatar.rules ?? []).some((one) => one.id === body.ruleId)) {
          throw voiceError('VOICE_LEARN_RULE_NOT_FOUND', 'Такого правила нет.');
        }
        avatar.rules = avatar.rules.filter((one) => one.id !== body.ruleId);
        writes.push(['avatar.rule.forgotten', avatar.id, body.ruleId]);
        return servicesFor({ usage }).VoiceService.learning(actor);
      },
      deleteProfile: async (actor) => {
        scoped('VoiceService.deleteProfile', actor.organizationId);
        const avatar = voiceAvatar(actor);
        avatar.active = false;
        avatar.analysed = false;
        writes.push(['avatar.retired', avatar.id]);
        return { state: 'empty' };
      },
    },
    PostsService: {
      // «Производство» as the service counts it: the repository's rows of the
      // window (published or failed, root posts, this organisation, the
      // channel when named), counted by the real function.
      getProductionAnalytics: async (organizationId, days, integrationId) => {
        scoped('PostsService.getProductionAnalytics', organizationId);
        // The real step on the scenario clock; only its repository read is
        // the world's.
        return productionService().getProductionAnalytics(organizationId, days, integrationId, new Date(NOW));
      },
      // A channel's root posts, not deleted: a post is an adaptation row's
      // `postId` on that channel (review W3-19 P3-8).
      channelPostIds: async (organizationId, integrationId) => {
        scoped('PostsService.channelPostIds', organizationId);
        if (!integrationId) throw new Error('channelRootPosts requires a channel id');
        return [
          ...new Set(
            (rows.adaptations ?? [])
              .filter((row) => row.integrationId === integrationId && row.postId)
              .map((row) => row.postId)
          ),
        ].sort();
      },
      // Only this channel's posts (`delete-channel.ts`, review W3-19 P2-1).
      deleteChannelPosts: async (organizationId, integrationId) => {
        scoped('PostsService.deleteChannelPosts', organizationId);
        if (!integrationId) throw new Error('deleteChannelPosts requires a channel id');
        const ids = [
          ...new Set(
            (rows.adaptations ?? [])
              .filter((row) => row.integrationId === integrationId && row.postId)
              .map((row) => row.postId)
          ),
        ].sort();
        rows.adaptations = (rows.adaptations ?? []).filter((row) => row.integrationId !== integrationId || !row.postId);
        for (const id of ids) writes.push(['post.deleted', id]);
        return ids;
      },
      // `/analytics/ahead`: reserves and queued posts from today, by channel.
      getPlanAhead: async (organizationId, query) => {
        scoped('PostsService.getPlanAhead', organizationId);
        requests.push(['plan.ahead', { ...query }]);
        const live = (rows.adaptations ?? []).filter((row) => row.date && row.state !== 'published');
        const counts = (list) => {
          const reserved = list.filter((row) => row.state === 'draft' && row.plan?.status === 'reserved').length;
          const queued = list.filter((row) => row.state === 'queued').length;
          const dates = list.map((row) => row.date).sort();
          return { reserved, queued, planned: reserved + queued, planUntil: dates.length ? dates.at(-1).slice(0, 10) : null };
        };
        return {
          version: 'plan-ahead/v2',
          today: NOW.slice(0, 10),
          timeZone: query.timeZone,
          horizon: 60,
          days: 0,
          until: null,
          emptyFrom: NOW.slice(0, 10),
          daysWithPosts: 0,
          strip: [],
          published7d: 0,
          ...counts(live),
          channels: rows.channels.map((channel) => ({
            integrationId: channel.id,
            name: channel.name,
            days: 0,
            until: null,
            emptyFrom: NOW.slice(0, 10),
            published7d: 0,
            ...counts(live.filter((row) => row.integrationId === channel.id)),
          })),
        };
      },
      // The calendar's read (`GET /posts`): posts between the two instants.
      getPosts: async (organizationId, query) => {
        scoped('PostsService.getPosts', organizationId);
        requests.push(['plan.calendar', { ...query }]);
        const from = new Date(query.startDate).getTime();
        const to = new Date(query.endDate).getTime();
        return (rows.adaptations ?? [])
          .filter((row) => row.postId && row.date)
          .filter((row) => !query.integrationId || row.integrationId === query.integrationId)
          .filter((row) => new Date(row.date).getTime() >= from && new Date(row.date).getTime() <= to)
          .map(postOf);
      },
      // `PUT /posts/:id/date`: a queued CF variant passes the one-queue gate.
      // `unscheduleBeforeMove`: the person takes the post off the schedule
      // after the capability read it as queued, before the service reads it.
      // The service moves only from `movableFrom` (default queue or draft).
      changeDate: async (organizationId, postId, date, action, movableFrom = ['QUEUE', 'DRAFT']) => {
        scoped('PostsService.changeDate', organizationId);
        requests.push(['post.date', postId, { date, action, movableFrom }]);
        const row = (rows.adaptations ?? []).find((one) => one.postId === postId);
        if (!row) throw Object.assign(new Error('Post not found'), { code: 'POST_NOT_FOUND' });
        if ((rows.unscheduleBeforeMove ?? []).includes(postId)) {
          row.state = 'draft';
          row.plan = null;
          rows.unscheduleBeforeMove = rows.unscheduleBeforeMove.filter((one) => one !== postId);
        }
        const readState = row.state === 'queued' ? 'QUEUE' : row.state === 'draft' ? 'DRAFT' : 'OTHER';
        if (action === 'schedule' && !movableFrom.includes(readState)) {
          throw Object.assign(
            new Error('This post is no longer scheduled or a draft (it may have just been published). Nothing was moved.'),
            { code: 'POST_STATE_CHANGED', status: 409 }
          );
        }
        if ((rows.queueBusyPosts ?? []).includes(postId)) {
          throw Object.assign(
            new Error('Another version of this post is already scheduled in this channel. Unschedule it first.'),
            { code: 'CF_QUEUE_BUSY', status: 409 }
          );
        }
        // The server reads the calendar's wall time as UTC (its zone).
        row.date = new Date(`${date}Z`).toISOString();
        if (row.plan) row.plan = { ...row.plan, date: row.date };
        writes.push(['post.date', postId, row.date]);
        return { publishDate: row.date };
      },
    },
    /*
     * The AI settings doors' service (kcxz.20), answering as
     * `AiProviderService` does: `getSettings` says whether a key is stored,
     * never the key. `rows.ai.apiKey` / `rows.ai.ownSearchKeys` stand for the
     * encrypted columns; a scenario's `before` puts a key there the way the
     * browser's key card posts it to `POST /settings/ai` itself.
     */
    AiProviderService: {
      getSettings: async (organizationId) => {
        scoped('AiProviderService.getSettings', organizationId);
        return aiSettingsOf(aiRow());
      },
      updateSettings: async (organizationId, body) => {
        scoped('AiProviderService.updateSettings', organizationId);
        // What reached the service: a key here would be a key through the chat.
        requests.push(['ai.settings', body]);
        const row = aiRow();
        const own = body.usageMode !== 'included';
        if (body.usageMode) row.usageMode = body.usageMode;
        // The service's rule: a stored key keeps its provider; the provider
        // changes only with a new key, or while none is stored.
        if (own && body.provider && (body.apiKey || !row.apiKey)) row.provider = body.provider;
        if (own && body.apiKey) row.apiKey = body.apiKey;
        for (const [engine, key] of Object.entries(body.searchApiKeys ?? {})) {
          if (key) row.ownSearchKeys = { ...row.ownSearchKeys, [engine]: key };
        }
        writes.push(['ai.settings', body.usageMode ?? null]);
        return aiSettingsOf(row);
      },
      clearKey: async (organizationId) => {
        scoped('AiProviderService.clearKey', organizationId);
        aiRow().apiKey = null;
        writes.push(['ai.key.cleared', 'workspace']);
        return aiSettingsOf(aiRow());
      },
      clearSearchKey: async (organizationId, provider) => {
        scoped('AiProviderService.clearSearchKey', organizationId);
        const row = aiRow();
        const left = { ...row.ownSearchKeys };
        if (provider) delete left[provider];
        else for (const engine of Object.keys(left)) delete left[engine];
        row.ownSearchKeys = left;
        writes.push(['ai.key.cleared', provider ?? 'all']);
        return aiSettingsOf(row);
      },
    },
    AiUsageService: {
      // What the snapshot line shows; the admissions themselves go through
      // the real service the door holds.
      readAllowance: async (organizationId) => {
        scoped('AiUsageService.readAllowance', organizationId);
        // `allowance`: what the included allowance reads (the snapshot line);
        // a workspace key by default.
        return rows.allowance ? { ...rows.allowance } : { mode: 'workspace_key' };
      },
    },
  });

  return {
    rows,
    writes,
    reads,
    requests,
    servicesFor,
    /** What the scenario asserts on: the rows as they are now. */
    state: () =>
      JSON.parse(
        JSON.stringify({ ...rows, switchModeAfterRead: undefined, nextPiece: undefined, feedItems: undefined, topicFound: undefined, topicCached: undefined, periodicStopped: undefined, snapshots: undefined, researchFacts: undefined, intakeQuestions: undefined, coreSnapshots: undefined, coreResearchFacts: undefined, proposals: undefined, reviewChanges: undefined, adaptQuestions: undefined, queueBusy: undefined, queueBusyPosts: undefined, unscheduleBeforeMove: undefined, assistFails: undefined, proposalFields: undefined })
      ),
  };
};

module.exports = { ORGANIZATION_ID, createWorld };
