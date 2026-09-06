'use strict';

/**
 * Вход одной мыслью подсказывает графу — и без подсказок граф прежний.
 *
 * `content-factory-next-tu3k.2`, волна 06.09.2026. Правка графа аддитивна по
 * решению плана: `POST /posts/generator` продолжает принимать обычный
 * `GeneratorDto`, поле `intake` снаружи не приходит никогда, и каждый набор,
 * который судил промпт до этой волны, обязан судить тот же промпт после неё.
 * Поэтому половина проверок здесь — про то, чего не изменилось.
 *
 * Платных вызовов нет: модель подменена целиком, а `start()` прокручивается до
 * первого события, которое выдаётся раньше компиляции графа.
 */

const { RunnableLambda } = require('@langchain/core/runnables');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadAgentGraph } = require('../scripts/evidence/voice-eval/product-graph.cjs');

const SERVICE = 'libraries/nestjs-libraries/src/agent/agent.graph.service.ts';

const { channelInstructionLines } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/channel-directives.ts'
);
const { defaultWritingProfileFor } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
);

const TELEGRAM_CHANNEL = {
  integrationId: 'channel-1',
  providerIdentifier: 'telegram',
  maxLength: 4096,
  maxCaptionLength: 1024,
  editor: 'html',
  writingProfile: defaultWritingProfileFor('telegram', 'ru'),
};

const hints = (overrides = {}) => ({
  version: 'intake-hints/v1',
  brief: {
    thesis: 'Каналу нужен один пост в неделю, а не пять',
    position: 'Частота без темы не удерживает читателя',
    disagreement: 'Маркетологи, которые считают охваты по числу выходов',
    audience: 'Владельцы небольших каналов',
  },
  ...overrides,
  channel: { ...TELEGRAM_CHANNEL, ...(overrides.channel || {}) },
});

/* ---- Ход `start()`: площадка доходит до строителя и до голоса ------------- */

class WebSearchNotConfigured extends Error {}

