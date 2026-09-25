'use strict';

/**
 * «Материала мало» (`content-factory-next-97dq.98`).
 *
 * Production, 25.09.2026: a Telegram adaptation came out at 367 characters
 * against the channel's 500–1000, honestly, because the material was three
 * sentences. The owner: «Мы разрешим ИИ задавать просто дополнительные
 * вопросы и объяснять, почему он их задает. Но они являются необязательными.»
 *
 * Asked here: when the rule fires (and when it never does); the prompt is
 * English, names the output language and carries no Cyrillic outside its
 * data; the model's answer is cut to three questions, each with its reason;
 * after a short post the questions are kept beside the post settings, and
 * not asked again after «Не нужно» or an answer; the answers reach the
 * piece's material the way «Дописать материал» does. No paid calls: the chat
 * model is a fake.
 */

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { cyrillicOutsideData } = require('./helpers/prompt-language.cjs');

const ci = 'libraries/nestjs-libraries/src/content-intelligence';

const asks = loadTypeScriptModule(`${ci}/pieces/material-asks.ts`);
const directives = loadTypeScriptModule('libraries/nestjs-libraries/src/agent/channel-directives.ts');

const modelCalls = [];
let modelAnswers = [];
const chatModel = {
  getChatModel: async (organizationId, temperature, tokens, role) => ({
    withStructuredOutput: () => ({
      invoke: async (prompt) => {
        modelCalls.push({ organizationId, role, prompt });
        if (!modelAnswers.length) throw new Error('one model call too many');
        return modelAnswers.shift();
      },
    }),
  }),
};

const questionsModule = loadWithMocks(`${ci}/channels/material-questions.v1.ts`, {
  '@contentfactory/nestjs-libraries/openai/ai.clients': chatModel,
});

const { PieceService } = loadWithMocks(`${ci}/pieces/piece.service.ts`, {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
    ...chatModel,
  },
  './piece.repository': { PieceRepository: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});

const TELEGRAM = {
  identifier: 'telegram',
  name: 'Telegram',
  maxLength: 4_096,
  maxCaptionLength: 1_024,
  editor: 'html',
};
const RANGE = { idealMin: 500, idealMax: 1_000, hardMax: null };
const profile = (lengthPolicy) => ({
  version: 'channel-writing-profile/v1',
  lengthPolicy,
});
const text = (length) => 'а'.repeat(length);

/* ---- The rule --------------------------------------------------------------- */

