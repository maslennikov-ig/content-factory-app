'use strict';

/**
 * «Решите за меня» — решение, а не факт (`content-factory-next-97dq.56`).
 *
 * Решение владельца 23.09.2026, двенадцатый заход, `cnt-32`: отданный модели
 * вопрос получает решение — угол, адресат, вывод, строение, объяснение за
 * утверждением человека — с пометкой «решили мы»; опыт, случаи, цитаты
 * и числа автора модель не придумывает. Суть развивает сказанное, а не
 * сжимается до минимума.
 *
 * Здесь чистые части: промпты `core-write/v11` и `intake-brief-fill/v10`,
 * проверка решений и один ход `writeCoreWithDecisions` на подделанной модели.
 * Поток двери ответов — в `content-pieces.service.test.cjs`. Платных вызовов нет.
 */

require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { cyrillicOutsideData } = require('./helpers/prompt-language.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence';
let responses = [];
const modelCalls = [];
const mocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getChatModel: async (_org, _temp, _limit, role) => ({
      withStructuredOutput: () => ({
        invoke: async (prompt) => {
          modelCalls.push({ role, prompt });
          const value = responses.shift();
          if (value instanceof Error) throw value;
          if (!value) throw new Error('Unexpected model call');
          return value;
        },
      }),
    }),
  },
};

const coreWrite = loadWithMocks(`${base}/pieces/core-write.ts`, mocks);
const v11 = loadWithMocks(`${base}/pieces/core-write-prompt.v11.ts`);
const v14 = loadWithMocks(`${base}/pieces/core-write-prompt.v14.ts`);
const v15 = loadWithMocks(`${base}/pieces/core-write-prompt.v15.ts`);
const v9 = loadWithMocks(`${base}/pieces/core-write-prompt.v9.ts`);
const fill10 = loadWithMocks(`${base}/intake/intake.prompts.v10.ts`);
const fill11 = loadWithMocks(`${base}/intake/intake.prompts.v11.ts`);
const fill9 = loadWithMocks(`${base}/intake/intake.prompts.v9.ts`);

/** Вход `cnt-32` дословно. */
const CNT32_INPUT =
  'Я заметил, что команда пишет в чат меньше, когда задачи лежат на общей доске.\n\nВопросов «кто это делает» почти не осталось, и созвонов по статусу стало вдвое меньше.\n\nХочу рассказать, как мы к этому пришли.';

const cnt32Brief = (origins = { thesis: 'input', position: 'input', audience: 'avatar' }) => ({
  inputKind: 'thought',
  thesis: 'Общая доска задач помогает команде меньше писать в чат.',
  position: 'Я заметил, что команда пишет в чат меньше, когда задачи лежат на общей доске.',
  disagreement: 'С этим могут спорить руководители команд.',
  audience: 'Подписчики автора, которые управляют командами.',
  origins,
  ungrounded: [],
  facts: [
    { statement: 'Созвонов по статусу стало вдвое меньше.', sourceUrl: null, factId: null,
      evidenceId: null, origin: 'input', kind: 'own', verified: false, status: 'unverified' },
  ],
});

const PERSON_ANSWERS = [
  { key: 'ask-2', question: 'Как команда работала с задачами до того, как они оказались на общей доске?',
    text: 'У каждого был свой задачник, кто-то в общем пытался. Было неудобно.',
    origin: 'person', step: 'core', answeredAt: '2026-09-23T12:57:39.184Z' },
  { key: 'ask-4', question: 'Что в результате этого изменения удивило вас сильнее всего?',
    text: 'Выросший КПД.', origin: 'person', step: 'core', answeredAt: '2026-09-23T12:57:39.184Z' },
];

const DELEGATED = [
  { key: 'ask-1', question: 'Как выглядела конкретная рабочая ситуация, в которой вы впервые заметили перемену?', authorMaterial: true },
  { key: 'ask-3', question: 'Что именно вы изменили в работе с общей доской?', authorMaterial: true },
];

const input = (overrides = {}) => ({
  organizationId: 'org',
  language: 'ru',
  brief: cnt32Brief(),
  answers: PERSON_ANSWERS,
  questionTextByKey: {},
  personText: CNT32_INPUT,
  borrowed: null,
  foreignShingles: [],
  ...overrides,
});

