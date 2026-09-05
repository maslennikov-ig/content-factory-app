'use strict';

/**
 * `content-factory-next-fn33.77`: заголовок вкладки браузера всегда был
 * по-английски.
 *
 * Каждый маршрут отдавал статический `metadata` с английским `title`. Такой
 * экспорт вычисляется один раз, без запроса, и языка знать не может — поэтому
 * рядом с полностью русской страницей вкладка говорила «Calendar · Content
 * Factory». Заголовок теперь собирает `generateMetadata` через общий помощник
 * `pageTitle`, который читает язык того же запроса.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'apps/frontend/src/app');
const read = (absolute) => fs.readFileSync(absolute, 'utf8');

const routeFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'page.tsx' || entry.name === 'layout.tsx')
      routeFiles.push(full);
  }
};
walk(appDir);

// `content-factory-next-fn33.94`: раньше здесь стоял список отложенных
// префиксов — `/auth/`, `/admin/`, `/oauth/`. Они больше не отложены, и три
// названы поимённо ниже: маршрут под этими префиксами обязан брать заголовок у
// того же помощника, что и остальные.
const LATE_ARRIVALS = ['/auth/', '/admin/', '/oauth/'];

const translated = routeFiles.filter(
  (file) => !file.includes('(stand)') && !file.includes('(public)')
);

describe('the browser tab speaks the language of the page', () => {
  test('the helper resolves the title through the request language', () => {
    const helper = read(path.join(appDir, 'page-title.ts'));
    expect(helper).toMatch(
      /import \{ getT \} from '@contentfactory\/react\/translation\/get\.translation\.service\.backend';/
    );
    expect(helper).toMatch(/const t = await getT\(\);/);
    expect(helper).toMatch(/title: String\(t\(key, fallback\)\)/);
  });

  test('no app route still hard-codes an English title in a static export', () => {
    const offenders = translated.filter((file) =>
      /export const metadata: Metadata = \{\n {2}title: '/.test(read(file))
    );
    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
  });

  test('the named routes go through the shared helper, not a copied body', () => {
    const named = {
      '(app)/(site)/launches/page.tsx': "pageTitle('calendar', 'Calendar')",
      '(app)/(site)/settings/page.tsx': "pageTitle('settings', 'Settings')",
      '(app)/(site)/third-party/page.tsx':
        "pageTitle('integrations', 'Integrations')",
      '(app)/(site)/media/page.tsx': "pageTitle('media', 'Media')",
    };

    for (const [relative, call] of Object.entries(named)) {
      const source = read(path.join(appDir, relative));
      expect(source).toContain(`export const generateMetadata = ${call};`);
      expect(source).toContain(
        "import { pageTitle } from '@contentfactory/frontend/app/page-title';"
      );
      expect(source).not.toContain('await getT()');
    }
  });

  test('every key a route asks for exists in Russian and reads as Russian', () => {
    const ru = JSON.parse(
      read(
        path.join(
          root,
          'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
        )
      )
    );

    const used = new Set();
    for (const file of translated) {
      for (const match of read(file).matchAll(
        /pageTitle\('([^']+)', '([^']+)'\)/g
      )) {
        used.add(`${match[1]}\u0000${match[2]}`);
      }
    }

    expect(used.size).toBeGreaterThan(10);
    for (const pair of used) {
      const [key, fallback] = pair.split('\u0000');
      expect(typeof ru[key]).toBe('string');
      expect(ru[key]).not.toBe(fallback);
      expect(ru[key]).toMatch(/[А-Яа-я]/);
    }
  });

  test('sign-in, administration and OAuth are no longer exempt', () => {
    const late = translated.filter((file) =>
      LATE_ARRIVALS.some((fragment) => file.includes(fragment))
    );

    // Каждый из трёх префиксов представлен: список не должен тихо опустеть,
    // если маршрут переедет.
    for (const fragment of LATE_ARRIVALS) {
      expect(late.some((file) => file.includes(fragment))).toBe(true);
    }

    const offenders = late.filter((file) => {
      const source = read(file);
      if (!/export const (metadata|generateMetadata)/.test(source)) return false;
      return !/export const generateMetadata = pageTitle\('[^']+', '[^']+'\);/.test(
        source
      );
    });

    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
  });

  test('the tab and the menu call the Content section by one name', () => {
    // `content-factory-next-fn33.117`: вкладка говорила «Содержание», а меню и
    // заголовок — «Контент». Ключ `content` — это подпись поля подписи, у неё
    // своя жизнь; имя раздела живёт в `content_section`.
    const menu = read(
      path.join(root, 'apps/frontend/src/components/layout/top.menu.tsx')
    );
    const menuKey = /name: t\('([^']+)', '[^']*'\),\n\s+icon:[\s\S]{0,4000}?path: '\/content',/.exec(
      menu
    );
    expect(menuKey && menuKey[1]).toBe('content_section');

    const page = read(path.join(appDir, '(app)/(site)/content/page.tsx'));
    expect(page).toContain(
      "export const generateMetadata = pageTitle('content_section', 'Content');"
    );
  });

  test('the root layout still supplies the product half of the title', () => {
    const layout = read(path.join(appDir, '(app)/layout.tsx'));
    expect(layout).toContain("template: '%s · Content Factory'");
  });
});

/**
 * `content-factory-next-fn33.122`: the tab stayed English on a first sign-in.
 *
 * The title above is resolved from the `i18next` cookie. A browser that has
 * just signed in for the first time has no such cookie, so the page is built in
 * whatever the browser asked for and the profile language is applied a moment
 * later, in the browser. Everything rendered follows; the tab cannot, because
 * the response is finished and the title left as a plain string.
 *
 * The fix carries the key into the head and re-resolves it in the browser on
 * `languageChanged`. What is checked here is that there is exactly one place a
 * key is written — the route file — and that the browser reads it back rather
 * than carrying a second table.
 */
