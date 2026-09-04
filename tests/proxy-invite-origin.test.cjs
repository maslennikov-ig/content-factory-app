/**
 * The origin the invitation flow hands to the browser.
 *
 * Behind the production reverse proxy the container sees its own address:
 * `nextUrl.href` is `http://localhost:4200/...` while the visitor is on
 * `https://factory.aidevteam.ru`. Next normalizes a `Location` back to a
 * relative path, so a redirect survives that difference — but a URL travelling
 * as a *value* does not. On 04.09.2026 every invited person without a session
 * was sent to `/auth?returnUrl=http%3A%2F%2Flocalhost%3A4200%2Fjoin-org...`,
 * stored that address in `localStorage`, and after signing in landed on
 * localhost. Nothing reproduced locally, where `FRONTEND_URL` happens to be
 * the same `localhost:4200`.
 *
 * So the request here is deliberately built the way production sends it — host
 * `localhost:4200`, `FRONTEND_URL` a different public origin — and every URL
 * that leaves in a value has to carry the public one.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const proxyFile = path.join(repositoryRoot, 'apps/frontend/src/proxy.ts');

function loadProxy() {
  const compiled = ts.transpileModule(fs.readFileSync(proxyFile, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const NextResponse = {
    next: ({ request }) => {
      const cookieWrites = [];
      return {
        type: 'next',
        requestHeaders: request.headers,
        cookieWrites,
        cookies: { set: (...args) => cookieWrites.push(args) },
      };
    },
    redirect: (url) => {
      const cookieWrites = [];
      return {
        type: 'redirect',
        url: String(url),
        cookieWrites,
        cookies: { set: (...args) => cookieWrites.push(args) },
      };
    },
  };
  const mocks = {
    'next/server': { NextResponse },
    '@contentfactory/helpers/subdomain/subdomain.management': {
      getCookieUrlFromDomain: () => 'example.test',
    },
    '@contentfactory/react/translation/i18n.config': {
      cookieName: 'i18next',
      headerName: 'x-i18next-current-language',
      languageFromBcp47: () => 'en',
      languageTags: ['en'],
      languages: ['en'],
    },
  };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (request) => mocks[request] ?? require(request),
    loaded,
    loaded.exports
  );
  return loaded.exports;
}

// The internal address the container sees, which is what makes this a
// regression test rather than a restatement of the code.
const INTERNAL_ORIGIN = 'http://localhost:4200';
const PUBLIC_ORIGIN = 'https://example.test';

const requestFor = (pathname, { authenticated = false, pendingInvite } = {}) => ({
  nextUrl: new URL(`${INTERNAL_ORIGIN}${pathname}`),
  cookies: {
    get: (name) => {
      if (authenticated && name === 'auth') return { value: 'signed-token' };
      if (pendingInvite && name === 'pending-team-invitation') {
        return { value: pendingInvite };
      }
      return undefined;
    },
  },
  headers: new Headers({ host: 'localhost:4200' }),
});

const inviteToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImludjEyIiwib3JnSWQiOiJvcmcifQ.c2lnbmF0dXJlLXZhbHVl';

const returnUrlOf = (result) =>
  new URL(result.url).searchParams.get('returnUrl');

const originalFrontendUrl = process.env.FRONTEND_URL;

beforeEach(() => {
  process.env.FRONTEND_URL = PUBLIC_ORIGIN;
});

afterAll(() => {
  if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = originalFrontendUrl;
});

describe('invitation routing behind a reverse proxy', () => {
  test('sends the invited visitor back to the public origin, not the container', async () => {
    const { proxy } = loadProxy();

    for (const entry of [
      `/join-org?org=${inviteToken}`,
      `/?org=${inviteToken}`,
      `/auth?org=${inviteToken}`,
    ]) {
      const result = await proxy(requestFor(entry));
      expect(result.type).toBe('redirect');

      const returnUrl = returnUrlOf(result);
      expect(returnUrl).toEqual(expect.any(String));
      // The whole defect in one assertion: the value, not the Location.
      expect(returnUrl.startsWith(`${PUBLIC_ORIGIN}/`)).toBe(true);
      expect(returnUrl).not.toContain('localhost:4200');
      expect(new URL(returnUrl).pathname).toBe('/join-org');
      expect(new URL(returnUrl).searchParams.get('org')).toBe(inviteToken);
    }
  });

  test('carries the invitation from a signed-in visitor to the public confirmation page', async () => {
    const { proxy } = loadProxy();
    const result = await proxy(
      requestFor('/auth/login', { authenticated: true, pendingInvite: inviteToken })
    );

    expect(result.type).toBe('redirect');
    expect(result.url.startsWith(`${PUBLIC_ORIGIN}/join-org?org=`)).toBe(true);
  });

  test('keeps working when FRONTEND_URL is absent, using the request origin', async () => {
    delete process.env.FRONTEND_URL;
    const { proxy } = loadProxy();
    const result = await proxy(requestFor(`/join-org?org=${inviteToken}`));

    expect(returnUrlOf(result).startsWith(`${INTERNAL_ORIGIN}/join-org`)).toBe(
      true
    );
  });

  test('holds the pending invitation cookie for as long as the invitation itself', async () => {
    const { proxy } = loadProxy();
    // The server-side constant, read from its own file: the proxy cannot
    // import it (that module pulls in Redis and the JWT service), so the two
    // numbers are held equal here instead of by the type system.
    const source = fs.readFileSync(
      path.join(
        repositoryRoot,
        'libraries/nestjs-libraries/src/auth/team-invitation.ts'
      ),
      'utf8'
    );
    const declaration = source.match(
      /TEAM_INVITATION_TTL_SECONDS\s*=\s*([^;]+);/
    );
    expect(declaration).not.toBeNull();
    // eslint-disable-next-line no-eval
    const invitationTtlSeconds = eval(declaration[1]);
    expect(invitationTtlSeconds).toBe(2 * 24 * 60 * 60);

    for (const entry of [
      `/join-org?org=${inviteToken}`,
      `/?org=${inviteToken}`,
    ]) {
      const result = await proxy(requestFor(entry));
      const write = result.cookieWrites.find(
        ([name]) => name === 'pending-team-invitation'
      );
      expect(write).toBeDefined();
      expect(write[1]).toBe(inviteToken);
      // A cookie shorter than the invitation loses the invitation for anyone
      // whose registration waits on an administrator's approval.
      expect(write[2].maxAge).toBe(invitationTtlSeconds);
    }
  });
});

describe('what the invitation routing must leave alone', () => {
  test('signing out still signs out while an invitation is pending', async () => {
    const { proxy } = loadProxy();
    const result = await proxy(
      requestFor('/auth/logout', { authenticated: true, pendingInvite: inviteToken })
    );

    expect(result.type).toBe('redirect');
    expect(new URL(result.url).pathname).toBe('/auth/login');
    const authWrite = result.cookieWrites.find(([name]) => name === 'auth');
    expect(authWrite).toBeDefined();
    expect(authWrite[1]).toBe('');
  });

  test("a provider's return reaches the /auth page for a signed-in person too", async () => {
    // Since fn33.14 connecting Telegram in Settings comes back to the sign-in
    // address with a one-time code; bouncing a signed-in visitor to `/` drops it.
    const { proxy } = loadProxy();
    const result = await proxy(
      requestFor('/auth?provider=TELEGRAM&code=abc&state=xyz', {
        authenticated: true,
      })
    );

    expect(result.type).toBe('next');
  });

  test('a signed-in visitor on the plain sign-in page is still sent home', async () => {
    const { proxy } = loadProxy();
    const result = await proxy(requestFor('/auth', { authenticated: true }));
    expect(result.type).toBe('redirect');
    expect(new URL(result.url).pathname).toBe('/');
  });
});
