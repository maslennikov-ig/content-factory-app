'use strict';

/**
 * Свои числа человека без ресерча идут в суть; опровергнутые ресерчем — нет
 * (`content-factory-next-97dq.32`, P1, десятый заход 22.09.2026).
 *
 * Две формы строк — ровно те, что лежат в боевой базе (выгрузка
 * `evidence/walk-2026-09-22-tenth/prod/pieces-2026-09-22.json`):
 *
 *  - **cnt-29** (`90894285`, без «Нужен ресерч»): три свои строки
 *    `{kind:'own', origin:'input', status:'unverified', verified:false}` без
 *    заметки, поправки и ключа. Вход ставит «не проверено» сразу, без всякого
 *    поиска, а суть v7+ читала любой статус, кроме confirmed, как вердикт
 *    поиска: все три числа ушли в блок «не подтвердилось поиском» с запретом,
 *    суть сжалась до одной фразы в 137 знаков, квитанция назвала все три
 *    «не подтвердилось и в текст не вошло»;
 *  - **cnt-26** (`997b7e42`, с ресерчем, `writtenBy: 'fallback'`): строка
 *    «…выросла на 40%.» с заметкой «В предоставленных источниках нет…» и
 *    ключом `own:…` — поиск её не нашёл, а запасная сборка сути напечатала её
 *    как факт.
 *
 * Признак «поиск по строке ходил» — его следы на самой строке (ключ, заметка,
 * цитата, поправка, «расходится»), а не `status`.
 */

require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence';

let modelAnswers = [];
const coreMocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getChatModel: async () => ({
      withStructuredOutput: () => ({
        invoke: async () => {
          const next = modelAnswers.shift();
          if (next instanceof Error) throw next;
          if (!next) throw new Error('Unexpected model call');
          return next;
        },
      }),
    }),
  },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
};
const { corePrompt, fallbackCore, writeCore } = loadWithMocks(
  `${base}/pieces/core-write.ts`,
  coreMocks
);
const { searchRuledOn, ownRefutedBySearch, ungroundedStatements, selectedFactsBrief } =
  loadWithMocks(`${base}/pieces/piece-facts.v2.ts`);

const URL_TVNET =
  'https://rus.tvnet.lv/7287446/islandiya-eksperiment-po-perehodu-na-chetyrehdnevnuyu-rabochuyu-nedelyu-priznan-oshelomlyayushche-uspeshnym';
const EV = 'cbbddc01-4f68-4f58-b48e-2822be67cf9f';

/* ----------------------------------------------------------- cnt-29, без ресерча */

const CNT29_PERSON =
  'Исландский эксперимент с четырёхдневкой охватил 25 тысяч человек и длился десять лет, а производительность выросла на 40%.';
const cnt29Row = (statement) => ({
  kind: 'own', factId: null, origin: 'input', status: 'unverified', verified: false,
  sourceUrl: null, statement, evidenceId: null,
});
const CNT29_STATEMENTS = [
  'Исландский эксперимент с четырёхдневкой охватил 25 тысяч человек.',
  'Исландский эксперимент с четырёхдневкой длился десять лет.',
  'В рамках эксперимента производительность выросла на 40%.',
];
const cnt29Brief = () => ({
  inputKind: 'thought',
  goal: 'Рассказать об исландском эксперименте с четырёхдневной рабочей неделей.',
  thesis:
    'Исландский эксперимент с четырёхдневной рабочей неделей показывает, что сокращение рабочего времени может повысить производительность.',
  position:
    'Я считаю результаты исландского эксперимента доказательством того, что четырёхдневная рабочая неделя способна повысить производительность.',
  disagreement: null, audience: null, format: 'auto',
  origins: { thesis: 'input', position: 'input' },
  facts: CNT29_STATEMENTS.map(cnt29Row),
  // Так было записано до правки: квитанция называла все три.
  ungrounded: [...CNT29_STATEMENTS],
});

const promptOf = (brief, personText) =>
  corePrompt({
    organizationId: 'org', language: 'ru', brief, answers: [], questionTextByKey: {},
    personText, borrowed: null, foreignShingles: [],
  });
const briefLines = (prompt, needle) =>
  prompt.split('\n').filter((line) => line.includes(needle));

