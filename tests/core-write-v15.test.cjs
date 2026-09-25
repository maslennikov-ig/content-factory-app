'use strict';

/**
 * «Решите за меня» — ИИ дописывает из своих знаний (`content-factory-next-97dq.99`).
 *
 * Решение владельца 25.09.2026: «если человек пишет „реши сам“, это не
 * значит, что ничего писать не нужно». По умолчанию (`knowledge`) — знания да:
 * объяснения, советы, приёмы, общеизвестные факты, примеры в общем виде;
 * выдуманный опыт нет: личный эпизод от первого лица, точные числа, цитаты,
 * источники. Настройка аватара (`examples`) разрешает ещё и правдоподобный
 * пример от лица автора, но не числа как измеренный результат, цитаты и
 * источники.
 *
 * Здесь чистые части: промпт `core-write/v15` для обеих политик и проверка
 * настройки в брендовом профиле. Дверь паспорта — в
 * `brand-voice.version-pair.test.cjs`, путь от аватара до сути — в
 * `content-pieces.service.test.cjs`. Платных вызовов нет.
 */

require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { cyrillicOutsideData } = require('./helpers/prompt-language.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence';
const mocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': { getChatModel: async () => null },
};
const coreWrite = loadWithMocks(`${base}/pieces/core-write.ts`, mocks);
const v15 = loadWithMocks(`${base}/pieces/core-write-prompt.v15.ts`);
const v14 = loadWithMocks(`${base}/pieces/core-write-prompt.v14.ts`);
const v11 = loadWithMocks(`${base}/pieces/core-write-prompt.v11.ts`);
const policy = loadWithMocks(`${base}/brand-profile/delegated-policy.ts`);
const { forbiddenPhrasesFor } = loadWithMocks(`${base}/text-quality/forbidden-phrases.ts`);

const PERSON =
  'Я заметил, что команда пишет в чат меньше, когда задачи лежат на общей доске. Хочу рассказать, как мы к этому пришли.';
const DELEGATED = [
  { key: 'ask-1', question: 'Как выглядела конкретная рабочая ситуация?', authorMaterial: true },
  { key: 'audience', question: 'Для кого этот текст?', authorMaterial: false },
];

const input = (overrides = {}) => ({
  organizationId: 'org',
  language: 'ru',
  brief: {
    inputKind: 'thought',
    thesis: 'Общая доска снимает вопросы о статусе.',
    position: 'Я заметил, что чат затихает.',
    disagreement: '',
    audience: '',
    origins: { thesis: 'input', position: 'input' },
    ungrounded: [],
    facts: [],
  },
  answers: [],
  questionTextByKey: {},
  personText: PERSON,
  delegated: DELEGATED,
  borrowed: null,
  foreignShingles: [],
  ...overrides,
});

const DATA = [PERSON, ...forbiddenPhrasesFor('ru')];

