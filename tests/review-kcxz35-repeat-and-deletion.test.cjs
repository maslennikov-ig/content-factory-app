'use strict';
/**
 * «Убрать следы ИИ» не повторяет сказанное, и удаление читается и
 * применяется как удаление (`content-factory-next-kcxz.35`).
 *
 * Финальная проверка W2 27.09.2026 (`final-check-2026-09-27`):
 *
 * - F2: штампованное последнее предложение заменили предложением, которое
 *   дословно стоит во втором абзаце (`db/09-after-humanize.txt`);
 * - F7: удаление на карточке читалось «…» → «», а после «Да» тело
 *   кончилось `.\n\n` (`db/14-after-rewrite.txt`).
 *
 * Модели здесь нет: её ответ задан строкой.
 */
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const {
  IDENTITY,
  loadRegistry,
  servicesFrom,
  requestContextFor,
  executeTool,
} = require('./helpers/agent-capabilities.cjs');

const QUALITY = 'libraries/nestjs-libraries/src/content-intelligence/text-quality';
const PIECES = 'libraries/nestjs-libraries/src/content-intelligence/pieces';

let reviewAnswer;
let sent = [];
const mocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getOpenAiClient: async () => ({
      chat: {
        completions: {
          create: async (body) => {
            sent.push(body);
            return { choices: [{ message: { content: JSON.stringify(reviewAnswer) } }] };
          },
        },
      },
    }),
    getModelForRole: async (_org, role) => `${role}-model`,
  },
};

const { repeatedElsewhere, isWholeSentences } = loadWithMocks(
  `${QUALITY}/repeated-wording.ts`,
  mocks
);
const { reviewPromptV8, REVIEW_PROMPT_VERSION_V8, NO_REPEAT_LINES_V8 } = loadWithMocks(
  `${PIECES}/review-prompt.v8.ts`,
  mocks
);
const { reviewPromptV7, REVIEW_PROMPT_VERSION_V7 } = loadWithMocks(
  `${PIECES}/review-prompt.v7.ts`,
  mocks
);
const { reviewOnceV3 } = loadWithMocks(`${PIECES}/review.v3.ts`, mocks);
const { applyReviewChanges } = loadWithMocks(`${PIECES}/review.v2.contract.ts`, mocks);

const usage = { executeAiOperation: async (_org, _kind, run) => run() };

/** Текст cnt-04 «Кухня продукта» до засева (`db/08-seed-before.txt`). */
const PRE_SEED = [
  'Мы в команде отказались от ежедневных созвонов-статусов. 🗓️',
  'Вместо них каждый пишет три строки в общий канал до 11 утра. ✍️',
  'Считаю отказ от созвонов удачным решением: за два месяца встреч стало вдвое меньше, а решения принимаются быстрее. ⚡',
  '',
  'Обычно разница заметна в ситуациях, когда для следующего шага достаточно знать текущий статус: письменное обновление доступно всей команде, и не нужно ждать общего созвона, чтобы сориентироваться.',
  'Если же вопрос требует обсуждения, его можно вынести отдельно, не собирая команду ради очередного статуса. 💬',
  '',
  'Как в вашей команде устроены такие обновления?',
  'Команде важно выбрать такой формат общения, который помогает обмениваться статусом и обсуждать вопросы, требующие общего решения.',
].join('\n');
const CLICHE =
  'В современном быстро меняющемся мире такие короткие записи создают эффективную синергию — и это, безусловно, открывает новые горизонты.';
/** После засева (`db/08-seed-after.txt`). */
const SEEDED = `${PRE_SEED}\n\n${CLICHE}`;
/** Замена, которую модель предложила в прогоне (`http/s5a-sse-01.ndjson`). */
const RECORDED_REPLACEMENT =
  'Письменное обновление доступно всей команде, и не нужно ждать общего созвона, чтобы сориентироваться.';

const input = {
  text: SEEDED,
  title: '',
  core: '',
  personText: '',
  facts: [],
  language: 'ru',
  mode: 'slop',
  neverSay: ['синергия'],
};

beforeEach(() => {
  process.env.JWT_SECRET = 'test-review-signing-key';
  sent = [];
});

