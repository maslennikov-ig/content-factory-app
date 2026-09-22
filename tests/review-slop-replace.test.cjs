'use strict';
/**
 * «Убрать следы ИИ» заменяет, а не вырезает (`content-factory-next-97dq.33`).
 *
 * Десятый заход 22.09.2026, адаптация cnt-28: каталог нашёл «эффективнее» в
 * пункте, пересказывающем отмеченную находку ресерча, проверка слово
 * вырезала, и в посте осталось «сотрудники  делегировали» — без смысла и с
 * двумя пробелами. Здесь три обещания:
 *
 *  - пересказ отмеченной опоры каталог штампом не считает, а размытое
 *    количество без опоры («более 20 моделей») по-прежнему ловит;
 *  - промпт v6 требует замену конкретным из текста, сути и фактов, а без неё
 *    — оставить с объяснением, и кладёт суть с фактами в режим «штампов»;
 *  - правка, вырезавшая слово, не оставляет двойного пробела и пробела
 *    перед знаком.
 *
 * Модели здесь нет: ответ проверяющей модели задан строкой.
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
            return {
              choices: [{ message: { content: JSON.stringify(reviewAnswer) } }],
            };
          },
        },
      },
    }),
    getModelForRole: async (_org, role) => `${role}-model`,
  },
};

const { slopCheck } = loadWithMocks(`${QUALITY}/slop-check.ts`, mocks);
const { restatesSupported, supportedWordingOf } = loadWithMocks(
  `${QUALITY}/supported-wording.ts`,
  mocks
);
const { reviewPromptV5, reviewSupportedOf, catalogFindingsOf } = loadWithMocks(
  `${PIECES}/review-prompt.v5.ts`,
  mocks
);
const { reviewPromptV6, REVIEW_PROMPT_VERSION_V6 } = loadWithMocks(
  `${PIECES}/review-prompt.v6.ts`,
  mocks
);
const { reviewOnceV3 } = loadWithMocks(`${PIECES}/review.v3.ts`, mocks);
const { applyReviewChanges } = loadWithMocks(
  `${PIECES}/review.v2.contract.ts`,
  mocks
);

const usage = { executeAiOperation: async (_org, _kind, run) => run() };

/** Отмеченная находка ресерча из живого захода, дословно. */
const FACT =
  'Сотрудники стали эффективнее делегировать и распределять задачи, отказывались от встреч и меньше времени тратили на перерывы.';
/** Пункт адаптации cnt-28 до правки. */
const BULLET = '• сотрудники эффективнее делегировали и распределяли задачи;';

const ruleHits = (text, options, ruleId) =>
  slopCheck(text, { locale: 'ru', ...options })
    .findings.filter((finding) => finding.ruleId === ruleId)
    .map((finding) => finding.excerpt);

beforeEach(() => {
  process.env.JWT_SECRET = 'test-review-signing-key';
  sent = [];
});

