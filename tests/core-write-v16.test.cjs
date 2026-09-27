'use strict';

/**
 * «Решите за меня» не выдумывает опыт автора (`content-factory-next-wffi`).
 *
 * Перепроверка W2 27.09.2026, N3: два вопроса о своём опыте автора (какой
 * эпизод, за какой период) отданы модели при политике `knowledge`, и суть
 * получила расплывчатые общие слова: «например, команда довела до выпуска
 * функцию…» и абзац о том, как сравнивать периоды. Правило владельца: решать
 * за человека, но не выдумывать его собственный опыт.
 *
 * Здесь чистые части: `handedQuestionsOf` (детерминированные ворота) и
 * промпт `core-write/v16`. Путь двери ответов — в
 * `content-pieces.service.test.cjs`. Платных вызовов нет.
 */

require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { cyrillicOutsideData } = require('./helpers/prompt-language.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence';
let responses = [];
const modelCalls = [];
const mocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getChatModel: async () => ({
      withStructuredOutput: () => ({
        invoke: async (prompt) => {
          modelCalls.push(prompt);
          const next = responses.shift();
          if (next instanceof Error) throw next;
          return next;
        },
      }),
    }),
  },
};
const coreWrite = loadWithMocks(`${base}/pieces/core-write.ts`, mocks);
const v16 = loadWithMocks(`${base}/pieces/core-write-prompt.v16.ts`);
const v15 = loadWithMocks(`${base}/pieces/core-write-prompt.v15.ts`);
const { forbiddenPhrasesFor } = loadWithMocks(`${base}/text-quality/forbidden-phrases.ts`);

const PERSON =
  'Мы выпустили функцию быстрее, чем раньше. Хочу рассказать, что поменялось в процессе.';
const EPISODE = { key: 'ask-1', question: 'Какой эпизод вы имеете в виду?', authorMaterial: true };
const PERIOD = { key: 'ask-2', question: 'За какой период вы сравниваете?', authorMaterial: true };
const AUDIENCE = { key: 'audience', question: 'Для кого этот текст?', authorMaterial: false };

const input = (overrides = {}) => ({
  organizationId: 'org',
  language: 'ru',
  brief: {
    inputKind: 'thought',
    thesis: 'Процесс выпуска стал быстрее.',
    position: 'Мы выпустили функцию быстрее.',
    disagreement: '',
    audience: '',
    origins: { thesis: 'input', position: 'input' },
    ungrounded: [],
    facts: [],
  },
  answers: [],
  questionTextByKey: {},
  personText: PERSON,
  delegated: [EPISODE, PERIOD, AUDIENCE],
  borrowed: null,
  foreignShingles: [],
  ...overrides,
});

const block = (prompt, title) => {
  const start = prompt.indexOf(title);
  return start < 0 ? '' : prompt.slice(start, prompt.indexOf('--- BLOCK END ---', start));
};

describe('handedQuestionsOf: свой опыт автора модели не отдаётся', () => {
  test.each([[undefined], ['knowledge']])('политика %s: вопрос о материале автора — пробел', (policy) => {
    const { handed, gaps } = coreWrite.handedQuestionsOf([EPISODE, PERIOD, AUDIENCE], policy);
    expect(handed).toEqual([AUDIENCE]);
    expect(gaps).toEqual([EPISODE, PERIOD]);
  });

  test('явное разрешение аватара (`examples`) — вопрос отдаётся, как раньше', () => {
    const { handed, gaps } = coreWrite.handedQuestionsOf([EPISODE, PERIOD, AUDIENCE], 'examples');
    expect(handed).toEqual([EPISODE, PERIOD, AUDIENCE]);
    expect(gaps).toEqual([]);
  });
});