describe('cnt-29: свои числа без ресерча — слова человека', () => {
  test('строки со статусом «не проверено», но без следов поиска, стоят под подтверждённым', () => {
    const prompt = promptOf(cnt29Brief(), CNT29_PERSON);

    expect(prompt).toContain('PROMPT VERSION: core-write/v12');
    for (const statement of CNT29_STATEMENTS) {
      expect(briefLines(prompt, statement)).toEqual([`факты подтверждённые: ${statement}`]);
    }
    // Ни блока, ни правила о неподтверждённом: запрещать печатать нечего.
    expect(prompt).not.toContain('не подтвердилось поиском');
    expect(prompt).not.toContain('исключение из правила о дословных числах');
  });

  test('квитанция не называет их «не подтвердилось»', () => {
    expect(ungroundedStatements(cnt29Brief())).toEqual([]);
  });

  test('запасная сборка печатает все три числа', () => {
    const text = fallbackCore(cnt29Brief(), [], CNT29_PERSON);
    for (const statement of CNT29_STATEMENTS) expect(text).toContain(statement);
  });

  test('старый бриф с находками, но без следов поиска на своих строках, читается так же', () => {
    // До 13.09.2026 ресерч только добавлял находки и своих строк не судил:
    // признак уровня брифа («есть находки — своё проверяли») здесь ошибся бы.
    const brief = cnt29Brief();
    brief.facts.push({
      statement: 'Анализ не выявил существенного падения производительности.',
      sourceUrl: URL_TVNET, factId: null, evidenceId: EV, origin: 'search',
      kind: 'found', status: 'confirmed', verified: true, selected: true,
    });
    const prompt = promptOf(brief, CNT29_PERSON);
    for (const statement of CNT29_STATEMENTS) {
      expect(prompt).toContain(`факты подтверждённые: ${statement}`);
    }
    expect(prompt).not.toContain('не подтвердилось поиском');
  });
});

/* ------------------------------------------------------ cnt-26, после ресерча */

const NOT_FOUND_40 = {
  kind: 'own', origin: 'input', status: 'unverified', verified: false,
  factKey: 'own:a6d306f9266715c3', factId: null, sourceUrl: null, evidenceId: null,
  correction: null,
  statement: 'В рамках исландского эксперимента производительность выросла на 40%.',
  note:
    'В предоставленных источниках нет утверждения о росте производительности именно на 40%; сообщается лишь об отсутствии существенного падения или о сохранении производительности.',
};
const CONFLICTING_25K = {
  kind: 'own', origin: 'input', status: 'conflicting', verified: false, selected: false,
  factKey: 'own:97244eb0f43b9269', factId: null, sourceUrl: URL_TVNET, evidenceId: EV,
  statement: 'Исландский эксперимент с четырёхдневкой охватил 25 тысяч человек.',
  note: 'Источник указывает, что эксперимент распространился на 2500 сотрудников, а не на 25 тысяч человек.',
  correction: { original: '25 тысяч человек', replacement: '2500 сотрудников' },
};
const CORRECTION_2500 = {
  kind: 'own', origin: 'search', status: 'confirmed', verified: true, selected: true,
  factKey: `${EV}:fix:a9cd5a48e488945f`, factId: null, sourceUrl: URL_TVNET, evidenceId: EV,
  statement: 'Исландский эксперимент с четырёхдневкой охватил 2500 сотрудников.',
  note: CONFLICTING_25K.note,
  correction: CONFLICTING_25K.correction,
};
const FOUND = {
  kind: 'found', origin: 'search', status: 'confirmed', verified: true, selected: true,
  factKey: `${EV}:6bda87fabed835b4`, factId: null, sourceUrl: URL_TVNET, evidenceId: EV,
  statement: 'Анализ не выявил существенного падения производительности.', note: null,
  correction: null,
};
const CNT26_PERSON =
  'Исландский эксперимент с четырёхдневкой охватил 2500 сотрудников, а производительность выросла на 40%.';
const cnt26Brief = () => ({
  inputKind: 'thought',
  thesis:
    'Исландский эксперимент с четырёхдневной рабочей неделей доказал, что сокращение рабочего времени может повысить производительность.',
  position: null, disagreement: null, audience: null, origins: {},
  facts: [CONFLICTING_25K, CORRECTION_2500, NOT_FOUND_40, FOUND].map((fact) => ({ ...fact })),
  ungrounded: [NOT_FOUND_40.statement],
});

