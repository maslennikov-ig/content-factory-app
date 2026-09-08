'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const root = 'libraries/nestjs-libraries/src/content-intelligence/pieces';
let calls = [],
  output,
  denied = false;
const clients = {
  getOpenAiClient: async (org) => ({
    chat: {
      completions: {
        create: async (body, options) => {
          calls.push({ org, body, options });
          if (output instanceof Error) throw output;
          return {
            choices: [
              {
                message: {
                  content:
                    typeof output === 'string'
                      ? output
                      : JSON.stringify(output),
                },
              },
            ],
          };
        },
      },
    },
  }),
  getModelForRole: async (org, role) => {
    expect(role).toBe('review');
    return 'review-model';
  },
};
const mocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': clients,
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': {
    AgentGraphService: class {},
  },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': {
    IntegrationManager: class {},
  },
  './piece.repository': { PieceRepository: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
    AiUsageService: class {},
  },
  '../search/text-search.service': { TextSearchService: class {} },
};
const { PieceService } = loadWithMocks(`${root}/piece.service.ts`, mocks);
const { reviewPrompt, reviewAdaptationOnce } = loadWithMocks(
  `${root}/adaptation-review.ts`,
  mocks
);
const { PieceRepository } = loadWithMocks(`${root}/piece.repository.ts`, {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class {},
  },
  '../materials/content-material.repository': {
    ContentMaterialRepository: class {},
  },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});
