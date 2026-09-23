'use strict';

/**
 * Интервью без счёта (`content-factory-next-97dq.44`), одиннадцатый заход
 * 23.09.2026: «Пусть дают столько вопросов, сколько ей нужно … И тем более не
 * создавать типовые вопросы».
 *
 * Здесь — чистые части: промпты-преемники, разбор ответа модели и дверь,
 * которая принимает ключи вопросов модели. Поток целиком проверяет
 * `content-pieces.service.test.cjs`. Платных вызовов нет.
 */

require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const v9 = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v9.ts'
);
const { briefFillPromptV8 } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v8.ts'
);
const { briefFillPromptV7 } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v7.ts'
);
const v4 = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-question.v4.ts',
  {
    '@contentfactory/nestjs-libraries/openai/ai.clients': { getChatModel: async () => null },
  }
);

const promptInput = (overrides = {}) => ({
  language: 'ru',
  material: 'Из шести сроков, которые я ставил себе сам, сдвинулись пять.',
  materialKind: 'thought',
  fixed: [],
  avatar: [],
  channel: [],
  facts: [],
  evidence: [],
  ...overrides,
});

describe('intake-brief-fill/v9', () => {
  test.each(['thought', 'borrowed', 'instruction'])(
    '%s: без правил «не больше двух» и без вопроса по умолчанию, со своей версией',
    (materialKind) => {
      const prompt = v9.briefFillPromptV9(promptInput({ materialKind }));
      expect(prompt).toContain('PROMPT VERSION: intake-brief-fill/v9');
      for (const retired of v9.RETIRED_QUESTION_RULES_V9) {
        expect(prompt).not.toContain(retired);
      }
      expect(prompt).not.toContain('defaultQuestion');
      expect(prompt).toContain('never ask it');
      // Цель, а не минимум (живая проверка 23.09: каждый тонкий текст — ровно
      // один вопрос): «спроси всё, что заметно улучшит пост», и ни слова,
      // толкающего к одному вопросу.
      expect(prompt).toContain('useful and interesting to its reader');
      expect(prompt).toContain('Ask every question whose answer would materially improve THIS post');
      expect(prompt).toContain('how it was before and what changed after');
      expect(prompt).toContain('the author’s own numbers');
      expect(prompt).toContain('Never ask for details of a public event, study or topic');
      for (const pushToMinimum of ['and no more', 'not everything on this list', 'a skipped one still leaves']) {
        expect(prompt).not.toContain(pushToMinimum);
      }
      // Неясную позицию или читателя спрашивают, а не придумывают; числа
      // человека в предложенных полях — его словами.
      for (const replaced of Object.keys(v9.REPLACED_BASE_RULES_V9)) {
        expect(prompt).not.toContain(replaced);
      }
      expect(prompt).toContain('ask (see Interview) instead of settling on a guess');
      expect(prompt).toContain('their numbers and claims appear in their own wording or not at all');
      // Одна строка версии и ни одной пустой строки внутри правил интервью.
      expect(prompt.match(/PROMPT VERSION:/g)).toHaveLength(1);
      const interview = prompt.slice(prompt.indexOf('Interview (`questions`)'));
      expect(interview.split('\n').filter((line) => !line.trim())).toEqual([]);
      // Правила брифа остались: число человека — своей строкой.
      if (materialKind !== 'instruction') {
        expect(prompt).toContain('Every number, date, duration, share, sum or count the person stated');
      }
    }
  );

  test('убранные строки — дословно те, что стоят в выпущенном v8', () => {
    const released = briefFillPromptV8(promptInput());
    for (const retired of v9.RETIRED_QUESTION_RULES_V9) {
      expect(released).toContain(retired);
    }
  });

  test('заменённые правила брифа — дословно те, что стоят в выпущенных v7 и v8', () => {
    const [own, instruction] = Object.keys(v9.REPLACED_BASE_RULES_V9);
    const releasedOwn = briefFillPromptV8(promptInput());
    expect(releasedOwn).toContain(own);
    expect(releasedOwn).toContain('PROMPT VERSION: intake-brief-fill/v8');
    expect(releasedOwn).toContain('PROMPT VERSION: intake-brief-fill/v5');
    expect(briefFillPromptV7(promptInput({ materialKind: 'borrowed' }))).toContain(own);
    expect(briefFillPromptV7(promptInput({ materialKind: 'instruction' }))).toContain(instruction);
  });

  test('схема принимает вопрос о материале и пустой список', () => {
    const base = {
      goal: null, thesis: null, position: null, disagreement: null, audience: null,
      format: null, facts: [], origins: {}, options: {},
    };
    expect(
      v9.briefFillSchemaV9.safeParse({
        ...base,
        questions: [{ about: 'material', question: 'Когда это было?', options: [] }],
      }).success
    ).toBe(true);
    expect(v9.briefFillSchemaV9.safeParse({ ...base, questions: [] }).success).toBe(true);
    expect(
      v9.briefFillSchemaV9.safeParse({
        ...base,
        questions: [{ about: 'wallet', question: 'Что?', options: [] }],
      }).success
    ).toBe(false);
  });

  test('разбор: порядок модели, один вопрос на поле, ключи у материала, страховка на восьми', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      about: 'material',
      question: `Эпизод номер ${index + 1}?`,
      options: ['а', 'б', 'в', 'г'],
    }));
    const parsed = v9.interviewQuestionsV9([
      { about: 'thesis', question: 'Что подчеркнуть в посте о сроках?', options: ['null', 'Сроки с клиентом'] },
      { about: 'thesis', question: 'Ещё раз о тезисе?', options: [] },
      { about: 'unknown', question: 'Чужое?', options: [] },
      { about: 'material', question: 'что подчеркнуть в посте о сроках?', options: [] },
      ...many,
    ]);
    expect(parsed).toHaveLength(8);
    expect(parsed[0]).toEqual({
      field: 'thesis',
      question: 'Что подчеркнуть в посте о сроках?',
      options: ['Сроки с клиентом'],
      suggested: null,
    });
    expect(parsed.slice(1).map((row) => row.key)).toEqual([
      'ask-1', 'ask-2', 'ask-3', 'ask-4', 'ask-5', 'ask-6', 'ask-7',
    ]);
    expect(parsed.slice(1).every((row) => row.field === 'facts')).toBe(true);
    expect(parsed[1].options).toEqual(['а', 'б', 'в']);
  });

  test('ноль вопросов — честный ответ', () => {
    expect(v9.interviewQuestionsV9([])).toEqual([]);
    expect(v9.interviewQuestionsV9(null)).toEqual([]);
  });
});

