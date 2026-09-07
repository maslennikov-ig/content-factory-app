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
      brief: null,
      overrides: {},
      draftText: null,
      blocked: 'input',
      restrictedReason: 'ИИ пока недоступен',
      slopKey: 'k',
      onInputChange: noop,
      onToggleChannel: noop,
      onLanguageChange: noop,
      onWrite: noop,
      onCancel: noop,
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

  // `content-factory-next-tu3k.9`: дверь делает заготовку, и надпись на
  // кнопке зависит от выбора каналов. Без выбранного канала она обещает
  // ровно заготовку.
  test('the action is off and the reason stands beside it in words', () => {
    draw({ blocked: 'input' });
    const button = screen.getByRole('button', { name: 'Сделать заготовку' });
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
  test('a picked Telegram channel offers «Настроить: …»; VK does not', () => {
    draw({ selectedIds: ['int-tg', 'int-vk'], blocked: null });
    expect(
      screen.getByRole('button', {
        name: 'Настроить: как пишем в «Мой канал»',
      })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'Настроить: как пишем в «Сообщество»',
      })
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

describe('the questions left this screen with the wave', () => {
  /*
    `content-factory-next-m2eg`, живой прогон 07.09.2026. Заготовка теперь
    записывается до вопросов, экран уходит на её страницу, и уточнения живут
    там. Здесь судится отсутствие: карточки вопросов нет, тупика «больше
    спрашивать не будем» нет, а строка хода стоит рядом с кнопкой — это
    единственное, что человек видит, пока экран ещё здесь.
  */
  test('no question card and no dead end are drawn at all', () => {
    draw({ state: 'idle', blocked: null, onManual: noop });

    expect(document.querySelector('[data-intake-questions="true"]')).toBeNull();
    expect(document.querySelector('[data-piece-questions="true"]')).toBeNull();
    expect(document.querySelector('[data-intake-rounds-spent="true"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Больше спрашивать не будем');
  });

  test('the step in flight stands beside the button, not under the page', () => {
    draw({ state: 'streaming', step: 'writing', blocked: null });
    const step = document.querySelector('[data-intake-step="writing"]');
    const action = document.querySelector('[data-intake-action]');

    expect(step).not.toBeNull();
    // Один и тот же ряд: строка объясняет нажатую кнопку, а не страницу.
    expect(step.parentElement).toBe(action.parentElement);
  });

  test('the saved piece is named with its code and can be opened', async () => {
    const opened = [];
    draw({
      state: 'idle',
      blocked: null,
      piece: { pieceId: 'piece-12', code: 'cnt-07' },
      onOpenPiece: (id) => opened.push(id),
    });

    const line = document.querySelector('[data-intake-piece="cnt-07"]');
    expect(line.textContent).toContain('Заготовка сохранена — cnt-07');
    await click(within(line).getByRole('button', { name: 'Открыть заготовку' }));
    expect(opened).toEqual(['piece-12']);
  });

  test('a failed run offers the manual brief as the second way out', () => {
    draw({
      state: 'error',
      blocked: null,
      errorMessage: 'Текст не собрался.',
      onManual: noop,
    });
    expect(
      screen.getByRole('button', { name: 'Заполнить бриф вручную' })
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
    expect(screen.queryByRole('button', { name: 'Сделать заготовку' })).toBeNull();
  });

  test('a reader sees the whole screen, disabled, with the reason above it', () => {
    draw({
      state: 'read-only',
      blocked: null,
      readOnlyNote: React.createElement('p', { id: 'note' }, 'Здесь только читают'),
    });
    expect(document.body.textContent).toContain('Здесь только читают');
    expect(document.querySelector('fieldset').disabled).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Сделать заготовку' }).disabled
    ).toBe(true);
  });
});
