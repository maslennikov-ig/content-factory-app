'use strict';

const { RunnableLambda } = require('@langchain/core/runnables');
const {
  loadAgentGraph,
} = require('../scripts/evidence/voice-eval/product-graph.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { materialSupport } = loadWithMocks(
  'libraries/nestjs-libraries/src/agent/adaptation-coverage.ts'
);
const { defaultWritingProfileFor } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
);

const FIRST = 'Aurora выпустила инструмент для редакторов.';
const SECOND = 'Бюро добавило общий календарь команд.';
const THIRD = 'Кампания — общий план публикаций, связанных одной целью.';
const CORE = [FIRST, SECOND, THIRD].join('\n\n');
const PASSED = {
  status: 'passed',
  missingRequirements: [],
  unsupportedClaims: [],
};
const MISSING = {
  status: 'partial',
  missingRequirements: [SECOND, THIRD],
  unsupportedClaims: [],
};
const item = (content) => ({ content, usedCitationIds: ['E1'] });
const draft = (content) => ({ content: item(content) });
const context = () => ({
  facts: [],
  evidence: [
    {
      citationId: 'E1',
      evidenceId: 'e-1',
      title: 'Сводка',
      excerpt: CORE,
      url: 'https://example.test/updates',
      provenance: 'SEARCH',
      retrievedAt: '2026-10-20T10:00:00Z',
    },
  ],
});
const state = () => ({
  orgId: 'org-a',
  language: 'ru',
  format: 'one_long',
  tone: 'personal',
  messages: [
    { content: 'Сделай сводку новых инструментов и объясни кампанию' },
  ],
  popularPosts: [],
  researchAvailable: false,
  hook: 'Что изменилось в работе редакции',
  contentContext: context(),
  content: item(FIRST),
  resolvedBrandProfile: {
    effectiveVoice: { postLength: { median: 100, low: 50, high: 200 } },
  },
  intake: {
    version: 'intake-hints/v3',
    core: CORE,
    request: {
      version: 'intake-request/v1',
      goal: 'Сводка обновлений и объяснение кампании',
      requestedOutputs: ['Один Telegram-пост'],
      materials: [
        {
          role: 'reference',
          origin: 'user',
          text: 'Пример предыдущего поста, а не новое задание',
        },
      ],
      constraints: { requirements: ['Сохранить все основные темы'] },
    },
    brief: {
      thesis: 'Обновления для редакторов',
      position: null,
      disagreement: null,
      audience: 'Команды',
      goal: 'Объяснить изменения',
    },
    material: [
      {
        statement: SECOND,
        checked: true,
        evidenceId: 'e-1',
        sourceUrl: 'https://example.test/updates',
        quote: SECOND,
      },
    ],
    channel: {
      providerIdentifier: 'telegram',
      integrationId: 'channel-a',
      maxLength: 4096,
      writingProfile: {
        lengthPolicy: { idealMin: 900, idealMax: 1300, hardMax: 1500 },
      },
    },
  },
});

const build = (responses) => {
  const calls = [],
    usage = [];
  const model = {
    withStructuredOutput: () =>
      RunnableLambda.from(async (prompt) => {
        const next = responses[calls.length];
        calls.push(String(prompt));
        if (next instanceof Error) throw next;
        if (!next) throw new Error('Unexpected extra model call');
        return next;
      }),
    invoke: () => {
      throw new Error('The voice range must not trim a piece core');
    },
  };
  const { service } = loadAgentGraph({ chatModel: model });
  service.aiUsage = {
    executeAiOperation: async (org, operation, callback, role) => {
      usage.push({ org, operation, role });
      return callback();
    },
  };
  return { service, calls, usage };
};

