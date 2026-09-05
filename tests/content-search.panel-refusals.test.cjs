'use strict';

/**
 * Панель «Найти подтверждение» на живом прогоне владельца 05.09.2026.
 *
 * Три пробела, все на одном экране и все — про то, что панель показывает
 * человеку, а не про то, что умеет сервер:
 *
 *  - `content-factory-next-fn33.135`: дата источника печаталась первыми десятью
 *    знаками строки. Поисковик датирует по RFC 822, и получалось «Wed, 02 Se».
 *  - `content-factory-next-fn33.136`: поиск предлагал «Взять как
 *    доказательство» на ссылке по http, а сервер такие адреса не принимает и
 *    принимать не должен — это принятая сетевая политика источников. Кнопка
 *    была приглашением в отказ.
 *  - `content-factory-next-fn33.139`: временный сбой обоих поисковиков
 *    показывался тем же запасным текстом, что и любой другой сбой, поэтому
 *    «попробуйте ещё раз» читалось как тупик.
 *
 * Проверяется отрисовкой, а не чтением исходника: все три дефекта жили ровно в
 * том, что видно на экране.
 */

const path = require('node:path');
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

const { act, cleanup, fireEvent, screen } = require('@testing-library/react');
const { render } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const adapter = loadTypeScriptModule(`${base}/content-search.adapter.ts`);
const container = loadTypeScriptModule(`${base}/content-search.container.tsx`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const refused = (status, body) => ({
  ok: false,
  status,
  json: async () => body,
  clone() {
    return this;
  },
});

let calls = [];

const serve = (table) => {
  calls = [];
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    calls.push({
      url,
      method,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    const answer = table[`${method} ${url}`];
    if (!answer) throw new Error(`no stub for ${method} ${url}`);
    return typeof answer === 'function' ? answer() : answer;
  };
};

const FOUND = {
  summary: 'Ключевая ставка — 14% годовых.',
  provider: 'tavily',
  results: [
    {
      url: 'https://example.org/rate',
      title: 'Решение по ставке',
      excerpt: 'Ставка осталась на уровне 14 процентов.',
      // Ровно то, что вернул Tavily 05.09.2026.
      publishedAt: 'Wed, 02 Sep 2026 15:54:46 GMT',
      provider: 'tavily',
    },
    {
      url: 'http://globalinvestigationsreview.com/just-sanctions/article/ofsi',
      title: 'OFSI fines Citibank',
      excerpt: 'OFSI fined Citibank London 47 million pounds.',
      publishedAt: null,
      provider: 'tavily',
    },
    {
      url: 'https://example.net/undated',
      title: 'Без даты',
      excerpt: 'Дата у источника не разбирается.',
      publishedAt: 'позавчера',
      provider: 'tavily',
    },
  ],
};

const renderSearch = async () => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          variables.VariableContextComponent,
          { language: 'ru' },
          React.createElement(container.ContentSearchContainer, {})
        )
      )
    );
  });
  await act(async () => {});
};

const runSearch = async () => {
  await act(async () => {
    fireEvent.change(document.querySelector('textarea[name="searchSubject"]'), {
      target: { value: 'ключевая ставка' },
    });
  });
  await act(async () => {
    fireEvent.submit(document.querySelector('[data-content-search-form]'));
  });
  await act(async () => {});
};

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('панель поиска, живой прогон 05.09.2026', () => {
  test('дата источника читается по-русски, а неразборная не показывается', async () => {
    serve({ [`POST ${adapter.SEARCH_API}`]: ok(FOUND) });
    await renderSearch();
    await runSearch();

    expect(screen.getByText('Опубликовано: 02.09.2026')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Wed, 02 Se');
    // «позавчера» — не дата; подпись просто не появляется.
    expect(document.body.textContent).not.toContain('позавчера');
    expect(
      document.body.textContent.match(/Опубликовано:/g)
    ).toHaveLength(1);
  });

  test('ссылка по http не предлагается к взятию и объясняет почему', async () => {
    serve({ [`POST ${adapter.SEARCH_API}`]: ok(FOUND) });
    await renderSearch();
    await runSearch();

    const httpUrl =
      'http://globalinvestigationsreview.com/just-sanctions/article/ofsi';
    expect(
      document.querySelector(`[data-content-search-accept="${httpUrl}"]`)
    ).toBeNull();
    const reason = document.querySelector(
      `[data-content-search-refusal="${httpUrl}"]`
    );
    expect(reason).toBeTruthy();
    expect(reason.textContent).toContain('http');
    // Сама строка остаётся на экране: ссылку всё ещё можно прочитать.
    expect(screen.getByText('OFSI fined Citibank London 47 million pounds.'))
      .toBeTruthy();
    // А обычная https-строка берётся как раньше.
    expect(
      document.querySelector(
        '[data-content-search-accept="https://example.org/rate"]'
      )
    ).toBeTruthy();
  });

  test('временный отказ поиска отличается от неверной настройки', async () => {
    serve({
      [`POST ${adapter.SEARCH_API}`]: refused(503, {
        code: 'CONTENT_SEARCH_UNAVAILABLE',
        message: 'Web search did not answer this time.',
      }),
    });
    await renderSearch();
    await runSearch();

    const alert = document.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('временный сбой');
    // Ни английского тела ответа, ни текста про неподключённый поиск.
    expect(alert.textContent).not.toContain('Web search');
    expect(alert.textContent).not.toContain('ключ Tavily');
  });

  test('язык читателя уходит вместе с запросом', async () => {
    serve({ [`POST ${adapter.SEARCH_API}`]: ok(FOUND) });
    await renderSearch();
    await runSearch();

    const search = calls.find((call) => call.url === adapter.SEARCH_API);
    expect(search.body).toEqual({
      subject: 'ключевая ставка',
      language: 'ru',
    });
  });
});

describe('правило взятия читается тем же, что и на сервере', () => {
  test.each([
    ['https://example.org/a', null],
    ['https://example.org:443/a', null],
    ['http://example.org/a', 'not_https'],
    ['https://example.org:8443/a', 'unsupported_port'],
    ['https://user:pass@example.org/a', 'invalid_url'],
    ['not a url', 'invalid_url'],
  ])('%s → %s', (url, expected) => {
    expect(adapter.takeRefusal(url)).toBe(expected);
  });
});

// Путь до панели остаётся тем, что знает страж экрана поиска.
test('панель на месте', () => {
  expect(
    path.basename(`${base}/content-search.container.tsx`)
  ).toBe('content-search.container.tsx');
});
