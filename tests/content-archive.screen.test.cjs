'use strict';

/**
 * «Что уже написали» — the archive, in the words a reader uses.
 *
 * Three things this screen got wrong at once during the owner's walkthrough of
 * 04.09.2026, and each of them is invisible to a backend test because the
 * route was answering correctly the whole time:
 *
 *  - the platform filter, the row and the «Занести текст» form printed `site`,
 *    `telegram`, `vk`, `newsletter` and `ru`/`en` — internal keys, in a screen
 *    whose recut panel two clicks away already named the same four platforms
 *    «Сайт», «Telegram», «ВКонтакте», «Рассылка»
 *    (`content-factory-next-fn33.83`).
 *  - a recut wrote a `DRAFT` version and the row went on reading «постов: 0»,
 *    so the new version existed in the database and nowhere a person looks
 *    (`content-factory-next-fn33.84`).
 *  - «Разбор» over a text written minutes ago answered with a sentence about
 *    the product's history — «написан до того, как черновик стал запоминать»
 *    (`content-factory-next-fn33.89`).
 *
 * The container is rendered against a stubbed `fetch`, the same shape
 * `brand-voice.materials-tab.test.cjs` uses, because all three are questions
 * about what reaches the screen rather than about what the route returns.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
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
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const FILE =
  'apps/frontend/src/components/content-intelligence/content-archive.container.tsx';

test('the archive container exists', () => {
  expect(fs.existsSync(path.join(root, FILE))).toBe(true);
});

if (!fs.existsSync(path.join(root, FILE))) return;

const container = loadTypeScriptModule(FILE);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
/**
 * Роль пришла в этот экран 05.09.2026 (`content-factory-next-fn33.90.8`):
 * «Занести текст» открыто редактору, и экран читает это из сеанса, а не ждёт
 * первого отказа. Набор ниже про слова и запросы, а не про роль, поэтому
 * рисует его администратором; роль проверяет `tests/content-archive.role.test.cjs`.
 */
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);

const ROW = Object.freeze({
  id: 'piece-1',
  code: 'cnt-01',
  title: 'Почему мы поменяли поставщика подшипников',
  format: 'длинный',
  postCount: 0,
  queuedCount: 0,
  draftCount: 2,
  date: '04.09.26',
  voiceVersion: 'v3',
  layer: 'MADE_HERE',
  platforms: ['telegram'],
  contentContextSnapshotId: null,
  origin: null,
});

const ARCHIVE = Object.freeze({
  state: 'default',
  materials: [ROW],
  page: 0,
  limit: 20,
  total: 1,
  counts: { MADE_HERE: 1, IMPORTED_PRE_PRODUCT: 0, PUBLISHED_ELSEWHERE: 0 },
});

// `content-factory-next-fn33.65`: the shared request helper hands the common
// refusal handler a copy of the response, so a fake answer has to be
// clonable the way a real `Response` is.
const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

let calls = [];

const serve = (answer = ARCHIVE) => {
  calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url, method: String(init.method || 'GET').toUpperCase() });
    return ok(answer);
  };
};

const renderArchive = async (language = 'ru') => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          userContext.UserContext.Provider,
          { value: { role: 'ADMIN' } },
          React.createElement(
            variables.VariableContextComponent,
            { language },
            React.createElement(container.ContentArchiveContainer)
          )
        )
      )
    );
  });
};

const click = async (element) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('the archive names platforms and languages the way a person does', () => {
  test('the filter offers «Сайт» and «ВКонтакте», not site and vk', async () => {
    serve();
    await renderArchive();

    const filter = document.querySelector('select[name="archivePlatformFilter"]');
    const labels = [...filter.options].map((option) => option.textContent);

    expect(labels).toContain('Сайт');
    expect(labels).toContain('ВКонтакте');
    expect(labels).toContain('Рассылка');
    expect(labels).not.toContain('site');
    expect(labels).not.toContain('vk');
    expect(labels).not.toContain('newsletter');
    // The values stay the keys: the filter is sent to the same route as before.
    expect([...filter.options].map((option) => option.value)).toContain('vk');
  });

  test('the row is labelled with the platform’s name', async () => {
    serve();
    await renderArchive();

    const row = document.querySelector('[data-content-archive-row="piece-1"]');
    expect(within(row).getByText('Telegram')).toBeTruthy();
    expect(within(row).queryByText('telegram')).toBeNull();
  });

  test('«Занести текст» asks for a language in words and a platform by name', async () => {
    serve();
    await renderArchive();

    await click(screen.getByRole('button', { name: 'Занести текст' }));

    const language = document.querySelector(
      'select[name="archive-import-language"]'
    );
    expect([...language.options].map((option) => option.textContent)).toEqual([
      'Русский',
      'Английский',
    ]);
    // And the values are still what the route reads.
    expect([...language.options].map((option) => option.value)).toEqual([
      'ru',
      'en',
    ]);

    const platform = document.querySelector(
      'select[name="archive-import-platform"]'
    );
    expect(
      [...platform.options].map((option) => option.textContent)
    ).toContain('ВКонтакте');
  });
});