describe('core-write/v15: «Решите за меня» из знаний', () => {
  test('своя версия; v14 и v11 остаются для квитанций', () => {
    expect(v15.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v15');
    expect(coreWrite.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v15');
    expect(v14.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v14');
    expect(coreWrite.corePrompt(input())).toContain('PROMPT VERSION: core-write/v15');
    // Старые модули не тронуты: правило 97dq.56 в v11 на месте.
    expect(v11.CORE_WRITE_DELEGATED_V11.en).toContain('You do not know it and you do not invent it');
  });

  test.each(['knowledge', 'examples'])(
    '%s: инструкции английские, кириллица только в данных, язык вывода назван',
    (delegatedPolicy) => {
      for (const language of ['ru', 'en']) {
        const prompt = coreWrite.corePrompt(input({ language, delegatedPolicy }));
        expect(prompt).toContain(v15.CORE_WRITE_HANDED_V15[delegatedPolicy]);
        expect(prompt).toContain(v15.CORE_WRITE_DELEGATED_V15);
        expect(prompt).toContain(`write the core and every decision in ${language === 'ru' ? 'Russian' : 'English'}`);
        expect(cyrillicOutsideData(prompt, DATA)).toEqual([]);
      }
      expect(cyrillicOutsideData(v15.CORE_WRITE_HANDED_V15[delegatedPolicy])).toEqual([]);
    }
  );

  test('по умолчанию — знания: правило знаний есть, выдуманный опыт запрещён', () => {
    const prompt = coreWrite.corePrompt(input());
    const rule = v15.CORE_WRITE_HANDED_V15.knowledge;
    expect(prompt).toContain(rule);
    expect(policy.DEFAULT_DELEGATED_POLICY).toBe('knowledge');
    // Знания: «реши сам» — не «ничего не пиши».
    expect(rule).toContain('Handing a question over does not mean «write nothing about it»');
    expect(rule).toContain('answer it with content from your own knowledge');
    expect(rule).toContain('why it works, advice, techniques, widely known facts, and examples in a general form');
    expect(rule).toContain('as the author’s own reasoning or advice inside their first-person post — never as their lived experience');
    // Выдуманный опыт — нет.
    expect(rule).toContain('Still forbidden: a personal first-person episode the person did not give');
    expect(rule).toContain('exact numbers, quotes, and named sources or studies that are not in the input');
    expect(rule).toContain('answer it in general terms — how this usually goes and why — and do not invent their case');
    expect(rule).not.toContain('invent a plausible illustrative example');
    expect(prompt).not.toContain(v15.CORE_WRITE_HANDED_V15.examples);
  });

  test('с разрешением — пример от лица автора можно, числа, цитаты и источники нельзя', () => {
    const prompt = coreWrite.corePrompt(input({ delegatedPolicy: 'examples' }));
    const rule = v15.CORE_WRITE_HANDED_V15.examples;
    expect(prompt).toContain(rule);
    expect(prompt).not.toContain(v15.CORE_WRITE_HANDED_V15.knowledge);
    // Знания — те же.
    expect(rule).toContain('answer it with content from your own knowledge');
    // Запрет на выдуманный опыт снят.
    expect(rule).toContain('you may invent a plausible illustrative example in the author’s voice, first person included');
    expect(rule).toContain('a question marked «about the author’s material» may be answered with such an example');
    expect(rule).not.toContain('Still forbidden: a personal first-person episode');
    expect(rule).not.toContain('do not invent their case');
    // И всё же: ни измеренных чисел, ни цитат, ни источников.
    expect(rule).toContain('numbers presented as measured results');
    expect(rule).toContain('quotes of real people, and named sources or studies that are not in the input');
  });

  test('ни одно правило выше не спорит с политикой: запреты v11–v13 переписаны, а не перекрыты', () => {
    const prompt = coreWrite.corePrompt(
      input({ delegatedPolicy: 'examples', rebuildFrom: { text: 'Прежняя суть.', byPerson: false } })
    );
    // v11: «never add numbers, names, cases or quotes to them» / «never write them in the first person as something lived».
    expect(prompt).not.toContain('never write them in the first person as something lived');
    expect(prompt).not.toContain('there are never new pieces of advice or steps');
    // v12: «never become facts: add no numbers, names, cases or quotes».
    expect(prompt).not.toContain('but never become facts');
    // v13: «Decisions still never become lived experience».
    expect(prompt).not.toContain('Decisions still never become lived experience');
    expect(prompt).toContain(v15.CORE_WRITE_REBUILD_V15);
    expect(prompt).toContain(v15.CORE_WRITE_FINISHED_TEXT_V15);
    // Числа, имена и цитаты сверх входа запрещены в каждом из переписанных правил.
    expect(v15.CORE_WRITE_REBUILD_V15).toContain('add no numbers, names or quotes that are not in');
    expect(v15.CORE_WRITE_FINISHED_TEXT_V15).toContain('never add numbers, names or quotes they did not give');
  });

  test('правило политики едет, только когда суть стоит на отданных вопросах', () => {
    const plain = coreWrite.corePrompt(input({ delegated: [] }));
    expect(plain).not.toContain('The rule about handed questions');
    expect(plain).not.toContain(v15.CORE_WRITE_DELEGATED_V15);
    // Решения прошлого круга без нового блока: политика есть, механики нет.
    const decided = coreWrite.corePrompt(
      input({
        delegated: [],
        delegatedPolicy: 'examples',
        answers: [
          { key: 'ask-1', question: 'Какой случай?', text: 'Текст показывает типичную сцену.', origin: 'model', step: 'core' },
        ],
      })
    );
    expect(decided).toContain(v15.CORE_WRITE_HANDED_V15.examples);
    expect(decided).not.toContain(v15.CORE_WRITE_DELEGATED_V15);
  });

  test('схема ответа: решение называет ответ, а не только угол', () => {
    const description = coreWrite.coreSchema.shape.decisions.unwrap().unwrap().element.shape.text.description;
    expect(description).toContain('what the core now says in answer');
    expect(description).toContain('never a number, quote or named source that is not in the input');
  });
});

describe('delegatedPolicyOf: только явное «examples» разрешает примеры', () => {
  test.each([
    [undefined, 'knowledge'],
    [null, 'knowledge'],
    [{}, 'knowledge'],
    [{ delegatedPolicy: 'knowledge' }, 'knowledge'],
    [{ delegatedPolicy: 'EXAMPLES' }, 'knowledge'],
    [{ delegatedPolicy: true }, 'knowledge'],
    [{ delegatedPolicy: 'examples' }, 'examples'],
  ])('%j → %s', (voice, expected) => {
    expect(policy.delegatedPolicyOf(voice)).toBe(expected);
  });
});