describe('пересказ отмеченной опоры — не штамп', () => {
  test('живой пункт cnt-28 при отмеченной опоре находкой не приходит', () => {
    expect(ruleHits(BULLET, {}, 'evaluation-without-fact')).toEqual([
      'эффективнее',
    ]);
    expect(
      ruleHits(BULLET, { supported: [FACT] }, 'evaluation-without-fact')
    ).toEqual([]);
    // Дословная цитата опоры — тем более.
    expect(
      ruleHits(`Итог: ${FACT}`, { supported: [FACT] }, 'evaluation-without-fact')
    ).toEqual([]);
  });

  test('та же оценка без общего соседа с опорой остаётся находкой', () => {
    expect(
      ruleHits(
        'Продукт стал эффективнее конкурентов на рынке.',
        { supported: [FACT] },
        'evaluation-without-fact'
      )
    ).toEqual(['эффективнее']);
    // Один общий сосед — ещё не пересказ.
    expect(
      ruleHits(
        'Сотрудники работают эффективнее прежнего.',
        { supported: [FACT] },
        'evaluation-without-fact'
      )
    ).toEqual(['эффективнее']);
  });

  test('размытое количество без опоры ловится как ловилось', () => {
    const text = 'В продукте более 20 моделей для любой задачи.';
    expect(ruleHits(text, { supported: [FACT] }, 'vague-quantity')).toEqual([
      'более 20',
    ]);
    expect(
      ruleHits(
        text,
        { supported: ['Команда выпустила продукт для малого бизнеса.'] },
        'vague-quantity'
      )
    ).toEqual(['более 20']);
  });

  test('суть и слова человека опорой для слов не служат', () => {
    // `grounded` — суть и слова человека — освобождает только числа.
    expect(
      ruleHits(BULLET, { grounded: [FACT] }, 'evaluation-without-fact')
    ).toEqual(['эффективнее']);
  });

  test('длинная конструкция опорой не оправдывается', () => {
    const supported = supportedWordingOf([
      'Это не просто инструмент, а целая платформа для команды продаж.',
    ]);
    const text = 'Это не просто инструмент, а целая платформа для команды продаж.';
    expect(restatesSupported(text, 0, 30, supported)).toBe(false);
  });

  test('проверка считает «было» и «стало» на одних отмеченных фактах', () => {
    const facts = [{ statement: FACT, selected: true }, 'чужая форма', null];
    const supported = reviewSupportedOf({ facts });
    expect(supported).toEqual([FACT]);
    expect(
      catalogFindingsOf(BULLET, 'ru', 'telegram', [], supported).filter(
        (finding) => finding.ruleId === 'evaluation-without-fact'
      )
    ).toEqual([]);
  });
});

describe('промпт v6: заменить конкретным, не вырезать', () => {
  const base = {
    text: 'Важно отметить, что сервис работает эффективно.',
    title: 'Сервис',
    core: 'Сервис закрывает заявки за два часа.',
    personText: 'Мои слова.',
    facts: [{ statement: 'Заявки закрываются за два часа.' }],
    language: 'ru',
    mode: 'slop',
  };

  test('режим «штампов» требует замену и запрещает выдумывать', () => {
    const prompt = reviewPromptV6(base);
    expect(prompt.system).toContain(
      `PROMPT VERSION: ${REVIEW_PROMPT_VERSION_V6}`
    );
    expect(REVIEW_PROMPT_VERSION_V6).toBe('adaptation-review-prompt/v6');
    expect(prompt.system).toContain(
      'Fix a trace by REPLACING it with the concrete thing it stands for, never by simply cutting it out.'
    );
    expect(prompt.system).toContain(
      'Take the concrete replacement only from the current text, core or facts'
    );
    expect(prompt.system).toContain('The replacement may invent nothing');
    expect(prompt.system).toContain(
      'Delete a trace only when the sentence keeps its whole meaning without it'
    );
    expect(prompt.system).toContain('keep it: replacement equal to excerpt, basket "show"');
    expect(prompt.system).toContain('Change no fact, number, date, name');
  });

  test('суть и факты уходят в режим «штампов» как запас для замены', () => {
    const user = JSON.parse(reviewPromptV6(base).user);
    expect(user.core).toBe(base.core);
    expect(user.facts).toEqual(base.facts);
    expect(user.catalogFindings.length).toBeGreaterThan(0);
    // v5 остаётся прежним: суть в «штампы» не кладёт.
    expect(JSON.parse(reviewPromptV5(base).user)).not.toHaveProperty('core');
  });

  test('«оба» несут правило замены, «суть» — нет', () => {
    expect(reviewPromptV6({ ...base, mode: 'both' }).system).toContain(
      'Fix a trace by REPLACING it'
    );
    expect(reviewPromptV6({ ...base, mode: 'facts' }).system).not.toContain(
      'Fix a trace by REPLACING it'
    );
  });

  test('каталог в промпте не присылает пересказ отмеченной опоры', () => {
    const user = JSON.parse(
      reviewPromptV6({ ...base, text: BULLET, facts: [{ statement: FACT }] })
        .user
    );
    expect(user.catalogFindings).toEqual([]);
  });
});

