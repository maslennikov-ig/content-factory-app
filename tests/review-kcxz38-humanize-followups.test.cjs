'use strict';
/**
 * «Убрать следы ИИ» после `kcxz.35`: хвосты перепроверки и разбора правок
 * 27.09.2026 (`content-factory-next-kcxz.38`).
 *
 * - P2-1: повтор становится удалением, только если отрывок — одно
 *   предложение и замена почти целиком повтор; удаление всегда `show`;
 * - R3: вырезанное начало предложения не оставляет строчную букву и запятую
 *   на шве (`final-recheck-2026-09-27/db/05-after-humanize.txt`);
 * - R4: запрет аватара без правки получает видимую пометку
 *   (`final-recheck-2026-09-27/http/s3b-sse-01.ndjson`);
 * - P3-6: нестрогий поиск отрывка не приносит заглавную в середину фразы;
 * - P3-9: промпт v9 — одно правило «вырезать или переписать».
 *
 * Модели здесь нет: её ответ задан строкой.
 */
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

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

const { isSingleSentence, isMostlyRepeat, startsSentence } = loadWithMocks(
  `${QUALITY}/repeated-wording.ts`,
  mocks
);
const { reviewOnceV3, keepLeadingCase } = loadWithMocks(`${PIECES}/review.v3.ts`, mocks);
const { applyReviewChanges } = loadWithMocks(`${PIECES}/review.v2.contract.ts`, mocks);
const { SLOP_FINDING_LINES_V6 } = loadWithMocks(`${PIECES}/review-prompt.v6.ts`, mocks);
const { reviewPromptV8, NO_REPEAT_LINES_V8 } = loadWithMocks(`${PIECES}/review-prompt.v8.ts`, mocks);
const {
  reviewPromptV9,
  REVIEW_PROMPT_VERSION_V9,
  CUT_OR_REWRITE_LINES_V9,
  NO_REPEAT_LINES_V9,
  COVERAGE_LINES_V9,
} = loadWithMocks(`${PIECES}/review-prompt.v9.ts`, mocks);

const usage = { executeAiOperation: async (_org, _kind, run) => run() };

/** Текст cnt-04 «Кухня продукта» до засева (`db/01-cnt04-body-before.txt`). */
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
/** После засева (`db/04-seed-after.txt`). */
const SEEDED = `${PRE_SEED}\n\n${CLICHE}`;
/** Две правки перепроверки (`http/s3b-sse-01.ndjson`). */
const RECORDED_CHANGES = [
  {
    id: 'c1',
    excerpt: 'В современном быстро меняющемся мире',
    replacement: '',
    ruleId: 'stock-opening',
    why: 'Это шаблонное вступление; без него смысл предложения сохраняется.',
    basket: 'show',
  },
  {
    id: 'c2',
    excerpt: 'это, безусловно,',
    replacement: 'это',
    ruleId: 'intensifier',
    why: '«Безусловно» — усилитель, который не добавляет смысла; после удаления предложение остаётся грамматически цельным.',
    basket: 'show',
  },
];
/** Что стояло на стенде после «Да» (`db/05-after-humanize.txt`), и что должно стоять. */
const RECORDED_LOWERCASE =
  'такие короткие записи создают эффективную синергию — и это открывает новые горизонты.';
const FIXED_TAIL =
  'Такие короткие записи создают эффективную синергию — и это открывает новые горизонты.';

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

