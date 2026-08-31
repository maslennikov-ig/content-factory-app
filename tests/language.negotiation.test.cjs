const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { AsyncLocalStorage } = require('node:async_hooks');
const acceptLanguage = require('accept-language');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function('require', 'module', 'exports', outputText)(
    localRequire,
    loaded,
    loaded.exports
  );
  return loaded.exports;
}

const i18nConfig = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/translation/i18n.config.ts'
);

/**
 * One request at a time, the way Next serves them: `cookies()` and `headers()`
 * read the store of the request they are called inside, never a module-level
 * one.
 */
const requestStore = new AsyncLocalStorage();

/**
 * The delay is what makes the leak test mean anything: the two requests
 * overlap, so a resolver that parked the language on the shared i18next
 * instance would hand the second request's language to the first one.
 */
const runAsRequest = (request, work) =>
  requestStore.run(request, () => work());

const nextHeadersMock = {
  cookies: async () => {
    const { cookie = {}, delay = 0 } = requestStore.getStore() || {};
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    return { get: (name) => (name in cookie ? { value: cookie[name] } : undefined) };
  },
  headers: async () => {
    const { headers = {} } = requestStore.getStore() || {};
    return { get: (name) => headers[name.toLowerCase()] ?? null };
  },
};

/**
 * Stands in for the shared server i18next instance and records any attempt to
 * switch its language, which is the mutation that leaks between requests.
 */
function i18nextStub() {
  return {
    language: 'en',
    changeLanguageCalls: [],
    hasLoadedNamespace: () => true,
    loadNamespaces: async () => undefined,
    changeLanguage(language) {
      this.changeLanguageCalls.push(language);
      this.language = language;
    },
    getFixedT(language) {
      const fixed = language || this.language;
      return (key) => `${fixed}:${key}`;
    },
  };
}

function loadBackendTranslation(i18next) {
  return loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/get.translation.service.backend.ts',
    {
      'next/headers': nextHeadersMock,
      './i18next': { __esModule: true, default: i18next },
      './i18n.config': i18nConfig,
    }
  );
}

function loadProxy() {
  const responses = [];
  const NextResponse = {
    next: ({ request }) => {
      const response = {
        type: 'next',
        requestHeaders: request.headers,
        headers: new Headers(),
        cookies: {
          jar: new Map(),
          set(name, value, options) {
            this.jar.set(name, { value, options });
          },
        },
      };
      responses.push(response);
      return response;
    },
    redirect: (url) => ({
      type: 'redirect',
      url: String(url),
      cookies: { set: () => undefined },
    }),
  };

  const { proxy } = loadTypeScriptModule('apps/frontend/src/proxy.ts', {
    'next/server': { NextResponse },
    '@contentfactory/helpers/subdomain/subdomain.management': {
      getCookieUrlFromDomain: () => 'localhost',
    },
    '@contentfactory/helpers/utils/internal.fetch': {
      internalFetch: async () => ({ json: async () => ({}) }),
    },
    '@contentfactory/react/translation/i18n.config': i18nConfig,
  });
  return { proxy, responses };
}

/** A signed-in visitor on an ordinary page, so the proxy falls through. */
const browserRequest = ({ acceptLanguage: accept, cookie }) => {
  const nextUrl = new URL('http://localhost:4200/launches');
  return {
    nextUrl,
    cookies: {
      get: (name) =>
        name === 'auth'
          ? { value: 'token' }
          : cookie
          ? { value: cookie }
          : undefined,
    },
    headers: new Headers(accept ? { 'accept-language': accept } : {}),
  };
};

