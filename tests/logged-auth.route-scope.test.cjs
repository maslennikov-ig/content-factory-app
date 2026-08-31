const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

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

function loadProxy() {
  const NextResponse = {
    next: ({ request }) => ({
      type: 'next',
      requestHeaders: request.headers,
      cookies: { set: () => undefined },
    }),
    redirect: (url) => ({
      type: 'redirect',
      url: String(url),
      cookies: { set: () => undefined },
    }),
  };

  return loadTypeScriptModule('apps/frontend/src/proxy.ts', {
    'next/server': { NextResponse },
    '@contentfactory/helpers/subdomain/subdomain.management': {
      getCookieUrlFromDomain: () => 'localhost',
    },
    '@contentfactory/helpers/utils/internal.fetch': {
      internalFetch: async () => ({ json: async () => ({}) }),
    },
    '@contentfactory/react/translation/i18n.config': {
      cookieName: 'i18next',
      headerName: 'x-i18next-current-language',
      languageFromBcp47: () => 'en',
      languageTags: ['en'],
      languages: ['en'],
    },
  }).proxy;
}

const requestFor = (pathname) => ({
  nextUrl: new URL(`http://localhost:4200${pathname}?loggedAuth=query-token`),
  cookies: { get: () => undefined },
  headers: new Headers(),
});

describe('loggedAuth route scope', () => {
  test.each([
    ['/analytics', 'redirect'],
    ['/provider/tiktok', 'next'],
  ])(
    'proxy treats a query token on %s as %s',
    async (pathname, responseType) => {
      // Removing the provider-route guard would make the ordinary route
      // authenticated, bypassing this redirect.
      const proxy = loadProxy();

      const response = await proxy(requestFor(pathname));

      expect(response.type).toBe(responseType);
    }
  );

  test.each([
    ['/analytics', null],
    ['/provider/tiktok', 'query-token'],
  ])(
    'fetch sends the query token from %s only when expected',
    async (pathname, expectedAuth) => {
      // Reading loggedAuth without checking this pathname would leak it into
      // every API request and make this ordinary-route case fail.
      const originalWindow = global.window;
      const originalDocument = global.document;
      const originalFetch = global.fetch;
      let request;

      global.window = {
        location: { href: `http://localhost:4200${pathname}?loggedAuth=query-token` },
      };
      global.document = { cookie: '' };
      global.fetch = async (_url, options) => {
        request = options;
        return new Response(null, { status: 204 });
      };

      try {
        const { customFetch } = loadTypeScriptModule(
          'libraries/helpers/src/utils/custom.fetch.func.ts'
        );

        await customFetch({ baseUrl: 'http://backend.example' })('/me');

        expect(new Headers(request.headers).get('auth')).toBe(expectedAuth);
      } finally {
        global.window = originalWindow;
        global.document = originalDocument;
        global.fetch = originalFetch;
      }
    }
  );
});