describe('F2: a replacement that repeats the text', () => {
  const at = SEEDED.indexOf(CLICHE);

  test('the recorded replacement repeats paragraph 2, ignoring case and punctuation', () => {
    expect(repeatedElsewhere(SEEDED, at, at + CLICHE.length, RECORDED_REPLACEMENT)).toBe(13);
    expect(isWholeSentences(SEEDED, at, at + CLICHE.length)).toBe(true);
  });

  test('ё/е and spacing do not hide a repeat; a short or new replacement is not one', () => {
    const text = 'Всё решено ещё вчера утром в общем канале.\nПотом: эффективная синергия.';
    const start = text.indexOf('эффективная синергия');
    const end = start + 'эффективная синергия'.length;
    expect(repeatedElsewhere(text, start, end, 'все  решено  еще вчера утром')).toBe(5);
    expect(repeatedElsewhere(text, start, end, 'общем канале')).toBe(0);
    expect(repeatedElsewhere(text, start, end, 'договорились о задачах на неделю вперёд')).toBe(0);
    expect(isWholeSentences(text, start, end)).toBe(false);
  });

  test('a repeat the excerpt already carried is not blamed on the change', () => {
    const text = 'Мы пишем три строки в общий канал. Потом мы пишем три строки в общий канал, безусловно.';
    const excerpt = 'Потом мы пишем три строки в общий канал, безусловно.';
    const start = text.indexOf(excerpt);
    expect(
      repeatedElsewhere(text, start, start + excerpt.length, 'Мы пишем три строки в общий канал.')
    ).toBe(0);
  });

  test('the recorded case becomes a deletion, and the post ends where the author ended it', async () => {
    reviewAnswer = {
      changes: [
        {
          id: 'c1',
          excerpt: CLICHE,
          replacement: RECORDED_REPLACEMENT,
          ruleId: 'stock-opening, evaluation-without-fact, never-say',
          why: 'Штампы и запрет автора.',
          basket: 'show',
        },
      ],
      verdict: 'review',
      summary: 'Убраны штампы.',
    };
    const warnings = [];
    const result = await reviewOnceV3('org', input, usage, (m) => warnings.push(m));
    expect(warnings).toEqual([
      'Review validation turned a change into a deletion: REVIEW_CHANGE_REPEATS',
    ]);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      id: 'c1',
      excerpt: CLICHE,
      replacement: '',
      basket: 'show',
      ruleId: 'stock-opening, evaluation-without-fact, never-say',
    });
    expect(result.changes[0].why).toContain('уже сказано');
    // Мысль стоит в тексте ровно один раз, и хвоста `\n\n` нет.
    expect(result.text).toBe(PRE_SEED);
    expect(result.text.split('письменное обновление доступно всей команде')).toHaveLength(2);
    // С `kcxz.38` проверка идёт промптом v9.
    expect(sent[0].messages[0].content).toContain("PROMPT VERSION: adaptation-review-prompt/v9");
  });

  test('a repeating replacement of part of a sentence stays a note, and the text is unchanged', async () => {
    const text = `${PRE_SEED}\n\nКороткие записи, безусловно, открывают новые горизонты для команды.`;
    reviewAnswer = {
      changes: [
        {
          id: 'c1',
          excerpt: 'безусловно, открывают новые горизонты',
          replacement: 'не нужно ждать общего созвона, чтобы сориентироваться',
          ruleId: 'intensifier',
          why: 'Штамп.',
          basket: 'show',
        },
      ],
      verdict: 'review',
      summary: '',
    };
    const warnings = [];
    const result = await reviewOnceV3('org', { ...input, text }, usage, (m) => warnings.push(m));
    expect(warnings).toEqual(['Review validation kept a change as a note: REVIEW_CHANGE_REPEATS']);
    expect(result.changes[0]).toMatchObject({
      excerpt: 'безусловно, открывают новые горизонты',
      replacement: 'безусловно, открывают новые горизонты',
      basket: 'show',
    });
    expect(result.text).toBe(text);
  });

  test('an ordinary replacement taken from the text passes untouched', async () => {
    const text = 'Мы стали работать эффективнее и быстрее.';
    reviewAnswer = {
      changes: [
        { id: 'c1', excerpt: 'эффективнее и быстрее', replacement: 'быстрее', ruleId: 'x', why: 'y', basket: 'show' },
      ],
      verdict: 'review',
      summary: '',
    };
    const warnings = [];
    const result = await reviewOnceV3('org', { ...input, text }, usage, (m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect(result.text).toBe('Мы стали работать быстрее.');
  });
});

