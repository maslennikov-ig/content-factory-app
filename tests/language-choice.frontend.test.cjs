/**
 * The language flag, and where the choice is kept.
 *
 * `content-factory-next-fn33.53`. Choosing Russian used to write a browser
 * cookie and nothing else: the account row stayed `en`, so every letter the
 * server sent stayed English, and the next device came up English too.
 *
 * Two halves are checked here. Going out: a signed-in browser also tells the
 * server, and a browser with no account — the sign-in screen — only sets the
 * cookie, because there is nobody to save it to. Coming in: a browser that has
 * never seen this account picks the language up from the profile, once, and
 * never puts back a language the person has just changed away from.
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
const { cleanup, fireEvent, render, screen } = require('@testing-library/react');

const h = React.createElement;
const repositoryRoot = path.resolve(__dirname, '..');
const componentFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/layout/language.component.tsx'
);

let cookie = '';
let account = { id: 'walker' };
const requests = [];
const changed = [];
const closeCurrent = jest.fn();
const openModal = jest.fn();

const appFetch = jest.fn(async (url, options = {}) => {
  requests.push({
    url,
    method: options.method || 'GET',
    body: options.body ? JSON.parse(options.body) : undefined,
  });
  return { ok: true, status: 200, json: async () => ({}) };
});

/** The cookie hook, reduced to a value this test can read and re-render on. */
const useCookie = (_name, initial) => {
  const [, force] = React.useState(0);
  return [
    cookie || initial,
    (value) => {
      cookie = value;
      force((tick) => tick + 1);
    },
  ];
};

const mocks = {
  'react-use-cookie': { __esModule: true, default: useCookie },
  'react-country-flag': { __esModule: true, default: () => null },
  i18next: {
    __esModule: true,
    default: {
      get resolvedLanguage() {
        return cookie || 'en';
      },
      changeLanguage: (language) => changed.push(language),
    },
  },
  '@mantine/core': {
    Text: ({ weight: _weight, children }) => h('span', {}, children),
    List: ({ children }) => h('ul', {}, children),
    Box: ({ children }) => h('div', {}, children),
    Group: ({ children }) => h('div', {}, children),
  },
  '@contentfactory/react/translation/i18n.config': {
    cookieName: 'i18next',
    fallbackLng: 'en',
    languages: ['en', 'ru', 'he'],
    languageDirection: (language) =>
      ['he', 'ar'].includes(language) ? 'rtl' : 'ltr',
  },
  '@contentfactory/frontend/components/layout/language.presentation': {
    getCountryCodeForFlag: () => 'US',
    // The id itself is the visible label here: the test clicks what it names.
    getLanguageName: (language) => language,
    getLanguageLabel: (language) => language,
  },
  '@contentfactory/frontend/components/layout/new-modal': {
    useModals: () => ({ closeCurrent, openModal }),
  },
  // The shared primitive, reduced to the element it renders. What this test
  // needs from it is exactly what the accessibility tree needs: a real
  // `<button>` carrying the props the call site hands over.
  '@contentfactory/react/form/button': {
    Button: ({
      children,
      iconOnly: _iconOnly,
      variant: _variant,
      size: _size,
      loading: _loading,
      density: _density,
      layout: _layout,
      innerClassName: _innerClassName,
      ...rest
    }) => h('button', rest, children),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (_key, fallback) => fallback,
  },
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => appFetch },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => account,
  },
  '../new-launch/modal.wrapper.component': { ModalWrapperComponent: () => null },
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
const { ChangeLanguageComponent, LanguageFromProfile, LanguageComponent } =
  loaded.exports;

beforeEach(() => {
  cookie = '';
  account = { id: 'walker' };
  requests.length = 0;
  changed.length = 0;
  appFetch.mockClear();
  closeCurrent.mockClear();
  openModal.mockClear();
  document.documentElement.removeAttribute('dir');
});

afterEach(() => cleanup());