describe('a version made by a recut is visible on the row', () => {
  test('drafts are counted beside posts rather than folded into them', async () => {
    // `content-factory-next-fn33.84`: five `DRAFT` derivations and the row
    // still read «постов: 0», because only `PUBLISHED` and `QUEUED` were
    // counted anywhere.
    serve();
    await renderArchive();

    const row = document.querySelector('[data-content-archive-row="piece-1"]');
    // `content-factory-next-fn33.54` moved the counter to «0 постов» — the
    // count first and the word in its own form — so the row is read here in
    // that wording rather than in the one it replaced.
    expect(within(row).getByText('0 постов')).toBeTruthy();
    expect(within(row).getByText('черновиков: 2')).toBeTruthy();
  });
});

describe('«Разбор» says what is true of the row', () => {
  test('a text with no recorded context is not blamed on the product’s age', async () => {
    // `content-factory-next-fn33.89`: this sentence was printed over drafts
    // that were minutes old, which reads as a fact about the text and is a
    // guess about the product.
    serve();
    await renderArchive();

    const row = document.querySelector('[data-content-archive-row="piece-1"]');
    await click(within(row).getByRole('button', { name: 'Разбор' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).not.toContain('до того, как черновик стал');
    expect(dialog.textContent).toContain('Список фактов для этого текста не записан');
  });
});

/* -------------------------------------------------------------------------
 * Поиск по словам (`content-factory-next-odb8.4`, решение владельца 05.09.2026)
 * ---------------------------------------------------------------------- */

describe('архив спрашивает сервер словами, а не прячет строки у себя', () => {
  const searchField = () =>
    document.querySelector('input[name="archiveSearch"]');

  const type = async (value) => {
    await act(async () => {
      fireEvent.change(searchField(), { target: { value } });
    });
  };

  const waitDebounce = async () => {
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await act(async () => {});
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('поле стоит рядом с остальными фильтрами и подписано', async () => {
    serve();
    await renderArchive();

    const field = searchField();
    expect(field).not.toBeNull();
    expect(field.getAttribute('type')).toBe('search');
    expect(field.getAttribute('aria-label')).toBe('Искать по словам');
  });

  test('набранное уходит в q после задержки, а не на каждый символ', async () => {
    serve();
    await renderArchive();
    calls.length = 0;

    await type('под');
    await type('подши');
    await type('подшипники');
    // Пока человек печатает, вопрос не задаётся ни разу.
    expect(calls).toEqual([]);

    await waitDebounce();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`q=${encodeURIComponent('подшипники')}`);
    // И это по-прежнему один и тот же список, а не отдельный маршрут поиска.
    expect(calls[0].url).toContain('/content-intelligence/materials?');
  });

  test('очищенное поле возвращает прежний вопрос, без пустого q', async () => {
    serve();
    await renderArchive();

    await type('подшипники');
    await waitDebounce();
    const asked = calls.at(-1).url;
    expect(asked).toContain('q=');

    await type('');
    await waitDebounce();

    // `q=` без значения — это уже другой вопрос и другой ключ кэша, поэтому
    // пустое поле спрашивает ровно тот адрес, что и до поиска. Здесь он
    // берётся из кэша SWR и нового запроса не делает — важно, что ни один
    // заданный вопрос не несёт пустого `q`.
    for (const call of calls) {
      expect(call.url).not.toMatch(/q=(&|$)/);
    }
    const row = document.querySelector('[data-content-archive-row="piece-1"]');
    expect(row).not.toBeNull();
  });

  test('поиск возвращает на первую страницу', async () => {
    // Третья страница прежнего вопроса к новому вопросу отношения не имеет.
    serve({ ...ARCHIVE, total: 60 });
    await renderArchive();

    await click(screen.getByRole('button', { name: 'Дальше' }));
    calls.length = 0;

    await type('подшипники');
    await waitDebounce();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain('page=');
  });

  test('ничего не найдено — своя фраза, и поле остаётся на экране', async () => {
    serve();
    await renderArchive();

    global.fetch = async (url, init = {}) => {
      calls.push({ url, method: String(init.method || 'GET').toUpperCase() });
      return ok({
        ...ARCHIVE,
        state: 'filtered-empty',
        materials: [],
        total: 0,
      });
    };

    await type('подшипники');
    await waitDebounce();

    expect(document.body.textContent).toContain('По этим условиям ничего нет');
    // Поле никуда не делось: иначе человек с опечаткой теряет вместе с
    // ответом и то, чем мог бы её поправить.
    expect(searchField()).not.toBeNull();
    expect(searchField().value).toBe('подшипники');
  });

  test('найденные слова подсвечены через <mark> с токенами темы', async () => {
    serve();
    await renderArchive();

    await type('поставщика');
    await waitDebounce();

    const marks = [...document.querySelectorAll('mark')];
    expect(marks.map((mark) => mark.textContent.toLocaleLowerCase())).toContain(
      'поставщика'
    );
    for (const mark of marks) {
      // Токены темы и только они: `<mark>` в браузере жёлтый по умолчанию,
      // а жёлтый по умолчанию — это цвет мимо темы и нечитаемый на тёмном.
      expect(mark.className).toMatch(/cf-/);
      expect(mark.className).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });
});