describe('the trigger: clearly short of the length the post was written to', () => {
  test('under 90% of the minimum asks; at 90% and above it does not', () => {
    const target = { min: 500 };
    expect(asks.MATERIAL_SHORTFALL_RATIO).toBe(0.9);
    expect(asks.materialShortfall(text(367), target)).toEqual({ length: 367, min: 500 });
    expect(asks.materialShortfall(text(449), target)).toEqual({ length: 449, min: 500 });
    expect(asks.materialShortfall(text(450), target)).toBeNull();
    expect(asks.materialShortfall(text(499), target)).toBeNull();
    expect(asks.materialShortfall(text(500), target)).toBeNull();
    expect(asks.materialShortfall(text(900), target)).toBeNull();
  });

  test('no target, an empty post or a nonsense minimum never asks', () => {
    expect(asks.materialShortfall(text(10), null)).toBeNull();
    expect(asks.materialShortfall(text(10), undefined)).toBeNull();
    expect(asks.materialShortfall('   ', { min: 500 })).toBeNull();
    expect(asks.materialShortfall(text(10), { min: 0 })).toBeNull();
    expect(asks.materialShortfall(text(10), { min: Number.NaN })).toBeNull();
  });

  test('the length is what a reader sees: bold marks and link addresses do not count', () => {
    expect(asks.visiblePostLength('**Жирно** и [слово](https://example.com/very/long/address)')).toBe(
      'Жирно и слово'.length
    );
    expect(asks.visiblePostLength('  🙂 ok  ')).toBe(4);
  });

  test('auto length has no target, from the channel or from the post', () => {
    expect(directives.channelLengthTarget(profile('auto'), TELEGRAM)).toBeNull();
    expect(directives.channelLengthTarget(profile('provider_max'), TELEGRAM)).toBeNull();
    expect(
      directives.channelLengthTarget(profile(RANGE), TELEGRAM, { post: { lengthPolicy: 'auto' } })
    ).toBeNull();
    expect(
      asks.materialShortfall(text(50), directives.channelLengthTarget(profile('auto'), TELEGRAM))
    ).toBeNull();
  });

  test('the target is the range the prompt gives: channel, post range, «Короче / Длиннее», caption', () => {
    expect(directives.channelLengthTarget(profile(RANGE), TELEGRAM)).toEqual({ min: 500, max: 1_000 });
    expect(
      directives.channelLengthTarget(profile(RANGE), TELEGRAM, {
        post: { lengthPolicy: { idealMin: 300, idealMax: 600, hardMax: null } },
      })
    ).toEqual({ min: 300, max: 600 });
    expect(
      directives.channelLengthTarget(profile(RANGE), TELEGRAM, { post: { length: 'shorter' } })
    ).toEqual({ min: 300, max: 600 });
    expect(
      directives.channelLengthTarget(profile(RANGE), TELEGRAM, {
        withPicture: true,
        post: { lengthPolicy: { idealMin: 1_500, idealMax: 3_000, hardMax: null } },
      })
    ).toEqual({ min: 1_024, max: 1_024 });
  });

  test('the prompt still says the same length it said before the rule shared it', () => {
    const lines = directives.channelInstructionLines(profile(RANGE), TELEGRAM, {});
    expect(lines).toContain(
      'Readers of this channel expect 500 to 1000 characters. If the voice above already gives a length of its own, follow whichever of the two ranges is tighter.'
    );
  });
});

/* ---- The prompt --------------------------------------------------------------- */

const PROMPT_INPUT = {
  language: 'ru',
  channelName: 'Мой канал',
  providerIdentifier: 'telegram',
  length: 367,
  min: 500,
  core: 'Мы перестали созваниваться по утрам. Команда пишет в чат меньше. Задачи лежат на доске.',
  post: 'Мы перестали созваниваться по утрам — и **чат затих**.',
  brief: { thesis: 'Доска вместо созвонов', position: 'Я за доску', audience: 'Руководители' },
};

describe('material-questions/v1', () => {
  test('English instructions, the output language named, Cyrillic only in the data', () => {
    const prompt = questionsModule.materialQuestionsPromptV1(PROMPT_INPUT);
    expect(prompt).toContain('PROMPT VERSION: material-questions/v1');
    expect(prompt).toContain('Write every question and every reason in Russian.');
    expect(prompt).toContain('came out at about 367 characters');
    expect(prompt).toContain('expect at least 500');
    expect(prompt).toContain('Never ask what the core, the brief or the post below already answer.');
    expect(prompt).toContain('Never ask the author to write more');
    expect(prompt).toContain('Under `why` give one short line');
    expect(prompt).toContain(PROMPT_INPUT.core);
    expect(prompt).toContain(PROMPT_INPUT.post);
    expect(
      cyrillicOutsideData(prompt, [
        PROMPT_INPUT.channelName,
        PROMPT_INPUT.core,
        PROMPT_INPUT.post,
        ...Object.values(PROMPT_INPUT.brief),
      ])
    ).toEqual([]);
    expect(questionsModule.materialQuestionsPromptV1({ ...PROMPT_INPUT, language: 'en' })).toContain(
      'Write every question and every reason in English.'
    );
  });

  test('the answer: at most three, each with its reason, keyed ask-N, no repeats', () => {
    const parsed = questionsModule.materialQuestionsV1({
      questions: [
        { question: 'Что именно изменилось?', why: 'чтобы показать, как это выглядело на деле' },
        { question: 'Что именно изменилось?', why: 'повтор' },
        { question: 'Без причины?', why: '  ' },
        { question: 'Сколько созвонов было?', why: 'число делает пост конкретным' },
        { question: 'Когда вы это заметили?', why: 'момент делает историю живой' },
        { question: 'Четвёртый?', why: 'лишний' },
      ],
    });
    expect(parsed.map((one) => one.key)).toEqual(['ask-1', 'ask-2', 'ask-3']);
    expect(parsed[0]).toEqual({
      key: 'ask-1',
      question: 'Что именно изменилось?',
      suggested: null,
      why: 'чтобы показать, как это выглядело на деле',
    });
    expect(questionsModule.materialQuestionsV1('мусор')).toEqual([]);
  });

  test('without a model, a core or a post it asks nothing, and a failure never throws', async () => {
    const input = { ...PROMPT_INPUT, organizationId: 'org-a' };
    expect(await questionsModule.askMaterialQuestionsV1(input, {})).toEqual([]);
    const refused = { executeAiOperation: async () => { throw new Error('quota'); } };
    const warnings = [];
    expect(
      await questionsModule.askMaterialQuestionsV1(input, { aiUsage: refused, warn: (line) => warnings.push(line) })
    ).toEqual([]);
    expect(warnings[0]).toContain('quota');
  });
});