describe('вырезанное слово не оставляет лишних пробелов', () => {
  const change = (id, excerpt, replacement) => ({
    id,
    excerpt,
    replacement,
    why: 'Штамп.',
    basket: 'show',
  });

  test('живой пункт: без двойного пробела', () => {
    expect(
      applyReviewChanges(BULLET, [change('a', 'эффективнее', '')], ['a'])
    ).toBe('• сотрудники делегировали и распределяли задачи;');
  });

  test('без пробела перед знаком, в начале и в конце строки', () => {
    expect(
      applyReviewChanges(
        'Задачи распределяли эффективно; встреч стало меньше.',
        [change('a', 'эффективно', '')],
        ['a']
      )
    ).toBe('Задачи распределяли; встреч стало меньше.');
    expect(
      applyReviewChanges(
        'Первое.\nВажно сказать про встречи.',
        [change('a', 'Важно', '')],
        ['a']
      )
    ).toBe('Первое.\nсказать про встречи.');
    expect(
      applyReviewChanges(
        'Работает эффективно\nДальше.',
        [change('a', 'эффективно', '')],
        ['a']
      )
    ).toBe('Работает\nДальше.');
    expect(
      applyReviewChanges(
        'Первое. Факт. Последнее.',
        [change('a', 'Факт.', '')],
        ['a']
      )
    ).toBe('Первое. Последнее.');
  });

  test('эмодзи уходит целиком, с селектором и склейкой', () => {
    // Живой стенд 22.09.2026: каталог назвал «⚙» (U+2699), а в тексте
    // стоял «⚙️» с U+FE0F — после правки в посте оставался невидимый хвост.
    expect(
      applyReviewChanges(
        'Настроили процесс \u2699\uFE0F\nДальше.',
        [change('a', '\u2699', '')],
        ['a']
      )
    ).toBe('Настроили процесс\nДальше.');
    expect(
      applyReviewChanges(
        'Команда \u{1F469}\u200D\u{1F4BB} работает.',
        [change('a', '\u{1F469}', '')],
        ['a']
      )
    ).toBe('Команда работает.');
    // Отрывок без эмодзи на конце хвостов не забирает.
    expect(
      applyReviewChanges('Слово \uFE0F дальше.', [change('a', 'Слово', 'Текст')], ['a'])
    ).toBe('Текст \uFE0F дальше.');
  });

  test('замена с лишним пробелом по краю сшивается чисто', () => {
    expect(
      applyReviewChanges(
        BULLET,
        [change('a', 'эффективнее', ' быстрее ')],
        ['a']
      )
    ).toBe('• сотрудники быстрее делегировали и распределяли задачи;');
  });

  test('чужие пробелы автора остаются байт в байт', () => {
    expect(
      applyReviewChanges(
        'Первое  слово. Работает эффективно, да.',
        [change('a', 'эффективно', 'быстро')],
        ['a']
      )
    ).toBe('Первое  слово. Работает быстро, да.');
    // Стык, который был сломан до правки, правка не чинит и не ломает.
    expect(
      applyReviewChanges(
        'Слово  эффективно работает.',
        [change('a', ' эффективно', ' быстро')],
        ['a']
      )
    ).toBe('Слово  быстро работает.');
  });

  test('ход проверки показывает тот же чистый текст, что запишет принятие', async () => {
    reviewAnswer = {
      changes: [
        {
          id: 'cut',
          excerpt: 'эффективнее',
          replacement: '',
          ruleId: 'evaluation-without-fact',
          why: 'Оценка.',
          basket: 'show',
        },
      ],
      verdict: 'review',
      summary: '',
    };
    const result = await reviewOnceV3(
      'org',
      {
        text: BULLET,
        title: '',
        core: '',
        personText: '',
        facts: [],
        language: 'ru',
        mode: 'slop',
      },
      usage
    );
    expect(result.text).toBe('• сотрудники делегировали и распределяли задачи;');
    expect(sent[0].messages[0].content).toContain(
      'PROMPT VERSION: adaptation-review-prompt/v6'
    );
    // Без отмеченной опоры находка была и ушла — строка «было → стало» честна.
    expect(result.slopBefore - result.slopAfter).toBe(1);
    expect(result.catalog.removed).toEqual([
      { ruleId: 'evaluation-without-fact', excerpt: 'эффективнее' },
    ]);
  });
});