const { AgentGraphService } = loadWithMocks(SERVICE, {
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
    WebSearchNotConfigured,
  },
  '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service':
    { ContentContextService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
    { BrandProfileContextService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
    { ContentSourceRegistryService: class {} },
});

const envelope = () => ({
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'context-1',
  status: 'READY',
  generationPolicy: 'ALLOW_GROUNDED',
  builtAt: '2026-09-06T10:00:00.000Z',
  expiresAt: '2026-09-06T10:15:00.000Z',
  profile: { mode: 'resolved', versionId: 'version-1' },
  facts: [],
  evidence: [],
  rejected: [],
  errorCode: null,
  renderedCharacterCount: 0,
  selectionHash: 'selection-1',
});

const body = (overrides = {}) => ({
  research: 'Один пост в неделю',
  isPicture: false,
  format: 'one_long',
  tone: 'company',
  language: 'ru',
  sourceIds: ['source-1'],
  ...overrides,
});

const runStart = async (requestBody) => {
  const calls = { build: [], resolve: [] };
  const service = new AgentGraphService(
    {},
    {},
    {},
    { executeAiStreamOperation: () => (async function* () {})() },
    {
      build: async (...args) => {
        calls.build.push(args);
        return envelope();
      },
    },
    {
      resolve: async (...args) => {
        calls.resolve.push(args);
        return { effectiveVoice: {} };
      },
    },
    null,
    { acceptSearchResult: async () => ({ evidenceId: 'e-1' }) }
  );
  const first = await service.start('org-a', requestBody).next();
  return { calls, first };
};

describe('the channel reaches the material builder and the voice resolver', () => {
  test('with hints both of them are told which platform this is', async () => {
    const { calls, first } = await runStart(body({ intake: hints() }));

    expect(calls.build[0][1].provider).toBe('telegram');
    expect(calls.resolve[0]).toEqual([
      'org-a',
      { mode: 'version', versionId: 'version-1' },
      'telegram',
    ]);
    expect(first.value.name).toBe('content-context');
  });

  test('without hints neither of them hears about a platform', async () => {
    const { calls } = await runStart(body());

    expect('provider' in calls.build[0][1]).toBe(false);
    expect(calls.resolve[0]).toEqual([
      'org-a',
      { mode: 'version', versionId: 'version-1' },
      undefined,
    ]);
  });
});

/* ---- Промпт: бриф, канал и две унаследованные строки ---------------------- */

const capturingModel = (answers) => {
  const prompts = [];
  return {
    prompts,
    withStructuredOutput() {
      return RunnableLambda.from(async (prompt) => {
        prompts.push(String(prompt));
        return answers[Math.min(prompts.length - 1, answers.length - 1)];
      });
    },
  };
};

const channelLines = channelInstructionLines(
  TELEGRAM_CHANNEL.writingProfile,
  {
    name: 'Telegram',
    maxLength: 4096,
    maxCaptionLength: 1024,
    editor: 'html',
  },
  {}
);

const voice = {
  persona: { kind: 'PERSON', portrait: 'Он ведёт канал и пишет о том, что чинил.' },
  examples: [{ kind: 'on_brand', text: 'Так он пишет сам.' }],
  guardrails: { prohibitedTopics: ['политика'] },
};

const stateWith = (overrides = {}) => ({
  orgId: 'org',
  language: 'ru',
  format: 'one_long',
  tone: 'personal',
  messages: [{ content: 'Один пост в неделю' }],
  popularPosts: [{ hook: 'Старый хук', content: 'Старый текст' }],
  researchAvailable: false,
  hook: 'Хук',
  resolvedBrandProfile: { effectiveVoice: voice },
  ...overrides,
});

const withHints = ({ intake, ...overrides } = {}) =>
  stateWith({
    ...overrides,
    intake: hints(intake || {}),
    channelLines,
  });

const draft = (content) => ({ content: { content, usedCitationIds: [] } });

describe('the brief and the channel reach the prompt', () => {
  test('generate-content carries the brief as four named lines', async () => {
    const chatModel = capturingModel([draft('Текст поста')]);
    const { service } = loadAgentGraph({ chatModel });

    await service.generateContent(withHints());
    const prompt = chatModel.prompts[0];

    expect(prompt).toContain('Brief (from the author, follow it):');
    expect(prompt).toContain(
      '- Claim: Каналу нужен один пост в неделю, а не пять'
    );
    expect(prompt).toContain(
      "- The author's position: Частота без темы не удерживает читателя"
    );
    expect(prompt).toContain(
      '- Who would disagree and why: Маркетологи, которые считают охваты по числу выходов'
    );
    expect(prompt).toContain('- Written for: Владельцы небольших каналов');
  });

  test('a brace in the brief is text, not a placeholder', async () => {
    const chatModel = capturingModel([draft('Текст поста')]);
    const { service } = loadAgentGraph({ chatModel });

    await service.generateContent(
      withHints({
        intake: {
          brief: {
            thesis: 'Шаблон {voice} внутри тезиса',
            position: 'позиция',
            disagreement: 'возражение',
            audience: 'адресат',
          },
        },
      })
    );

    expect(chatModel.prompts[0]).toContain('Шаблон {voice} внутри тезиса');
  });

  test('the hook is written under the same brief', async () => {
    const chatModel = capturingModel([{ hook: 'Новый хук' }]);
    const { service } = loadAgentGraph({ chatModel });

    await service.generateHook(withHints());

    expect(chatModel.prompts[0]).toContain('Brief (from the author, follow it):');
    expect(chatModel.prompts[0]).toContain('No hashtags.');
  });

  test('the channel lines stand after the examples and before the guardrails', async () => {
    const chatModel = capturingModel([draft('Текст поста')]);
    const { service } = loadAgentGraph({ chatModel });

    await service.generateContent(withHints());
    const prompt = chatModel.prompts[0];

    const example = prompt.indexOf('Так он пишет сам.');
    const channel = prompt.indexOf('The first 80–180 characters');
    const guardrail = prompt.indexOf('outrank everything above');

    expect(example).toBeGreaterThan(-1);
    expect(channel).toBeGreaterThan(example);
    expect(guardrail).toBeGreaterThan(channel);
  });

  test('a card that allows hashtags removes the inherited ban', async () => {
    const chatModel = capturingModel([draft('Текст поста')]);
    const { service } = loadAgentGraph({ chatModel });

    await service.generateContent(
      withHints({
        intake: {
          channel: {
            writingProfile: {
              ...TELEGRAM_CHANNEL.writingProfile,
              hashtagPolicy: 'end_1_3',
            },
          },
        },
      })
    );

    expect(chatModel.prompts[0]).not.toContain("Don't add any hashtags");
  });

  test("the card's call to action replaces the inherited guess", async () => {
    const chatModel = capturingModel([draft('Текст поста')]);
    const { service } = loadAgentGraph({ chatModel });

    await service.generateContent(withHints());
    const prompt = chatModel.prompts[0];

    expect(prompt).not.toContain('Try to put some call to action');
    expect(prompt).toContain('End with exactly one open question to the reader.');
    expect(prompt).toContain("Don't add any hashtags");
  });

  test('without hints every one of those lines reads exactly as before', async () => {
    const chatModel = capturingModel([draft('Текст поста')]);
    const { service } = loadAgentGraph({ chatModel });

    const result = await service.generateContent(stateWith());
    const prompt = chatModel.prompts[0];

    expect(prompt).toContain("Don't add any hashtags");
    expect(prompt).toContain('Try to put some call to action at the end of the post');
    expect(prompt).not.toContain('Brief (from the author, follow it):');
    expect(prompt).not.toContain('The first 80–180 characters');
    expect(result.antiCopy).toBeUndefined();
  });
});

/* ---- Антикопия: одна повторная попытка и квитанция ------------------------ */

const SOURCE =
  'Мы перестали публиковать каждый день и стали писать один раз в неделю, ' +
  'и охват вырос почти вдвое за два месяца.';

const { wordShingles } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/text-quality/anti-copy.ts'
);
// Модуль S3 ждёт готовые восьмисловные отпечатки, а не сам чужой текст.
const shingles = () => wordShingles(SOURCE);

