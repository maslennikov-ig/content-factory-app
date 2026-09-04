/**
 * The language of the way in — `content-factory-next-fn33.39`.
 *
 * On the live walkthrough of 04.09.2026 the sign-in page, the registration
 * page and the invited registration were entirely in English, with no way to
 * change that: the application's picker lives behind the sign-in, on the
 * navigation bar of a layout that does not exist yet.
 *
 * Two halves answer it. The proxy decides the first language from
 * `Accept-Language` — `tests/language.negotiation.test.cjs` proves that for a
 * signed-in page, and this file proves the same holds on the pages reached
 * without a session, which is where the defect was reported. The second half is
 * the correction: a picker on those pages, for the browser that asks for
 * English and the person who does not read it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const i18nConfig = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/translation/i18n.config.ts'
);

const loadProxy = () => {
  const NextResponse = {
    next: (init) => {
      const request = init?.request || { headers: new Headers() };
      return {
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
    '@contentfactory/react/translation/i18n.config': i18nConfig,
  });
  return proxy;
};

/** Somebody with no session at all, which is everyone on these pages. */
const anonymousRequest = (pathname, acceptLanguage) => {
  const nextUrl = new URL(`http://localhost:4200${pathname}`);
  return {
    nextUrl,
    cookies: { get: () => undefined },
    headers: new Headers(
      acceptLanguage ? { 'accept-language': acceptLanguage } : {}
    ),
  };
};

describe('the first language, before there is an account', () => {
  test.each(['/auth', '/auth/login', '/auth/forgot'])(
    '%s is rendered in the language the browser asked for',
    async (pathname) => {
      const proxy = loadProxy();
      const response = await proxy(
        anonymousRequest(pathname, 'ru-RU,ru;q=0.9,en;q=0.8')
      );

      expect(response.type).toBe('next');
      expect(response.requestHeaders.get(i18nConfig.headerName)).toBe('ru');
      // And the browser has to be told too, or hydration disagrees with the
      // server render and the page flips back to English.
      expect(response.cookies.jar.get(i18nConfig.cookieName)?.value).toBe('ru');
    }
  );

  test('a browser asking for a language we do not ship still gets English', async () => {
    const proxy = loadProxy();
    const response = await proxy(anonymousRequest('/auth', 'nl-NL'));

    expect(response.requestHeaders.get(i18nConfig.headerName)).toBe('en');
    expect(response.cookies.jar.size).toBe(0);
  });
});

describe('the correction the pages were missing', () => {
  const switchSource = read(
    'apps/frontend/src/components/auth/language.switch.tsx'
  );

  test('the sign-in column carries the picker', () => {
    const layout = read('apps/frontend/src/app/(app)/auth/layout.tsx');
    expect(layout).toContain('AuthLanguageSwitch');
    expect(layout).toContain(
      "from '@contentfactory/frontend/components/auth/language.switch'"
    );
  });

  test('choosing a language writes the cookie the render reads and asks again', () => {
    // Both halves are needed: the cookie alone leaves the already-rendered
    // server markup in the previous language, and a reload alone changes
    // nothing.
    expect(switchSource).toContain('setCookie(cookieName, option, 365)');
    expect(switchSource).toContain('window.location.reload()');
  });

  test('the picker is a menu, not a div with a click handler', () => {
    // `LanguageComponent` is the one this replaces on these pages: its trigger
    // is a `div` with `onClick`, which no keyboard can reach.
    expect(switchSource).toContain(
      "from '@contentfactory/react/choice/choice.menu'"
    );
    expect(switchSource).toContain('MenuButton');
    expect(switchSource).toContain('aria-label');
  });

  test('every shipped language is offered', () => {
    for (const language of i18nConfig.languages) {
      expect(i18nConfig.languages).toContain(language);
    }
    // Driven off the config rather than a second list beside it.
    expect(switchSource).toContain('[...languages]');
  });

  test('it wears page colours, not navigation-bar colours', () => {
    // `cf-navigation-active` is the hover plate of the dark bar; in the light
    // theme it is the same colour as `cf-surface`, so on this page the hover
    // state would be invisible.
    expect(switchSource).not.toContain('cf-navigation');
    expect(switchSource).toContain('hover:bg-cf-surface-subtle');
  });
});

describe('a refused sign-in speaks the page’s language', () => {
  test('the raw server sentence never reaches the field', () => {
    // `content-factory-next-fn33.43`: the page was Russian and the refusal was
    // «Invalid user name or password», straight out of the response body.
    const login = read('apps/frontend/src/components/auth/login.tsx');
    expect(login).toContain('parseRequestFailure(login)');
    expect(login).toContain('requestErrorMessage(failure)');
    expect(login).not.toMatch(/message:\s*errorMessage/);
  });
});