/* ---- The service ----------------------------------------------------------------- */

const NOW = new Date('2026-09-25T10:30:00.000Z');
const CORE_TEXT = 'Мы перестали созваниваться по утрам. Команда пишет в чат меньше.';
const PERSON_TEXT = 'Мы перестали созваниваться по утрам.';

const build = (options = {}) => {
  const piece = {
    id: 'piece-1',
    title: 'Созвоны',
    kind: 'CORE',
    body: CORE_TEXT,
    brief: {
      brief: { inputKind: 'thought', thesis: 'Доска вместо созвонов', facts: [], origins: {}, ungrounded: [] },
      answers: [],
      writtenBy: 'model',
      authorNumbers: false,
      personText: PERSON_TEXT,
    },
    language: 'ru',
    tags: options.tags ?? { archive: false },
    archivedAt: null,
    createdAt: new Date('2026-09-25T09:00:00.000Z'),
    brandProfileVersion: null,
  };
  const calls = { usage: [], writes: 0 };
  modelCalls.length = 0;
  modelAnswers = [...(options.models ?? [])];
  const db = {
    lockPieceTags: async () => ({ tags: piece.tags }),
    writePieceTags: async (organizationId, pieceId, tags) => {
      calls.writes += 1;
      piece.tags = JSON.parse(JSON.stringify(tags));
      return true;
    },
  };
  const repository = {
    getPiece: async () => piece,
    listIntegrations: async () => [],
    adaptationsByPiece: async () => [],
    channelVariants: async () => [],
    busySlots: async () => [],
    setPlan: async () => ({ count: 0 }),
    channelPlanMode: async () => null,
    withChannelLock: async (organizationId, pieceId, integrationId, work) => work(db),
  };
  const service = new PieceService(
    repository,
    { start: async function* () {} },
    { getSocialIntegration: () => null },
    () => NOW,
    null,
    {
      executeAiOperation: async (organizationId, operation, callback, role) => {
        calls.usage.push([organizationId, operation, role]);
        return callback();
      },
    },
    {
      updateCoreMetadata: async (organizationId, pieceId, input) => {
        if (input.expectedBody !== piece.body) throw new Error('moved');
        piece.brief = JSON.parse(JSON.stringify(input.brief));
      },
      updateCore: async () => {
        throw new Error('not used here');
      },
    },
    null,
    null,
    null,
    null
  );
  return { service, piece, calls };
};