describe('core-write/v16: промпт', () => {
  test('своя версия; v15 остаётся для квитанций', () => {
    expect(v16.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v16');
    expect(v15.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v15');
    expect(coreWrite.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v16');
    expect(v15.CORE_WRITE_HANDED_V15.knowledge).toContain('answer it in general terms');
  });

  test('по умолчанию: пробелы своим блоком, в отданных их нет, правило пробела едет', () => {
    const prompt = coreWrite.corePrompt(input());
    const handed = block(prompt, v16.CORE_WRITE_BLOCK_TITLES_V16.delegated);
    const gaps = block(prompt, v16.CORE_WRITE_BLOCK_TITLES_V16.gaps);
    expect(handed).toContain('[audience] Для кого этот текст?');
    expect(handed).not.toContain('ask-1');
    expect(handed).not.toContain('ask-2');
    expect(gaps).toContain(`[ask-1] ${EPISODE.question}`);
    expect(gaps).toContain(`[ask-2] ${PERIOD.question}`);
    expect(prompt).toContain(v16.CORE_WRITE_GAPS_V16);
    expect(prompt).toContain(v16.CORE_WRITE_HANDED_V16.knowledge);
    expect(prompt).not.toContain(v15.CORE_WRITE_HANDED_V15.knowledge);
    expect(cyrillicOutsideData(prompt, [PERSON, ...forbiddenPhrasesFor('ru')])).toEqual([]);
  });

  test('правило пробела: ни эпизода «например», ни периода, ни абзаца о том, как обычно сравнивают', () => {
    const rule = v16.CORE_WRITE_GAPS_V16;
    expect(rule).toContain('stronger than any rule above including the rule about handed questions');
    expect(rule).toContain('return no entry in `decisions` for it and write nothing in its place');
    expect(rule).toContain('from the person’s own words only');
    expect(rule).toContain('drop the claim or keep the thought as general as the person said it');
    expect(rule).toContain('an invented or hypothetical episode («for example, the team…»');
    expect(rule).toContain('a period, a number or a result the person did not give');
    expect(rule).toContain('a paragraph on how such things usually go, are chosen, compared or measured');
    expect(rule).toContain('Never mention that something is missing');
    expect(cyrillicOutsideData(rule)).toEqual([]);
  });

  test('правило знаний: общий пример — только закономерность, не сцена, похожая на случай автора', () => {
    const rule = v16.CORE_WRITE_HANDED_V16.knowledge;
    expect(rule).toContain('answer it with content from your own knowledge');
    expect(rule).not.toContain('«for example, when…»');
    expect(rule).not.toContain('answer it in general terms — how this usually goes and why');
    expect(rule).toContain('never as a concrete scene that a reader of this first-person post would take for the author’s own case');
    expect(rule).toContain('Still forbidden: a personal first-person episode the person did not give');
    expect(v16.CORE_WRITE_HANDED_V16.examples).toBe(v15.CORE_WRITE_HANDED_V15.examples);
  });

  test('только пробелы: механики решений и правила отданных вопросов нет', () => {
    const prompt = coreWrite.corePrompt(input({ delegated: [EPISODE, PERIOD] }));
    expect(prompt).not.toContain(v16.CORE_WRITE_BLOCK_TITLES_V16.delegated);
    expect(prompt).not.toContain(v15.CORE_WRITE_DELEGATED_V15);
    expect(prompt).not.toContain('The rule about handed questions');
    expect(prompt).toContain(v16.CORE_WRITE_GAPS_V16);
  });

  test('с разрешением аватара — как в v15: вопрос о материале отдан, пробелов нет', () => {
    const prompt = coreWrite.corePrompt(input({ delegatedPolicy: 'examples' }));
    expect(prompt).not.toContain(v16.CORE_WRITE_BLOCK_TITLES_V16.gaps);
    expect(prompt).not.toContain(v16.CORE_WRITE_GAPS_V16);
    expect(prompt).toContain(`[ask-1] ${EPISODE.question} (about the author’s material: only the person knows it)`);
    expect(prompt).toContain(v15.CORE_WRITE_HANDED_V15.examples);
  });

  test('без отданных вопросов промпт пробелов не знает', () => {
    const prompt = coreWrite.corePrompt(input({ delegated: [] }));
    expect(prompt).not.toContain(v16.CORE_WRITE_BLOCK_TITLES_V16.gaps);
    expect(prompt).not.toContain(v16.CORE_WRITE_GAPS_V16);
  });
});

describe('writeCoreWithDecisions: решение по пробелу не возвращается', () => {
  const deps = {
    aiUsage: { executeAiOperation: async (_org, _op, run) => run() },
    slopCheck: null,
  };
  beforeEach(() => {
    responses = [];
    modelCalls.length = 0;
  });

  test('модель вернула «решение» по эпизоду автора — оно выброшено, по адресату — оставлено', async () => {
    responses = [{
      text: 'Суть.',
      decisions: [
        { key: 'ask-1', text: 'Например, команда довела до выпуска функцию.' },
        { key: 'ask-2', text: 'Текст сравнивает квартал с кварталом.' },
        { key: 'audience', text: 'Руководители команд разработки.' },
      ],
    }];
    const { decisions } = await coreWrite.writeCoreWithDecisions(input(), deps);
    expect(modelCalls).toHaveLength(1);
    expect(decisions).toEqual([{ key: 'audience', text: 'Руководители команд разработки.' }]);
  });
});
