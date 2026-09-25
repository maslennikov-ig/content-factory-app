/**
 * Заголовок раздела над содержимым и текущий язык.
 *
 * `content-factory-next-fn33.114`. При первом заходе в чистом браузере куки
 * `i18next` ещё нет, сервер берёт `fallbackLng = en`, а язык профиля применяет
 * уже браузер — `LanguageFromProfile` зовёт `i18next.changeLanguage`. Меню и
 * подписи после этого становились русскими, а заголовок над содержимым — нет:
 * он помнил первое вычисленное имя, потому что `useMemo` перечислял в
 * зависимостях только адрес. То же самое было и при ручном переключении языка —
 * на один рендер заголовок отставал.
 *
 * Здесь проверяется именно перерисовка. `useMenuItem` подменён на такой же
 * договор, какой даёт `react-i18next`: имена берутся из текущего языка, а смена
 * языка будит подписчиков. Адрес при этом не меняется — в том и была ловушка.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});

for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => dom.window[key],
  });
}
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ts = require('typescript');
const { act, cleanup, render, screen } = require('@testing-library/react');

const h = React.createElement;
const repositoryRoot = path.resolve(__dirname, '..');
const componentFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/layout/title.tsx'
);

const NAMES = {
  en: { '/launches': 'Calendar', '/content': 'Content', '/content?tab=avatars': 'Avatar', '/onboarding': 'Where to start' },
  ru: { '/launches': 'Календарь', '/content': 'Контент', '/content?tab=avatars': 'Аватар', '/onboarding': 'С чего начать' },
};

let language = 'en';
let pathname = '/launches';
let searchParams = new URLSearchParams();
const listeners = new Set();

/**
 * Ровно то, что делает `useTranslation`: возвращает строки текущего языка и
 * перерисовывает подписчика на `languageChanged`.
 */
const useMenuItem = () => {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const listener = () => force((tick) => tick + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return {
    all: Object.entries(NAMES[language]).map(([itemPath, name]) => ({
      path: itemPath,
      name,
      hide: itemPath === '/onboarding',
    })),
  };
};

const changeLanguage = (next) => {
  language = next;
  act(() => {
    for (const listener of listeners) listener();
  });
};

const mocks = {
  'next/navigation': { usePathname: () => pathname, useSearchParams: () => searchParams },
  '@contentfactory/frontend/components/layout/top.menu': { useMenuItem },
};

const compiled = ts.transpileModule(fs.readFileSync(componentFile, 'utf8'), {
  fileName: componentFile,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const loaded = { exports: {} };
new Function(
  'exports',
  'require',
  'module',
  '__filename',
  '__dirname',
  compiled
)(
  loaded.exports,
  (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request),
  loaded,
  componentFile,
  path.dirname(componentFile)
);
const { Title } = loaded.exports;

beforeEach(() => {
  language = 'en';
  pathname = '/launches';
  searchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  listeners.clear();
});

test('the heading follows the language the profile brought, without a reload', () => {
  render(h(Title, {}));
  expect(screen.getByRole('heading').textContent).toBe('Calendar');

  changeLanguage('ru');

  expect(screen.getByRole('heading').textContent).toBe('Календарь');
});

test('and it follows a language changed back by hand', () => {
  language = 'ru';
  render(h(Title, {}));
  expect(screen.getByRole('heading').textContent).toBe('Календарь');

  changeLanguage('en');

  expect(screen.getByRole('heading').textContent).toBe('Calendar');
});

test('a different section still gets its own name', () => {
  pathname = '/content';
  render(h(Title, {}));
  expect(screen.getByRole('heading').textContent).toBe('Content');

  changeLanguage('ru');

  expect(screen.getByRole('heading').textContent).toBe('Контент');
});

test('avatar query wins over content and follows language and tab changes', () => {
  pathname = '/content';
  searchParams = new URLSearchParams('tab=avatars&sort=title:asc');
  const view = render(h(Title, {}));
  expect(screen.getByRole('heading').textContent).toBe('Avatar');
  changeLanguage('ru');
  expect(screen.getByRole('heading').textContent).toBe('Аватар');
  searchParams = new URLSearchParams('tab=materials');
  view.rerender(h(Title, {}));
  expect(screen.getByRole('heading').textContent).toBe('Контент');
});

test('completed onboarding retains its upper title even when hidden from navigation', () => {
  pathname = '/onboarding';
  language = 'ru';
  render(h(Title, {}));
  expect(screen.getByRole('heading').textContent).toBe('С чего начать');
});

test('piece detail keeps the content section and route lookalikes do not match', () => {
  pathname = '/content/pieces/example';
  const view = render(h(Title, {}));
  expect(screen.getByRole('heading').textContent).toBe('Content');
  pathname = '/content-unknown';
  view.rerender(h(Title, {}));
  expect(screen.queryByRole('heading')).toBeNull();
});

/**
 * 2q28.28: at 390 px «С чего начать» wrapped inside the 56 px header and was
 * cut to «С чего нача». The global `h1 { text-wrap: balance }` reset the
 * `nowrap` the wrapper passed down, so the heading truncates itself.
 */
test('the section heading stays one line and ends in an ellipsis on a phone', () => {
  pathname = '/onboarding';
  language = 'ru';
  render(h(Title, {}));
  const heading = screen.getByRole('heading', { level: 1 });
  expect(heading.className.split(' ')).toContain('truncate');
  expect(heading.getAttribute('title')).toBe('С чего начать');

  const fs = require('node:fs');
  const path = require('node:path');
  const selector = fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'apps/frontend/src/components/layout/organization.selector.tsx'
    ),
    'utf8'
  );
  // The workspace name beside it yields room below `sm`.
  expect(selector).toContain('max-w-[96px] sm:max-w-[180px]');
});
