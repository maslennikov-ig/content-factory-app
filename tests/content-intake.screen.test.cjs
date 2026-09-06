'use strict';

/**
 * Экран входа одной мыслью: что он показывает и о чём молчит.
 *
 * `content-factory-next-tu3k.4`. Экран рисует и ничего не просит, поэтому
 * здесь нет ни одного стаба сети: всё, что он показывает, приходит пропсами.
 * Проверяется то, что легче всего сделать неправильно, а не то, что он
 * отрисовался.
 *
 *  - причина, по которой «Написать» не нажимается, стоит рядом с кнопкой
 *    текстом, а не всплывающей подсказкой и не пустотой;
 *  - строка «похоже на ссылку» появляется только для ссылки и объявляется
 *    вслух — она меняет то, что продукт сейчас сделает;
 *  - дверь в карточку канала есть у Telegram и нет у остальных;
 *  - квитанция называет происхождение каждого поля словом, а факт —
 *    подтверждён он или в текст не вошёл.
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

const {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence/intake';
const { IntakeScreen } = loadTypeScriptModule(`${base}/intake.screen.tsx`);

const CHANNELS = [
  {
    id: 'int-tg',
    name: 'Мой канал',
    identifier: 'telegram',
    picture: '',
    disabled: false,
    inBetweenSteps: false,
  },
  {
    id: 'int-vk',
    name: 'Сообщество',
    identifier: 'vk',
    picture: '',
    disabled: false,
    inBetweenSteps: false,
  },
];

const BRIEF = {
  inputKind: 'foreign_post',
  goal: null,
  thesis: 'Рост случился не из-за рынка',
  position: 'Я бы резал жёстче',
  disagreement: 'Те, кто верит в широкую линейку',
  audience: 'владельцы небольших студий',
  format: 'expert',
  facts: [
    {
      statement: 'выручка достигла 4,2 млрд',
      sourceUrl: 'https://example.test/report',
      factId: null,
      evidenceId: 'ev-1',
      origin: 'search',
      verified: true,
    },
    {
      statement: 'присутствие в 12 странах',
      sourceUrl: null,
      factId: null,
      evidenceId: null,
      origin: 'input',
      verified: false,
    },
  ],
  origins: {
    thesis: 'input',
    position: 'model',
    disagreement: 'model',
    audience: 'avatar',
  },
  ungrounded: ['присутствие в 12 странах'],
};

const noop = () => undefined;

const draw = (props = {}) =>
  render(
    React.createElement(IntakeScreen, {
      locale: 'ru',
      state: 'idle',
      input: '',
      inputKind: null,
      detectedLink: false,
      channels: CHANNELS,
      selectedIds: [],
      language: 'ru',
      step: null,
      questions: [],
      brief: null,
      overrides: {},
      draftText: null,
      blocked: 'input',
      restrictedReason: 'ИИ пока недоступен',
      roundsSpent: false,
      slopKey: 'k',
      onInputChange: noop,
      onToggleChannel: noop,
      onLanguageChange: noop,
      onWrite: noop,
      onCancel: noop,
      onAnswer: noop,
      onOverride: noop,
      onKindChange: noop,
      onRevertOverrides: noop,
      onRebuild: noop,
      onOpenEditor: noop,
      onOpenWritingProfile: noop,
      onRetry: noop,
      writingProfileStored: {},
      ...props,
    })
  );

/*
  Нажатие оборачивается в `act`: в этом наборе React не сбрасывает состояние
  сам, и без обёртки проверялся бы кадр до нажатия. Тот же приём, что в
  `tests/brand-voice.brief-tab.test.cjs`.
*/
const click = async (element) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

const type = async (element, value) => {
  await act(async () => {
    fireEvent.change(element, { target: { value } });
  });
};

afterEach(cleanup);

