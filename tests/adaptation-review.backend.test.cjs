'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const root = 'libraries/nestjs-libraries/src/content-intelligence/pieces';
let calls = [],
  output,
  denied = false,
  /**
   * Проверка фактов с 18.09.2026 сначала выделяет утверждения и только потом
   * ищет (`content-factory-next-97dq.3`). Разбор идёт тем же клиентом, поэтому
   * ответ на него узнаётся по версии промпта, а не по номеру вызова.
   */
  claimsOutput;
const isClaimsCall = (body) =>
  String(body.messages?.[0]?.content ?? '').includes('piece-claims/v1');
const claimsCalls = () => calls.filter(({ body }) => isClaimsCall(body));
const reviewCalls = () => calls.filter(({ body }) => !isClaimsCall(body));
const clients = {
  getOpenAiClient: async (org) => ({
    chat: {
      completions: {
        create: async (body, options) => {
          calls.push({ org, body, options });
          const answer = isClaimsCall(body) ? claimsOutput : output;
          if (answer instanceof Error) throw answer;
          return {
            choices: [
              {
                message: {
                  content:
                    typeof answer === 'string'
                      ? answer
                      : JSON.stringify(answer),
                },
              },
            ],
          };
        },
      },
    },
  }),
  getModelForRole: async (org, role) => {
    expect(['review', 'extract']).toContain(role);
    return `${role}-model`;
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
let repository, usage, service;
beforeEach(() => {
  calls = [];
  denied = false;
  output = {
    text: 'Исправленный текст',
    notes: [{ kind: 'slop', text: 'штамп' }],
  };
  claimsOutput = {
    claims: [
      { text: 'Комиссия 10%', hasNumber: true, searchQuery: 'комиссия 10%' },
    ],
  };
  repository = {
    getPiece: jest.fn(async () => piece),
    reviewDraft: jest.fn(async () => draft()),
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
    beginAiOperationWithConfig: jest.fn(
      async (_org, _operation, _config, _role) => ({
        run: (action) => action(),
        finish: jest.fn(async () => undefined),
      })
    ),
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
/*
  Дверь одна (`content-factory-next-97dq.14`, P3). `reviewAdaptation` и её
  промпт `adaptation-review.ts` удалены: на них не вёл ни один маршрут, а
  покупали они разбор утверждений и не имели ветки «проверять нечего». Всё, что
  здесь проверялось через ту дверь, проверяется через живую — `reviewV2`.
*/
test('research mode, missing tenant piece, missing adaptation and published draft spend nothing', async () => {
  await expect(
    service.reviewV2('org', 'piece', 'a', { mode: 'research' })
  ).rejects.toMatchObject({ status: 400 });
  repository.getPiece.mockResolvedValueOnce(null);
  await expect(
    service.reviewV2('other', 'piece', 'a', { mode: 'slop' })
  ).rejects.toMatchObject({ status: 404 });
  repository.reviewDraft.mockResolvedValueOnce(null);
  await expect(
    service.reviewV2('org', 'piece', 'a', { mode: 'slop' })
  ).rejects.toMatchObject({ status: 404 });
  repository.reviewDraft.mockResolvedValueOnce({
    ...draft(),
    post: { ...draft().post, state: 'PUBLISHED' },
  });
  await expect(
    service.reviewV2('org', 'piece', 'a', { mode: 'slop' })
  ).rejects.toMatchObject({ status: 409 });
  expect(usage.executeAiOperation).not.toHaveBeenCalled();
  expect(calls).toHaveLength(0);
});
/*
  `content-factory-next-97dq.18`: the accept door is `acceptReviewV2`; the old
  `acceptAdaptationReview` took client text and no route reached it. Its
  checks live here, through the signed review the page actually accepts.
*/
test('accept writes escaped editor content, no model, preserves snapshot', async () => {
  process.env.JWT_SECRET = 'test-review-key';
  output = {
    changes: [
      {
        id: 'u',
        excerpt: 'Новый ручной текст',
        replacement: '<unsafe> & text',
        why: 'Проверка',
        basket: 'show',
      },
    ],
    verdict: 'review',
    summary: '',
  };
  const result = await service.reviewV2('org', 'piece', 'adaptation', { mode: 'slop' });
  const spent = calls.length;
  const aiOperations = usage.executeAiOperation.mock.calls.length;
  await service.acceptReviewV2('org', 'piece', 'adaptation', {
    token: result.token,
    selectedIds: ['u'],
  });
  const [org, pieceId, adaptationId, snapshot, body, content] =
    repository.acceptReviewV2.mock.calls[0];
  expect([org, pieceId, adaptationId]).toEqual(['org', 'piece', 'adaptation']);
  expect(body).toBe('<unsafe> & text');
  expect(content).toBe('<p>&lt;unsafe&gt; &amp; text</p>');
  // The snapshot is the one the review read, not a fresh read at accept time.
  expect(snapshot).toMatchObject({
    postId: 'post',
    postContent: '<p>Новый ручной текст</p>',
    adaptationBody: 'Старый текст',
  });
  expect(calls).toHaveLength(spent);
  expect(usage.executeAiOperation).toHaveBeenCalledTimes(aiOperations);
});
test('the dead accept door is gone (97dq.18)', () => {
  expect(PieceService.prototype.acceptAdaptationReview).toBeUndefined();
  expect(PieceRepository.prototype.acceptReview).toBeUndefined();
});
function database() {
  let state = {
    adaptation: {
      organizationId: 'org',
      contentPieceId: 'piece',
      id: 'a',
      postId: 'post',
      body: 'old',
      title: 'Заголовок',
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
  adaptationTitle: 'Заголовок',
};
// Through `acceptReviewV2`, the one accept the service calls (`97dq.18`).
test('transaction updates both draft and derivation', async () => {
  const db = database();
  await db.repo.acceptReviewV2('org', 'piece', 'a', snapshot, 'new', 'new post', 'Заголовок');
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
  'title',
])('changed %s rejects and rolls back the entire acceptance', async (field) => {
  const db = database();
  if (field === 'content') db.get().post.content = 'human edit';
  if (field === 'updatedAt') db.get().post.updatedAt = new Date(+stamp + 1);
  if (field === 'state') db.get().post.state = 'QUEUE';
  if (field === 'deletedAt') db.get().post.deletedAt = stamp;
  if (field === 'postId') db.get().adaptation.postId = 'replacement';
  if (field === 'adaptation') db.get().adaptation.body = 'newer';
  if (field === 'title') db.get().adaptation.title = 'Чужой заголовок';
  const before = structuredClone(db.get());
  await expect(
    db.repo.acceptReviewV2(
      field === 'tenant' ? 'other' : 'org',
      'piece',
      'a',
      snapshot,
      'new',
      'new post',
      'Заголовок'
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
test('web mode requires explicit spend confirmation before any external call; the three plain modes never search', async () => {
  process.env.JWT_SECRET = 'test-review-key';
  const web = { research: jest.fn(async () => evidence) },
    instance = serviceWithWeb(web);
  await expect(
    instance.reviewV2('org', 'piece', 'adaptation', { mode: 'web' })
  ).rejects.toMatchObject({ code: 'REVIEW_WEB_CONFIRM' });
  expect(web.research).not.toHaveBeenCalled();
  expect(usage.executeAiOperation).not.toHaveBeenCalled();
  for (const mode of ['slop', 'facts', 'both']) {
    output = { changes: [], verdict: 'clean', summary: '' };
    await instance.reviewV2('org', 'piece', 'adaptation', { mode });
  }
  expect(web.research).not.toHaveBeenCalled();
  expect(reviewCalls()).toHaveLength(3);
  expect(claimsCalls()).toHaveLength(0);
});

/**
 * Доказательством становится только настоящая выдержка настоящей страницы, и
 * её объём ограничен двумя названными числами. Чистая функция — та же, что
 * читает `reviewV2`; своего платного хода у этого файла больше нет.
 */
test('returned evidence has fixed bounds and refuses anything that is not an https excerpt', () => {
  const many = webModule.webReviewSources({
    ...evidence,
    sources: Array.from({ length: 12 }, (_, i) => ({
      url: `https://example.com/${i}`,
      title: 'source',
    })),
    facts: Array.from({ length: 12 }, (_, i) => ({
      sourceUrl: `https://example.com/${i}`,
      text: 'x'.repeat(10_000),
    })),
  });
  expect(many).toHaveLength(webModule.WEB_REVIEW_MAX_SOURCES);
  expect(
    many.every(
      (source) => source.excerpt.length <= webModule.WEB_REVIEW_SOURCE_CHARS
    )
  ).toBe(true);

  // Ни адреса без выдержки, ни выдержки без вернувшегося источника, ни схемы,
  // которая адресом страницы не является.
  expect(webModule.webReviewSources({ ...evidence, facts: [] })).toEqual([]);
  expect(
    webModule.webReviewSources({
      ...evidence,
      facts: [{ sourceUrl: evidence.sources[0].url, text: '   ' }],
    })
  ).toEqual([]);
  expect(
    webModule.webReviewSources({
      sources: [{ url: 'javascript:alert(1)', title: 'bad' }],
      facts: [{ sourceUrl: 'javascript:alert(1)', text: 'bad' }],
    })
  ).toEqual([]);
});

test('a draft longer than the claim limit is cut by one named constant, not by three', async () => {
  const { REVIEW_CLAIM_TEXT_CHARS } = loadWithMocks(
    `${root}/review-claims.ts`,
    mocks
  );
  expect(REVIEW_CLAIM_TEXT_CHARS).toBe(20_000);
  // Двух из трёх независимых «5000» в этих файлах больше нет: ни безымянного
  // числа в коде, ни собственной константы длины подписки.
  const fs = require('node:fs');
  for (const file of [
    `${root}/piece.service.ts`,
    `${root}/adaptation-web-review.ts`,
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    expect(source).not.toMatch(/slice\(\s*0\s*,\s*5_?000\s*\)/);
    expect(source).not.toMatch(/=\s*5_?000/);
    expect(source).not.toContain('WEB_REVIEW_SUBJECT_CHARS');
  }
  // Третье осталось в сервисе исследования и названо своей работой.
  const research = fs.readFileSync(
    'libraries/nestjs-libraries/src/openai/web.research.service.ts',
    'utf8'
  );
  expect(research).toContain('const CLASSIFIER_SUBJECT_CHARS = 5_000;');
  expect(research).not.toContain('MAXIMUM_SUBJECT_LENGTH');
});

/**
 * Живая полоса передаёт уровень, задачу и — вместе с запросами — язык сама
 * (`reviewV2`, `content-factory-next-97dq.3`): это проверяется в
 * `review-fact-check.test.cjs`, где стоит и отказ «источников с текстом нет».
 * Здесь остался только тот отказ, который виден с этой стороны двери.
 */
test('a search that returned no usable excerpt refuses instead of reviewing without evidence', async () => {
  const web = { research: jest.fn(async () => ({ ...evidence, facts: [] })) };
  const instance = serviceWithWeb(web);
  await expect(
    instance.reviewV2(
      'org',
      'piece',
      'adaptation',
      { mode: 'web', confirmWebSpend: true },
      'ru'
    )
  ).rejects.toMatchObject({ code: 'REVIEW_WEB_EMPTY', status: 422 });
  expect(reviewCalls()).toHaveLength(0);
  expect(repository.acceptReviewV2).not.toHaveBeenCalled();
});

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
  const searchConfig = {
    usageMode: 'included',
    provider: 'openrouter',
    apiKey: 'system-model-key',
    search: {
      enabled: true,
      provider: 'tavily',
      apiKey: 'system-search-key',
      apiKeys: { tavily: 'system-search-key' },
      keySources: { tavily: 'system' },
      topic: 'general',
      depth: 'advanced',
    },
  };
  const { WebResearchService } = loadWithMocks(
    'libraries/nestjs-libraries/src/openai/web.research.service.ts',
    {
      ...mocks,
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        getActiveAiConfig: () => searchConfig,
        loadAiConfig: async () => searchConfig,
        requireActiveAiConfig: async () => searchConfig,
        withActiveAiConfig: (_organizationId, _config, action) => action(),
      },
    }
  );
  process.env.JWT_SECRET = 'test-review-key';
  const web = new WebResearchService(usage);
  web.researchWithinOperation = jest.fn(async () => evidence);
  output = { changes: [], verdict: 'clean', summary: '' };
  await serviceWithWeb(web).reviewV2(
    'org',
    'piece',
    'adaptation',
    { mode: 'web', confirmWebSpend: true },
    'ru'
  );
  expect(usage.beginAiOperationWithConfig).toHaveBeenCalledTimes(1);
  expect(usage.beginAiOperationWithConfig).toHaveBeenCalledWith(
    'org',
    'web_research',
    expect.objectContaining({ usageMode: 'included', apiKey: 'system-search-key' }),
    'research'
  );
  // Разбор утверждений — своя дешёвая операция, проверка — своя. Ни одна не
  // считается второй раз, и ни одна не подменяет броню поиска.
  expect(usage.executeAiOperation.mock.calls.map(call => call[1])).toEqual([
    'content_classification',
    'text_generation',
  ]);
  expect(web.researchWithinOperation).toHaveBeenCalledTimes(1);
  expect(claimsCalls()).toHaveLength(1);
  expect(reviewCalls()).toHaveLength(1);
});

test('v2 review signs server changes; partial acceptance uses snapshot and ignores client text',async()=>{
 process.env.JWT_SECRET='test-review-key';
 output={changes:[{id:'a',excerpt:'Новый',replacement:'Свежий',why:'Стиль',basket:'show'}],verdict:'review',summary:''};
 const result=await service.reviewV2('org','piece','adaptation',{mode:'slop'});
 expect(result.version).toBe('adaptation-review/v3');
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

test('review converts legacy ask output to a visible unchanged note and stores no author answer',async()=>{
 process.env.JWT_SECRET='test-review-key';
 const metadata={updateCoreMetadata:jest.fn(async()=>{})};service.briefs=metadata;
 output={changes:[{id:'ask-1',excerpt:'Новый',replacement:'Новый',why:'Какой ваш результат?',basket:'ask'}],verdict:'review',summary:''};
 const result=await service.reviewV2('org','piece','adaptation',{mode:'facts'});
 expect(result.changes[0]).toMatchObject({
  id:'ask-1',basket:'show',replacement:'Новый',
  why:'Источник не найден, оставлено как есть.'
 });
 expect(service.answerReviewQuestions).toBeUndefined();
 expect(metadata.updateCoreMetadata).not.toHaveBeenCalled();
});
