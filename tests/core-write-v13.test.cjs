'use strict';

/**
 * `core-write/v13` (`content-factory-next-97dq.90`, fifteenth walk, `cnt-36`,
 * piece `c326e624`): the core is the finished text in the author's first
 * person; the model's decisions are applied silently; the person's answer
 * outranks a conflicting number in the material with no mention of the
 * correction; no speech about the text. A deterministic guard asks for one
 * rewrite, and extract drops a fact contained in another. No paid calls.
 */

require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

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
const v13 = loadWithMocks(`${base}/pieces/core-write-prompt.v13.ts`);
const v12 = loadWithMocks(`${base}/pieces/core-write-prompt.v12.ts`);
const v14 = loadWithMocks(`${base}/pieces/core-write-prompt.v14.ts`);
const v15 = loadWithMocks(`${base}/pieces/core-write-prompt.v15.ts`);
const { metaSpeechIn } = loadWithMocks(`${base}/text-quality/meta-speech.ts`);
const ownFacts = loadWithMocks(`${base}/intake/own-facts.ts`);

/** cnt-36: the material says «вдвое», the answer says «в полтора раза». */
const CNT36_INPUT =
  'Я заметил, что команда пишет в чат меньше, когда задачи лежат на общей доске.\n\nВопросов «кто это делает» почти не осталось, и созвонов по статусу стало вдвое меньше.';

const fact = (statement, extra = {}) => ({
  statement, sourceUrl: null, factId: null, evidenceId: null,
  origin: 'input', kind: 'own', verified: false, status: 'unverified', ...extra,
});

const CNT36_BRIEF = {
  inputKind: 'thought',
  thesis: 'Общая доска задач помогает команде меньше писать в чат.',
  position: 'Я заметил, что команда пишет в чат меньше, когда задачи лежат на общей доске.',
  disagreement: null,
  audience: 'Подписчики автора, которые управляют командами.',
  origins: { thesis: 'input', position: 'input', audience: 'avatar' },
  ungrounded: [],
  facts: [fact('Созвонов по статусу стало вдвое меньше.')],
};

const CNT36_ANSWERS = [
  { key: 'ask-2', question: 'Насколько меньше стало созвонов по статусу?',
    text: 'В полтора раза.', origin: 'person', step: 'core', answeredAt: '2026-09-24T13:30:00.000Z' },
  { key: 'ask-3', question: 'Что именно вы изменили в работе с доской?',
    text: 'Не описывать конкретные шаги: текст объясняет, почему при общей доске вопросы о статусе отпадают.',
    origin: 'model', step: 'core', answeredAt: '2026-09-24T13:30:00.000Z' },
];

/** What the first core of cnt-36 said instead of being the text. */
const CNT36_META_CORE =
  'Я заметил, что команда пишет в чат меньше, когда задачи лежат на общей доске. Сначала я описал это как сокращение вдвое, а в ответе уточнил: созвонов стало меньше в полтора раза.\n\nО том, как мы перестроили работу, конкретных деталей нет. Здесь можно рассказать о результате.';

const CLEAN_CORE =
  'Я заметил, что команда пишет в чат меньше, когда задачи лежат на общей доске.\n\nВопросов «кто это делает» почти не осталось, а созвонов по статусу стало в полтора раза меньше: статус виден на доске без переписки.';

const input = (overrides = {}) => ({
  organizationId: 'org',
  language: 'ru',
  brief: CNT36_BRIEF,
  answers: CNT36_ANSWERS,
  questionTextByKey: {},
  personText: CNT36_INPUT,
  borrowed: null,
  foreignShingles: [],
  ...overrides,
});

const deps = (warn = () => undefined) => ({
  aiUsage: { executeAiOperation: async (_org, _op, run) => run() },
  slopCheck: null,
  warn,
});

beforeEach(() => {
  responses = [];
  modelCalls.length = 0;
});