describe('R3: a removed sentence opening leaves a capitalised sentence', () => {
  const del = (excerpt) => [{ id: 'd', excerpt, replacement: '', why: 'w', basket: 'show' }];
  const apply = (text, excerpt) => applyReviewChanges(text, del(excerpt), ['d']);

  test('the recorded pair of changes: the sentence starts with a capital letter', () => {
    const result = applyReviewChanges(SEEDED, RECORDED_CHANGES, ['c1', 'c2']);
    expect(result).toBe(`${PRE_SEED}\n\n${FIXED_TAIL}`);
    expect(result).not.toContain(RECORDED_LOWERCASE);
  });

  test('a comma or a dash left at the seam goes; the text start, a line start and after «. » count', () => {
    expect(
      apply(
        'В современном быстро меняющемся мире, такие короткие записи работают.',
        'В современном быстро меняющемся мире'
      )
    ).toBe('Такие короткие записи работают.');
    expect(apply('Один.\nИтак, мы решили.', 'Итак')).toBe('Один.\nМы решили.');
    expect(apply('Один. Итак, мы решили.', 'Итак')).toBe('Один. Мы решили.');
    expect(apply('Один! Без сомнения — «мы» решили.', 'Без сомнения')).toBe('Один! «Мы» решили.');
  });

  test('a deletion inside a sentence, a whole sentence and a camel-case word stay as before', () => {
    expect(apply('Один, безусловно, два.', 'безусловно')).toBe('Один два.');
    expect(apply('Один. Два. Три.', 'Два.')).toBe('Один. Три.');
    expect(apply('Один. Два.\n\nТри.', 'Два.')).toBe('Один.\n\nТри.');
    expect(apply('Кстати, iPhone уже здесь.', 'Кстати')).toBe('iPhone уже здесь.');
    expect(startsSentence('Один. ')).toBe(true);
    expect(startsSentence('Один, ')).toBe(false);
  });
});