test('a signed-in browser saves the choice on the account, not only in the cookie', async () => {
  render(h(ChangeLanguageComponent, {}));

  fireEvent.click(screen.getByText('ru'));

  expect(cookie).toBe('ru');
  expect(changed).toEqual(['ru']);
  expect(requests).toEqual([
    { url: '/user/language', method: 'POST', body: { language: 'ru' } },
  ]);
});

test('a right-to-left choice still turns the page around', () => {
  render(h(ChangeLanguageComponent, {}));

  fireEvent.click(screen.getByText('he'));

  expect(document.documentElement.getAttribute('dir')).toBe('rtl');
});

test('with no account signed in the choice stays in the cookie', () => {
  account = undefined;

  render(h(ChangeLanguageComponent, {}));
  fireEvent.click(screen.getByText('ru'));

  expect(cookie).toBe('ru');
  expect(changed).toEqual(['ru']);
  expect(requests).toEqual([]);
});

test('the interface changes language even when the save is refused', () => {
  appFetch.mockImplementationOnce(async () => {
    throw new Error('offline');
  });

  render(h(ChangeLanguageComponent, {}));
  fireEvent.click(screen.getByText('ru'));

  expect(cookie).toBe('ru');
  expect(changed).toEqual(['ru']);
});

test('a browser that has not seen this account takes the language from the profile', () => {
  render(h(LanguageFromProfile, { language: 'ru' }));

  expect(cookie).toBe('ru');
  expect(changed).toEqual(['ru']);
});

test('a profile without a language, or one we do not ship, changes nothing', () => {
  render(h(LanguageFromProfile, { language: null }));
  render(h(LanguageFromProfile, { language: 'klingon' }));

  expect(cookie).toBe('');
  expect(changed).toEqual([]);
});

/**
 * `content-factory-next-fn33.120`: the flag in the header was a `div` with an
 * `onClick`.
 *
 * It sat in a row of real buttons — administration, theme, workspace — and was
 * the only one a keyboard could not reach and a screen reader could not name:
 * the flag's `title` said «Русский», which is the current value, not what
 * pressing it does. Both halves are checked here, because a control that opens
 * a window the keyboard cannot then use is only half reachable.
 */
describe('the language control is a control', () => {
  test('the header flag is a button that says what it does', () => {
    render(h(LanguageComponent, {}));

    const control = screen.getByRole('button', { name: 'Change Language' });
    expect(control.tagName).toBe('BUTTON');
    // A real button is operated by Enter and Space without a key handler; a
    // `div` with a `tabindex` bolted on is what this replaced.
    expect(control.getAttribute('tabindex')).toBeNull();

    fireEvent.click(control);
    expect(openModal).toHaveBeenCalledTimes(1);
    expect(openModal.mock.calls[0][0].title).toBe('Change Language');
  });

  test('every language inside the window is reachable the same way', () => {
    render(h(ChangeLanguageComponent, {}));

    for (const language of ['en', 'ru', 'he']) {
      expect(screen.getByRole('button', { name: language }).tagName).toBe(
        'BUTTON'
      );
    }

    fireEvent.click(screen.getByRole('button', { name: 'ru' }));
    expect(cookie).toBe('ru');
  });

  test('the current language is stated, not only drawn', () => {
    cookie = 'ru';
    render(h(ChangeLanguageComponent, {}));

    expect(
      screen.getByRole('button', { name: 'ru' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'en' }).getAttribute('aria-pressed')
    ).toBe('false');
  });
});

test('a stale profile does not undo a language just chosen here', () => {
  // The browser and the profile agree at first, so the sync has nothing to do.
  cookie = 'en';
  const { rerender } = render(h(LanguageFromProfile, { language: 'en' }));

  // The person switches to Russian; the cached profile still says English.
  cookie = 'ru';
  rerender(h(LanguageFromProfile, { language: 'en' }));

  expect(cookie).toBe('ru');
  expect(changed).toEqual([]);
});
