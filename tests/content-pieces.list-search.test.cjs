'use strict';

/**
 * Поиск в списке заготовок: каретка остаётся в поле.
 *
 * `content-factory-next-m2eg.11`. На живом прогоне 07.09.2026 поле поиска
 * теряло фокус после первой же буквы, и владелец печатал слово по одному
 * символу, каждый раз возвращая курсор мышью.
 *
 * Причина была не в поле. Ключ SWR собирался прямо из `filters.q`, поэтому
 * менялся на каждое нажатие клавиши; пока новый ответ ехал, `list.data` был
 * пуст, экран уходил в `state="loading"` и подменял весь блок управления
 * скелетоном — вместе с полем, в котором стояла каретка. React снимал узел с
 * фокусом и рисовал на его месте другой.
 *
 * Отсюда три проверки, и все три про одно и то же:
 *
 *  - поле остаётся `document.activeElement` после нескольких букв подряд;
 *  - скелетон показывается ровно один раз, до первого ответа, и больше не
 *    возвращается;
 *  - на сервер уходит один запрос на слово, а не один на букву.
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

const { act, cleanup, fireEvent, render } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const container = loadTypeScriptModule(`${base}/pieces/pieces.container.tsx`);
const adapter = loadTypeScriptModule(`${base}/pieces/pieces.adapter.ts`);
const words = loadTypeScriptModule(`${base}/content-search-words.tsx`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);
const fixture = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/pieces.fixture.ts'
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

let asked = [];

const envelope = {
  state: 'default',
  columns: fixture.PIECES_FIXTURE_COLUMNS,
  pieces: fixture.PIECE_FIXTURE_ROWS,
};

beforeEach(() => {
  asked = [];
  global.fetch = async (url) => {
    asked.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => envelope,
      clone() {
        return this;
      },
    };
  };
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

const panel = () => document.querySelector('[data-content-panel="pieces"]');
const stateNow = () => panel() && panel().getAttribute('data-piece-state');
const field = () => document.querySelector('input[name="pieces-search"]');

/** Прокрутить очередь микрозадач, не двигая часы. */
const settle = async (until = () => true) => {
  for (let tick = 0; tick < 60; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (until()) return;
  }
};

const open = async () => {
  const view = render(
    React.createElement(
      SWRConfig,
      { value: { provider: () => new Map(), dedupingInterval: 0 } },
      React.createElement(
        userContext.UserContext.Provider,
        { value: { role: 'ADMIN' } },
        React.createElement(
          variables.VariableContextComponent,
          { language: 'ru' },
          React.createElement(container.PiecesContainer)
        )
      )
    )
  );
  await settle(() => stateNow() === 'default');
  return view;
};

/** Дописать букву так, как это делает браузер: в поле, которое уже в фокусе. */
const type = async (text) => {
  for (const letter of text) {
    const input = field();
    input.focus();
    await act(async () => {
      fireEvent.change(input, { target: { value: input.value + letter } });
    });
  }
};

/** Дать задержке ввода истечь. */
const waitForDebounce = async () => {
  await act(async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, words.SEARCH_DEBOUNCE_MS + 60)
    );
  });
  await settle();
};

describe('поиск по заготовкам не отбирает каретку', () => {
  test('поле остаётся в фокусе после слова, набранного подряд', async () => {
    await open();
    const before = asked.length;

    await type('дедлайн');

    expect(field()).not.toBeNull();
    expect(document.activeElement).toBe(field());
    expect(field().value).toBe('дедлайн');
    // Ни одной подмены на скелетон посреди набора.
    expect(stateNow()).toBe('default');

    await waitForDebounce();

    expect(document.activeElement).toBe(field());
    expect(stateNow()).toBe('default');
    // Один запрос на слово. До задержки их было по одному на букву.
    expect(asked.length - before).toBe(1);
    expect(asked[asked.length - 1]).toContain(
      encodeURIComponent('дедлайн')
    );
  });

  test('скелетон бывает только до первого ответа', async () => {
    let firstAnswer;
    const held = new Promise((resolve) => {
      firstAnswer = resolve;
    });
    let first = true;
    global.fetch = async (url) => {
      asked.push(String(url));
      if (first) {
        first = false;
        await held;
      }
      return {
        ok: true,
        status: 200,
        json: async () => envelope,
        clone() {
          return this;
        },
      };
    };

    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          userContext.UserContext.Provider,
          { value: { role: 'ADMIN' } },
          React.createElement(
            variables.VariableContextComponent,
            { language: 'ru' },
            React.createElement(container.PiecesContainer)
          )
        )
      )
    );
    await settle(() => panel() !== null);

    // До первого ответа скелетон уместен: показывать нечего.
    expect(stateNow()).toBe('loading');
    expect(field()).toBeNull();

    firstAnswer();
    await settle(() => stateNow() === 'default');

    await type('дед');
    await waitForDebounce();

    // Прежний список остаётся на экране, пока едет новый: `keepPreviousData`.
    expect(stateNow()).toBe('default');
    expect(document.querySelector('[data-piece-cards]')).not.toBeNull();
  });

  test('строка отбирается и подсвечивается по одному и тому же слову', async () => {
    await open();
    await type('дедлайн');
    await waitForDebounce();

    const marks = [...document.querySelectorAll('mark')];
    for (const mark of marks) {
      expect(mark.textContent.toLocaleLowerCase()).toContain('дедлайн');
    }
    // Отбор идёт по успокоившемуся запросу — тому же, что уехал на сервер.
    expect(adapter.piecesListUrl({ ...adapter.emptyPiecesFilters, q: 'дедлайн' })).toBe(
      asked[asked.length - 1]
    );
  });
});