describe('eight words of somebody else cost one retry, not the post', () => {
  test('a copied run is quoted back and the second draft is kept', async () => {
    const chatModel = capturingModel([
      draft(`Вот что было. ${SOURCE} Дальше свои слова.`),
      draft('Реже, но по делу — и людей стало больше.'),
    ]);
    const { service } = loadAgentGraph({ chatModel });

    const result = await service.generateContent(
      withHints({ foreignShingles: shingles() })
    );

    expect(chatModel.prompts).toHaveLength(2);
    expect(chatModel.prompts[1]).toContain('REWRITE REQUIRED');
    expect(chatModel.prompts[1]).toContain('Keep the meaning, say it in your own words.');
    expect(chatModel.prompts[1]).toContain('перестали публиковать каждый день');
    expect(result.content.content).toBe('Реже, но по делу — и людей стало больше.');
    expect(result.antiCopy).toEqual({
      minWords: 8,
      runs: [],
      retried: true,
      clean: true,
    });
  });

  test('a second draft that still copies is kept, and the receipt says so', async () => {
    const chatModel = capturingModel([
      draft(`Первый. ${SOURCE}`),
      draft(`Второй. ${SOURCE}`),
    ]);
    const { service } = loadAgentGraph({ chatModel });

    const result = await service.generateContent(
      withHints({ foreignShingles: shingles() })
    );

    expect(chatModel.prompts).toHaveLength(2);
    expect(result.content.content).toContain('Второй.');
    expect(result.antiCopy.retried).toBe(true);
    expect(result.antiCopy.clean).toBe(false);
    expect(result.antiCopy.runs).toHaveLength(1);
    expect(result.antiCopy.runs[0].text).toContain('перестали публиковать');
  });

  test('a clean first draft is not paid for twice', async () => {
    const chatModel = capturingModel([
      draft('Свой текст, ни одного чужого оборота подряд.'),
    ]);
    const { service } = loadAgentGraph({ chatModel });

    const result = await service.generateContent(
      withHints({ foreignShingles: shingles() })
    );

    expect(chatModel.prompts).toHaveLength(1);
    expect(result.antiCopy).toEqual({
      minWords: 8,
      runs: [],
      retried: false,
      clean: true,
    });
  });

  test('seven words in common are language, not a copy', async () => {
    const chatModel = capturingModel([
      draft('Мы перестали публиковать каждый день и стали лучше.'),
    ]);
    const { service } = loadAgentGraph({ chatModel });

    const result = await service.generateContent(
      withHints({ foreignShingles: shingles() })
    );

    expect(chatModel.prompts).toHaveLength(1);
    expect(result.antiCopy.clean).toBe(true);
  });

  test('nothing foreign on the input means no check and no receipt', async () => {
    const chatModel = capturingModel([draft(SOURCE)]);
    const { service } = loadAgentGraph({ chatModel });

    const result = await service.generateContent(withHints());

    expect(chatModel.prompts).toHaveLength(1);
    expect(result.antiCopy).toBeUndefined();
  });
});

test('the suite reads the shipped generation node, not a copy of it', () => {
  expect(SERVICE).toBe('libraries/nestjs-libraries/src/agent/agent.graph.service.ts');
});
