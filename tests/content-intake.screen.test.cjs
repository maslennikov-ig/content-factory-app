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
 *  - готового текста и квитанции здесь нет вовсе: с `m2eg.21` их рисует
 *    только страница заготовки, на которую экран уходит сам.
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
      blocked: 'input',
      restrictedReason: 'ИИ пока недоступен',
      onInputChange: noop,
      onToggleChannel: noop,
      onLanguageChange: noop,
      onWrite: noop,
      onCancel: noop,
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

describe('neutral intake', () => {
  test('even legacy selected channels never show a picker or a paid shortcut', () => {
    draw({ selectedIds: ['int-tg', 'int-vk'], blocked: null });
    expect(screen.queryByText('Куда')).toBeNull();
    expect(screen.queryByRole('button', { name: /Настроить: как пишем/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Сделать заготовку' })).toBeTruthy();
  });
});

describe('the run, and what it leaves on this screen', () => {
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

  /*
    `content-factory-next-m2eg.21`, хвост живого прогона 07.09.2026. Готовый
    текст, квитанция и проверка на штампы рисовались и здесь, и на странице
    заготовки. Экран уходит на неё сам, поэтому здешняя копия успевала только
    мигнуть между первым каналом и концом стрима — и вторая правка того же
    брифа в двух местах расходилась бы молча. Судится отсутствие: даже в
    состоянии `draft` на этом экране нет ни текста, ни расписки.
  */
  test('the finished text and its receipt are not drawn here at all', () => {
    draw({ state: 'draft', blocked: null });

    expect(document.querySelector('[data-intake-draft]')).toBeNull();
    expect(document.querySelector('[data-brief-receipt]')).toBeNull();
    expect(document.querySelector('[data-slop-check]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Открыть в редакторе' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Пересобрать' })).toBeNull();
  });

  test('the last frame here is the saved piece, and the field stays', () => {
    draw({
      state: 'draft',
      blocked: null,
      piece: { pieceId: 'piece-12', code: 'cnt-07' },
    });

    expect(
      document.querySelector('[data-intake-piece="cnt-07"]')
    ).not.toBeNull();
    expect(document.getElementById('intake-input')).not.toBeNull();
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