const plan = (overrides = {}) => ({
  pieceId: 'piece-1',
  integrationId: 'int-tg',
  kind: 'post',
  language: 'ru',
  request: { integrationId: 'int-tg', kind: 'post', ...(overrides.request ?? {}) },
  channel: {
    id: 'int-tg',
    name: 'Мой канал',
    providerIdentifier: 'telegram',
    contentLanguage: 'ru',
    profile: profile(overrides.lengthPolicy ?? RANGE),
    maxLength: 4_096,
    maxCaptionLength: 1_024,
    editor: 'html',
  },
  core: {
    text: overrides.coreText ?? CORE_TEXT,
    brief: { thesis: 'Доска вместо созвонов', audience: null, position: null },
  },
  foreignShingles: [],
  legacyBody: null,
  title: 'Созвоны',
});
const adaptation = (id, length) => ({ id, body: text(length) });
const ASKED = {
  questions: [
    { question: 'Что именно изменилось после отмены созвонов?', why: 'чтобы показать, как это выглядело на деле' },
    { question: 'Сколько времени это освободило?', why: 'число делает пост конкретным' },
  ],
};

describe('after a post is written', () => {
  test('a short post gets its questions, kept beside the post settings', async () => {
    const { service, piece, calls } = build({ models: [ASKED] });
    await service.askForMaterial('org-a', plan(), adaptation('ad-1', 367));
    expect(modelCalls).toHaveLength(1);
    expect(modelCalls[0].role).toBe('extract');
    expect(modelCalls[0].prompt).toContain('PROMPT VERSION: material-questions/v1');
    expect(calls.usage).toEqual([['org-a', 'intake', 'extract']]);
    expect(piece.tags.archive).toBe(false);
    const open = asks.openMaterialAskOf(piece.tags, 'int-tg');
    expect(open).toEqual({
      adaptationId: 'ad-1',
      length: 367,
      min: 500,
      questions: [
        { key: 'ask-1', question: ASKED.questions[0].question, suggested: null, why: ASKED.questions[0].why },
        { key: 'ask-2', question: ASKED.questions[1].question, suggested: null, why: ASKED.questions[1].why },
      ],
    });
  });

  test('a post long enough, or with auto length, asks nothing and costs nothing', async () => {
    for (const [lengthPolicy, length] of [[RANGE, 460], [RANGE, 700], ['auto', 50]]) {
      const { service, piece, calls } = build({ models: [ASKED] });
      await service.askForMaterial('org-a', plan({ lengthPolicy }), adaptation('ad-1', length));
      expect(modelCalls).toEqual([]);
      expect(calls.usage).toEqual([]);
      expect(piece.tags.materialAsks).toBeUndefined();
    }
  });

  test('the post’s own «auto» length outranks the channel range', async () => {
    const { service, piece } = build({ models: [ASKED] });
    await service.askForMaterial(
      'org-a',
      plan({ request: { overrides: { lengthPolicy: 'auto' } } }),
      adaptation('ad-1', 100)
    );
    expect(modelCalls).toEqual([]);
    expect(piece.tags.materialAsks).toBeUndefined();
  });

  test('open questions move to the next short post without a second call', async () => {
    const { service, piece } = build({ models: [ASKED] });
    await service.askForMaterial('org-a', plan(), adaptation('ad-1', 367));
    await service.askForMaterial('org-a', plan(), adaptation('ad-2', 380));
    expect(modelCalls).toHaveLength(1);
    expect(asks.openMaterialAskOf(piece.tags, 'int-tg')).toMatchObject({ adaptationId: 'ad-2', length: 380 });
  });

  test('«Не нужно» closes them for good on this material, and the page no longer shows them', async () => {
    const { service, piece } = build({ models: [ASKED] });
    await service.askForMaterial('org-a', plan(), adaptation('ad-1', 367));
    expect(
      await service.materialQuestions('org-a', 'piece-1', 'int-tg', { adaptationId: 'ad-1', dismiss: true }, 'ru')
    ).toEqual({ state: 'dismissed' });
    expect(asks.openMaterialAskOf(piece.tags, 'int-tg')).toBeNull();
    expect(asks.materialAskRecordOf(piece.tags, 'int-tg').closedAt).toBe(NOW.toISOString());
    // A rewrite from the same core does not ask again.
    await service.askForMaterial('org-a', plan(), adaptation('ad-2', 360));
    expect(modelCalls).toHaveLength(1);
    expect(asks.openMaterialAskOf(piece.tags, 'int-tg')).toBeNull();
    // A second press is harmless.
    expect(
      await service.materialQuestions('org-a', 'piece-1', 'int-tg', { adaptationId: 'ad-1', dismiss: true }, 'ru')
    ).toEqual({ state: 'dismissed' });
  });

  test('another post’s questions are refused, not guessed', async () => {
    const { service } = build({ models: [ASKED] });
    await service.askForMaterial('org-a', plan(), adaptation('ad-1', 367));
    await expect(
      service.materialQuestions('org-a', 'piece-1', 'int-tg', { adaptationId: 'ad-9', dismiss: true }, 'ru')
    ).rejects.toMatchObject({ code: 'ADAPTATION_NOT_FOUND' });
  });
});