describe('core-write/v13 prompt', () => {
  test('its own version; v12 stays for receipts and does not carry the rule', () => {
    const prompt = coreWrite.corePrompt(input());
    expect(prompt).toContain('PROMPT VERSION: core-write/v15');
    expect(coreWrite.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v15');
    expect(v14.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v14');
    expect(v12.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v12');
    expect(v12.coreWriteSystemV12('ru', '')).not.toContain(v13.CORE_WRITE_FINISHED_TEXT_V13.ru);
  });

  test('cnt-36: finished first-person text, decisions silent, the answer wins, no meta speech — RU and EN alike', () => {
    // Since `core-write/v14` (`97dq.97`) a Russian core gets the English rule;
    // since `core-write/v15` (`97dq.99`) its closing sentence defers to the
    // rule about handed questions instead of forbidding all content.
    const ru = coreWrite.corePrompt(input());
    expect(ru).toContain(v15.CORE_WRITE_FINISHED_TEXT_V15);
    expect(ru).not.toContain(v13.CORE_WRITE_FINISHED_TEXT_V13.en);
    expect(ru).not.toContain(v13.CORE_WRITE_FINISHED_TEXT_V13.ru);
    expect(ru).toContain('the finished text of the post in the author’s first person');
    expect(ru).toContain('apply each one silently');
    expect(ru).toContain('the text states only the value from the answer');
    expect(ru).toContain('«in my answer I clarified»');
    expect(ru).toContain(v15.CORE_WRITE_BLOCK_TITLES_V15.decisions);
    expect(ru).toContain(v15.CORE_WRITE_BLOCK_TITLES_V15.answers);
    // The inputs reach the model: the answer, the decision and the material.
    expect(ru).toContain('В полтора раза.');
    expect(ru).toContain('Не описывать конкретные шаги');
    expect(ru).toContain('Созвонов по статусу стало вдвое меньше.');
    // The rule rides last, so it outranks the rules above it.
    const system = v13.coreWriteSystemV13('ru', '', { delegated: true, rebuild: true });
    expect(system.endsWith(v13.CORE_WRITE_FINISHED_TEXT_V13.ru)).toBe(true);
    // v14 keeps the rule last among the rules; only the output language follows.
    const systemV14 = v14.coreWriteSystemV14('ru', '', { delegated: true, rebuild: true });
    expect(systemV14.endsWith(`${v13.CORE_WRITE_FINISHED_TEXT_V13.en}\n${v14.coreWriteOutputLanguageV14('ru')}`)).toBe(true);

    // v15 keeps it last among the rules as well.
    const systemV15 = v15.coreWriteSystemV15('ru', '', { delegated: true, rebuild: true });
    expect(systemV15.endsWith(`${v15.CORE_WRITE_FINISHED_TEXT_V15}\n${v14.coreWriteOutputLanguageV14('ru')}`)).toBe(true);

    const en = coreWrite.corePrompt(input({ language: 'en' }));
    expect(en).toContain(v15.CORE_WRITE_FINISHED_TEXT_V15);
    expect(en).toContain(v15.CORE_WRITE_BLOCK_TITLES_V15.decisions);
    expect(en).not.toContain(v13.CORE_WRITE_FINISHED_TEXT_V13.ru);
  });
});

describe('the meta-speech guard', () => {
  test('finds every turn of the cnt-36 core', () => {
    expect(metaSpeechIn(CNT36_META_CORE)).toEqual(
      expect.arrayContaining(['Сначала я описал', 'в ответе уточнил', 'конкретных деталей нет', 'Здесь можно рассказать'])
    );
    expect(metaSpeechIn('Об этом в исходном материале нет ни слова.')).toEqual(['в исходном материале']);
    expect(metaSpeechIn('В первом описании было иначе.')).toEqual(['В первом описании']);
  });

  test('English turns are caught too', () => {
    const hits = metaSpeechIn(
      'At first I described it as half, and in my answer I clarified it. There are no concrete details. Here one could tell about the result. In the source material it says so.'
    );
    expect(hits).toEqual(
      expect.arrayContaining(['At first I described', 'in my answer I clarified', 'There are no concrete details', 'Here one could tell', 'In the source material'])
    );
  });

  test('a finished post is left alone, including words that only look alike', () => {
    expect(metaSpeechIn(CLEAN_CORE)).toEqual([]);
    expect(metaSpeechIn('Материалы для сборки лежат на складе, а ответ клиента пришёл вечером.')).toEqual([]);
    expect(metaSpeechIn('We had no details in the chat, and the board answered the question.')).toEqual([]);
  });
});

/* Review W1 of the fifteenth walk, F8: only whole constructs about the text. */
describe('ordinary author sentences pass the guard (fifteenth F8)', () => {
  test.each([
    'В брифе клиента не было дедлайна, и мы три недели сдвигали запуск.',
    'Я писал об этом в материале для РБК год назад.',
    'Пока деталей нет: компания молчит.',
    'Подробностей не было ни у кого, даже у пресс-службы.',
    'В этом тексте закона три поправки, и каждая про сроки.',
    'Как я уже писал, общая доска снимает вопросы о статусе.',
    'Об этом стоит рассказать отдельно — история длинная.',
    'In the brief the client asked for a single deadline.',
    'I covered it in the material for the Guardian last year.',
    'No specific details were released by the company.',
    'As I wrote before, the board answers most status questions.',
  ])('%s', (sentence) => {
    expect(metaSpeechIn(sentence)).toEqual([]);
  });
});

describe('the meta rewrite keeps the anti-copy guarantee (fifteenth F7)', () => {
  const FOREIGN =
    'Когда все задачи команды лежат на одной общей доске вопросы о статусе отпадают сами собой и чат затихает';
  const { wordShingles } = loadWithMocks(`${base}/text-quality/anti-copy.ts`);
  const shingles = [...wordShingles(FOREIGN, 8)];
  const COPIED = `${FOREIGN}. Здесь можно рассказать о результате.`;
  const OWN_META = 'Общая доска сняла у нас вопросы о статусе. Здесь можно рассказать о результате.';
  const OWN = 'Общая доска сняла у нас вопросы о статусе, и созвонов стало в полтора раза меньше.';

  test('the anti-copy hint goes into the meta rewrite prompt with the meta hint', async () => {
    responses = [{ text: COPIED }, { text: OWN_META }, { text: OWN }];
    const { core } = await coreWrite.writeCoreWithDecisions(input({ foreignShingles: shingles }), deps());
    expect(modelCalls).toHaveLength(3);
    expect(modelCalls[2].prompt).toContain(v14.CORE_WRITE_REPAIR_V14);
    expect(modelCalls[2].prompt).toContain(v14.CORE_WRITE_META_REPAIR_V14);
    expect(core.text).toBe(OWN);
  });

  test('a meta rewrite that brings the copy back is not taken', async () => {
    const warn = jest.fn();
    responses = [{ text: COPIED }, { text: OWN_META }, { text: `${FOREIGN}.` }];
    const { core } = await coreWrite.writeCoreWithDecisions(input({ foreignShingles: shingles }), deps(warn));
    expect(modelCalls).toHaveLength(3);
    expect(core.text).toBe(OWN_META);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('repeated the source post'));
  });

  test('without a foreign post the meta rewrite carries only its own hint', async () => {
    responses = [{ text: CNT36_META_CORE }, { text: CLEAN_CORE }];
    await coreWrite.writeCoreWithDecisions(input(), deps());
    expect(modelCalls[1].prompt).not.toContain(v14.CORE_WRITE_REPAIR_V14);
  });
});

describe('writeCoreWithDecisions and the guard', () => {
  test('cnt-36: a core that narrates is rewritten once, with the phrases named', async () => {
    const warn = jest.fn();
    responses = [{ text: CNT36_META_CORE, decisions: [] }, { text: CLEAN_CORE, decisions: [] }];
    const { core } = await coreWrite.writeCoreWithDecisions(input(), deps(warn));
    expect(modelCalls).toHaveLength(2);
    expect(modelCalls[1].prompt).toContain(v14.CORE_WRITE_META_REPAIR_V14);
    expect(modelCalls[1].prompt).toContain('«в ответе уточнил»');
    expect(core.text).toBe(CLEAN_CORE);
    expect(core.writtenBy).toBe('model');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rewriting once'));
  });

  test('one rewrite only: a second narrating answer is kept rather than asked for a third time', async () => {
    responses = [{ text: CNT36_META_CORE }, { text: `${CLEAN_CORE} Здесь можно рассказать больше.` }];
    const { core } = await coreWrite.writeCoreWithDecisions(input(), deps());
    expect(modelCalls).toHaveLength(2);
    expect(core.text).toContain('Здесь можно рассказать');
  });

  test('a clean core costs one call', async () => {
    responses = [{ text: CLEAN_CORE }];
    await coreWrite.writeCoreWithDecisions(input(), deps());
    expect(modelCalls).toHaveLength(1);
  });

  test('an empty rewrite keeps the first text', async () => {
    responses = [{ text: CNT36_META_CORE }, { text: '' }];
    const { core } = await coreWrite.writeCoreWithDecisions(input(), deps());
    expect(core.text).toBe(CNT36_META_CORE);
  });
});

describe('extract drops a fact contained in another (cnt-36)', () => {
  test('«Вдвое меньше.» next to «Созвонов по статусу стало вдвое меньше.» goes', () => {
    const rows = ownFacts.dropContainedFacts([
      fact('Созвонов по статусу стало вдвое меньше.'),
      fact('Вдвое меньше.'),
    ]);
    expect(rows.map((row) => row.statement)).toEqual(['Созвонов по статусу стало вдвое меньше.']);
  });

  test('settleOwnFacts applies it', () => {
    const rows = ownFacts.settleOwnFacts({
      facts: [fact('Вдвое меньше.'), fact('Созвонов по статусу стало вдвое меньше.')],
      personText: CNT36_INPUT,
    });
    expect(rows.map((row) => row.statement)).not.toContain('Вдвое меньше.');
    expect(rows.map((row) => row.statement)).toContain('Созвонов по статусу стало вдвое меньше.');
  });

  test('whole words only, exact duplicates keep the first, a sourced row is never dropped for another', () => {
    expect(
      ownFacts.dropContainedFacts([fact('Выросло на 10%.'), fact('Выросло на 100%.')]).map((row) => row.statement)
    ).toEqual(['Выросло на 10%.', 'Выросло на 100%.']);
    expect(
      ownFacts.dropContainedFacts([fact('Вдвое меньше'), fact('вдвое меньше.')]).map((row) => row.statement)
    ).toEqual(['Вдвое меньше']);
    const sourced = fact('Вдвое меньше.', { evidenceId: 'E1', sourceUrl: 'https://a.example', origin: 'search', kind: 'external' });
    expect(
      ownFacts.dropContainedFacts([fact('Созвонов стало вдвое меньше.'), sourced])
    ).toHaveLength(2);
  });
});

/* Review W1 of the fifteenth walk, F9. */
describe('fact dedupe: same kind, no source, no negation (fifteenth F9)', () => {
  const statements = (rows) => rows.map((row) => row.statement);

  test('an own row is not absorbed by an external one', () => {
    const rows = [
      fact('Выручка выросла.'),
      fact('Выручка выросла на 5% у конкурентов.', { kind: 'external' }),
    ];
    expect(statements(ownFacts.dropContainedFacts(rows))).toEqual(statements(rows));
  });

  test('a row with a source never goes, and never absorbs one', () => {
    const container = fact('Созвонов по статусу стало вдвое меньше.', { sourceUrl: 'https://a.example' });
    expect(ownFacts.dropContainedFacts([container, fact('Вдвое меньше.')])).toHaveLength(2);
    const sourcedInner = fact('Вдвое меньше.', { evidenceId: 'E1' });
    expect(ownFacts.dropContainedFacts([fact('Созвонов стало вдвое меньше.'), sourcedInner])).toHaveLength(2);
    // Exact duplicates with a source stay too: the source is the row.
    expect(
      ownFacts.dropContainedFacts([fact('Вдвое меньше.', { factId: 'F1' }), fact('Вдвое меньше.', { factId: 'F1' })])
    ).toHaveLength(2);
  });

  test('a negation around the contained words keeps both rows', () => {
    for (const [outer, inner] of [
      ['Созвонов не стало больше.', 'Стало больше.'],
      ['Стало больше не нужно.', 'Стало больше.'],
      ['Revenue did not grow this year.', 'Grow this year.'],
      ["Revenue isn't growing.", 'Growing.'],
    ]) {
      expect(statements(ownFacts.dropContainedFacts([fact(outer), fact(inner)]))).toEqual([outer, inner]);
    }
  });

  test('the cnt-36 duplicate still goes: same kind, no source, no negation', () => {
    expect(
      statements(ownFacts.dropContainedFacts([fact('Созвонов по статусу стало вдвое меньше.'), fact('Вдвое меньше.')]))
    ).toEqual(['Созвонов по статусу стало вдвое меньше.']);
  });
});