describe('core-write/v11', () => {
  test('своя версия (v13 с `97dq.90`), v9–v12 остаются для квитанций', () => {
    const prompt = coreWrite.corePrompt(input());
    expect(prompt).toContain('PROMPT VERSION: core-write/v15');
    expect(coreWrite.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v15');
    expect(v14.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v14');
    expect(v9.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v9');
    expect(v11.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v11');
    expect(
      loadWithMocks(`${base}/pieces/core-write-prompt.v10.ts`).CORE_WRITE_PROMPT_VERSION
    ).toBe('core-write/v10');
  });

  test('правило короткой сути заменено на «развивай каждый ответ и цель»', () => {
    const prompt = coreWrite.corePrompt(input());
    expect(prompt).not.toContain('if the person gave few words, the core is short');
    expect(prompt).not.toContain('three sentences is a normal core');
    expect(prompt).toContain('4) develop what was said instead of shrinking it');
    expect(prompt).toContain('every answer of the person gets its own place in the text');
    expect(prompt).toContain('their stated goal sets the structure');
    expect(prompt).toContain('The length follows the material and the decisions');
    // Цель «хочу рассказать, как…» — задача текста, а не служебное, которое выбрасывают.
    expect(prompt).toContain('A stated goal («I want to tell how we got there») is not words for the text but what the text has to do');
  });

  test('гарантии v9 о словах человека на месте, выдумка по-прежнему запрещена', () => {
    const prompt = coreWrite.corePrompt(input());
    expect(prompt).toContain('Carried over verbatim: the person’s numbers, names, dates, examples and distinctive expressions');
    expect(prompt).toContain('Unchanged: the meaning, the judgements and the position');
    expect(prompt).toContain('a number that is not in the input is not written');
    // `core-write/v15` (`97dq.99`): the person's story is still never invented;
    // the model's knowledge enters only where it answers a handed question.
    expect(prompt).toContain('never invent the person’s story');
    expect(prompt).toContain('a quote, a named source or study, or an experience the person did not give is not invented');
    expect(prompt).toContain('enters only where it answers a question handed to the model');
    expect(prompt).toContain('the core holds the person’s position and never argues with it');
  });

  test('ответы человека — материалом, решения модели — своим подписанным блоком', () => {
    const decision = {
      key: 'ask-1', question: DELEGATED[0].question, origin: 'model', step: 'core',
      text: 'Без конкретного эпизода: текст объясняет, почему при общей доске вопросы о статусе отпадают.',
      answeredAt: '2026-09-23T12:57:39.184Z',
    };
    const prompt = coreWrite.corePrompt(input({ answers: [...PERSON_ANSWERS, decision] }));
    const words = v15.CORE_WRITE_BLOCK_TITLES_V15;
    const block = (title) => {
      const start = prompt.indexOf(title);
      return start < 0 ? '' : prompt.slice(start, prompt.indexOf('--- BLOCK END ---', start));
    };
    expect(block(words.answers)).toContain('У каждого был свой задачник');
    expect(block(words.answers)).toContain('Выросший КПД.');
    expect(block(words.answers)).not.toContain('Без конкретного эпизода');
    expect(prompt).toContain('THE MODEL’S DECISIONS (the person handed these questions to the model; what the model decided and wrote in answer, not the person’s words)');
    // Decisions from an earlier round carry the policy even without a new block.
    expect(prompt).toContain(v15.CORE_WRITE_HANDED_V15.knowledge);
    expect(prompt).not.toContain(v15.CORE_WRITE_DELEGATED_V15);
    expect(block(words.decisions)).toContain(`${DELEGATED[0].question} → Без конкретного эпизода`);
    // Пустое «Реши сама» (заготовки до v11) блока не заводит.
    const empty = coreWrite.corePrompt(input({ answers: [...PERSON_ANSWERS, { ...decision, text: '' }] }));
    expect(empty).not.toContain(words.decisions);
  });

  test('поле брифа, предложенное моделью, подписано как её предложение', () => {
    const prompt = coreWrite.corePrompt(input({ brief: cnt32Brief({ thesis: 'input', position: 'model', audience: 'avatar' }) }));
    expect(prompt).toContain('position (the model’s proposal): Я заметил');
    expect(prompt).not.toContain('тезис (предложение модели)');
    expect(prompt).not.toContain('адресат (предложение модели)');
  });

  test('отданные вопросы: блок с ключами и правило решения — только когда они есть', () => {
    const without = coreWrite.corePrompt(input());
    expect(without).not.toContain('QUESTIONS HANDED TO THE MODEL');
    expect(without).not.toContain('A separate rule about the «questions handed to the model» block');
    expect(without).not.toContain('The rule about handed questions («You decide»)');

    const prompt = coreWrite.corePrompt(input({ delegated: DELEGATED }));
    expect(prompt).toContain('QUESTIONS HANDED TO THE MODEL (answer them yourself; the decision goes into decisions under the same key)');
    expect(prompt).toContain(`[ask-1] ${DELEGATED[0].question} (about the author’s material: only the person knows it)`);
    expect(prompt).toContain('A separate rule about the «questions handed to the model» block');
  });

  test('вопрос о факте автора решается рамкой: правило запрещает выдумывать случай от первого лица', () => {
    for (const language of ['ru', 'en']) {
      const rule = v11.CORE_WRITE_DELEGATED_V11[language];
      if (language === 'ru') {
        expect(rule).toContain('Этого ты не знаешь и не придумываешь');
        expect(rule).toContain('Решение по такому вопросу — рамка');
        expect(rule).toContain('Ни одно решение не пишется от первого лица как пережитое');
        expect(rule).toContain('не несёт чисел, имён, дат, цитат и источников, которых нет во входе');
        // Пример в правиле — рамка, а не случай от первого лица.
        expect(rule).toContain('«Без конкретного эпизода: текст объясняет');
        expect(rule).not.toMatch(/«(?:Я|Мы|У нас)\s/u);
        expect(rule).not.toMatch(/опиши (?:случай|эпизод)|придумай/iu);
      } else {
        expect(rule).toContain('You do not know it and you do not invent it');
        expect(rule).toContain('The decision on such a question is a framing');
        expect(rule).toContain('No decision is written in the first person as something lived');
        expect(rule).not.toMatch(/«(?:I|We|Our)\s/u);
      }
    }
    // v11 stays for receipts; the current prompt is v15 (`97dq.99`).
    const current = coreWrite.corePrompt(input({ delegated: DELEGATED }));
    expect(current).not.toContain(v11.CORE_WRITE_DELEGATED_V11.en);
    expect(current).toContain(v15.CORE_WRITE_DELEGATED_V15);
  });

  test('английская сторона на месте', () => {
    const prompt = coreWrite.corePrompt(input({ language: 'en', delegated: DELEGATED }));
    expect(prompt).toContain('4) develop what was said instead of shrinking it');
    expect(prompt).toContain('QUESTIONS HANDED TO THE MODEL');
    expect(prompt).toContain('about the author’s material: only the person knows it');
    expect(prompt).not.toContain('if the person gave few words, the core is short');
  });
});

describe('coreDecisionsOf', () => {
  const grounded = [CNT32_INPUT, 'Выросший КПД.'];
  test('только отданные ключи, по одному на ключ, одной строкой', () => {
    expect(
      coreWrite.coreDecisionsOf(
        [
          { key: 'ask-1', text: '  Рамка:\nтекст объясняет механизм.  ' },
          { key: 'ask-1', text: 'второе решение по тому же ключу' },
          { key: 'ask-9', text: 'не отдавали' },
          { key: 'ask-3', text: '   ' },
        ],
        DELEGATED,
        grounded
      )
    ).toEqual([{ key: 'ask-1', text: 'Рамка: текст объясняет механизм.' }]);
  });

  test('число, которого нет во входе, выбрасывает решение целиком', () => {
    expect(
      coreWrite.coreDecisionsOf(
        [
          { key: 'ask-1', text: 'Команда сократила переписку на 40 процентов.' },
          { key: 'ask-3', text: 'Текст опирается на то, что созвонов стало вдвое меньше.' },
        ],
        DELEGATED,
        grounded
      )
    ).toEqual([{ key: 'ask-3', text: 'Текст опирается на то, что созвонов стало вдвое меньше.' }]);
    expect(coreWrite.coreDecisionsOf([{ key: 'ask-1', text: 'В 2024 году…' }], DELEGATED, ['Было в 2024 году.'])).toHaveLength(1);
  });

  test('не массив — решений нет', () => {
    expect(coreWrite.coreDecisionsOf(null, DELEGATED, grounded)).toEqual([]);
  });
});

describe('writeCoreWithDecisions', () => {
  const deps = {
    aiUsage: { executeAiOperation: async (_org, _op, run) => run() },
    slopCheck: null,
  };
  beforeEach(() => {
    responses = [];
    modelCalls.length = 0;
  });

  test('решения приходят тем же вызовом, что и суть', async () => {
    responses = [{
      text: 'Суть по cnt-32.',
      decisions: [
        { key: 'ask-1', text: 'Без конкретного эпизода: текст объясняет, почему вопросы о статусе отпадают.' },
        { key: 'ask-3', text: 'Текст показывает переход от личных задачников к одной доске.' },
      ],
    }];
    const { core, decisions } = await coreWrite.writeCoreWithDecisions(input({ delegated: DELEGATED }), deps);
    expect(modelCalls).toHaveLength(1);
    expect(core.text).toBe('Суть по cnt-32.');
    expect(core.writtenBy).toBe('model');
    expect(decisions.map((decision) => decision.key)).toEqual(['ask-1', 'ask-3']);
    // Решение модели числом автора не становится.
    expect(core.authorNumbers).toBe(false);
  });

  test('без модели решений нет: запасная суть решать за человека не умеет', async () => {
    responses = [new Error('provider down')];
    const { core, decisions } = await coreWrite.writeCoreWithDecisions(input({ delegated: DELEGATED }), deps);
    expect(core.writtenBy).toBe('fallback');
    expect(decisions).toEqual([]);
  });

  test('writeCore по-прежнему возвращает только суть', async () => {
    responses = [{ text: 'Суть.', decisions: [] }];
    const core = await coreWrite.writeCore(input(), deps);
    expect(core.text).toBe('Суть.');
  });
});

describe('intake-brief-fill/v10', () => {
  const promptInput = (overrides = {}) => ({
    language: 'ru',
    material: CNT32_INPUT,
    materialKind: 'thought',
    fixed: [],
    avatar: [],
    channel: [],
    facts: [],
    evidence: [],
    ...overrides,
  });

  test('v9 целиком, со своей версией; без отданных полей блока нет', () => {
    const prompt = fill10.briefFillPromptV10(promptInput());
    expect(prompt).toContain('PROMPT VERSION: intake-brief-fill/v10');
    expect(prompt).not.toContain('PROMPT VERSION: intake-brief-fill/v9');
    expect(prompt.replace('intake-brief-fill/v10', 'intake-brief-fill/v9')).toBe(
      fill9.briefFillPromptV9(promptInput())
    );
    expect(prompt).not.toContain('Handed to the model');
    // Форма ответа — v9: ни нового разбора, ни второго вызова.
    expect(Object.keys(fill10.briefFillSchemaV10.shape)).toEqual(
      Object.keys(fill9.briefFillSchemaV9.shape)
    );
  });

  test.each(['thought', 'borrowed', 'instruction'])(
    '%s: отданные поля названы, решение — не опыт человека, и стоит до правил интервью',
    (materialKind) => {
      const prompt = fill10.briefFillPromptV10(
        promptInput({ materialKind, decided: ['position', 'audience', 'position'] })
      );
      for (const rule of fill10.DECIDED_RULES_V10) expect(prompt).toContain(rule);
      expect(prompt).toContain('Handed to the model («Decide for me»; decide these yourself):\n- position\n- audience\n');
      expect(prompt).toContain('never leave a handed field null');
      expect(prompt).toContain('Never write a decision in the first person as something the person lived');
      expect(prompt.indexOf('Handed to you («Decide for me»)')).toBeLessThan(
        prompt.indexOf('Interview (`questions`)')
      );
    }
  );
});

/*
  «Решите за меня» из знаний (`content-factory-next-97dq.99`): v11 — это v10,
  где решение по отданному полю может опираться на общеизвестное знание. Опыт,
  случаи, числа, цитаты и источники человека по-прежнему не придумываются.
*/
describe('intake-brief-fill/v11', () => {
  const promptInput = (overrides = {}) => ({
    language: 'ru',
    material: CNT32_INPUT,
    materialKind: 'thought',
    fixed: [],
    avatar: [],
    channel: [],
    facts: [],
    evidence: [],
    ...overrides,
  });

  test('v10 целиком, со своей версией и своими правилами отданных полей', () => {
    const plain = fill11.briefFillPromptV11(promptInput());
    expect(plain).toContain('PROMPT VERSION: intake-brief-fill/v11');
    expect(plain.replace('intake-brief-fill/v11', 'intake-brief-fill/v10')).toBe(
      fill10.briefFillPromptV10(promptInput())
    );
    expect(Object.keys(fill11.briefFillSchemaV11.shape)).toEqual(
      Object.keys(fill10.briefFillSchemaV10.shape)
    );
    expect(fill11.DECIDED_RULES_V11).toHaveLength(fill10.DECIDED_RULES_V10.length);

    const handed = fill11.briefFillPromptV11(promptInput({ decided: ['position'] }));
    for (const rule of fill11.DECIDED_RULES_V11) expect(handed).toContain(rule);
    for (const rule of fill10.DECIDED_RULES_V10.filter((rule) => !fill11.DECIDED_RULES_V11.includes(rule))) {
      expect(handed.split('\n')).not.toContain(rule);
    }
    expect(handed).toContain('may rest on widely known knowledge');
    expect(handed).toContain('fill it from what the person said and from your own knowledge');
    expect(handed).toContain('Never write a decision in the first person as something the person lived');
    expect(handed).toContain('never put into it a case, a number, a name, a date, a quote or a source the material does not carry');
    // The rules v11 adds are English (the v9 body quotes Russian phrases as data).
    expect(cyrillicOutsideData(fill11.DECIDED_RULES_V11.join('\n'))).toEqual([]);
  });
});

/*
  `content-factory-next-97dq.53`, live stand 23.09.2026, S3: the core dropped
  «Я не считаю, что стендапы вредны всем: в команде новичков или в кризисном
  проекте они нужны», and the author's claim came out broader than they made
  it. The rule rides in v12 (unreleased when it was added), in every mode.
*/
describe('the core keeps the author’s caveats (97dq.53)', () => {
  const v12 = loadWithMocks(`${base}/pieces/core-write-prompt.v12.ts`);
  const S3 =
    'В марте мы с командой из семи человек отменили ежедневные стендапы и оставили один письменный отчёт в пятницу. Я не считаю, что стендапы вредны всем: в команде новичков или в кризисном проекте они нужны. Но если у команды есть общая доска и люди работают дольше полугода вместе, ежедневный созвон превращается в ритуал отчётности для руководителя.';

  test('the rule is in the core prompt in both languages, first write and rebuild alike', () => {
    // `core-write/v14` (`97dq.97`): the rule is English for a Russian core too.
    const ru = coreWrite.corePrompt(input({ personText: S3 }));
    expect(ru).toContain(v12.CORE_WRITE_CAVEATS_V12.en);
    expect(ru).not.toContain(v12.CORE_WRITE_CAVEATS_V12.ru);
    expect(ru).toContain('The person’s caveats are part of their position');
    // The caveat itself reaches the model with the person's words.
    expect(ru).toContain('в команде новичков или в кризисном проекте они нужны');
    const rebuild = coreWrite.corePrompt(
      input({ personText: S3, rebuildFrom: { text: 'Прежняя суть.', byPerson: false } })
    );
    expect(rebuild).toContain(v12.CORE_WRITE_CAVEATS_V12.en);
    const en = coreWrite.corePrompt(input({ language: 'en', personText: 'I do not think this is for everyone.' }));
    expect(en).toContain(v12.CORE_WRITE_CAVEATS_V12.en);
    expect(en).not.toContain(v12.CORE_WRITE_CAVEATS_V12.ru);
  });

  test('released receipts keep their contract: v11 does not carry the rule', () => {
    expect(v11.coreWriteSystemV11('ru', '')).not.toContain('Оговорки человека');
    expect(coreWrite.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v15');
  });
});