describe('cnt-26: не найденное поиском своё — вне подтверждённого и вне запасной сути', () => {
  test('промпт: не найденное — в блоке «не подтвердилось», поправка — в подтверждённом', () => {
    const prompt = promptOf(selectedFactsBrief(cnt26Brief()), CNT26_PERSON);

    expect(briefLines(prompt, NOT_FOUND_40.statement)).toEqual([
      `не подтвердилось поиском: ${NOT_FOUND_40.statement} — ${NOT_FOUND_40.note}`,
    ]);
    expect(prompt).toContain(`факты подтверждённые: ${CORRECTION_2500.statement}`);
    expect(prompt).not.toContain('25 тысяч');
  });

  test('запасная сборка не печатает «40%», поправку печатает', () => {
    const text = fallbackCore(selectedFactsBrief(cnt26Brief()), [], '');
    expect(text).not.toContain(NOT_FOUND_40.statement);
    expect(text).not.toContain('40%');
    expect(text).not.toContain('25 тысяч');
    expect(text).toContain(CORRECTION_2500.statement);
    expect(text).toContain(FOUND.statement);
  });

  test('отказ модели: суть собрана запасным ходом без не найденного числа', async () => {
    modelAnswers = [new Error('provider down')];
    const warnings = [];
    const core = await writeCore(
      {
        organizationId: 'org', language: 'ru', brief: selectedFactsBrief(cnt26Brief()),
        answers: [], questionTextByKey: {}, personText: '', borrowed: null,
        foreignShingles: [],
      },
      {
        aiUsage: { executeAiOperation: async (_org, _op, callback) => callback() },
        slopCheck: null,
        warn: (message) => warnings.push(message),
      }
    );
    expect(core.writtenBy).toBe('fallback');
    expect(core.text).not.toContain('40%');
    expect(core.text).toContain(CORRECTION_2500.statement);
    expect(warnings).toHaveLength(1);
  });

  test('опровергнутое без замены, оставленное себе, тоже не входит в запасную суть', () => {
    const kept = { ...CONFLICTING_25K, selected: true, correction: null };
    const brief = { ...cnt26Brief(), facts: [kept, FOUND] };
    expect(promptOf(brief, CNT26_PERSON)).toContain(
      `не подтвердилось поиском: ${kept.statement}`
    );
    expect(fallbackCore(brief, [], '')).not.toContain('25 тысяч');
  });

  test('строка, которую ресерч видел без вердикта (только ключ), — не найдено', () => {
    const seen = { ...cnt29Row('Эксперимент длился десять лет.'), factKey: 'own:0123456789abcdef' };
    const brief = { ...cnt29Brief(), facts: [seen] };
    expect(promptOf(brief, CNT29_PERSON)).toContain(
      'не подтвердилось поиском: Эксперимент длился десять лет.'
    );
    expect(fallbackCore(brief, [], '')).not.toContain('десять лет');
    expect(ungroundedStatements(brief)).toEqual(['Эксперимент длился десять лет.']);
  });

  test('квитанция: не найденное — «не подтвердилось», отклонённое и подтверждённое — нет', () => {
    expect(ungroundedStatements(cnt26Brief())).toEqual([NOT_FOUND_40.statement]);
  });
});

/* ------------------------------------------------------------------- признак */

describe('признак «поиск по строке ходил»', () => {
  test('читается по следам поиска, а не по статусу', () => {
    expect(searchRuledOn(cnt29Row('x'))).toBe(false);
    expect(searchRuledOn({ ...cnt29Row('x'), factKey: 'own:1' })).toBe(true);
    expect(searchRuledOn({ ...cnt29Row('x'), note: 'нет в источниках' })).toBe(true);
    expect(searchRuledOn({ ...cnt29Row('x'), note: '   ' })).toBe(false);
    expect(searchRuledOn({ ...cnt29Row('x'), quote: 'цитата' })).toBe(true);
    expect(searchRuledOn({ ...cnt29Row('x'), status: 'conflicting' })).toBe(true);
    expect(
      searchRuledOn({ ...cnt29Row('x'), correction: { original: 'a', replacement: 'b' } })
    ).toBe(true);
  });

  test('поправка источника — не своё слово и опровергнутым своим не считается', () => {
    const partial = {
      ...CORRECTION_2500, status: 'unverified', verified: false,
    };
    expect(ownRefutedBySearch(partial)).toBe(false);
    expect(ownRefutedBySearch(NOT_FOUND_40)).toBe(true);
    expect(ownRefutedBySearch(cnt29Row('x'))).toBe(false);
  });

  test('ответ человека без адреса — его слово, а не «не подтвердилось»', () => {
    const brief = {
      ...cnt29Brief(),
      facts: [{ statement: 'У нас так было в прошлом году.', sourceUrl: null, factId: null,
        evidenceId: null, origin: 'person', verified: false }],
    };
    expect(ungroundedStatements(brief)).toEqual([]);
  });

  test('чужие строки без опоры по-прежнему в квитанции', () => {
    const brief = {
      ...cnt29Brief(),
      inputKind: 'foreign_post',
      facts: [{ statement: 'рост на 37% за год', sourceUrl: null, factId: null,
        evidenceId: null, origin: 'input', kind: 'external', status: 'unverified',
        verified: false }],
    };
    expect(ungroundedStatements(brief)).toEqual(['рост на 37% за год']);
  });
});
