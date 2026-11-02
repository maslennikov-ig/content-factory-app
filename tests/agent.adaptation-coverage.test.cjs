'use strict';

const { RunnableLambda } = require('@langchain/core/runnables');
const {
  loadAgentGraph,
} = require('../scripts/evidence/voice-eval/product-graph.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { materialSupport, preferredLengthFindings, AUTHOR_MEANING_ADAPTATION_RULE, ADAPTATION_SOURCE_FIDELITY_RULE } = loadWithMocks(
  'libraries/nestjs-libraries/src/agent/adaptation-coverage.ts'
);
const { defaultWritingProfileFor } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
);
const { channelInstructionLines } = loadWithMocks(
  'libraries/nestjs-libraries/src/agent/channel-directives.ts'
);
const { wordShingles, sharedRuns } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/text-quality/anti-copy.ts'
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

test('writer and existing review share meaning-first avatar policy, retain raw context, and accept a paraphrase without another call', async () => {
  const source = state(), reply = 'Ну, я голосом обычно только диктую текст. Разговаривать в реальном времени мне неудобно.';
  source.intake.core = reply;
  source.intake.contextMaterial = reply;
  const addition = { text: 'Это экономит мне время только при проверке результата; чужие оценки я пока не проверял.', addedAt: '2026-10-31T12:00:00Z' };
  source.intake.authorAdditions = [addition];
  source.intake.instructionText = 'Передай мою мысль естественно голосом аватара.';
  source.intake.request = { version: 'intake-request/v1', goal: 'Adapt the author view', constraints: { requirements: ['An older inferred summary says to preserve replies verbatim.'] } };
  source.intake.material = [];
  source.contentContext = { facts: [], evidence: [] };
  const rewritten = 'Голосовой ввод использую для диктовки. Для живого разговора такой формат мне пока неудобен. Время экономится, если проверять результат; чужие оценки я пока не проверял.';
  const { service, calls } = build([{ content: { content: rewritten } }, PASSED]);
  const generated = await service.generateContent(source);
  const result = await service.fixArray({ ...source, ...generated });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toContain(AUTHOR_MEANING_ADAPTATION_RULE);
  expect(calls[1]).toContain(AUTHOR_MEANING_ADAPTATION_RULE);
  expect(calls[0]).not.toContain('over VERBATIM');
  const input = JSON.parse(calls[1].slice(calls[1].indexOf('Human: ') + 7));
  expect(input.core).toBe(reply); expect(input.contextMaterial).toBe(reply);
  expect(input.authorAdditions).toEqual([addition]);
  expect(calls[0]).toContain(addition.text);
  expect(result.content[0].content).toBe(rewritten);
  expect(source.intake.core).toBe(reply);
});