describe('R4: a never-say word the review left alone gets a visible note', () => {
  test('the recorded answer: the opener and «безусловно» go, «синергию» becomes a note', async () => {
    reviewAnswer = { changes: RECORDED_CHANGES, verdict: 'review', summary: 'Убраны штампы.' };
    const warnings = [];
    const result = await reviewOnceV3('org', input, usage, (m) => warnings.push(m));
    expect(warnings).toEqual([
      'Review validation found a never-say word without a change: REVIEW_NEVER_SAY_MISSED',
    ]);
    expect(result.changes.map((change) => change.id)).toEqual(['c1', 'c2', 'never-say-1']);
    expect(result.changes[2]).toMatchObject({
      excerpt: 'синергию',
      replacement: 'синергию',
      ruleId: 'never-say',
      basket: 'show',
    });
    expect(result.changes[2].why).toContain('«синергия»');
    expect(result.changes[2].why).toContain('Никогда не говорить');
    expect(result.text).toBe(`${PRE_SEED}\n\n${FIXED_TAIL}`);
  });

  test('a change that covers the word leaves no note; a replacement that keeps it is logged', async () => {
    reviewAnswer = {
      changes: [
        ...RECORDED_CHANGES,
        { id: 'c3', excerpt: 'эффективную синергию', replacement: 'общую картину', ruleId: 'never-say', why: 'Запрет.', basket: 'show' },
      ],
      verdict: 'review',
      summary: '',
    };
    let warnings = [];
    let result = await reviewOnceV3('org', input, usage, (m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect(result.changes.some((change) => change.ruleId === 'never-say' && change.id.startsWith('never-say'))).toBe(false);

    reviewAnswer.changes[2] = { ...reviewAnswer.changes[2], replacement: 'полезную синергию' };
    warnings = [];
    result = await reviewOnceV3('org', input, usage, (m) => warnings.push(m));
    expect(warnings).toEqual(['Review validation kept a never-say word: REVIEW_NEVER_SAY_KEPT']);
  });

  test('a repeated word gets a note on a unique span; facts mode does not look for never-say', async () => {
    const text = 'Мы ищем синергию. И синергию мы нашли в канале.';
    reviewAnswer = { changes: [], verdict: 'clean', summary: '' };
    const warnings = [];
    const result = await reviewOnceV3('org', { ...input, text }, usage, (m) => warnings.push(m));
    const excerpts = result.changes.map((change) => change.excerpt);
    expect(excerpts).toHaveLength(2);
    for (const excerpt of excerpts) {
      expect(text.split(excerpt)).toHaveLength(2);
      expect(excerpt.toLowerCase()).toContain('синергию');
    }
    expect(result.text).toBe(text);
    expect(result.verdict).toBe('review');

    const facts = await reviewOnceV3('org', { ...input, text, mode: 'facts' }, usage);
    expect(facts.changes).toEqual([]);
  });
});

describe('P2-1: a repeat deletes only a single sentence that is nearly all repeat', () => {
  const REPEAT =
    'Письменное обновление доступно всей команде, и не нужно ждать общего созвона, чтобы сориентироваться.';

  test('helpers: one sentence, and «mostly repeat» is 80% of the replacement words', () => {
    const text = 'Один. Два три. Четыре.\nПять.';
    expect(isSingleSentence(text, 6, 14)).toBe(true);
    expect(isSingleSentence(text, 6, 22)).toBe(false);
    expect(isSingleSentence(text, 15, 28)).toBe(false);
    expect(isMostlyRepeat(8, 'а б в г д е ж з и к')).toBe(true);
    expect(isMostlyRepeat(7, 'а б в г д е ж з и к')).toBe(false);
  });

  test('a multi-sentence excerpt whose replacement repeats stays a note; the paragraph survives', async () => {
    const paragraph =
      'В современном мире записи важны. Мы ведём их с марта и храним в вики.';
    const text = `${PRE_SEED}\n\n${paragraph}`;
    reviewAnswer = {
      changes: [
        { id: 'c1', excerpt: paragraph, replacement: REPEAT, ruleId: 'stock-opening', why: 'Штамп.', basket: 'show' },
      ],
      verdict: 'review',
      summary: '',
    };
    const warnings = [];
    const result = await reviewOnceV3('org', { ...input, text }, usage, (m) => warnings.push(m));
    expect(warnings).toEqual(['Review validation kept a change as a note: REVIEW_CHANGE_REPEATS']);
    expect(result.changes[0]).toMatchObject({ excerpt: paragraph, replacement: paragraph, basket: 'show' });
    expect(result.text).toBe(text);
  });

  test('a single sentence whose replacement is partly new stays a note', async () => {
    const sentence = 'В современном мире записи, безусловно, открывают горизонты.';
    const text = `${PRE_SEED}\n\n${sentence}`;
    reviewAnswer = {
      changes: [
        {
          id: 'c1',
          excerpt: sentence,
          replacement:
            'Письменное обновление доступно всей команде, и мы храним записи в вики с марта, по понедельникам сверяя их с планом.',
          ruleId: 'stock-opening',
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
    expect(result.text).toBe(text);
  });

  test('a deletion is never silent, even when the model asked for silent', async () => {
    reviewAnswer = {
      changes: [
        { id: 'c1', excerpt: CLICHE, replacement: REPEAT, ruleId: 'stock-opening', why: 'Штамп.', basket: 'silent' },
        { id: 'c2', excerpt: 'Как в вашей команде устроены такие обновления?', replacement: '', why: 'Лишнее.', basket: 'silent' },
      ],
      verdict: 'review',
      summary: '',
    };
    const result = await reviewOnceV3('org', input, usage);
    expect(result.changes.map((change) => [change.replacement, change.basket])).toEqual([
      ['', 'show'],
      ['', 'show'],
    ]);
  });
});

describe('P3-6: a loose excerpt match keeps the text case for the replacement', () => {
  test('keepLeadingCase flips only the first letter, and only when the cases disagree', () => {
    expect(keepLeadingCase('Синергию', 'синергию', 'Договорённость')).toBe('договорённость');
    expect(keepLeadingCase('синергия', 'Синергия', 'согласованность')).toBe('Согласованность');
    expect(keepLeadingCase('синергию', 'синергию', 'Telegram')).toBe('Telegram');
    expect(keepLeadingCase('Синергию', 'синергию', '«Договорённость»')).toBe('«договорённость»');
  });

  test('through the review: a capital quoted by the model does not land mid-sentence', async () => {
    const text = 'Мы видим синергию  в работе.';
    reviewAnswer = {
      changes: [
        { id: 'c1', excerpt: 'Синергию в', replacement: 'Договорённость в', ruleId: 'never-say', why: 'Запрет.', basket: 'show' },
      ],
      verdict: 'review',
      summary: '',
    };
    const result = await reviewOnceV3('org', { ...input, text }, usage);
    expect(result.changes[0]).toMatchObject({ excerpt: 'синергию  в', replacement: 'договорённость в' });
    expect(result.text).toBe('Мы видим договорённость в работе.');
  });
});

describe('P3-9: prompt v9 has one cut-or-rewrite rule and asks to cover every hit', () => {
  test('v9 replaces the two v6 lines and the v8 line; v8 stays as it was', () => {
    for (const mode of ['slop', 'both']) {
      const v9 = reviewPromptV9({ ...input, mode }).system;
      const v8 = reviewPromptV8({ ...input, mode }).system;
      expect(v9).toContain(`PROMPT VERSION: ${REVIEW_PROMPT_VERSION_V9}`);
      expect(v9).toContain(CUT_OR_REWRITE_LINES_V9[0]);
      expect(v9).toContain(NO_REPEAT_LINES_V9[0]);
      expect(v9).toContain(COVERAGE_LINES_V9[0]);
      expect(v9).not.toContain(SLOP_FINDING_LINES_V6[1]);
      expect(v9).not.toContain(SLOP_FINDING_LINES_V6[2]);
      expect(v9).not.toContain(NO_REPEAT_LINES_V8[0]);
      expect(v9).not.toContain('delete the cliché');
      expect(v8).toContain(SLOP_FINDING_LINES_V6[1]);
      expect(v8).toContain(NO_REPEAT_LINES_V8[0]);
      expect(v9.indexOf(COVERAGE_LINES_V9[0])).toBeGreaterThan(v9.indexOf('neverSayFindings lists'));
    }
    for (const mode of ['facts', 'web', undefined]) {
      const v9 = reviewPromptV9({ ...input, mode }).system;
      expect(v9).toContain(NO_REPEAT_LINES_V9[0]);
      expect(v9).not.toContain(COVERAGE_LINES_V9[0]);
      expect(v9).not.toContain(CUT_OR_REWRITE_LINES_V9[0]);
    }
    expect(REVIEW_PROMPT_VERSION_V9).toBe('adaptation-review-prompt/v9');
    expect(JSON.parse(reviewPromptV9(input).user).neverSayFindings).toHaveLength(1);
  });

  test('the review sends v9', async () => {
    reviewAnswer = { changes: [], verdict: 'clean', summary: '' };
    await reviewOnceV3('org', { ...input, text: PRE_SEED }, usage);
    expect(sent[0].messages[0].content).toContain('PROMPT VERSION: adaptation-review-prompt/v9');
  });
});

describe('P2-a (release check 27.09): a note on a sentence of clichés becomes a proposed deletion', () => {
  const {
    clicheCoverage,
    isMostlyCliche,
    carriesRealContent,
  } = loadWithMocks(`${QUALITY}/cliche-sentence.ts`, mocks);
  /** The seeded sentence as it stood on the stand (`db/03-seed-after.txt`). */
  const RECORDED =
    'В современном быстро меняющемся мире, такие короткие записи создают эффективную синергию — и это, безусловно, открывает новые горизонты.';
  const text = `${PRE_SEED}\n\n${RECORDED}`;
  /** The first run's note (`http/s1-sse-01.ndjson`, `leftAsIs`). */
  const recordedNote = (excerpt = RECORDED) => ({
    id: 'c1',
    excerpt,
    replacement: excerpt,
    ruleId: 'stock-opening',
    why: 'Оставлено без изменений: конкретные эффекты здесь не названы, а факты о сокращении встреч и скорости решений уже приведены выше.',
    basket: 'show',
  });
  const run = async (overrides = {}, changes = [recordedNote()]) => {
    reviewAnswer = { changes, verdict: 'review', summary: '' };
    const warnings = [];
    const result = await reviewOnceV3('org', { ...input, text, ...overrides }, usage, (m) => warnings.push(m));
    return { result, warnings };
  };

  test('the recorded note: a visible deletion, the seam clean, the pre-seed text back', async () => {
    const { result, warnings } = await run();
    expect(warnings).toEqual([
      'Review validation turned a cliché sentence into a deletion: REVIEW_CLICHE_SENTENCE_DELETION',
    ]);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ id: 'c1', excerpt: RECORDED, replacement: '', basket: 'show' });
    expect(result.changes[0].why).toContain('штамп');
    // No never-say note on «синергию»: the deletion covers it.
    expect(result.text).toBe(PRE_SEED);
    expect(result.catalog.removed.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(['stock-opening', 'evaluation-without-fact', 'vvodnye', 'inflated-significance'])
    );
  });

  test('both mode does the same; facts and web modes keep the note', async () => {
    expect((await run({ mode: 'both' })).result.text).toBe(PRE_SEED);
    for (const mode of ['facts', 'web']) {
      const { result, warnings } = await run({ mode });
      expect(warnings).not.toContain(
        'Review validation turned a cliché sentence into a deletion: REVIEW_CLICHE_SENTENCE_DELETION'
      );
      expect(result.text).toBe(text);
    }
  });

  test('a number, a name or a link in the sentence keeps the note', async () => {
    for (const sentence of [
      'В современном быстро меняющемся мире за 2 месяца записи создают эффективную синергию и открывают новые горизонты.',
      'В современном быстро меняющемся мире записи в Slack создают эффективную синергию и открывают новые горизонты.',
      'В современном быстро меняющемся мире записи от Игоря создают эффективную синергию и открывают новые горизонты.',
      'В современном быстро меняющемся мире записи на example.com создают эффективную синергию и открывают новые горизонты.',
    ]) {
      const own = `${PRE_SEED}\n\n${sentence}`;
      reviewAnswer = { changes: [recordedNote(sentence)], verdict: 'review', summary: '' };
      const result = await reviewOnceV3('org', { ...input, text: own }, usage);
      expect(result.text).toBe(own);
      expect(result.changes[0].replacement).toBe(sentence);
    }
  });

  test('a text of that one sentence, part of a sentence, or two sentences keep the note', async () => {
    expect((await run({ text: RECORDED })).result.text).toBe(RECORDED);
    const part = 'В современном быстро меняющемся мире, такие короткие записи создают эффективную синергию';
    expect((await run({}, [recordedNote(part)])).result.text).toBe(text);
    const two = `${RECORDED} Мы ведём их каждое утро.`;
    reviewAnswer = { changes: [recordedNote(two)], verdict: 'review', summary: '' };
    const result = await reviewOnceV3('org', { ...input, text: `${PRE_SEED}\n\n${two}` }, usage);
    expect(result.text).toBe(`${PRE_SEED}\n\n${two}`);
  });

  test('one cliché in a sentence with its own content keeps the note', async () => {
    const sentence = 'Мы, безусловно, стали реже созваниваться и спокойнее разбираем спорные вопросы по утрам в канале.';
    const own = `${PRE_SEED}\n\n${sentence}`;
    reviewAnswer = { changes: [recordedNote(sentence)], verdict: 'review', summary: '' };
    const result = await reviewOnceV3('org', { ...input, text: own }, usage);
    expect(result.text).toBe(own);
  });

  test('helpers: coverage counts words under hits inside the sentence; the rule and the content guard', () => {
    const coverage = clicheCoverage(RECORDED, 0, RECORDED.length, [
      { start: 0, end: 36 },
      { start: 68, end: 79 },
      { start: 80, end: 88 },
      { start: 98, end: 108 },
      { start: 110, end: 135 },
      { start: 200, end: 210 },
    ]);
    expect(coverage).toMatchObject({ hits: 5, words: 17, covered: 11 });
    expect(isMostlyCliche(coverage)).toBe(true);
    expect(isMostlyCliche({ hits: 1, share: 0.9 })).toBe(false);
    expect(isMostlyCliche({ hits: 2, share: 0.49 })).toBe(false);
    expect(isMostlyCliche({ hits: 3, share: 0.35 })).toBe(true);
    expect(carriesRealContent(RECORDED, 'ru')).toBe(false);
    expect(carriesRealContent('Мы ведём записи с Telegram.', 'ru')).toBe(true);
    expect(carriesRealContent('См. https://x.io/a — там всё.', 'ru')).toBe(true);
    expect(carriesRealContent('In today’s world, I think synergy opens new horizons.', 'en')).toBe(false);
    expect(carriesRealContent('In today’s world, Slack opens new horizons.', 'en')).toBe(true);
  });
});
