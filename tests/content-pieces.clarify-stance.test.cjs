'use strict';

/**
 * Вопрос о позиции: вариант, который просит слова человека.
 *
 * `content-factory-next-97dq.23`, девятый заход 22.09.2026. У чужого поста
 * вопрос «Где вы стоите в этом споре?» показывал три варианта ответа и тут же,
 * в том же ряду, три служебных чипа — владелец прочитал это как шесть равных
 * вариантов. Третий вариант («согласен частично и хочу уточнить свою позицию»)
 * не ответ, а просьба сказать своими словами: на бою его подпись легла в бриф
 * позицией человека, и суть написалась с фразы кнопки.
 *
 * Проверяется то, что легче всего сломать обратно:
 *
 *  - помеченный вариант открывает поле и уходит ответом написанное, а не
 *    подпись; происхождение у такого ответа — слово человека;
 *  - помеченный вариант с пустым полем ответом не становится вовсе: поле
 *    закрывает модель, как после пустого «Поправить»;
 *  - служебные действия стоят своей группой, а не шестым вариантом ответа;
 *  - выбор остаётся один на вопрос: обе группы живут в одном `radiogroup`.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render, fireEvent } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const { SuggestedQuestionsCard } = loadTypeScriptModule(
  `${base}/intake/questions.card.tsx`
);
const { PieceQuestions } = loadTypeScriptModule(
  `${base}/pieces/piece-questions.tsx`
);
const { piecesCopy } = loadTypeScriptModule(`${base}/pieces/pieces.copy.ts`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const coreQuestions = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/core-questions.ts'
);

beforeAll(async () => {
  const i18n = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/i18next.ts'
  ).default;
  if (!i18n.isInitialized) {
    await new Promise((resolve) => i18n.on('initialized', resolve));
  }
  await i18n.loadLanguages(['en', 'ru']);
});
afterEach(cleanup);

const CLARIFY = 'Я согласен частично и хочу уточнить свою позицию';
const STANCES = [
  'Я согласен с позицией автора исходного поста',
  'Я не согласен с позицией автора исходного поста',
  CLARIFY,
];

const words = {
  badge: piecesCopy.ru.interviewBadge,
  title: piecesCopy.ru.interviewTitle,
  lead: piecesCopy.ru.interviewLead,
  suggestedLead: piecesCopy.ru.suggestedLead,
  yes: piecesCopy.ru.answerYes,
  fix: piecesCopy.ru.answerFix,
  decide: piecesCopy.ru.answerDecide,
  skip: piecesCopy.ru.answerSkip,
  ownAnswerLabel: piecesCopy.ru.ownAnswerLabel,
  ownAnswerHint: piecesCopy.ru.ownAnswerHint,
  ownOptionPlaceholder: piecesCopy.ru.ownOptionPlaceholder,
  send: piecesCopy.ru.interviewSend,
  skipAll: piecesCopy.ru.answerDecideAll,
};

const drawCard = (onSubmit) =>
  render(
    withLanguage(
      React.createElement(SuggestedQuestionsCard, {
        words,
        questions: [
          {
            key: 'position',
            question: 'Где вы стоите в этом споре?',
            suggested: null,
            options: STANCES,
            ownOption: CLARIFY,
          },
        ],
        onSubmit,
      })
    )
  );

const withLanguage = (element) =>
  React.createElement(
    variables.VariableContextComponent,
    { language: 'ru' },
    element
  );

const chip = (text) =>
  [...document.querySelectorAll('[role="radio"]')].find(
    (node) => node.textContent.trim() === text
  );

const field = () => document.querySelector('input[name="piece-answer-position"]');

describe('помеченный вариант просит слова, а не становится ответом', () => {
  test('его выбор открывает поле, и ответом уходит написанное', () => {
    const onSubmit = jest.fn();
    drawCard(onSubmit);

    expect(field()).toBeNull();
    fireEvent.click(chip(CLARIFY));

    const input = field();
    expect(input).not.toBeNull();
    // Поле открывается пустым: подпись варианта в него не подставляется.
    expect(input.value).toBe('');
    expect(input.getAttribute('placeholder')).toBe(
      piecesCopy.ru.ownOptionPlaceholder
    );
    // И вариант остаётся выбранным, иначе непонятно, откуда взялось поле.
    expect(chip(CLARIFY).getAttribute('aria-checked')).toBe('true');

    fireEvent.change(input, {
      target: { value: 'Согласен про комиссии, но не про уход с площадок' },
    });
    expect(chip(CLARIFY).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(
      [...document.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === words.send
      )
    );

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [given, decided] = onSubmit.mock.calls[0];
    expect(given).toEqual([
      {
        key: 'position',
        text: 'Согласен про комиссии, но не про уход с площадок',
        origin: 'person',
      },
    ]);
    expect(decided).toEqual([]);
  });

  test('с пустым полем ответа нет вовсе, а подписи варианта — тем более', () => {
    const onSubmit = jest.fn();
    drawCard(onSubmit);

    fireEvent.click(chip(CLARIFY));
    fireEvent.click(
      [...document.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === words.send
      )
    );

    expect(onSubmit).toHaveBeenCalledWith([], ['position']);
  });

  test('обычный вариант остаётся ответом и поля не открывает', () => {
    const onSubmit = jest.fn();
    drawCard(onSubmit);

    fireEvent.click(chip(STANCES[0]));
    expect(field()).toBeNull();

    fireEvent.click(
      [...document.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === words.send
      )
    );
    expect(onSubmit).toHaveBeenCalledWith(
      [{ key: 'position', text: STANCES[0], origin: 'confirmed' }],
      []
    );
  });
});

describe('служебные действия — не шестой вариант ответа', () => {
  test('варианты и служебные чипы стоят разными группами', () => {
    drawCard(jest.fn());

    const options = [
      ...document.querySelectorAll(
        '[data-piece-answer-options] [role="radio"]'
      ),
    ].map((node) => node.textContent.trim());
    const service = [
      ...document.querySelectorAll(
        '[data-piece-service-actions] [role="radio"]'
      ),
    ].map((node) => node.textContent.trim());

    expect(options).toEqual(STANCES);
    expect(service).toEqual([words.fix, words.decide, words.skip]);
  });

  test('выбор остаётся один на вопрос: обе группы в одном radiogroup', () => {
    drawCard(jest.fn());

    expect(document.querySelectorAll('[role="radiogroup"]')).toHaveLength(1);
    const group = document.querySelector('[role="radiogroup"]');
    expect(
      group.querySelectorAll('[data-piece-answer-options] [role="radio"]')
    ).toHaveLength(STANCES.length);
    expect(
      group.querySelectorAll('[data-piece-service-actions] [role="radio"]')
    ).toHaveLength(3);

    // Служебное действие снимает выбор варианта, а не встаёт рядом с ним.
    fireEvent.click(chip(STANCES[0]));
    fireEvent.click(chip(words.decide));
    expect(chip(STANCES[0]).getAttribute('aria-checked')).toBe('false');
    expect(chip(words.decide).getAttribute('aria-checked')).toBe('true');
  });
});

describe('пометка приезжает с сервера, а не угадывается по тексту', () => {
  test('вопрос о позиции чужого поста несёт третий вариант пометкой', () => {
    const forPost = (language) =>
      coreQuestions
        .openQuestionsFor({
          brief: {
            goal: null,
            thesis: 'Продавцам нужно пересчитать экономику',
            position: null,
            disagreement: null,
            audience: null,
            format: null,
            facts: [],
            origins: { thesis: 'person' },
            ungrounded: [],
            inputKind: 'foreign_post',
          },
          options: {},
          language,
          settled: [],
        })
        .find((question) => question.field === 'position');

    const ru = forPost('ru');
    expect(ru.options).toEqual(STANCES);
    expect(ru.ownOption).toBe(CLARIFY);
    expect(ru.options).toContain(ru.ownOption);

    const en = forPost('en');
    expect(en.ownOption).toBe('I partly agree and want to clarify my position');
    expect(en.options).toContain(en.ownOption);
  });

  test('страница заготовки передаёт пометку карточке', () => {
    render(
      withLanguage(
        React.createElement(PieceQuestions, {
          locale: 'ru',
          questions: [
            {
              field: 'position',
              question: 'Где вы стоите в этом споре?',
              suggested: null,
              options: STANCES,
              ownOption: CLARIFY,
            },
          ],
          onAnswer: jest.fn(),
          onSkip: jest.fn(),
        })
      )
    );

    fireEvent.click(chip(CLARIFY));
    expect(field()).not.toBeNull();
    expect(field().getAttribute('placeholder')).toBe(
      piecesCopy.ru.ownOptionPlaceholder
    );
  });
});

/**
 * Вопрос по умолчанию (`content-factory-next-97dq.31`): варианты модели без
 * предложения и без варианта «своими словами». Поправлять там нечего — чип
 * зовётся своим ответом; «Пропустить» — решение модели, а не текст.
 */