describe('F2: prompt v8', () => {
  test('v8 is v7 plus the no-repeat line in every mode; v7 stays as it was', () => {
    for (const mode of ['slop', 'facts', 'both', 'web', undefined]) {
      const v7 = reviewPromptV7({ ...input, mode }).system;
      const v8 = reviewPromptV8({ ...input, mode }).system;
      expect(v8).toContain(NO_REPEAT_LINES_V8[0]);
      expect(v7).not.toContain(NO_REPEAT_LINES_V8[0]);
      expect(
        v8
          .replace(`PROMPT VERSION: ${REVIEW_PROMPT_VERSION_V8}`, '')
          .replace(`${NO_REPEAT_LINES_V8[0]}\n`, '')
      ).toBe(v7.replace(`PROMPT VERSION: ${REVIEW_PROMPT_VERSION_V7}`, ''));
    }
    expect(REVIEW_PROMPT_VERSION_V7).toBe('adaptation-review-prompt/v7');
    expect(REVIEW_PROMPT_VERSION_V8).toBe('adaptation-review-prompt/v8');
    // Запреты аватара уходят в v8 так же, как в v7.
    expect(JSON.parse(reviewPromptV8(input).user).neverSayFindings).toHaveLength(1);
  });
});

describe('F7: applying a deletion of a whole line or paragraph', () => {
  const del = (excerpt) => [{ id: 'd', excerpt, replacement: '', why: 'w', basket: 'show' }];
  const apply = (text, excerpt) => applyReviewChanges(text, del(excerpt), ['d']);

  test('the recorded rewrite: deleting the last paragraph leaves no blank tail', () => {
    const humanized = `${PRE_SEED}\n\n${RECORDED_REPLACEMENT}`;
    expect(apply(humanized, RECORDED_REPLACEMENT)).toBe(PRE_SEED);
    expect(apply(`${humanized}\n`, RECORDED_REPLACEMENT)).toBe(`${PRE_SEED}\n`);
  });

  test('a middle paragraph takes one paragraph break with it; a line inside a paragraph, one line break', () => {
    expect(apply('Один.\n\nДва.\n\nТри.', 'Два.')).toBe('Один.\n\nТри.');
    expect(apply('Один.\nДва.\n\nТри.', 'Два.')).toBe('Один.\n\nТри.');
    expect(apply('• а;\n• б;\n• в;', '• б;')).toBe('• а;\n• в;');
    expect(apply('Один.\n\n  Два.\n    отступ', 'Два.')).toBe('Один.\n\n    отступ');
  });

  test('the first paragraph goes with the break after it', () => {
    expect(apply('Один.\n\nДва.', 'Один.')).toBe('Два.');
  });

  test('a deletion inside a line is stitched as before', () => {
    expect(apply('Один, безусловно, два.\n\nТри.', 'безусловно')).toBe('Один два.\n\nТри.');
    expect(apply('Один. Два.\n\nТри.', 'Два.')).toBe('Один.\n\nТри.');
  });
});

describe('F7: the selection row of a deletion', () => {
  const registry = loadRegistry();
  const rewrite = registry.CAPABILITY_CATALOGUE.find((c) => c.id === 'piece.rewrite');

  const rowsFor = async (language) => {
    const services = {
      PieceService: {
        reviewV2: async () => ({
          token: 't',
          verdict: 'review',
          changes: [
            { id: 'd', excerpt: RECORDED_REPLACEMENT, replacement: '', why: 'Повтор.', basket: 'show' },
            { id: 'r', excerpt: 'синергию', replacement: 'договорённость', why: 'Штамп.', basket: 'show' },
          ],
        }),
      },
    };
    const tool = registry.buildCapabilityTool(rewrite, {
      services: servicesFrom(services),
      language,
      entrance: 'chat',
    });
    const { suspended } = await executeTool(
      tool,
      { pieceId: 'p1', instruction: 'короче' },
      { requestContext: requestContextFor(registry, { ...IDENTITY, language }) }
    );
    return suspended[0].options.map((option) => option.label);
  };

  test('a deletion reads as «Убрать», a replacement keeps its arrow', async () => {
    expect(await rowsFor('ru')).toEqual([
      `Убрать: «${RECORDED_REPLACEMENT}» — Повтор.`,
      '«синергию» → «договорённость» — Штамп.',
    ]);
    const en = await rowsFor('en');
    expect(en[0]).toBe(`Remove: «${RECORDED_REPLACEMENT}» — Повтор.`);
    expect(en.join('\n')).not.toContain('→ «»');
  });
});
