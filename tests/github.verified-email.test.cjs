const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadGithubProvider() {
  const filename = path.join(
    root,
    'apps/backend/src/services/auth/providers/github.provider.ts'
  );
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) => {
    if (request.endsWith('/providers.interface')) {
      return {
        AuthProvider: () => (target) => target,
        AuthProviderAbstract: class {},
      };
    }
    // The provider binds its OAuth callback to the browser that started it,
    // through a Redis-backed state store. Only `getUser` is under test here, so
    // the store is stubbed rather than reached.
    if (request.endsWith('/providers/oauth.state')) {
      return {
        issueOAuthState: async () => 'issued-state',
        consumeOAuthState: async () => 'https://app.example.test/callback',
      };
    }
    return require(request);
  };
  new Function('exports', 'require', 'module', compiled)(
    loaded.exports,
    localRequire,
    loaded
  );
  return loaded.exports.GithubProvider;
}

describe('GitHub verified email selection', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('prefers a verified primary email over unverified and verified fallback entries', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ id: 123 }) })
      .mockResolvedValueOnce({
        json: async () => [
          { email: 'unverified@example.com', verified: false, primary: true },
          { email: 'fallback@example.com', verified: true, primary: false },
          { email: 'primary@example.com', verified: true, primary: true },
        ],
      });

    await expect(new (loadGithubProvider())().getUser('token')).resolves.toEqual({
      email: 'primary@example.com',
      id: '123',
    });
  });

  test('uses a verified fallback and refuses an account with no verified email', async () => {
    const Provider = loadGithubProvider();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ id: 123 }) })
      .mockResolvedValueOnce({
        json: async () => [
          { email: 'unverified@example.com', verified: false, primary: true },
          { email: 'fallback@example.com', verified: true, primary: false },
        ],
      });
    await expect(new Provider().getUser('token')).resolves.toMatchObject({
      email: 'fallback@example.com',
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ id: 456 }) })
      .mockResolvedValueOnce({
        json: async () => [
          { email: 'unverified@example.com', verified: false, primary: true },
        ],
      });
    await expect(new Provider().getUser('token')).rejects.toThrow(
      'GitHub returned no verified email'
    );
  });
});
