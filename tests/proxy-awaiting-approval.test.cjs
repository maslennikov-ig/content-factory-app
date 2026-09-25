'use strict';

/**
 * `content-factory-next-2q28.16` (S0 item 11, stand check D2). A blogger
 * whose account waits for approval opened `/onboarding` and was sent to
 * `/auth` — the sign-up form, with nothing saying she had already registered.
 * The browser now remembers the «awaiting approval» answer in a marker cookie,
 * and the proxy sends such a visitor to the waiting screen instead.
 *
 * The marker is not a credential: it never lets a request through, it only
 * picks which public auth page an unauthenticated visitor sees.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const PROXY = 'apps/frontend/src/proxy.ts';
const MARKER = 'apps/frontend/src/components/auth/approval-marker.ts';

function loadProxy() {
  const response = (type, url) => {
    const cookieWrites = [];
    return {
      type,
      ...(url ? { url: String(url) } : {}),
      cookieWrites,
      cookies: { set: (...args) => cookieWrites.push(args) },
    };
  };
  return loadTypeScriptModule(PROXY, {
    'next/server': {
      NextResponse: {
        next: () => response('next'),
        redirect: (url) => response('redirect', url),
      },
    },
    '@contentfactory/helpers/subdomain/subdomain.management': {
      getCookieUrlFromDomain: () => 'localhost',
    },
    '@contentfactory/react/translation/i18n.config': {
      cookieName: 'i18next',
      headerName: 'x-i18next-current-language',
      languageFromBcp47: () => 'en',
      languageTags: ['en'],
      languages: ['en'],
    },
  });
}

const MARKER_NAME = 'cf-awaiting-approval';

const requestFor = (pathname, cookies = {}) => ({
  nextUrl: new URL(`http://localhost:4200${pathname}`),
  cookies: {
    get: (name) =>
      cookies[name] !== undefined ? { value: cookies[name] } : undefined,
  },
  headers: new Headers(),
});

const markerCleared = (result) =>
  result.cookieWrites.some(
    ([name, value, options]) =>
      name === MARKER_NAME && value === '' && options.maxAge < 0
  );

describe('a visitor whose account awaits approval', () => {
  const { proxy, AWAITING_APPROVAL_COOKIE } = loadProxy();

  test('the proxy and the browser module name the same cookie', () => {
    const marker = loadTypeScriptModule(MARKER);
    expect(AWAITING_APPROVAL_COOKIE).toBe(MARKER_NAME);
    expect(marker.AWAITING_APPROVAL_COOKIE).toBe(MARKER_NAME);
  });

  test('opening an app address shows the waiting screen, not the sign-up form', async () => {
    for (const path of ['/onboarding', '/launches', '/content?tab=avatars']) {
      const result = await proxy(requestFor(path, { [MARKER_NAME]: '1' }));
      expect(result.type).toBe('redirect');
      expect(new URL(result.url).pathname).toBe('/auth/pending');
    }
  });

  test('the auth pages themselves stay reachable, so she can still sign in', async () => {
    for (const path of ['/auth', '/auth/login', '/auth/pending']) {
      const result = await proxy(requestFor(path, { [MARKER_NAME]: '1' }));
      expect(result.type).toBe('next');
    }
  });

  test('without the marker an anonymous visitor still goes to /auth', async () => {
    const result = await proxy(requestFor('/onboarding'));
    expect(result.type).toBe('redirect');
    expect(new URL(result.url).pathname).toBe('/auth');
  });

  test('the marker never lets a request through without a session', async () => {
    const result = await proxy(requestFor('/onboarding', { [MARKER_NAME]: '1' }));
    expect(result.type).not.toBe('next');
  });

  test('a session clears the marker and is not redirected by it', async () => {
    const result = await proxy(
      requestFor('/onboarding', { auth: 'signed-token', [MARKER_NAME]: '1' })
    );
    expect(result.type).toBe('next');
    expect(markerCleared(result)).toBe(true);
  });
});