describe('server language negotiation', () => {
  test('keeps internal locale ids while presenting valid BCP-47 tags to Accept-Language', () => {
    const { languageTags, languageFromBcp47 } = i18nConfig;

    expect(languageTags).toContain('ka-GE');
    expect(languageTags).not.toContain('ka_ge');
    expect(() => acceptLanguage.languages(languageTags)).not.toThrow();
    expect(acceptLanguage.get('ka-GE,ka;q=0.9,en;q=0.8')).toBe('ka-GE');
    expect(languageFromBcp47('ka-GE')).toBe('ka_ge');
  });

  test('serves a first-time visitor the language the browser asked for', async () => {
    const { resolveRequestLanguage } = loadBackendTranslation(i18nextStub());

    const language = await runAsRequest(
      { headers: { [i18nConfig.headerName]: 'ru' } },
      resolveRequestLanguage
    );

    expect(language).toBe('ru');
  });

  test('lets an explicit cookie choice outrank the browser guess', async () => {
    const { resolveRequestLanguage } = loadBackendTranslation(i18nextStub());

    const language = await runAsRequest(
      {
        cookie: { [i18nConfig.cookieName]: 'he' },
        headers: { [i18nConfig.headerName]: 'ru' },
      },
      resolveRequestLanguage
    );

    expect(language).toBe('he');
  });

  test.each([
    ['no cookie and no header', {}],
    ['an unshipped language', { headers: { 'x-i18next-current-language': 'nl' } }],
    ['a junk cookie', { cookie: { i18next: '../../etc/passwd' } }],
  ])('falls back to English on %s', async (_name, request) => {
    const { resolveRequestLanguage } = loadBackendTranslation(i18nextStub());

    await expect(runAsRequest(request, resolveRequestLanguage)).resolves.toBe(
      'en'
    );
  });

  test('gives two overlapping requests their own language', async () => {
    // The server i18next instance is a module-level singleton. This is the
    // property `tests/foundation.test.cjs` used to approximate by grepping for
    // `changeLanguage`; here the two requests actually overlap.
    const i18next = i18nextStub();
    const { getT } = loadBackendTranslation(i18next);

    const [slowRussian, fastEnglish] = await Promise.all([
      runAsRequest(
        { cookie: { [i18nConfig.cookieName]: 'ru' }, delay: 25 },
        () => getT()
      ),
      runAsRequest({ cookie: { [i18nConfig.cookieName]: 'en' } }, () => getT()),
    ]);

    expect(slowRussian('sources')).toBe('ru:sources');
    expect(fastEnglish('sources')).toBe('en:sources');
    expect(i18next.changeLanguageCalls).toEqual([]);
    expect(i18next.language).toBe('en');
  });
});

describe('proxy language negotiation', () => {
  test('hands the negotiated language to the render and to the browser', async () => {
    const { proxy } = loadProxy();

    const response = await proxy(
      browserRequest({ acceptLanguage: 'ru-RU,ru;q=0.9,en;q=0.8' })
    );

    expect(response.requestHeaders.get(i18nConfig.headerName)).toBe('ru');
    // A plain response header named `i18next` is not a cookie: the browser
    // detector never sees it, so the second request negotiates from scratch
    // and hydration disagrees with the server render.
    const cookie = response.cookies.jar.get(i18nConfig.cookieName);
    expect(cookie?.value).toBe('ru');
    expect(cookie?.options).toMatchObject({ path: '/' });
  });

  test('maps a regional tag onto the locale id the bundles use', async () => {
    const { proxy } = loadProxy();

    const response = await proxy(
      browserRequest({ acceptLanguage: 'ka-GE,ka;q=0.9' })
    );

    expect(response.requestHeaders.get(i18nConfig.headerName)).toBe('ka_ge');
    expect(response.cookies.jar.get(i18nConfig.cookieName)?.value).toBe('ka_ge');
  });

  test('never overwrites a language the visitor chose', async () => {
    const { proxy } = loadProxy();

    const response = await proxy(
      browserRequest({ acceptLanguage: 'ru-RU,ru;q=0.9', cookie: 'he' })
    );

    expect(response.requestHeaders.get(i18nConfig.headerName)).toBe('he');
    expect(response.cookies.jar.size).toBe(0);
  });

  test('leaves no cookie behind when the browser asks for nothing we ship', async () => {
    const { proxy } = loadProxy();

    const response = await proxy(browserRequest({ acceptLanguage: 'nl-NL' }));

    expect(response.requestHeaders.get(i18nConfig.headerName)).toBe('en');
    expect(response.cookies.jar.size).toBe(0);
  });
});