describe('the tab follows a language chosen after the page arrived', () => {
  const contract = read(path.join(appDir, 'page-title.contract.ts'));
  const client = read(path.join(appDir, 'page-title.client.tsx'));
  const helper = read(path.join(appDir, 'page-title.ts'));

  const metaName = (constant) => {
    const found = new RegExp(`${constant} = '([^']+)'`).exec(contract);
    expect(found).not.toBeNull();
    return found[1];
  };

  test('the server states the key it used in the page head', () => {
    expect(helper).toMatch(/PAGE_TITLE_KEY_META\]: key/);
    expect(helper).toMatch(/PAGE_TITLE_FALLBACK_META\]: fallback/);
    // The names come from the shared contract, not from a literal on each side.
    expect(helper).toContain(
      "from '@contentfactory/frontend/app/page-title.contract'"
    );
    expect(client).toContain(
      "from '@contentfactory/frontend/app/page-title.contract'"
    );
  });

  test('the browser carries no second table of keys', () => {
    // A route-to-key map copied into the client is the failure this guards
    // against: two dozen route files already hold that list.
    for (const key of ['calendar', 'settings', 'integrations', 'media']) {
      expect(client).not.toContain(`'${key}'`);
    }
    expect(client).toMatch(/languageChanged/);
  });

  test('the product half of the title is read the same on both sides', () => {
    const suffix = /PRODUCT_TITLE_SUFFIX = '([^']+)'/.exec(contract);
    expect(suffix).not.toBeNull();
    const layout = read(path.join(appDir, '(app)/layout.tsx'));
    expect(layout).toContain(`template: '%s${suffix[1]}'`);
  });

  test('the companion is mounted where the profile language is applied', () => {
    const shell = read(
      path.join(root, 'apps/frontend/src/components/new-layout/layout.component.tsx')
    );
    expect(shell).toContain('<PageTitleLanguage />');
    expect(shell).toContain(
      "import { PageTitleLanguage } from '@contentfactory/frontend/app/page-title.client';"
    );
  });

  describe('running in a browser', () => {
    const { JSDOM } = require('jsdom');
    const ts = require('typescript');
    const React = require('react');

    const dom = new JSDOM(
      '<!doctype html><html><head>' +
        `<meta name="${metaName('PAGE_TITLE_KEY_META')}" content="calendar">` +
        `<meta name="${metaName('PAGE_TITLE_FALLBACK_META')}" content="Calendar">` +
        '<title>Calendar · Content Factory</title></head><body></body></html>',
      { pretendToBeVisual: true, url: 'http://localhost/launches' }
    );
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
    const { act, cleanup, render } = require('@testing-library/react');

    /** i18next, reduced to the two things this component uses. */
    const listeners = new Set();
    const dictionary = {
      en: { calendar: 'Calendar' },
      ru: { calendar: 'Календарь' },
    };
    let language = 'en';
    const i18next = {
      t: (key, fallback) => dictionary[language]?.[key] ?? fallback,
      on: (_event, handler) => listeners.add(handler),
      off: (_event, handler) => listeners.delete(handler),
    };
    const changeLanguage = (next) => {
      language = next;
      act(() => {
        for (const handler of listeners) handler();
      });
    };

    const file = path.join(appDir, 'page-title.client.tsx');
    const compiled = ts.transpileModule(read(file), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const mocks = {
      '@contentfactory/react/translation/i18next': {
        __esModule: true,
        default: i18next,
      },
      '@contentfactory/frontend/app/page-title.contract': {
        PAGE_TITLE_KEY_META: metaName('PAGE_TITLE_KEY_META'),
        PAGE_TITLE_FALLBACK_META: metaName('PAGE_TITLE_FALLBACK_META'),
        PRODUCT_TITLE_SUFFIX: ' · Content Factory',
        composePageTitle: (name) => `${name} · Content Factory`,
      },
    };
    const loaded = { exports: {} };
    new Function('exports', 'require', 'module', compiled)(
      loaded.exports,
      (request) =>
        Object.prototype.hasOwnProperty.call(mocks, request)
          ? mocks[request]
          : require(request),
      loaded
    );
    const { PageTitleLanguage } = loaded.exports;

    afterEach(() => {
      cleanup();
      listeners.clear();
      language = 'en';
      document.title = 'Calendar · Content Factory';
    });

    test('a language applied after the page arrived renames the tab', () => {
      render(React.createElement(PageTitleLanguage, {}));
      expect(document.title).toBe('Calendar · Content Factory');

      changeLanguage('ru');

      expect(document.title).toBe('Календарь · Content Factory');
    });

    test('a page that named no key is left as the server sent it', () => {
      const meta = document.querySelector(
        `meta[name="${metaName('PAGE_TITLE_KEY_META')}"]`
      );
      const parent = meta.parentNode;
      meta.remove();
      document.title = 'Content Factory';

      render(React.createElement(PageTitleLanguage, {}));
      changeLanguage('ru');

      expect(document.title).toBe('Content Factory');
      parent.appendChild(meta);
    });

    test('the listener leaves with the component', () => {
      const { unmount } = render(React.createElement(PageTitleLanguage, {}));
      expect(listeners.size).toBe(1);
      unmount();
      expect(listeners.size).toBe(0);
    });
  });
});