describe('97dq.31: вопрос без предложения модели', () => {
  const TAKEAWAY = {
    key: 'takeaway',
    question: 'Что читатели «Мой канал» должны унести из этого поста?',
    suggested: null,
    options: ['Срок держится, когда о нём знает клиент', 'Я перестал назначать себе сроки в одиночку'],
  };

  const drawTakeaway = (onSubmit, extraWords = {}) =>
    render(
      withLanguage(
        React.createElement(SuggestedQuestionsCard, {
          words: { ...words, ...extraWords },
          questions: [TAKEAWAY],
          onSubmit,
        })
      )
    );

  const send = () =>
    fireEvent.click(
      [...document.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === words.send
      )
    );

  test('чип своих слов зовётся «Свой ответ», а не «Поправить»', () => {
    drawTakeaway(jest.fn(), { own: piecesCopy.ru.ownAnswer });
    expect(piecesCopy.ru.ownAnswer).toBe('Свой ответ');
    expect(chip('Свой ответ')).toBeTruthy();
    expect(chip(words.fix)).toBeUndefined();
    // Ничего не выбрано заранее.
    expect(
      [...document.querySelectorAll('[role="radio"]')].some(
        (node) => node.getAttribute('aria-checked') === 'true'
      )
    ).toBe(false);
  });

  test('без своего слова карточка берёт подпись поля ответа', () => {
    drawTakeaway(jest.fn());
    expect(chip(words.ownAnswerLabel)).toBeTruthy();
  });

  test('«Пропустить» уходит решением модели, а не служебной меткой', () => {
    const onSubmit = jest.fn();
    drawTakeaway(onSubmit);
    fireEvent.click(chip(words.skip));
    send();
    expect(onSubmit).toHaveBeenCalledWith([], ['takeaway']);
  });

  test('выбранный вариант уходит подтверждённым словом', () => {
    const onSubmit = jest.fn();
    drawTakeaway(onSubmit);
    fireEvent.click(chip(TAKEAWAY.options[1]));
    send();
    expect(onSubmit).toHaveBeenCalledWith(
      [{ key: 'takeaway', text: TAKEAWAY.options[1], origin: 'confirmed' }],
      []
    );
  });

  test('пропуск адаптации называется одним именем: «Решите всё за меня»', () => {
    expect(piecesCopy.ru.skipInterview).toBe('Решите всё за меня');
    expect(piecesCopy.ru.skipInterview).toBe(piecesCopy.ru.answerDecideAll);
  });
});
