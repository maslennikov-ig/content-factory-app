'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const env = {
  NODE_ENV: 'development',
  FRONTEND_URL: 'http://localhost:4278',
  BACKEND_INTERNAL_URL: 'http://localhost:3478',
  DATABASE_URL: 'postgresql://cf-dev:synthetic@127.0.0.1:5433/local-preview',
  CF_LOCAL_AUTH_TOKEN: 'synthetic-local-session',
};
const response = (type, url) => ({
  type, url: String(url), cookieWrites: [],
  cookies: { set(...args) { this.writes.push(args); }, writes: [] },
});
const makeResponse = (type, url) => {
  const result = response(type, url);
  result.cookieWrites = result.cookies.writes;
  return result;
};
const mocks = {
  'next/server': { NextResponse: {
    next: () => makeResponse('next'),
    redirect: url => makeResponse('redirect', url),
  } },
  '@contentfactory/helpers/subdomain/subdomain.management': { getCookieUrlFromDomain: () => undefined },
  '@contentfactory/react/translation/i18n.config': {
    cookieName: 'i18next', headerName: 'x-language',
    languageFromBcp47: () => 'ru', languageTags: ['ru'], languages: ['ru'],
  },
};
const { proxy } = loadTypeScriptModule('apps/frontend/src/proxy.ts', mocks);
const request = (pathname, cookies = {}, origin = env.FRONTEND_URL) => ({
  method: 'GET', nextUrl: new URL(pathname, origin), headers: new Headers(),
  cookies: { get: name => cookies[name] === undefined ? undefined : { value: cookies[name] } },
});

describe('automatic sign-in for the selected local preview profile', () => {
  beforeEach(() => {
    jest.replaceProperty(process, 'env', { ...process.env, ...env });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
  });
  afterEach(() => jest.restoreAllMocks());

  test.each(['/', '/auth', '/auth/login'])('%s opens chats without a login form', async path => {
    const result = await proxy(request(path));
    expect(new URL(result.url).pathname).toBe('/agents');
    expect(result.cookieWrites).toContainEqual(['auth', env.CF_LOCAL_AUTH_TOKEN, {
      path: '/', httpOnly: false, sameSite: 'lax', secure: false,
    }]);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3478/user/self', expect.objectContaining({
      headers: { auth: env.CF_LOCAL_AUTH_TOKEN }, redirect: 'manual', cache: 'no-store',
    }));
  });

  test('a saved-chat deep link is retained and stale workspace overrides are cleared', async () => {
    const r = request('/agents/assistant?thread=saved', { showorg: 'previous-user-org', impersonate: 'previous-user' });
    const result = await proxy(r);
    expect(result.url).toBe(r.nextUrl.href);
    expect(result.cookieWrites).toContainEqual(['showorg', '', { path: '/', maxAge: 0 }]);
    expect(result.cookieWrites).toContainEqual(['impersonate', '', { path: '/', maxAge: 0 }]);
  });

  test.each([
    { NODE_ENV: 'production' }, { NODE_ENV: 'test' },
    { CF_LOCAL_AUTO_LOGIN: 'false' }, { CF_LOCAL_AUTH_TOKEN: '' },
    { FRONTEND_URL: 'https://factory.example' },
    { BACKEND_INTERNAL_URL: 'https://api.example' },
    { BACKEND_INTERNAL_URL: 'http://localhost.attacker.example' },
    { DATABASE_URL: 'postgresql://user:synthetic@database.example/product' },
    { DATABASE_URL: '' },
  ])('does not sign in or send the token under %j', async change => {
    Object.assign(process.env, change);
    const result = await proxy(request('/auth'));
    expect(result.type).toBe('next');
    expect(result.cookieWrites.some(([name]) => name === 'auth')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('a public request host never receives the local token', async () => {
    const result = await proxy(request('/auth', {}, 'https://factory.example'));
    expect(result.type).toBe('next');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('an existing signed-in profile is retained', async () => {
    const result = await proxy(request('/agents', { auth: 'another-profile' }));
    expect(result.type).toBe('next');
    expect(result.cookieWrites.some(([name]) => name === 'auth')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('the local entry refreshes its own cookie for the local HTTP client', async () => {
    const result = await proxy(request('/auth', { auth: env.CF_LOCAL_AUTH_TOKEN }));
    expect(new URL(result.url).pathname).toBe('/agents');
    expect(result.cookieWrites).toContainEqual(['auth', env.CF_LOCAL_AUTH_TOKEN, {
      path: '/', httpOnly: false, sameSite: 'lax', secure: false,
    }]);
  });

  test('the local entry never replaces another signed-in profile', async () => {
    const result = await proxy(request('/auth', { auth: 'another-profile' }));
    expect(result.cookieWrites.some(([name]) => name === 'auth')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each(['refusal', 'network failure'])('ordinary sign-in remains available after %s', async mode => {
    if (mode === 'refusal') fetch.mockResolvedValue({ ok: false, status: 401 });
    else fetch.mockRejectedValue(new Error('unavailable'));
    const result = await proxy(request('/auth'));
    expect(result.type).toBe('next');
    expect(result.cookieWrites.some(([name]) => name === 'auth')).toBe(false);
  });

  test('explicit logout pauses automatic sign-in for this browser session', async () => {
    const result = await proxy(request('/auth/logout', { auth: 'signed-in' }));
    expect(result.cookieWrites).toContainEqual(['cf-local-login-paused', '1', {
      path: '/', httpOnly: true, sameSite: 'lax',
    }]);
    const login = await proxy(request('/auth/login', { 'cf-local-login-paused': '1' }));
    expect(login.type).toBe('next');
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each(['/auth/forgot', '/auth/pending', '/auth?provider=TELEGRAM&code=synthetic'])('%s keeps its ordinary auth flow', async path => {
    expect((await proxy(request(path))).type).toBe('next');
    expect(fetch).not.toHaveBeenCalled();
  });
});
