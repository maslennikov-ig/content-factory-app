'use strict';
/**
 * «Убрать следы ИИ» не теряет правки за форму и видит запреты аватара
 * (`content-factory-next-l7tm`).
 *
 * Живой прогон W2 27.09.2026, D3: на «В современном быстро меняющемся мире …
 * эффективную синергию — и это, безусловно, открывает новые горизонты»
 * проверка предложила одну правку («безусловно»), а бэкенд записал
 * `Review validation discarded a change: REVIEW_CHANGE_SCHEMA`. «Синергия»
 * стоит в строке NEVER_SAY аватара, страница показывала «Штампов: 4».
 *
 * Модели здесь нет: ответ проверяющей модели задан строкой в той форме,
 * которую `json_object` даёт на правку, закрывающую два штампа внахлёст.
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
const { neverSayFindings, neverSayList } = loadWithMocks(
  `${QUALITY}/never-say.ts`,
  mocks
);
const { reviewPromptV7, REVIEW_PROMPT_VERSION_V7 } = loadWithMocks(
  `${PIECES}/review-prompt.v7.ts`,
  mocks
);
const { reviewOnceV3, normalizeReviewChange, locateExcerpt } = loadWithMocks(
  `${PIECES}/review.v3.ts`,
  mocks
);

const usage = { executeAiOperation: async (_org, _kind, run) => run() };

/** Фраза из прогона дословно (`http/s1e-edit-01`). */
const D3 =
  'В современном быстро меняющемся мире важно не просто общаться, а выстраивать по-настоящему эффективную синергию — и это, безусловно, открывает новые горизонты для каждой команды.';

const base = {
  text: D3,
  title: '',
  core: '',
  personText: '',
  facts: [],
  language: 'ru',
  mode: 'slop',
  neverSay: ['синергия', 'гарантия результата'],
};

beforeEach(() => {
  process.env.JWT_SECRET = 'test-review-signing-key';
  sent = [];
});

describe('catalogue and NEVER_SAY on the D3 sentence', () => {
  test('the catalogue sees the stock opening and the «new horizons» ending too', () => {
    const rules = slopCheck(D3, { locale: 'ru', platform: 'telegram' }).findings.map(
      (finding) => [finding.ruleId, finding.excerpt]
    );
    expect(rules).toEqual(
      expect.arrayContaining([
        ['stock-opening', 'В современном быстро меняющемся мире'],
        ['negative-parallelism', 'не просто общаться, а'],
        ['intensifier', 'по-настоящему эффективную'],
        ['evaluation-without-fact', 'эффективную'],
        ['vvodnye', 'безусловно'],
        ['inflated-significance', 'открывает новые горизонты'],
      ])
    );
  });

  test('a NEVER_SAY word is found in its inflected form', () => {
    expect(neverSayFindings(D3, ['синергия'])).toEqual([
      {
        phrase: 'синергия',
        excerpt: 'синергию',
        start: D3.indexOf('синергию'),
        end: D3.indexOf('синергию') + 'синергию'.length,
      },
    ]);
    expect(neverSayFindings('Синергией команды', ['синергия'])[0].excerpt).toBe(
      'Синергией'
    );
    // Короткое слово — только целиком.
    expect(neverSayFindings('ИИ и ИИшка', ['ИИ']).map((f) => f.excerpt)).toEqual([
      'ИИ',
    ]);
    expect(neverSayFindings(D3, ['гарантия результата'])).toEqual([]);
  });

  test('the avatar line is read as the voice stores it or as typed', () => {
    expect(neverSayList('синергия; лидер рынка\nСинергия')).toEqual([
      'синергия',
      'лидер рынка',
    ]);
    expect(neverSayList(['x', null, ' гарантия '])).toEqual(['гарантия']);
    expect(neverSayList(undefined)).toEqual([]);
  });
});

describe('prompt v7', () => {
  test('the model gets every catalogue finding and the NEVER_SAY hits', () => {
    const prompt = reviewPromptV7(base);
    expect(prompt.system).toContain(`PROMPT VERSION: ${REVIEW_PROMPT_VERSION_V7}`);
    expect(REVIEW_PROMPT_VERSION_V7).toBe('adaptation-review-prompt/v7');
    expect(prompt.system).toContain('ruleId is ONE string');
    expect(prompt.system).toContain('never write null');
    expect(prompt.system).toContain('neverSayFindings');
    const user = JSON.parse(prompt.user);
    expect(user.catalogFindings.map((finding) => finding.excerpt)).toEqual(
      expect.arrayContaining([
        'В современном быстро меняющемся мире',
        'безусловно',
        'открывает новые горизонты',
      ])
    );
    expect(user.neverSayFindings).toEqual([
      expect.objectContaining({ phrase: 'синергия', excerpt: 'синергию' }),
    ]);
  });

  test('facts mode sees neither the catalogue nor the avatar line', () => {
    const user = JSON.parse(reviewPromptV7({ ...base, mode: 'facts' }).user);
    expect(user.catalogFindings).toBeUndefined();
    expect(user.neverSayFindings).toBeUndefined();
  });
});