describe('final adaptation coverage uses the actual complete post and bounded repair', () => {
  test('the chosen snippet is reviewed, repaired once and re-reviewed across every topic', async () => {
    const repaired = { hook: 'Обновления редакции', content: item(CORE) };
    const { service, calls, usage } = build([
      draft(FIRST),
      MISSING,
      repaired,
      PASSED,
    ]);
    const source = state();
    source.contextText = service.renderContext(source.contentContext);
    const generated = await service.generateContent(source);
    const result = await service.fixArray({ ...source, ...generated });

    expect(result.content[0].content).toBe(CORE);
    expect(result.hook).toBe(repaired.hook);
    expect(result.adaptationCoverage).toEqual({
      status: 'passed',
      reviews: 2,
      repaired: true,
    });
    expect(calls).toHaveLength(4);
    expect(usage.map((one) => one.role)).toEqual(['review', 'draft', 'review']);
    expect(
      usage.every(
        (one) => one.org === 'org-a' && one.operation === 'text_generation'
      )
    ).toBe(true);
    expect(calls[0]).toContain(SECOND);
    expect(calls[0]).toContain(THIRD);
    expect(calls[0]).not.toContain(
      'Every number, date, name or legal reference in the draft must come from this block'
    );
    expect(calls[1]).toContain('hardMax');
    expect(calls[1]).toContain('1500');
    expect(calls[1]).toContain('Сводка обновлений и объяснение кампании');
    expect(calls[1]).not.toContain(
      'Пример предыдущего поста, а не новое задание'
    );
    expect(calls[2]).toContain(SECOND);
    expect(calls[3]).toContain(CORE.replace(/\n/g, '\\n'));
  });

  test('coverage passing under a hard limit does not require every sentence or number', async () => {
    const { service, calls, usage } = build([PASSED]);
    const source = state();
    source.intake.core = `${CORE}\n\n${'Второстепенные детали результата. '.repeat(
      100
    )}`;
    source.content = item(
      'Aurora обновила инструмент; Бюро — календарь. Кампания связывает публикации общей целью.'
    );
    const result = await service.fixArray(source);
    expect(result.content[0]).toEqual(source.content);
    expect(result.adaptationCoverage.repaired).toBe(false);
    expect(calls).toHaveLength(1);
    expect(usage.map((one) => one.role)).toEqual(['review']);
    expect(calls[0]).toMatch(/without requiring every core sentence or number/);
  });

  test('a final incomplete verdict stops before a ready version and preserves the paid diagnostic draft', async () => {
    const { service, calls } = build([
      MISSING,
      { hook: 'Начало', content: item(FIRST) },
      MISSING,
    ]);
    await expect(service.fixArray(state())).rejects.toMatchObject({
      code: 'CONTENT_ADAPTATION_INCOMPLETE',
      missingRequirements: [SECOND, THIRD],
      incompleteDraft: { hook: 'Начало', content: item(FIRST) },
    });
    expect(calls).toHaveLength(3);
  });

  test('a conflicting core claim cannot be certified by a source id and a different amount', async () => {
    const conflict = {
      status: 'partial',
      missingRequirements: [],
      unsupportedClaims: ['Source says 12, not 21.'],
    };
    const source = state();
    source.intake.core = 'Aurora получила 21 заказ.';
    source.contentContext.evidence[0].excerpt = 'Aurora получила 12 заказов.';
    source.content = item(source.intake.core);
    const { service, calls } = build([
      conflict,
      { hook: 'Итоги', content: item(source.intake.core) },
      conflict,
    ]);
    await expect(service.fixArray(source)).rejects.toMatchObject({
      code: 'CONTENT_ADAPTATION_INCOMPLETE',
      unsupportedClaims: ['Source says 12, not 21.'],
    });
    expect(calls[0]).toContain('12 заказов');
    expect(calls[0]).toContain('21 заказ');
    expect(calls[0]).toMatch(/id or citation id alone proves nothing/);
    expect(calls).toHaveLength(3);
  });

  test('a failed reviewer never becomes a passed generation and does not start repair', async () => {
    const { service, calls } = build([new Error('Unavailable')]);
    await expect(service.fixArray(state())).rejects.toMatchObject({
      code: 'CONTENT_ADAPTATION_INCOMPLETE',
    });
    expect(calls).toHaveLength(1);
  });

  test('whole-post hardMax, including the hook, forces the one repair even if the model says passed', async () => {
    const source = state();
    source.hook = 'Х'.repeat(20);
    source.content = item('Т'.repeat(210));
    source.intake.channel.writingProfile.lengthPolicy.hardMax = 220;
    const { service, calls } = build([
      PASSED,
      { hook: 'Сводка', content: item(CORE) },
      PASSED,
    ]);
    const result = await service.fixArray(source);
    expect(result.content[0].content).toBe(CORE);
    expect(result.adaptationCoverage.repaired).toBe(true);
    expect(calls[1]).toContain('including its hook has 232 characters');
    expect(calls[1]).toContain('hard limit is 220');
    expect(calls).toHaveLength(3);
  });

  test('a passed semantic verdict cannot save a repaired whole post above the caption limit', async () => {
    const source = state();
    source.isPicture = true;
    source.intake.channel.maxCaptionLength = 80;
    source.hook = 'Х'.repeat(20);
    source.content = item('Т'.repeat(70));
    const { service, calls } = build([
      PASSED,
      { hook: 'Х'.repeat(20), content: item('Т'.repeat(70)) },
      PASSED,
    ]);
    await expect(service.fixArray(source)).rejects.toMatchObject({
      code: 'CONTENT_ADAPTATION_INCOMPLETE',
      missingRequirements: [expect.stringContaining('hard limit is 80')],
    });
    expect(calls).toHaveLength(3);
  });

  test('source-free repair accepts nullable optional citations as an empty list', async () => {
    const source = state();
    source.contentContext = { facts: [], evidence: [] };
    const { service } = build([
      MISSING,
      { hook: 'Начало', content: { content: CORE, usedCitationIds: null } },
      PASSED,
    ]);
    const result = await service.fixArray(source);
    expect(result.content[0].usedCitationIds).toEqual([]);
  });

  test('piece generation and repair budgets cover the core under the real cap despite a tiny avatar', async () => {
    const modelBudgets = [],
      prompts = [],
      usage = [];
    const responses = [
      draft(FIRST),
      MISSING,
      { hook: 'Сводка', content: item(CORE) },
      PASSED,
    ];
    const model = {
      withStructuredOutput: () =>
        RunnableLambda.from(async (prompt) => {
          prompts.push(String(prompt));
          return responses.shift();
        }),
    };
    const empty = {};
    const { AgentGraphService } = loadWithMocks(
      'libraries/nestjs-libraries/src/agent/agent.graph.service.ts',
      {
        '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service':
          { PostsService: class {} },
        '@contentfactory/nestjs-libraries/database/prisma/media/media.service':
          { MediaService: class {} },
        '@contentfactory/nestjs-libraries/upload/upload.factory': {
          UploadFactory: { createStorage: () => empty },
        },
        '@contentfactory/nestjs-libraries/openai/ai.clients': {
          getChatModel: async (org, temperature, tokens, role) => {
            modelBudgets.push({ tokens, role });
            return model;
          },
        },
        '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
          AiUsageService: class {},
        },
        '@contentfactory/nestjs-libraries/openai/web.research.service': {
          WebResearchService: class {},
        },
        '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service':
          { ContentContextService: class {} },
        '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
          { BrandProfileContextService: class {} },
        '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
          { ContentSourceRegistryService: class {} },
      }
    );
    const service = new AgentGraphService(
      empty,
      empty,
      empty,
      {
        executeAiOperation: async (org, operation, callback, role) => {
          usage.push(role);
          return callback();
        },
      },
      empty,
      empty,
      null,
      null
    );
    const source = state();
    source.intake.core = `${CORE}\n\n${'Второстепенная подробность. '.repeat(
      100
    )}`;
    const generated = await service.generateContent(source);
    await service.fixArray({ ...source, ...generated });
    expect(modelBudgets.map((one) => one.tokens)).toEqual([
      2131, 3000, 2131, 3000,
    ]);
    expect(modelBudgets[2].role).toBe('draft');
    expect(usage).toEqual(['review', 'draft', 'review']);
  });

  test('ordinary generator without a core makes no coverage calls', async () => {
    const { service, calls } = build([]);
    const source = state();
    delete source.intake;
    expect(await service.fixArray(source)).toEqual({
      content: [source.content],
    });
    expect(calls).toHaveLength(0);
  });

  test.each([true, false])(
    'the assembled native graph carries a verified result or the explicit incomplete diagnostic (%s)',
    async (passes) => {
      const source = state();
      source.intake.channel.writingProfile = defaultWritingProfileFor(
        'telegram',
        'ru'
      );
      const reviews = [],
        usage = [];
      const model = {
        withStructuredOutput: (schema) =>
          RunnableLambda.from(async () => {
            const shape = schema.shape;
            if (shape.category) return { category: 'Редакция' };
            if (shape.topic) return { topic: 'Обновления' };
            if (shape.status) {
              reviews.push(1);
              return reviews.length === 2 && passes ? PASSED : MISSING;
            }
            if (shape.content && shape.hook)
              return { hook: 'Полная сводка', content: item(CORE) };
            if (shape.content) return draft(FIRST);
            return { hook: 'Начало' };
          }),
      };
      const { AgentGraphService } = loadAgentGraph({ chatModel: model });
      const service = new AgentGraphService(
        {
          findAllExistingCategories: async () => [],
          findAllExistingTopicsOfCategory: async () => [],
          findPopularPosts: async () => [],
        },
        {},
        {},
        {
          executeAiStreamOperation: (org, operation, callback) => callback(),
          executeAiOperation: async (org, operation, callback, role) => {
            usage.push(role);
            return callback();
          },
        },
        {
          build: async () => ({
            ...source.contentContext,
            contentContextSnapshotId: 'snapshot-a',
            status: 'READY',
            generationPolicy: 'ALLOW_GROUNDED',
            profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
          }),
        },
        {},
        null,
        null
      );
      const events = [];
      for await (const event of service.start(
        'org-a',
        {
          research: 'Обновления',
          format: 'one_long',
          language: 'ru',
          isPicture: false,
          intake: source.intake,
          materialPolicy: 'PIECE_ONLY',
          userMaterialEvidenceIds: ['e-1'],
        },
        { draftOnly: true }
      ))
        events.push(event);

      expect(reviews).toHaveLength(2);
      expect(usage).toEqual(['review', 'draft', 'review']);
      if (passes) {
        const outputs = events
          .map((event) => event.data?.output)
          .filter((output) => Array.isArray(output?.content));
        const final = outputs[outputs.length - 1];
        expect(final.content[0].content).toBe(CORE);
        expect(final.hook).toBe('Полная сводка');
        expect(final.adaptationCoverage).toEqual({
          status: 'passed',
          reviews: 2,
          repaired: true,
        });
        expect(events.some((event) => event.error)).toBe(false);
      } else {
        const error = events.find((event) => event.error);
        expect(error).toMatchObject({
          code: 'CONTENT_ADAPTATION_INCOMPLETE',
          missingRequirements: [SECOND, THIRD],
          incompleteDraft: { hook: 'Полная сводка', content: item(CORE) },
        });
        expect(
          events.some((event) => Array.isArray(event.data?.output?.content))
        ).toBe(false);
      }
    }
  );
});

describe('a selected claim needs the actual admitted source quote', () => {
  test('matching identity, URL and literal quote retain usable source support', () => {
    expect(materialSupport(state().intake.material[0], context())).toEqual({
      citationId: 'E1',
      quote: SECOND,
    });
  });
  test.each([
    { evidenceId: 'different-id' },
    { sourceUrl: 'https://other.test/updates' },
    { quote: 'Полностью выдуманная цитата.' },
    { quote: undefined },
  ])('an id alone cannot certify arbitrary text: %j', (mismatch) => {
    expect(
      materialSupport({ ...state().intake.material[0], ...mismatch }, context())
    ).toBeNull();
  });
});