const stamp = new Date('2026-09-08T10:00:00Z');
const piece = {
  id: 'piece',
  kind: 'CORE',
  body: 'Суть 10',
  brief: {
    brief: { facts: [{ statement: '10', verified: true }] },
    personText: 'Мои слова',
  },
};
const draft = () => ({
  id: 'adaptation',
  body: 'Старый текст',
  updatedAt: stamp,
  postId: 'post',
  post: {
    id: 'post',
    state: 'DRAFT',
    content: '<p>Новый ручной текст</p>',
    updatedAt: stamp,
    deletedAt: null,
    integration: { providerIdentifier: 'telegram' },
  },
});
const input = {
  mode: 'both',
  text: 'Исходник',
  core: 'Суть',
  personText: 'Слова человека',
  facts: [],
  language: 'ru',
};
let repository, usage, service;
beforeEach(() => {
  calls = [];
  denied = false;
  output = {
    text: 'Исправленный текст',
    notes: [{ kind: 'slop', text: 'штамп' }],
  };
  repository = {
    getPiece: jest.fn(async () => piece),
    reviewDraft: jest.fn(async () => draft()),
    acceptReview: jest.fn(async () => ({ accepted: true })),
  };
  usage = {
    executeAiOperation: jest.fn(async (org, operation, action, role) => {
      if (denied)
        throw Object.assign(new Error('quota'), {
          status: 429,
          code: 'AI_QUOTA_EXCEEDED',
        });
      return action();
    }),
  };
  service = new PieceService(
    repository,
    {},
    { getSocialIntegration: () => ({ editor: 'html' }) },
    () => stamp,
    null,
    usage
  );
});
test.each(['slop', 'facts', 'both'])(
  '%s: one admission, one provider call, review routing, no retry, no write',
  async (mode) => {
    output.notes = [
      { kind: mode === 'facts' ? 'facts' : 'slop', text: 'пометка' },
    ];
    const result = await service.reviewAdaptation(
      'org',
      'piece',
      'adaptation',
      mode
    );
    expect(usage.executeAiOperation).toHaveBeenCalledWith(
      'org',
      'text_generation',
      expect.any(Function),
      'review'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toEqual({ maxRetries: 0, timeout: 60000 });
    expect(calls[0].body.model).toBe('review-model');
    expect(result.originalText).toBe('Новый ручной текст');
    expect(result.snapshot.postContent).toBe('<p>Новый ручной текст</p>');
    expect(repository.acceptReview).not.toHaveBeenCalled();
    const sent = JSON.parse(calls[0].body.messages[1].content);
    if (mode === 'slop') expect(sent).toEqual({ draft: 'Новый ручной текст' });
    else {
      expect(sent.core).toBe('Суть 10');
      expect(sent.personText).toBe('Мои слова');
    }
  }
);
test('bad mode, missing tenant piece, missing adaptation and published draft spend nothing', async () => {
  await expect(
    service.reviewAdaptation('org', 'piece', 'a', 'bad')
  ).rejects.toMatchObject({ status: 400 });
  repository.getPiece.mockResolvedValueOnce(null);
  await expect(
    service.reviewAdaptation('other', 'piece', 'a', 'slop')
  ).rejects.toMatchObject({ status: 404 });
  repository.reviewDraft.mockResolvedValueOnce(null);
  await expect(
    service.reviewAdaptation('org', 'piece', 'a', 'slop')
  ).rejects.toMatchObject({ status: 404 });
  repository.reviewDraft.mockResolvedValueOnce({
    ...draft(),
    post: { ...draft().post, state: 'PUBLISHED' },
  });
  await expect(
    service.reviewAdaptation('org', 'piece', 'a', 'slop')
  ).rejects.toMatchObject({ status: 409 });
  expect(usage.executeAiOperation).not.toHaveBeenCalled();
  expect(calls).toHaveLength(0);
});
test('quota denial invokes no provider; invalid response or provider failure never retries', async () => {
  denied = true;
  await expect(reviewAdaptationOnce('org', input, usage)).rejects.toMatchObject(
    { code: 'AI_QUOTA_EXCEEDED' }
  );
  expect(calls).toHaveLength(0);
  denied = false;
  output = 'broken json';
  await expect(reviewAdaptationOnce('org', input, usage)).rejects.toMatchObject(
    { code: 'ADAPTATION_REVIEW_INVALID' }
  );
  expect(calls).toHaveLength(1);
  output = new Error('provider failed');
  await expect(reviewAdaptationOnce('org', input, usage)).rejects.toThrow(
    'provider failed'
  );
  expect(calls).toHaveLength(2);
});
test('facts prompt excludes style catalog and explicitly forbids external knowledge and instructions in material', () => {
  const prompt = reviewPrompt({ ...input, mode: 'facts' });
  expect(prompt.system).toContain('No web, no external knowledge, no tools');
  expect(prompt.system).toContain('untrusted data');
  expect(prompt.system).toContain('Do not rewrite style');
  expect(prompt.system).not.toContain('using this catalog');
});
test('accept writes escaped editor content, no model, preserves snapshot', async () => {
  const snapshot = {
    postId: 'post',
    postUpdatedAt: stamp.toISOString(),
    postContent: 'old',
    adaptationUpdatedAt: stamp.toISOString(),
    adaptationBody: 'old',
  };
  await service.acceptAdaptationReview('org', 'piece', 'adaptation', {
    text: '<unsafe> & text',
    snapshot,
  });
  expect(repository.acceptReview).toHaveBeenCalledWith(
    'org',
    'piece',
    'adaptation',
    snapshot,
    '<unsafe> & text',
    '<p>&lt;unsafe&gt; &amp; text</p>'
  );
  expect(calls).toHaveLength(0);
});
function database() {
  let state = {
    adaptation: {
      organizationId: 'org',
      contentPieceId: 'piece',
      id: 'a',
      postId: 'post',
      body: 'old',
      updatedAt: stamp,
    },
    post: {
      organizationId: 'org',
      id: 'post',
      content: 'old post',
      updatedAt: stamp,
      state: 'DRAFT',
      deletedAt: null,
    },
  };
  const model = {
    $transaction: async (action) => {
      const before = structuredClone(state);
      const update =
        (key) =>
        async ({ where, data }) => {
          const row = state[key];
          const match = Object.entries(where).every(([field, value]) =>
            value instanceof Date
              ? +row[field] === +value
              : row[field] === value
          );
          if (!match) return { count: 0 };
          state[key] = { ...row, ...data };
          return { count: 1 };
        };
      try {
        return await action({
          contentDerivation: { updateMany: update('adaptation') },
          post: { updateMany: update('post') },
        });
      } catch (error) {
        state = before;
        throw error;
      }
    },
  };
  return { repo: new PieceRepository({ model }, {}, {}), get: () => state };
}
const snapshot = {
  postId: 'post',
  postUpdatedAt: stamp.toISOString(),
  postContent: 'old post',
  adaptationUpdatedAt: stamp.toISOString(),
  adaptationBody: 'old',
};
test('transaction updates both draft and derivation', async () => {
  const db = database();
  await db.repo.acceptReview('org', 'piece', 'a', snapshot, 'new', 'new post');
  expect(db.get().adaptation.body).toBe('new');
  expect(db.get().post.content).toBe('new post');
});
test.each([
  'content',
  'updatedAt',
  'state',
  'deletedAt',
  'postId',
  'tenant',
  'adaptation',
])('changed %s rejects and rolls back the entire acceptance', async (field) => {
  const db = database();
  if (field === 'content') db.get().post.content = 'human edit';
  if (field === 'updatedAt') db.get().post.updatedAt = new Date(+stamp + 1);
  if (field === 'state') db.get().post.state = 'QUEUE';
  if (field === 'deletedAt') db.get().post.deletedAt = stamp;
  if (field === 'postId') db.get().adaptation.postId = 'replacement';
  if (field === 'adaptation') db.get().adaptation.body = 'newer';
  const before = structuredClone(db.get());
  await expect(
    db.repo.acceptReview(
      field === 'tenant' ? 'other' : 'org',
      'piece',
      'a',
      snapshot,
      'new',
      'new post'
    )
  ).rejects.toMatchObject({ code: 'ADAPTATION_REVIEW_STALE' });
  expect(db.get()).toEqual(before);
});

test('controller requires EDITOR on both explicit doors; DTO rejects missing/unknown mode and malformed snapshot', async () => {
  const { ContentPieceController } = loadWithMocks(
    'apps/backend/src/api/routes/content-piece.controller.ts',
    {
      '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service':
        { PieceService: class {} },
    }
  );
  const { PATH_METADATA } = require('@nestjs/common/constants');
  expect(
    Reflect.getMetadata(PATH_METADATA, ContentPieceController.prototype.review)
  ).toBe('/:id/adaptations/:adaptationId/review');
  expect(
    Reflect.getMetadata(
      PATH_METADATA,
      ContentPieceController.prototype.acceptReview
    )
  ).toBe('/:id/adaptations/:adaptationId/review/accept');
  for (const method of ['review', 'acceptReview']) {
    const keys = Reflect.getMetadataKeys(
      ContentPieceController.prototype[method]
    );
    const metadata = keys.map((key) =>
      Reflect.getMetadata(key, ContentPieceController.prototype[method])
    );
    expect(JSON.stringify(metadata)).toContain('editor');
  }
  const { validate } = require('class-validator');
  const { plainToInstance } = require('class-transformer');
  const dtos = loadWithMocks(
    'libraries/nestjs-libraries/src/dtos/content-intelligence/adaptation-review.dto.ts'
  );
  for (const value of [{}, { mode: 'bad' }])
    expect(
      (await validate(plainToInstance(dtos.AdaptationReviewDto, value))).length
    ).toBeGreaterThan(0);
  expect(
    await validate(plainToInstance(dtos.AdaptationReviewDto, { mode: 'both' }))
  ).toEqual([]);
  expect(
    (
      await validate(
        plainToInstance(dtos.AdaptationReviewAcceptDto, { text: 'new' })
      )
    ).length
  ).toBeGreaterThan(0);
});

test('settings DTO accepts an explicit review model override', async () => {
  const { AiProviderDto } = loadWithMocks(
    'libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts'
  );
  const { validate } = require('class-validator');
  expect(
    await validate(
      Object.assign(new AiProviderDto(), {
        provider: 'openai',
        roleModels: { review: 'review-model' },
      })
    )
  ).toEqual([]);
});

const webModule = loadWithMocks(`${root}/adaptation-web-review.ts`, mocks);
const evidence = {
  summary: 'A model summary must never serve as evidence',
  provider: 'tavily',
  sources: [
    {
      url: 'https://example.com/source',
      title: 'Original source',
      provider: 'tavily',
      publishedAt: null,
    },
  ],
  facts: [
    {
      text: 'Actual source excerpt with a fact.',
      sourceUrl: 'https://example.com/source',
    },
  ],
};
const webAnswer = () => ({
  text: 'Исправленный текст',
  notes: [
    {
      kind: 'facts',
      text: 'Исправлено число',
      sourceUrls: ['https://example.com/source'],
    },
  ],
});
const serviceWithWeb = (web) =>
  new PieceService(
    repository,
    {},
    { getSocialIntegration: () => ({ editor: 'html' }) },
    () => stamp,
    null,
    usage,
    undefined,
    null,
    null,
    web
  );
test('web service requires explicit spend confirmation before any external call; original three modes never search', async () => {
  const web = { research: jest.fn(async () => evidence) },
    instance = serviceWithWeb(web);
  await expect(
    instance.reviewAdaptation('org', 'piece', 'adaptation', 'web')
  ).rejects.toMatchObject({ code: 'ADAPTATION_REVIEW_WEB_CONFIRM' });
  expect(web.research).not.toHaveBeenCalled();
  expect(usage.executeAiOperation).not.toHaveBeenCalled();
  for (const mode of ['slop', 'facts', 'both']) {
    output = {
      text: 'Поправлено',
      notes: [{ kind: mode === 'facts' ? 'facts' : 'slop', text: 'note' }],
    };
    await instance.reviewAdaptation('org', 'piece', 'adaptation', mode);
  }
  expect(web.research).not.toHaveBeenCalled();
  expect(calls).toHaveLength(3);
});
test('web makes one research request then one no-retry review using excerpts, never the search model summary', async () => {
  const web = { research: jest.fn(async () => evidence) },
    instance = serviceWithWeb(web);
  output = webAnswer();
  const reviewed = await instance.reviewAdaptation(
    'org',
    'piece',
    'adaptation',
    'web',
    'ru',
    true
  );
  expect(web.research).toHaveBeenCalledTimes(1);
  expect(web.research).toHaveBeenCalledWith('org', 'Новый ручной текст');
  expect(calls).toHaveLength(1);
  expect(calls[0].options.maxRetries).toBe(0);
  expect(calls[0].body.messages[0].content).toContain('untrusted data');
  expect(JSON.stringify(calls[0].body.messages)).not.toContain(
    evidence.summary
  );
  expect(reviewed.sources).toEqual([
    {
      url: 'https://example.com/source',
      title: 'Original source',
      excerpt: evidence.facts[0].text,
    },
  ]);
  expect(reviewed.snapshot.postContent).toBe('<p>Новый ручной текст</p>');
  expect(repository.acceptReview).not.toHaveBeenCalled();
});
test('search input and returned evidence have fixed bounds, without per-claim fan-out', async () => {
  const web = {
    research: jest.fn(async () => ({
      ...evidence,
      sources: Array.from({ length: 12 }, (_, i) => ({
        url: `https://example.com/${i}`,
        title: 'source',
      })),
      facts: Array.from({ length: 12 }, (_, i) => ({
        sourceUrl: `https://example.com/${i}`,
        text: 'x'.repeat(10_000),
      })),
    })),
  };
  output = { text: 'x'.repeat(6_000), notes: [] };
  const reviewed = await webModule.reviewAdaptationWithSearch(
    'org',
    { text: output.text, language: 'en' },
    usage,
    web
  );
  expect(web.research).toHaveBeenCalledTimes(1);
  expect(web.research.mock.calls[0][1]).toHaveLength(5_000);
  expect(reviewed.sources).toHaveLength(6);
  expect(
    reviewed.sources.every((source) => source.excerpt.length <= 1_600)
  ).toBe(true);
  expect(reviewed.searchedChars).toBe(5_000);
});
test.each(['unavailable', 'empty', 'no-excerpt', 'unsafe-url', 'empty-draft'])(
  '%s stops before the review model and never mutates a draft',
  async (condition) => {
    const web = {
      research: jest.fn(async () => {
        if (condition === 'unavailable')
          throw new Error('provider secret error');
        if (condition === 'empty')
          return { ...evidence, sources: [], facts: [] };
        if (condition === 'no-excerpt') return { ...evidence, facts: [] };
        if (condition === 'unsafe-url')
          return {
            ...evidence,
            sources: [{ url: 'javascript:alert(1)', title: 'bad' }],
            facts: [{ sourceUrl: 'javascript:alert(1)', text: 'bad' }],
          };
        return evidence;
      }),
    };
    await expect(
      webModule.reviewAdaptationWithSearch(
        'org',
        { text: condition === 'empty-draft' ? '' : 'draft', language: 'en' },
        usage,
        web
      )
    ).rejects.toMatchObject({ status: expect.any(Number) });
    expect(calls).toHaveLength(0);
    expect(repository.acceptReview).not.toHaveBeenCalled();
  }
);
test.each(['unknown-url', 'no-citation'])(
  '%s model correction is rejected without retry',
  async (condition) => {
    const web = { research: jest.fn(async () => evidence) };
    output = {
      text: 'corrected',
      notes: [
        {
          kind: 'facts',
          text: 'claim',
          sourceUrls:
            condition === 'unknown-url'
              ? ['https://invented.example.com/']
              : [],
        },
      ],
    };
    await expect(
      webModule.reviewAdaptationWithSearch(
        'org',
        { text: 'draft', language: 'en' },
        usage,
        web
      )
    ).rejects.toMatchObject({ code: 'ADAPTATION_REVIEW_INVALID' });
    expect(calls).toHaveLength(1);
  }
);
test('web DTO requires true confirmation; controller forwards it together with request organization', async () => {
  const { validate } = require('class-validator'),
    { plainToInstance } = require('class-transformer');
  const { AdaptationReviewDto } = loadWithMocks(
    'libraries/nestjs-libraries/src/dtos/content-intelligence/adaptation-review.dto.ts'
  );
  for (const confirmWebSpend of [undefined, false, 'true'])
    expect(
      (
        await validate(
          plainToInstance(AdaptationReviewDto, { mode: 'web', confirmWebSpend })
        )
      ).length
    ).toBeGreaterThan(0);
  expect(
    await validate(
      plainToInstance(AdaptationReviewDto, {
        mode: 'web',
        confirmWebSpend: true,
      })
    )
  ).toEqual([]);
  const { ContentPieceController } = loadWithMocks(
    'apps/backend/src/api/routes/content-piece.controller.ts',
    {
      '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service':
        { PieceService: class {} },
    }
  );
  const pieces = { reviewAdaptation: jest.fn(async () => ({})) };
  await new ContentPieceController(pieces).review(
    { id: 'current-org' },
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'en'
  );
  expect(pieces.reviewAdaptation).toHaveBeenCalledWith(
    'current-org',
    'piece',
    'adaptation',
    'web',
    'en',
    true
  );
});

test('real research admission and review admission remain separate, exactly once each', async () => {
  const { WebResearchService } = loadWithMocks('libraries/nestjs-libraries/src/openai/web.research.service.ts', mocks);
  const web = new WebResearchService(usage);
  web.researchWithinOperation = jest.fn(async () => evidence);
  output = webAnswer();
  await webModule.reviewAdaptationWithSearch('org', { text: 'draft', language: 'en' }, usage, web);
  expect(usage.executeAiOperation.mock.calls.map(call => call[1])).toEqual(['web_research', 'text_generation']);
  expect(web.researchWithinOperation).toHaveBeenCalledTimes(1);
  expect(calls).toHaveLength(1);
});