describe('the change shapes the D3 run discarded', () => {
  /** Ответ модели в той форме, что ушла в REVIEW_CHANGE_SCHEMA. */
  const recorded = () => ({
    changes: [
      {
        id: 1,
        excerpt: 'В современном быстро меняющемся мире важно',
        replacement: 'Команде важно',
        ruleId: 'stock-opening',
        sourceUrls: null,
        why: 'Дежурный зачин.',
        basket: 'show',
        target: null,
        variants: null,
      },
      {
        id: 'c1',
        // Тире модель процитировала дефисом.
        excerpt: 'по-настоящему эффективную синергию - и это, безусловно, открывает новые горизонты',
        replacement: 'договариваться о задачах — так работа',
        ruleId: ['intensifier', 'evaluation-without-fact', 'never-say'],
        why: 'Штампы и запрещённое слово заменены конкретным.',
        basket: 'show',
      },
    ],
    verdict: 'review',
    summary: 'Штампы заменены.',
  });

  test('both survive validation and reach the text', async () => {
    reviewAnswer = recorded();
    const warnings = [];
    const result = await reviewOnceV3('org', base, usage, (message) =>
      warnings.push(message)
    );
    expect(warnings).toEqual([]);
    expect(result.changes.map((change) => change.id)).toEqual(['1', 'c1']);
    expect(result.changes[1]).toMatchObject({
      excerpt:
        'по-настоящему эффективную синергию — и это, безусловно, открывает новые горизонты',
      ruleId: 'intensifier, evaluation-without-fact, never-say',
    });
    expect(result.text).toBe(
      'Команде важно не просто общаться, а выстраивать договариваться о задачах — так работа для каждой команды.'
    );
    expect(sent[0].messages[0].content).toContain(
      'PROMPT VERSION: adaptation-review-prompt/v9'
    );
    expect(JSON.parse(sent[0].messages[1].content).neverSayFindings).toHaveLength(1);
  });

  test('a change without an excerpt is still discarded, and the log names the field', async () => {
    reviewAnswer = {
      changes: [{ id: 'x', replacement: 'y', why: 'z', basket: 'show' }],
      verdict: 'review',
      summary: '',
    };
    const warnings = [];
    const result = await reviewOnceV3('org', base, usage, (message) =>
      warnings.push(message)
    );
    // С `kcxz.38` (R4) запрет аватара без правки остаётся видимой пометкой.
    expect(result.changes).toMatchObject([
      { id: 'never-say-1', excerpt: 'синергию', replacement: 'синергию', basket: 'show' },
    ]);
    expect(warnings).toEqual([
      'Review validation discarded a change: REVIEW_CHANGE_SCHEMA; field=excerpt',
      'Review validation found a never-say word without a change: REVIEW_NEVER_SAY_MISSED',
    ]);
  });

  test('normalisation reads only what has one reading', () => {
    expect(
      normalizeReviewChange({ id: 'a', excerpt: 'x', replacement: null, why: 'w' })
    ).toMatchObject({ replacement: 'x', basket: 'show' });
    expect(
      normalizeReviewChange({ id: 'a', original: 'x', suggestion: 'y', reason: 'r', basket: 'SHOW' })
    ).toEqual({ id: 'a', excerpt: 'x', replacement: 'y', why: 'r', basket: 'show' });
    expect(normalizeReviewChange({ id: 'a', excerpt: 'x', replacement: 'y' }, 'en').why).toBe(
      'The model gave no reason.'
    );
    expect(normalizeReviewChange(null)).toBeNull();
  });

  test('a loose excerpt must still be unique', () => {
    expect(locateExcerpt('a — b; a – b', 'a - b')).toBeNull();
    expect(locateExcerpt('«да» — нет', '"да" - нет')).toEqual({
      start: 0,
      excerpt: '«да» — нет',
    });
  });
});