describe('final adaptation review advises without discarding or rewriting the draft', () => {
  test('a passed review retains the exact draft and supported own-core wording', async () => {
    const own = 'Лабораториям доступно до 30 мест Business Standard бесплатно на срок до 12 месяцев.';
    const source = state();
    source.hook = '';
    source.intake.core = own;
    source.intake.post = { lengthPolicy: 'auto' };
    source.content = item(own);
    source.foreignShingles = wordShingles('Eligible research labs can receive thirty seats for one year.');
    source.channelLines = channelInstructionLines(defaultWritingProfileFor('telegram', 'ru'),
      { identifier: 'telegram', name: 'Telegram', maxLength: 4096, editor: 'html' }, { foreignShingles: source.foreignShingles });
    const { service, calls, usage } = build([PASSED]);
    const result = await service.fixArray(source);
    expect(result.content).toEqual([source.content]);
    expect(result.adaptationCoverage).toEqual({ ...PASSED, reviews: 1, repaired: false });
    expect(result.antiCopy).toMatchObject({ clean: true, runs: [], retried: false });
    const input = JSON.parse(calls[0].slice(calls[0].indexOf('Human: ') + 7));
    expect(input.foreignCopy).toEqual({ minWords: 8, matches: [] });
    expect(calls[0]).not.toContain('any material you were given');
    expect(calls[0]).toContain('Do not invent a copying violation from overlap with the neutral core');
    expect(usage.map(one => one.role)).toEqual(['review']);
  });

  test.each([
    MISSING,
    { status: 'partial', missingRequirements: [], unsupportedClaims: ['Source says 12, not 21.'] },
    { status: 'passed', missingRequirements: ['An omitted condition.'], unsupportedClaims: [] },
    { status: 'invalid' },
  ])('retains the paid draft with honest findings and no automatic rewrite: %j', async verdict => {
    const source = state();
    const { service, calls, usage } = build([verdict]);
    const result = await service.fixArray(source);
    expect(result.content).toEqual([source.content]);
    expect(result.hook).toBe(source.hook);
    expect(result.adaptationCoverage).toMatchObject({ status: 'partial', reviews: 1, repaired: false });
    expect(result.adaptationCoverage.missingRequirements.length + result.adaptationCoverage.unsupportedClaims.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    expect(usage.map(one => one.role)).toEqual(['review']);
  });

  test('final review cannot erase an unlinked-source finding even when it says passed', async () => {
    const { service } = build([{ content: { content: CORE, usedCitationIds: ['invented'] } }, PASSED]);
    const source = state();
    const generated = await service.generateContent(source);
    const result = await service.fixArray({ ...source, ...generated });
    expect(result.content[0].content).toBe(CORE);
    expect(result.content[0].usedCitationIds).toEqual([]);
    expect(result.adaptationCoverage).toMatchObject({ status: 'partial', missingRequirements: expect.arrayContaining([expect.stringContaining('не связана с источниками')]) });
  });

  test('foreign copying is reported even if it also appears in the core and the model says passed', async () => {
    const text = 'Чужой текст содержит достаточно последовательных слов чтобы проверка заметила заимствование целиком.';
    const source = state();
    source.hook = '';
    source.intake.core = text;
    source.content = item(text);
    source.foreignShingles = wordShingles(text);
    const { service, calls } = build([PASSED]);
    const result = await service.fixArray(source);
    expect(result.content).toEqual([source.content]);
    expect(result.adaptationCoverage).toMatchObject({ status: 'partial', unsupportedClaims: [expect.stringContaining('совпадения')] });
    expect(result.antiCopy).toMatchObject({ clean: false, retried: false, runs: sharedRuns(text, source.foreignShingles) });
    expect(calls).toHaveLength(1);
  });

  test.each([false, true])('overlength including the hook is advisory, including picture captions (%s)', async picture => {
    const source = state();
    source.isPicture = picture;
    source.hook = 'Х'.repeat(20);
    source.content = item('Т'.repeat(210));
    source.intake.channel.writingProfile.lengthPolicy.hardMax = 220;
    source.intake.channel.maxCaptionLength = 80;
    const { service, calls } = build([PASSED]);
    const result = await service.fixArray(source);
    expect(result.content).toEqual([source.content]);
    expect(result.adaptationCoverage).toMatchObject({ status: 'partial', missingRequirements: expect.arrayContaining([expect.stringContaining(`при ограничении ${picture ? 80 : 220}`)]) });
    expect(calls).toHaveLength(1);
  });

  test('reviewer failure retains the draft and independent free findings without a false passing verdict', async () => {
    const source = state();
    source.hook = '';
    source.content = item('Чужой текст содержит достаточно последовательных слов чтобы заметить заимствование целиком.');
    source.foreignShingles = wordShingles(source.content.content);
    source.intake.channel.maxLength = 20;
    const { service, calls } = build([new Error('Unavailable')]);
    const result = await service.fixArray(source);
    expect(result.content).toEqual([source.content]);
    expect(result.adaptationCoverage).toMatchObject({ status: 'unavailable', reviews: 1, repaired: false,
      unsupportedClaims: [expect.stringContaining('совпадения')],
      missingRequirements: expect.arrayContaining([expect.stringContaining('при ограничении 20')]) });
    expect(result.antiCopy.clean).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test('generation records foreign overlap without buying a second draft', async () => {
    const source = state();
    source.contentContext = { facts: [], evidence: [] };
    const text = 'Чужой текст содержит достаточно последовательных слов чтобы заметить заимствование целиком.';
    source.foreignShingles = wordShingles(text);
    const { service, calls } = build([{ content: { content: text, usedCitationIds: [] } }]);
    const result = await service.generateContent(source);
    expect(result.content.content).toBe(text);
    expect(result.antiCopy).toMatchObject({ clean: false, retried: false });
    expect(calls).toHaveLength(1);
  });

  test('ordinary generator without a core makes no semantic review call', async () => {
    const source = state();
    delete source.intake;
    const { service, calls } = build([]);
    expect(await service.fixArray(source)).toEqual({ content: [source.content] });
    expect(calls).toHaveLength(0);
  });

  test.each([true, false, 'unavailable'])('the assembled native graph returns the draft once for review outcome %s', async outcome => {
    const source = state();
    source.intake.channel.writingProfile = defaultWritingProfileFor('telegram', 'ru');
    source.intake.post = { lengthPolicy: 'auto' };
    const reviews = [], usage = [];
    const model = { withStructuredOutput: schema => RunnableLambda.from(async () => {
      const shape = schema.shape;
      if (shape.category) return { category: 'Редакция' };
      if (shape.topic) return { topic: 'Обновления' };
      if (shape.status) {
        reviews.push(1);
        if (outcome === 'unavailable') throw new Error('Reviewer unavailable');
        return outcome ? PASSED : MISSING;
      }
      if (shape.content) return draft(FIRST);
      return { hook: 'Начало' };
    }) };
    const { AgentGraphService } = loadAgentGraph({ chatModel: model });
    const service = new AgentGraphService({ findAllExistingCategories: async () => [], findAllExistingTopicsOfCategory: async () => [], findPopularPosts: async () => [] }, {}, {}, {
      executeAiStreamOperation: (org, operation, callback) => callback(),
      executeAiOperation: async (org, operation, callback, role) => { usage.push(role); return callback(); },
    }, { build: async () => ({ ...source.contentContext, contentContextSnapshotId: 'snapshot-a', status: 'READY', generationPolicy: 'ALLOW_GROUNDED', profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' } }) }, {}, null, null);
    const events = [];
    for await (const event of service.start('org-a', { research: 'Обновления', format: 'one_long', language: 'ru', isPicture: false, intake: source.intake, materialPolicy: 'PIECE_ONLY', userMaterialEvidenceIds: ['e-1'] }, { draftOnly: true })) events.push(event);
    const outputs = events.map(event => event.data?.output).filter(output => Array.isArray(output?.content));
    expect(outputs.length).toBeGreaterThan(0);
    const final = outputs.at(-1);
    expect(final.content[0].content).toBe(FIRST);
    expect(final.adaptationCoverage).toMatchObject({ status: outcome === 'unavailable' ? 'unavailable' : outcome ? 'passed' : 'partial', reviews: 1, repaired: false });
    expect(events.some(event => event.error)).toBe(false);
    expect(reviews).toHaveLength(1);
    expect(usage).toEqual(['review']);
  });
});

describe('a selected claim needs the actual admitted source quote', () => {
  test('omitted spans cannot be presented as one literal source quote', () => {
    const source = context();
    source.evidence[0].excerpt = `${FIRST}\n[... source text omitted ...]\n${SECOND}`;
    source.evidence[0].literalSpans = [FIRST, SECOND];
    expect(materialSupport({ ...state().intake.material[0], quote: source.evidence[0].excerpt }, source)).toBeNull();
    expect(materialSupport(state().intake.material[0], source)).toMatchObject({ quote: SECOND });
  });
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

test('piece proof preflight receives the whole saved core and untrimmed proof hints before paid generation', async () => {
  const source = state();
  source.intake.evidenceQuotes = [...source.intake.material, {
    evidenceId: 'late-source', sourceUrl: 'https://example.test/late', quote: 'Late literal quote.', statement: 'Late claim.',
  }];
  const buildContext = jest.fn(async () => {
    throw Object.assign(new Error('Essential source proof needs 900 characters; only 200 remain.'), {
      code: 'CONTENT_EVIDENCE_REQUIRED', missingRequirements: ['The essential late quote could not be admitted.'], unsupportedClaims: [],
    });
  });
  const paid = jest.fn(() => { throw new Error('No generation may be admitted after failed proof preflight'); });
  const { AgentGraphService } = loadAgentGraph({ chatModel: { withStructuredOutput: paid } });
  const service = new AgentGraphService({}, {}, {}, {
    executeAiOperation: paid, executeAiStreamOperation: paid,
  }, { build: buildContext }, {}, null, null);
  const events = [];
  for await (const event of service.start('org-a', {
    research: 'A short thesis', language: 'ru', format: 'one_long', isPicture: false,
    intake: source.intake, materialPolicy: 'PIECE_ONLY', userMaterialEvidenceIds: ['e-1', 'late-source'],
  }, { draftOnly: true })) events.push(event);
  expect(buildContext.mock.calls[0][1].pieceEvidence).toEqual({
    version: 'piece-evidence/v1', core: CORE, quotes: source.intake.evidenceQuotes,
  });
  expect(paid).not.toHaveBeenCalled();
  expect(events).toEqual([expect.objectContaining({
    code: 'CONTENT_EVIDENCE_REQUIRED', missingRequirements: ['The essential late quote could not be admitted.'],
  })]);
});

// These checks exercise shipped prompts and review inputs, not a fabricated
// semantic verdict. Real-provider editorial qualification remains separate.
test('hook, body and advisory review preserve unspecified actors and distinguish creative wording from new facts', async () => {
  const source = state();
  source.intake.core = 'Черновик собирается из введённых вручную тезисов. Решение требует подтверждения.';
  source.contentContext = { facts: [], evidence: [] };
  source.intake.material = [];
  const { service, calls } = build([{ hook: 'Кто проверит итог?' }, draft(source.intake.core), PASSED]);
  const hook = await service.generateHook(source);
  const body = await service.generateContent({ ...source, ...hook });
  await service.fixArray({ ...source, ...hook, ...body });
  expect(calls).toHaveLength(3);
  expect(ADAPTATION_SOURCE_FIDELITY_RULE).toContain('leave an unspecified actor');
  for (const prompt of calls) expect(prompt).toContain(ADAPTATION_SOURCE_FIDELITY_RULE);
  expect(calls[2]).toContain('preferred channel range');
  expect(calls[2]).not.toContain('not text length');
});

test.each([
  [{ length: 'longer' }, { idealMin: 1350, idealMax: 1950, hardMax: 2250 }],
  [{ length: 'longer', lengthPolicy: 'auto' }, 'auto'],
  [{ lengthPolicy: { idealMin: null, idealMax: 1800 } }, { idealMin: null, idealMax: 1800 }],
])('review receives the same resolved length as the writer for overrides %j', async (post, expected) => {
  const source = state();
  source.intake.post = post;
  const { service, calls } = build([PASSED]);
  await service.fixArray(source);
  const input = JSON.parse(calls[0].slice(calls[0].indexOf('Human: ') + 7));
  expect(input.channelLengthPolicy).toEqual(expected);
  expect(input.postCharacterCounts).toEqual([(source.hook + '\n\n' + source.content.content).length]);
});


test.each([false, true])('caption targets are attainable and visible link labels determine preferred length (override=%s)', async override => {
  const source = state();
  source.isPicture = true;
  source.intake.channel.maxCaptionLength = 1024;
  const policy = { idealMin: 1600, idealMax: 2400, hardMax: 2700 };
  if (override) source.intake.post = { lengthPolicy: policy };
  else source.intake.channel.writingProfile.lengthPolicy = policy;
  source.hook = '';
  source.content = item('[Документ](https://example.test/' + 'a'.repeat(1200) + ')');
  const { service, calls } = build([PASSED]);
  await service.fixArray(source);
  const input = JSON.parse(calls[0].slice(calls[0].indexOf('Human: ') + 7));
  expect(input.channelLengthPolicy).toEqual({ idealMin: 1024, idealMax: 1024, hardMax: 1024 });
  expect(input.postVisibleCharacterCounts).toEqual([8]);
  expect(input.postCharacterCounts[0]).toBeGreaterThan(1200);
  const lines = channelInstructionLines(source.intake.channel.writingProfile,
    { identifier: 'telegram', name: 'Telegram', maxLength: 4096, maxCaptionLength: 1024 },
    { withPicture: true, post: source.intake.post });
  expect(lines.join(' ')).toContain('1024');
  expect(lines.join(' ')).not.toMatch(/1600|2400|2700/);
});

test.each([PASSED, new Error('Reviewer unavailable')])('preferred range violation survives the review result without another call', async verdict => {
  const source = state();
  source.hook = '';
  source.content = item('т'.repeat(100));
  source.intake.post = { lengthPolicy: { idealMin: 200, idealMax: 400, hardMax: 500 } };
  const { service, calls } = build([verdict]);
  const result = await service.fixArray(source);
  expect(result.content).toEqual([source.content]);
  expect(result.adaptationCoverage.status).toBe(verdict instanceof Error ? 'unavailable' : 'partial');
  expect(result.adaptationCoverage.missingRequirements).toEqual(expect.arrayContaining([
    expect.stringMatching(/100.*200.*400/),
  ]));
  expect(calls).toHaveLength(1);
});

test('approved per-post range is used instead of the channel default and hidden link destinations do not inflate visible length', async () => {
  const source = state();
  source.hook = '';
  source.intake.post = { lengthPolicy: { idealMin: 10, idealMax: 20, hardMax: 2000 } };
  source.content = item('[123456789012345](https://example.test/' + 'x'.repeat(1000) + ')');
  const { service } = build([PASSED]);
  const result = await service.fixArray(source);
  expect(result.adaptationCoverage).toEqual({ ...PASSED, reviews: 1, repaired: false });
});

test('each series post is measured independently and auto has no preferred range', async () => {
  const source = state();
  source.hook = 'hook';
  source.intake.presentation = 'series';
  source.intake.post = { lengthPolicy: { idealMin: 10, idealMax: 20, hardMax: 50 } };
  source.content = [item('a'.repeat(6)), item('b'.repeat(21))];
  const { service } = build([PASSED, PASSED]);
  const result = await service.fixArray(source);
  expect(result.adaptationCoverage.missingRequirements).toEqual([expect.stringMatching(/2.*21.*10.*20/)]);
  source.intake.post = { lengthPolicy: 'auto' };
  const automatic = await service.fixArray(source);
  expect(automatic.adaptationCoverage).toEqual({ ...PASSED, reviews: 1, repaired: false });
});

test('provider maximum alone does not invent a preferred range', () => {
  expect(preferredLengthFindings([1, 1000], 'provider_max', 'ru')).toEqual([]);
});