describe('the door is one field, and its refusals are readable', () => {
  test('the panel names itself, its state and the kind it understood', () => {
    draw({ state: 'idle' });
    const panel = document.querySelector('[data-content-panel="intake"]');
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('data-intake-state')).toBe('idle');
    expect(panel.getAttribute('aria-busy')).toBe('false');
  });

  test('«Написать» is off and the reason stands beside it in words', () => {
    draw({ blocked: 'input' });
    const button = screen.getByRole('button', { name: 'Написать' });
    expect(button.disabled).toBe(true);
    const reason = document.querySelector('[data-intake-block-reason="input"]');
    expect(reason).not.toBeNull();
    expect(reason.textContent).toBe('Напишите хотя бы пару слов');
    // Объяснение — текст, а не подсказка: оно и есть состояние.
    expect(reason.getAttribute('role')).toBe('status');
  });

  test('no channel and «ещё проверяем» are two different sentences', () => {
    const first = draw({ blocked: 'channel', input: 'Мысль про дедлайны' });
    expect(
      document.querySelector('[data-intake-block-reason="channel"]').textContent
    ).toBe('Выберите канал');
    first.unmount();

    draw({ blocked: 'checking' });
    expect(
      document.querySelector('[data-intake-block-reason="checking"]').textContent
    ).toBe('Проверяем, подключён ли ИИ…');
  });

  test('the link line appears only for a link, and it is announced', () => {
    const first = draw({ detectedLink: false, input: 'просто мысль' });
    expect(document.querySelector('[data-intake-kind-line]')).toBeNull();
    first.unmount();

    draw({ detectedLink: true, input: 'https://example.test/post' });
    const line = document.querySelector('[data-intake-kind-line="link"]');
    expect(line).not.toBeNull();
    expect(line.getAttribute('role')).toBe('status');
  });
});