describe('the answers reach the core material', () => {
  test('question → answer joins the person’s words as added material; the round is closed', async () => {
    const { service, piece } = build({ models: [ASKED] });
    await service.askForMaterial('org-a', plan(), adaptation('ad-1', 367));
    const outcome = await service.materialQuestions(
      'org-a',
      'piece-1',
      'int-tg',
      {
        adaptationId: 'ad-1',
        answers: [
          { key: 'ask-1', text: '  Утро стало тихим, статусы видны на доске.  ' },
          { key: 'ask-2', text: '   ' },
        ],
      },
      'ru'
    );
    expect(outcome).toEqual({ state: 'answered', materialPending: true });
    const added = `${ASKED.questions[0].question} → Утро стало тихим, статусы видны на доске.`;
    expect(piece.brief.personText).toBe(`${PERSON_TEXT}\n\n${added}`);
    expect(piece.brief.addedMaterial).toEqual([{ text: added, addedAt: NOW.toISOString() }]);
    expect(piece.brief.materialPending).toBe(true);
    // The core itself waits for «Пересобрать суть», as with any added material.
    expect(piece.body).toBe(CORE_TEXT);
    expect(asks.materialAskRecordOf(piece.tags, 'int-tg').state).toBe('answered');
    // Answered once: the rewrite after it is not asked again, even from a new core.
    await service.askForMaterial('org-a', plan({ coreText: 'Новая суть.' }), adaptation('ad-2', 300));
    expect(modelCalls).toHaveLength(1);
  });

  test('no answer at all is refused and changes nothing', async () => {
    const { service, piece } = build({ models: [ASKED] });
    await service.askForMaterial('org-a', plan(), adaptation('ad-1', 367));
    await expect(
      service.materialQuestions('org-a', 'piece-1', 'int-tg', { adaptationId: 'ad-1', answers: [{ key: 'ask-1', text: ' ' }] }, 'ru')
    ).rejects.toMatchObject({ code: 'PIECE_MATERIAL_EMPTY', status: 400 });
    expect(piece.brief.personText).toBe(PERSON_TEXT);
    expect(asks.materialAskRecordOf(piece.tags, 'int-tg').state).toBe('open');
  });
});

describe('storage stays in the piece’s tags', () => {
  test('writing one channel keeps every other key; removing the last removes the bag', () => {
    const record = {
      adaptationId: 'ad-1', length: 367, min: 500, state: 'open', core: 'x', askedAt: 'a', closedAt: null,
      questions: [{ key: 'ask-1', question: 'Q?', suggested: null, why: 'W' }],
    };
    const tags = asks.withMaterialAsk({ postSettings: { a: 1 } }, 'int-tg', record);
    expect(tags.postSettings).toEqual({ a: 1 });
    expect(asks.materialAskRecordOf(tags, 'int-tg')).toEqual(record);
    expect(asks.withMaterialAsk(tags, 'int-tg', null)).toEqual({ postSettings: { a: 1 } });
    expect(asks.materialAskRecordOf({ materialAsks: { 'int-tg': { state: 'odd' } } }, 'int-tg')).toBeNull();
  });
});
