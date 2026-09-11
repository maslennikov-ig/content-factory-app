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
    acceptReviewV2: jest.fn(async () => ({ accepted: true })),
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
  expect(web.research).toHaveBeenCalledWith('org', 'Новый ручной текст', {
    level: 'standard',
  });
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

test('standard adaptation review records its explicit paid research level', async () => {
  const web = { research: jest.fn(async () => evidence) };
  output = webAnswer();
  await webModule.reviewAdaptationWithSearch(
    'org',
    { text: 'draft', language: 'en' },
    usage,
    web,
    'standard'
  );
  expect(web.research).toHaveBeenCalledWith('org', 'draft', {
    level: 'standard',
  });
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
  const pieces = { reviewV2: jest.fn(async () => ({})) };
  await new ContentPieceController(pieces).review(
    { id: 'current-org' },
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'en'
  );
  expect(pieces.reviewV2).toHaveBeenCalledWith(
    'current-org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'en'
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

test('v2 review signs server changes; partial acceptance uses snapshot and ignores client text',async()=>{
 process.env.JWT_SECRET='test-review-key';
 output={changes:[{id:'a',excerpt:'Новый',replacement:'Свежий',why:'Стиль',basket:'show'}],verdict:'review',summary:''};
 const result=await service.reviewV2('org','piece','adaptation',{mode:'slop'});
 expect(result.version).toBe('adaptation-review/v2');
 await service.acceptReviewV2('org','piece','adaptation',{token:result.token,selectedIds:['a'],text:'CLIENT INVENTED'});
 expect(repository.acceptReviewV2.mock.calls[0][4]).toBe('Свежий ручной текст');
 await expect(service.acceptReviewV2('other','piece','adaptation',{token:result.token,selectedIds:['a']})).rejects.toMatchObject({status:409});
 expect(repository.acceptReviewV2).toHaveBeenCalledTimes(1);
});
test('v2 empty core cannot spend a rewrite call',async()=>{
 repository.getPiece.mockResolvedValue({...piece,body:''});
 await expect(service.reviewV2('org','piece',undefined,{instruction:'Весь текст'})).rejects.toMatchObject({status:409});
 expect(calls).toHaveLength(0);
});
test('core acceptance CAS includes original body, title and brief; preserves metadata',async()=>{
 const updateMany=jest.fn(async()=>({count:1}));
 const repo=new PieceRepository({contentPiece:{updateMany}},{});
 repo.client=()=>({contentPiece:{updateMany}});
 const snapshot={body:'old',title:'title',brief:{titleEdited:true,facts:['evidence']}};
 await repo.acceptCoreReview('org','p',snapshot,'new','title',snapshot.brief);
 expect(updateMany.mock.calls[0][0].where).toEqual({organizationId:'org',id:'p',body:'old',title:'title',brief:{equals:snapshot.brief}});
 updateMany.mockResolvedValue({count:0});
 await expect(repo.acceptCoreReview('org','p',snapshot,'new','title',{})).rejects.toMatchObject({status:409});
});

test.each([['Отдельный заголовок','Первый абзац.','Первый абзац.'],['Старый заголовок','Старый заголовок\nПервый абзац.','Новый заголовок\nПервый абзац.'],[null,'Старый заголовок\nПервый абзац.','Новый заголовок\nПервый абзац.']])('v2 title %s preserves separate body and synchronizes only embedded heading',async(title,content,expected)=>{
 process.env.JWT_SECRET='test-review-key';
 repository.reviewDraft.mockResolvedValue({...draft(),title,post:{...draft().post,content}});
 output={changes:[{id:'title',target:'title',excerpt:title??'Старый заголовок',replacement:'Новый заголовок',variants:['Новый заголовок','Другой заголовок','Третий заголовок'],why:'Яснее',basket:'show'}],verdict:'review',summary:''};
 const result=await service.reviewV2('org','piece','adaptation',{instruction:'Только заголовок'});
 await service.acceptReviewV2('org','piece','adaptation',{token:result.token,selectedIds:['title'],variant:'Новый заголовок'});
 const saved=repository.acceptReviewV2.mock.calls[0];
 expect(saved[3].adaptationTitle).toBe(title);expect(saved[4]).toBe(expected);expect(saved[6]).toBe('Новый заголовок');
});
test('adaptation v2 CAS requires old independent title and writes title/body/post atomically',async()=>{
 const updateAdaptation=jest.fn(async()=>({count:1})),updatePost=jest.fn(async()=>({count:1}));
 const repo=new PieceRepository({},{});repo.client=()=>({$transaction:async run=>run({contentDerivation:{updateMany:updateAdaptation},post:{updateMany:updatePost}})});
 const snapshot={postId:'post',postContent:'old',postUpdatedAt:stamp.toISOString(),adaptationUpdatedAt:stamp.toISOString(),adaptationBody:'old',adaptationTitle:'old-title'};
 await repo.acceptReviewV2('org','piece','a',snapshot,'body','html','title');
 expect(updateAdaptation.mock.calls[0][0]).toMatchObject({where:{organizationId:'org',title:'old-title'},data:{body:'body',title:'title'}});
 updateAdaptation.mockResolvedValue({count:0});await expect(repo.acceptReviewV2('org','piece','a',snapshot,'body','html','title')).rejects.toMatchObject({status:409});
 expect(updatePost).toHaveBeenCalledTimes(1);
});

test('signed ask answers use stored own evidence and metadata CAS without confirming found facts',async()=>{
 process.env.JWT_SECRET='test-review-key';
 const found={statement:'Найдено',kind:'found',selected:false,verified:false,origin:'search'};
 repository.getPiece.mockResolvedValue({...piece,title:'Заголовок',brief:{...piece.brief,brief:{...piece.brief.brief,facts:[found]}}});
 const metadata={updateCoreMetadata:jest.fn(async()=>{})};service.briefs=metadata;
 output={changes:[{id:'ask-1',excerpt:'Новый',replacement:'Новый',why:'Какой ваш результат?',basket:'ask'}],verdict:'review',summary:''};
 const result=await service.reviewV2('org','piece','adaptation',{mode:'facts'});
 const before=calls.length;
 await service.answerReviewQuestions('org','piece',{token:result.token,adaptationId:'adaptation',answers:[{questionId:'ask-1',text:'У нас 10 заказов, источник https://example.com'}]});
 expect(calls).toHaveLength(before);
 const write=metadata.updateCoreMetadata.mock.calls[0];
 expect(write.slice(0,2)).toEqual(['org','piece']);expect(write[2].expectedBody).toBe(piece.body);
 expect(write[2].brief.brief.facts[0]).toEqual(found);
 expect(write[2].brief.brief.facts[1]).toMatchObject({statement:'У нас 10 заказов, источник https://example.com',kind:'own',origin:'person',verified:false,status:'unverified'});
 expect(write[2].brief.brief.reviewAnswers[0]).toMatchObject({questionId:'ask-1',question:'Какой ваш результат?'});
 await expect(service.answerReviewQuestions('org','piece',{token:result.token,adaptationId:'adaptation',answers:[{questionId:'invented',text:'invented'}]})).rejects.toMatchObject({status:400});
 expect(metadata.updateCoreMetadata).toHaveBeenCalledTimes(1);
 repository.getPiece.mockResolvedValue({...piece,body:'Concurrent edit'});
 await expect(service.answerReviewQuestions('org','piece',{token:result.token,adaptationId:'adaptation',answers:[{questionId:'ask-1',text:'answer'}]})).rejects.toMatchObject({status:409});
});
test('two partial author answers receive fresh signed snapshots and persist without another model call',async()=>{
 process.env.JWT_SECRET='test-review-key';
 let current={...piece,title:'Заголовок'};
 repository.getPiece.mockImplementation(async()=>current);
 service.briefs={updateCoreMetadata:jest.fn(async(_org,_id,input)=>{expect(input.expectedBrief).toEqual(current.brief);current={...current,brief:input.brief};})};
 output={changes:[{id:'q1',excerpt:'Новый',replacement:'Новый',why:'Первый вопрос?',basket:'ask'},{id:'q2',excerpt:'текст',replacement:'текст',why:'Второй вопрос?',basket:'ask'}],verdict:'review',summary:''};
 const review=await service.reviewV2('org','piece','adaptation',{mode:'facts'});
 const before=calls.length;
 const first=await service.answerReviewQuestions('org','piece',{token:review.token,adaptationId:'adaptation',answers:[{questionId:'q1',text:'Первый ответ'}]});
 expect(first.remaining.questions.map(q=>q.id)).toEqual(['q2']);
 await expect(service.answerReviewQuestions('org','piece',{token:review.token,adaptationId:'adaptation',answers:[{questionId:'q2',text:'Второй ответ'}]})).rejects.toMatchObject({status:409});
 const second=await service.answerReviewQuestions('org','piece',{token:first.remaining.token,adaptationId:'adaptation',answers:[{questionId:'q2',text:'Второй ответ'}]});
 expect(second.remaining).toBeNull();
 expect(current.brief.brief.facts.slice(-2).map(f=>f.statement)).toEqual(['Первый ответ','Второй ответ']);
 expect(current.brief.brief.reviewAnswers.map(a=>a.questionId)).toEqual(['q1','q2']);
 expect(calls).toHaveLength(before);
});