describe('channel-question/v4', () => {
  const input = {
    language: 'ru',
    channelName: 'Мой канал',
    providerIdentifier: 'telegram',
    maxLength: 4096,
    core: 'Срок держится, когда о нём знает кто-то ещё.',
    brief: { thesis: 'Срок держится вдвоём', audience: null, goal: null, position: null },
  };

  test('промпт без шаблонного вопроса, ноль вопросов назван обычным ответом', () => {
    const prompt = v4.adaptationQuestionsPromptV4(input);
    expect(prompt).toContain('PROMPT VERSION: channel-question/v4');
    expect(prompt).toContain('An empty list is the expected answer');
    expect(prompt).toContain('at most 4096 characters');
    expect(prompt).not.toContain('должны унести из этого поста');
    expect(prompt).toContain('- Claim: Срок держится вдвоём');
  });

  test('разбор: ключи по порядку, повторы и пустые сняты, страховка на восьми', () => {
    const questions = v4.adaptationQuestionsV4({
      questions: [
        ...Array.from({ length: 10 }, (_, index) => ({
          question: `Вопрос под канал ${index + 1}?`,
          options: [],
        })),
      ],
    });
    expect(questions).toHaveLength(8);
    expect(questions.map((row) => row.key)).toEqual(
      Array.from({ length: 8 }, (_, index) => `ask-${index + 1}`)
    );
    expect(v4.adaptationQuestionsV4({ questions: [] })).toEqual([]);
    expect(v4.adaptationQuestionsV4('мусор')).toEqual([]);
  });

  test('без модели и без сути не спрашивает и не бросает', async () => {
    expect(await v4.askAdaptationQuestionsV4({ ...input, organizationId: 'org-a' }, {})).toEqual([]);
    const aiUsage = { executeAiOperation: async () => { throw new Error('refused'); } };
    const warnings = [];
    expect(
      await v4.askAdaptationQuestionsV4(
        { ...input, organizationId: 'org-a' },
        { aiUsage, warn: (line) => warnings.push(line) }
      )
    ).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  test('строки для генерации: вопрос → ответ, пустое не едет', () => {
    expect(
      v4.adaptationInterviewLines([
        { key: 'ask-1', question: 'С чего начать?', text: 'С цифры' },
        { key: 'ask-2', text: 'В личку' },
        { key: 'ask-3', question: 'Пусто?', text: '   ' },
      ])
    ).toEqual(['С чего начать? → С цифры', 'ask-2: В личку']);
    expect(v4.adaptationInterviewBlock([])).toEqual([]);
  });
});

describe('дверь принимает ключи вопросов модели и ничего сверх', () => {
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');
  const dto = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/dtos/content-intelligence/content-piece.dto.ts',
    {},
    { sources: {} }
  );
  const codes = async (Klass, plain) =>
    (await validate(plainToInstance(Klass, plain))).map((failed) => failed.property);

  test('адаптация: ask-1 … ask-8 с текстом вопроса проходят, ask-9 — нет', async () => {
    expect(
      await codes(dto.PieceAdaptDto, {
        integrationId: 'ch-1',
        answers: [{ key: 'ask-1', question: 'С чего начать?', text: 'С цифры', origin: 'person' }],
        decideKeys: ['ask-2', 'ask-8'],
      })
    ).toEqual([]);
    expect(
      await codes(dto.PieceAdaptDto, {
        integrationId: 'ch-1',
        answers: [{ key: 'ask-9', text: 'нет', origin: 'person' }],
      })
    ).toEqual(['answers']);
    expect(
      await codes(dto.PieceAdaptDto, {
        integrationId: 'ch-1',
        answers: [{ key: 'ask-1', question: 'х'.repeat(401), text: 'да', origin: 'person' }],
      })
    ).toEqual(['answers']);
  });

  test('ответы заготовки: ключ вопроса о материале рядом с полем, чужой ключ — отказ', async () => {
    expect(
      await codes(dto.PieceAnswerDoorDto, {
        answers: [
          { field: 'facts', key: 'ask-1', text: 'В марте' },
          { field: 'facts', key: 'ask-2', text: 'Три недели' },
          { field: 'audience', text: 'Фрилансеры' },
        ],
      })
    ).toEqual([]);
    expect(
      await codes(dto.PieceAnswerDoorDto, {
        answers: [{ field: 'facts', key: 'wallet_seed', text: 'нет' }],
      })
    ).toEqual(['answers']);
  });
});