describe('channels, and the writing card behind one of them', () => {
  test('a picked Telegram channel offers «Как пишем в «X»»; VK does not', () => {
    draw({ selectedIds: ['int-tg', 'int-vk'], blocked: null });
    expect(
      screen.getByRole('button', { name: 'Как пишем в «Мой канал»' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Как пишем в «Сообщество»' })
    ).toBeNull();
  });

  test('the card door says whether the channel was ever set up', () => {
    const first = draw({ selectedIds: ['int-tg'], blocked: null });
    expect(document.body.textContent).toContain('по умолчанию');
    first.unmount();

    draw({
      selectedIds: ['int-tg'],
      blocked: null,
      writingProfileStored: { 'int-tg': true },
    });
    expect(document.body.textContent).toContain('настроено');
  });

  test('a workspace with no channel is offered the step it is missing', () => {
    draw({ state: 'no-channel', channels: [] });
    expect(document.body.textContent).toContain('Сначала подключите канал');
    const link = screen.getByRole('link', { name: 'К каналам' });
    expect(link.getAttribute('href')).toBe('/launches');
  });
});

describe('the run, and the result beside its receipt', () => {
  test('a step in flight is announced and named', () => {
    draw({ state: 'streaming', step: 'writing', blocked: null });
    const step = document.querySelector('[data-intake-step="writing"]');
    expect(step.getAttribute('aria-live')).toBe('polite');
    expect(step.textContent).toBe('Пишем…');
    expect(
      document.querySelector('[data-content-panel="intake"]').getAttribute('aria-busy')
    ).toBe('true');
    // Ход можно оборвать, не дожидаясь его конца.
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeTruthy();
  });

  test('the draft keeps its own line breaks and offers the editor', () => {
    draw({
      state: 'draft',
      blocked: null,
      brief: BRIEF,
      draftText: 'Первый абзац.\n\nВторой абзац.',
    });
    const article = document.querySelector('[data-intake-draft="true"]');
    expect(article.textContent).toContain('Второй абзац.');
    expect(article.className).toContain('whitespace-pre-wrap');
    expect(screen.getByRole('button', { name: 'Открыть в редакторе' })).toBeTruthy();
    // «Пересобрать» появляется только когда квитанцию правили: кнопка,
    // которая всегда есть, ничего не сообщает о состоянии.
    expect(screen.queryByRole('button', { name: 'Пересобрать' })).toBeNull();
  });

  test('an edited receipt turns dirty and only then offers «Пересобрать»', () => {
    draw({
      state: 'draft',
      blocked: null,
      brief: BRIEF,
      draftText: 'Текст.',
      overrides: { thesis: 'Своя формулировка' },
    });
    expect(
      document
        .querySelector('[data-brief-receipt]')
        .getAttribute('data-brief-receipt-dirty')
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Пересобрать' })).toBeTruthy();
  });

  test('every receipt row names where it came from, in words', () => {
    draw({ state: 'draft', blocked: null, brief: BRIEF, draftText: 'Текст.' });
    const receipt = document.querySelector('[data-brief-receipt]');

    const thesis = receipt.querySelector('[data-brief-receipt-row="thesis"]');
    expect(
      thesis.querySelector('[data-brief-origin]').getAttribute('data-brief-origin')
    ).toBe('input');
    expect(thesis.textContent).toContain('из вашего текста');

    // Позицию модель предложила сама, и квитанция говорит это словом, а не
    // оттенком рамки.
    const position = receipt.querySelector('[data-brief-receipt-row="position"]');
    expect(position.textContent).toContain('предположение');

    // Поле, о котором сервер ничего не сказал, — тоже предположение, а не
    // молчание: строка без происхождения читалась бы как факт.
    const goal = receipt.querySelector('[data-brief-receipt-row="goal"]');
    expect(
      goal.querySelector('[data-brief-origin]').getAttribute('data-brief-origin')
    ).toBe('model');
  });

  test('a fact says whether it is confirmed, and an unconfirmed one says it stayed out', () => {
    draw({ state: 'draft', blocked: null, brief: BRIEF, draftText: 'Текст.' });
    const facts = document.querySelectorAll('[data-brief-fact-verified]');
    expect(facts).toHaveLength(2);
    expect(facts[0].getAttribute('data-brief-fact-verified')).toBe('true');
    expect(facts[0].textContent).toContain('подтверждено');
    expect(facts[1].getAttribute('data-brief-fact-verified')).toBe('false');
    expect(facts[1].textContent).toContain('не подтверждено — в текст не вошло');
  });

  test('«Это не так» walks the kind through its three values', async () => {
    const changes = [];
    draw({
      state: 'draft',
      blocked: null,
      brief: BRIEF,
      draftText: 'Текст.',
      onKindChange: (kind) => changes.push(kind),
    });
    await click(screen.getByRole('button', { name: 'Это не так' }));
    // Из «чужого поста» следующим по кругу идёт «мысль».
    expect(changes).toEqual(['thought']);
  });

  test('the slop check never runs before it is asked for', () => {
    draw({ state: 'draft', blocked: null, brief: BRIEF, draftText: 'Текст.' });
    const check = document.querySelector('[data-slop-check="true"]');
    expect(check.getAttribute('data-slop-verdict')).toBe('none');
    expect(check.textContent).toContain(
      'Проверка только показывает. Текст правите вы — в редакторе.'
    );
  });
});

describe('the questions, and the end of them', () => {
  const QUESTIONS = [
    {
      field: 'thesis',
      question: 'Что именно вы утверждаете?',
      options: ['Первый вариант', 'Второй вариант'],
    },
    { field: 'facts', question: 'На чём это стоит?', options: [] },
  ];

  test('both questions are visible at once, each with three ways to close it', () => {
    draw({ state: 'questions', blocked: null, questions: QUESTIONS });
    const card = document.querySelector('[data-intake-questions="true"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Два вопроса — и пишем');
    expect(card.querySelectorAll('[data-intake-question]')).toHaveLength(2);

    const first = card.querySelector('[data-intake-question="thesis"]');
    const options = within(first).getAllByRole('radio');
    expect(options.map((one) => one.textContent)).toEqual([
      'Первый вариант',
      'Второй вариант',
      'Свой ответ',
      'Реши сама',
    ]);
  });

  test('one question counts itself in Russian', () => {
    draw({ state: 'questions', blocked: null, questions: [QUESTIONS[0]] });
    expect(document.body.textContent).toContain('Один вопрос — и пишем');
  });

  test('«Написать» waits for an answer and says what it waits for', () => {
    draw({ state: 'questions', blocked: null, questions: QUESTIONS });
    const card = document.querySelector('[data-intake-questions="true"]');
    const write = within(card).getByRole('button', { name: 'Написать' });
    expect(write.disabled).toBe(true);
    expect(
      card.querySelector('[data-intake-block-reason="answers"]').textContent
    ).toBe('Ответьте или нажмите «Реши сама»');
    // «Реши всё сама» не ждёт ничего: человек не обязан знать ответ.
    expect(within(card).getByRole('button', { name: 'Реши всё сама' }).disabled).toBe(
      false
    );
  });

  test('«Свой ответ» opens a field, and the answer travels by field name', async () => {
    const sent = [];
    draw({
      state: 'questions',
      blocked: null,
      questions: QUESTIONS,
      onAnswer: (answers, decide) => sent.push({ answers, decide }),
    });
    const card = document.querySelector('[data-intake-questions="true"]');

    await click(
      within(card.querySelector('[data-intake-question="thesis"]')).getByRole(
        'radio',
        { name: 'Свой ответ' }
      )
    );
    const field = document.querySelector('[name="intake-answer-thesis"]');
    expect(field).not.toBeNull();
    await type(field, 'Свой тезис');

    // Второй вопрос отдан модели.
    await click(
      within(card.querySelector('[data-intake-question="facts"]')).getByRole(
        'radio',
        { name: 'Реши сама' }
      )
    );
    await click(within(card).getByRole('button', { name: 'Написать' }));

    expect(sent).toEqual([
      {
        answers: [{ field: 'thesis', text: 'Свой тезис' }],
        decide: ['facts'],
      },
    ]);
  });

  test('after two rounds the screen stops asking and offers a way out', () => {
    draw({ state: 'idle', blocked: null, roundsSpent: true, onManual: noop });
    const panel = document.querySelector('[data-intake-rounds-spent="true"]');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Больше спрашивать не будем');
    expect(
      within(panel).getByRole('button', { name: 'Заполнить бриф вручную' })
    ).toBeTruthy();
  });
});

describe('refusals a person can act on', () => {
  test('an incomplete answer says plainly that nothing was saved', () => {
    draw({
      state: 'error',
      blocked: null,
      errorTitle: 'Не написалось',
      errorMessage: 'Ответ пришёл неполным. Ничего не сохранено.',
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Не написалось');
    expect(alert.textContent).toContain('Ничего не сохранено.');
    expect(screen.getByRole('button', { name: 'Попробовать снова' })).toBeTruthy();
  });

  test('with no AI to call there is no form at all, only the reason', () => {
    draw({ state: 'restricted', restrictedReason: 'ИИ пока недоступен' });
    expect(document.body.textContent).toContain('Написать пока нечем');
    expect(document.body.textContent).toContain('ИИ пока недоступен');
    // Ни поля, ни кнопки: показать форму, которая ничего не даст, хуже, чем
    // объяснить, почему её нет.
    expect(document.querySelector('[name="intake-input"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Написать' })).toBeNull();
  });

  test('a reader sees the whole screen, disabled, with the reason above it', () => {
    draw({
      state: 'read-only',
      blocked: null,
      readOnlyNote: React.createElement('p', { id: 'note' }, 'Здесь только читают'),
    });
    expect(document.body.textContent).toContain('Здесь только читают');
    expect(document.querySelector('fieldset').disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Написать' }).disabled).toBe(true);
  });
});
